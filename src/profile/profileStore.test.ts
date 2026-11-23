import { describe, expect, it } from "vitest";
import {
  ASSAULT_RIG,
  EXPEDITION_BACKPACK,
  createEmptyContainer,
  placeItem,
  settleExtraction,
  type ItemInstance,
  type LoadoutState,
} from "../domain/loadout";
import {
  PROFILE_CORRUPT_BACKUP_KEY,
  PROFILE_SCHEMA_VERSION,
  PROFILE_STORAGE_KEY,
  PROFILE_TEMP_KEY,
  MARKET_SELL_RATES,
  applyExtraction,
  commitExtraction,
  createDefaultProfile,
  commitWarehouseSale,
  loadProfile,
  saveProfile,
  sellWarehouseItem,
  warehouseSaleValue,
  type StorageAdapter,
} from "./profileStore";

class MemoryStorage implements StorageAdapter {
  readonly values = new Map<string, string>();
  failReads = false;
  failWrites = false;

  getItem(key: string): string | null {
    if (this.failReads) throw new Error("read failed");
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failWrites) throw new Error("write failed");
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    if (this.failWrites) throw new Error("write failed");
    this.values.delete(key);
  }
}

function item(id: string, value: number, corruption = 0): ItemInstance {
  return {
    id,
    definitionId: id,
    name: id,
    width: 1,
    height: 1,
    tags: ["valuable"],
    value,
    corruption,
  };
}

function populatedLoadout(): LoadoutState {
  const rigPlacement = placeItem(
    createEmptyContainer(ASSAULT_RIG, "rig-1"),
    "medicine",
    { ...item("medicine", 15, 2), tags: ["medicine"] },
    0,
    0,
  );
  const backpackPlacement = placeItem(
    createEmptyContainer(EXPEDITION_BACKPACK, "bag-1"),
    "main",
    { ...item("red-cargo", 900, 30), width: 2, height: 3, tags: ["red_cargo", "valuable"] },
    0,
    0,
  );
  if (!rigPlacement.ok || !backpackPlacement.ok) throw new Error("fixture placement failed");
  return {
    weapon: {
      ...item("sword", 20),
      tags: ["weapon"],
      weaponStats: { damage: 30, attackIntervalMs: 480, critChance: 0 },
    },
    rig: rigPlacement.value,
    backpack: backpackPlacement.value,
  };
}

describe("profile persistence", () => {
  it("round-trips a versioned profile through the write-ahead key", () => {
    const storage = new MemoryStorage();
    const profile = { ...createDefaultProfile(), revision: 3 };

    expect(saveProfile(storage, profile)).toBe(true);
    expect(storage.values.has(PROFILE_TEMP_KEY)).toBe(false);
    expect(loadProfile(storage)).toEqual({ profile, status: "loaded" });
  });

  it("loads legacy warehouse items without weapon stats", () => {
    const storage = new MemoryStorage();
    const profile = { ...createDefaultProfile(), warehouse: [item("legacy", 12)] };
    storage.values.set(PROFILE_STORAGE_KEY, JSON.stringify(profile));

    const result = loadProfile(storage);

    expect(result.status).toBe("loaded");
    expect(result.profile.warehouse[0].weaponStats).toBeUndefined();
  });

  it("migrates schema version 1 profiles with starting credits", () => {
    const storage = new MemoryStorage();
    const legacy = { ...createDefaultProfile(), schemaVersion: 1, warehouse: [item("legacy", 12)] };
    delete (legacy as Partial<typeof legacy>).credits;
    storage.values.set(PROFILE_STORAGE_KEY, JSON.stringify(legacy));

    const result = loadProfile(storage);

    expect(result.status).toBe("loaded");
    expect(result.profile.schemaVersion).toBe(PROFILE_SCHEMA_VERSION);
    expect(result.profile.credits).toBe(100);
    expect(result.profile.warehouse[0].id).toBe("legacy");
  });

  it.each([
    { damage: 0, attackIntervalMs: 480, critChance: 0 },
    { damage: 30, attackIntervalMs: 0, critChance: 0 },
    { damage: 30, attackIntervalMs: 480, critChance: -0.1 },
    { damage: 30, attackIntervalMs: 480, critChance: 1.1 },
  ])("rejects invalid persisted weapon stats %#", (weaponStats) => {
    const storage = new MemoryStorage();
    const invalid = JSON.stringify({
      ...createDefaultProfile(),
      warehouse: [{ ...item("invalid-weapon", 10), tags: ["weapon"], weaponStats }],
    });
    storage.values.set(PROFILE_STORAGE_KEY, invalid);

    expect(loadProfile(storage).status).toBe("recovered");
    expect(storage.values.get(PROFILE_CORRUPT_BACKUP_KEY)).toBe(invalid);
  });

  it("recovers a valid pending write when the primary value is corrupt", () => {
    const storage = new MemoryStorage();
    const profile = { ...createDefaultProfile(), revision: 4 };
    storage.values.set(PROFILE_STORAGE_KEY, "{broken");
    storage.values.set(PROFILE_TEMP_KEY, JSON.stringify(profile));

    expect(loadProfile(storage)).toEqual({ profile, status: "recovered" });
    expect(storage.values.get(PROFILE_STORAGE_KEY)).toBe(JSON.stringify(profile));
    expect(storage.values.has(PROFILE_TEMP_KEY)).toBe(false);
  });

  it("finishes a newer pending write after a crash before the primary commit", () => {
    const storage = new MemoryStorage();
    const current = { ...createDefaultProfile(), revision: 3 };
    const pending = { ...createDefaultProfile(), revision: 4 };
    storage.values.set(PROFILE_STORAGE_KEY, JSON.stringify(current));
    storage.values.set(PROFILE_TEMP_KEY, JSON.stringify(pending));

    expect(loadProfile(storage)).toEqual({ profile: pending, status: "recovered" });
    expect(storage.values.get(PROFILE_STORAGE_KEY)).toBe(JSON.stringify(pending));
  });

  it("backs up invalid data and returns a clean recoverable profile", () => {
    const storage = new MemoryStorage();
    storage.values.set(PROFILE_STORAGE_KEY, "not-json");

    const result = loadProfile(storage);

    expect(result.status).toBe("recovered");
    expect(result.profile).toEqual(createDefaultProfile());
    expect(storage.values.get(PROFILE_CORRUPT_BACKUP_KEY)).toBe("not-json");
  });

  it("does not overwrite profiles from a newer schema", () => {
    const storage = new MemoryStorage();
    const future = JSON.stringify({ ...createDefaultProfile(), schemaVersion: 99 });
    storage.values.set(PROFILE_STORAGE_KEY, future);

    const result = commitExtraction(storage, settleExtraction(populatedLoadout(), "normal"), 100, "run-1");

    expect(result).toEqual({ ok: false, error: "unsupported_version" });
    expect(storage.values.get(PROFILE_STORAGE_KEY)).toBe(future);
  });

  it("treats missing and invalid schema versions as corrupt rather than future data", () => {
    for (const schemaVersion of [undefined, "1", -1, 0]) {
      const storage = new MemoryStorage();
      const invalid = JSON.stringify({ ...createDefaultProfile(), schemaVersion });
      storage.values.set(PROFILE_STORAGE_KEY, invalid);

      expect(loadProfile(storage).status).toBe("recovered");
      expect(storage.values.get(PROFILE_CORRUPT_BACKUP_KEY)).toBe(invalid);
    }
  });

  it("does not discard a pending write from a newer schema", () => {
    const storage = new MemoryStorage();
    const current = JSON.stringify(createDefaultProfile());
    const futurePending = JSON.stringify({ ...createDefaultProfile(), schemaVersion: 99, revision: 1 });
    storage.values.set(PROFILE_STORAGE_KEY, current);
    storage.values.set(PROFILE_TEMP_KEY, futurePending);

    expect(loadProfile(storage).status).toBe("unsupported");
    expect(storage.values.get(PROFILE_TEMP_KEY)).toBe(futurePending);
  });

  it("reports unavailable storage without throwing", () => {
    const storage = new MemoryStorage();
    storage.failReads = true;

    expect(loadProfile(storage).status).toBe("unavailable");
  });
});

describe("extraction commits", () => {
  it("stores every normally retained item and extraction totals", () => {
    const profile = applyExtraction(
      createDefaultProfile(),
      settleExtraction(populatedLoadout(), "normal"),
      100,
      "run-1",
    );

    expect(profile.warehouse.map((entry) => entry.id)).toEqual(["sword", "medicine", "red-cargo"]);
    expect(profile.totalExtractedValue).toBe(935);
    expect(profile.lastExtraction).toMatchObject({
      mode: "normal",
      retainedValue: 935,
      droppedValue: 0,
      retainedContainerIds: ["rig-1", "bag-1"],
    });
  });

  it("deeply snapshots weapon stats into the warehouse", () => {
    const extraction = settleExtraction(populatedLoadout(), "normal");
    const profile = applyExtraction(createDefaultProfile(), extraction, 100, "run-stats");

    extraction.retained.weapon!.weaponStats!.damage = 99;

    expect(profile.warehouse.find((entry) => entry.id === "sword")?.weaponStats?.damage).toBe(30);
  });

  it("does not store or count free zero-value starter equipment", () => {
    const loadout = populatedLoadout();
    loadout.weapon = { ...loadout.weapon!, value: 0 };

    const profile = applyExtraction(createDefaultProfile(), settleExtraction(loadout, "normal"), 100, "run-free-kit");

    expect(profile.warehouse.map((entry) => entry.id)).toEqual(["medicine", "red-cargo"]);
    expect(profile.lastExtraction?.retainedItemIds).toEqual(["medicine", "red-cargo"]);
    expect(profile.lastExtraction?.retainedValue).toBe(915);
  });

  it("does not store the dropped backpack cargo", () => {
    const storage = new MemoryStorage();
    const result = commitExtraction(
      storage,
      settleExtraction(populatedLoadout(), "drop_pack"),
      100,
      "run-1",
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.profile.warehouse.map((entry) => entry.id)).toEqual(["sword", "medicine"]);
      expect(result.profile.lastExtraction).toMatchObject({
        mode: "drop_pack",
        retainedValue: 35,
        droppedValue: 900,
        droppedContainerIds: ["bag-1"],
      });
    }
  });

  it("commits the same extraction record at most once", () => {
    const storage = new MemoryStorage();
    const extraction = settleExtraction(populatedLoadout(), "normal");

    const first = commitExtraction(storage, extraction, 100, "run-1");
    const repeated = commitExtraction(storage, extraction, 100, "run-1");

    expect(first.ok).toBe(true);
    expect(repeated.ok).toBe(true);
    if (repeated.ok) {
      expect(repeated.profile.successfulExtractions).toBe(1);
      expect(repeated.profile.totalExtractedValue).toBe(935);
      expect(repeated.profile.processedExtractionIds).toEqual(["run-1"]);
    }
  });
});

describe("warehouse trading", () => {
  it("sells one exact warehouse instance at the fixed market rate", () => {
    const profile = {
      ...createDefaultProfile(),
      credits: 10,
      warehouse: [item("keep", 100), item("sell", 101)],
    };

    const result = sellWarehouseItem(profile, "sell");

    expect(MARKET_SELL_RATES.valuable).toBe(0.55);
    expect(warehouseSaleValue(profile.warehouse[1])).toBe(55);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payout).toBe(55);
      expect(result.profile.credits).toBe(65);
      expect(result.profile.warehouse.map((entry) => entry.id)).toEqual(["keep"]);
      expect(profile.warehouse).toHaveLength(2);
    }
  });

  it("commits a sale atomically and cannot sell the same item twice", () => {
    const storage = new MemoryStorage();
    saveProfile(storage, { ...createDefaultProfile(), warehouse: [item("sell-once", 80)] });

    const first = commitWarehouseSale(storage, "sell-once");
    const repeated = commitWarehouseSale(storage, "sell-once");

    expect(first.ok).toBe(true);
    expect(repeated).toEqual({ ok: false, error: "item_not_found" });
    expect(loadProfile(storage).profile).toMatchObject({ credits: 144, warehouse: [] });
  });

  it("uses tag priority so equipment and red cargo cannot claim the valuable rate", () => {
    expect(warehouseSaleValue({ ...item("weapon", 100), tags: ["weapon", "valuable"] })).toBe(35);
    expect(warehouseSaleValue({ ...item("medicine", 100), tags: ["medicine"] })).toBe(45);
    expect(warehouseSaleValue({ ...item("red", 100), tags: ["red_cargo", "valuable"] })).toBe(35);
  });
});

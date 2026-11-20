import { describe, expect, it } from "vitest";
import {
  ASSAULT_RIG,
  EXPEDITION_BACKPACK,
  HEAVY_RIG,
  LIGHT_BACKPACK,
  autoPlaceItem,
  containerCapacity,
  containerUsedCells,
  createEmptyContainer,
  discardStoredItem,
  equipWeaponFromContainer,
  equipWeapon,
  listContainerItems,
  moveStoredItem,
  placeItem,
  removeItem,
  rotateItemInPlace,
  rotateStoredItem,
  settleExtraction,
  unequipWeaponToBackpack,
  validateLoadout,
  type ItemInstance,
  type LoadoutState,
} from "./loadout";

function item(overrides: Partial<ItemInstance> & Pick<ItemInstance, "id">): ItemInstance {
  return {
    id: overrides.id,
    definitionId: overrides.definitionId ?? overrides.id,
    name: overrides.name ?? overrides.id,
    width: overrides.width ?? 1,
    height: overrides.height ?? 1,
    tags: overrides.tags ?? ["valuable"],
    value: overrides.value ?? 10,
    corruption: overrides.corruption ?? 0,
  };
}

function expectPlaced<T>(result: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(`Expected placement to succeed, received ${result.error}`);
  return result.value;
}

describe("independent pocket placement", () => {
  it("rejects a 2x3 red item even when the rig has enough total free cells", () => {
    const rig = createEmptyContainer(ASSAULT_RIG, "rig-1");
    const redCargo = item({ id: "red-1", width: 2, height: 3, tags: ["red_cargo", "valuable"] });

    const result = placeItem(rig, "magazine_left", redCargo, 0, 0);

    expect(result).toEqual({ ok: false, error: "item_not_accepted" });
    expect(rig.pockets.every((pocket) => pocket.placements.length === 0)).toBe(true);
  });

  it("does not let a tag-compatible item cross a pocket boundary", () => {
    const rig = createEmptyContainer(ASSAULT_RIG, "rig-1");
    const medicine = item({ id: "medicine-1", width: 2, height: 1, tags: ["medicine"] });

    const result = placeItem(rig, "medicine", medicine, 0, 0);

    expect(result).toEqual({ ok: false, error: "item_outside_pocket" });
  });

  it("rejects overlapping items without mutating the previous state", () => {
    const backpack = createEmptyContainer(EXPEDITION_BACKPACK, "bag-1");
    const first = expectPlaced(placeItem(backpack, "main", item({ id: "first", width: 2, height: 2 }), 0, 0));

    const result = placeItem(first, "main", item({ id: "second", width: 2, height: 1 }), 1, 1);

    expect(result).toEqual({ ok: false, error: "item_overlaps" });
    expect(first.pockets[0].placements.map((placement) => placement.item.id)).toEqual(["first"]);
    expect(backpack.pockets[0].placements).toHaveLength(0);
  });

  it("rejects fractional dimensions and coordinates", () => {
    const backpack = createEmptyContainer(EXPEDITION_BACKPACK, "bag-1");

    expect(placeItem(backpack, "main", item({ id: "fractional-size", width: 1.5 }), 0, 0)).toEqual({
      ok: false,
      error: "invalid_item_size",
    });
    expect(placeItem(backpack, "main", item({ id: "fractional-position" }), 0.5, 0)).toEqual({
      ok: false,
      error: "item_outside_pocket",
    });
  });

  it("revalidates dimensions after rotation", () => {
    const rig = createEmptyContainer(ASSAULT_RIG, "rig-1");
    const horizontalMagazine = item({ id: "mag-1", width: 2, height: 1, tags: ["ammo"] });

    const unrotated = placeItem(rig, "tactical_left", horizontalMagazine, 0, 0, false);
    const rotated = placeItem(rig, "tactical_left", horizontalMagazine, 0, 0, true);

    expect(unrotated).toEqual({ ok: false, error: "item_outside_pocket" });
    expect(rotated.ok).toBe(true);
  });

  it("auto-places a 2x3 red item in a backpack but not in an assault rig", () => {
    const redCargo = item({ id: "red-1", width: 2, height: 3, tags: ["red_cargo", "valuable"] });
    const rigResult = autoPlaceItem(createEmptyContainer(ASSAULT_RIG, "rig-1"), redCargo);
    const backpackResult = autoPlaceItem(createEmptyContainer(EXPEDITION_BACKPACK, "bag-1"), redCargo);

    expect(rigResult.ok).toBe(false);
    expect(backpackResult.ok).toBe(true);
    if (backpackResult.ok) {
      expect(containerCapacity(backpackResult.value)).toBe(42);
      expect(containerUsedCells(backpackResult.value)).toBe(6);
    }
  });

  it("rejects every red cargo size from every rig by rule rather than by shape", () => {
    for (const definition of [ASSAULT_RIG, HEAVY_RIG]) {
      for (const [width, height] of [[1, 1], [2, 2], [2, 3]] as const) {
        const result = autoPlaceItem(
          createEmptyContainer(definition, `${definition.id}-${width}-${height}`),
          item({ id: `red-${definition.id}-${width}-${height}`, width, height, tags: ["red_cargo", "valuable"] }),
        );
        expect(result).toEqual({ ok: false, error: "item_not_accepted" });
      }
    }

    for (const definition of [LIGHT_BACKPACK, EXPEDITION_BACKPACK]) {
      const result = autoPlaceItem(
        createEmptyContainer(definition, `${definition.id}-red`),
        item({ id: `red-${definition.id}`, width: 2, height: 2, tags: ["red_cargo", "valuable"] }),
      );
      expect(result.ok).toBe(true);
    }
  });
});

describe("weapon slot", () => {
  it("accepts weapons and rejects ordinary valuables", () => {
    const loadout: LoadoutState = {
      rig: createEmptyContainer(ASSAULT_RIG, "rig-1"),
      backpack: createEmptyContainer(EXPEDITION_BACKPACK, "bag-1"),
    };

    const rejected = equipWeapon(loadout, item({ id: "gem", tags: ["valuable"] }));
    const accepted = equipWeapon(loadout, item({ id: "sword", width: 1, height: 3, tags: ["weapon"] }));

    expect(rejected).toEqual({ ok: false, error: "weapon_required" });
    expect(accepted.ok).toBe(true);
    if (accepted.ok) expect(accepted.value.weapon?.id).toBe("sword");
  });

  it("atomically swaps a stored weapon with the equipped weapon", () => {
    const backpack = expectPlaced(
      placeItem(
        createEmptyContainer(EXPEDITION_BACKPACK, "bag-1"),
        "main",
        item({ id: "axe", width: 2, height: 1, tags: ["weapon"] }),
        0,
        0,
      ),
    );
    const source: LoadoutState = {
      weapon: item({ id: "sword", width: 1, height: 3, tags: ["weapon"] }),
      rig: createEmptyContainer(ASSAULT_RIG, "rig-1"),
      backpack,
    };

    const result = equipWeaponFromContainer(source, "axe", "backpack");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.weapon?.id).toBe("axe");
      expect(result.value.backpack && listContainerItems(result.value.backpack).map((entry) => entry.id)).toEqual(["sword"]);
    }
    expect(source.weapon?.id).toBe("sword");
  });

  it("unequips a weapon only when the backpack can accept it", () => {
    const loadout: LoadoutState = {
      weapon: item({ id: "sword", width: 1, height: 3, tags: ["weapon"] }),
      rig: createEmptyContainer(ASSAULT_RIG, "rig-1"),
      backpack: createEmptyContainer(EXPEDITION_BACKPACK, "bag-1"),
    };

    const result = unequipWeaponToBackpack(loadout);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.weapon).toBeUndefined();
      expect(result.value.backpack && listContainerItems(result.value.backpack)[0].id).toBe("sword");
    }
  });
});

describe("cross-container transactions", () => {
  it("moves compatible medicine from backpack to rig", () => {
    const medicine = item({ id: "medicine", tags: ["medicine"] });
    const backpack = expectPlaced(
      placeItem(createEmptyContainer(EXPEDITION_BACKPACK, "bag-1"), "main", medicine, 0, 0),
    );
    const loadout: LoadoutState = {
      rig: createEmptyContainer(ASSAULT_RIG, "rig-1"),
      backpack,
    };

    const result = moveStoredItem(loadout, medicine.id, "backpack", "rig");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(listContainerItems(result.value.rig).map((entry) => entry.id)).toEqual(["medicine"]);
      expect(result.value.backpack && listContainerItems(result.value.backpack)).toEqual([]);
    }
  });

  it("leaves both containers unchanged when the target rejects the item", () => {
    const cargo = item({ id: "cargo", width: 2, height: 2, tags: ["valuable"] });
    const backpack = expectPlaced(
      placeItem(createEmptyContainer(EXPEDITION_BACKPACK, "bag-1"), "main", cargo, 0, 0),
    );
    const loadout: LoadoutState = {
      rig: createEmptyContainer(ASSAULT_RIG, "rig-1"),
      backpack,
    };

    const result = moveStoredItem(loadout, cargo.id, "backpack", "rig");

    expect(result.ok).toBe(false);
    expect(listContainerItems(loadout.rig)).toEqual([]);
    expect(listContainerItems(loadout.backpack!).map((entry) => entry.id)).toEqual(["cargo"]);
  });

  it("removes an item immutably and detects duplicate loadout IDs", () => {
    const duplicate = item({ id: "duplicate", tags: ["medicine"] });
    const rig = expectPlaced(placeItem(createEmptyContainer(ASSAULT_RIG, "rig-1"), "medicine", duplicate, 0, 0));
    const backpack = expectPlaced(
      placeItem(createEmptyContainer(EXPEDITION_BACKPACK, "bag-1"), "main", duplicate, 0, 0),
    );
    const invalid: LoadoutState = { rig, backpack };

    expect(validateLoadout(invalid)).toEqual({ ok: false, error: "duplicate_item" });
    const removed = removeItem(rig, duplicate.id);
    expect(removed.ok).toBe(true);
    expect(listContainerItems(rig)).toHaveLength(1);
    if (removed.ok) expect(listContainerItems(removed.value.container)).toHaveLength(0);
  });

  it("rotates an item in place without changing its cell origin", () => {
    const magazine = item({ id: "magazine", width: 1, height: 2, tags: ["ammo"] });
    const backpack = expectPlaced(
      placeItem(createEmptyContainer(EXPEDITION_BACKPACK, "bag-1"), "main", magazine, 2, 3),
    );
    const loadout: LoadoutState = {
      rig: createEmptyContainer(ASSAULT_RIG, "rig-1"),
      backpack,
    };

    const result = rotateStoredItem(loadout, magazine.id, "backpack");

    expect(result.ok).toBe(true);
    if (result.ok) {
      const placement = result.value.backpack?.pockets[0].placements[0];
      expect(placement).toMatchObject({ x: 2, y: 3, rotated: true });
    }
  });

  it("keeps the original placement when an in-place rotation would leave its pocket", () => {
    const magazine = item({ id: "magazine", width: 1, height: 2, tags: ["ammo"] });
    const rig = expectPlaced(placeItem(createEmptyContainer(ASSAULT_RIG, "rig-1"), "magazine_left", magazine, 0, 0, true));

    const result = rotateItemInPlace(rig, magazine.id);

    expect(result).toEqual({ ok: false, error: "item_outside_pocket" });
    expect(rig.pockets[0].placements[0]).toMatchObject({ rotated: true, x: 0, y: 0 });
  });

  it("returns a discarded item while leaving the source loadout immutable", () => {
    const cargo = item({ id: "cargo", width: 2, height: 2 });
    const backpack = expectPlaced(
      placeItem(createEmptyContainer(EXPEDITION_BACKPACK, "bag-1"), "main", cargo, 0, 0),
    );
    const loadout: LoadoutState = {
      rig: createEmptyContainer(ASSAULT_RIG, "rig-1"),
      backpack,
    };

    const result = discardStoredItem(loadout, cargo.id, "backpack");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.item.id).toBe(cargo.id);
      expect(listContainerItems(result.value.loadout.backpack!)).toEqual([]);
    }
    expect(listContainerItems(loadout.backpack!).map((entry) => entry.id)).toEqual([cargo.id]);
  });
});

describe("extraction settlement", () => {
  function populatedLoadout(): LoadoutState {
    const rigItem = item({ id: "medicine", tags: ["medicine"], corruption: 2 });
    const cargo = item({ id: "red-cargo", width: 2, height: 3, tags: ["red_cargo", "valuable"], corruption: 30 });
    const rig = expectPlaced(placeItem(createEmptyContainer(ASSAULT_RIG, "rig-1"), "medicine", rigItem, 0, 0));
    const backpack = expectPlaced(placeItem(createEmptyContainer(EXPEDITION_BACKPACK, "bag-1"), "main", cargo, 0, 0));
    return {
      weapon: item({ id: "sword", tags: ["weapon"], corruption: 0 }),
      rig,
      backpack,
    };
  }

  it("keeps weapon, rig, backpack, and all contents after normal extraction", () => {
    const result = settleExtraction(populatedLoadout(), "normal");

    expect(result.retainedItemIds).toEqual(["sword", "medicine", "red-cargo"]);
    expect(result.droppedItemIds).toEqual([]);
    expect(result.retained.backpack?.id).toBe("bag-1");
    expect(result.corruptionAfter).toBe(32);
  });

  it("keeps weapon and rig but drops the backpack and its cargo", () => {
    const source = populatedLoadout();
    const result = settleExtraction(source, "drop_pack");

    expect(result.retainedItemIds).toEqual(["sword", "medicine"]);
    expect(result.droppedItemIds).toEqual(["red-cargo"]);
    expect(result.retained.backpack).toBeUndefined();
    expect(result.droppedBackpack?.id).toBe("bag-1");
    expect(result.corruptionBefore).toBe(32);
    expect(result.corruptionAfter).toBe(2);
    expect(source.backpack?.id).toBe("bag-1");
  });

  it("returns a detached snapshot that cannot change with the source loadout", () => {
    const source = populatedLoadout();
    const result = settleExtraction(source, "drop_pack");

    (source.rig as { name: string }).name = "mutated rig";
    (source.backpack as { name: string }).name = "mutated backpack";
    (source.weapon as { name: string }).name = "mutated weapon";

    expect(result.retained.rig.name).toBe("突击胸挂");
    expect(result.droppedBackpack?.name).toBe("远征背包");
    expect(result.retained.weapon?.name).toBe("sword");
  });
});


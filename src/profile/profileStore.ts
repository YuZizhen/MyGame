import {
  listContainerItems,
  type ExtractionResult,
  type ItemInstance,
} from "../domain/loadout";

export const PROFILE_SCHEMA_VERSION = 2 as const;
export const MARKET_SELL_RATES = {
  redCargo: 0.35,
  equipment: 0.35,
  supplies: 0.45,
  valuable: 0.55,
} as const;
export const PROFILE_STORAGE_KEY = "ashen-vault.profile";
export const PROFILE_TEMP_KEY = "ashen-vault.profile.pending";
export const PROFILE_CORRUPT_BACKUP_KEY = "ashen-vault.profile.corrupt";

export interface ExtractionRecord {
  id: string;
  extractedAt: number;
  mode: ExtractionResult["mode"];
  retainedItemIds: readonly string[];
  droppedItemIds: readonly string[];
  retainedContainerIds: readonly string[];
  droppedContainerIds: readonly string[];
  retainedValue: number;
  droppedValue: number;
  corruptionBefore: number;
  corruptionAfter: number;
}

export interface PlayerProfile {
  schemaVersion: typeof PROFILE_SCHEMA_VERSION;
  revision: number;
  successfulExtractions: number;
  totalExtractedValue: number;
  credits: number;
  processedExtractionIds: readonly string[];
  warehouse: readonly ItemInstance[];
  lastExtraction?: ExtractionRecord;
}

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type ProfileLoadStatus = "new" | "loaded" | "recovered" | "unavailable" | "unsupported";

export interface ProfileLoadResult {
  profile: PlayerProfile;
  status: ProfileLoadStatus;
}

export type ProfileWriteResult =
  | { ok: true; profile: PlayerProfile; loadStatus: ProfileLoadStatus }
  | { ok: false; error: "storage_unavailable" | "unsupported_version" };

export type WarehouseSaleResult =
  | { ok: true; profile: PlayerProfile; payout: number; item: ItemInstance; loadStatus?: ProfileLoadStatus }
  | { ok: false; error: "item_not_found" | "storage_unavailable" | "unsupported_version" };

type ParseResult =
  | { ok: true; profile: PlayerProfile }
  | { ok: false; error: "invalid" | "unsupported" };

const ITEM_TAGS = new Set([
  "weapon",
  "ammo",
  "medicine",
  "tactical",
  "tool",
  "armor",
  "valuable",
  "red_cargo",
]);
const ITEM_RARITIES = new Set(["common", "magic", "rare", "red"]);
const ITEM_ICONS = new Set(["gem", "pouch", "ring", "blade", "scroll", "helm", "axe", "armor", "relic"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isWeaponStats(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.damage === "number"
    && Number.isFinite(value.damage)
    && value.damage > 0
    && typeof value.attackIntervalMs === "number"
    && Number.isFinite(value.attackIntervalMs)
    && value.attackIntervalMs > 0
    && typeof value.critChance === "number"
    && Number.isFinite(value.critChance)
    && value.critChance >= 0
    && value.critChance <= 1
  );
}

function isItem(value: unknown): value is ItemInstance {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.definitionId === "string" &&
    typeof value.name === "string" &&
    Number.isInteger(value.width) &&
    Number(value.width) > 0 &&
    Number.isInteger(value.height) &&
    Number(value.height) > 0 &&
    Array.isArray(value.tags) &&
    value.tags.every((tag) => typeof tag === "string" && ITEM_TAGS.has(tag)) &&
    isFiniteNonNegative(value.value) &&
    isFiniteNonNegative(value.corruption) &&
    (value.rarity === undefined || (typeof value.rarity === "string" && ITEM_RARITIES.has(value.rarity))) &&
    (value.icon === undefined || (typeof value.icon === "string" && ITEM_ICONS.has(value.icon))) &&
    (value.weaponStats === undefined || isWeaponStats(value.weaponStats))
  );
}

function isExtractionRecord(value: unknown): value is ExtractionRecord {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    isFiniteNonNegative(value.extractedAt) &&
    (value.mode === "normal" || value.mode === "drop_pack") &&
    isStringArray(value.retainedItemIds) &&
    isStringArray(value.droppedItemIds) &&
    isStringArray(value.retainedContainerIds) &&
    isStringArray(value.droppedContainerIds) &&
    isFiniteNonNegative(value.retainedValue) &&
    isFiniteNonNegative(value.droppedValue) &&
    isFiniteNonNegative(value.corruptionBefore) &&
    isFiniteNonNegative(value.corruptionAfter)
  );
}

export function createDefaultProfile(): PlayerProfile {
  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    revision: 0,
    successfulExtractions: 0,
    totalExtractedValue: 0,
    credits: 100,
    processedExtractionIds: [],
    warehouse: [],
  };
}

function parseProfile(raw: string): ParseResult {
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    return { ok: false, error: "invalid" };
  }
  if (!isRecord(value)) return { ok: false, error: "invalid" };
  if (
    Number.isInteger(value.schemaVersion) &&
    Number(value.schemaVersion) > PROFILE_SCHEMA_VERSION
  ) {
    return { ok: false, error: "unsupported" };
  }
  if (value.schemaVersion !== 1 && value.schemaVersion !== PROFILE_SCHEMA_VERSION) {
    return { ok: false, error: "invalid" };
  }
  const processedExtractionIds = value.processedExtractionIds ?? [];
  const credits = value.schemaVersion === 1 ? 100 : value.credits;
  if (
    !Number.isInteger(value.revision) ||
    Number(value.revision) < 0 ||
    !Number.isInteger(value.successfulExtractions) ||
    Number(value.successfulExtractions) < 0 ||
    !isFiniteNonNegative(value.totalExtractedValue) ||
    !isFiniteNonNegative(credits) ||
    !isStringArray(processedExtractionIds) ||
    !Array.isArray(value.warehouse) ||
    !value.warehouse.every(isItem) ||
    (value.lastExtraction !== undefined && !isExtractionRecord(value.lastExtraction))
  ) {
    return { ok: false, error: "invalid" };
  }
  return {
    ok: true,
    profile: {
      ...(value as unknown as PlayerProfile),
      schemaVersion: PROFILE_SCHEMA_VERSION,
      credits,
      processedExtractionIds,
    },
  };
}

export function loadProfile(storage: StorageAdapter): ProfileLoadResult {
  let currentRaw: string | null;
  let pendingRaw: string | null;
  try {
    currentRaw = storage.getItem(PROFILE_STORAGE_KEY);
    pendingRaw = storage.getItem(PROFILE_TEMP_KEY);
  } catch {
    return { profile: createDefaultProfile(), status: "unavailable" };
  }

  if (currentRaw === null && pendingRaw === null) {
    return { profile: createDefaultProfile(), status: "new" };
  }

  const current = currentRaw === null ? undefined : parseProfile(currentRaw);
  const pending = pendingRaw === null ? undefined : parseProfile(pendingRaw);
  if (current && !current.ok && current.error === "unsupported") {
    return { profile: createDefaultProfile(), status: "unsupported" };
  }
  if (pending && !pending.ok && pending.error === "unsupported") {
    return { profile: createDefaultProfile(), status: "unsupported" };
  }
  if (current?.ok) {
    if (pending?.ok && pending.profile.revision > current.profile.revision) {
      try {
        storage.setItem(PROFILE_STORAGE_KEY, pendingRaw!);
        storage.removeItem(PROFILE_TEMP_KEY);
      } catch {
        // A valid in-memory recovery is still useful when storage is read-only.
      }
      return { profile: pending.profile, status: "recovered" };
    }
    if (pendingRaw !== null) {
      try {
        storage.removeItem(PROFILE_TEMP_KEY);
      } catch {
        // A stale pending write is harmless if it cannot be removed.
      }
    }
    return { profile: current.profile, status: "loaded" };
  }

  if (pending?.ok) {
    try {
      storage.setItem(PROFILE_STORAGE_KEY, pendingRaw!);
      storage.removeItem(PROFILE_TEMP_KEY);
    } catch {
      // A valid in-memory recovery is still useful when storage is read-only.
    }
    return { profile: pending.profile, status: "recovered" };
  }
  if (currentRaw !== null) {
    try {
      storage.setItem(PROFILE_CORRUPT_BACKUP_KEY, currentRaw);
    } catch {
      // Preserve gameplay even when backup storage is unavailable.
    }
  }
  return { profile: createDefaultProfile(), status: "recovered" };
}

export function saveProfile(storage: StorageAdapter, profile: PlayerProfile): boolean {
  const serialized = JSON.stringify(profile);
  try {
    storage.setItem(PROFILE_TEMP_KEY, serialized);
    storage.setItem(PROFILE_STORAGE_KEY, serialized);
    storage.removeItem(PROFILE_TEMP_KEY);
    return true;
  } catch {
    return false;
  }
}

function cloneItem(item: ItemInstance): ItemInstance {
  return {
    ...item,
    tags: [...item.tags],
    weaponStats: item.weaponStats ? { ...item.weaponStats } : undefined,
  };
}

export function applyExtraction(
  profile: PlayerProfile,
  extraction: ExtractionResult,
  extractedAt: number,
  recordId: string,
): PlayerProfile {
  if (profile.processedExtractionIds.includes(recordId)) return profile;
  const retainedItems = [
    ...(extraction.retained.weapon ? [extraction.retained.weapon] : []),
    ...listContainerItems(extraction.retained.rig),
    ...(extraction.retained.backpack ? listContainerItems(extraction.retained.backpack) : []),
  ];
  const droppedItems = extraction.droppedBackpack
    ? listContainerItems(extraction.droppedBackpack)
    : [];
  const storableRetainedItems = retainedItems.filter((item) => item.value > 0);
  const meaningfulDroppedItems = droppedItems.filter((item) => item.value > 0);
  const warehouse = new Map(profile.warehouse.map((item) => [item.id, cloneItem(item)]));
  storableRetainedItems.forEach((item) => warehouse.set(item.id, cloneItem(item)));
  const retainedValue = storableRetainedItems.reduce((total, item) => total + item.value, 0);
  const droppedValue = meaningfulDroppedItems.reduce((total, item) => total + item.value, 0);
  const retainedContainerIds = [
    extraction.retained.rig.id,
    ...(extraction.retained.backpack ? [extraction.retained.backpack.id] : []),
  ];
  const droppedContainerIds = extraction.droppedBackpack ? [extraction.droppedBackpack.id] : [];

  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    revision: profile.revision + 1,
    successfulExtractions: profile.successfulExtractions + 1,
    totalExtractedValue: profile.totalExtractedValue + retainedValue,
    credits: profile.credits,
    processedExtractionIds: [...profile.processedExtractionIds, recordId],
    warehouse: [...warehouse.values()],
    lastExtraction: {
      id: recordId,
      extractedAt,
      mode: extraction.mode,
      retainedItemIds: storableRetainedItems.map((item) => item.id),
      droppedItemIds: meaningfulDroppedItems.map((item) => item.id),
      retainedContainerIds,
      droppedContainerIds,
      retainedValue,
      droppedValue,
      corruptionBefore: extraction.corruptionBefore,
      corruptionAfter: extraction.corruptionAfter,
    },
  };
}

export function commitExtraction(
  storage: StorageAdapter,
  extraction: ExtractionResult,
  extractedAt: number,
  recordId: string,
): ProfileWriteResult {
  const loaded = loadProfile(storage);
  if (loaded.status === "unsupported") return { ok: false, error: "unsupported_version" };
  if (loaded.status === "unavailable") return { ok: false, error: "storage_unavailable" };
  const profile = applyExtraction(loaded.profile, extraction, extractedAt, recordId);
  if (!saveProfile(storage, profile)) return { ok: false, error: "storage_unavailable" };
  return { ok: true, profile, loadStatus: loaded.status };
}

export function warehouseSaleValue(item: Pick<ItemInstance, "value" | "tags">): number {
  const rate = item.tags.includes("red_cargo")
    ? MARKET_SELL_RATES.redCargo
    : item.tags.includes("weapon") || item.tags.includes("armor")
      ? MARKET_SELL_RATES.equipment
      : item.tags.some((tag) => tag === "medicine" || tag === "ammo" || tag === "tactical" || tag === "tool")
        ? MARKET_SELL_RATES.supplies
        : MARKET_SELL_RATES.valuable;
  return item.value <= 0 ? 0 : Math.max(1, Math.floor(item.value * rate));
}

export function sellWarehouseItem(profile: PlayerProfile, itemId: string): WarehouseSaleResult {
  const item = profile.warehouse.find((candidate) => candidate.id === itemId);
  if (!item) return { ok: false, error: "item_not_found" };
  const payout = warehouseSaleValue(item);
  if (payout <= 0) return { ok: false, error: "item_not_found" };
  return {
    ok: true,
    payout,
    item: cloneItem(item),
    profile: {
      ...profile,
      revision: profile.revision + 1,
      credits: Math.min(999_999_999, profile.credits + payout),
      warehouse: profile.warehouse.filter((candidate) => candidate.id !== itemId).map(cloneItem),
    },
  };
}

export function commitWarehouseSale(storage: StorageAdapter, itemId: string): WarehouseSaleResult {
  const loaded = loadProfile(storage);
  if (loaded.status === "unsupported") return { ok: false, error: "unsupported_version" };
  if (loaded.status === "unavailable") return { ok: false, error: "storage_unavailable" };
  const sale = sellWarehouseItem(loaded.profile, itemId);
  if (!sale.ok) return sale;
  if (!saveProfile(storage, sale.profile)) return { ok: false, error: "storage_unavailable" };
  return { ...sale, loadStatus: loaded.status };
}

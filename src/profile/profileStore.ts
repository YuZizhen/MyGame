import {
  ASSAULT_RIG,
  EXPEDITION_BACKPACK,
  autoPlaceItem,
  createEmptyContainer,
  itemCurrentValue,
  listContainerItems,
  weaponSlotFor,
  type ExtractionResult,
  type ItemInstance,
} from "../domain/loadout";

export const PROFILE_SCHEMA_VERSION = 3 as const;
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
  processedTransactionIds: readonly string[];
  preparedItemIds: readonly string[];
  warehouse: readonly ItemInstance[];
  activeRun?: ActiveRunRecord;
  lastExtraction?: ExtractionRecord;
}

export interface ActiveRunRecord {
  id: string;
  startedAt: number;
  deployedItems: readonly ItemInstance[];
}

export interface MarketCatalogItem {
  sku: "service_pistol" | "semi_rifle" | "light_ammo" | "rifle_ammo" | "field_bandage" | "field_medkit";
  price: number;
  item: Omit<ItemInstance, "id">;
}

export const MARKET_CATALOG: readonly MarketCatalogItem[] = [
  { sku: "service_pistol", price: 95, item: { definitionId: "service_pistol", name: "制式手枪", width: 1, height: 2, tags: ["weapon", "valuable"], value: 95, corruption: 0, rarity: "common", icon: "pistol", weaponStats: { kind: "ranged", damage: 20, attackIntervalMs: 320, critChance: 0, range: 720, magazineSize: 12, loadedAmmo: 0, reloadMs: 1200, ammoType: "light" } } },
  { sku: "semi_rifle", price: 220, item: { definitionId: "semi_rifle", name: "半自动步枪", width: 1, height: 3, tags: ["weapon", "valuable"], value: 220, corruption: 0, rarity: "common", icon: "rifle", weaponStats: { kind: "ranged", damage: 28, attackIntervalMs: 220, critChance: 0, range: 900, magazineSize: 15, loadedAmmo: 0, reloadMs: 1800, ammoType: "rifle" } } },
  { sku: "light_ammo", price: 24, item: { definitionId: "light_ammo", name: "轻型弹药", width: 1, height: 1, tags: ["ammo"], value: 36, corruption: 0, rarity: "common", icon: "ammo", quantity: 60, maxQuantity: 60, ammoType: "light" } },
  { sku: "rifle_ammo", price: 36, item: { definitionId: "rifle_ammo", name: "步枪弹药", width: 1, height: 2, tags: ["ammo"], value: 54, corruption: 0, rarity: "common", icon: "ammo", quantity: 60, maxQuantity: 60, ammoType: "rifle" } },
  { sku: "field_bandage", price: 14, item: { definitionId: "field_bandage", name: "战地绷带", width: 1, height: 1, tags: ["medicine"], value: 16, corruption: 0, rarity: "common", icon: "pouch", medicalStats: { healAmount: 25, useTimeMs: 900 } } },
  { sku: "field_medkit", price: 32, item: { definitionId: "field_medkit", name: "野战医疗包", width: 1, height: 2, tags: ["medicine"], value: 38, corruption: 0, rarity: "common", icon: "medkit", medicalStats: { healAmount: 50, useTimeMs: 1800 } } },
];

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

export type ProfileTransactionResult =
  | { ok: true; profile: PlayerProfile; item?: ItemInstance; loadStatus: ProfileLoadStatus }
  | { ok: false; error: "item_not_found" | "insufficient_credits" | "active_run_exists" | "invalid_selection" | "storage_unavailable" | "unsupported_version" };

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
const ITEM_ICONS = new Set(["gem", "pouch", "ring", "blade", "scroll", "helm", "axe", "armor", "relic", "pistol", "rifle", "ammo", "medkit"]);

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
    && (value.kind === undefined || value.kind === "melee" || value.kind === "ranged")
    && (value.range === undefined || isFiniteNonNegative(value.range))
    && (value.magazineSize === undefined || (Number.isInteger(value.magazineSize) && Number(value.magazineSize) > 0))
    && (value.loadedAmmo === undefined || (Number.isInteger(value.loadedAmmo) && Number(value.loadedAmmo) >= 0 && Number(value.loadedAmmo) <= Number(value.magazineSize)))
    && (value.reloadMs === undefined || (isFiniteNonNegative(value.reloadMs) && Number(value.reloadMs) > 0))
    && (value.ammoType === undefined || value.ammoType === "light" || value.ammoType === "rifle")
  );
}

function isMedicalStats(value: unknown): boolean {
  return isRecord(value)
    && isFiniteNonNegative(value.healAmount) && Number(value.healAmount) > 0
    && isFiniteNonNegative(value.useTimeMs) && Number(value.useTimeMs) > 0;
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
    (value.weaponStats === undefined || isWeaponStats(value.weaponStats)) &&
    (value.quantity === undefined || (Number.isInteger(value.quantity) && Number(value.quantity) >= 1 && Number(value.quantity) <= 60)) &&
    (value.maxQuantity === undefined || value.maxQuantity === 60) &&
    (value.ammoType === undefined || value.ammoType === "light" || value.ammoType === "rifle") &&
    (value.medicalStats === undefined || isMedicalStats(value.medicalStats))
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

function isActiveRun(value: unknown): value is ActiveRunRecord {
  return isRecord(value)
    && typeof value.id === "string"
    && isFiniteNonNegative(value.startedAt)
    && Array.isArray(value.deployedItems)
    && value.deployedItems.every(isItem);
}

export function createDefaultProfile(): PlayerProfile {
  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    revision: 0,
    successfulExtractions: 0,
    totalExtractedValue: 0,
    credits: 100,
    processedExtractionIds: [],
    processedTransactionIds: [],
    preparedItemIds: [],
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
  if (value.schemaVersion !== 1 && value.schemaVersion !== 2 && value.schemaVersion !== PROFILE_SCHEMA_VERSION) {
    return { ok: false, error: "invalid" };
  }
  const processedExtractionIds = value.processedExtractionIds ?? [];
  const processedTransactionIds = value.schemaVersion === 3 ? value.processedTransactionIds ?? [] : [];
  const preparedItemIds = value.schemaVersion === 3 ? value.preparedItemIds ?? [] : [];
  const credits = value.schemaVersion === 1 ? 100 : value.credits;
  if (
    !Number.isInteger(value.revision) ||
    Number(value.revision) < 0 ||
    !Number.isInteger(value.successfulExtractions) ||
    Number(value.successfulExtractions) < 0 ||
    !isFiniteNonNegative(value.totalExtractedValue) ||
    !isFiniteNonNegative(credits) ||
    !isStringArray(processedExtractionIds) ||
    !isStringArray(processedTransactionIds) ||
    !isStringArray(preparedItemIds) ||
    !Array.isArray(value.warehouse) ||
    !value.warehouse.every(isItem) ||
    (value.activeRun !== undefined && !isActiveRun(value.activeRun)) ||
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
      processedTransactionIds,
      preparedItemIds,
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
    medicalStats: item.medicalStats ? { ...item.medicalStats } : undefined,
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
    ...(extraction.retained.rangedWeapon ? [extraction.retained.rangedWeapon] : []),
    ...listContainerItems(extraction.retained.rig),
    ...(extraction.retained.backpack ? listContainerItems(extraction.retained.backpack) : []),
  ];
  const droppedItems = extraction.droppedBackpack
    ? listContainerItems(extraction.droppedBackpack)
    : [];
  const storableRetainedItems = retainedItems.filter((item) => item.value > 0);
  const meaningfulDroppedItems = droppedItems.filter((item) => item.value > 0);
  const deployedIds = new Set(profile.activeRun?.deployedItems.map((item) => item.id) ?? []);
  const newlyAcquiredItems = storableRetainedItems.filter((item) => !deployedIds.has(item.id));
  const warehouse = new Map(profile.warehouse.map((item) => [item.id, cloneItem(item)]));
  storableRetainedItems.forEach((item) => warehouse.set(item.id, cloneItem(item)));
  const retainedValue = newlyAcquiredItems.reduce((total, item) => total + itemCurrentValue(item), 0);
  const droppedValue = meaningfulDroppedItems.reduce((total, item) => total + itemCurrentValue(item), 0);
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
    processedTransactionIds: profile.processedTransactionIds,
    preparedItemIds: profile.preparedItemIds.filter((id) => !deployedIds.has(id)),
    warehouse: [...warehouse.values()],
    activeRun: undefined,
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

export function warehouseSaleValue(item: Pick<ItemInstance, "value" | "tags" | "quantity" | "maxQuantity">): number {
  const rate = item.tags.includes("red_cargo")
    ? MARKET_SELL_RATES.redCargo
    : item.tags.includes("weapon") || item.tags.includes("armor")
      ? MARKET_SELL_RATES.equipment
      : item.tags.some((tag) => tag === "medicine" || tag === "ammo" || tag === "tactical" || tag === "tool")
        ? MARKET_SELL_RATES.supplies
        : MARKET_SELL_RATES.valuable;
  const currentValue = itemCurrentValue(item);
  return currentValue <= 0 ? 0 : Math.max(1, Math.floor(currentValue * rate));
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
      preparedItemIds: profile.preparedItemIds.filter((id) => id !== itemId),
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

function loadWritableProfile(storage: StorageAdapter): ProfileLoadResult | ProfileTransactionResult {
  const loaded = loadProfile(storage);
  if (loaded.status === "unsupported") return { ok: false, error: "unsupported_version" };
  if (loaded.status === "unavailable") return { ok: false, error: "storage_unavailable" };
  return loaded;
}

export function commitPreparedToggle(storage: StorageAdapter, itemId: string): ProfileTransactionResult {
  const loaded = loadWritableProfile(storage);
  if ("ok" in loaded) return loaded;
  const item = loaded.profile.warehouse.find((candidate) => candidate.id === itemId);
  if (!item) return { ok: false, error: "item_not_found" };
  const selected = loaded.profile.preparedItemIds.includes(itemId);
  if (!selected && item.tags.includes("weapon")) {
    const hasPreparedWeapon = loaded.profile.warehouse.some((candidate) =>
      candidate.tags.includes("weapon")
      && weaponSlotFor(candidate) === weaponSlotFor(item)
      && loaded.profile.preparedItemIds.includes(candidate.id),
    );
    if (hasPreparedWeapon) return { ok: false, error: "invalid_selection" };
  }
  const profile: PlayerProfile = {
    ...loaded.profile,
    revision: loaded.profile.revision + 1,
    preparedItemIds: selected
      ? loaded.profile.preparedItemIds.filter((id) => id !== itemId)
      : [...loaded.profile.preparedItemIds, itemId],
  };
  if (!saveProfile(storage, profile)) return { ok: false, error: "storage_unavailable" };
  return { ok: true, profile, item: cloneItem(item), loadStatus: loaded.status };
}

export function commitRunStart(storage: StorageAdapter, runId: string, startedAt: number): ProfileTransactionResult {
  const loaded = loadWritableProfile(storage);
  if ("ok" in loaded) return loaded;
  if (loaded.profile.activeRun) return { ok: false, error: "active_run_exists" };
  const selectedIds = new Set(loaded.profile.preparedItemIds);
  const deployedItems = loaded.profile.warehouse.filter((item) => selectedIds.has(item.id)).map(cloneItem);
  if (deployedItems.length !== selectedIds.size) return { ok: false, error: "invalid_selection" };
  const deployedWeapons = deployedItems.filter((item) => item.tags.includes("weapon"));
  if (deployedWeapons.filter((item) => weaponSlotFor(item) === "melee").length > 1
    || deployedWeapons.filter((item) => weaponSlotFor(item) === "ranged").length > 1) {
    return { ok: false, error: "invalid_selection" };
  }
  let rig = createEmptyContainer(ASSAULT_RIG, "deployment-check-rig");
  let backpack = createEmptyContainer(EXPEDITION_BACKPACK, "deployment-check-backpack");
  for (const item of deployedItems.filter((candidate) => !candidate.tags.includes("weapon"))) {
    const rigPlacement = autoPlaceItem(rig, item);
    if (rigPlacement.ok) {
      rig = rigPlacement.value;
      continue;
    }
    const backpackPlacement = autoPlaceItem(backpack, item);
    if (!backpackPlacement.ok) return { ok: false, error: "invalid_selection" };
    backpack = backpackPlacement.value;
  }
  const profile: PlayerProfile = {
    ...loaded.profile,
    revision: loaded.profile.revision + 1,
    preparedItemIds: [],
    warehouse: loaded.profile.warehouse.filter((item) => !selectedIds.has(item.id)).map(cloneItem),
    activeRun: { id: runId, startedAt, deployedItems },
  };
  if (!saveProfile(storage, profile)) return { ok: false, error: "storage_unavailable" };
  return { ok: true, profile, loadStatus: loaded.status };
}

export function commitRunLoss(storage: StorageAdapter, runId: string): ProfileTransactionResult {
  const loaded = loadWritableProfile(storage);
  if ("ok" in loaded) return loaded;
  if (!loaded.profile.activeRun || loaded.profile.activeRun.id !== runId) {
    return { ok: false, error: "invalid_selection" };
  }
  const profile: PlayerProfile = { ...loaded.profile, revision: loaded.profile.revision + 1, activeRun: undefined };
  if (!saveProfile(storage, profile)) return { ok: false, error: "storage_unavailable" };
  return { ok: true, profile, loadStatus: loaded.status };
}

export function commitMarketPurchase(
  storage: StorageAdapter,
  sku: MarketCatalogItem["sku"],
  transactionId: string,
): ProfileTransactionResult {
  const loaded = loadWritableProfile(storage);
  if ("ok" in loaded) return loaded;
  if (loaded.profile.processedTransactionIds.includes(transactionId)) {
    return { ok: true, profile: loaded.profile, loadStatus: loaded.status };
  }
  const product = MARKET_CATALOG.find((entry) => entry.sku === sku);
  if (!product) return { ok: false, error: "item_not_found" };
  if (loaded.profile.credits < product.price) return { ok: false, error: "insufficient_credits" };
  const item = cloneItem({ ...product.item, id: `purchase:${transactionId}:${sku}` });
  const profile: PlayerProfile = {
    ...loaded.profile,
    revision: loaded.profile.revision + 1,
    credits: loaded.profile.credits - product.price,
    processedTransactionIds: [...loaded.profile.processedTransactionIds, transactionId],
    warehouse: [...loaded.profile.warehouse.map(cloneItem), item],
  };
  if (!saveProfile(storage, profile)) return { ok: false, error: "storage_unavailable" };
  return { ok: true, profile, item, loadStatus: loaded.status };
}

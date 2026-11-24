export type ItemTag =
  | "weapon"
  | "ammo"
  | "medicine"
  | "tactical"
  | "tool"
  | "armor"
  | "valuable"
  | "red_cargo";

export type ContainerKind = "rig" | "backpack" | "chest";
export type StoredContainerSlot = "rig" | "backpack";
export type ExtractionMode = "normal" | "drop_pack";
export type ItemRarity = "common" | "magic" | "rare" | "red";
export type ItemIcon = "gem" | "pouch" | "ring" | "blade" | "scroll" | "helm" | "axe" | "armor" | "relic" | "pistol" | "rifle" | "ammo" | "medkit";
export type WeaponKind = "melee" | "ranged";
export type AmmoType = "light" | "rifle";

export interface WeaponStats {
  damage: number;
  attackIntervalMs: number;
  critChance: number;
  kind?: WeaponKind;
  range?: number;
  magazineSize?: number;
  loadedAmmo?: number;
  reloadMs?: number;
  ammoType?: AmmoType;
}

export interface MedicalStats {
  healAmount: number;
  useTimeMs: number;
}

export interface ItemInstance {
  id: string;
  definitionId: string;
  name: string;
  width: number;
  height: number;
  tags: readonly ItemTag[];
  value: number;
  corruption: number;
  rarity?: ItemRarity;
  icon?: ItemIcon;
  weaponStats?: WeaponStats;
  quantity?: number;
  maxQuantity?: number;
  ammoType?: AmmoType;
  medicalStats?: MedicalStats;
}

export interface PocketDefinition {
  id: string;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  mask?: readonly (readonly boolean[])[];
  acceptedTags?: readonly ItemTag[];
  quickAccess?: boolean;
}

export interface ContainerDefinition {
  id: string;
  name: string;
  kind: ContainerKind;
  pockets: readonly PocketDefinition[];
}

export interface ItemPlacement {
  item: ItemInstance;
  x: number;
  y: number;
  rotated: boolean;
}

export interface PocketState {
  definition: PocketDefinition;
  placements: readonly ItemPlacement[];
}

export interface ContainerState {
  id: string;
  definitionId: string;
  kind: ContainerKind;
  name: string;
  pockets: readonly PocketState[];
}

export interface LoadoutState {
  weapon?: ItemInstance;
  rangedWeapon?: ItemInstance;
  rig: ContainerState;
  backpack?: ContainerState;
}

export type LoadoutError =
  | "duplicate_item"
  | "invalid_item_size"
  | "item_not_accepted"
  | "item_outside_pocket"
  | "item_overlaps"
  | "pocket_not_found"
  | "item_not_found"
  | "container_missing"
  | "same_container"
  | "weapon_required"
  | "weapon_slot_occupied"
  | "weapon_kind_mismatch";

export type LoadoutResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: LoadoutError };

export interface ExtractionResult {
  mode: ExtractionMode;
  retained: LoadoutState;
  droppedBackpack?: ContainerState;
  retainedItemIds: readonly string[];
  droppedItemIds: readonly string[];
  corruptionBefore: number;
  corruptionAfter: number;
}

export interface RemovedItem {
  container: ContainerState;
  item: ItemInstance;
  pocketId: string;
  placement: ItemPlacement;
}

export interface DiscardedItem {
  loadout: LoadoutState;
  item: ItemInstance;
}

export const ASSAULT_RIG: ContainerDefinition = {
  id: "rig_assault",
  name: "突击胸挂",
  kind: "rig",
  pockets: [
    { id: "magazine_left", offsetX: 0, offsetY: 0, width: 2, height: 1, acceptedTags: ["ammo"], quickAccess: true },
    { id: "magazine_right", offsetX: 3, offsetY: 0, width: 2, height: 1, acceptedTags: ["ammo"], quickAccess: true },
    { id: "tactical_left", offsetX: 0, offsetY: 2, width: 1, height: 2, acceptedTags: ["ammo", "medicine", "tactical"], quickAccess: true },
    { id: "tactical_right", offsetX: 2, offsetY: 2, width: 1, height: 2, acceptedTags: ["ammo", "medicine", "tactical"], quickAccess: true },
    { id: "medicine", offsetX: 4, offsetY: 2, width: 1, height: 1, acceptedTags: ["medicine"], quickAccess: true },
  ],
};

export const HEAVY_RIG: ContainerDefinition = {
  id: "rig_heavy",
  name: "重型胸挂",
  kind: "rig",
  pockets: [
    { id: "utility_large", offsetX: 0, offsetY: 0, width: 2, height: 2, acceptedTags: ["ammo", "medicine", "tactical", "tool", "armor", "valuable"] },
    { id: "utility_top", offsetX: 3, offsetY: 0, width: 2, height: 1, acceptedTags: ["ammo", "medicine", "tactical", "tool", "valuable"], quickAccess: true },
    { id: "utility_bottom", offsetX: 3, offsetY: 2, width: 2, height: 1, acceptedTags: ["ammo", "medicine", "tactical", "tool", "valuable"] },
    { id: "tactical", offsetX: 6, offsetY: 0, width: 1, height: 2, acceptedTags: ["ammo", "medicine", "tactical"], quickAccess: true },
  ],
};

export const LIGHT_BACKPACK: ContainerDefinition = {
  id: "backpack_light",
  name: "轻型背包",
  kind: "backpack",
  pockets: [{ id: "main", offsetX: 0, offsetY: 0, width: 5, height: 5 }],
};

export const EXPEDITION_BACKPACK: ContainerDefinition = {
  id: "backpack_expedition",
  name: "远征背包",
  kind: "backpack",
  pockets: [{ id: "main", offsetX: 0, offsetY: 0, width: 7, height: 6 }],
};

export function createEmptyContainer(definition: ContainerDefinition, id: string): ContainerState {
  return {
    id,
    definitionId: definition.id,
    kind: definition.kind,
    name: definition.name,
    pockets: definition.pockets.map((pocket) => ({ definition: pocket, placements: [] })),
  };
}

export function rotatedSize(item: ItemInstance, rotated: boolean): { width: number; height: number } {
  return rotated
    ? { width: item.height, height: item.width }
    : { width: item.width, height: item.height };
}

export function weaponDamagePerSecond(item: Pick<ItemInstance, "weaponStats">): number | undefined {
  const stats = item.weaponStats;
  if (!stats || stats.attackIntervalMs <= 0) return undefined;
  return (stats.damage * (1 + stats.critChance * 0.5) * 1000) / stats.attackIntervalMs;
}

export function isRangedWeapon(item: Pick<ItemInstance, "weaponStats"> | undefined): boolean {
  return item?.weaponStats?.kind === "ranged";
}

export function weaponSlotFor(item: Pick<ItemInstance, "weaponStats">): "melee" | "ranged" {
  return isRangedWeapon(item) ? "ranged" : "melee";
}

export function itemCurrentValue(item: Pick<ItemInstance, "value" | "quantity" | "maxQuantity">): number {
  if (item.quantity === undefined || item.maxQuantity === undefined) return item.value;
  if (item.maxQuantity <= 0) return 0;
  return Math.max(0, Math.round(item.value * item.quantity / item.maxQuantity));
}

export function loadoutAmmoCount(loadout: LoadoutState, ammoType: AmmoType): number {
  return [
    ...listContainerItems(loadout.rig),
    ...(loadout.backpack ? listContainerItems(loadout.backpack) : []),
  ].reduce((total, item) => item.tags.includes("ammo") && item.ammoType === ammoType ? total + (item.quantity ?? 0) : total, 0);
}

export function loadoutMedicineCount(loadout: LoadoutState): number {
  return [
    ...listContainerItems(loadout.rig),
    ...(loadout.backpack ? listContainerItems(loadout.backpack) : []),
  ].filter((item) => item.tags.includes("medicine") && item.medicalStats).length;
}

export function listContainerItems(container: ContainerState): readonly ItemInstance[] {
  return container.pockets.flatMap((pocket) => pocket.placements.map((placement) => placement.item));
}

export function containerCapacity(container: ContainerState): number {
  return container.pockets.reduce((total, pocket) => {
    if (!pocket.definition.mask) return total + pocket.definition.width * pocket.definition.height;
    return total + pocket.definition.mask.flat().filter(Boolean).length;
  }, 0);
}

export function containerUsedCells(container: ContainerState): number {
  return container.pockets.reduce(
    (total, pocket) =>
      total +
      pocket.placements.reduce((pocketTotal, placement) => {
        const size = rotatedSize(placement.item, placement.rotated);
        return pocketTotal + size.width * size.height;
      }, 0),
    0,
  );
}

export function placeItem(
  container: ContainerState,
  pocketId: string,
  item: ItemInstance,
  x: number,
  y: number,
  rotated = false,
): LoadoutResult<ContainerState> {
  if (
    item.width <= 0 ||
    item.height <= 0 ||
    !Number.isInteger(item.width) ||
    !Number.isInteger(item.height)
  ) {
    return { ok: false, error: "invalid_item_size" };
  }
  if (!Number.isInteger(x) || !Number.isInteger(y)) return { ok: false, error: "item_outside_pocket" };
  if (container.kind === "rig" && item.tags.includes("red_cargo")) {
    return { ok: false, error: "item_not_accepted" };
  }
  if (listContainerItems(container).some((existing) => existing.id === item.id)) {
    return { ok: false, error: "duplicate_item" };
  }

  const pocketIndex = container.pockets.findIndex((pocket) => pocket.definition.id === pocketId);
  if (pocketIndex < 0) return { ok: false, error: "pocket_not_found" };
  const pocket = container.pockets[pocketIndex];
  const definition = pocket.definition;
  const size = rotatedSize(item, rotated);

  if (
    definition.acceptedTags &&
    !definition.acceptedTags.some((acceptedTag) => item.tags.includes(acceptedTag))
  ) {
    return { ok: false, error: "item_not_accepted" };
  }

  if (x < 0 || y < 0 || x + size.width > definition.width || y + size.height > definition.height) {
    return { ok: false, error: "item_outside_pocket" };
  }

  for (let cellY = y; cellY < y + size.height; cellY += 1) {
    for (let cellX = x; cellX < x + size.width; cellX += 1) {
      if (definition.mask && definition.mask[cellY]?.[cellX] !== true) {
        return { ok: false, error: "item_outside_pocket" };
      }
    }
  }

  const overlaps = pocket.placements.some((placement) => {
    const placementSize = rotatedSize(placement.item, placement.rotated);
    return !(
      x + size.width <= placement.x ||
      placement.x + placementSize.width <= x ||
      y + size.height <= placement.y ||
      placement.y + placementSize.height <= y
    );
  });
  if (overlaps) return { ok: false, error: "item_overlaps" };

  const updatedPocket: PocketState = {
    ...pocket,
    placements: [...pocket.placements, { item, x, y, rotated }],
  };
  return {
    ok: true,
    value: {
      ...container,
      pockets: container.pockets.map((existingPocket, index) =>
        index === pocketIndex ? updatedPocket : existingPocket,
      ),
    },
  };
}

export function autoPlaceItem(
  container: ContainerState,
  item: ItemInstance,
  allowRotation = true,
): LoadoutResult<ContainerState> {
  if (container.kind === "rig" && item.tags.includes("red_cargo")) {
    return { ok: false, error: "item_not_accepted" };
  }
  let lastError: LoadoutError = "item_outside_pocket";
  for (const pocket of container.pockets) {
    const orientations = allowRotation && item.width !== item.height ? [false, true] : [false];
    for (const rotated of orientations) {
      const size = rotatedSize(item, rotated);
      for (let y = 0; y <= pocket.definition.height - size.height; y += 1) {
        for (let x = 0; x <= pocket.definition.width - size.width; x += 1) {
          const result = placeItem(container, pocket.definition.id, item, x, y, rotated);
          if (result.ok) return result;
          lastError = result.error;
        }
      }
    }
  }
  return { ok: false, error: lastError };
}

export function removeItem(
  container: ContainerState,
  itemId: string,
): LoadoutResult<RemovedItem> {
  for (let pocketIndex = 0; pocketIndex < container.pockets.length; pocketIndex += 1) {
    const pocket = container.pockets[pocketIndex];
    const placementIndex = pocket.placements.findIndex((placement) => placement.item.id === itemId);
    if (placementIndex < 0) continue;
    const placement = pocket.placements[placementIndex];
    const updatedPocket: PocketState = {
      ...pocket,
      placements: pocket.placements.filter((_, index) => index !== placementIndex),
    };
    return {
      ok: true,
      value: {
        container: {
          ...container,
          pockets: container.pockets.map((existingPocket, index) =>
            index === pocketIndex ? updatedPocket : existingPocket,
          ),
        },
        item: placement.item,
        pocketId: pocket.definition.id,
        placement,
      },
    };
  }
  return { ok: false, error: "item_not_found" };
}

export function validateLoadout(loadout: LoadoutState): LoadoutResult<LoadoutState> {
  if (loadout.weapon && weaponSlotFor(loadout.weapon) !== "melee") return { ok: false, error: "weapon_kind_mismatch" };
  if (loadout.rangedWeapon && weaponSlotFor(loadout.rangedWeapon) !== "ranged") return { ok: false, error: "weapon_kind_mismatch" };
  const ids = [
    ...(loadout.weapon ? [loadout.weapon.id] : []),
    ...(loadout.rangedWeapon ? [loadout.rangedWeapon.id] : []),
    ...listContainerItems(loadout.rig).map((item) => item.id),
    ...(loadout.backpack ? listContainerItems(loadout.backpack).map((item) => item.id) : []),
  ];
  return new Set(ids).size === ids.length
    ? { ok: true, value: loadout }
    : { ok: false, error: "duplicate_item" };
}

export function moveStoredItem(
  loadout: LoadoutState,
  itemId: string,
  source: StoredContainerSlot,
  target: StoredContainerSlot,
): LoadoutResult<LoadoutState> {
  const valid = validateLoadout(loadout);
  if (!valid.ok) return valid;
  if (source === target) return { ok: false, error: "same_container" };
  const sourceContainer = loadout[source];
  const targetContainer = loadout[target];
  if (!sourceContainer || !targetContainer) return { ok: false, error: "container_missing" };
  const removed = removeItem(sourceContainer, itemId);
  if (!removed.ok) return removed;
  const placed = autoPlaceItem(targetContainer, removed.value.item);
  if (!placed.ok) return placed;
  return {
    ok: true,
    value: {
      ...loadout,
      [source]: removed.value.container,
      [target]: placed.value,
    },
  };
}

export function moveStoredItemToPosition(
  loadout: LoadoutState,
  itemId: string,
  source: StoredContainerSlot,
  target: StoredContainerSlot,
  pocketId: string,
  x: number,
  y: number,
): LoadoutResult<LoadoutState> {
  const valid = validateLoadout(loadout);
  if (!valid.ok) return valid;
  const sourceContainer = loadout[source];
  const targetContainer = loadout[target];
  if (!sourceContainer || !targetContainer) return { ok: false, error: "container_missing" };

  const removed = removeItem(sourceContainer, itemId);
  if (!removed.ok) return removed;
  if (
    source === target
    && removed.value.pocketId === pocketId
    && removed.value.placement.x === x
    && removed.value.placement.y === y
  ) {
    return { ok: true, value: loadout };
  }
  const placementTarget = source === target ? removed.value.container : targetContainer;
  const placed = placeItem(
    placementTarget,
    pocketId,
    removed.value.item,
    x,
    y,
    removed.value.placement.rotated,
  );
  if (!placed.ok) return placed;

  const nextLoadout: LoadoutState = source === target
    ? { ...loadout, [source]: placed.value }
    : {
        ...loadout,
        [source]: removed.value.container,
        [target]: placed.value,
      };
  return validateLoadout(nextLoadout);
}

export function rotateItemInPlace(
  container: ContainerState,
  itemId: string,
): LoadoutResult<ContainerState> {
  const removed = removeItem(container, itemId);
  if (!removed.ok) return removed;
  const placement = removed.value.placement;
  return placeItem(
    removed.value.container,
    removed.value.pocketId,
    removed.value.item,
    placement.x,
    placement.y,
    !placement.rotated,
  );
}

export function rotateStoredItem(
  loadout: LoadoutState,
  itemId: string,
  source: StoredContainerSlot,
): LoadoutResult<LoadoutState> {
  const valid = validateLoadout(loadout);
  if (!valid.ok) return valid;
  const sourceContainer = loadout[source];
  if (!sourceContainer) return { ok: false, error: "container_missing" };
  const rotated = rotateItemInPlace(sourceContainer, itemId);
  return rotated.ok ? { ok: true, value: { ...loadout, [source]: rotated.value } } : rotated;
}

export function discardStoredItem(
  loadout: LoadoutState,
  itemId: string,
  source: StoredContainerSlot,
): LoadoutResult<DiscardedItem> {
  const valid = validateLoadout(loadout);
  if (!valid.ok) return valid;
  const sourceContainer = loadout[source];
  if (!sourceContainer) return { ok: false, error: "container_missing" };
  const removed = removeItem(sourceContainer, itemId);
  if (!removed.ok) return removed;
  return {
    ok: true,
    value: {
      loadout: { ...loadout, [source]: removed.value.container },
      item: removed.value.item,
    },
  };
}

export function equipWeaponFromContainer(
  loadout: LoadoutState,
  itemId: string,
  source: StoredContainerSlot,
): LoadoutResult<LoadoutState> {
  const valid = validateLoadout(loadout);
  if (!valid.ok) return valid;
  const sourceContainer = loadout[source];
  if (!sourceContainer) return { ok: false, error: "container_missing" };
  const removed = removeItem(sourceContainer, itemId);
  if (!removed.ok) return removed;
  if (!removed.value.item.tags.includes("weapon")) return { ok: false, error: "weapon_required" };
  const slot = weaponSlotFor(removed.value.item);
  const slotProperty = slot === "ranged" ? "rangedWeapon" : "weapon";
  const equipped = loadout[slotProperty];
  let updatedSource = removed.value.container;
  if (equipped) {
    const storedWeapon = autoPlaceItem(updatedSource, equipped);
    if (!storedWeapon.ok) return storedWeapon;
    updatedSource = storedWeapon.value;
  }
  return {
    ok: true,
    value: {
      ...loadout,
      [slotProperty]: removed.value.item,
      [source]: updatedSource,
    },
  };
}

export function unequipWeaponToBackpack(loadout: LoadoutState, slot: "melee" | "ranged" = "melee"): LoadoutResult<LoadoutState> {
  const valid = validateLoadout(loadout);
  if (!valid.ok) return valid;
  const slotProperty = slot === "ranged" ? "rangedWeapon" : "weapon";
  const equipped = loadout[slotProperty];
  if (!equipped) return { ok: false, error: "item_not_found" };
  if (!loadout.backpack) return { ok: false, error: "container_missing" };
  const placed = autoPlaceItem(loadout.backpack, equipped);
  if (!placed.ok) return placed;
  return { ok: true, value: { ...loadout, [slotProperty]: undefined, backpack: placed.value } };
}

export function equipWeapon(loadout: LoadoutState, item: ItemInstance): LoadoutResult<LoadoutState> {
  if (!item.tags.includes("weapon")) return { ok: false, error: "weapon_required" };
  const slotProperty = weaponSlotFor(item) === "ranged" ? "rangedWeapon" : "weapon";
  if (loadout[slotProperty]) return { ok: false, error: "weapon_slot_occupied" };
  const storedItems = [
    ...listContainerItems(loadout.rig),
    ...(loadout.backpack ? listContainerItems(loadout.backpack) : []),
  ];
  if (storedItems.some((existing) => existing.id === item.id)) {
    return { ok: false, error: "duplicate_item" };
  }
  return { ok: true, value: { ...loadout, [slotProperty]: item } };
}

export function loadoutCorruption(loadout: LoadoutState): number {
  const items = [
    ...(loadout.weapon ? [loadout.weapon] : []),
    ...(loadout.rangedWeapon ? [loadout.rangedWeapon] : []),
    ...listContainerItems(loadout.rig),
    ...(loadout.backpack ? listContainerItems(loadout.backpack) : []),
  ];
  return items.reduce((total, item) => total + item.corruption, 0);
}

function snapshotItem(item: ItemInstance): ItemInstance {
  return {
    ...item,
    tags: [...item.tags],
    weaponStats: item.weaponStats ? { ...item.weaponStats } : undefined,
    medicalStats: item.medicalStats ? { ...item.medicalStats } : undefined,
  };
}

function snapshotContainer(container: ContainerState): ContainerState {
  return {
    ...container,
    pockets: container.pockets.map((pocket) => ({
      definition: {
        ...pocket.definition,
        acceptedTags: pocket.definition.acceptedTags ? [...pocket.definition.acceptedTags] : undefined,
        mask: pocket.definition.mask?.map((row) => [...row]),
      },
      placements: pocket.placements.map((placement) => ({
        ...placement,
        item: snapshotItem(placement.item),
      })),
    })),
  };
}

export function settleExtraction(loadout: LoadoutState, mode: ExtractionMode): ExtractionResult {
  const rigItemIds = listContainerItems(loadout.rig).map((item) => item.id);
  const weaponItemIds = loadout.weapon ? [loadout.weapon.id] : [];
  const rangedWeaponItemIds = loadout.rangedWeapon ? [loadout.rangedWeapon.id] : [];
  const backpackItemIds = loadout.backpack
    ? listContainerItems(loadout.backpack).map((item) => item.id)
    : [];
  const corruptionBefore = loadoutCorruption(loadout);

  if (mode === "normal") {
    const retained: LoadoutState = {
      weapon: loadout.weapon ? snapshotItem(loadout.weapon) : undefined,
      rangedWeapon: loadout.rangedWeapon ? snapshotItem(loadout.rangedWeapon) : undefined,
      rig: snapshotContainer(loadout.rig),
      backpack: loadout.backpack ? snapshotContainer(loadout.backpack) : undefined,
    };
    return {
      mode,
      retained,
      retainedItemIds: [...weaponItemIds, ...rangedWeaponItemIds, ...rigItemIds, ...backpackItemIds],
      droppedItemIds: [],
      corruptionBefore,
      corruptionAfter: corruptionBefore,
    };
  }

  const retained: LoadoutState = {
    weapon: loadout.weapon ? snapshotItem(loadout.weapon) : undefined,
    rangedWeapon: loadout.rangedWeapon ? snapshotItem(loadout.rangedWeapon) : undefined,
    rig: snapshotContainer(loadout.rig),
  };
  return {
    mode,
    retained,
    droppedBackpack: loadout.backpack ? snapshotContainer(loadout.backpack) : undefined,
    retainedItemIds: [...weaponItemIds, ...rangedWeaponItemIds, ...rigItemIds],
    droppedItemIds: backpackItemIds,
    corruptionBefore,
    corruptionAfter: loadoutCorruption(retained),
  };
}


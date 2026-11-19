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
export type ExtractionMode = "normal" | "drop_pack";

export interface ItemInstance {
  id: string;
  definitionId: string;
  name: string;
  width: number;
  height: number;
  tags: readonly ItemTag[];
  value: number;
  corruption: number;
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
  | "weapon_required"
  | "weapon_slot_occupied";

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

export function listContainerItems(container: ContainerState): readonly ItemInstance[] {
  return container.pockets.flatMap((pocket) => pocket.placements.map((placement) => placement.item));
}

export function placeItem(
  container: ContainerState,
  pocketId: string,
  item: ItemInstance,
  x: number,
  y: number,
  rotated = false,
): LoadoutResult<ContainerState> {
  if (item.width <= 0 || item.height <= 0) return { ok: false, error: "invalid_item_size" };
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

export function equipWeapon(loadout: LoadoutState, item: ItemInstance): LoadoutResult<LoadoutState> {
  if (!item.tags.includes("weapon")) return { ok: false, error: "weapon_required" };
  if (loadout.weapon) return { ok: false, error: "weapon_slot_occupied" };
  const storedItems = [
    ...listContainerItems(loadout.rig),
    ...(loadout.backpack ? listContainerItems(loadout.backpack) : []),
  ];
  if (storedItems.some((existing) => existing.id === item.id)) {
    return { ok: false, error: "duplicate_item" };
  }
  return { ok: true, value: { ...loadout, weapon: item } };
}

export function loadoutCorruption(loadout: LoadoutState): number {
  const items = [
    ...(loadout.weapon ? [loadout.weapon] : []),
    ...listContainerItems(loadout.rig),
    ...(loadout.backpack ? listContainerItems(loadout.backpack) : []),
  ];
  return items.reduce((total, item) => total + item.corruption, 0);
}

export function settleExtraction(loadout: LoadoutState, mode: ExtractionMode): ExtractionResult {
  const rigItemIds = listContainerItems(loadout.rig).map((item) => item.id);
  const weaponItemIds = loadout.weapon ? [loadout.weapon.id] : [];
  const backpackItemIds = loadout.backpack
    ? listContainerItems(loadout.backpack).map((item) => item.id)
    : [];
  const corruptionBefore = loadoutCorruption(loadout);

  if (mode === "normal") {
    return {
      mode,
      retained: loadout,
      retainedItemIds: [...weaponItemIds, ...rigItemIds, ...backpackItemIds],
      droppedItemIds: [],
      corruptionBefore,
      corruptionAfter: corruptionBefore,
    };
  }

  const retained: LoadoutState = {
    weapon: loadout.weapon,
    rig: loadout.rig,
  };
  return {
    mode,
    retained,
    droppedBackpack: loadout.backpack,
    retainedItemIds: [...weaponItemIds, ...rigItemIds],
    droppedItemIds: backpackItemIds,
    corruptionBefore,
    corruptionAfter: loadoutCorruption(retained),
  };
}


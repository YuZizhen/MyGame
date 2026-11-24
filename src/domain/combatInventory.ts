import {
  discardStoredItem,
  type AmmoType,
  type ContainerState,
  type ItemInstance,
  type LoadoutState,
  type StoredContainerSlot,
} from "./loadout";

export interface MedicineSelection {
  item: ItemInstance;
  source: StoredContainerSlot;
  quickAccess: boolean;
}

export interface AmmoConsumption {
  loadout: LoadoutState;
  consumed: number;
}

function updateItem(container: ContainerState, itemId: string, update: (item: ItemInstance) => ItemInstance | undefined): ContainerState {
  return {
    ...container,
    pockets: container.pockets.map((pocket) => ({
      ...pocket,
      placements: pocket.placements.flatMap((placement) => {
        if (placement.item.id !== itemId) return [placement];
        const item = update(placement.item);
        return item ? [{ ...placement, item }] : [];
      }),
    })),
  };
}

function ammoIds(container: ContainerState, ammoType: AmmoType): string[] {
  return [...container.pockets]
    .sort((first, second) => Number(Boolean(second.definition.quickAccess)) - Number(Boolean(first.definition.quickAccess)))
    .flatMap((pocket) => pocket.placements)
    .filter((placement) => placement.item.tags.includes("ammo") && placement.item.ammoType === ammoType && (placement.item.quantity ?? 0) > 0)
    .map((placement) => placement.item.id);
}

export function consumeAmmo(loadout: LoadoutState, ammoType: AmmoType, requested: number): AmmoConsumption {
  let remaining = Math.max(0, Math.floor(requested));
  let next = loadout;
  for (const source of ["rig", "backpack"] as const) {
    const container = next[source];
    if (!container || remaining === 0) continue;
    for (const itemId of ammoIds(container, ammoType)) {
      if (remaining === 0) break;
      const currentContainer = next[source]!;
      const item = currentContainer.pockets.flatMap((pocket) => pocket.placements)
        .find((placement) => placement.item.id === itemId)?.item;
      if (!item) continue;
      const available = item.quantity ?? 0;
      const used = Math.min(remaining, available);
      const updated = updateItem(currentContainer, itemId, (existing) => {
        const quantity = (existing.quantity ?? 0) - used;
        return quantity > 0 ? { ...existing, quantity } : undefined;
      });
      next = { ...next, [source]: updated };
      remaining -= used;
    }
  }
  return { loadout: next, consumed: Math.max(0, Math.floor(requested)) - remaining };
}

export function listMedicineSelections(loadout: LoadoutState): MedicineSelection[] {
  const selections: MedicineSelection[] = [];
  for (const source of ["rig", "backpack"] as const) {
    const container = loadout[source];
    if (!container) continue;
    const pockets = [...container.pockets]
      .sort((first, second) => Number(Boolean(second.definition.quickAccess)) - Number(Boolean(first.definition.quickAccess)));
    for (const pocket of pockets) {
      for (const placement of pocket.placements) {
        if (placement.item.tags.includes("medicine") && placement.item.medicalStats) {
          selections.push({ item: placement.item, source, quickAccess: Boolean(pocket.definition.quickAccess) });
        }
      }
    }
  }
  return selections;
}

export function findQuickMedicine(loadout: LoadoutState, preferredItemId?: string): MedicineSelection | undefined {
  const selections = listMedicineSelections(loadout);
  return selections.find((selection) => selection.item.id === preferredItemId) ?? selections[0];
}

export function consumeMedicine(loadout: LoadoutState, selection: MedicineSelection): LoadoutState | undefined {
  const result = discardStoredItem(loadout, selection.item.id, selection.source);
  return result.ok ? result.value.loadout : undefined;
}

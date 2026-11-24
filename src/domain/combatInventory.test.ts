import { describe, expect, it } from "vitest";
import { consumeAmmo, consumeMedicine, findQuickMedicine, listMedicineSelections } from "./combatInventory";
import {
  ASSAULT_RIG,
  EXPEDITION_BACKPACK,
  containerUsedCells,
  createEmptyContainer,
  listContainerItems,
  placeItem,
  type ItemInstance,
  type LoadoutState,
} from "./loadout";

function item(overrides: Partial<ItemInstance> & Pick<ItemInstance, "id">): ItemInstance {
  return {
    definitionId: overrides.id,
    name: overrides.id,
    width: 1,
    height: 1,
    tags: [],
    value: 0,
    corruption: 0,
    ...overrides,
  };
}

function placedLoadout(items: ItemInstance[]): LoadoutState {
  let rig = createEmptyContainer(ASSAULT_RIG, "rig");
  let backpack = createEmptyContainer(EXPEDITION_BACKPACK, "bag");
  for (const [index, entry] of items.entries()) {
    const target = index === 0 ? rig : backpack;
    const rigPocket = entry.tags.includes("medicine") ? "medicine" : "magazine_left";
    const result = placeItem(target, index === 0 ? rigPocket : "main", entry, index === 0 ? 0 : index - 1, 0);
    if (!result.ok) throw new Error(result.error);
    if (index === 0) rig = result.value;
    else backpack = result.value;
  }
  return { rig, backpack };
}

describe("combat inventory", () => {
  it("keeps one to sixty rounds in the same grid footprint", () => {
    const one = placedLoadout([item({ id: "one", tags: ["ammo"], ammoType: "light", quantity: 1, maxQuantity: 60 })]);
    const sixty = placedLoadout([item({ id: "sixty", tags: ["ammo"], ammoType: "light", quantity: 60, maxQuantity: 60 })]);

    expect(containerUsedCells(one.rig)).toBe(1);
    expect(containerUsedCells(sixty.rig)).toBe(1);
  });

  it("reload consumption uses quick rig ammo before backpack and removes empty stacks", () => {
    const loadout = placedLoadout([
      item({ id: "rig-ammo", tags: ["ammo"], ammoType: "light", quantity: 5, maxQuantity: 60 }),
      item({ id: "bag-ammo", tags: ["ammo"], ammoType: "light", quantity: 60, maxQuantity: 60 }),
    ]);

    const result = consumeAmmo(loadout, "light", 12);

    expect(result.consumed).toBe(12);
    expect(listContainerItems(result.loadout.rig)).toHaveLength(0);
    expect(listContainerItems(result.loadout.backpack!)[0].quantity).toBe(53);
  });

  it("selects quick-slot medicine and consumes its exact instance", () => {
    const medicine = item({ id: "bandage", tags: ["medicine"], medicalStats: { healAmount: 25, useTimeMs: 900 } });
    const loadout = placedLoadout([medicine]);
    const selection = findQuickMedicine(loadout);

    expect(selection).toMatchObject({ source: "rig", quickAccess: true });
    expect(consumeMedicine(loadout, selection!)?.rig.pockets.flatMap((pocket) => pocket.placements)).toHaveLength(0);
  });

  it("orders quick-rig medicine before backpack medicine and honors a selected id", () => {
    const quick = item({ id: "quick-med", tags: ["medicine"], medicalStats: { healAmount: 25, useTimeMs: 900 } });
    const bag = item({ id: "bag-med", tags: ["medicine"], medicalStats: { healAmount: 50, useTimeMs: 1800 } });
    const loadout = placedLoadout([quick, bag]);

    expect(listMedicineSelections(loadout).map((selection) => selection.item.id)).toEqual(["quick-med", "bag-med"]);
    expect(findQuickMedicine(loadout, "bag-med")?.item.id).toBe("bag-med");
  });
});

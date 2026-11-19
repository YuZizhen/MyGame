import type { ChestType, InventoryItem, LootItem, LootRarity } from "./types";

export const INVENTORY_COLUMNS = 6;
export const INVENTORY_ROWS = 5;

interface LootTemplate {
  id: string;
  name: string;
  width: number;
  height: number;
  baseValue: number;
  icon: LootItem["icon"];
}

const TEMPLATES: LootTemplate[] = [
  { id: "ember_gem", name: "余烬宝石", width: 1, height: 1, baseValue: 28, icon: "gem" },
  { id: "old_coin_pouch", name: "旧王钱袋", width: 1, height: 1, baseValue: 20, icon: "pouch" },
  { id: "oath_ring", name: "铁誓指环", width: 1, height: 1, baseValue: 24, icon: "ring" },
  { id: "ash_blade", name: "灰烬长剑", width: 1, height: 2, baseValue: 34, icon: "blade" },
  { id: "sealed_scroll", name: "封蜡卷筒", width: 1, height: 2, baseValue: 30, icon: "scroll" },
  { id: "warden_helm", name: "守卫头盔", width: 2, height: 1, baseValue: 36, icon: "helm" },
  { id: "breach_axe", name: "裂口战斧", width: 2, height: 1, baseValue: 38, icon: "axe" },
  { id: "oath_plate", name: "旧誓胸甲", width: 2, height: 2, baseValue: 58, icon: "armor" },
  { id: "corrupt_tablet", name: "腐化石板", width: 2, height: 2, baseValue: 64, icon: "relic" },
];

function seededValue(seed: number): number {
  let value = seed + 0x6d2b79f5;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

function rarityFor(type: ChestType, roll: number): LootRarity {
  const weights = {
    supply: { magic: 0.18, rare: 0.02 },
    reliquary: { magic: 0.46, rare: 0.1 },
    hidden: { magic: 0.5, rare: 0.17 },
    boss: { magic: 0.62, rare: 0.28 },
  }[type];
  if (roll < weights.rare) return "rare";
  if (roll < weights.rare + weights.magic) return "magic";
  return "common";
}

export function generateChestLoot(chestId: string, type: ChestType, seed: number): LootItem[] {
  const itemCount = type === "boss" ? 5 : type === "reliquary" ? 4 : 3;
  const items: LootItem[] = [];

  for (let index = 0; index < itemCount; index += 1) {
    const templateRoll = seededValue(seed * 41 + index * 97 + 13);
    let templateIndex = Math.floor(templateRoll * TEMPLATES.length);
    if (type === "supply" && index === 0) templateIndex = Math.floor(templateRoll * 3);
    if (type === "boss" && index === 0) templateIndex = 7 + Math.floor(templateRoll * 2);
    const template = TEMPLATES[Math.min(TEMPLATES.length - 1, templateIndex)];
    const rarity = type === "boss" && index === 0 ? "rare" : rarityFor(type, seededValue(seed * 67 + index * 131));
    const multiplier = rarity === "rare" ? 5.5 : rarity === "magic" ? 2.4 : 1;
    const variation = 0.9 + seededValue(seed * 101 + index * 53) * 0.2;
    items.push({
      id: `${chestId}_${index}`,
      templateId: template.id,
      name: template.name,
      width: template.width,
      height: template.height,
      rarity,
      value: Math.round(template.baseValue * multiplier * variation),
      icon: template.icon,
    });
  }

  return items;
}

export function findInventoryPlacement(
  inventory: InventoryItem[],
  item: LootItem,
  columns = INVENTORY_COLUMNS,
  rows = INVENTORY_ROWS,
): { x: number; y: number } | undefined {
  const occupied = new Set<string>();
  for (const existing of inventory) {
    for (let y = existing.y; y < existing.y + existing.height; y += 1) {
      for (let x = existing.x; x < existing.x + existing.width; x += 1) occupied.add(`${x}:${y}`);
    }
  }

  for (let y = 0; y <= rows - item.height; y += 1) {
    for (let x = 0; x <= columns - item.width; x += 1) {
      let fits = true;
      for (let offsetY = 0; offsetY < item.height && fits; offsetY += 1) {
        for (let offsetX = 0; offsetX < item.width; offsetX += 1) {
          if (occupied.has(`${x + offsetX}:${y + offsetY}`)) {
            fits = false;
            break;
          }
        }
      }
      if (fits) return { x, y };
    }
  }
  return undefined;
}

export function usedInventoryCells(inventory: InventoryItem[]): number {
  return inventory.reduce((total, item) => total + item.width * item.height, 0);
}


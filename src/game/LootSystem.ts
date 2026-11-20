import type { ChestType, LootItem, LootRarity } from "./types";

interface LootTemplate {
  id: string;
  name: string;
  width: number;
  height: number;
  baseValue: number;
  icon: LootItem["icon"];
  tags: LootItem["tags"];
  forcedRarity?: LootRarity;
}

const TEMPLATES: LootTemplate[] = [
  { id: "field_bandage", name: "战地绷带", width: 1, height: 1, baseValue: 16, icon: "pouch", tags: ["medicine"] },
  { id: "salvaged_magazine", name: "拾荒弹匣", width: 1, height: 2, baseValue: 22, icon: "scroll", tags: ["ammo"] },
  { id: "flash_charge", name: "闪光药剂", width: 1, height: 1, baseValue: 24, icon: "gem", tags: ["tactical"] },
  { id: "ember_gem", name: "余烬宝石", width: 1, height: 1, baseValue: 28, icon: "gem", tags: ["valuable"] },
  { id: "old_coin_pouch", name: "旧王钱袋", width: 1, height: 1, baseValue: 20, icon: "pouch", tags: ["valuable"] },
  { id: "oath_ring", name: "铁誓指环", width: 1, height: 1, baseValue: 24, icon: "ring", tags: ["valuable"] },
  { id: "ash_blade", name: "灰烬长剑", width: 1, height: 2, baseValue: 34, icon: "blade", tags: ["weapon", "valuable"] },
  { id: "sealed_scroll", name: "封蜡卷筒", width: 1, height: 2, baseValue: 30, icon: "scroll", tags: ["tool", "valuable"] },
  { id: "warden_helm", name: "守卫头盔", width: 2, height: 1, baseValue: 36, icon: "helm", tags: ["armor", "valuable"] },
  { id: "breach_axe", name: "裂口战斧", width: 2, height: 1, baseValue: 38, icon: "axe", tags: ["weapon", "valuable"] },
  { id: "oath_plate", name: "旧誓胸甲", width: 2, height: 2, baseValue: 58, icon: "armor", tags: ["armor", "valuable"] },
  { id: "corrupt_tablet", name: "腐化石板", width: 2, height: 2, baseValue: 64, icon: "relic", tags: ["valuable"] },
];

const BOSS_RED_TEMPLATE: LootTemplate = {
  id: "warden_idol",
  name: "守门人赤红雕像",
  width: 2,
  height: 3,
  baseValue: 220,
  icon: "relic",
  tags: ["red_cargo", "valuable"],
  forcedRarity: "red",
};

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

export function lootRevealDuration(rarity: LootRarity): number {
  return {
    common: 450,
    magic: 750,
    rare: 1100,
    red: 1600,
  }[rarity];
}

export function generateChestLoot(chestId: string, type: ChestType, seed: number): LootItem[] {
  const itemCount = type === "boss" ? 5 : type === "reliquary" ? 4 : 3;
  const items: LootItem[] = [];

  for (let index = 0; index < itemCount; index += 1) {
    const templateRoll = seededValue(seed * 41 + index * 97 + 13);
    let template: LootTemplate;
    if (type === "boss" && index === 0) {
      template = BOSS_RED_TEMPLATE;
    } else {
      const templatePoolSize = type === "supply" && index === 0 ? 3 : TEMPLATES.length;
      template = TEMPLATES[Math.min(templatePoolSize - 1, Math.floor(templateRoll * templatePoolSize))];
    }
    const rarity = template.forcedRarity ?? rarityFor(type, seededValue(seed * 67 + index * 131));
    const multiplier = rarity === "red" ? 8.5 : rarity === "rare" ? 5.5 : rarity === "magic" ? 2.4 : 1;
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
      tags: template.tags,
    });
  }

  return items;
}


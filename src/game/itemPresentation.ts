import type { ItemInstance, ItemRarity, ItemTag } from "../domain/loadout";

export interface PresentableItem {
  definitionId?: string;
  templateId?: string;
  tags: readonly ItemTag[];
  rarity?: ItemRarity;
  weaponStats?: ItemInstance["weaponStats"];
}

export interface ItemPresentation {
  category: string;
  rarityLabel: string;
  purpose: string;
  flavor: string;
}

const FLAVOR_BY_DEFINITION: Record<string, string> = {
  field_bandage: "沾着灰尘的应急绷带，仍保留基本医疗价值。",
  salvaged_magazine: "从旧时代武器上拆下的弹匣，结构尚且完整。",
  flash_charge: "撞击后会释放强光的炼金药剂。",
  ember_gem: "内部仍有微弱余烬流动的半透明宝石。",
  old_coin_pouch: "装着旧王朝铸币，收藏家愿意为它付钱。",
  oath_ring: "戒面刻着已经无法辨认的守誓铭文。",
  ash_blade: "刃口被火山灰侵蚀，但仍适合近身作战。",
  sealed_scroll: "封蜡尚未破损，内容可能比纸张本身更值钱。",
  warden_helm: "守卫遗留的沉重头盔，目前只能作为战利品带出。",
  breach_axe: "重心靠前的战斧，单次攻击更重但速度较慢。",
  oath_plate: "残存誓约纹章的胸甲，目前尚无法装备。",
  corrupt_tablet: "刻痕会随光线变化，散发出不稳定的腐化气息。",
  warden_idol: "守门人供奉的赤红雕像，价值极高且腐化严重。",
};

function has(tags: readonly ItemTag[], tag: ItemTag): boolean {
  return tags.includes(tag);
}

export function describeItem(item: PresentableItem): ItemPresentation {
  const tags = item.tags;
  const definitionId = item.definitionId ?? item.templateId ?? "";
  const rarityLabel = {
    common: "普通",
    magic: "魔法",
    rare: "稀有",
    red: "赤红",
  }[item.rarity ?? "common"];

  if (has(tags, "red_cargo")) {
    return {
      category: "赤红贵重品",
      rarityLabel,
      purpose: "高价值腐化货物，只能放入背包；丢包撤离时会失去。",
      flavor: FLAVOR_BY_DEFINITION[definitionId] ?? "来源不明的高价值腐化物。",
    };
  }
  if (has(tags, "weapon")) {
    return {
      category: "近战武器",
      rarityLabel,
      purpose: "可装备到武器位，直接改变伤害、攻速和暴击表现。",
      flavor: FLAVOR_BY_DEFINITION[definitionId] ?? "可在地穴中使用的近战武器。",
    };
  }
  if (has(tags, "armor")) {
    return {
      category: "护甲战利品",
      rarityLabel,
      purpose: "当前版本不可装备；主要用于完整撤离后结算价值。",
      flavor: FLAVOR_BY_DEFINITION[definitionId] ?? "仍有交易价值的残损护甲。",
    };
  }
  if (has(tags, "medicine")) {
    return {
      category: "医疗补给",
      rarityLabel,
      purpose: "可放入胸挂医疗口袋；当前版本主要作为带出物资。",
      flavor: FLAVOR_BY_DEFINITION[definitionId] ?? "用于处理伤势的基础医疗物资。",
    };
  }
  if (has(tags, "ammo")) {
    return {
      category: "弹药补给",
      rarityLabel,
      purpose: "可放入胸挂弹匣口袋；当前版本主要作为带出物资。",
      flavor: FLAVOR_BY_DEFINITION[definitionId] ?? "尚可使用或交易的弹药组件。",
    };
  }
  if (has(tags, "tactical")) {
    return {
      category: "战术物资",
      rarityLabel,
      purpose: "可放入胸挂战术口袋；主动使用功能将在后续版本开放。",
      flavor: FLAVOR_BY_DEFINITION[definitionId] ?? "适合战术行动的炼金或机械物资。",
    };
  }
  if (has(tags, "tool")) {
    return {
      category: "遗迹工具",
      rarityLabel,
      purpose: "制作功能开放前，主要用于完整撤离后结算价值。",
      flavor: FLAVOR_BY_DEFINITION[definitionId] ?? "来自遗迹的工具或文书。",
    };
  }
  return {
    category: has(tags, "valuable") ? "贵重品" : "探索物资",
    rarityLabel,
    purpose: "主要用于完整撤离后结算价值。",
    flavor: FLAVOR_BY_DEFINITION[definitionId] ?? "在地穴外仍有一定交易价值。",
  };
}

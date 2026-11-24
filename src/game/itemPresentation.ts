import { weaponDamagePerSecond, type ItemInstance, type ItemRarity, type ItemTag, type WeaponStats } from "../domain/loadout";

export interface PresentableItem {
  definitionId?: string;
  templateId?: string;
  tags: readonly ItemTag[];
  rarity?: ItemRarity;
  weaponStats?: ItemInstance["weaponStats"];
  quantity?: number;
  maxQuantity?: number;
  medicalStats?: ItemInstance["medicalStats"];
}

export interface ItemPresentation {
  category: string;
  rarityLabel: string;
  purpose: string;
  flavor: string;
}

export type WeaponComparisonDirection = "up" | "down" | "same" | "new";

export interface WeaponComparisonRow {
  key: "damage" | "attackSpeed" | "critChance" | "dps";
  label: string;
  currentValue: string;
  candidateValue: string;
  deltaText: string;
  direction: WeaponComparisonDirection;
}

interface ComparisonMetric {
  key: WeaponComparisonRow["key"];
  label: string;
  candidate: number;
  current?: number;
  decimals: number;
  suffix?: string;
}

function roundTo(value: number, decimals: number): number {
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}

function formatMetric(value: number, decimals: number, suffix = ""): string {
  return `${value.toFixed(decimals)}${suffix}`;
}

export function compareWeaponStats(candidate: WeaponStats, current?: WeaponStats): WeaponComparisonRow[] {
  const candidateDps = weaponDamagePerSecond({ weaponStats: candidate }) ?? 0;
  const currentDps = current ? weaponDamagePerSecond({ weaponStats: current }) : undefined;
  const metrics: ComparisonMetric[] = [
    { key: "damage", label: "伤害", candidate: candidate.damage, current: current?.damage, decimals: 0 },
    {
      key: "attackSpeed",
      label: "攻速",
      candidate: 1000 / candidate.attackIntervalMs,
      current: current ? 1000 / current.attackIntervalMs : undefined,
      decimals: 2,
      suffix: "/秒",
    },
    {
      key: "critChance",
      label: "暴击",
      candidate: candidate.critChance * 100,
      current: current ? current.critChance * 100 : undefined,
      decimals: 0,
      suffix: "%",
    },
    { key: "dps", label: "DPS", candidate: candidateDps, current: currentDps, decimals: 1 },
  ];

  return metrics.map((metric) => {
    const candidateValue = roundTo(metric.candidate, metric.decimals);
    const currentValue = metric.current === undefined ? undefined : roundTo(metric.current, metric.decimals);
    if (currentValue === undefined) {
      return {
        key: metric.key,
        label: metric.label,
        currentValue: "—",
        candidateValue: formatMetric(candidateValue, metric.decimals, metric.suffix),
        deltaText: "新装备",
        direction: "new",
      };
    }
    const difference = roundTo(candidateValue - currentValue, metric.decimals);
    const direction: WeaponComparisonDirection = difference > 0 ? "up" : difference < 0 ? "down" : "same";
    const sign = difference > 0 ? "+" : "";
    return {
      key: metric.key,
      label: metric.label,
      currentValue: formatMetric(currentValue, metric.decimals, metric.suffix),
      candidateValue: formatMetric(candidateValue, metric.decimals, metric.suffix),
      deltaText: direction === "same"
        ? "—"
        : `${direction === "up" ? "↑" : "↓"} ${sign}${formatMetric(difference, metric.decimals, metric.suffix)}`,
      direction,
    };
  });
}

const FLAVOR_BY_DEFINITION: Record<string, string> = {
  field_bandage: "沾着灰尘的应急绷带，仍保留基本医疗价值。",
  field_medkit: "密封尚好的野战医疗包，需要时间完成处理。",
  light_ammo: "适用于手枪与轻型武器的标准弹药。",
  rifle_ammo: "装药量更高的步枪弹药，携带时占用更多空间。",
  service_pistol: "可靠的制式手枪，适合作为初级远程武器。",
  semi_rifle: "半自动遗迹步枪，射程与单发威力都很出色。",
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
    const ranged = item.weaponStats?.kind === "ranged";
    return {
      category: ranged ? "远程武器" : "近战武器",
      rarityLabel,
      purpose: ranged ? "装备后可远程射击；需要对应弹药并花费时间换弹。" : "可装备到主武器位，保留应急短刃作为备用。",
      flavor: FLAVOR_BY_DEFINITION[definitionId] ?? (ranged ? "需要弹药驱动的远程武器。" : "可在地穴中使用的近战武器。"),
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
      purpose: `按 Q 使用并消耗；恢复 ${item.medicalStats?.healAmount ?? 0} 生命，需要 ${((item.medicalStats?.useTimeMs ?? 0) / 1000).toFixed(1)} 秒。`,
      flavor: FLAVOR_BY_DEFINITION[definitionId] ?? "用于处理伤势的基础医疗物资。",
    };
  }
  if (has(tags, "ammo")) {
    return {
      category: "弹药补给",
      rarityLabel,
      purpose: `每格最多60发，当前 ${item.quantity ?? 0}/${item.maxQuantity ?? 60}；按 R 为对应枪械换弹。`,
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

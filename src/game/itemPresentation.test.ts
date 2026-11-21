import { describe, expect, it } from "vitest";
import { compareWeaponStats, describeItem } from "./itemPresentation";

describe("describeItem", () => {
  it("describes equippable weapons without hiding their gameplay use", () => {
    const result = describeItem({
      definitionId: "ash_blade",
      tags: ["weapon", "valuable"],
      rarity: "rare",
      weaponStats: { damage: 34, attackIntervalMs: 450, critChance: 0.04 },
    });
    expect(result).toMatchObject({ category: "近战武器", rarityLabel: "稀有" });
    expect(result.purpose).toContain("可装备");
  });

  it("warns that red cargo is lost during a drop-pack extraction", () => {
    const result = describeItem({ templateId: "warden_idol", tags: ["red_cargo", "valuable"], rarity: "red" });
    expect(result.category).toBe("赤红贵重品");
    expect(result.purpose).toContain("丢包撤离");
  });

  it("states honestly when armor is not yet equippable", () => {
    const result = describeItem({ definitionId: "oath_plate", tags: ["armor", "valuable"], rarity: "magic" });
    expect(result.purpose).toContain("当前版本不可装备");
  });
});

describe("compareWeaponStats", () => {
  it("marks mixed gains and losses independently instead of coloring the whole weapon", () => {
    const rows = compareWeaponStats(
      { damage: 36, attackIntervalMs: 600, critChance: 0.08 },
      { damage: 30, attackIntervalMs: 480, critChance: 0.02 },
    );

    expect(rows.map((row) => [row.key, row.direction])).toEqual([
      ["damage", "up"],
      ["attackSpeed", "down"],
      ["critChance", "up"],
      ["dps", "down"],
    ]);
    expect(rows[0].deltaText).toBe("↑ +6");
    expect(rows[1].deltaText).toBe("↓ -0.41/秒");
  });

  it("uses neutral and new-equipment states when a comparison is not meaningful", () => {
    const stats = { damage: 30, attackIntervalMs: 480, critChance: 0 };
    expect(compareWeaponStats(stats, stats).every((row) => row.direction === "same")).toBe(true);
    expect(compareWeaponStats(stats).every((row) => row.direction === "new")).toBe(true);
  });
});

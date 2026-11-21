import { describe, expect, it } from "vitest";
import { describeItem } from "./itemPresentation";

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

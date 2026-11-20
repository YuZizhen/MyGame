import { describe, expect, it } from "vitest";
import { generateChestLoot, lootRevealDuration } from "./LootSystem";

describe("generateChestLoot", () => {
  it("reserves red cargo for the boss chest", () => {
    for (const type of ["supply", "reliquary", "hidden"] as const) {
      for (let seed = 1; seed <= 100; seed += 1) {
        expect(generateChestLoot(`${type}_${seed}`, type, seed)).not.toContainEqual(
          expect.objectContaining({ rarity: "red" }),
        );
      }
    }
  });

  it("guarantees one 2x3 red idol as the first boss reward", () => {
    const loot = generateChestLoot("boss_chest", "boss", 42);

    expect(loot[0]).toMatchObject({
      templateId: "warden_idol",
      rarity: "red",
      width: 2,
      height: 3,
      tags: ["red_cargo", "valuable"],
    });
  });

  it("guarantees a rig-compatible combat item in the first supply slot", () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const [first] = generateChestLoot(`supply_${seed}`, "supply", seed);
      expect(first.tags.some((tag) => tag === "medicine" || tag === "ammo" || tag === "tactical")).toBe(true);
    }
  });

  it("takes progressively longer to identify rarer loot", () => {
    const durations = (["common", "magic", "rare", "red"] as const).map(lootRevealDuration);
    expect(durations).toEqual([450, 750, 1100, 1600]);
    expect(durations).toEqual([...durations].sort((left, right) => left - right));
  });

  it("adds bounded combat stats only to weapon loot", () => {
    const items = Array.from({ length: 80 }, (_, seed) => generateChestLoot(`loot_${seed}`, "hidden", seed)).flat();
    const weapons = items.filter((item) => item.tags.includes("weapon"));
    expect(weapons.length).toBeGreaterThan(0);
    expect(weapons.every((item) => item.weaponStats !== undefined)).toBe(true);
    expect(weapons.every((item) => item.weaponStats!.damage >= 30 && item.weaponStats!.damage <= 38)).toBe(true);
    expect(items.filter((item) => !item.tags.includes("weapon")).every((item) => item.weaponStats === undefined)).toBe(true);
  });
});

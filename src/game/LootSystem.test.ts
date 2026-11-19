import { describe, expect, it } from "vitest";
import { generateChestLoot } from "./LootSystem";

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
    });
  });
});

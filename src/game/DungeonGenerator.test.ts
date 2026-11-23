import { describe, expect, it } from "vitest";
import { generateDungeon } from "./DungeonGenerator";

function reachableFloorCount(dungeon: ReturnType<typeof generateDungeon>): Set<number> {
  const startIndex = dungeon.startRoom.centerY * dungeon.width + dungeon.startRoom.centerX;
  const visited = new Set<number>([startIndex]);
  const queue = [startIndex];
  while (queue.length > 0) {
    const index = queue.shift()!;
    const x = index % dungeon.width;
    const y = Math.floor(index / dungeon.width);
    for (const [nextX, nextY] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nextX < 0 || nextY < 0 || nextX >= dungeon.width || nextY >= dungeon.height) continue;
      const nextIndex = nextY * dungeon.width + nextX;
      if (dungeon.tiles[nextIndex] !== 1 || visited.has(nextIndex)) continue;
      visited.add(nextIndex);
      queue.push(nextIndex);
    }
  }
  return visited;
}

describe("generateDungeon", () => {
  it("generates deterministic but seed-dependent ashen layouts", () => {
    const first = generateDungeon(42);
    const repeated = generateDungeon(42);
    const different = generateDungeon(43);

    expect(repeated.tiles).toEqual(first.tiles);
    expect(repeated.rooms).toEqual(first.rooms);
    expect(different.tiles).not.toEqual(first.tiles);
  });

  it("uses varied irregular room silhouettes and solid interior obstacles", () => {
    const dungeon = generateDungeon(20261122);
    const shapes = new Set(dungeon.rooms.map((room) => room.shape));
    const obstacleCount = dungeon.tiles.filter((tile) => tile === 2).length;

    expect(shapes.size).toBeGreaterThanOrEqual(4);
    expect(shapes.has("arena")).toBe(true);
    expect(dungeon.rooms.filter((room) => room.shape !== "rectangular").length).toBeGreaterThan(10);
    expect(obstacleCount).toBeGreaterThanOrEqual(14);
    expect(dungeon.tiles[dungeon.startRoom.centerY * dungeon.width + dungeon.startRoom.centerX]).toBe(1);
    expect(dungeon.tiles[dungeon.bossRoom.centerY * dungeon.width + dungeon.bossRoom.centerX]).toBe(1);
  });

  it("keeps every floor tile and room center connected across many seeds", () => {
    for (let seed = 1; seed <= 64; seed += 1) {
      const dungeon = generateDungeon(seed);
      const reachable = reachableFloorCount(dungeon);
      expect(reachable.size, `seed ${seed} contains disconnected floor islands`).toBe(
        dungeon.tiles.filter((tile) => tile === 1).length,
      );
      for (const room of dungeon.rooms) {
        expect(reachable.has(room.centerY * dungeon.width + room.centerX)).toBe(true);
      }
      for (let x = 0; x < dungeon.width; x += 1) {
        expect(dungeon.tiles[x]).toBe(0);
        expect(dungeon.tiles[(dungeon.height - 1) * dungeon.width + x]).toBe(0);
      }
      for (let y = 0; y < dungeon.height; y += 1) {
        expect(dungeon.tiles[y * dungeon.width]).toBe(0);
        expect(dungeon.tiles[y * dungeon.width + dungeon.width - 1]).toBe(0);
      }
    }
  });
});

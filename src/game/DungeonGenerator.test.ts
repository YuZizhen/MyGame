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
  it("generates one deterministic canonical ashen layout", () => {
    const first = generateDungeon();
    const repeated = generateDungeon();

    expect(repeated.tiles).toEqual(first.tiles);
    expect(repeated.rooms).toEqual(first.rooms);
    expect(first.width).toBe(144);
    expect(first.height).toBe(88);
    expect(first.rooms).toHaveLength(24);
    expect(first.startRoom).toMatchObject({ gridX: 0, gridY: 3, isStart: true });
    expect(first.bossRoom).toMatchObject({ gridX: 5, gridY: 0, isBoss: true });
    expect(first.dropPackExitRoom).toMatchObject({ gridX: 5, gridY: 3, isStart: false, isBoss: false });
    expect(first.dropPackExitRoom.id).not.toBe(first.startRoom.id);
    expect(first.dropPackExitRoom.id).not.toBe(first.bossRoom.id);
  });

  it("uses varied irregular room silhouettes and solid interior obstacles", () => {
    const dungeon = generateDungeon();
    const shapes = new Set(dungeon.rooms.map((room) => room.shape));
    const obstacleCount = dungeon.tiles.filter((tile) => tile === 2).length;

    expect(shapes.size).toBeGreaterThanOrEqual(4);
    expect(shapes.has("arena")).toBe(true);
    expect(dungeon.rooms.filter((room) => room.shape !== "rectangular").length).toBeGreaterThan(10);
    expect(obstacleCount).toBeGreaterThanOrEqual(14);
    expect(dungeon.tiles[dungeon.startRoom.centerY * dungeon.width + dungeon.startRoom.centerX]).toBe(1);
    expect(dungeon.tiles[dungeon.bossRoom.centerY * dungeon.width + dungeon.bossRoom.centerX]).toBe(1);
    expect(dungeon.tiles[dungeon.dropPackExitRoom.centerY * dungeon.width + dungeon.dropPackExitRoom.centerX]).toBe(1);
  });

  it("keeps every floor tile and room center connected", () => {
    const dungeon = generateDungeon();
    const reachable = reachableFloorCount(dungeon);
    expect(reachable.size).toBe(dungeon.tiles.filter((tile) => tile === 1).length);
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
  });
});

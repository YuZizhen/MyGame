import type { DungeonData, DungeonRoom, DungeonRoomShape, TileValue } from "./types";

export const CANONICAL_DUNGEON_SEED = 20261119;
const MAP_WIDTH = 144;
const MAP_HEIGHT = 88;
const GRID_COLUMNS = 6;
const GRID_ROWS = 4;
const CELL_WIDTH = 24;
const CELL_HEIGHT = 22;

class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state += 0x6d2b79f5;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  integer(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  shuffle<T>(values: T[]): T[] {
    for (let index = values.length - 1; index > 0; index -= 1) {
      const target = this.integer(0, index);
      [values[index], values[target]] = [values[target], values[index]];
    }
    return values;
  }
}

function tileIndex(x: number, y: number): number {
  return y * MAP_WIDTH + x;
}

function carve(tiles: TileValue[], x: number, y: number): void {
  if (x > 0 && y > 0 && x < MAP_WIDTH - 1 && y < MAP_HEIGHT - 1) {
    tiles[tileIndex(x, y)] = 1;
  }
}

function roomShapeContains(room: DungeonRoom, x: number, y: number): boolean {
  const localX = x - room.x;
  const localY = y - room.y;
  const farX = room.width - 1 - localX;
  const farY = room.height - 1 - localY;
  if (localX < 0 || localY < 0 || farX < 0 || farY < 0) return false;

  if (room.shape === "rectangular") return true;
  if (room.shape === "chamfered" || room.shape === "arena") {
    const cut = room.shape === "arena" ? 3 : 2;
    return localX + localY >= cut
      && farX + localY >= cut
      && localX + farY >= cut
      && farX + farY >= cut;
  }
  if (room.shape === "cross") {
    const verticalInset = Math.max(2, Math.floor(room.width * 0.28));
    const horizontalInset = Math.max(2, Math.floor(room.height * 0.28));
    return (localX >= verticalInset && farX >= verticalInset)
      || (localY >= horizontalInset && farY >= horizontalInset);
  }

  const normalizedX = (localX + 0.5 - room.width / 2) / (room.width / 2);
  const normalizedY = (localY + 0.5 - room.height / 2) / (room.height / 2);
  const edgeNoise = (((x * 31 + y * 17 + room.id * 13) >>> 0) % 11) / 100;
  return normalizedX * normalizedX + normalizedY * normalizedY <= 0.92 + edgeNoise;
}

function carveRoom(tiles: TileValue[], room: DungeonRoom): void {
  for (let y = room.y; y < room.y + room.height; y += 1) {
    for (let x = room.x; x < room.x + room.width; x += 1) {
      if (roomShapeContains(room, x, y)) carve(tiles, x, y);
    }
  }
  for (let y = room.centerY - 2; y <= room.centerY + 2; y += 1) {
    for (let x = room.centerX - 2; x <= room.centerX + 2; x += 1) carve(tiles, x, y);
  }
}

function addRoomObstacles(tiles: TileValue[], room: DungeonRoom, random: SeededRandom): void {
  if (room.isStart || room.isBoss || room.id % 2 !== 0) return;
  const formations = room.id % 4 === 0 ? 2 : 1;
  let placed = 0;
  for (let attempt = 0; attempt < 18 && placed < formations; attempt += 1) {
    const x = room.x + random.integer(2, Math.max(2, room.width - 3));
    const y = room.y + random.integer(2, Math.max(2, room.height - 3));
    if (Math.abs(x - room.centerX) <= 2 && Math.abs(y - room.centerY) <= 2) continue;
    const horizontal = random.next() > 0.5;
    const length = 2;
    const cells = Array.from({ length }, (_, index) => ({
      x: x + (horizontal ? index : 0),
      y: y + (horizontal ? 0 : index),
    }));
    if (!cells.every((cell) => tiles[tileIndex(cell.x, cell.y)] === 1)) continue;
    for (const cell of cells) tiles[tileIndex(cell.x, cell.y)] = 2;
    placed += 1;
  }
}

function carveHorizontal(tiles: TileValue[], fromX: number, toX: number, y: number): void {
  const start = Math.min(fromX, toX);
  const end = Math.max(fromX, toX);
  for (let x = start; x <= end; x += 1) {
    carve(tiles, x, y - 1);
    carve(tiles, x, y);
    carve(tiles, x, y + 1);
  }
}

function carveVertical(tiles: TileValue[], fromY: number, toY: number, x: number): void {
  const start = Math.min(fromY, toY);
  const end = Math.max(fromY, toY);
  for (let y = start; y <= end; y += 1) {
    carve(tiles, x - 1, y);
    carve(tiles, x, y);
    carve(tiles, x + 1, y);
  }
}

function connectRooms(
  tiles: TileValue[],
  first: DungeonRoom,
  second: DungeonRoom,
  horizontalFirst: boolean,
): void {
  if (horizontalFirst) {
    carveHorizontal(tiles, first.centerX, second.centerX, first.centerY);
    carveVertical(tiles, first.centerY, second.centerY, second.centerX);
  } else {
    carveVertical(tiles, first.centerY, second.centerY, first.centerX);
    carveHorizontal(tiles, first.centerX, second.centerX, second.centerY);
  }
}

function roomId(gridX: number, gridY: number): number {
  return gridY * GRID_COLUMNS + gridX;
}

function pruneDisconnectedTerrain(tiles: TileValue[], startX: number, startY: number): void {
  const start = tileIndex(startX, startY);
  const reachable = new Set<number>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const index = queue.shift()!;
    const x = index % MAP_WIDTH;
    const y = Math.floor(index / MAP_WIDTH);
    for (const [nextX, nextY] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nextX <= 0 || nextY <= 0 || nextX >= MAP_WIDTH - 1 || nextY >= MAP_HEIGHT - 1) continue;
      const nextIndex = tileIndex(nextX, nextY);
      if (tiles[nextIndex] !== 1 || reachable.has(nextIndex)) continue;
      reachable.add(nextIndex);
      queue.push(nextIndex);
    }
  }
  for (let index = 0; index < tiles.length; index += 1) {
    if (tiles[index] === 1 && !reachable.has(index)) tiles[index] = 0;
  }
  for (let y = 1; y < MAP_HEIGHT - 1; y += 1) {
    for (let x = 1; x < MAP_WIDTH - 1; x += 1) {
      const index = tileIndex(x, y);
      if (tiles[index] !== 2) continue;
      const touchesFloor = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]
        .some(([nextX, nextY]) => tiles[tileIndex(nextX, nextY)] === 1);
      if (!touchesFloor) tiles[index] = 0;
    }
  }
}

export function generateDungeon(): DungeonData {
  const random = new SeededRandom(CANONICAL_DUNGEON_SEED);
  const tiles = new Array<TileValue>(MAP_WIDTH * MAP_HEIGHT).fill(0);
  const rooms: DungeonRoom[] = [];

  for (let gridY = 0; gridY < GRID_ROWS; gridY += 1) {
    for (let gridX = 0; gridX < GRID_COLUMNS; gridX += 1) {
      const isStart = gridX === 0 && gridY === GRID_ROWS - 1;
      const isBoss = gridX === GRID_COLUMNS - 1 && gridY === 0;
      const width = isBoss ? 18 : random.integer(11, 16);
      const height = isBoss ? 14 : random.integer(8, 13);
      const cellX = gridX * CELL_WIDTH;
      const cellY = gridY * CELL_HEIGHT;
      const maxOffsetX = Math.max(2, CELL_WIDTH - width - 2);
      const maxOffsetY = Math.max(2, CELL_HEIGHT - height - 2);
      const x = cellX + random.integer(2, maxOffsetX);
      const y = cellY + random.integer(2, maxOffsetY);
      const shapePool: DungeonRoomShape[] = ["rectangular", "chamfered", "cross", "cavern"];
      const shape = isBoss
        ? "arena"
        : isStart
          ? "chamfered"
          : shapePool[(roomId(gridX, gridY) + random.integer(0, shapePool.length - 1)) % shapePool.length];

      rooms.push({
        id: roomId(gridX, gridY),
        gridX,
        gridY,
        x,
        y,
        width,
        height,
        centerX: Math.floor(x + width / 2),
        centerY: Math.floor(y + height / 2),
        shape,
        isStart,
        isBoss,
      });
    }
  }

  rooms.forEach((room) => carveRoom(tiles, room));
  rooms.forEach((room) => addRoomObstacles(tiles, room, random));

  const connections: Array<[number, number]> = [];
  const connectionKeys = new Set<string>();
  const visited = new Set<number>();
  const startId = roomId(0, GRID_ROWS - 1);
  const stack = [startId];
  visited.add(startId);

  const addConnection = (firstId: number, secondId: number): void => {
    const key = [firstId, secondId].sort((a, b) => a - b).join(":");
    if (connectionKeys.has(key)) return;
    connectionKeys.add(key);
    connections.push([firstId, secondId]);
    connectRooms(tiles, rooms[firstId], rooms[secondId], random.next() > 0.5);
  };

  while (stack.length > 0) {
    const currentId = stack[stack.length - 1];
    const current = rooms[currentId];
    const candidates = random
      .shuffle([
        [current.gridX + 1, current.gridY],
        [current.gridX - 1, current.gridY],
        [current.gridX, current.gridY + 1],
        [current.gridX, current.gridY - 1],
      ])
      .filter(([x, y]) => x >= 0 && y >= 0 && x < GRID_COLUMNS && y < GRID_ROWS)
      .map(([x, y]) => roomId(x, y))
      .filter((id) => !visited.has(id));

    if (candidates.length === 0) {
      stack.pop();
      continue;
    }

    const nextId = candidates[0];
    visited.add(nextId);
    addConnection(currentId, nextId);
    stack.push(nextId);
  }

  const adjacentPairs: Array<[number, number]> = [];
  for (let gridY = 0; gridY < GRID_ROWS; gridY += 1) {
    for (let gridX = 0; gridX < GRID_COLUMNS; gridX += 1) {
      const currentId = roomId(gridX, gridY);
      if (gridX + 1 < GRID_COLUMNS) adjacentPairs.push([currentId, roomId(gridX + 1, gridY)]);
      if (gridY + 1 < GRID_ROWS) adjacentPairs.push([currentId, roomId(gridX, gridY + 1)]);
    }
  }

  random.shuffle(adjacentPairs);
  let extraConnections = 0;
  for (const [firstId, secondId] of adjacentPairs) {
    const key = [firstId, secondId].sort((a, b) => a - b).join(":");
    if (!connectionKeys.has(key)) {
      addConnection(firstId, secondId);
      extraConnections += 1;
      if (extraConnections >= 8) break;
    }
  }

  pruneDisconnectedTerrain(tiles, rooms[startId].centerX, rooms[startId].centerY);

  return {
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    tiles,
    rooms,
    startRoom: rooms[startId],
    bossRoom: rooms[roomId(GRID_COLUMNS - 1, 0)],
    connections,
  };
}


import type { DungeonData, DungeonRoom, TileValue } from "./types";

const MAP_WIDTH = 110;
const MAP_HEIGHT = 76;
const GRID_COLUMNS = 5;
const GRID_ROWS = 4;
const CELL_WIDTH = 22;
const CELL_HEIGHT = 19;

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

function carveRoom(tiles: TileValue[], room: DungeonRoom): void {
  for (let y = room.y; y < room.y + room.height; y += 1) {
    for (let x = room.x; x < room.x + room.width; x += 1) {
      carve(tiles, x, y);
    }
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

export function generateDungeon(seed = 20261119): DungeonData {
  const random = new SeededRandom(seed);
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
        isStart,
        isBoss,
      });
    }
  }

  rooms.forEach((room) => carveRoom(tiles, room));

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
      if (extraConnections >= 6) break;
    }
  }

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


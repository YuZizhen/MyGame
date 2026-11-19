export type TileValue = 0 | 1;

export interface DungeonRoom {
  id: number;
  gridX: number;
  gridY: number;
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  isStart: boolean;
  isBoss: boolean;
}

export interface DungeonData {
  width: number;
  height: number;
  tiles: TileValue[];
  rooms: DungeonRoom[];
  startRoom: DungeonRoom;
  bossRoom: DungeonRoom;
  connections: Array<[number, number]>;
}

export interface RuntimeMapState {
  width: number;
  height: number;
  tiles: TileValue[];
  explored: boolean[];
  playerTileX: number;
  playerTileY: number;
  bossTileX: number;
  bossTileY: number;
  bossDiscovered: boolean;
  bossActive: boolean;
  chests: MapChestMarker[];
  exitTileX?: number;
  exitTileY?: number;
}

export type ChestType = "supply" | "reliquary" | "hidden" | "boss";
export type LootRarity = "common" | "magic" | "rare";

export interface LootItem {
  id: string;
  templateId: string;
  name: string;
  width: number;
  height: number;
  rarity: LootRarity;
  value: number;
  icon: "gem" | "pouch" | "ring" | "blade" | "scroll" | "helm" | "axe" | "armor" | "relic";
}

export interface InventoryItem extends LootItem {
  x: number;
  y: number;
}

export interface MapChestMarker {
  id: string;
  tileX: number;
  tileY: number;
  discovered: boolean;
  opened: boolean;
  type: ChestType;
}

export interface LootUiState {
  open: boolean;
  chestId?: string;
  chestName?: string;
  chestItems: LootItem[];
  inventoryItems: InventoryItem[];
  inventoryColumns: number;
  inventoryRows: number;
}

export interface HudState {
  hp: number;
  maxHp: number;
  objective: string;
  roomsExplored: number;
  totalRooms: number;
  bossHp: number;
  bossMaxHp: number;
  bossActive: boolean;
  potions: number;
  rollReady: boolean;
  interactionPrompt: string;
  inventoryUsed: number;
  inventoryCapacity: number;
  state: "playing" | "won" | "lost";
}


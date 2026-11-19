import type { ExtractionMode, ItemIcon, ItemRarity, LoadoutState } from "../domain/loadout";

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
export type LootRarity = ItemRarity;

export interface LootItem {
  id: string;
  templateId: string;
  name: string;
  width: number;
  height: number;
  rarity: LootRarity;
  value: number;
  icon: ItemIcon;
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
  loadout?: LoadoutState;
}

export interface ExtractionPreview {
  mode: ExtractionMode;
  retainedItemCount: number;
  droppedItemCount: number;
  retainedValue: number;
  droppedValue: number;
  corruptionBefore: number;
  corruptionAfter: number;
}

export interface ExtractionUiState {
  open: boolean;
  normal?: ExtractionPreview;
  dropPack?: ExtractionPreview;
}

export interface ExtractionOutcomeUi extends ExtractionPreview {
  persisted: boolean;
  totalExtractedValue?: number;
}

export interface ProfileSummaryUi {
  warehouseItemCount: number;
  successfulExtractions: number;
  totalExtractedValue: number;
  status: "new" | "loaded" | "recovered" | "unavailable" | "unsupported";
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


import Phaser from "phaser";
import {
  ASSAULT_RIG,
  EXPEDITION_BACKPACK,
  autoPlaceItem,
  containerCapacity,
  containerUsedCells,
  createEmptyContainer,
  discardStoredItem,
  equipWeaponFromContainer,
  listContainerItems,
  moveStoredItem,
  moveStoredItemToPosition,
  rotateStoredItem,
  settleExtraction,
  unequipWeaponToBackpack,
  type ExtractionMode,
  type ExtractionResult,
  type ItemInstance,
  type LoadoutState,
  type StoredContainerSlot,
  type WeaponStats,
} from "../domain/loadout";
import {
  commitExtraction,
  createDefaultProfile,
  loadProfile,
  type PlayerProfile,
  type ProfileLoadStatus,
} from "../profile/profileStore";
import { generateDungeon } from "./DungeonGenerator";
import { generateChestLoot, lootRevealDuration } from "./LootSystem";
import type {
  ChestType,
  DungeonData,
  DungeonRoom,
  ExtractionOutcomeUi,
  ExtractionPreview,
  ExtractionUiState,
  HudState,
  LootItem,
  LootRarity,
  LootUiState,
  ProfileSummaryUi,
  RuntimeMapState,
} from "./types";

const TILE_SIZE = 64;
const PLAYER_SPEED = 180;
const PLAYER_MAX_HP = 100;
const DEFAULT_VISION_RADIUS = 8;
const BOSS_VISION_RADIUS = 13;
const STARTER_WEAPON_STATS: WeaponStats = { damage: 30, attackIntervalMs: 480, critChance: 0 };

type MobKind = "scavenger" | "stalker" | "brute" | "boss";

interface MobState {
  sprite: Phaser.Physics.Arcade.Sprite;
  kind: MobKind;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  attackRange: number;
  attackInterval: number;
  windup: number;
  nextAttackAt: number;
  windupEndsAt: number;
  dead: boolean;
  isBoss: boolean;
}

interface ChestState {
  id: string;
  type: ChestType;
  roomId: number;
  container: Phaser.GameObjects.Container;
  lid: Phaser.GameObjects.Graphics;
  lock: Phaser.GameObjects.Arc;
  glow: Phaser.GameObjects.Image;
  loot: LootItem[];
  revealedItemIds: Set<string>;
  opened: boolean;
  searchDuration: number;
}

interface LootItemSearchState {
  chestId: string;
  itemId: string;
  startedAt: number;
  duration: number;
}

interface ControlKeys {
  up: Phaser.Input.Keyboard.Key;
  left: Phaser.Input.Keyboard.Key;
  down: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
  attack: Phaser.Input.Keyboard.Key;
  roll: Phaser.Input.Keyboard.Key;
  interact: Phaser.Input.Keyboard.Key;
  restart: Phaser.Input.Keyboard.Key;
}

interface LoadoutItemPayload {
  source: StoredContainerSlot;
  itemId: string;
}

interface LoadoutDropPayload extends LoadoutItemPayload {
  target: StoredContainerSlot;
  pocketId: string;
  x: number;
  y: number;
}

export class GameScene extends Phaser.Scene {
  private dungeon!: DungeonData;
  private worldWidth = 0;
  private worldHeight = 0;
  private wallGroup!: Phaser.Physics.Arcade.StaticGroup;
  private chestBlockerGroup!: Phaser.Physics.Arcade.StaticGroup;
  private enemyGroup!: Phaser.Physics.Arcade.Group;
  private player!: Phaser.Physics.Arcade.Sprite;
  private playerShadow!: Phaser.GameObjects.Ellipse;
  private controls!: ControlKeys;
  private mobs: MobState[] = [];
  private chests: ChestState[] = [];
  private loadout!: LoadoutState;
  private runId = "";
  private boss!: MobState;
  private fogGraphics!: Phaser.GameObjects.Graphics;
  private mapState!: RuntimeMapState;
  private exploredRooms = new Set<number>();
  private hp = PLAYER_MAX_HP;
  private potions = 2;
  private facing = 0;
  private attackReadyAt = 0;
  private rollReadyAt = 0;
  private rollingUntil = 0;
  private rollDirection = new Phaser.Math.Vector2(1, 0);
  private invulnerableUntil = 0;
  private controlLockedUntil = 0;
  private lastFogUpdate = 0;
  private lastFogTileX = Number.NaN;
  private lastFogTileY = Number.NaN;
  private lastFogRadiusStep = Number.NaN;
  private lastHudUpdate = 0;
  private visionRadius = DEFAULT_VISION_RADIUS;
  private bossEncounterActive = false;
  private bossDefeated = false;
  private bossAttackCounter = 0;
  private bossBusyUntil = 0;
  private bossChargingUntil = 0;
  private bossChargeTarget = new Phaser.Math.Vector2();
  private bossChargeHit = false;
  private exitPortal?: Phaser.GameObjects.Arc;
  private exitRing?: Phaser.GameObjects.Arc;
  private searchGraphics!: Phaser.GameObjects.Graphics;
  private searchChest?: ChestState;
  private searchStartedAt = 0;
  private searchRequiresRelease = false;
  private nearbyChest?: ChestState;
  private lootPanelOpen = false;
  private extractionPanelOpen = false;
  private activeLootChest?: ChestState;
  private qaLootChest?: ChestState;
  private qaTakeFirstLoot = false;
  private qaMoveFirstToRig = false;
  private qaRotateFirstLoot = false;
  private qaDiscardFirstLoot = false;
  private qaOpenExtraction = false;
  private qaExtractionMode?: ExtractionMode;
  private pendingDiscard?: { itemId: string; expiresAt: number };
  private lootItemSearch?: LootItemSearchState;
  private lastLootSearchUiAt = 0;
  private loadoutDragActive = false;
  private returnedLootCounter = 0;
  private runState: "playing" | "won" | "lost" = "playing";
  private currentObjective = "探索灰烬地穴，寻找遗迹守门人";

  constructor() {
    super("GameScene");
  }

  create(): void {
    this.resetRuntimeState();
    this.createTextures();
    this.dungeon = generateDungeon();
    this.worldWidth = this.dungeon.width * TILE_SIZE;
    this.worldHeight = this.dungeon.height * TILE_SIZE;

    this.physics.world.setBounds(0, 0, this.worldWidth, this.worldHeight);
    this.cameras.main.setBounds(0, 0, this.worldWidth, this.worldHeight);
    this.cameras.main.setBackgroundColor("#080b0f");
    this.cameras.main.roundPixels = false;

    this.drawDungeon();
    this.createWalls();
    this.createPlayer();
    this.createEnemies();
    this.createChests();
    this.createFog();
    this.createControls();

    this.physics.add.collider(this.player, this.wallGroup);
    this.physics.add.collider(this.enemyGroup, this.wallGroup);
    this.physics.add.collider(this.player, this.enemyGroup);
    this.physics.add.collider(this.player, this.chestBlockerGroup);
    this.physics.add.collider(this.enemyGroup, this.chestBlockerGroup);
    this.physics.add.collider(this.enemyGroup, this.enemyGroup);

    this.cameras.main.setZoom(1);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    this.mapState = {
      revision: 0,
      width: this.dungeon.width,
      height: this.dungeon.height,
      tiles: this.dungeon.tiles,
      explored: new Array<boolean>(this.dungeon.tiles.length).fill(false),
      playerTileX: this.dungeon.startRoom.centerX,
      playerTileY: this.dungeon.startRoom.centerY,
      bossTileX: this.dungeon.bossRoom.centerX,
      bossTileY: this.dungeon.bossRoom.centerY,
      bossDiscovered: false,
      bossActive: false,
      chests: this.chests.map((chest) => ({
        id: chest.id,
        tileX: Math.floor(chest.container.x / TILE_SIZE),
        tileY: Math.floor(chest.container.y / TILE_SIZE),
        discovered: false,
        opened: false,
        type: chest.type,
      })),
    };
    this.registry.set("mapState", this.mapState);

    const qaMode = import.meta.env.DEV ? new URLSearchParams(window.location.search).get("qa") : null;
    if (
      qaMode === "boss" ||
      qaMode === "exit" ||
      qaMode === "extract" ||
      qaMode === "extract-normal" ||
      qaMode === "extract-drop"
    ) {
      this.player.setPosition(
        (this.dungeon.bossRoom.centerX + 0.5) * TILE_SIZE,
        (this.dungeon.bossRoom.centerY + 0.5) * TILE_SIZE + 260,
      );
      this.cameras.main.centerOn(this.player.x, this.player.y);
      if (qaMode === "exit" || qaMode?.startsWith("extract")) {
        this.damageMob(this.boss, this.boss.maxHp);
      }
    }
    if (
      (qaMode === "chest" || qaMode === "loot" || qaMode === "pickup" || qaMode === "rig" || qaMode === "rotate" || qaMode === "discard") &&
      this.chests[0]
    ) {
      const qaChest = this.chests[0];
      this.player.setPosition(qaChest.container.x - 92, qaChest.container.y + 18);
      this.cameras.main.centerOn(this.player.x, this.player.y);
      if (qaMode === "loot" || qaMode === "pickup" || qaMode === "rig" || qaMode === "rotate" || qaMode === "discard") {
        qaChest.opened = true;
        qaChest.lid.y = -17;
        qaChest.lid.scaleY = 0.58;
        this.qaLootChest = qaChest;
        this.qaTakeFirstLoot = qaMode !== "loot";
        this.qaMoveFirstToRig = qaMode === "rig";
        this.qaRotateFirstLoot = qaMode === "rotate";
        this.qaDiscardFirstLoot = qaMode === "discard";
      }
    }

    this.discoverRoom(this.dungeon.startRoom);
    this.updateFog(true);

    this.refreshProfileSummary();
    if (!this.scene.isActive("HudScene")) {
      this.scene.launch("HudScene");
    }
    this.game.events.emit("hud:reset");
    this.game.events.emit("hud:banner", "灰烬地穴\n找到并击败遗迹守门人");
    this.emitHudState();

    if (qaMode?.startsWith("extract")) {
      const bossChest = this.chests.find((chest) => chest.type === "boss");
      if (bossChest?.loot[0]) {
        bossChest.revealedItemIds.add(bossChest.loot[0].id);
        this.handleLootTake({ chestId: bossChest.id, itemId: bossChest.loot[0].id });
      }
      this.qaOpenExtraction = true;
      this.qaExtractionMode = qaMode === "extract-normal" ? "normal" : qaMode === "extract-drop" ? "drop_pack" : undefined;
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off(Phaser.Input.Events.POINTER_DOWN, this.handlePointerAttack, this);
      this.input.keyboard?.off("keydown", this.handlePanelKeyDown, this);
      this.game.events.off("input:inventory-toggle", this.handleInventoryShortcut, this);
      this.game.events.off("input:loot-close", this.handleLootCloseShortcut, this);
      this.game.events.off("loot:take", this.handleLootTake, this);
      this.game.events.off("loadout:item-action", this.handleLoadoutItemAction, this);
      this.game.events.off("loadout:item-drop", this.handleLoadoutItemDrop, this);
      this.game.events.off("loadout:drag-state", this.handleLoadoutDragState, this);
      this.game.events.off("loadout:item-rotate", this.handleLoadoutItemRotate, this);
      this.game.events.off("loadout:item-discard", this.handleLoadoutItemDiscard, this);
      this.game.events.off("extraction:choose", this.handleExtractionChoice, this);
    });
    this.game.events.on("loot:take", this.handleLootTake, this);
    this.game.events.on("input:loot-close", this.handleLootCloseShortcut, this);
    this.game.events.on("loadout:item-action", this.handleLoadoutItemAction, this);
    this.game.events.on("loadout:item-drop", this.handleLoadoutItemDrop, this);
    this.game.events.on("loadout:drag-state", this.handleLoadoutDragState, this);
    this.game.events.on("loadout:item-rotate", this.handleLoadoutItemRotate, this);
    this.game.events.on("loadout:item-discard", this.handleLoadoutItemDiscard, this);
    this.game.events.on("extraction:choose", this.handleExtractionChoice, this);
  }

  update(time: number): void {
    if (this.runState !== "playing") {
      this.player.setVelocity(0, 0);
      if (Phaser.Input.Keyboard.JustDown(this.controls.restart)) this.scene.restart();
      return;
    }

    if (this.qaOpenExtraction && this.scene.isActive("HudScene")) {
      this.qaOpenExtraction = false;
      this.openExtractionPanel();
      if (this.qaExtractionMode) {
        const mode = this.qaExtractionMode;
        this.qaExtractionMode = undefined;
        this.handleExtractionChoice(mode);
      }
    }

    if (this.extractionPanelOpen) {
      this.player.setVelocity(0, 0);
      this.mobs.forEach((mob) => mob.sprite.setVelocity(0, 0));
      return;
    }

    if (this.qaLootChest && this.scene.isActive("HudScene")) {
      const chest = this.qaLootChest;
      this.qaLootChest = undefined;
      this.openChestPanel(chest);
      if (this.qaTakeFirstLoot && chest.loot[0]) {
        chest.revealedItemIds.add(chest.loot[0].id);
        const itemId = `${this.runId}:${chest.loot[0].id}`;
        this.qaTakeFirstLoot = false;
        this.handleLootTake({ chestId: chest.id, itemId: chest.loot[0].id });
        if (this.qaMoveFirstToRig) {
          this.qaMoveFirstToRig = false;
          this.handleLoadoutItemAction({ source: "backpack", itemId });
        }
        if (this.qaRotateFirstLoot) {
          this.qaRotateFirstLoot = false;
          this.handleLoadoutItemRotate({ source: "backpack", itemId });
        }
        if (this.qaDiscardFirstLoot) {
          this.qaDiscardFirstLoot = false;
          const payload = { source: "backpack" as const, itemId };
          this.handleLoadoutItemDiscard(payload);
          this.handleLoadoutItemDiscard(payload);
        }
      }
    }

    if (this.lootPanelOpen) {
      this.player.setVelocity(0, 0);
      this.mobs.forEach((mob) => mob.sprite.setVelocity(0, 0));
      this.updateLootItemSearch(time);
      if (time - this.lastHudUpdate >= 100) {
        this.lastHudUpdate = time;
        this.emitHudState();
      }
      return;
    }

    this.updateFacing();
    const searchingChest = this.updateChestSearch(time);
    if (searchingChest) {
      this.player.setVelocity(0, 0);
    } else {
      this.updatePlayer(time);
    }
    this.updateEnemies(time);
    this.checkRoomDiscovery();
    this.checkBossTrigger();
    this.updateBossCamera();

    if (time - this.lastFogUpdate >= 130) {
      this.lastFogUpdate = time;
      this.updateFog(false);
    }

    if (time - this.lastHudUpdate >= 100) {
      this.lastHudUpdate = time;
      this.emitHudState();
    }
  }

  private resetRuntimeState(): void {
    this.mobs = [];
    this.chests = [];
    this.runId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.loadout = {
      weapon: {
        id: `${this.runId}:starter_sword`,
        definitionId: "starter_sword",
        name: "铁誓长剑",
        width: 1,
        height: 3,
        tags: ["weapon"],
        value: 0,
        corruption: 0,
        rarity: "common",
        icon: "blade",
        weaponStats: { ...STARTER_WEAPON_STATS },
      },
      rig: createEmptyContainer(ASSAULT_RIG, "equipped_assault_rig"),
      backpack: createEmptyContainer(EXPEDITION_BACKPACK, "equipped_expedition_backpack"),
    };
    this.exploredRooms = new Set<number>();
    this.hp = PLAYER_MAX_HP;
    this.potions = 2;
    this.facing = 0;
    this.attackReadyAt = 0;
    this.rollReadyAt = 0;
    this.rollingUntil = 0;
    this.invulnerableUntil = 0;
    this.controlLockedUntil = 0;
    this.lastFogUpdate = 0;
    this.lastFogTileX = Number.NaN;
    this.lastFogTileY = Number.NaN;
    this.lastFogRadiusStep = Number.NaN;
    this.lastHudUpdate = 0;
    this.visionRadius = DEFAULT_VISION_RADIUS;
    this.bossEncounterActive = false;
    this.bossDefeated = false;
    this.bossAttackCounter = 0;
    this.bossBusyUntil = 0;
    this.bossChargingUntil = 0;
    this.bossChargeHit = false;
    this.exitPortal = undefined;
    this.exitRing = undefined;
    this.searchChest = undefined;
    this.searchStartedAt = 0;
    this.searchRequiresRelease = false;
    this.nearbyChest = undefined;
    this.lootPanelOpen = false;
    this.registry.set("lootPanelOpen", false);
    this.extractionPanelOpen = false;
    this.activeLootChest = undefined;
    this.qaLootChest = undefined;
    this.qaTakeFirstLoot = false;
    this.qaMoveFirstToRig = false;
    this.qaRotateFirstLoot = false;
    this.qaDiscardFirstLoot = false;
    this.qaOpenExtraction = false;
    this.qaExtractionMode = undefined;
    this.pendingDiscard = undefined;
    this.lootItemSearch = undefined;
    this.lastLootSearchUiAt = 0;
    this.loadoutDragActive = false;
    this.returnedLootCounter = 0;
    this.runState = "playing";
    this.currentObjective = "探索灰烬地穴，寻找遗迹守门人";
  }

  private createTextures(): void {
    if (this.textures.exists("solid")) return;

    const graphics = this.add.graphics();
    graphics.fillStyle(0xffffff).fillRect(0, 0, 2, 2);
    graphics.generateTexture("solid", 2, 2);
    graphics.clear();

    const glowTexture = this.textures.createCanvas("soft_glow", 160, 160);
    if (!glowTexture) throw new Error("Unable to create glow texture");
    const glowContext = glowTexture.context;
    const glowGradient = glowContext.createRadialGradient(80, 80, 0, 80, 80, 80);
    glowGradient.addColorStop(0, "rgba(255, 190, 100, 0.72)");
    glowGradient.addColorStop(0.35, "rgba(227, 139, 54, 0.24)");
    glowGradient.addColorStop(1, "rgba(227, 139, 54, 0)");
    glowContext.fillStyle = glowGradient;
    glowContext.fillRect(0, 0, 160, 160);
    glowTexture.refresh();

    graphics.fillStyle(0x18212b);
    graphics.fillPoints(
      [
        new Phaser.Geom.Point(18, 18),
        new Phaser.Geom.Point(42, 14),
        new Phaser.Geom.Point(54, 36),
        new Phaser.Geom.Point(42, 58),
        new Phaser.Geom.Point(18, 54),
        new Phaser.Geom.Point(10, 36),
      ],
      true,
    );
    graphics.fillStyle(0x89939a).fillCircle(37, 26, 10);
    graphics.fillStyle(0x544a42).fillCircle(31, 37, 11);
    graphics.fillStyle(0xced6d8).fillRect(43, 33, 27, 6);
    graphics.fillTriangle(70, 30, 80, 36, 70, 42);
    graphics.fillStyle(0xe38b36).fillRect(40, 23, 10, 3);
    graphics.fillStyle(0x28201a).fillRect(42, 31, 7, 10);
    graphics.generateTexture("player", 82, 72);
    graphics.clear();

    graphics.fillStyle(0x2f493f).fillCircle(26, 26, 21);
    graphics.fillStyle(0x18251f).fillTriangle(10, 16, 18, 2, 24, 18);
    graphics.fillTriangle(30, 18, 38, 2, 44, 17);
    graphics.fillStyle(0xd05c45).fillCircle(34, 22, 4);
    graphics.fillStyle(0xe7d0a3).fillRect(37, 28, 15, 4);
    graphics.generateTexture("scavenger", 56, 52);
    graphics.clear();

    graphics.fillStyle(0x5c3640).fillCircle(29, 29, 25);
    graphics.fillStyle(0x2a1820).fillTriangle(8, 20, 22, 2, 28, 23);
    graphics.fillStyle(0xf28b58).fillCircle(39, 23, 5);
    graphics.fillStyle(0x8e5964).fillRect(30, 37, 29, 7);
    graphics.generateTexture("stalker", 64, 58);
    graphics.clear();

    graphics.fillStyle(0x454b4d).fillCircle(39, 39, 34);
    graphics.fillStyle(0x24292b).fillRect(12, 29, 54, 24);
    graphics.fillStyle(0x9aa3a6).fillRect(47, 34, 27, 10);
    graphics.fillStyle(0xd98632).fillCircle(48, 29, 6);
    graphics.generateTexture("brute", 80, 78);
    graphics.clear();

    graphics.fillStyle(0x1b2023);
    graphics.fillPoints(
      [
        new Phaser.Geom.Point(80, 6),
        new Phaser.Geom.Point(132, 28),
        new Phaser.Geom.Point(154, 80),
        new Phaser.Geom.Point(132, 132),
        new Phaser.Geom.Point(80, 154),
        new Phaser.Geom.Point(28, 132),
        new Phaser.Geom.Point(6, 80),
        new Phaser.Geom.Point(28, 28),
      ],
      true,
    );
    graphics.lineStyle(8, 0x596267, 1).strokeCircle(80, 80, 52);
    graphics.fillStyle(0x30383c).fillRect(4, 53, 42, 54);
    graphics.fillRect(114, 53, 42, 54);
    graphics.fillStyle(0x36b7a2).fillCircle(80, 80, 22);
    graphics.fillStyle(0xb9eee4).fillCircle(74, 73, 7);
    graphics.generateTexture("boss", 160, 160);
    graphics.destroy();
  }

  private drawDungeon(): void {
    const graphics = this.add.graphics().setDepth(-1000);
    graphics.fillStyle(0x05080b).fillRect(0, 0, this.worldWidth, this.worldHeight);

    // 连续铺地，逻辑网格不再直接显示为方形地砖。
    graphics.fillStyle(0x242a2d);
    for (let y = 0; y < this.dungeon.height; y += 1) {
      let runStart = -1;
      for (let x = 0; x <= this.dungeon.width; x += 1) {
        const isFloor = x < this.dungeon.width && this.dungeon.tiles[y * this.dungeon.width + x] === 1;
        if (isFloor && runStart === -1) runStart = x;
        if ((!isFloor || x === this.dungeon.width) && runStart !== -1) {
          graphics.fillRect(runStart * TILE_SIZE, y * TILE_SIZE, (x - runStart) * TILE_SIZE + 1, TILE_SIZE + 1);
          runStart = -1;
        }
      }
    }

    // 房间级磨损、灰尘与长裂缝，避免重复的小方格纹理。
    for (const room of this.dungeon.rooms) {
      const left = room.x * TILE_SIZE;
      const top = room.y * TILE_SIZE;
      const width = room.width * TILE_SIZE;
      const height = room.height * TILE_SIZE;
      const centerX = (room.centerX + 0.5) * TILE_SIZE;
      const centerY = (room.centerY + 0.5) * TILE_SIZE;

      graphics.fillStyle(room.id % 3 === 0 ? 0x343b3e : 0x1e2427, 0.12);
      graphics.fillEllipse(
        centerX + ((room.id * 37) % 120) - 60,
        centerY + ((room.id * 53) % 100) - 50,
        Math.min(width * 0.58, 460),
        Math.min(height * 0.42, 300),
      );
      graphics.fillStyle(0x12171a, 0.2);
      graphics.fillEllipse(left + width * 0.28, top + height * 0.7, 110 + (room.id % 4) * 24, 52 + (room.id % 3) * 16);

      for (let crack = 0; crack < 2 + (room.id % 3); crack += 1) {
        const startX = left + 70 + ((room.id * 97 + crack * 149) % Math.max(100, width - 140));
        const startY = top + 70 + ((room.id * 71 + crack * 113) % Math.max(100, height - 140));
        graphics.lineStyle(2 + (crack % 2), 0x0e1316, 0.44);
        graphics.beginPath();
        graphics.moveTo(startX, startY);
        graphics.lineTo(startX + 34, startY + 15);
        graphics.lineTo(startX + 63, startY + 54);
        graphics.lineTo(startX + 96, startY + 66);
        graphics.strokePath();
        graphics.lineStyle(1, 0x4b5559, 0.14);
        graphics.beginPath().moveTo(startX + 35, startY + 16).lineTo(startX + 21, startY + 45).strokePath();
      }

      if (room.id % 3 === 1 && !room.isBoss) {
        const glow = this.add
          .image(left + 76, top + 76, "soft_glow")
          .setTint(0xd98632)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setAlpha(0.11)
          .setScale(1.15)
          .setDepth(-850);
        this.tweens.add({ targets: glow, alpha: 0.17, scale: 1.22, duration: 1700 + room.id * 23, yoyo: true, repeat: -1 });
      }
    }

    const isFloor = (x: number, y: number): boolean =>
      x >= 0 && y >= 0 && x < this.dungeon.width && y < this.dungeon.height && this.dungeon.tiles[y * this.dungeon.width + x] === 1;

    // 墙脚环境遮蔽、墙面和墙顶高光，让可行走区域拥有明确厚度。
    for (let y = 0; y < this.dungeon.height; y += 1) {
      for (let x = 0; x < this.dungeon.width; x += 1) {
        if (!isFloor(x, y)) continue;
        const pixelX = x * TILE_SIZE;
        const pixelY = y * TILE_SIZE;
        if (!isFloor(x, y - 1)) {
          graphics.fillStyle(0x06090b, 0.62).fillRect(pixelX, pixelY, TILE_SIZE, 18);
          graphics.fillStyle(0x22292e, 1).fillRect(pixelX, pixelY - 28, TILE_SIZE, 28);
          graphics.fillStyle(0x3a4247, 1).fillRect(pixelX, pixelY - 40, TILE_SIZE, 13);
          graphics.lineStyle(3, 0x69747a, 0.62).beginPath().moveTo(pixelX + 4, pixelY - 39).lineTo(pixelX + 48, pixelY - 39).strokePath();
          if ((x * 7 + y * 11) % 3 === 0) {
            graphics.lineStyle(2, 0x11171a, 0.8).beginPath().moveTo(pixelX + 25, pixelY - 35).lineTo(pixelX + 20, pixelY - 28).strokePath();
          }
        }
        if (!isFloor(x, y + 1)) {
          graphics.fillStyle(0x06090b, 0.5).fillRect(pixelX, pixelY + TILE_SIZE - 15, TILE_SIZE, 15);
          graphics.lineStyle(8, 0x171d21, 0.9).beginPath().moveTo(pixelX, pixelY + TILE_SIZE).lineTo(pixelX + TILE_SIZE, pixelY + TILE_SIZE).strokePath();
          graphics.lineStyle(3, 0x465057, 0.45).beginPath().moveTo(pixelX + 5, pixelY + TILE_SIZE - 4).lineTo(pixelX + 55, pixelY + TILE_SIZE - 4).strokePath();
        }
        if (!isFloor(x - 1, y)) {
          graphics.fillStyle(0x06090b, 0.48).fillRect(pixelX, pixelY, 16, TILE_SIZE);
          graphics.lineStyle(8, 0x20272b, 0.95).beginPath().moveTo(pixelX, pixelY).lineTo(pixelX, pixelY + TILE_SIZE).strokePath();
          graphics.lineStyle(3, 0x566167, 0.4).beginPath().moveTo(pixelX + 4, pixelY + 7).lineTo(pixelX + 4, pixelY + 53).strokePath();
        }
        if (!isFloor(x + 1, y)) {
          graphics.fillStyle(0x06090b, 0.55).fillRect(pixelX + TILE_SIZE - 16, pixelY, 16, TILE_SIZE);
          graphics.lineStyle(8, 0x171d21, 0.95).beginPath().moveTo(pixelX + TILE_SIZE, pixelY).lineTo(pixelX + TILE_SIZE, pixelY + TILE_SIZE).strokePath();
        }
      }
    }

    for (const room of this.dungeon.rooms) this.drawRoomDoorways(graphics, room, isFloor);

    for (const room of this.dungeon.rooms) {
      if (!room.isBoss) continue;
      const centerX = (room.centerX + 0.5) * TILE_SIZE;
      const centerY = (room.centerY + 0.5) * TILE_SIZE;
      graphics.lineStyle(12, 0x334047, 0.8).strokeCircle(centerX, centerY, 360);
      graphics.lineStyle(4, 0x36b7a2, 0.42).strokeCircle(centerX, centerY, 250);
      for (let index = 0; index < 8; index += 1) {
        const angle = (index / 8) * Math.PI * 2;
        graphics.fillStyle(0x36b7a2, 0.45);
        graphics.fillCircle(centerX + Math.cos(angle) * 300, centerY + Math.sin(angle) * 300, 10);
      }
    }
  }

  private drawRoomDoorways(
    graphics: Phaser.GameObjects.Graphics,
    room: DungeonRoom,
    isFloor: (x: number, y: number) => boolean,
  ): void {
    const doorways: Array<{ x: number; y: number; horizontal: boolean }> = [];
    for (let x = room.x + 1; x < room.x + room.width - 1; x += 1) {
      if (isFloor(x, room.y - 1) && !isFloor(x - 1, room.y - 1)) doorways.push({ x: (x + 1) * TILE_SIZE, y: room.y * TILE_SIZE, horizontal: true });
      const bottomY = room.y + room.height;
      if (isFloor(x, bottomY) && !isFloor(x - 1, bottomY)) doorways.push({ x: (x + 1) * TILE_SIZE, y: bottomY * TILE_SIZE, horizontal: true });
    }
    for (let y = room.y + 1; y < room.y + room.height - 1; y += 1) {
      if (isFloor(room.x - 1, y) && !isFloor(room.x - 1, y - 1)) doorways.push({ x: room.x * TILE_SIZE, y: (y + 1) * TILE_SIZE, horizontal: false });
      const rightX = room.x + room.width;
      if (isFloor(rightX, y) && !isFloor(rightX, y - 1)) doorways.push({ x: rightX * TILE_SIZE, y: (y + 1) * TILE_SIZE, horizontal: false });
    }

    for (const doorway of doorways) {
      const bossDoor = room.isBoss;
      const accent = bossDoor ? 0x45c4b1 : 0xd98632;
      if (doorway.horizontal) {
        graphics.fillStyle(0x11171a, 0.72).fillRect(doorway.x - 95, doorway.y - 18, 190, 36);
        graphics.fillStyle(0x465057, 0.95).fillRoundedRect(doorway.x - 82, doorway.y - 8, 164, 16, 5);
        graphics.fillStyle(accent, bossDoor ? 0.8 : 0.46).fillCircle(doorway.x - 86, doorway.y, bossDoor ? 9 : 6);
        graphics.fillCircle(doorway.x + 86, doorway.y, bossDoor ? 9 : 6);
      } else {
        graphics.fillStyle(0x11171a, 0.72).fillRect(doorway.x - 18, doorway.y - 95, 36, 190);
        graphics.fillStyle(0x465057, 0.95).fillRoundedRect(doorway.x - 8, doorway.y - 82, 16, 164, 5);
        graphics.fillStyle(accent, bossDoor ? 0.8 : 0.46).fillCircle(doorway.x, doorway.y - 86, bossDoor ? 9 : 6);
        graphics.fillCircle(doorway.x, doorway.y + 86, bossDoor ? 9 : 6);
      }
    }
  }

  private createWalls(): void {
    this.wallGroup = this.physics.add.staticGroup();
    for (let y = 0; y < this.dungeon.height; y += 1) {
      let runStart = -1;
      for (let x = 0; x <= this.dungeon.width; x += 1) {
        const isWall = x < this.dungeon.width && this.dungeon.tiles[y * this.dungeon.width + x] === 0;
        if (isWall && runStart === -1) runStart = x;
        if ((!isWall || x === this.dungeon.width) && runStart !== -1) {
          const runLength = x - runStart;
          const wall = this.wallGroup
            .create((runStart + runLength / 2) * TILE_SIZE, (y + 0.5) * TILE_SIZE, "solid")
            .setVisible(false)
            .setDisplaySize(runLength * TILE_SIZE, TILE_SIZE);
          wall.refreshBody();
          runStart = -1;
        }
      }
    }
  }

  private createPlayer(): void {
    const startX = (this.dungeon.startRoom.centerX + 0.5) * TILE_SIZE;
    const startY = (this.dungeon.startRoom.centerY + 0.5) * TILE_SIZE;
    this.playerShadow = this.add.ellipse(startX, startY + 20, 54, 24, 0x050709, 0.55).setDepth(5);
    this.player = this.physics.add.sprite(startX, startY, "player").setDepth(6);
    this.player.setCircle(18, 23, 18).setCollideWorldBounds(true);
  }

  private createEnemies(): void {
    this.enemyGroup = this.physics.add.group();

    for (const room of this.dungeon.rooms) {
      if (room.isStart || room.isBoss) continue;
      const count = 2 + ((room.id * 5 + room.gridY) % 3);
      for (let index = 0; index < count; index += 1) {
        const kind: MobKind =
          room.id % 6 === 0 && index === 0
            ? "brute"
            : (room.id + index) % 4 === 0
              ? "stalker"
              : "scavenger";
        const tileX = room.x + 2 + ((room.id * 7 + index * 4) % Math.max(1, room.width - 4));
        const tileY = room.y + 2 + ((room.id * 3 + index * 5) % Math.max(1, room.height - 4));
        this.spawnMob(kind, (tileX + 0.5) * TILE_SIZE, (tileY + 0.5) * TILE_SIZE);
      }
    }

    const bossX = (this.dungeon.bossRoom.centerX + 0.5) * TILE_SIZE;
    const bossY = (this.dungeon.bossRoom.centerY + 0.5) * TILE_SIZE;
    this.boss = this.spawnMob("boss", bossX, bossY);
    this.boss.sprite.setAlpha(0.85);
  }

  private createChests(): void {
    this.chestBlockerGroup = this.physics.add.staticGroup();
    const candidateRooms = this.dungeon.rooms.filter((room) => !room.isStart && !room.isBoss);
    const selected = candidateRooms
      .map((room) => ({ room, score: (room.id * 47 + room.gridX * 19 + room.gridY * 31) % 101 }))
      .sort((first, second) => first.score - second.score)
      .slice(0, 15);

    selected.forEach(({ room }, index) => {
      const type: ChestType = index < 8 ? "supply" : index < 11 ? "reliquary" : "hidden";
      const offsetX = index % 2 === 0 ? -room.width * TILE_SIZE * 0.23 : room.width * TILE_SIZE * 0.23;
      const offsetY = ((index % 3) - 1) * TILE_SIZE * 1.2;
      const x = (room.centerX + 0.5) * TILE_SIZE + offsetX;
      const y = (room.centerY + 0.5) * TILE_SIZE + offsetY;
      this.chests.push(this.createChest(`chest_${room.id}`, type, room.id, x, y));
    });
  }

  private createChest(id: string, type: ChestType, roomId: number, x: number, y: number): ChestState {
    this.chestBlockerGroup
      .create(x, y + 10, "solid")
      .setDisplaySize(86, 52)
      .setAlpha(0)
      .refreshBody();
    const color = type === "hidden" ? 0x5c3d68 : type === "reliquary" || type === "boss" ? 0x513c28 : 0x4a2f24;
    const metal = type === "hidden" ? 0xa56de2 : type === "boss" ? 0xe9a646 : 0x7e8a8d;
    const glow = this.add
      .image(0, 0, "soft_glow")
      .setScale(type === "supply" ? 0.55 : 0.72)
      .setAlpha(type === "supply" ? 0.12 : 0.22)
      .setBlendMode(Phaser.BlendModes.ADD);
    const shadow = this.add.ellipse(5, 18, 82, 30, 0x030506, 0.62);

    const body = this.add.graphics();
    body.fillStyle(0x211713, 0.75).fillRoundedRect(-36, -4, 76, 42, 10);
    body.fillStyle(color, 1).fillRoundedRect(-34, -8, 68, 40, 8);
    body.fillStyle(type === "hidden" ? 0x76517d : 0x704735, 0.92).fillRoundedRect(-30, -4, 60, 29, 6);
    body.lineStyle(4, metal, 0.95).strokeRoundedRect(-34, -8, 68, 40, 8);
    body.lineStyle(2, 0xb8c0bf, 0.38).beginPath().moveTo(-27, 2).lineTo(27, 2).strokePath();
    body.lineStyle(2, 0xa06b4e, 0.35).beginPath().moveTo(-22, 12).lineTo(20, 12).strokePath();

    const lid = this.add.graphics();
    lid.fillStyle(0x120c0a, 0.8).fillRoundedRect(-38, -28, 76, 28, 12);
    lid.fillStyle(type === "hidden" ? 0x805985 : 0x805441, 1).fillRoundedRect(-35, -30, 70, 27, 12);
    lid.lineStyle(4, metal, 0.95).strokeRoundedRect(-35, -30, 70, 27, 12);
    lid.lineStyle(2, 0xd7dcdb, 0.3).beginPath().moveTo(-24, -25).lineTo(23, -25).strokePath();
    lid.fillStyle(metal, 0.78).fillRoundedRect(-5, -30, 10, 27, 3);

    const lock = this.add.circle(0, -2, 8, type === "hidden" ? 0x9a61d8 : 0xd49a3b, 1).setStrokeStyle(2, 0xffd071, 0.7);
    const container = this.add.container(x, y, [glow, shadow, body, lid, lock]).setDepth(y);
    this.tweens.add({
      targets: lock,
      alpha: 0.55,
      scale: 1.08,
      yoyo: true,
      repeat: -1,
      duration: 1150 + (roomId % 4) * 180,
      ease: "Sine.easeInOut",
    });

    const searchDuration = type === "hidden" ? 2800 : type === "reliquary" ? 2000 : type === "boss" ? 1800 : 1200;
    return {
      id,
      type,
      roomId,
      container,
      lid,
      lock,
      glow,
      loot: generateChestLoot(id, type, roomId * 73 + 19),
      revealedItemIds: new Set<string>(),
      opened: false,
      searchDuration,
    };
  }

  private updateChestSearch(time: number): boolean {
    if (!this.controls.interact.isDown) this.searchRequiresRelease = false;
    const nearest = this.findNearbyChest();
    if (nearest !== this.nearbyChest) {
      this.nearbyChest = nearest;
      if (nearest && !nearest.opened) this.game.events.emit("audio:event", "container.proximity.enter");
    }

    if (!nearest) {
      this.cancelChestSearch();
      return false;
    }

    if (nearest.opened) {
      if (!this.searchRequiresRelease && Phaser.Input.Keyboard.JustDown(this.controls.interact)) {
        this.openChestPanel(nearest);
        return true;
      }
      return false;
    }

    if (!this.controls.interact.isDown) {
      this.cancelChestSearch();
      return false;
    }
    if (this.searchRequiresRelease) return false;

    if (this.searchChest !== nearest) {
      this.cancelChestSearch();
      this.searchChest = nearest;
      this.searchStartedAt = time;
      const payload = { containerId: nearest.id };
      this.game.events.emit("audio:event", "container.search.start", payload);
      this.game.events.emit("audio:event", "container.search.loop.start", payload);
    }

    const progress = Phaser.Math.Clamp((time - this.searchStartedAt) / nearest.searchDuration, 0, 1);
    this.drawChestSearchProgress(nearest, progress);
    nearest.lid.y = -5 * progress;
    nearest.lid.rotation = -0.045 * Math.sin(progress * Math.PI * 4) * (1 - progress * 0.4);
    nearest.lock.setFillStyle(Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.ValueToColor(0xd49a3b),
      Phaser.Display.Color.ValueToColor(0xffd071),
      100,
      Math.round(progress * 100),
    ).color);
    nearest.glow.setAlpha(0.16 + progress * 0.36).setScale(0.6 + progress * 0.18);

    if (progress >= 1) {
      this.finishChestSearch(nearest);
      return true;
    }
    return true;
  }

  private findNearbyChest(): ChestState | undefined {
    let nearest: ChestState | undefined;
    let nearestDistance = 118;
    for (const chest of this.chests) {
      if (!chest.container.active || chest.loot.length === 0) continue;
      const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, chest.container.x, chest.container.y);
      if (distance < nearestDistance) {
        nearest = chest;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  private drawChestSearchProgress(chest: ChestState, progress: number): void {
    this.searchGraphics.clear();
    this.searchGraphics.fillStyle(0x080b0f, 0.82).fillCircle(chest.container.x, chest.container.y - 74, 26);
    this.searchGraphics.lineStyle(5, 0x293238, 0.9).strokeCircle(chest.container.x, chest.container.y - 74, 20);
    this.searchGraphics.lineStyle(5, 0xe9a646, 1);
    this.searchGraphics.beginPath();
    this.searchGraphics.arc(
      chest.container.x,
      chest.container.y - 74,
      20,
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * progress,
      false,
    );
    this.searchGraphics.strokePath();
  }

  private cancelChestSearch(): void {
    if (!this.searchChest) return;
    const payload = { containerId: this.searchChest.id };
    this.game.events.emit("audio:event", "container.search.loop.stop", payload);
    this.game.events.emit("audio:event", "container.search.cancel", payload);
    if (!this.searchChest.opened) {
      this.tweens.add({ targets: this.searchChest.lid, y: 0, rotation: 0, duration: 140 });
      this.tweens.add({ targets: this.searchChest.glow, alpha: 0.16, scale: 0.6, duration: 180 });
    }
    this.searchChest = undefined;
    this.searchStartedAt = 0;
    this.searchGraphics.clear();
  }

  private finishChestSearch(chest: ChestState): void {
    const audioPayload = { containerId: chest.id };
    this.game.events.emit("audio:event", "container.search.loop.stop", audioPayload);
    this.game.events.emit("audio:event", "container.search.complete", audioPayload);
    chest.opened = true;
    chest.lock.setAlpha(0.45).setFillStyle(0x666b6b);
    this.tweens.add({ targets: chest.lid, y: -17, scaleY: 0.58, rotation: -0.08, duration: 330, ease: "Back.easeOut" });
    this.tweens.add({ targets: chest.glow, alpha: 0.5, scale: 0.92, duration: 300, yoyo: true });
    this.spawnChestSparkles(chest);
    const marker = this.mapState.chests.find((entry) => entry.id === chest.id);
    if (marker) {
      marker.opened = true;
      this.markMapDirty();
    }
    this.game.events.emit("audio:event", "container.open", audioPayload);
    this.game.events.emit("hud:banner", `${this.chestName(chest.type)}已开启`);
    this.searchChest = undefined;
    this.searchStartedAt = 0;
    this.searchGraphics.clear();
    this.time.delayedCall(320, () => this.openChestPanel(chest));
  }

  private spawnChestSparkles(chest: ChestState): void {
    for (let index = 0; index < 6; index += 1) {
      const angle = -Math.PI + (index / 5) * Math.PI;
      const sparkle = this.add
        .rectangle(chest.container.x, chest.container.y - 18, 7, 7, chest.type === "hidden" ? 0xa56de2 : 0xffd071, 0.95)
        .setRotation(angle)
        .setDepth(chest.container.y + 2);
      this.tweens.add({
        targets: sparkle,
        x: chest.container.x + Math.cos(angle) * (38 + index * 5),
        y: chest.container.y - 48 - Math.sin(angle) * 22,
        alpha: 0,
        rotation: angle + Math.PI,
        duration: 460 + index * 35,
        onComplete: () => sparkle.destroy(),
      });
    }
  }

  private chestName(type: ChestType): string {
    return {
      supply: "破旧补给箱",
      reliquary: "封印战利箱",
      hidden: "隐藏宝藏箱",
      boss: "守门人宝库",
    }[type];
  }

  private canOpenLoadout(): boolean {
    return this.runState === "playing" && !this.bossEncounterActive;
  }

  private rejectLoadoutOpen(): void {
    this.game.events.emit("hud:banner", "首领交战中无法整理负载");
  }

  private openChestPanel(chest: ChestState): void {
    if (!this.canOpenLoadout()) {
      this.rejectLoadoutOpen();
      return;
    }
    this.lootPanelOpen = true;
    this.registry.set("lootPanelOpen", true);
    this.pendingDiscard = undefined;
    this.activeLootChest = chest;
    this.emitLootState();
    this.startNextLootItemSearch();
  }

  private openInventoryPanel(): void {
    if (!this.canOpenLoadout()) {
      this.rejectLoadoutOpen();
      return;
    }
    this.lootPanelOpen = true;
    this.registry.set("lootPanelOpen", true);
    this.pendingDiscard = undefined;
    this.activeLootChest = undefined;
    this.emitLootState();
  }

  private closeLootPanel(): void {
    this.cancelLootItemSearch();
    this.loadoutDragActive = false;
    this.lootPanelOpen = false;
    this.registry.set("lootPanelOpen", false);
    this.pendingDiscard = undefined;
    this.activeLootChest = undefined;
    this.game.events.emit("loot:state", {
      open: false,
      chestItems: [],
      loadout: this.loadout,
    } satisfies LootUiState);
  }

  private emitLootState(): void {
    const state: LootUiState = {
      open: this.lootPanelOpen,
      chestId: this.activeLootChest?.id,
      chestName: this.activeLootChest ? this.chestName(this.activeLootChest.type) : "行囊",
      chestItems: this.activeLootChest?.loot ?? [],
      revealedItemIds: this.activeLootChest ? [...this.activeLootChest.revealedItemIds] : undefined,
      searchingItemId: this.lootItemSearch?.itemId,
      searchProgress: this.lootItemSearch
        ? Phaser.Math.Clamp((this.time.now - this.lootItemSearch.startedAt) / this.lootItemSearch.duration, 0, 1)
        : undefined,
      loadout: this.loadout,
    };
    this.game.events.emit("loot:state", state);
  }

  private handleLootTake(payload: { chestId: string; itemId: string }): void {
    const chest = this.chests.find((entry) => entry.id === payload.chestId);
    const item = chest?.loot.find((entry) => entry.id === payload.itemId);
    if (!chest || !item) return;
    if (!chest.revealedItemIds.has(item.id)) {
      this.startLootItemSearch(chest, item);
      return;
    }
    if (!this.loadout.backpack) {
      this.showLoadoutMessage("当前未装备背包");
      return;
    }
    const itemInstance = this.toItemInstance(item);
    const placement = autoPlaceItem(this.loadout.backpack, itemInstance);
    if (!placement.ok) {
      this.showLoadoutMessage(`背包空间不足：需要 ${item.width}×${item.height}`);
      this.game.events.emit("audio:event", "loot.item.pickup_failed");
      return;
    }
    this.loadout = { ...this.loadout, backpack: placement.value };
    chest.loot = chest.loot.filter((entry) => entry.id !== item.id);
    chest.revealedItemIds.delete(item.id);
    this.game.events.emit("audio:event", "loot.item.pickup", { rarity: item.rarity });
    this.emitLootState();
    this.showLoadoutMessage(`已收取 ${item.name} · ${item.width}×${item.height}`);
    this.emitHudState();
  }

  private startLootItemSearch(chest: ChestState, item: LootItem): void {
    if (this.loadoutDragActive) {
      this.showLoadoutMessage("请先放下正在拖动的物品");
      return;
    }
    if (this.lootItemSearch?.chestId === chest.id && this.lootItemSearch.itemId === item.id) return;
    this.cancelLootItemSearch();
    this.lootItemSearch = {
      chestId: chest.id,
      itemId: item.id,
      startedAt: this.time.now,
      duration: lootRevealDuration(item.rarity),
    };
    this.lastLootSearchUiAt = 0;
    this.game.events.emit("audio:event", "loot.search.item.start", { containerId: chest.id });
    this.emitLootState();
  }

  private updateLootItemSearch(time: number): void {
    const search = this.lootItemSearch;
    if (!search) return;
    const chest = this.activeLootChest?.id === search.chestId ? this.activeLootChest : undefined;
    const item = chest?.loot.find((entry) => entry.id === search.itemId);
    if (!chest || !item) {
      this.cancelLootItemSearch();
      return;
    }
    if (time - search.startedAt >= search.duration) {
      chest.revealedItemIds.add(item.id);
      this.lootItemSearch = undefined;
      this.game.events.emit("audio:event", "loot.search.item.reveal", {
        containerId: chest.id,
        rarity: item.rarity,
      });
      this.spawnLootRevealEcho(chest, item.rarity);
      this.emitLootState();
      this.showLoadoutMessage(`发现 ${item.name} · ${item.width}×${item.height}`);
      this.time.delayedCall(220, () => this.startNextLootItemSearch());
      return;
    }
    if (time - this.lastLootSearchUiAt >= 80) {
      this.lastLootSearchUiAt = time;
      this.game.events.emit("loot:search-progress", {
        itemId: search.itemId,
        progress: Phaser.Math.Clamp((time - search.startedAt) / search.duration, 0, 1),
      });
    }
  }

  private startNextLootItemSearch(): void {
    if (!this.lootPanelOpen || this.lootItemSearch || this.loadoutDragActive) return;
    const chest = this.activeLootChest;
    const nextItem = chest?.loot.find((item) => !chest.revealedItemIds.has(item.id));
    if (chest && nextItem) this.startLootItemSearch(chest, nextItem);
  }

  private handleLoadoutDragState(active: boolean): void {
    this.loadoutDragActive = active;
    if (active) {
      this.cancelLootItemSearch();
      return;
    }
    this.startNextLootItemSearch();
  }

  private cancelLootItemSearch(): void {
    if (!this.lootItemSearch) return;
    this.game.events.emit("audio:event", "loot.search.item.cancel", {
      containerId: this.lootItemSearch.chestId,
    });
    this.lootItemSearch = undefined;
    this.lastLootSearchUiAt = 0;
  }

  private spawnLootRevealEcho(chest: ChestState, rarity: LootRarity): void {
    const color = { common: 0xb5bec1, magic: 0x4d9fdc, rare: 0xa56de2, red: 0xc84843 }[rarity];
    const height = { common: 18, magic: 28, rare: 42, red: 56 }[rarity];
    const glow = this.add.graphics().setDepth(chest.container.y + 3);
    glow.fillStyle(color, rarity === "common" ? 0.12 : 0.2);
    glow.fillEllipse(chest.container.x, chest.container.y - 18, 30, 10);
    glow.fillTriangle(
      chest.container.x - 11,
      chest.container.y - 18,
      chest.container.x + 11,
      chest.container.y - 18,
      chest.container.x,
      chest.container.y - 18 - height,
    );
    this.tweens.add({
      targets: glow,
      alpha: 0,
      y: -8,
      duration: rarity === "red" ? 650 : 420,
      ease: "Sine.easeOut",
      onComplete: () => glow.destroy(),
    });
  }

  private handleLoadoutItemAction(payload: {
    source: StoredContainerSlot | "weapon";
    itemId: string;
  }): void {
    if (!this.lootPanelOpen) return;
    const previousLoadout = this.loadout;
    let result: ReturnType<typeof unequipWeaponToBackpack>;
    let successMessage: string;

    if (payload.source === "weapon") {
      result = unequipWeaponToBackpack(this.loadout);
      successMessage = "武器已放入背包";
    } else {
      const sourceContainer = this.loadout[payload.source];
      const item = sourceContainer
        ? listContainerItems(sourceContainer).find((entry) => entry.id === payload.itemId)
        : undefined;
      if (!item) return;
      if (item.tags.includes("weapon")) {
        result = equipWeaponFromContainer(this.loadout, item.id, payload.source);
        successMessage = `已装备 ${item.name}`;
      } else {
        const target: StoredContainerSlot = payload.source === "backpack" ? "rig" : "backpack";
        result = moveStoredItem(this.loadout, item.id, payload.source, target);
        successMessage = `已将 ${item.name} 移入${target === "rig" ? "胸挂" : "背包"}`;
      }
    }

    if (!result.ok) {
      this.showLoadoutMessage(
        result.error === "weapon_required"
          ? "该物品不能装备为武器"
          : result.error === "container_missing"
            ? "缺少目标容器"
            : "目标口袋不兼容或空间不足",
      );
      this.game.events.emit("audio:event", "inventory.item.reject");
      return;
    }
    this.loadout = result.value;
    if (this.loadout === previousLoadout) return;
    this.pendingDiscard = undefined;
    this.game.events.emit("audio:event", "inventory.item.place");
    this.emitLootState();
    this.showLoadoutMessage(successMessage);
    this.emitHudState();
  }

  private handleLoadoutItemRotate(payload: LoadoutItemPayload): void {
    if (!this.lootPanelOpen) return;
    const sourceContainer = this.loadout[payload.source];
    const item = sourceContainer
      ? listContainerItems(sourceContainer).find((entry) => entry.id === payload.itemId)
      : undefined;
    if (!item) return;
    const result = rotateStoredItem(this.loadout, item.id, payload.source);
    if (!result.ok) {
      this.showLoadoutMessage(`${item.name} 在当前口袋无法旋转`);
      this.game.events.emit("audio:event", "inventory.item.reject");
      return;
    }
    this.loadout = result.value;
    this.pendingDiscard = undefined;
    this.game.events.emit("audio:event", "inventory.item.rotate");
    this.emitLootState();
    this.showLoadoutMessage(`已旋转 ${item.name}`);
  }

  private handleLoadoutItemDrop(payload: LoadoutDropPayload): void {
    if (!this.lootPanelOpen) return;
    const sourceContainer = this.loadout[payload.source];
    const item = sourceContainer
      ? listContainerItems(sourceContainer).find((entry) => entry.id === payload.itemId)
      : undefined;
    if (!item) return;

    const previousLoadout = this.loadout;
    const result = moveStoredItemToPosition(
      previousLoadout,
      item.id,
      payload.source,
      payload.target,
      payload.pocketId,
      payload.x,
      payload.y,
    );
    if (!result.ok) {
      const reason = result.error === "item_not_accepted"
        ? "目标口袋不接受该类物品"
        : result.error === "item_overlaps"
          ? "目标格位已有物品"
          : result.error === "item_outside_pocket"
            ? "物品超出口袋边界"
            : "无法放入目标格位";
      this.game.events.emit("audio:event", "inventory.item.reject");
      this.emitLootState();
      this.showLoadoutMessage(`${item.name}：${reason}`);
      return;
    }
    if (result.value === previousLoadout) return;

    this.loadout = result.value;
    this.pendingDiscard = undefined;
    this.game.events.emit("audio:event", "inventory.item.place");
    this.emitLootState();
    this.showLoadoutMessage(
      `已将 ${item.name} 放入${payload.target === "rig" ? "胸挂" : "背包"}指定格位`,
    );
    this.emitHudState();
  }

  private handleLoadoutItemDiscard(payload: LoadoutItemPayload): void {
    if (!this.lootPanelOpen) return;
    const sourceContainer = this.loadout[payload.source];
    const item = sourceContainer
      ? listContainerItems(sourceContainer).find((entry) => entry.id === payload.itemId)
      : undefined;
    if (!item) return;
    if (!this.activeLootChest) {
      this.showLoadoutMessage("仅在打开宝箱时可退回物品，避免永久遗失");
      return;
    }
    if (this.pendingDiscard?.itemId !== item.id || this.time.now > this.pendingDiscard.expiresAt) {
      this.pendingDiscard = { itemId: item.id, expiresAt: this.time.now + 2500 };
      this.showLoadoutMessage(`再次右键确认：将 ${item.name} 退回当前宝箱`);
      return;
    }

    const result = discardStoredItem(this.loadout, item.id, payload.source);
    if (!result.ok) {
      this.showLoadoutMessage("退回物品失败，负载未改变");
      return;
    }
    this.loadout = result.value.loadout;
    const returnedItem = this.toReturnedLootItem(result.value.item);
    this.activeLootChest.loot = [
      ...this.activeLootChest.loot,
      returnedItem,
    ];
    this.activeLootChest.revealedItemIds.add(returnedItem.id);
    this.pendingDiscard = undefined;
    this.game.events.emit("audio:event", "inventory.item.place");
    this.emitLootState();
    this.showLoadoutMessage(`已将 ${item.name} 退回宝箱`);
    this.emitHudState();
  }

  private toReturnedLootItem(item: ItemInstance): LootItem {
    this.returnedLootCounter += 1;
    return {
      id: `returned_${this.returnedLootCounter}`,
      instanceId: item.id,
      templateId: item.definitionId,
      name: item.name,
      width: item.width,
      height: item.height,
      rarity: item.rarity ?? "common",
      value: item.value,
      icon: item.icon ?? "pouch",
      tags: [...item.tags],
      weaponStats: item.weaponStats ? { ...item.weaponStats } : undefined,
    };
  }

  private showLoadoutMessage(message: string): void {
    this.game.events.emit("loot:message", message);
    this.game.events.emit("hud:banner", message);
  }

  private toItemInstance(item: LootItem): ItemInstance {
    const corruption = item.rarity === "red" ? 30 : item.rarity === "rare" ? 10 : item.rarity === "magic" ? 3 : 0;
    return {
      id: item.instanceId ?? `${this.runId}:${item.id}`,
      definitionId: item.templateId,
      name: item.name,
      width: item.width,
      height: item.height,
      tags: [...item.tags],
      value: item.value,
      corruption,
      rarity: item.rarity,
      icon: item.icon,
      weaponStats: item.weaponStats ? { ...item.weaponStats } : undefined,
    };
  }

  private spawnMob(kind: MobKind, x: number, y: number): MobState {
    const configuration = {
      scavenger: { hp: 45, speed: 112, damage: 9, range: 68, interval: 1250, windup: 350, scale: 1 },
      stalker: { hp: 34, speed: 145, damage: 7, range: 62, interval: 1000, windup: 240, scale: 1 },
      brute: { hp: 110, speed: 76, damage: 18, range: 90, interval: 2200, windup: 720, scale: 1 },
      boss: { hp: 900, speed: 82, damage: 20, range: 180, interval: 2500, windup: 650, scale: 1 },
    }[kind];

    const sprite = this.physics.add.sprite(x, y, kind).setScale(configuration.scale).setDepth(6);
    const radius = kind === "boss" ? 54 : kind === "brute" ? 25 : 18;
    const textureSize = kind === "boss" ? 160 : kind === "brute" ? 80 : kind === "stalker" ? 64 : 56;
    sprite.setCircle(radius, textureSize / 2 - radius, textureSize / 2 - radius);
    this.enemyGroup.add(sprite);

    const mob: MobState = {
      sprite,
      kind,
      hp: configuration.hp,
      maxHp: configuration.hp,
      speed: configuration.speed,
      damage: configuration.damage,
      attackRange: configuration.range,
      attackInterval: configuration.interval,
      windup: configuration.windup,
      nextAttackAt: 0,
      windupEndsAt: 0,
      dead: false,
      isBoss: kind === "boss",
    };
    this.mobs.push(mob);
    return mob;
  }

  private createFog(): void {
    this.fogGraphics = this.add.graphics().setDepth(5000);
    this.searchGraphics = this.add.graphics().setDepth(6100);
  }

  private createControls(): void {
    this.controls = this.input.keyboard!.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      attack: Phaser.Input.Keyboard.KeyCodes.SPACE,
      roll: Phaser.Input.Keyboard.KeyCodes.SHIFT,
      interact: Phaser.Input.Keyboard.KeyCodes.E,
      restart: Phaser.Input.Keyboard.KeyCodes.R,
    }) as ControlKeys;
    this.input.keyboard!.addCapture([
      Phaser.Input.Keyboard.KeyCodes.SPACE,
      Phaser.Input.Keyboard.KeyCodes.UP,
      Phaser.Input.Keyboard.KeyCodes.DOWN,
      Phaser.Input.Keyboard.KeyCodes.LEFT,
      Phaser.Input.Keyboard.KeyCodes.RIGHT,
    ]);
    this.input.keyboard!.on("keydown", this.handlePanelKeyDown, this);
    this.game.events.on("input:inventory-toggle", this.handleInventoryShortcut, this);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.handlePointerAttack, this);
  }

  private handleInventoryShortcut(): void {
    if (this.runState !== "playing" || this.extractionPanelOpen) return;
    if (this.lootPanelOpen) this.closeLootPanel();
    else this.openInventoryPanel();
  }

  private handleLootCloseShortcut(): void {
    if (!this.lootPanelOpen) return;
    this.searchRequiresRelease = true;
    this.closeLootPanel();
  }

  private handlePanelKeyDown(event: KeyboardEvent): void {
    if (event.repeat || this.runState !== "playing") return;
    if (this.extractionPanelOpen) {
      if (event.code === "Digit1" || event.code === "Numpad1") this.handleExtractionChoice("normal");
      else if (event.code === "Digit2" || event.code === "Numpad2") this.handleExtractionChoice("drop_pack");
      else if (event.code === "Escape") this.closeExtractionPanel();
      return;
    }
    if (!this.lootPanelOpen) return;
    if (event.code === "Escape" || event.code === "KeyE") {
      if (event.code === "KeyE") this.searchRequiresRelease = true;
      this.closeLootPanel();
      return;
    }
    const slotCodes = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5"];
    const numpadCodes = ["Numpad1", "Numpad2", "Numpad3", "Numpad4", "Numpad5"];
    const slotIndex = Math.max(slotCodes.indexOf(event.code), numpadCodes.indexOf(event.code));
    const slottedItem = slotIndex < 0 ? undefined : this.activeLootChest?.loot[slotIndex];
    if (slottedItem && this.activeLootChest) {
      this.handleLootTake({ chestId: this.activeLootChest.id, itemId: slottedItem.id });
    }
  }

  private updateFacing(): void {
    const pointer = this.input.activePointer;
    const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    if (Phaser.Math.Distance.Between(this.player.x, this.player.y, point.x, point.y) > 12) {
      this.facing = Phaser.Math.Angle.Between(this.player.x, this.player.y, point.x, point.y);
    }
    this.player.setRotation(this.facing);
  }

  private updatePlayer(time: number): void {
    this.playerShadow.setPosition(this.player.x, this.player.y + 20).setDepth(this.player.y - 1);
    this.player.setDepth(this.player.y);

    if (Phaser.Input.Keyboard.JustDown(this.controls.interact)) {
      if (this.tryExit()) return;
      if (!this.nearbyChest && this.potions > 0 && this.hp < PLAYER_MAX_HP) {
        this.potions -= 1;
        this.hp = Math.min(PLAYER_MAX_HP, this.hp + 35);
        this.showFloatingText(this.player.x, this.player.y - 48, "+35", "#62d48c");
      }
    }

    if (time < this.controlLockedUntil) {
      this.player.setVelocity(0, 0);
      return;
    }

    const input = new Phaser.Math.Vector2(
      Number(this.controls.right.isDown) - Number(this.controls.left.isDown),
      Number(this.controls.down.isDown) - Number(this.controls.up.isDown),
    );

    if (time < this.rollingUntil) {
      this.player.setVelocity(this.rollDirection.x * 460, this.rollDirection.y * 460);
      this.player.setAlpha(0.68 + Math.sin(time * 0.06) * 0.18);
      return;
    }

    this.player.setAlpha(1);
    if (Phaser.Input.Keyboard.JustDown(this.controls.roll) && time >= this.rollReadyAt) {
      this.rollDirection = input.lengthSq() > 0 ? input.normalize() : new Phaser.Math.Vector2(Math.cos(this.facing), Math.sin(this.facing));
      this.rollingUntil = time + 380;
      this.invulnerableUntil = time + 280;
      this.rollReadyAt = time + 3500;
      this.player.setVelocity(this.rollDirection.x * 460, this.rollDirection.y * 460);
      this.game.events.emit("audio:event", "player.dodge");
      return;
    }

    if (input.lengthSq() > 0) input.normalize();
    const attackSlowdown = time < this.attackReadyAt - this.currentWeaponStats().attackIntervalMs * 0.54 ? 0.45 : 1;
    this.player.setVelocity(input.x * PLAYER_SPEED * attackSlowdown, input.y * PLAYER_SPEED * attackSlowdown);

    if (Phaser.Input.Keyboard.JustDown(this.controls.attack)) this.performAttack(time);
  }

  private handlePointerAttack(pointer: Phaser.Input.Pointer): void {
    if (this.lootPanelOpen || this.extractionPanelOpen) return;
    if (pointer.leftButtonDown()) this.performAttack(this.time.now);
  }

  private performAttack(time: number): void {
    if (this.runState !== "playing" || time < this.attackReadyAt || time < this.controlLockedUntil) return;
    const weaponStats = this.currentWeaponStats();
    this.attackReadyAt = time + weaponStats.attackIntervalMs;
    this.game.events.emit("audio:event", "player.melee.swing");

    const range = 112;
    const halfArc = Phaser.Math.DegToRad(54);
    const slash = this.add.graphics().setDepth(this.player.y + 2);
    slash.fillStyle(0xf0c47c, 0.28);
    slash.slice(this.player.x, this.player.y, range, this.facing - halfArc, this.facing + halfArc, false);
    slash.fillPath();
    slash.lineStyle(4, 0xffdba0, 0.82);
    slash.beginPath();
    slash.arc(this.player.x, this.player.y, range, this.facing - halfArc, this.facing + halfArc, false);
    slash.strokePath();
    this.tweens.add({
      targets: slash,
      alpha: 0,
      duration: 180,
      ease: "Quad.easeOut",
      onComplete: () => slash.destroy(),
    });

    let hits = 0;
    for (const mob of this.mobs) {
      if (mob.dead || !mob.sprite.active || (mob.isBoss && !this.bossEncounterActive)) continue;
      const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, mob.sprite.x, mob.sprite.y);
      if (distance > range + (mob.isBoss ? 45 : 16)) continue;
      const targetAngle = Phaser.Math.Angle.Between(this.player.x, this.player.y, mob.sprite.x, mob.sprite.y);
      const difference = Math.abs(Phaser.Math.Angle.Wrap(targetAngle - this.facing));
      if (difference > halfArc) continue;
      const critical = Math.random() < weaponStats.critChance;
      const baseDamage = mob.isBoss ? weaponStats.damage * (5 / 6) : weaponStats.damage;
      this.damageMob(mob, Math.round(baseDamage * (critical ? 1.5 : 1)), critical);
      hits += 1;
    }

    if (hits > 0) {
      this.cameras.main.shake(70, 0.0025);
      this.game.events.emit("audio:event", "combat.melee.hit");
    }
  }

  private currentWeaponStats(): WeaponStats {
    return this.loadout.weapon?.weaponStats ?? STARTER_WEAPON_STATS;
  }

  private damageMob(mob: MobState, amount: number, critical = false): void {
    if (mob.dead) return;
    mob.hp = Math.max(0, mob.hp - amount);
    mob.sprite.setTint(critical ? 0xfff2a8 : 0xffe1b0);
    this.time.delayedCall(85, () => {
      if (mob.sprite.active) mob.sprite.clearTint();
    });
    this.showFloatingText(mob.sprite.x, mob.sprite.y - 34, critical ? `${amount}!` : String(amount), critical ? "#fff0a2" : "#f1c37b");

    if (mob.hp <= 0) this.killMob(mob);
  }

  private killMob(mob: MobState): void {
    mob.dead = true;
    mob.sprite.setVelocity(0, 0);
    mob.sprite.disableBody(true, false);
    this.game.events.emit("audio:event", mob.isBoss ? "boss.defeated" : "combat.enemy.kill");

    if (mob.isBoss) {
      this.handleBossDefeated();
      return;
    }

    this.tweens.add({
      targets: mob.sprite,
      alpha: 0,
      scale: 0.7,
      duration: 320,
      onComplete: () => mob.sprite.destroy(),
    });
  }

  private updateEnemies(time: number): void {
    for (const mob of this.mobs) {
      if (mob.dead || !mob.sprite.active) continue;
      mob.sprite.setDepth(mob.sprite.y);

      if (mob.isBoss) {
        if (this.bossEncounterActive) this.updateBoss(mob, time);
        else mob.sprite.setVelocity(0, 0);
        continue;
      }

      const distance = Phaser.Math.Distance.Between(mob.sprite.x, mob.sprite.y, this.player.x, this.player.y);
      if (distance > 720) {
        mob.sprite.setVelocity(0, 0);
        continue;
      }

      const angle = Phaser.Math.Angle.Between(mob.sprite.x, mob.sprite.y, this.player.x, this.player.y);
      mob.sprite.setRotation(angle);

      if (mob.windupEndsAt > 0) {
        mob.sprite.setVelocity(0, 0);
        if (time >= mob.windupEndsAt) {
          mob.windupEndsAt = 0;
          if (Phaser.Math.Distance.Between(mob.sprite.x, mob.sprite.y, this.player.x, this.player.y) <= mob.attackRange + 24) {
            this.damagePlayer(mob.damage, mob.sprite.x, mob.sprite.y);
          }
        }
        continue;
      }

      if (distance > mob.attackRange) {
        mob.sprite.setVelocity(Math.cos(angle) * mob.speed, Math.sin(angle) * mob.speed);
      } else {
        mob.sprite.setVelocity(0, 0);
        if (time >= mob.nextAttackAt) {
          mob.nextAttackAt = time + mob.attackInterval;
          mob.windupEndsAt = time + mob.windup;
          this.showEnemyTelegraph(mob);
        }
      }
    }
  }

  private showEnemyTelegraph(mob: MobState): void {
    const warning = this.add
      .circle(mob.sprite.x, mob.sprite.y, mob.attackRange, 0xd94a45, 0.12)
      .setStrokeStyle(3, 0xd94a45, 0.85)
      .setDepth(mob.sprite.y - 1)
      .setScale(0.55);
    this.tweens.add({
      targets: warning,
      scale: 1,
      alpha: 0.5,
      duration: mob.windup,
      onComplete: () => warning.destroy(),
    });
  }

  private damagePlayer(amount: number, sourceX: number, sourceY: number): void {
    if (this.runState !== "playing" || this.time.now < this.invulnerableUntil) return;
    const interruptedSearch = Boolean(this.searchChest);
    this.cancelChestSearch();
    if (interruptedSearch) this.searchRequiresRelease = true;
    this.hp = Math.max(0, this.hp - amount);
    this.invulnerableUntil = this.time.now + 350;
    const knockback = new Phaser.Math.Vector2(this.player.x - sourceX, this.player.y - sourceY).normalize().scale(110);
    this.player.setVelocity(knockback.x, knockback.y);
    this.player.setTint(0xffc0ad);
    this.time.delayedCall(120, () => this.player.clearTint());
    this.cameras.main.shake(130, 0.008);
    this.showFloatingText(this.player.x, this.player.y - 42, `-${amount}`, "#e57266");
    this.game.events.emit("audio:event", "player.hurt");

    if (this.hp <= 0) this.handleDefeat();
  }

  private updateBoss(mob: MobState, time: number): void {
    const distance = Phaser.Math.Distance.Between(mob.sprite.x, mob.sprite.y, this.player.x, this.player.y);
    const angle = Phaser.Math.Angle.Between(mob.sprite.x, mob.sprite.y, this.player.x, this.player.y);
    mob.sprite.setRotation(angle);

    if (this.bossChargingUntil > time) {
      const chargeAngle = Phaser.Math.Angle.Between(
        mob.sprite.x,
        mob.sprite.y,
        this.bossChargeTarget.x,
        this.bossChargeTarget.y,
      );
      mob.sprite.setVelocity(Math.cos(chargeAngle) * 520, Math.sin(chargeAngle) * 520);
      if (!this.bossChargeHit && distance < 100) {
        this.bossChargeHit = true;
        this.damagePlayer(24, mob.sprite.x, mob.sprite.y);
      }
      return;
    }

    if (this.bossChargingUntil !== 0 && time >= this.bossChargingUntil) {
      this.bossChargingUntil = 0;
      mob.sprite.setVelocity(0, 0);
      mob.nextAttackAt = time + 1100;
    }

    if (time < this.bossBusyUntil) {
      mob.sprite.setVelocity(0, 0);
      return;
    }

    if (time >= mob.nextAttackAt) {
      this.startBossAttack(mob, distance);
      return;
    }

    if (distance > 155) {
      mob.sprite.setVelocity(Math.cos(angle) * mob.speed, Math.sin(angle) * mob.speed);
    } else {
      mob.sprite.setVelocity(0, 0);
    }
  }

  private startBossAttack(mob: MobState, distance: number): void {
    this.bossAttackCounter += 1;
    if (this.bossAttackCounter % 4 === 0) {
      this.startBossPulse(mob);
    } else if (distance > 230 || this.bossAttackCounter % 3 === 0) {
      this.startBossCharge(mob);
    } else {
      this.startBossSweep(mob);
    }
  }

  private startBossSweep(mob: MobState): void {
    const windup = 650;
    const facing = Phaser.Math.Angle.Between(mob.sprite.x, mob.sprite.y, this.player.x, this.player.y);
    this.bossBusyUntil = this.time.now + windup;
    mob.nextAttackAt = this.bossBusyUntil + 1500;
    const warning = this.add.graphics().setDepth(mob.sprite.y - 1);
    warning.fillStyle(0xd94a45, 0.2);
    warning.slice(mob.sprite.x, mob.sprite.y, 190, facing - 1.35, facing + 1.35, false).fillPath();
    warning.lineStyle(3, 0xd94a45, 0.8).strokePath();
    this.game.events.emit("audio:event", "boss.attack.telegraph");
    this.tweens.add({ targets: warning, alpha: 0.8, duration: windup, onComplete: () => warning.destroy() });
    this.time.delayedCall(windup, () => {
      if (!this.bossEncounterActive || mob.dead) return;
      const distance = Phaser.Math.Distance.Between(mob.sprite.x, mob.sprite.y, this.player.x, this.player.y);
      const playerAngle = Phaser.Math.Angle.Between(mob.sprite.x, mob.sprite.y, this.player.x, this.player.y);
      if (distance <= 195 && Math.abs(Phaser.Math.Angle.Wrap(playerAngle - facing)) <= 1.35) {
        this.damagePlayer(18, mob.sprite.x, mob.sprite.y);
      }
    });
  }

  private startBossCharge(mob: MobState): void {
    const windup = 850;
    this.bossBusyUntil = this.time.now + windup;
    mob.nextAttackAt = this.bossBusyUntil + 1700;
    this.bossChargeTarget.set(this.player.x, this.player.y);
    const angle = Phaser.Math.Angle.Between(mob.sprite.x, mob.sprite.y, this.bossChargeTarget.x, this.bossChargeTarget.y);
    const distance = Math.min(620, Phaser.Math.Distance.Between(mob.sprite.x, mob.sprite.y, this.bossChargeTarget.x, this.bossChargeTarget.y));
    const warning = this.add
      .rectangle(mob.sprite.x, mob.sprite.y, distance, 110, 0xd94a45, 0.18)
      .setOrigin(0, 0.5)
      .setRotation(angle)
      .setStrokeStyle(3, 0xd94a45, 0.85)
      .setDepth(mob.sprite.y - 1);
    this.game.events.emit("audio:event", "boss.attack.telegraph");
    this.time.delayedCall(windup, () => {
      warning.destroy();
      if (!this.bossEncounterActive || mob.dead) return;
      this.bossBusyUntil = 0;
      this.bossChargeHit = false;
      this.bossChargingUntil = this.time.now + 680;
    });
  }

  private startBossPulse(mob: MobState): void {
    const windup = 900;
    this.bossBusyUntil = this.time.now + windup;
    mob.nextAttackAt = this.bossBusyUntil + 1900;
    const warning = this.add
      .circle(mob.sprite.x, mob.sprite.y, 360, 0xd94a45, 0.09)
      .setStrokeStyle(5, 0xd94a45, 0.8)
      .setScale(0.2)
      .setDepth(mob.sprite.y - 1);
    this.game.events.emit("audio:event", "boss.attack.telegraph");
    this.tweens.add({
      targets: warning,
      scale: 1,
      alpha: 0.42,
      duration: windup,
      ease: "Sine.easeIn",
      onComplete: () => warning.destroy(),
    });
    this.time.delayedCall(windup, () => {
      if (!this.bossEncounterActive || mob.dead) return;
      const distance = Phaser.Math.Distance.Between(mob.sprite.x, mob.sprite.y, this.player.x, this.player.y);
      if (distance <= 365) this.damagePlayer(14, mob.sprite.x, mob.sprite.y);
    });
  }

  private checkRoomDiscovery(): void {
    const tileX = Math.floor(this.player.x / TILE_SIZE);
    const tileY = Math.floor(this.player.y / TILE_SIZE);
    if (this.mapState.playerTileX !== tileX || this.mapState.playerTileY !== tileY) {
      this.mapState.playerTileX = tileX;
      this.mapState.playerTileY = tileY;
      this.markMapDirty();
    }
    const room = this.dungeon.rooms.find(
      (candidate) =>
        tileX >= candidate.x &&
        tileX < candidate.x + candidate.width &&
        tileY >= candidate.y &&
        tileY < candidate.y + candidate.height,
    );
    if (room && !this.exploredRooms.has(room.id)) this.discoverRoom(room);
  }

  private discoverRoom(room: DungeonRoom): void {
    this.exploredRooms.add(room.id);
    for (let y = Math.max(0, room.y - 1); y <= Math.min(this.dungeon.height - 1, room.y + room.height); y += 1) {
      for (let x = Math.max(0, room.x - 1); x <= Math.min(this.dungeon.width - 1, room.x + room.width); x += 1) {
        this.mapState?.explored && (this.mapState.explored[y * this.dungeon.width + x] = true);
      }
    }
    if (room.isBoss && this.mapState) {
      this.mapState.bossDiscovered = true;
      this.game.events.emit("hud:banner", "发现：守门人竞技场");
      this.game.events.emit("audio:event", "map.poi.discovered");
    }
    if (this.mapState) {
      for (const marker of this.mapState.chests) {
        const chest = this.chests.find((entry) => entry.id === marker.id);
        if (chest?.roomId === room.id) marker.discovered = true;
      }
      this.markMapDirty();
    }
  }

  private markMapDirty(): void {
    if (this.mapState) this.mapState.revision += 1;
  }

  private checkBossTrigger(): void {
    if (this.bossEncounterActive || this.bossDefeated || this.boss.dead) return;
    const room = this.dungeon.bossRoom;
    const tileX = Math.floor(this.player.x / TILE_SIZE);
    const tileY = Math.floor(this.player.y / TILE_SIZE);
    const inside =
      tileX >= room.x + 1 &&
      tileX < room.x + room.width - 1 &&
      tileY >= room.y + 1 &&
      tileY < room.y + room.height - 1;
    if (!inside) return;

    this.bossEncounterActive = true;
    this.boss.sprite.setAlpha(1);
    this.boss.nextAttackAt = this.time.now + 1400;
    this.controlLockedUntil = this.time.now + 350;
    this.currentObjective = "击败遗迹守门人";
    this.mapState.bossActive = true;
    this.markMapDirty();
    this.cameras.main.stopFollow();
    this.tweens.add({ targets: this.cameras.main, zoom: 0.74, duration: 900, ease: "Sine.easeInOut" });
    this.tweens.add({ targets: this, visionRadius: BOSS_VISION_RADIUS, duration: 900, ease: "Sine.easeInOut" });
    this.game.events.emit("hud:banner", "遗迹守门人苏醒\n视野范围已扩大");
    this.game.events.emit("audio:event", "boss.encounter.start");
  }

  private updateBossCamera(): void {
    if (!this.bossEncounterActive || this.bossDefeated || !this.boss.sprite.active) return;
    const camera = this.cameras.main;
    const offset = new Phaser.Math.Vector2(this.boss.sprite.x - this.player.x, this.boss.sprite.y - this.player.y).scale(0.5);
    if (offset.length() > 260) offset.setLength(260);
    const centerX = this.player.x + offset.x;
    const centerY = this.player.y + offset.y;
    const viewWidth = camera.width / camera.zoom;
    const viewHeight = camera.height / camera.zoom;
    const targetX = Phaser.Math.Clamp(centerX - viewWidth / 2, 0, Math.max(0, this.worldWidth - viewWidth));
    const targetY = Phaser.Math.Clamp(centerY - viewHeight / 2, 0, Math.max(0, this.worldHeight - viewHeight));
    camera.scrollX = Phaser.Math.Linear(camera.scrollX, targetX, 0.075);
    camera.scrollY = Phaser.Math.Linear(camera.scrollY, targetY, 0.075);
  }

  private handleBossDefeated(): void {
    this.bossDefeated = true;
    this.bossEncounterActive = false;
    this.mapState.bossActive = false;
    this.currentObjective = "进入传送门并按 E 撤离";
    this.game.events.emit("hud:banner", "守门人已倒下\n撤离传送门已开启");
    this.cameras.main.flash(300, 233, 166, 70, false);

    this.tweens.add({
      targets: this.boss.sprite,
      alpha: 0,
      scale: 1.25,
      duration: 800,
      onComplete: () => this.boss.sprite.destroy(),
    });

    const exitX = (this.dungeon.bossRoom.centerX + 0.5) * TILE_SIZE;
    const exitY = (this.dungeon.bossRoom.centerY + 0.5) * TILE_SIZE;
    this.exitPortal = this.add.circle(exitX, exitY, 58, 0x36b7a2, 0.28).setDepth(exitY - 2);
    this.exitRing = this.add.circle(exitX, exitY, 76, 0x36b7a2, 0.05).setStrokeStyle(6, 0x62d48c, 0.9).setDepth(exitY - 3);
    this.tweens.add({
      targets: this.exitRing,
      scale: 1.18,
      alpha: 0.32,
      yoyo: true,
      repeat: -1,
      duration: 900,
      ease: "Sine.easeInOut",
    });
    this.mapState.exitTileX = this.dungeon.bossRoom.centerX;
    this.mapState.exitTileY = this.dungeon.bossRoom.centerY;

    const bossChest = this.createChest(
      "chest_boss_vault",
      "boss",
      this.dungeon.bossRoom.id,
      exitX + 185,
      exitY + 35,
    );
    bossChest.container.setDepth(exitY + 35);
    this.chests.push(bossChest);
    this.mapState.chests.push({
      id: bossChest.id,
      tileX: Math.floor(bossChest.container.x / TILE_SIZE),
      tileY: Math.floor(bossChest.container.y / TILE_SIZE),
      discovered: true,
      opened: false,
      type: "boss",
    });
    this.markMapDirty();

    this.time.delayedCall(1500, () => {
      this.tweens.add({ targets: this.cameras.main, zoom: 1, duration: 1000, ease: "Sine.easeInOut" });
      this.tweens.add({ targets: this, visionRadius: DEFAULT_VISION_RADIUS, duration: 1000 });
      this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    });
  }

  private tryExit(): boolean {
    if (!this.exitPortal || !this.exitPortal.active) return false;
    const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.exitPortal.x, this.exitPortal.y);
    if (distance > 110) return false;
    this.openExtractionPanel();
    return true;
  }

  private previewExtraction(extraction: ExtractionResult): ExtractionPreview {
    const retainedItems = [
      ...(extraction.retained.weapon ? [extraction.retained.weapon] : []),
      ...listContainerItems(extraction.retained.rig),
      ...(extraction.retained.backpack ? listContainerItems(extraction.retained.backpack) : []),
    ];
    const droppedItems = extraction.droppedBackpack
      ? listContainerItems(extraction.droppedBackpack)
      : [];
    return {
      mode: extraction.mode,
      retainedItemCount: retainedItems.length,
      droppedItemCount: droppedItems.length,
      retainedValue: retainedItems.reduce((total, item) => total + item.value, 0),
      droppedValue: droppedItems.reduce((total, item) => total + item.value, 0),
      corruptionBefore: extraction.corruptionBefore,
      corruptionAfter: extraction.corruptionAfter,
    };
  }

  private openExtractionPanel(): void {
    if (this.runState !== "playing" || this.extractionPanelOpen) return;
    this.closeLootPanel();
    this.extractionPanelOpen = true;
    const state: ExtractionUiState = {
      open: true,
      normal: this.previewExtraction(settleExtraction(this.loadout, "normal")),
      dropPack: this.previewExtraction(settleExtraction(this.loadout, "drop_pack")),
    };
    this.game.events.emit("extraction:state", state);
  }

  private closeExtractionPanel(): void {
    if (!this.extractionPanelOpen) return;
    this.extractionPanelOpen = false;
    this.game.events.emit("extraction:state", { open: false } satisfies ExtractionUiState);
  }

  private handleExtractionChoice(mode: ExtractionMode): void {
    if (!this.extractionPanelOpen || (mode !== "normal" && mode !== "drop_pack")) return;
    const extraction = settleExtraction(this.loadout, mode);
    const preview = this.previewExtraction(extraction);
    let persisted = false;
    let totalExtractedValue: number | undefined;
    try {
      const write = commitExtraction(
        window.localStorage,
        extraction,
        Date.now(),
        `${this.runId}:${mode}`,
      );
      if (write.ok) {
        persisted = true;
        totalExtractedValue = write.profile.totalExtractedValue;
        this.publishProfileSummary(write.profile, write.loadStatus);
      } else {
        this.publishProfileFailure(write.error === "unsupported_version" ? "unsupported" : "unavailable");
      }
    } catch {
      persisted = false;
      this.publishProfileFailure("unavailable");
    }

    this.loadout = extraction.retained;
    this.closeExtractionPanel();
    this.runState = "won";
    this.player.setVelocity(0, 0);
    this.currentObjective = mode === "drop_pack" ? "丢包撤离成功" : "完整撤离成功";
    this.cameras.main.flash(700, 98, 212, 140, false);
    this.game.events.emit("audio:event", "run.victory");
    this.game.events.emit("extraction:result", {
      ...preview,
      persisted,
      totalExtractedValue,
    } satisfies ExtractionOutcomeUi);
    this.emitHudState();
  }

  private refreshProfileSummary(): void {
    try {
      const loaded = loadProfile(window.localStorage);
      this.publishProfileSummary(loaded.profile, loaded.status);
    } catch {
      this.publishProfileSummary(createDefaultProfile(), "unavailable");
    }
  }

  private publishProfileSummary(profile: PlayerProfile, status: ProfileLoadStatus): void {
    const summary: ProfileSummaryUi = {
      warehouseItemCount: profile.warehouse.length,
      successfulExtractions: profile.successfulExtractions,
      totalExtractedValue: profile.totalExtractedValue,
      status,
    };
    this.registry.set("profileSummary", summary);
    this.game.events.emit("profile:state", summary);
  }

  private publishProfileFailure(status: "unavailable" | "unsupported"): void {
    const existing = this.registry.get("profileSummary") as ProfileSummaryUi | undefined;
    const summary: ProfileSummaryUi = {
      warehouseItemCount: existing?.warehouseItemCount ?? 0,
      successfulExtractions: existing?.successfulExtractions ?? 0,
      totalExtractedValue: existing?.totalExtractedValue ?? 0,
      status,
    };
    this.registry.set("profileSummary", summary);
    this.game.events.emit("profile:state", summary);
  }

  private handleDefeat(): void {
    this.runState = "lost";
    this.player.setVelocity(0, 0);
    this.player.setTint(0x6f5151).setAlpha(0.7);
    this.currentObjective = "探索失败";
    this.game.events.emit("audio:event", "run.failure");
    this.emitHudState();
  }

  private updateFog(force: boolean): void {
    if (!this.mapState) return;
    const playerTileX = Math.floor(this.player.x / TILE_SIZE);
    const playerTileY = Math.floor(this.player.y / TILE_SIZE);
    const radius = this.visionRadius;
    const radiusStep = Math.round(radius * 4) / 4;
    if (
      !force &&
      playerTileX === this.lastFogTileX &&
      playerTileY === this.lastFogTileY &&
      radiusStep === this.lastFogRadiusStep
    ) {
      return;
    }
    this.lastFogTileX = playerTileX;
    this.lastFogTileY = playerTileY;
    this.lastFogRadiusStep = radiusStep;
    const radiusSquared = radius * radius;
    let exploredChanged = false;

    for (let y = Math.max(0, Math.floor(playerTileY - radius - 1)); y <= Math.min(this.dungeon.height - 1, Math.ceil(playerTileY + radius + 1)); y += 1) {
      for (let x = Math.max(0, Math.floor(playerTileX - radius - 1)); x <= Math.min(this.dungeon.width - 1, Math.ceil(playerTileX + radius + 1)); x += 1) {
        const dx = x + 0.5 - playerTileX;
        const dy = y + 0.5 - playerTileY;
        const index = y * this.dungeon.width + x;
        if (dx * dx + dy * dy <= radiusSquared && !this.mapState.explored[index]) {
          this.mapState.explored[index] = true;
          exploredChanged = true;
        }
      }
    }
    if (exploredChanged) this.markMapDirty();

    this.fogGraphics.clear();
    for (let y = 0; y < this.dungeon.height; y += 1) {
      let runStart = 0;
      let runAlpha = this.fogAlphaForTile(0, y, playerTileX, playerTileY, radiusSquared);
      for (let x = 1; x <= this.dungeon.width; x += 1) {
        const alpha = x < this.dungeon.width ? this.fogAlphaForTile(x, y, playerTileX, playerTileY, radiusSquared) : -1;
        if (alpha !== runAlpha) {
          if (runAlpha > 0) {
            this.fogGraphics.fillStyle(0x030506, runAlpha);
            this.fogGraphics.fillRect(runStart * TILE_SIZE, y * TILE_SIZE, (x - runStart) * TILE_SIZE + 1, TILE_SIZE + 1);
          }
          runStart = x;
          runAlpha = alpha;
        }
      }
    }

    if (force) this.emitHudState();
  }

  private fogAlphaForTile(x: number, y: number, playerTileX: number, playerTileY: number, radiusSquared: number): number {
    const dx = x + 0.5 - playerTileX;
    const dy = y + 0.5 - playerTileY;
    if (dx * dx + dy * dy <= radiusSquared) return 0;
    return this.mapState.explored[y * this.dungeon.width + x] ? 0.62 : 0.97;
  }

  private emitHudState(): void {
    if (!this.boss) return;
    const state: HudState = {
      hp: this.hp,
      maxHp: PLAYER_MAX_HP,
      objective: this.currentObjective,
      roomsExplored: this.exploredRooms.size,
      totalRooms: this.dungeon.rooms.length,
      bossHp: this.boss.hp,
      bossMaxHp: this.boss.maxHp,
      bossActive: this.bossEncounterActive && !this.bossDefeated,
      potions: this.potions,
      rollReady: this.time.now >= this.rollReadyAt,
      interactionPrompt: this.lootPanelOpen
        ? "Tab / Esc 关闭行囊"
        : this.searchChest
          ? `搜索中 ${Math.round(Phaser.Math.Clamp((this.time.now - this.searchStartedAt) / this.searchChest.searchDuration, 0, 1) * 100)}%`
          : this.nearbyChest
            ? this.nearbyChest.opened
              ? "按 E 查看宝箱"
              : "按住 E 搜索宝箱"
            : "",
      inventoryUsed: this.loadout.backpack ? containerUsedCells(this.loadout.backpack) : 0,
      inventoryCapacity: this.loadout.backpack ? containerCapacity(this.loadout.backpack) : 0,
      state: this.runState,
    };
    this.game.events.emit("hud:update", state);
  }

  private showFloatingText(x: number, y: number, message: string, color: string): void {
    const text = this.add
      .text(x, y, message, {
        fontFamily: "Microsoft YaHei, sans-serif",
        fontSize: "18px",
        fontStyle: "bold",
        color,
        stroke: "#080b0f",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(6000);
    this.tweens.add({
      targets: text,
      y: y - 34,
      alpha: 0,
      duration: 650,
      ease: "Quad.easeOut",
      onComplete: () => text.destroy(),
    });
  }
}


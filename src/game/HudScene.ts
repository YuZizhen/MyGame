import Phaser from "phaser";
import type { HudState, LootItem, LootRarity, LootUiState, RuntimeMapState } from "./types";

const DEFAULT_HUD: HudState = {
  hp: 100,
  maxHp: 100,
  objective: "探索灰烬地穴，寻找遗迹守门人",
  roomsExplored: 1,
  totalRooms: 20,
  bossHp: 0,
  bossMaxHp: 0,
  bossActive: false,
  potions: 2,
  rollReady: true,
  interactionPrompt: "",
  inventoryUsed: 0,
  inventoryCapacity: 30,
  state: "playing",
};

export class HudScene extends Phaser.Scene {
  private hudState: HudState = { ...DEFAULT_HUD };
  private statusGraphics!: Phaser.GameObjects.Graphics;
  private minimapGraphics!: Phaser.GameObjects.Graphics;
  private objectiveText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private bossNameText!: Phaser.GameObjects.Text;
  private bannerText!: Phaser.GameObjects.Text;
  private resultBackdrop!: Phaser.GameObjects.Rectangle;
  private resultText!: Phaser.GameObjects.Text;
  private interactionText!: Phaser.GameObjects.Text;
  private lootGraphics!: Phaser.GameObjects.Graphics;
  private lootTitle!: Phaser.GameObjects.Text;
  private lootHint!: Phaser.GameObjects.Text;
  private lootObjects: Phaser.GameObjects.GameObject[] = [];
  private lastMapDraw = 0;

  constructor() {
    super("HudScene");
  }

  create(): void {
    this.statusGraphics = this.add.graphics();
    this.minimapGraphics = this.add.graphics();
    this.lootGraphics = this.add.graphics().setDepth(100);

    this.objectiveText = this.add.text(34, 42, "", {
      fontFamily: "Microsoft YaHei, sans-serif",
      fontSize: "19px",
      color: "#e4e8e9",
      stroke: "#080b0f",
      strokeThickness: 5,
    });

    this.statusText = this.add.text(34, 100, "", {
      fontFamily: "Microsoft YaHei, sans-serif",
      fontSize: "16px",
      color: "#c8d0d2",
      stroke: "#080b0f",
      strokeThickness: 4,
    });

    this.bossNameText = this.add
      .text(640, 30, "遗迹守门人", {
        fontFamily: "Microsoft YaHei, sans-serif",
        fontSize: "18px",
        color: "#f3ddd4",
        stroke: "#080b0f",
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setVisible(false);

    this.add
      .text(640, 686, "WASD 移动  ·  鼠标左键 / 空格 挥砍  ·  Shift 翻滚  ·  按住 E 搜索  ·  Tab 行囊", {
        fontFamily: "Microsoft YaHei, sans-serif",
        fontSize: "16px",
        color: "#aeb9bc",
        stroke: "#05070a",
        strokeThickness: 5,
      })
      .setOrigin(0.5);

    this.bannerText = this.add
      .text(640, 138, "", {
        fontFamily: "Microsoft YaHei, sans-serif",
        fontSize: "28px",
        fontStyle: "bold",
        color: "#ffb347",
        stroke: "#080b0f",
        strokeThickness: 7,
        align: "center",
      })
      .setOrigin(0.5)
      .setAlpha(0);

    this.interactionText = this.add
      .text(640, 618, "", {
        fontFamily: "Microsoft YaHei, sans-serif",
        fontSize: "18px",
        fontStyle: "bold",
        color: "#f2d399",
        backgroundColor: "rgba(8, 11, 15, 0.82)",
        padding: { x: 16, y: 9 },
        stroke: "#080b0f",
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setVisible(false);

    this.lootTitle = this.add
      .text(640, 88, "", {
        fontFamily: "Microsoft YaHei, sans-serif",
        fontSize: "25px",
        fontStyle: "bold",
        color: "#f0e4d2",
      })
      .setOrigin(0.5)
      .setDepth(102)
      .setVisible(false);

    this.lootHint = this.add
      .text(640, 650, "点击箱内物品自动放入背包 · Tab / Esc 关闭", {
        fontFamily: "Microsoft YaHei, sans-serif",
        fontSize: "16px",
        color: "#aeb9bc",
      })
      .setOrigin(0.5)
      .setDepth(102)
      .setVisible(false);

    this.resultBackdrop = this.add
      .rectangle(640, 360, 1280, 720, 0x030506, 0.82)
      .setVisible(false);
    this.resultText = this.add
      .text(640, 360, "", {
        fontFamily: "Microsoft YaHei, sans-serif",
        fontSize: "34px",
        fontStyle: "bold",
        color: "#f4d69b",
        stroke: "#080b0f",
        strokeThickness: 8,
        align: "center",
        lineSpacing: 14,
      })
      .setOrigin(0.5)
      .setVisible(false);

    this.game.events.on("hud:update", this.handleHudUpdate, this);
    this.game.events.on("hud:banner", this.handleBanner, this);
    this.game.events.on("hud:reset", this.handleReset, this);
    this.game.events.on("loot:state", this.handleLootState, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.removeListeners, this);

    this.renderStatus();
  }

  update(time: number): void {
    if (time - this.lastMapDraw > 140) {
      this.lastMapDraw = time;
      this.drawMinimap();
    }
  }

  private handleHudUpdate(state: HudState): void {
    const previousState = this.hudState.state;
    this.hudState = { ...state };
    this.renderStatus();

    if (previousState !== state.state && state.state !== "playing") {
      const won = state.state === "won";
      this.resultBackdrop.setVisible(true);
      this.resultText
        .setText(
          won
            ? "撤离成功\n守门核心已安全带出\n\n按 R 再次进入地穴"
            : "你倒在了灰烬地穴\n本次探索结束\n\n按 R 重新挑战",
        )
        .setColor(won ? "#f4d69b" : "#d88479")
        .setVisible(true);
    }
  }

  private handleBanner(message: string): void {
    this.bannerText.setText(message).setAlpha(1).setScale(0.96);
    this.tweens.killTweensOf(this.bannerText);
    this.tweens.add({
      targets: this.bannerText,
      alpha: 0,
      scale: 1.04,
      duration: 2200,
      ease: "Sine.easeOut",
      delay: 600,
    });
  }

  private handleReset(): void {
    this.hudState = { ...DEFAULT_HUD };
    this.resultBackdrop.setVisible(false);
    this.resultText.setVisible(false);
    this.bannerText.setAlpha(0);
    this.handleLootState({
      open: false,
      chestItems: [],
      inventoryItems: [],
      inventoryColumns: 6,
      inventoryRows: 5,
    });
    this.renderStatus();
  }

  private handleLootState(state: LootUiState): void {
    this.clearLootObjects();
    this.lootGraphics.clear();
    this.lootTitle.setVisible(false);
    this.lootHint.setVisible(false);
    if (!state.open) return;

    this.lootGraphics.setVisible(true);
    this.lootGraphics.fillStyle(0x030506, 0.88).fillRect(0, 0, 1280, 720);
    this.lootGraphics.fillStyle(0x0b1116, 0.97).fillRoundedRect(86, 58, 1108, 600, 20);
    this.lootGraphics.lineStyle(2, 0x566167, 0.72).strokeRoundedRect(86, 58, 1108, 600, 20);
    this.lootGraphics.fillStyle(0x111920, 1).fillRoundedRect(118, 136, 440, 446, 14);
    this.lootGraphics.fillStyle(0x111920, 1).fillRoundedRect(590, 136, 572, 446, 14);
    this.lootGraphics.lineStyle(1, 0x344148, 0.9).strokeRoundedRect(118, 136, 440, 446, 14);
    this.lootGraphics.strokeRoundedRect(590, 136, 572, 446, 14);

    this.lootTitle.setText(state.chestId ? `${state.chestName ?? "宝箱"} · 搜刮` : "行囊整理").setVisible(true);
    this.lootHint.setVisible(true);

    const leftHeading = this.add
      .text(142, 154, state.chestId ? `箱内物品  ${state.chestItems.length}` : "当前没有打开的容器", {
        fontFamily: "Microsoft YaHei, sans-serif",
        fontSize: "18px",
        color: "#d8dedf",
      })
      .setDepth(102);
    const rightHeading = this.add
      .text(614, 154, `背包  ${state.inventoryColumns}×${state.inventoryRows}`, {
        fontFamily: "Microsoft YaHei, sans-serif",
        fontSize: "18px",
        color: "#d8dedf",
      })
      .setDepth(102);
    this.lootObjects.push(leftHeading, rightHeading);

    state.chestItems.forEach((item, index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      const x = 142 + column * 202;
      const y = 198 + row * 106;
      this.createChestItemCard(item, state.chestId!, x, y);
    });

    this.drawInventoryGrid(state);
  }

  private createChestItemCard(item: LootItem, chestId: string, x: number, y: number): void {
    const color = this.rarityColor(item.rarity);
    const card = this.add
      .rectangle(x, y, 184, 88, 0x172027, 1)
      .setOrigin(0)
      .setStrokeStyle(2, color, 0.9)
      .setDepth(102)
      .setInteractive({ useHandCursor: true });
    card.on(Phaser.Input.Events.POINTER_OVER, () => card.setFillStyle(0x253139, 1));
    card.on(Phaser.Input.Events.POINTER_OUT, () => card.setFillStyle(0x172027, 1));
    card.on(Phaser.Input.Events.POINTER_DOWN, () => {
      this.game.events.emit("loot:take", { chestId, itemId: item.id });
    });
    const icon = this.add.graphics().setDepth(103);
    this.drawLootIcon(icon, item, x + 35, y + 42, 0.7);
    const name = this.add
      .text(x + 70, y + 14, item.name, {
        fontFamily: "Microsoft YaHei, sans-serif",
        fontSize: "16px",
        fontStyle: "bold",
        color: "#edf1f1",
      })
      .setDepth(103);
    const detail = this.add
      .text(x + 70, y + 42, `${item.width}×${item.height} · 价值 ${item.value}`, {
        fontFamily: "Microsoft YaHei, sans-serif",
        fontSize: "14px",
        color: this.rarityTextColor(item.rarity),
      })
      .setDepth(103);
    this.lootObjects.push(card, icon, name, detail);
  }

  private drawInventoryGrid(state: LootUiState): void {
    const cell = 62;
    const originX = 614;
    const originY = 198;
    for (let y = 0; y < state.inventoryRows; y += 1) {
      for (let x = 0; x < state.inventoryColumns; x += 1) {
        this.lootGraphics.fillStyle(0x0b1115, 1).fillRoundedRect(originX + x * cell, originY + y * cell, cell - 4, cell - 4, 6);
        this.lootGraphics.lineStyle(1, 0x2b373d, 0.85).strokeRoundedRect(originX + x * cell, originY + y * cell, cell - 4, cell - 4, 6);
      }
    }

    for (const item of state.inventoryItems) {
      const x = originX + item.x * cell;
      const y = originY + item.y * cell;
      const width = item.width * cell - 4;
      const height = item.height * cell - 4;
      const color = this.rarityColor(item.rarity);
      this.lootGraphics.fillStyle(0x182229, 0.98).fillRoundedRect(x, y, width, height, 8);
      this.lootGraphics.lineStyle(3, color, 0.95).strokeRoundedRect(x, y, width, height, 8);
      const icon = this.add.graphics().setDepth(103);
      this.drawLootIcon(icon, item, x + width / 2, y + height / 2 - 6, Math.min(1.15, Math.min(width, height) / 62));
      this.lootObjects.push(icon);
      if (item.width * item.height > 1) {
        const label = this.add
          .text(x + width / 2, y + height - 17, item.name, {
            fontFamily: "Microsoft YaHei, sans-serif",
            fontSize: "14px",
            color: "#e7ecec",
            align: "center",
          })
          .setOrigin(0.5)
          .setDepth(103);
        this.lootObjects.push(label);
      }
    }
  }

  private drawLootIcon(
    graphics: Phaser.GameObjects.Graphics,
    item: LootItem,
    centerX: number,
    centerY: number,
    scale: number,
  ): void {
    const rarity = this.rarityColor(item.rarity);
    graphics.fillStyle(0x05080a, 0.55).fillEllipse(centerX + 3, centerY + 8, 42 * scale, 15 * scale);
    graphics.lineStyle(3 * scale, rarity, 0.9);
    switch (item.icon) {
      case "gem":
        graphics.fillStyle(0x49b8ad, 1).fillPoints([
          new Phaser.Geom.Point(centerX, centerY - 22 * scale),
          new Phaser.Geom.Point(centerX + 19 * scale, centerY),
          new Phaser.Geom.Point(centerX, centerY + 22 * scale),
          new Phaser.Geom.Point(centerX - 19 * scale, centerY),
        ], true);
        graphics.strokePoints([
          new Phaser.Geom.Point(centerX, centerY - 22 * scale),
          new Phaser.Geom.Point(centerX + 19 * scale, centerY),
          new Phaser.Geom.Point(centerX, centerY + 22 * scale),
          new Phaser.Geom.Point(centerX - 19 * scale, centerY),
        ], true);
        break;
      case "pouch":
        graphics.fillStyle(0x8b6548, 1).fillCircle(centerX, centerY + 3, 18 * scale);
        graphics.fillStyle(0xd49a3b, 1).fillRect(centerX - 12 * scale, centerY - 17 * scale, 24 * scale, 7 * scale);
        graphics.strokeCircle(centerX, centerY + 3, 18 * scale);
        break;
      case "ring":
        graphics.lineStyle(8 * scale, 0xbcc5c7, 1).strokeCircle(centerX, centerY, 17 * scale);
        graphics.fillStyle(0xa56de2, 1).fillCircle(centerX, centerY - 18 * scale, 7 * scale);
        break;
      case "blade":
        graphics.lineStyle(10 * scale, 0xc5d0d2, 1).beginPath().moveTo(centerX - 16 * scale, centerY + 22 * scale).lineTo(centerX + 16 * scale, centerY - 22 * scale).strokePath();
        graphics.lineStyle(5 * scale, 0x76513d, 1).beginPath().moveTo(centerX - 22 * scale, centerY + 13 * scale).lineTo(centerX - 8 * scale, centerY + 27 * scale).strokePath();
        break;
      case "scroll":
        graphics.fillStyle(0xb49b72, 1).fillRoundedRect(centerX - 13 * scale, centerY - 24 * scale, 26 * scale, 48 * scale, 8 * scale);
        graphics.lineStyle(4 * scale, 0x6d4334, 1).strokeRoundedRect(centerX - 13 * scale, centerY - 24 * scale, 26 * scale, 48 * scale, 8 * scale);
        break;
      case "helm":
        graphics.fillStyle(0x626d72, 1).fillRoundedRect(centerX - 24 * scale, centerY - 18 * scale, 48 * scale, 38 * scale, 15 * scale);
        graphics.fillStyle(0x20272b, 1).fillRect(centerX - 20 * scale, centerY - 1 * scale, 40 * scale, 7 * scale);
        graphics.strokeRoundedRect(centerX - 24 * scale, centerY - 18 * scale, 48 * scale, 38 * scale, 15 * scale);
        break;
      case "axe":
        graphics.lineStyle(8 * scale, 0x76513d, 1).beginPath().moveTo(centerX - 24 * scale, centerY + 20 * scale).lineTo(centerX + 20 * scale, centerY - 20 * scale).strokePath();
        graphics.fillStyle(0x9da8ab, 1).fillTriangle(centerX + 4 * scale, centerY - 18 * scale, centerX + 31 * scale, centerY - 28 * scale, centerX + 22 * scale, centerY + 2 * scale);
        break;
      case "armor":
        graphics.fillStyle(0x626d72, 1).fillPoints([
          new Phaser.Geom.Point(centerX - 27 * scale, centerY - 23 * scale),
          new Phaser.Geom.Point(centerX, centerY - 13 * scale),
          new Phaser.Geom.Point(centerX + 27 * scale, centerY - 23 * scale),
          new Phaser.Geom.Point(centerX + 20 * scale, centerY + 24 * scale),
          new Phaser.Geom.Point(centerX, centerY + 32 * scale),
          new Phaser.Geom.Point(centerX - 20 * scale, centerY + 24 * scale),
        ], true);
        graphics.strokePoints([
          new Phaser.Geom.Point(centerX - 27 * scale, centerY - 23 * scale),
          new Phaser.Geom.Point(centerX, centerY - 13 * scale),
          new Phaser.Geom.Point(centerX + 27 * scale, centerY - 23 * scale),
          new Phaser.Geom.Point(centerX + 20 * scale, centerY + 24 * scale),
          new Phaser.Geom.Point(centerX, centerY + 32 * scale),
          new Phaser.Geom.Point(centerX - 20 * scale, centerY + 24 * scale),
        ], true);
        break;
      case "relic":
        graphics.fillStyle(0x596267, 1).fillPoints([
          new Phaser.Geom.Point(centerX - 25 * scale, centerY - 22 * scale),
          new Phaser.Geom.Point(centerX + 18 * scale, centerY - 27 * scale),
          new Phaser.Geom.Point(centerX + 29 * scale, centerY + 18 * scale),
          new Phaser.Geom.Point(centerX - 19 * scale, centerY + 29 * scale),
        ], true);
        graphics.strokePoints([
          new Phaser.Geom.Point(centerX - 25 * scale, centerY - 22 * scale),
          new Phaser.Geom.Point(centerX + 18 * scale, centerY - 27 * scale),
          new Phaser.Geom.Point(centerX + 29 * scale, centerY + 18 * scale),
          new Phaser.Geom.Point(centerX - 19 * scale, centerY + 29 * scale),
        ], true);
        graphics.fillStyle(0x36b7a2, 1).fillCircle(centerX, centerY, 9 * scale);
        break;
    }
  }

  private rarityColor(rarity: LootRarity): number {
    return rarity === "rare" ? 0xa56de2 : rarity === "magic" ? 0x4d9fdc : 0xaab2b4;
  }

  private rarityTextColor(rarity: LootRarity): string {
    return rarity === "rare" ? "#c49aef" : rarity === "magic" ? "#72b9eb" : "#bfc6c8";
  }

  private clearLootObjects(): void {
    this.lootObjects.forEach((object) => object.destroy());
    this.lootObjects = [];
  }

  private renderStatus(): void {
    const state = this.hudState;
    const healthRatio = Phaser.Math.Clamp(state.hp / state.maxHp, 0, 1);

    this.statusGraphics.clear();
    this.statusGraphics.fillStyle(0x080b0f, 0.82).fillRoundedRect(24, 22, 390, 126, 12);
    this.statusGraphics.lineStyle(1, 0x465057, 0.8).strokeRoundedRect(24, 22, 390, 126, 12);
    this.statusGraphics.fillStyle(0x11171c, 1).fillRoundedRect(34, 72, 278, 18, 5);
    this.statusGraphics.fillStyle(healthRatio > 0.3 ? 0xc84f46 : 0xe38b36, 1);
    this.statusGraphics.fillRoundedRect(36, 74, 274 * healthRatio, 14, 4);
    this.statusGraphics.lineStyle(1, 0xd4d9da, 0.35).strokeRoundedRect(34, 72, 278, 18, 5);

    this.objectiveText.setText(state.objective);
    this.statusText.setText(
      `生命 ${Math.ceil(state.hp)} / ${state.maxHp}   ·   行囊 ${state.inventoryUsed}/${state.inventoryCapacity}\n探索 ${state.roomsExplored}/${state.totalRooms}   ·   药剂 ${state.potions}   ·   翻滚 ${state.rollReady ? "就绪" : "冷却"}`,
    );
    this.interactionText.setText(state.interactionPrompt).setVisible(state.interactionPrompt.length > 0);

    if (state.bossActive) {
      const bossRatio = Phaser.Math.Clamp(state.bossHp / state.bossMaxHp, 0, 1);
      this.statusGraphics.fillStyle(0x07090c, 0.9).fillRoundedRect(395, 48, 490, 22, 6);
      this.statusGraphics.fillStyle(0x873d3a, 1).fillRoundedRect(399, 52, 482 * bossRatio, 14, 4);
      this.statusGraphics.lineStyle(1, 0xe6b6a7, 0.55).strokeRoundedRect(395, 48, 490, 22, 6);
      this.bossNameText.setVisible(true);
    } else {
      this.bossNameText.setVisible(false);
    }
  }

  private drawMinimap(): void {
    const mapState = this.registry.get("mapState") as RuntimeMapState | undefined;
    if (!mapState) return;

    const panelX = 994;
    const panelY = 24;
    const panelWidth = 262;
    const panelHeight = 196;
    const mapX = panelX + 16;
    const mapY = panelY + 30;
    const mapWidth = panelWidth - 32;
    const mapHeight = panelHeight - 44;
    const scale = Math.min(mapWidth / mapState.width, mapHeight / mapState.height);

    this.minimapGraphics.clear();
    this.minimapGraphics.fillStyle(0x080b0e, 0.88).fillRoundedRect(panelX, panelY, panelWidth, panelHeight, 12);
    this.minimapGraphics.lineStyle(1, 0x58636a, 0.75).strokeRoundedRect(panelX, panelY, panelWidth, panelHeight, 12);
    this.minimapGraphics.fillStyle(0xcfd7d9, 0.9).fillRect(panelX + 16, panelY + 17, 6, 2);
    this.minimapGraphics.fillStyle(0x8d999d, 0.9).fillRect(panelX + 25, panelY + 17, 28, 2);

    for (let y = 0; y < mapState.height; y += 1) {
      for (let x = 0; x < mapState.width; x += 1) {
        const index = y * mapState.width + x;
        if (!mapState.explored[index]) continue;
        const isFloor = mapState.tiles[index] === 1;
        this.minimapGraphics.fillStyle(isFloor ? 0x7c898e : 0x293137, isFloor ? 0.78 : 0.5);
        this.minimapGraphics.fillRect(
          mapX + x * scale,
          mapY + y * scale,
          Math.max(1.2, scale + 0.15),
          Math.max(1.2, scale + 0.15),
        );
      }
    }

    if (mapState.bossDiscovered) {
      this.minimapGraphics.fillStyle(0xd94a45, mapState.bossActive ? 1 : 0.72);
      this.minimapGraphics.fillCircle(
        mapX + (mapState.bossTileX + 0.5) * scale,
        mapY + (mapState.bossTileY + 0.5) * scale,
        mapState.bossActive ? 4 : 3,
      );
    }

    if (mapState.exitTileX !== undefined && mapState.exitTileY !== undefined) {
      this.minimapGraphics.lineStyle(2, 0x62d48c, 1);
      this.minimapGraphics.strokeCircle(
        mapX + (mapState.exitTileX + 0.5) * scale,
        mapY + (mapState.exitTileY + 0.5) * scale,
        5,
      );
    }

    for (const chest of mapState.chests) {
      if (!chest.discovered) continue;
      const chestX = mapX + (chest.tileX + 0.5) * scale;
      const chestY = mapY + (chest.tileY + 0.5) * scale;
      if (chest.opened) {
        this.minimapGraphics.lineStyle(1, 0x7c8587, 0.75).strokeRect(chestX - 2, chestY - 2, 4, 4);
      } else {
        this.minimapGraphics.fillStyle(chest.type === "hidden" ? 0xa56de2 : 0xe6c35a, 0.95).fillRect(chestX - 2.5, chestY - 2.5, 5, 5);
      }
    }

    const playerX = mapX + (mapState.playerTileX + 0.5) * scale;
    const playerY = mapY + (mapState.playerTileY + 0.5) * scale;
    this.minimapGraphics.fillStyle(0xffb347, 1);
    this.minimapGraphics.fillTriangle(playerX, playerY - 5, playerX - 4, playerY + 4, playerX + 4, playerY + 4);
  }

  private removeListeners(): void {
    this.game.events.off("hud:update", this.handleHudUpdate, this);
    this.game.events.off("hud:banner", this.handleBanner, this);
    this.game.events.off("hud:reset", this.handleReset, this);
    this.game.events.off("loot:state", this.handleLootState, this);
  }
}


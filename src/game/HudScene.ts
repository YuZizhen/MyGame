import Phaser from "phaser";
import {
  containerCapacity,
  containerUsedCells,
  moveStoredItemToPosition,
  rotatedSize,
  weaponDamagePerSecond,
  type ContainerState,
  type ItemInstance,
  type StoredContainerSlot,
} from "../domain/loadout";
import type {
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
  inventoryCapacity: 42,
  state: "playing",
};

const DEFAULT_PROFILE_SUMMARY: ProfileSummaryUi = {
  warehouseItemCount: 0,
  successfulExtractions: 0,
  totalExtractedValue: 0,
  status: "new",
};

const LOOT_HINT = "物品会自动逐件搜索 · 点击或数字1–5拾取 · 拖动指定格位 · E/Tab/Esc关闭";

interface LoadoutDropZone {
  container: StoredContainerSlot;
  pocketId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  cell: number;
}

export class HudScene extends Phaser.Scene {
  private hudState: HudState = { ...DEFAULT_HUD };
  private statusGraphics!: Phaser.GameObjects.Graphics;
  private minimapGraphics!: Phaser.GameObjects.Graphics;
  private objectiveText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private profileText!: Phaser.GameObjects.Text;
  private bossNameText!: Phaser.GameObjects.Text;
  private bannerText!: Phaser.GameObjects.Text;
  private resultBackdrop!: Phaser.GameObjects.Rectangle;
  private resultText!: Phaser.GameObjects.Text;
  private interactionText!: Phaser.GameObjects.Text;
  private lootGraphics!: Phaser.GameObjects.Graphics;
  private lootTitle!: Phaser.GameObjects.Text;
  private lootHint!: Phaser.GameObjects.Text;
  private lootObjects: Phaser.GameObjects.GameObject[] = [];
  private loadoutDropZones: LoadoutDropZone[] = [];
  private lootSearchProgressItemId?: string;
  private lootSearchProgressFill?: Phaser.GameObjects.Rectangle;
  private lootSearchProgressText?: Phaser.GameObjects.Text;
  private lootMessageVersion = 0;
  private extractionGraphics!: Phaser.GameObjects.Graphics;
  private extractionObjects: Phaser.GameObjects.GameObject[] = [];
  private lastExtractionOutcome?: ExtractionOutcomeUi;
  private lastMapDraw = 0;
  private lastMapRevision = -1;
  private profileSummary: ProfileSummaryUi = { ...DEFAULT_PROFILE_SUMMARY };

  constructor() {
    super("HudScene");
  }

  create(): void {
    this.input.mouse?.disableContextMenu();
    this.input.dragDistanceThreshold = 9;
    this.statusGraphics = this.add.graphics();
    this.minimapGraphics = this.add.graphics();
    this.lootGraphics = this.add.graphics().setDepth(100);
    this.extractionGraphics = this.add.graphics().setDepth(120);

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

    this.profileText = this.add.text(34, 149, "", {
      fontFamily: "Microsoft YaHei, sans-serif",
      fontSize: "14px",
      color: "#9facb0",
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
      .text(640, 686, "WASD 移动  ·  鼠标左键 / 空格 挥砍  ·  Shift 翻滚  ·  按住 E 搜索  ·  Tab 行囊  ·  M 静音", {
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
      .text(640, 628, LOOT_HINT, {
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
    this.game.events.on("loot:message", this.handleLootMessage, this);
    this.game.events.on("loot:search-progress", this.handleLootSearchProgress, this);
    this.game.events.on("extraction:state", this.handleExtractionState, this);
    this.game.events.on("extraction:result", this.handleExtractionResult, this);
    this.game.events.on("profile:state", this.handleProfileState, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.removeListeners, this);

    this.profileSummary =
      (this.registry.get("profileSummary") as ProfileSummaryUi | undefined) ??
      { ...DEFAULT_PROFILE_SUMMARY };
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
      const outcome = this.lastExtractionOutcome;
      const successText = outcome
        ? outcome.mode === "drop_pack"
          ? `丢包撤离成功\n保留 ${outcome.retainedItemCount} 件 · 丢弃 ${outcome.droppedItemCount} 件\n带出价值 ${outcome.retainedValue} · 腐化 ${outcome.corruptionBefore} → ${outcome.corruptionAfter}${outcome.persisted ? `\n仓库累计价值 ${outcome.totalExtractedValue ?? outcome.retainedValue}` : "\n本地存档不可用，本次结果未保存"}`
          : `完整撤离成功\n带出 ${outcome.retainedItemCount} 件 · 价值 ${outcome.retainedValue}\n腐化 ${outcome.corruptionAfter}${outcome.persisted ? `\n仓库累计价值 ${outcome.totalExtractedValue ?? outcome.retainedValue}` : "\n本地存档不可用，本次结果未保存"}`
        : "撤离成功\n战利品已安全带出";
      this.resultBackdrop.setVisible(true);
      this.resultText
        .setText(
          won
            ? `${successText}\n\n按 R 再次进入地穴`
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
    this.lastExtractionOutcome = undefined;
    this.lastMapRevision = -1;
    this.handleLootState({
      open: false,
      chestItems: [],
    });
    this.handleExtractionState({ open: false });
    this.renderStatus();
  }

  private handleExtractionResult(outcome: ExtractionOutcomeUi): void {
    this.lastExtractionOutcome = outcome;
  }

  private handleProfileState(summary: ProfileSummaryUi): void {
    this.profileSummary = { ...summary };
    this.renderStatus();
  }

  private handleExtractionState(state: ExtractionUiState): void {
    this.clearExtractionObjects();
    this.extractionGraphics.clear();
    if (!state.open || !state.normal || !state.dropPack) return;

    this.extractionGraphics.fillStyle(0x020405, 0.92).fillRect(0, 0, 1280, 720);
    this.extractionGraphics.fillStyle(0x0b1116, 1).fillRoundedRect(112, 72, 1056, 560, 22);
    this.extractionGraphics.lineStyle(2, 0x62d48c, 0.7).strokeRoundedRect(112, 72, 1056, 560, 22);
    const title = this.add
      .text(640, 112, "选择撤离方式", {
        fontFamily: "Microsoft YaHei, sans-serif",
        fontSize: "30px",
        fontStyle: "bold",
        color: "#f0e4d2",
      })
      .setOrigin(0.5)
      .setDepth(123);
    const subtitle = this.add
      .text(640, 151, "胸挂与背包并列；区别只发生在本次撤离结算", {
        fontFamily: "Microsoft YaHei, sans-serif",
        fontSize: "16px",
        color: "#9facb0",
      })
      .setOrigin(0.5)
      .setDepth(123);
    this.extractionObjects.push(title, subtitle);
    this.createExtractionCard(state.normal, 150, 190, 450, 340);
    this.createExtractionCard(state.dropPack, 680, 190, 450, 340);
    const hint = this.add
      .text(640, 582, "按 1 / 2 或点击方案确认撤离 · Esc 返回继续整理", {
        fontFamily: "Microsoft YaHei, sans-serif",
        fontSize: "16px",
        color: "#aeb9bc",
      })
      .setOrigin(0.5)
      .setDepth(123);
    this.extractionObjects.push(hint);
  }

  private createExtractionCard(
    preview: ExtractionPreview,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    const dropPack = preview.mode === "drop_pack";
    const accent = dropPack ? 0xd1844b : 0x62d48c;
    const card = this.add
      .rectangle(x, y, width, height, 0x121b20, 1)
      .setOrigin(0)
      .setStrokeStyle(2, accent, 0.88)
      .setDepth(122)
      .setInteractive({ useHandCursor: true });
    card.on(Phaser.Input.Events.POINTER_OVER, () => card.setFillStyle(0x1b292f, 1));
    card.on(Phaser.Input.Events.POINTER_OUT, () => card.setFillStyle(0x121b20, 1));
    card.on(Phaser.Input.Events.POINTER_DOWN, () => {
      this.game.events.emit("extraction:choose", preview.mode);
    });
    const heading = this.add
      .text(x + 28, y + 28, dropPack ? "[2] 丢包撤离" : "[1] 完整撤离", {
        fontFamily: "Microsoft YaHei, sans-serif",
        fontSize: "27px",
        fontStyle: "bold",
        color: dropPack ? "#e9aa72" : "#82ddb0",
      })
      .setDepth(123);
    const rule = this.add
      .text(
        x + 28,
        y + 82,
        dropPack
          ? "保留武器与胸挂\n丢弃背包及背包内全部物品"
          : "保留武器、胸挂与背包\n带出所有容器内的物品",
        {
          fontFamily: "Microsoft YaHei, sans-serif",
          fontSize: "18px",
          color: "#d6ddde",
          lineSpacing: 9,
        },
      )
      .setDepth(123);
    const summary = this.add
      .text(
        x + 28,
        y + 180,
        `保留 ${preview.retainedItemCount} 件 · 价值 ${preview.retainedValue}\n丢弃 ${preview.droppedItemCount} 件 · 价值 ${preview.droppedValue}\n腐化 ${preview.corruptionBefore} → ${preview.corruptionAfter}`,
        {
          fontFamily: "Microsoft YaHei, sans-serif",
          fontSize: "17px",
          color: "#aeb9bc",
          lineSpacing: 10,
        },
      )
      .setDepth(123);
    const action = this.add
      .text(x + width - 28, y + height - 28, "确认撤离  ›", {
        fontFamily: "Microsoft YaHei, sans-serif",
        fontSize: "18px",
        fontStyle: "bold",
        color: dropPack ? "#e9aa72" : "#82ddb0",
      })
      .setOrigin(1, 1)
      .setDepth(123);
    this.extractionObjects.push(card, heading, rule, summary, action);
  }

  private clearExtractionObjects(): void {
    this.extractionObjects.forEach((object) => object.destroy());
    this.extractionObjects = [];
  }

  private handleLootState(state: LootUiState): void {
    this.lootMessageVersion += 1;
    this.clearLootObjects();
    this.lootGraphics.clear();
    this.lootTitle.setVisible(false);
    this.lootHint.setVisible(false);
    if (!state.open || !state.loadout) return;
    const loadout = state.loadout;

    this.lootGraphics.setVisible(true);
    this.lootGraphics.fillStyle(0x030506, 0.88).fillRect(0, 0, 1280, 720);
    this.lootGraphics.fillStyle(0x0b1116, 0.97).fillRoundedRect(86, 58, 1108, 600, 20);
    this.lootGraphics.lineStyle(2, 0x566167, 0.72).strokeRoundedRect(86, 58, 1108, 600, 20);
    this.lootGraphics.fillStyle(0x111920, 1).fillRoundedRect(110, 130, 320, 458, 14);
    this.lootGraphics.fillStyle(0x111920, 1).fillRoundedRect(452, 130, 718, 458, 14);
    this.lootGraphics.lineStyle(1, 0x344148, 0.9).strokeRoundedRect(110, 130, 320, 458, 14);
    this.lootGraphics.strokeRoundedRect(452, 130, 718, 458, 14);

    this.lootTitle.setText(state.chestId ? `${state.chestName ?? "宝箱"} · 搜刮` : "行囊整理").setVisible(true);
    this.lootHint.setText(LOOT_HINT).setColor("#aeb9bc").setVisible(true);
    const closeButton = this.add
      .text(1150, 78, "关闭  E / Esc / Tab  ×", {
        fontFamily: "Microsoft YaHei, sans-serif",
        fontSize: "16px",
        fontStyle: "bold",
        color: "#d7dfe1",
        backgroundColor: "#202a30",
        padding: { x: 12, y: 14 },
      })
      .setOrigin(1, 0)
      .setDepth(105)
      .setInteractive({ useHandCursor: true });
    closeButton.on(Phaser.Input.Events.POINTER_OVER, () => closeButton.setBackgroundColor("#39474e"));
    closeButton.on(Phaser.Input.Events.POINTER_OUT, () => closeButton.setBackgroundColor("#202a30"));
    closeButton.on(Phaser.Input.Events.POINTER_DOWN, () => this.game.events.emit("input:loot-close"));
    const closeHitArea = this.add
      .zone(1030, 106, 250, 62)
      .setDepth(106)
      .setInteractive({ useHandCursor: true });
    closeHitArea.on(Phaser.Input.Events.POINTER_DOWN, () => this.game.events.emit("input:loot-close"));
    this.lootObjects.push(closeButton, closeHitArea);
    const revealedItemIds = new Set(state.revealedItemIds ?? []);
    const unknownItemCount = state.chestItems.filter((item) => !revealedItemIds.has(item.id)).length;

    const leftHeading = this.add
      .text(
        132,
        150,
        state.chestId
          ? `箱内物品 ${state.chestItems.length}${unknownItemCount > 0 ? ` · 未搜索 ${unknownItemCount}` : " · 已全部识别"}`
          : "当前没有打开的容器",
        {
        fontFamily: "Microsoft YaHei, sans-serif",
        fontSize: "18px",
        color: "#d8dedf",
        },
      )
      .setDepth(102);
    const rightHeading = this.add
      .text(474, 150, "出战负载", {
        fontFamily: "Microsoft YaHei, sans-serif",
        fontSize: "18px",
        color: "#d8dedf",
      })
      .setDepth(102);
    this.lootObjects.push(leftHeading, rightHeading);

    state.chestItems.slice(0, 5).forEach((item, index) => {
      const x = 132;
      const y = 190 + index * 76;
      this.createChestItemCard(
        item,
        state.chestId!,
        x,
        y,
        index + 1,
        revealedItemIds.has(item.id),
        state.searchingItemId === item.id,
        state.searchingItemId === item.id ? state.searchProgress ?? 0 : 0,
        loadout.weapon,
      );
    });
    if (state.chestItems.length > 5) {
      const overflow = this.add
        .text(132, 565, `还有 ${state.chestItems.length - 5} 件，取走上方物品后显示`, {
          fontFamily: "Microsoft YaHei, sans-serif",
          fontSize: "13px",
          color: "#9facb0",
        })
        .setDepth(103);
      this.lootObjects.push(overflow);
    }

    this.drawLoadout(loadout, true);
  }

  private handleLootMessage(message: string): void {
    if (!this.lootHint.visible) return;
    const version = ++this.lootMessageVersion;
    this.lootHint.setText(message).setColor("#f2d399");
    this.time.delayedCall(1800, () => {
      if (version !== this.lootMessageVersion || !this.lootHint.visible) return;
      this.lootHint.setText(LOOT_HINT).setColor("#aeb9bc");
    });
  }

  private createChestItemCard(
    item: LootItem,
    chestId: string,
    x: number,
    y: number,
    slotNumber: number,
    revealed: boolean,
    searching: boolean,
    searchProgress: number,
    currentWeapon: ItemInstance | undefined,
  ): void {
    const color = revealed ? this.rarityColor(item.rarity) : searching ? 0xa58d68 : 0x465158;
    const card = this.add
      .rectangle(x, y, 276, 64, revealed ? 0x172027 : 0x050709, 1)
      .setOrigin(0)
      .setStrokeStyle(2, color, 0.9)
      .setDepth(102)
      .setInteractive({ useHandCursor: true });
    card.on(Phaser.Input.Events.POINTER_OVER, () => card.setFillStyle(revealed ? 0x253139 : 0x101519, 1));
    card.on(Phaser.Input.Events.POINTER_OUT, () => card.setFillStyle(revealed ? 0x172027 : 0x050709, 1));
    card.on(Phaser.Input.Events.POINTER_DOWN, () => {
      this.game.events.emit("loot:take", { chestId, itemId: item.id });
    });
    const icon = this.add.graphics().setDepth(103);
    if (revealed) this.drawLootIcon(icon, item, x + 32, y + 32, 0.58);
    else this.drawUnknownLootIcon(icon, item, x + 32, y + 32, searching);
    const name = this.add
      .text(x + 62, y + 9, `${slotNumber}. ${revealed ? item.name : "未知物品"}`, {
        fontFamily: "Microsoft YaHei, sans-serif",
        fontSize: "16px",
        fontStyle: "bold",
        color: revealed ? "#edf1f1" : "#9aa4a8",
      })
      .setDepth(103);
    const detail = this.add
      .text(
        x + 62,
        y + 35,
        revealed
          ? this.lootItemDetail(item, currentWeapon)
          : searching
            ? `${item.width}×${item.height} · 搜索中 ${Math.round(searchProgress * 100)}%`
            : `${item.width}×${item.height} · 点击或按 ${slotNumber} 搜索`,
        {
        fontFamily: "Microsoft YaHei, sans-serif",
        fontSize: revealed && item.weaponStats ? "12px" : "14px",
        color: revealed ? this.lootItemDetailColor(item, currentWeapon) : searching ? "#d5b982" : "#6f7b80",
        },
      )
      .setDepth(103);
    if (searching) {
      const progressBack = this.add.rectangle(x + 2, y + 59, 272, 3, 0x242d32, 1).setOrigin(0).setDepth(103);
      const progressFill = this.add
        .rectangle(x + 2, y + 59, 272, 3, 0xd69a48, 1)
        .setOrigin(0)
        .setScale(Phaser.Math.Clamp(searchProgress, 0, 1), 1)
        .setDepth(104);
      this.lootSearchProgressItemId = item.id;
      this.lootSearchProgressFill = progressFill;
      this.lootSearchProgressText = detail;
      this.lootObjects.push(progressBack, progressFill);
    }
    this.lootObjects.push(card, icon, name, detail);
  }

  private lootItemDetail(item: LootItem, currentWeapon: ItemInstance | undefined): string {
    if (!item.weaponStats) {
      const suffix = item.tags.includes("armor") ? " · 战利品" : "";
      return `${item.width}×${item.height} · 价值 ${item.value}${suffix}`;
    }
    const attacksPerSecond = 1000 / item.weaponStats.attackIntervalMs;
    const candidateDps = weaponDamagePerSecond(item);
    const currentDps = currentWeapon ? weaponDamagePerSecond(currentWeapon) : undefined;
    const delta = candidateDps !== undefined && currentDps
      ? Math.round(((candidateDps / currentDps) - 1) * 100)
      : undefined;
    const comparison = delta === undefined ? "未装备武器" : delta === 0 ? "— 持平" : `${delta > 0 ? "↑" : "↓"}${Math.abs(delta)}%`;
    return `伤${item.weaponStats.damage} · 攻${attacksPerSecond.toFixed(2)}/s · 暴${Math.round(item.weaponStats.critChance * 100)}%\n${item.width}×${item.height} · 预计 ${comparison}`;
  }

  private lootItemDetailColor(item: LootItem, currentWeapon: ItemInstance | undefined): string {
    const candidateDps = weaponDamagePerSecond(item);
    const currentDps = currentWeapon ? weaponDamagePerSecond(currentWeapon) : undefined;
    if (candidateDps === undefined || currentDps === undefined) return this.rarityTextColor(item.rarity);
    if (Math.abs(candidateDps - currentDps) < 0.05) return "#879397";
    return candidateDps > currentDps ? "#69c58f" : "#d87972";
  }

  private drawUnknownLootIcon(
    graphics: Phaser.GameObjects.Graphics,
    item: LootItem,
    centerX: number,
    centerY: number,
    searching: boolean,
  ): void {
    const scale = Math.min(1, 34 / Math.max(item.width, item.height));
    const width = Math.max(14, item.width * 14 * scale);
    const height = Math.max(14, item.height * 14 * scale);
    graphics.fillStyle(0x020304, 0.96).fillRoundedRect(centerX - width / 2, centerY - height / 2, width, height, 4);
    graphics.lineStyle(2, searching ? 0xa58d68 : 0x465158, 0.95);
    graphics.strokeRoundedRect(centerX - width / 2, centerY - height / 2, width, height, 4);
    graphics.lineStyle(1, 0x182127, 0.8);
    graphics.lineBetween(centerX - width / 3, centerY + height / 3, centerX + width / 3, centerY - height / 3);
    graphics.lineBetween(centerX - width / 3, centerY, centerX, centerY - height / 3);
  }

  private handleLootSearchProgress(payload: { itemId: string; progress: number }): void {
    if (
      payload.itemId !== this.lootSearchProgressItemId
      || !this.lootSearchProgressFill
      || !this.lootSearchProgressText
    ) return;
    const progress = Phaser.Math.Clamp(payload.progress, 0, 1);
    this.lootSearchProgressFill.setScale(progress, 1);
    const sizePrefix = this.lootSearchProgressText.text.split(" · ")[0];
    this.lootSearchProgressText.setText(`${sizePrefix} · 搜索中 ${Math.round(progress * 100)}%`);
  }

  private drawLoadout(loadout: NonNullable<LootUiState["loadout"]>, dragEnabled: boolean): void {
    this.lootGraphics.fillStyle(0x0b1115, 1).fillRoundedRect(474, 184, 672, 66, 10);
    this.lootGraphics.lineStyle(1, 0x344148, 0.9).strokeRoundedRect(474, 184, 672, 66, 10);
    const weaponLabel = this.add
      .text(494, 196, "武器位", {
        fontFamily: "Microsoft YaHei, sans-serif",
        fontSize: "14px",
        color: "#9facb0",
      })
      .setDepth(103);
    const weaponName = this.add
      .text(574, 194, loadout.weapon?.name ?? "未装备", {
        fontFamily: "Microsoft YaHei, sans-serif",
        fontSize: "18px",
        fontStyle: "bold",
        color: "#e7ecec",
      })
      .setDepth(103);
    const weaponStats = loadout.weapon?.weaponStats;
    const weaponStatsText = this.add
      .text(
        574,
        221,
        weaponStats
          ? `伤害 ${weaponStats.damage} · 攻击 ${((1000 / weaponStats.attackIntervalMs)).toFixed(2)}/秒 · 暴击 ${Math.round(weaponStats.critChance * 100)}% · DPS ${weaponDamagePerSecond(loadout.weapon!)?.toFixed(1)}`
          : "当前武器没有战斗属性",
        {
          fontFamily: "Microsoft YaHei, sans-serif",
          fontSize: "13px",
          color: "#96a3a7",
        },
      )
      .setDepth(103);
    const weaponButton = this.add
      .rectangle(474, 184, 672, 66, 0xffffff, 0.001)
      .setOrigin(0)
      .setDepth(104)
      .setInteractive({ useHandCursor: true });
    weaponButton.on(Phaser.Input.Events.POINTER_OVER, () => weaponButton.setStrokeStyle(2, 0x62d48c, 0.5));
    weaponButton.on(Phaser.Input.Events.POINTER_OUT, () => weaponButton.setStrokeStyle());
    weaponButton.on(Phaser.Input.Events.POINTER_DOWN, () => {
      if (loadout.weapon) {
        this.game.events.emit("loadout:item-action", { source: "weapon", itemId: loadout.weapon.id });
      }
    });
    this.lootObjects.push(weaponLabel, weaponName, weaponStatsText, weaponButton);
    if (loadout.weapon) {
      const weaponIcon = this.add.graphics().setDepth(103);
      this.drawLootIcon(weaponIcon, loadout.weapon, 548, 218, 0.5);
      this.lootObjects.push(weaponIcon);
    }

    this.drawContainer(loadout, loadout.rig, 474, 282, 302, 280, "胸挂", dragEnabled);
    if (loadout.backpack) {
      this.drawContainer(loadout, loadout.backpack, 800, 282, 346, 280, "背包", dragEnabled);
    }
  }

  private drawContainer(
    loadout: NonNullable<LootUiState["loadout"]>,
    container: ContainerState,
    originX: number,
    originY: number,
    maxWidth: number,
    maxHeight: number,
    roleLabel: string,
    dragEnabled: boolean,
  ): void {
    if (container.kind !== "rig" && container.kind !== "backpack") return;
    const containerSlot = container.kind;
    const bounds = container.pockets.reduce(
      (current, pocket) => ({
        width: Math.max(current.width, pocket.definition.offsetX + pocket.definition.width),
        height: Math.max(current.height, pocket.definition.offsetY + pocket.definition.height),
      }),
      { width: 1, height: 1 },
    );
    const heading = this.add
      .text(originX, originY - 24, `${roleLabel} · ${container.name}`, {
        fontFamily: "Microsoft YaHei, sans-serif",
        fontSize: "16px",
        color: "#d8dedf",
      })
      .setDepth(103);
    const usage = this.add
      .text(originX + maxWidth, originY - 24, `${containerUsedCells(container)}/${containerCapacity(container)}`, {
        fontFamily: "Microsoft YaHei, sans-serif",
        fontSize: "14px",
        color: "#9facb0",
      })
      .setOrigin(1, 0)
      .setDepth(103);
    this.lootObjects.push(heading, usage);

    const cell = Math.min(46, maxWidth / bounds.width, maxHeight / bounds.height);
    for (const pocket of container.pockets) {
      const pocketX = originX + pocket.definition.offsetX * cell;
      const pocketY = originY + pocket.definition.offsetY * cell;
      this.loadoutDropZones.push({
        container: containerSlot,
        pocketId: pocket.definition.id,
        x: pocketX,
        y: pocketY,
        width: pocket.definition.width,
        height: pocket.definition.height,
        cell,
      });
      for (let y = 0; y < pocket.definition.height; y += 1) {
        for (let x = 0; x < pocket.definition.width; x += 1) {
          if (pocket.definition.mask && pocket.definition.mask[y]?.[x] !== true) continue;
          this.lootGraphics.fillStyle(pocket.definition.quickAccess ? 0x131d21 : 0x0b1115, 1);
          this.lootGraphics.fillRoundedRect(pocketX + x * cell, pocketY + y * cell, cell - 4, cell - 4, 5);
          this.lootGraphics.lineStyle(1, pocket.definition.quickAccess ? 0x8a653c : 0x2b373d, 0.85);
          this.lootGraphics.strokeRoundedRect(pocketX + x * cell, pocketY + y * cell, cell - 4, cell - 4, 5);
        }
      }
      for (const placement of pocket.placements) {
        const size = rotatedSize(placement.item, placement.rotated);
        const x = pocketX + placement.x * cell;
        const y = pocketY + placement.y * cell;
        const width = size.width * cell - 4;
        const height = size.height * cell - 4;
        const rarity = placement.item.rarity ?? "common";
        this.lootGraphics.fillStyle(0x182229, 0.98).fillRoundedRect(x, y, width, height, 7);
        this.lootGraphics.lineStyle(3, this.rarityColor(rarity), 0.95).strokeRoundedRect(x, y, width, height, 7);
        const icon = this.add.graphics().setDepth(103);
        this.drawLootIcon(icon, placement.item, x + width / 2, y + height / 2, Math.min(0.9, Math.min(width, height) / 56));
        const hitArea = this.add
          .rectangle(x, y, width, height, 0xffffff, 0.001)
          .setOrigin(0)
          .setDepth(104)
          .setInteractive({ useHandCursor: true });
        this.input.setDraggable(hitArea, dragEnabled);
        let pressX = 0;
        let pressY = 0;
        let grabCellX = 0;
        let grabCellY = 0;
        let dragged = false;
        let modifiedAction = false;
        hitArea.on(Phaser.Input.Events.POINTER_OVER, () => {
          if (!dragged) hitArea.setStrokeStyle(2, 0xf0e4d2, 0.55);
        });
        hitArea.on(Phaser.Input.Events.POINTER_OUT, () => {
          if (!dragged) hitArea.setStrokeStyle();
        });
        hitArea.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
          pressX = pointer.x;
          pressY = pointer.y;
          dragged = false;
          const shiftKey = Boolean((pointer.event as MouseEvent).shiftKey);
          modifiedAction = pointer.rightButtonDown() || shiftKey;
          const payload = { source: containerSlot, itemId: placement.item.id };
          if (pointer.rightButtonDown()) {
            this.game.events.emit("loadout:item-discard", payload);
          } else if (shiftKey) {
            this.game.events.emit("loadout:item-rotate", payload);
          }
        });
        hitArea.on(Phaser.Input.Events.POINTER_UP, (pointer: Phaser.Input.Pointer) => {
          const distance = Phaser.Math.Distance.Between(pressX, pressY, pointer.x, pointer.y);
          if (!modifiedAction && !dragged && distance < 9) {
            this.game.events.emit("loadout:item-action", {
              source: containerSlot,
              itemId: placement.item.id,
            });
          }
        });
        hitArea.on(Phaser.Input.Events.DRAG_START, (_pointer: Phaser.Input.Pointer) => {
          if (modifiedAction || !dragEnabled) return;
          dragged = true;
          grabCellX = Phaser.Math.Clamp(Math.floor((pressX - x) / cell), 0, size.width - 1);
          grabCellY = Phaser.Math.Clamp(Math.floor((pressY - y) / cell), 0, size.height - 1);
          hitArea.setDepth(130).setFillStyle(this.rarityColor(rarity), 0.25);
          this.game.events.emit("loadout:drag-state", true);
        });
        hitArea.on(
          Phaser.Input.Events.DRAG,
          (pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
            if (!dragged) return;
            if (this.input.manager.pointers.filter((activePointer) => activePointer.isDown).length > 1) {
              hitArea.setPosition(x, y).setDepth(104).setFillStyle(0xffffff, 0.001).setStrokeStyle();
              dragged = false;
              this.game.events.emit("loadout:drag-state", false);
              return;
            }
            hitArea.setPosition(dragX, dragY);
            const destination = this.resolveLoadoutDrop(pointer.x, pointer.y, grabCellX, grabCellY);
            const preview = destination
              ? moveStoredItemToPosition(
                  loadout,
                  placement.item.id,
                  containerSlot,
                  destination.container,
                  destination.pocketId,
                  destination.x,
                  destination.y,
                )
              : undefined;
            hitArea.setStrokeStyle(3, preview?.ok ? 0x62d48c : 0xd7675f, 0.95);
          },
        );
        hitArea.on(Phaser.Input.Events.DRAG_END, (pointer: Phaser.Input.Pointer) => {
          if (!dragged) return;
          const destination = this.resolveLoadoutDrop(pointer.x, pointer.y, grabCellX, grabCellY);
          const cancelled = pointer.event?.type === "touchcancel" || pointer.event?.type === "pointercancel";
          hitArea.setPosition(x, y).setDepth(104).setFillStyle(0xffffff, 0.001).setStrokeStyle();
          dragged = false;
          if (!cancelled && destination) {
            this.game.events.emit("loadout:item-drop", {
              source: containerSlot,
              itemId: placement.item.id,
              target: destination.container,
              pocketId: destination.pocketId,
              x: destination.x,
              y: destination.y,
            });
          }
          this.game.events.emit("loadout:drag-state", false);
        });
        this.lootObjects.push(icon, hitArea);
      }
    }
  }

  private resolveLoadoutDrop(
    pointerX: number,
    pointerY: number,
    grabCellX: number,
    grabCellY: number,
  ): (LoadoutDropZone & { x: number; y: number }) | undefined {
    const zone = this.loadoutDropZones.find((candidate) =>
      pointerX >= candidate.x
      && pointerX < candidate.x + candidate.width * candidate.cell
      && pointerY >= candidate.y
      && pointerY < candidate.y + candidate.height * candidate.cell,
    );
    if (!zone) return undefined;
    return {
      ...zone,
      x: Math.floor((pointerX - zone.x) / zone.cell) - grabCellX,
      y: Math.floor((pointerY - zone.y) / zone.cell) - grabCellY,
    };
  }

  private drawLootIcon(
    graphics: Phaser.GameObjects.Graphics,
    item: LootItem | ItemInstance,
    centerX: number,
    centerY: number,
    scale: number,
  ): void {
    const rarity = this.rarityColor(item.rarity ?? "common");
    graphics.fillStyle(0x05080a, 0.55).fillEllipse(centerX + 3, centerY + 8, 42 * scale, 15 * scale);
    graphics.lineStyle(3 * scale, rarity, 0.9);
    switch (item.icon ?? "pouch") {
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
    return rarity === "red"
      ? 0xd24f4b
      : rarity === "rare"
        ? 0xa56de2
        : rarity === "magic"
          ? 0x4d9fdc
          : 0xaab2b4;
  }

  private rarityTextColor(rarity: LootRarity): string {
    return rarity === "red"
      ? "#ef8b86"
      : rarity === "rare"
        ? "#c49aef"
        : rarity === "magic"
          ? "#72b9eb"
          : "#bfc6c8";
  }

  private clearLootObjects(): void {
    this.lootObjects.forEach((object) => object.destroy());
    this.lootObjects = [];
    this.loadoutDropZones = [];
    this.lootSearchProgressItemId = undefined;
    this.lootSearchProgressFill = undefined;
    this.lootSearchProgressText = undefined;
  }

  private renderStatus(): void {
    const state = this.hudState;
    const healthRatio = Phaser.Math.Clamp(state.hp / state.maxHp, 0, 1);

    this.statusGraphics.clear();
    this.statusGraphics.fillStyle(0x080b0f, 0.82).fillRoundedRect(24, 22, 390, 160, 12);
    this.statusGraphics.lineStyle(1, 0x465057, 0.8).strokeRoundedRect(24, 22, 390, 160, 12);
    this.statusGraphics.fillStyle(0x11171c, 1).fillRoundedRect(34, 72, 278, 18, 5);
    this.statusGraphics.fillStyle(healthRatio > 0.3 ? 0xc84f46 : 0xe38b36, 1);
    this.statusGraphics.fillRoundedRect(36, 74, 274 * healthRatio, 14, 4);
    this.statusGraphics.lineStyle(1, 0xd4d9da, 0.35).strokeRoundedRect(34, 72, 278, 18, 5);

    this.objectiveText.setText(state.objective);
    this.statusText.setText(
      `生命 ${Math.ceil(state.hp)} / ${state.maxHp}   ·   行囊 ${state.inventoryUsed}/${state.inventoryCapacity}\n探索 ${state.roomsExplored}/${state.totalRooms}   ·   药剂 ${state.potions}   ·   翻滚 ${state.rollReady ? "就绪" : "冷却"}`,
    );
    const profileStatus =
      this.profileSummary.status === "recovered"
        ? " · 档案已恢复"
        : this.profileSummary.status === "unavailable"
          ? " · 存档不可用"
          : this.profileSummary.status === "unsupported"
            ? " · 需要新版游戏"
            : "";
    this.profileText
      .setText(
        `仓库 ${this.profileSummary.warehouseItemCount} 件 · 成功撤离 ${this.profileSummary.successfulExtractions} · 累计价值 ${this.profileSummary.totalExtractedValue}${profileStatus}`,
      )
      .setColor(
        this.profileSummary.status === "unavailable" || this.profileSummary.status === "unsupported"
          ? "#d88479"
          : "#9facb0",
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
    if (mapState.revision === this.lastMapRevision) return;
    this.lastMapRevision = mapState.revision;

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
    this.game.events.off("loot:message", this.handleLootMessage, this);
    this.game.events.off("loot:search-progress", this.handleLootSearchProgress, this);
    this.game.events.off("extraction:state", this.handleExtractionState, this);
    this.game.events.off("extraction:result", this.handleExtractionResult, this);
    this.game.events.off("profile:state", this.handleProfileState, this);
  }
}


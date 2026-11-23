import Phaser from "phaser";
import { weaponDamagePerSecond, type ItemInstance, type ItemRarity } from "../domain/loadout";
import {
  commitWarehouseSale,
  createDefaultProfile,
  loadProfile,
  warehouseSaleValue,
  type PlayerProfile,
  type ProfileLoadStatus,
} from "../profile/profileStore";
import { describeItem } from "./itemPresentation";

type HubView = "home" | "warehouse" | "market";

const FONT = "Microsoft YaHei, PingFang SC, sans-serif";
const MONO = "Consolas, Microsoft YaHei, monospace";

export class HubScene extends Phaser.Scene {
  private graphics!: Phaser.GameObjects.Graphics;
  private objects: Phaser.GameObjects.GameObject[] = [];
  private profile: PlayerProfile = createDefaultProfile();
  private profileStatus: ProfileLoadStatus = "new";
  private view: HubView = "home";
  private selectedItemId?: string;
  private confirmingSaleId?: string;
  private notice = "";

  constructor() {
    super("HubScene");
  }

  create(): void {
    this.registry.set("appMode", "hub");
    this.registry.set("lootPanelOpen", false);
    this.registry.set("itemDetailOpen", false);
    this.registry.remove("mapState");
    this.graphics = this.add.graphics();
    this.reloadProfile();
    this.input.keyboard?.on("keydown", this.handleKeyDown, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off("keydown", this.handleKeyDown, this);
      this.clearObjects();
    });
    this.render();
    this.game.events.emit("hud:banner", "灰烬前厅。按 Enter 进入探索，数字 1 到 3 切换区域。 ");
  }

  private reloadProfile(): void {
    try {
      const loaded = loadProfile(window.localStorage);
      this.profile = loaded.profile;
      this.profileStatus = loaded.status;
    } catch {
      this.profile = createDefaultProfile();
      this.profileStatus = "unavailable";
    }
    if (this.selectedItemId && !this.profile.warehouse.some((item) => item.id === this.selectedItemId)) {
      this.selectedItemId = undefined;
    }
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (event.repeat) return;
    if (event.code === "Digit1" || event.code === "Numpad1") this.openView("home");
    else if (event.code === "Digit2" || event.code === "Numpad2") this.openView("warehouse");
    else if (event.code === "Digit3" || event.code === "Numpad3") this.openView("market");
    else if (event.code === "Escape" && this.view !== "home") this.openView("home");
    else if (event.code === "Enter" && this.view === "home") this.startExploration();
  }

  private openView(view: HubView): void {
    this.view = view;
    this.confirmingSaleId = undefined;
    this.notice = "";
    this.reloadProfile();
    if (!this.selectedItemId) this.selectedItemId = this.profile.warehouse[0]?.id;
    this.render();
    this.game.events.emit("hud:banner", view === "home" ? "灰烬前厅" : view === "warehouse" ? "仓库" : "灰市交易行");
  }

  private startExploration(): void {
    this.registry.set("appMode", "run");
    this.scene.start("GameScene");
  }

  private render(): void {
    this.clearObjects();
    this.graphics.clear();
    this.drawBackground();
    this.drawNavigation();
    if (this.view === "home") this.drawHome();
    else if (this.view === "warehouse") this.drawWarehouse();
    else this.drawMarket();
  }

  private drawBackground(): void {
    this.cameras.main.setBackgroundColor("#05070a");
    this.graphics.fillStyle(0x05070a, 1).fillRect(0, 0, 1280, 720);
    this.graphics.fillStyle(0x32130d, 0.34).fillEllipse(650, 720, 920, 310);
    this.graphics.fillStyle(0x10171b, 0.95).fillRoundedRect(24, 24, 184, 672, 8);
    this.graphics.lineStyle(1, 0x374249, 0.9).strokeRoundedRect(24, 24, 184, 672, 8);
    for (let index = 0; index < 9; index += 1) {
      const x = 238 + ((index * 137) % 970);
      const y = 55 + ((index * 83) % 590);
      const radius = 2 + (index % 3);
      this.graphics.fillStyle(index % 2 === 0 ? 0xe8662c : 0xd3923c, 0.2 + (index % 3) * 0.08);
      this.graphics.fillCircle(x, y, radius);
    }
  }

  private drawNavigation(): void {
    this.addText(44, 48, "灰烬地穴", { fontSize: "24px", fontStyle: "bold", color: "#e3e8e9" });
    this.addText(45, 81, "A S H E N   V A U L T", { fontFamily: MONO, fontSize: "10px", color: "#6f7c81" });
    this.graphics.lineStyle(2, 0x8e3820, 0.7)
      .beginPath().moveTo(44, 111).lineTo(70, 117).lineTo(96, 108).lineTo(130, 116).strokePath();

    const entries: Array<{ view: HubView; label: string; key: string }> = [
      { view: "home", label: "灰烬前厅", key: "1" },
      { view: "warehouse", label: "仓库", key: "2" },
      { view: "market", label: "交易行", key: "3" },
    ];
    entries.forEach((entry, index) => this.createNavButton(40, 152 + index * 54, 152, 42, entry, this.view === entry.view));

    this.graphics.lineStyle(1, 0x273138, 0.9).lineBetween(40, 557, 192, 557);
    this.addText(44, 576, "灰烬币", { fontSize: "12px", color: "#7f8c91" });
    this.addText(44, 598, this.profile.credits.toLocaleString("zh-CN"), {
      fontFamily: MONO,
      fontSize: "22px",
      fontStyle: "bold",
      color: "#e4b45e",
    });
    this.addText(44, 640, "M  静音", { fontSize: "12px", color: "#6f7c81" });
    this.addText(44, 663, this.profileStatusText(), {
      fontSize: "11px",
      color: this.profileStatus === "unavailable" || this.profileStatus === "unsupported" ? "#c7746d" : "#647176",
    });
  }

  private drawHome(): void {
    this.drawPanel(224, 24, 680, 672);
    this.drawPanel(920, 24, 336, 318);
    this.drawPanel(920, 358, 336, 338);

    this.addText(252, 48, "灰烬前厅", { fontSize: "24px", fontStyle: "bold", color: "#e3e8e9" });
    this.addText(252, 81, "下一次行动从这里开始", { fontSize: "13px", color: "#849196" });
    this.drawAshenGate();

    this.graphics.fillStyle(0x0e1519, 0.96).fillRoundedRect(244, 530, 640, 142, 6);
    this.graphics.lineStyle(1, 0x374249, 0.85).strokeRoundedRect(244, 530, 640, 142, 6);
    this.addText(268, 552, "灰烬地穴", { fontSize: "20px", fontStyle: "bold", color: "#e2d4b5" });
    this.addText(268, 584, "目标：击败遗迹守门人，搜寻物资并安全撤离", { fontSize: "13px", color: "#96a3a7" });
    this.addText(268, 611, "基础配置 · 铁誓长剑 · 突击胸挂 · 远征背包", { fontSize: "12px", color: "#6f7c81" });
    this.createButton(620, 602, 238, 48, "进入探索   Enter", "primary", () => this.startExploration());

    const warehouseValue = this.profile.warehouse.reduce((total, item) => total + item.value, 0);
    this.addText(946, 50, "铁誓猎人", { fontSize: "20px", fontStyle: "bold", color: "#e3e8e9" });
    this.addText(946, 80, "近战探索者 · 基础配置", { fontSize: "12px", color: "#7f8c91" });
    this.drawHunterEmblem(1183, 73);
    this.drawStatRow(946, 126, "仓库物品", `${this.profile.warehouse.length} 件`);
    this.drawStatRow(946, 158, "仓库估值", warehouseValue.toLocaleString("zh-CN"));
    this.drawStatRow(946, 190, "成功撤离", `${this.profile.successfulExtractions} 次`);
    this.drawStatRow(946, 222, "累计带出价值", this.profile.totalExtractedValue.toLocaleString("zh-CN"));
    this.drawStatRow(946, 254, "可用灰烬币", this.profile.credits.toLocaleString("zh-CN"), "#e4b45e");

    this.addText(946, 384, "最近撤离", { fontSize: "18px", fontStyle: "bold", color: "#e3e8e9" });
    const record = this.profile.lastExtraction;
    if (!record) {
      this.addText(946, 432, "尚无撤离记录", { fontSize: "16px", color: "#96a3a7" });
      this.addText(946, 465, "第一次带回物资后，\n这里会留下行动摘要。", {
        fontSize: "13px", color: "#6f7c81", lineSpacing: 8,
      });
      return;
    }
    const date = new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .format(new Date(record.extractedAt));
    this.addText(946, 421, record.mode === "normal" ? "完整撤离" : "丢包撤离", {
      fontSize: "16px",
      fontStyle: "bold",
      color: record.mode === "normal" ? "#62d48c" : "#d6a35c",
    });
    this.addText(1228, 424, date, { fontSize: "11px", color: "#6f7c81" }).setOrigin(1, 0);
    this.drawStatRow(946, 468, "带出物品", `${record.retainedItemIds.length} 件`);
    this.drawStatRow(946, 500, "带出价值", record.retainedValue.toLocaleString("zh-CN"));
    this.drawStatRow(946, 532, "丢失价值", record.droppedValue.toLocaleString("zh-CN"), record.droppedValue > 0 ? "#c7746d" : "#c7d0d2");
    this.drawStatRow(946, 564, "腐化变化", `${record.corruptionBefore} → ${record.corruptionAfter}`);
    this.createButton(946, 616, 138, 36, "查看仓库", "secondary", () => this.openView("warehouse"));
  }

  private drawAshenGate(): void {
    const centerX = 564;
    this.graphics.fillStyle(0x1b2023, 1).fillCircle(centerX, 273, 154);
    this.graphics.fillRect(centerX - 154, 273, 308, 210);
    this.graphics.fillStyle(0x3b4143, 0.8).fillCircle(centerX, 273, 133);
    this.graphics.fillRect(centerX - 133, 273, 266, 210);
    this.graphics.fillStyle(0x090b0d, 1).fillCircle(centerX, 273, 112);
    this.graphics.fillRect(centerX - 112, 273, 224, 210);
    this.graphics.fillStyle(0x491b12, 0.32).fillEllipse(centerX, 415, 206, 92);
    this.graphics.lineStyle(4, 0xb34b24, 0.55)
      .beginPath().moveTo(470, 455).lineTo(521, 432).lineTo(551, 449).lineTo(600, 420).lineTo(653, 448).strokePath();
    this.graphics.fillStyle(0x13191c, 1).fillEllipse(355, 476, 122, 38);
    this.graphics.fillStyle(0x292e31, 1).fillCircle(355, 418, 34);
    this.graphics.fillStyle(0x171c1f, 1).fillTriangle(315, 491, 355, 404, 399, 491);
    this.graphics.fillStyle(0xe8662c, 0.72).fillCircle(407, 388, 7);
    this.graphics.fillStyle(0xd3923c, 0.55).fillCircle(711, 402, 8);
    this.addText(533, 306, "遗迹之门", { fontSize: "13px", color: "#5f686c" });
  }

  private drawWarehouse(): void {
    this.drawPanel(224, 24, 680, 672);
    this.drawPanel(920, 24, 336, 672);
    const totalValue = this.profile.warehouse.reduce((total, item) => total + item.value, 0);
    this.addText(248, 48, "仓库", { fontSize: "24px", fontStyle: "bold", color: "#e3e8e9" });
    this.addText(248, 83, `${this.profile.warehouse.length} 件物品 · 总估值 ${totalValue.toLocaleString("zh-CN")}`, {
      fontSize: "13px", color: "#849196",
    });
    this.addText(870, 55, "按 3 前往交易行", { fontSize: "11px", color: "#6f7c81" }).setOrigin(1, 0);

    if (this.profile.warehouse.length === 0) {
      this.addText(564, 300, "仓库空空如也", { fontSize: "22px", color: "#96a3a7" }).setOrigin(0.5);
      this.addText(564, 340, "从地穴成功撤离后，带出的物品会存放在这里。", { fontSize: "13px", color: "#6f7c81" }).setOrigin(0.5);
      this.drawEmptyDetail("尚未选择物品");
      return;
    }

    const items = [...this.profile.warehouse].sort((first, second) => second.value - first.value).slice(0, 21);
    if (!this.selectedItemId || !items.some((item) => item.id === this.selectedItemId)) this.selectedItemId = items[0].id;
    items.forEach((item, index) => {
      const column = index % 3;
      const row = Math.floor(index / 3);
      this.drawWarehouseCard(item, 246 + column * 216, 122 + row * 72, 204, 62, item.id === this.selectedItemId);
    });
    if (this.profile.warehouse.length > 21) {
      this.addText(248, 654, `另有 ${this.profile.warehouse.length - 21} 件 · 后续加入分页与筛选`, { fontSize: "11px", color: "#6f7c81" });
    }
    this.drawItemDetail(this.profile.warehouse.find((item) => item.id === this.selectedItemId));
  }

  private drawMarket(): void {
    this.drawPanel(224, 24, 680, 672);
    this.drawPanel(920, 24, 336, 672);
    this.addText(248, 48, "灰市交易行", { fontSize: "24px", fontStyle: "bold", color: "#e3e8e9" });
    this.addText(248, 83, "NPC 收购委托 · 装备/赤红 35% · 补给 45% · 贵重品 55%", {
      fontSize: "12px", color: "#849196",
    });
    this.addText(878, 54, `余额 ${this.profile.credits.toLocaleString("zh-CN")}`, {
      fontFamily: MONO, fontSize: "16px", fontStyle: "bold", color: "#e4b45e",
    }).setOrigin(1, 0);
    this.graphics.fillStyle(0x121a1e, 1).fillRoundedRect(246, 116, 638, 42, 4);
    this.addText(264, 129, "出售仓库物资", { fontSize: "13px", fontStyle: "bold", color: "#d6a35c" });
    this.addText(858, 129, "购买委托将在整备系统完成后开放", { fontSize: "11px", color: "#6f7c81" }).setOrigin(1, 0);

    const items = [...this.profile.warehouse].sort((first, second) => warehouseSaleValue(second) - warehouseSaleValue(first)).slice(0, 9);
    if (items.length === 0) {
      this.addText(565, 330, "没有可出售的仓库物资", { fontSize: "20px", color: "#96a3a7" }).setOrigin(0.5);
      this.addText(565, 370, "先进入地穴并带回战利品。", { fontSize: "13px", color: "#6f7c81" }).setOrigin(0.5);
      this.drawEmptyDetail("交易详情");
      return;
    }
    if (!this.selectedItemId || !items.some((item) => item.id === this.selectedItemId)) this.selectedItemId = items[0].id;
    items.forEach((item, index) => this.drawMarketRow(item, 246, 176 + index * 52, 638, 44, item.id === this.selectedItemId));
    this.drawTradeDetail(this.profile.warehouse.find((item) => item.id === this.selectedItemId));
  }

  private drawWarehouseCard(item: ItemInstance, x: number, y: number, width: number, height: number, selected: boolean): void {
    const card = this.add.rectangle(x, y, width, height, selected ? 0x1b292f : 0x11191d, 1)
      .setOrigin(0).setStrokeStyle(selected ? 2 : 1, selected ? this.rarityColor(item.rarity) : 0x2f3a40, selected ? 0.9 : 0.7)
      .setDepth(4).setInteractive({ useHandCursor: true });
    card.on(Phaser.Input.Events.POINTER_OVER, () => card.setFillStyle(0x1b252a, 1));
    card.on(Phaser.Input.Events.POINTER_OUT, () => card.setFillStyle(selected ? 0x1b292f : 0x11191d, 1));
    card.on(Phaser.Input.Events.POINTER_DOWN, () => {
      this.selectedItemId = item.id;
      this.confirmingSaleId = undefined;
      this.render();
    });
    this.objects.push(card);
    this.drawItemIcon(item, x + 28, y + 31, 0.48);
    this.addText(x + 54, y + 10, item.name, { fontSize: "13px", fontStyle: "bold", color: "#e0e6e7" });
    this.addText(x + 54, y + 34, `${item.width}×${item.height} · 价值 ${item.value}`, {
      fontSize: "11px", color: this.rarityTextColor(item.rarity),
    });
  }

  private drawMarketRow(item: ItemInstance, x: number, y: number, width: number, height: number, selected: boolean): void {
    const row = this.add.rectangle(x, y, width, height, selected ? 0x1b292f : 0x10181c, 1)
      .setOrigin(0).setStrokeStyle(1, selected ? 0x8f7652 : 0x273138, 0.9)
      .setDepth(4).setInteractive({ useHandCursor: true });
    row.on(Phaser.Input.Events.POINTER_OVER, () => row.setFillStyle(0x1a2429, 1));
    row.on(Phaser.Input.Events.POINTER_OUT, () => row.setFillStyle(selected ? 0x1b292f : 0x10181c, 1));
    row.on(Phaser.Input.Events.POINTER_DOWN, () => {
      this.selectedItemId = item.id;
      this.confirmingSaleId = undefined;
      this.notice = "";
      this.render();
    });
    this.objects.push(row);
    this.addText(x + 18, y + 12, item.name, { fontSize: "13px", fontStyle: "bold", color: "#e0e6e7" });
    this.addText(x + 330, y + 13, `${item.width}×${item.height}`, { fontFamily: MONO, fontSize: "12px", color: "#8f9ca0" });
    this.addText(x + 420, y + 13, `估值 ${item.value}`, { fontFamily: MONO, fontSize: "12px", color: "#8f9ca0" });
    this.addText(x + width - 18, y + 11, `收购 ${warehouseSaleValue(item)}`, {
      fontFamily: MONO, fontSize: "14px", fontStyle: "bold", color: "#d6a35c",
    }).setOrigin(1, 0);
  }

  private drawItemDetail(item: ItemInstance | undefined): void {
    this.addText(946, 50, "物品详情", { fontSize: "18px", fontStyle: "bold", color: "#e3e8e9" });
    if (!item) {
      this.drawEmptyDetail("尚未选择物品");
      return;
    }
    const presentation = describeItem(item);
    this.drawItemIcon(item, 990, 125, 0.9);
    this.addText(1042, 94, item.name, { fontSize: "18px", fontStyle: "bold", color: "#e3e8e9" });
    this.addText(1042, 124, `${presentation.rarityLabel} · ${presentation.category}`, {
      fontSize: "12px", color: this.rarityTextColor(item.rarity),
    });
    this.addText(946, 184, `尺寸  ${item.width}×${item.height}\n价值  ${item.value}\n腐化  ${item.corruption}`, {
      fontFamily: MONO, fontSize: "14px", lineSpacing: 10, color: "#c7d0d2",
    });
    this.graphics.lineStyle(1, 0x273138, 0.9).lineBetween(946, 282, 1230, 282);
    this.addText(946, 303, "用途", { fontSize: "12px", fontStyle: "bold", color: "#d6a35c" });
    this.addText(946, 330, presentation.purpose, {
      fontSize: "13px", color: "#aeb8bb", wordWrap: { width: 282, useAdvancedWrap: true }, lineSpacing: 6,
    });
    if (item.weaponStats) {
      const dps = weaponDamagePerSecond(item) ?? 0;
      this.addText(946, 426, `伤害 ${item.weaponStats.damage}\n攻速 ${(1000 / item.weaponStats.attackIntervalMs).toFixed(2)}/秒\n暴击 ${Math.round(item.weaponStats.critChance * 100)}%\nDPS ${dps.toFixed(1)}`, {
        fontFamily: MONO, fontSize: "14px", lineSpacing: 8, color: "#dce3e4",
      });
    } else {
      this.addText(946, 426, presentation.flavor, {
        fontSize: "12px", fontStyle: "italic", color: "#748288", wordWrap: { width: 282, useAdvancedWrap: true },
      });
    }
    this.createButton(946, 626, 142, 36, "前往交易行", "secondary", () => this.openView("market"));
  }

  private drawTradeDetail(item: ItemInstance | undefined): void {
    this.addText(946, 50, "收购详情", { fontSize: "18px", fontStyle: "bold", color: "#e3e8e9" });
    if (!item) {
      this.drawEmptyDetail("请选择出售物品");
      return;
    }
    const presentation = describeItem(item);
    this.drawItemIcon(item, 990, 126, 0.88);
    this.addText(1040, 94, item.name, { fontSize: "17px", fontStyle: "bold", color: "#e3e8e9" });
    this.addText(1040, 124, `${presentation.rarityLabel} · ${presentation.category}`, {
      fontSize: "12px", color: this.rarityTextColor(item.rarity),
    });
    this.drawStatRow(946, 192, "物品估值", item.value.toLocaleString("zh-CN"));
    this.drawStatRow(946, 228, "灰市收购价", warehouseSaleValue(item).toLocaleString("zh-CN"), "#e4b45e");
    this.drawStatRow(946, 264, "出售后余额", (this.profile.credits + warehouseSaleValue(item)).toLocaleString("zh-CN"), "#e4b45e");
    this.graphics.lineStyle(1, 0x273138, 0.9).lineBetween(946, 312, 1230, 312);
    this.addText(946, 334, "出售会永久移除该物品。\n装备与赤红货物同样需要确认。", {
      fontSize: "12px", color: "#8f9ca0", lineSpacing: 8,
    });
    const confirming = this.confirmingSaleId === item.id;
    const enabled = this.profileStatus !== "unavailable" && this.profileStatus !== "unsupported";
    this.createButton(
      946,
      430,
      284,
      42,
      confirming ? `确认出售  +${warehouseSaleValue(item)}` : `出售物品  +${warehouseSaleValue(item)}`,
      confirming ? "danger" : "secondary",
      () => this.handleSale(item),
      enabled,
    );
    if (this.notice) this.addText(946, 490, this.notice, { fontSize: "12px", color: "#d6a35c", wordWrap: { width: 284 } });
  }

  private handleSale(item: ItemInstance): void {
    if (this.confirmingSaleId !== item.id) {
      this.confirmingSaleId = item.id;
      this.notice = "再次点击确认，出售后无法撤销。";
      this.render();
      return;
    }
    const result = commitWarehouseSale(window.localStorage, item.id);
    if (!result.ok) {
      this.notice = result.error === "item_not_found" ? "物品已不在仓库中。" : "存档不可用，出售未执行。";
      this.confirmingSaleId = undefined;
      this.reloadProfile();
      this.render();
      return;
    }
    this.profile = result.profile;
    this.profileStatus = result.loadStatus ?? this.profileStatus;
    this.selectedItemId = this.profile.warehouse[0]?.id;
    this.confirmingSaleId = undefined;
    this.notice = `已出售 ${result.item.name}，获得 ${result.payout} 灰烬币。`;
    this.game.events.emit("hud:banner", this.notice);
    this.render();
  }

  private drawEmptyDetail(message: string): void {
    this.addText(1088, 330, message, { fontSize: "15px", color: "#6f7c81" }).setOrigin(0.5);
  }

  private createNavButton(
    x: number,
    y: number,
    width: number,
    height: number,
    entry: { view: HubView; label: string; key: string },
    active: boolean,
  ): void {
    if (active) this.graphics.fillStyle(0xd3923c, 1).fillRect(x, y + 4, 3, height - 8);
    const button = this.add.rectangle(x + 6, y, width - 6, height, active ? 0x182126 : 0x10171b, 1)
      .setOrigin(0).setDepth(4).setInteractive({ useHandCursor: true });
    button.on(Phaser.Input.Events.POINTER_OVER, () => button.setFillStyle(0x1d282d, 1));
    button.on(Phaser.Input.Events.POINTER_OUT, () => button.setFillStyle(active ? 0x182126 : 0x10171b, 1));
    button.on(Phaser.Input.Events.POINTER_DOWN, () => this.openView(entry.view));
    this.objects.push(button);
    this.addText(x + 22, y + 11, entry.label, { fontSize: "14px", fontStyle: active ? "bold" : "normal", color: active ? "#e3e8e9" : "#9aa6aa" });
    this.addText(x + width - 14, y + 13, entry.key, { fontFamily: MONO, fontSize: "11px", color: "#59666b" }).setOrigin(1, 0);
  }

  private createButton(
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
    tone: "primary" | "secondary" | "danger",
    action: () => void,
    enabled = true,
  ): void {
    const colors = tone === "primary"
      ? { base: 0xb8742d, hover: 0xd3923c, stroke: 0xe4b45e, text: "#fff0d2" }
      : tone === "danger"
        ? { base: 0x32191a, hover: 0x4b2221, stroke: 0x9b4b47, text: "#e08b84" }
        : { base: 0x121b20, hover: 0x1b292f, stroke: 0x536068, text: "#d7dfe1" };
    const button = this.add.rectangle(x, y, width, height, enabled ? colors.base : 0x111518, 1)
      .setOrigin(0).setStrokeStyle(1, enabled ? colors.stroke : 0x2a3033, 0.95).setDepth(5);
    if (enabled) {
      button.setInteractive({ useHandCursor: true });
      button.on(Phaser.Input.Events.POINTER_OVER, () => button.setFillStyle(colors.hover, 1));
      button.on(Phaser.Input.Events.POINTER_OUT, () => button.setFillStyle(colors.base, 1));
      button.on(Phaser.Input.Events.POINTER_DOWN, action);
    }
    this.objects.push(button);
    this.addText(x + width / 2, y + height / 2, label, {
      fontSize: tone === "primary" ? "15px" : "13px",
      fontStyle: "bold",
      color: enabled ? colors.text : "#586166",
    }).setOrigin(0.5);
  }

  private drawPanel(x: number, y: number, width: number, height: number): void {
    this.graphics.fillStyle(0x0b1116, 0.97).fillRoundedRect(x, y, width, height, 8);
    this.graphics.lineStyle(1, 0x374249, 0.85).strokeRoundedRect(x, y, width, height, 8);
  }

  private drawStatRow(x: number, y: number, label: string, value: string, valueColor = "#c7d0d2"): void {
    this.addText(x, y, label, { fontSize: "12px", color: "#7f8c91" });
    this.addText(x + 282, y, value, { fontFamily: MONO, fontSize: "13px", fontStyle: "bold", color: valueColor }).setOrigin(1, 0);
  }

  private drawHunterEmblem(x: number, y: number): void {
    this.graphics.fillStyle(0x171f23, 1).fillCircle(x, y, 38);
    this.graphics.lineStyle(2, 0x536068, 0.8).strokeCircle(x, y, 38);
    this.graphics.fillStyle(0x40484b, 1).fillCircle(x, y - 5, 16);
    this.graphics.fillStyle(0x272e31, 1).fillTriangle(x - 25, y + 28, x, y - 2, x + 25, y + 28);
    this.graphics.lineStyle(3, 0xd3923c, 0.72).lineBetween(x - 11, y - 6, x + 10, y - 6);
  }

  private drawItemIcon(item: ItemInstance, centerX: number, centerY: number, scale: number): void {
    const graphics = this.add.graphics().setDepth(6);
    const color = this.rarityColor(item.rarity);
    graphics.fillStyle(0x080c0f, 1).fillCircle(centerX, centerY, 25 * scale);
    graphics.lineStyle(2 * scale, color, 0.9).strokeCircle(centerX, centerY, 25 * scale);
    graphics.fillStyle(color, 0.86);
    if (item.icon === "blade" || item.icon === "axe") {
      graphics.fillTriangle(centerX - 5 * scale, centerY + 17 * scale, centerX + 4 * scale, centerY - 18 * scale, centerX + 10 * scale, centerY - 11 * scale);
      graphics.fillStyle(0x8b5a35, 1).fillRect(centerX - 8 * scale, centerY + 10 * scale, 16 * scale, 5 * scale);
    } else if (item.icon === "gem" || item.icon === "relic") {
      graphics.fillPoints([
        new Phaser.Geom.Point(centerX, centerY - 18 * scale),
        new Phaser.Geom.Point(centerX + 16 * scale, centerY),
        new Phaser.Geom.Point(centerX, centerY + 18 * scale),
        new Phaser.Geom.Point(centerX - 16 * scale, centerY),
      ], true);
    } else if (item.icon === "armor" || item.icon === "helm") {
      graphics.fillRoundedRect(centerX - 15 * scale, centerY - 15 * scale, 30 * scale, 30 * scale, 8 * scale);
      graphics.fillStyle(0x11171a, 1).fillRect(centerX - 11 * scale, centerY - 2 * scale, 22 * scale, 5 * scale);
    } else {
      graphics.fillRoundedRect(centerX - 13 * scale, centerY - 17 * scale, 26 * scale, 34 * scale, 7 * scale);
    }
    this.objects.push(graphics);
  }

  private addText(x: number, y: number, text: string, style: Phaser.Types.GameObjects.Text.TextStyle): Phaser.GameObjects.Text {
    const object = this.add.text(x, y, text, { fontFamily: FONT, ...style }).setDepth(7);
    this.objects.push(object);
    return object;
  }

  private rarityColor(rarity: ItemRarity | undefined): number {
    return { common: 0x8f9a9e, magic: 0x4d9fdc, rare: 0xa56de2, red: 0xc64a3f }[rarity ?? "common"];
  }

  private rarityTextColor(rarity: ItemRarity | undefined): string {
    return { common: "#9facb0", magic: "#67b7ed", rare: "#bd8df0", red: "#e06458" }[rarity ?? "common"];
  }

  private profileStatusText(): string {
    return {
      new: "本地档案 · 新建",
      loaded: "本地档案 · 已载入",
      recovered: "本地档案 · 已恢复",
      unavailable: "存档不可用",
      unsupported: "存档版本过新",
    }[this.profileStatus];
  }

  private clearObjects(): void {
    for (const object of this.objects) object.destroy();
    this.objects = [];
  }
}

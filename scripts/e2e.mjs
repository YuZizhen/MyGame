import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import process from "node:process";
import { chromium } from "playwright-core";

const PORT = await findAvailablePort();
const BASE_URL = `http://127.0.0.1:${PORT}`;
const configuredBrowserPath = process.env.BROWSER_PATH ?? process.env.EDGE_PATH;
if (configuredBrowserPath && !existsSync(configuredBrowserPath)) {
  throw new Error(`Configured browser does not exist: ${configuredBrowserPath}`);
}
const LOCAL_BROWSER_CANDIDATES = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/microsoft-edge",
  "/usr/bin/microsoft-edge-stable",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];
const executablePath = configuredBrowserPath
  ?? (process.env.CI ? undefined : LOCAL_BROWSER_CANDIDATES.find((candidate) => existsSync(candidate)));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function clickHudLabel(page, label) {
  await page.waitForFunction(
    (expected) => window.__ASHEN_GAME__.scene.getScene("HudScene").lootObjects
      .some((object) => typeof object.text === "string" && object.text === expected),
    label,
  );
  const point = await page.evaluate((expected) => {
    const game = window.__ASHEN_GAME__;
    const hud = game.scene.getScene("HudScene");
    const text = hud.lootObjects.find((object) => typeof object.text === "string" && object.text === expected);
    const bounds = text.getBounds();
    const canvasBounds = game.canvas.getBoundingClientRect();
    return {
      x: canvasBounds.left + (bounds.centerX / 1280) * canvasBounds.width,
      y: canvasBounds.top + (bounds.centerY / 720) * canvasBounds.height,
    };
  }, label);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.waitForTimeout(30);
  await page.mouse.up();
}

async function findAvailablePort() {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", resolve);
  });
  const address = probe.address();
  const port = typeof address === "object" && address ? address.port : undefined;
  await new Promise((resolve) => probe.close(resolve));
  if (!port) throw new Error("Could not reserve a local port for browser regression tests");
  return port;
}

async function stopServer(server) {
  if (server.exitCode !== null) return;
  const exited = new Promise((resolve) => server.once("exit", resolve));
  server.kill("SIGTERM");
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 2_000))]);
  if (server.exitCode === null) {
    server.kill("SIGKILL");
    await exited;
  }
}

async function waitForServer(server, readServerOutput) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Vite exited early with code ${server.exitCode}`);
    try {
      const response = await fetch(BASE_URL);
      if (response.ok) return;
    } catch {
      // Server startup is still in progress.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const output = readServerOutput().trim();
  throw new Error(`Timed out waiting for the Vite development server${output ? `\n${output}` : " (no child-process output)"}`);
}

const server = spawn(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
  { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
);
let serverOutput = "";
server.stdout?.on("data", (chunk) => { serverOutput += chunk.toString(); });
server.stderr?.on("data", (chunk) => { serverOutput += chunk.toString(); });
let browser;

try {
  await waitForServer(server, () => serverOutput);
  browser = await chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    headless: true,
    args: ["--disable-gpu"],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, hasTouch: true });
  const page = await context.newPage();
  page.setDefaultTimeout(45_000);
  const clickGamePoint = async (x, y) => {
    const point = await page.evaluate(({ gameX, gameY }) => {
      const bounds = document.querySelector("canvas").getBoundingClientRect();
      return { x: bounds.left + (gameX / 1280) * bounds.width, y: bounds.top + (gameY / 720) * bounds.height };
    }, { gameX: x, gameY: y });
    await page.mouse.click(point.x, point.y);
  };
  const runtimeErrors = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));

  await page.goto(`${BASE_URL}/?seed=20261119`);
  await page.waitForFunction(() => window.__ASHEN_GAME__?.scene?.isActive("HubScene"));
  await page.waitForFunction(() => {
    const hub = window.__ASHEN_GAME__.scene.getScene("HubScene");
    const labels = hub.objects.filter((object) => typeof object.text === "string").map((object) => object.text);
    return labels.includes("进入探索   Enter") && labels.includes("灰烬前厅") && labels.includes("仓库") && labels.includes("交易行");
  });
  await page.keyboard.press("Digit3");
  await page.waitForFunction(() => {
    const hub = window.__ASHEN_GAME__.scene.getScene("HubScene");
    const labels = hub.objects.filter((object) => typeof object.text === "string").map((object) => object.text);
    return hub.view === "market" && labels.includes("购买补给") && labels.includes("制式手枪") && labels.includes("购买  -95");
  });
  await clickGamePoint(1_060, 451);
  await page.waitForFunction(() => {
    const hub = window.__ASHEN_GAME__.scene.getScene("HubScene");
    return hub.profile.credits === 5 && hub.profile.warehouse.some((item) => item.definitionId === "service_pistol");
  });
  await page.keyboard.press("Digit2");
  await page.waitForFunction(() => {
    const hub = window.__ASHEN_GAME__.scene.getScene("HubScene");
    const labels = hub.objects.filter((object) => typeof object.text === "string").map((object) => object.text);
    return hub.view === "warehouse" && labels.includes("加入下次探索");
  });
  await clickGamePoint(1_085, 594);
  await page.waitForFunction(() => window.__ASHEN_GAME__.scene.getScene("HubScene").profile.preparedItemIds.length === 1);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.__ASHEN_GAME__.scene.getScene("HubScene").view === "home");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__ASHEN_GAME__?.scene?.isActive("GameScene"));
  assert(
    await page.evaluate(() => {
      const game = window.__ASHEN_GAME__;
      const scene = game.scene.getScene("GameScene");
      const profile = JSON.parse(localStorage.getItem("ashen-vault.profile"));
      return scene.loadout.weapon?.definitionId === "starter_sword"
        && scene.loadout.rangedWeapon?.definitionId === "service_pistol"
        && profile.warehouse.length === 0
        && profile.activeRun?.deployedItems?.length === 1;
    }),
    "Purchased and prepared weapon was not atomically deployed",
  );
  assert(
    await page.evaluate(() => {
      const hud = window.__ASHEN_GAME__.scene.getScene("HudScene");
      return hud.quickSlotTexts.length === 4
        && hud.quickSlotTexts.every((text) => text.y >= 650)
        && hud.quickSlotTexts[0].text.includes("[1]")
        && hud.quickSlotTexts[1].text.includes("[2]")
        && hud.quickSlotTexts[2].text.includes("[3]")
        && hud.quickSlotTexts[3].text.includes("[4]")
        && hud.quickSlotTexts[3].text.includes("特殊药剂");
    }),
    "The fixed four-slot item bar is not rendered at the bottom of the combat view",
  );
  assert(
    await page.evaluate(() => !window.__ASHEN_GAME__.scene.getScene("HudScene").children.list
      .some((object) => typeof object.text === "string" && object.text.startsWith("WASD 移动"))),
    "The persistent bottom control guide still blocks the combat view",
  );
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.__ASHEN_GAME__?.registry?.get("pauseMenuOpen") === true);
  const pausedState = await page.evaluate(() => {
    const game = window.__ASHEN_GAME__;
    const scene = game.scene.getScene("GameScene");
    const hud = game.scene.getScene("HudScene");
    return {
      physicsPaused: scene.physics.world.isPaused,
      clockPaused: scene.time.paused,
      section: hud.pauseState.section,
      labels: hud.pauseObjects.filter((object) => typeof object.text === "string").map((object) => object.text),
    };
  });
  assert(pausedState.physicsPaused && pausedState.clockPaused, "Esc menu did not pause physics and scene time");
  assert(pausedState.labels.includes("[2] 设置") && pausedState.labels.includes("[3] 游戏介绍"), "Pause menu is missing required sections");
  const volumeBefore = await page.evaluate(() => window.__ASHEN_GAME__.registry.get("audioVolume"));
  await page.keyboard.press("Digit2");
  await page.waitForFunction(() => window.__ASHEN_GAME__.scene.getScene("HudScene").pauseState.section === "settings");
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction((before) => window.__ASHEN_GAME__.registry.get("audioVolume") > before, volumeBefore);
  await page.keyboard.press("Digit3");
  await page.waitForFunction(() => window.__ASHEN_GAME__.scene.getScene("HudScene").pauseState.section === "guide");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.__ASHEN_GAME__.scene.getScene("HudScene").pauseState.section === "main");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.__ASHEN_GAME__.registry.get("pauseMenuOpen") === false);
  await page.evaluate(() => {
    const scene = window.__ASHEN_GAME__.scene.getScene("GameScene");
    scene.hp = 50;
    scene.loadout.rangedWeapon.corruption = 12;
    const medicinePocket = scene.loadout.rig.pockets.find((pocket) => pocket.definition.id === "medicine");
    medicinePocket.placements = [{
      x: 0, y: 0, rotated: false,
      item: { id: "qa-bandage", definitionId: "field_bandage", name: "战地绷带", width: 1, height: 1, tags: ["medicine"], value: 16, corruption: 0, medicalStats: { healAmount: 25, useTimeMs: 900 } },
    }];
    scene.emitHudState();
  });
  await page.keyboard.press("Digit3");
  assert(
    await page.evaluate(() => {
      const scene = window.__ASHEN_GAME__.scene.getScene("GameScene");
      return scene.hp === 50 && scene.selectedMedicineId === "qa-bandage" && scene.medicalAction === undefined;
    }),
    "Medicine quick slot consumed or healed instead of only selecting the item",
  );
  await page.keyboard.press("Digit4");
  assert(
    await page.evaluate(() => {
      const scene = window.__ASHEN_GAME__.scene.getScene("GameScene");
      return scene.hp === 50 && scene.selectedMedicineId === "qa-bandage" && scene.medicalAction === undefined;
    }),
    "The unopened special-potion slot changed or consumed the selected medkit",
  );
  await page.keyboard.press("q");
  assert(
    await page.evaluate(() => window.__ASHEN_GAME__.scene.getScene("GameScene").hp === 50),
    "Timed medicine healed immediately instead of waiting for its use duration",
  );
  await page.waitForFunction(() => {
    const scene = window.__ASHEN_GAME__.scene.getScene("GameScene");
    const hud = window.__ASHEN_GAME__.scene.getScene("HudScene");
    return scene.hp === 75 && hud.hudState.potions === 0 && hud.hudState.corruption === 12 && hud.corruptionText.text === "腐化\n12";
  });
  await page.evaluate(() => {
    const scene = window.__ASHEN_GAME__.scene.getScene("GameScene");
    scene.hp = 1_000;
    scene.loadout.rangedWeapon = {
      id: "qa-pistol", definitionId: "service_pistol", name: "制式手枪", width: 1, height: 2, tags: ["weapon"], value: 95, corruption: 12,
      weaponStats: { kind: "ranged", damage: 20, attackIntervalMs: 320, critChance: 0, range: 720, magazineSize: 12, loadedAmmo: 0, reloadMs: 1200, ammoType: "light" },
    };
    const ammoPocket = scene.loadout.rig.pockets.find((pocket) => pocket.definition.id === "magazine_left");
    ammoPocket.placements = [{
      x: 0, y: 0, rotated: false,
      item: { id: "qa-ammo", definitionId: "light_ammo", name: "轻型弹药", width: 1, height: 1, tags: ["ammo"], value: 36, corruption: 0, quantity: 60, maxQuantity: 60, ammoType: "light" },
    }];
    scene.emitHudState();
  });
  await page.keyboard.press("Digit2");
  await page.waitForFunction(() => window.__ASHEN_GAME__.scene.getScene("GameScene").selectedWeaponSlot === 2);
  await page.keyboard.press("r");
  assert(
    await page.evaluate(() => {
      const scene = window.__ASHEN_GAME__.scene.getScene("GameScene");
      return scene.reloadAction !== undefined && scene.loadout.rangedWeapon.weaponStats.loadedAmmo === 0;
    }),
    "Reload did not start as a timed action",
  );
  await page.waitForFunction(() => {
    const scene = window.__ASHEN_GAME__.scene.getScene("GameScene");
    const reserve = scene.loadout.rig.pockets.flatMap((pocket) => pocket.placements).find((placement) => placement.item.id === "qa-ammo")?.item.quantity;
    return scene.loadout.rangedWeapon.weaponStats.loadedAmmo === 12 && reserve === 48;
  });
  await page.keyboard.press("Space");
  await page.waitForFunction(() => window.__ASHEN_GAME__.scene.getScene("GameScene").loadout.rangedWeapon.weaponStats.loadedAmmo === 11);
  await page.keyboard.press("Digit1");
  assert(
    await page.evaluate(() => {
      const scene = window.__ASHEN_GAME__.scene.getScene("GameScene");
      return scene.selectedWeaponSlot === 1 && scene.loadout.weapon.weaponStats.kind === "melee" && scene.loadout.rangedWeapon.weaponStats.loadedAmmo === 11;
    }),
    "Slot 1 did not select the fixed melee weapon while preserving ranged ammo",
  );
  await page.keyboard.press("Space");
  await page.waitForFunction(() => {
    const scene = window.__ASHEN_GAME__.scene.getScene("GameScene");
    return scene.selectedWeaponSlot === 1 && scene.loadout.rangedWeapon.weaponStats.loadedAmmo === 11;
  });
  const touchAllowed = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    if (!canvas) return false;
    return canvas.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, cancelable: true }));
  });
  assert(touchAllowed, "Phaser prevented the browser touch gesture needed for pinch zoom");

  await page.keyboard.press("Tab");
  assert(
    await page.evaluate(() => document.activeElement?.id === "game-shell"),
    "The first Tab press did not focus the game shell",
  );
  const inventoryState = await page.evaluate(() => {
    const scene = window.__ASHEN_GAME__.scene.getScene("GameScene");
    if (!scene.lootPanelOpen) scene.handleInventoryShortcut();
    return {
      lootPanelOpen: scene.lootPanelOpen,
      runState: scene.runState,
      extractionPanelOpen: scene.extractionPanelOpen,
      pauseMenuOpen: scene.pauseMenuOpen,
      bossEncounterActive: scene.bossEncounterActive,
      player: { x: scene.player.x, y: scene.player.y },
      bossRoom: scene.dungeon.bossRoom,
    };
  });
  assert(inventoryState.lootPanelOpen, `Inventory shortcut was blocked: ${JSON.stringify(inventoryState)}`);
  await page.keyboard.press("Shift+Tab");
  assert(
    await page.evaluate(() => document.activeElement?.id !== "game-shell"),
    "Shift+Tab could not leave the focused game shell",
  );

  await page.goto(`${BASE_URL}/?qa=chest`);
  await page.waitForFunction(() => window.__ASHEN_GAME__?.scene?.isActive("GameScene"));
  await page.keyboard.down("e");
  try {
    await page.waitForFunction(
      () => window.__ASHEN_GAME__.scene.getScene("GameScene").chests[0]?.opened === true,
      undefined,
      { timeout: 4_000 },
    );
  } catch (error) {
    const chestState = await page.evaluate(() => {
      const game = window.__ASHEN_GAME__;
      const scene = game.scene.getScene("GameScene");
      const chest = scene.chests[0];
      const tileX = Math.floor(scene.player.x / 64);
      const tileY = Math.floor(scene.player.y / 64);
      return {
        frame: game.loop.frame,
        running: game.loop.running,
        player: { x: scene.player.x, y: scene.player.y, tileX, tileY },
        playerTile: scene.dungeon.tiles[tileY * scene.dungeon.width + tileX],
        chest: { x: chest.container.x, y: chest.container.y, opened: chest.opened },
        distance: Math.hypot(scene.player.x - chest.container.x, scene.player.y - chest.container.y),
        nearbyChestId: scene.nearbyChest?.id,
        searchChestId: scene.searchChest?.id,
        searchRequiresRelease: scene.searchRequiresRelease,
        hp: scene.hp,
        nearbyMobs: scene.mobs.filter((mob) => !mob.dead).map((mob) => ({
          kind: mob.kind,
          distance: Math.hypot(scene.player.x - mob.sprite.x, scene.player.y - mob.sprite.y),
        })).filter((mob) => mob.distance < 300),
        interactDown: scene.controls.interact.isDown,
        diagnostic: window.__ASHEN_LAST_ERROR__,
      };
    });
    throw new Error(`Hold-to-open chest failed: ${JSON.stringify(chestState)}\n${String(error)}`);
  }
  await page.keyboard.up("e");
  await page.waitForFunction(() => window.__ASHEN_GAME__.scene.getScene("GameScene").lootPanelOpen === true);
  const initialProgressMetrics = await page.evaluate(() => {
    const fill = window.__ASHEN_GAME__.scene.getScene("HudScene").lootSearchProgressFill;
    return fill ? { width: fill.width, scaleX: fill.scaleX, displayWidth: fill.displayWidth } : null;
  });
  assert(initialProgressMetrics?.width === 272, "Loot progress fill must keep a non-zero native width");
  assert(
    Number.isFinite(initialProgressMetrics.scaleX) && Number.isFinite(initialProgressMetrics.displayWidth),
    "Loot progress fill produced a non-finite transform",
  );
  const searchedChestLootBefore = await page.evaluate(
    () => {
      const chest = window.__ASHEN_GAME__.scene.getScene("GameScene").activeLootChest;
      return { count: chest.loot.length, itemId: chest.loot[0].id };
    },
  );
  const chestItemPoint = await page.evaluate(() => {
    const bounds = document.querySelector("canvas").getBoundingClientRect();
    return { x: bounds.left + (270 / 1280) * bounds.width, y: bounds.top + (222 / 720) * bounds.height };
  });
  await page.mouse.click(chestItemPoint.x, chestItemPoint.y);
  await page.waitForFunction(
    (itemId) => window.__ASHEN_GAME__.scene.getScene("GameScene").activeLootChest.revealedItemIds.has(itemId),
    searchedChestLootBefore.itemId,
  );
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await clickGamePoint(270, 222);
  await clickHudLabel(page, "拾取到背包");
  await page.waitForFunction(
    (expected) => window.__ASHEN_GAME__.scene.getScene("GameScene").activeLootChest.loot.length === expected,
    searchedChestLootBefore.count - 1,
  );
  await page.keyboard.press("e");
  await page.waitForFunction(() => window.__ASHEN_GAME__.scene.getScene("GameScene").lootPanelOpen === false);

  await page.goto(`${BASE_URL}/?qa=loot`);
  await page.waitForFunction(() => {
    const scene = window.__ASHEN_GAME__?.scene?.getScene("GameScene");
    const firstItem = scene?.activeLootChest?.loot[0];
    return scene?.lootPanelOpen === true
      && firstItem
      && scene.activeLootChest.revealedItemIds.has(firstItem.id);
  });
  const doubleClickLootBefore = await page.evaluate(() => {
    const scene = window.__ASHEN_GAME__.scene.getScene("GameScene");
    return { count: scene.activeLootChest.loot.length, itemId: scene.activeLootChest.loot[0].id };
  });
  await clickGamePoint(270, 222);
  await page.waitForTimeout(500);
  if (!await page.evaluate(() => window.__ASHEN_GAME__.registry.get("itemDetailOpen") === true)) {
    await page.evaluate(() => {
      const hud = window.__ASHEN_GAME__.scene.getScene("HudScene");
      const card = hud.lootObjects.find((object) => object.type === "Rectangle" && object.x === 132 && object.y === 190 && object.width === 276);
      card?.emit("pointerdown");
    });
  }
  await page.waitForFunction(() => window.__ASHEN_GAME__.registry.get("itemDetailOpen") === true);
  const detailLayout = await page.evaluate(() => {
    const hud = window.__ASHEN_GAME__.scene.getScene("HudScene");
    const selection = hud.itemDetailSelection;
    const blocker = hud.lootObjects.find((object) => object.type === "Zone" && object.depth === 151);
    return {
      anchorRight: selection.anchor.x + selection.anchor.width,
      panelLeft: blocker.x - blocker.width / 2,
      panelRight: blocker.x + blocker.width / 2,
      width: blocker.width,
    };
  });
  assert(detailLayout.width <= 288, `Item detail panel is still too wide: ${detailLayout.width}px`);
  assert(
    detailLayout.panelLeft >= detailLayout.anchorRight || detailLayout.panelRight <= detailLayout.anchorRight - 276,
    "Item detail panel is not positioned beside the selected item",
  );
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => {
    const game = window.__ASHEN_GAME__;
    return game.registry.get("itemDetailOpen") === false
      && game.scene.getScene("GameScene").lootPanelOpen === true;
  });
  await page.evaluate(() => {
    const hud = window.__ASHEN_GAME__.scene.getScene("HudScene");
    const card = hud.lootObjects.find((object) => object.type === "Rectangle" && object.x === 132 && object.y === 190 && object.width === 276);
    card?.emit("pointerdown");
    card?.emit("pointerdown");
  });
  await page.waitForFunction(
    (expected) => window.__ASHEN_GAME__.scene.getScene("GameScene").activeLootChest.loot.length === expected,
    doubleClickLootBefore.count - 1,
  );
  assert(
    await page.evaluate(() => window.__ASHEN_GAME__.registry.get("itemDetailOpen") === false),
    "Double-click pickup left the item detail panel open",
  );

  await page.goto(`${BASE_URL}/?qa=chest`);
  await page.waitForFunction(() => window.__ASHEN_GAME__?.scene?.isActive("GameScene"));
  await page.evaluate(() => {
    window.__ASHEN_GAME__.scene.getScene("GameScene").chests[0].loot[0].rarity = "red";
  });
  await page.keyboard.down("e");
  await page.waitForFunction(() => window.__ASHEN_GAME__.scene.getScene("GameScene").chests[0]?.opened === true);
  await page.keyboard.up("e");
  await page.waitForFunction(() => window.__ASHEN_GAME__.scene.getScene("GameScene").lootPanelOpen === true);
  const clickLootBefore = await page.evaluate(
    () => {
      const chest = window.__ASHEN_GAME__.scene.getScene("GameScene").activeLootChest;
      return { count: chest.loot.length, itemId: chest.loot[0].id };
    },
  );
  await page.waitForFunction(
    (itemId) => window.__ASHEN_GAME__.scene.getScene("GameScene").activeLootChest.revealedItemIds.has(itemId),
    clickLootBefore.itemId,
  );
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.evaluate(() => {
    const hud = window.__ASHEN_GAME__.scene.getScene("HudScene");
    const card = hud.lootObjects.find((object) => object.type === "Rectangle" && object.x === 132 && object.y === 190 && object.width === 276);
    card?.emit("pointerdown");
  });
  await clickHudLabel(page, "拾取到背包");
  await page.waitForFunction(
    (expected) => window.__ASHEN_GAME__.scene.getScene("GameScene").activeLootChest.loot.length === expected,
    clickLootBefore.count - 1,
  );
  const closePoint = await page.evaluate(() => {
    const game = window.__ASHEN_GAME__;
    const hud = game.scene.getScene("HudScene");
    const button = hud.lootObjects.find((object) => typeof object.text === "string" && object.text.startsWith("关闭"));
    const bounds = button.getBounds();
    const canvasBounds = game.canvas.getBoundingClientRect();
    return {
      x: canvasBounds.left + (bounds.centerX / 1280) * canvasBounds.width,
      y: canvasBounds.top + (bounds.centerY / 720) * canvasBounds.height,
    };
  });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  try {
    await page.mouse.click(closePoint.x, closePoint.y);
    await page.waitForFunction(
      () => window.__ASHEN_GAME__.scene.getScene("GameScene").lootPanelOpen === false,
      undefined,
      { timeout: 3_000 },
    );
  } catch (error) {
    const closeState = await page.evaluate(() => {
      const game = window.__ASHEN_GAME__;
      const hud = game.scene.getScene("HudScene");
      const closeObjects = hud.lootObjects
        .filter((object) => (typeof object.text === "string" && object.text.startsWith("关闭")) || object.depth === 106)
        .map((object) => ({ type: object.type, depth: object.depth, bounds: object.getBounds() }));
      return {
        lootPanelOpen: game.scene.getScene("GameScene").lootPanelOpen,
        itemDetailOpen: game.registry.get("itemDetailOpen"),
        pointer: { x: game.input.activePointer.x, y: game.input.activePointer.y, isDown: game.input.activePointer.isDown },
        closeObjects,
      };
    });
    throw new Error(`Close-button pointer interaction failed: ${JSON.stringify(closeState)}\n${String(error)}`);
  }

  await page.goto(`${BASE_URL}/?qa=chest`);
  await page.waitForFunction(() => window.__ASHEN_GAME__?.scene?.isActive("GameScene"));
  await page.evaluate(() => {
    window.__ASHEN_GAME__.scene.getScene("GameScene").chests[0].loot[0].rarity = "red";
  });
  await page.keyboard.down("e");
  await page.waitForFunction(() => window.__ASHEN_GAME__.scene.getScene("GameScene").chests[0]?.opened === true);
  await page.keyboard.up("e");
  await page.waitForFunction(() => window.__ASHEN_GAME__.scene.getScene("GameScene").lootPanelOpen === true);
  const cancelledSearchItemId = await page.evaluate(
    () => window.__ASHEN_GAME__.scene.getScene("GameScene").lootItemSearch?.itemId,
  );
  assert(cancelledSearchItemId, "Opening a chest did not automatically start searching its first unknown item");
  await page.keyboard.press("Tab");
  await page.waitForFunction(() => window.__ASHEN_GAME__.scene.getScene("GameScene").lootPanelOpen === false);
  await new Promise((resolve) => setTimeout(resolve, 1_800));
  assert(
    await page.evaluate(
      (itemId) => !window.__ASHEN_GAME__.scene.getScene("GameScene").chests[0].revealedItemIds.has(itemId),
      cancelledSearchItemId,
    ),
    "Closing the loot panel did not cancel the active item search",
  );

  await page.goto(`${BASE_URL}/?qa=loot`);
  await page.waitForFunction(() => window.__ASHEN_GAME__?.scene?.getScene("GameScene")?.lootPanelOpen === true);
  await page.evaluate(() => document.querySelector("#game-shell")?.blur());
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.__ASHEN_GAME__.scene.getScene("GameScene").lootPanelOpen === false);

  await page.goto(`${BASE_URL}/?qa=loot`);
  await page.waitForFunction(() => {
    const scene = window.__ASHEN_GAME__?.scene?.getScene("GameScene");
    return scene?.lootPanelOpen === true && Boolean(scene.lootItemSearch);
  });
  const sleepingSearchItemId = await page.evaluate(() => {
    const game = window.__ASHEN_GAME__;
    const itemId = game.scene.getScene("GameScene").lootItemSearch.itemId;
    game.loop.sleep();
    return itemId;
  });
  await page.waitForFunction(() => window.__ASHEN_GAME__.loop.running === false);
  await page.keyboard.press("x");
  await page.waitForFunction(() => window.__ASHEN_GAME__.loop.running === true);
  await page.waitForFunction(
    (itemId) => window.__ASHEN_GAME__.scene.getScene("GameScene").activeLootChest.revealedItemIds.has(itemId),
    sleepingSearchItemId,
  );
  assert(
    await page.evaluate(() => document.querySelector("#runtime-diagnostics")?.hidden === true),
    "A recoverable sleeping game loop incorrectly raised the diagnostic overlay",
  );

  await page.goto(`${BASE_URL}/?qa=loot`);
  await page.waitForFunction(() => window.__ASHEN_GAME__?.scene?.getScene("GameScene")?.lootPanelOpen === true);
  const frameBeforeDeadMobCleanup = await page.evaluate(() => {
    const game = window.__ASHEN_GAME__;
    const scene = game.scene.getScene("GameScene");
    const mob = scene.mobs.find((candidate) => !candidate.isBoss && !candidate.dead);
    scene.killMob(mob);
    return game.loop.frame;
  });
  await page.waitForTimeout(700);
  assert(
    await page.evaluate(
      (frame) => window.__ASHEN_GAME__.loop.frame > frame
        && document.querySelector("#runtime-diagnostics")?.hidden === true,
      frameBeforeDeadMobCleanup,
    ),
    "A destroyed dead-mob body stopped the loot-panel game loop",
  );

  await page.goto(`${BASE_URL}/?qa=exit`);
  await page.waitForFunction(() => {
    const scene = window.__ASHEN_GAME__?.scene?.getScene("GameScene");
    return scene?.bossDefeated === true;
  });
  await page.waitForTimeout(1_000);
  await page.evaluate(() => window.__ASHEN_GAME__.scene.getScene("GameScene").openExtractionPanel());
  await page.waitForFunction(() => window.__ASHEN_GAME__.scene.getScene("GameScene").extractionPanelOpen === true);
  assert(
    await page.evaluate(() => document.querySelector("#runtime-diagnostics")?.hidden === true),
    "A destroyed boss body stopped the extraction-panel game loop",
  );

  await page.goto(`${BASE_URL}/?qa=loot&renderer=canvas`);
  await page.waitForFunction(() => {
    const game = window.__ASHEN_GAME__;
    const scene = game?.scene?.getScene("GameScene");
    return game?.renderer?.type === 1 && scene?.lootPanelOpen === true && Boolean(scene.lootItemSearch);
  });
  const canvasProgressMetrics = await page.evaluate(() => {
    const fill = window.__ASHEN_GAME__.scene.getScene("HudScene").lootSearchProgressFill;
    return { width: fill.width, scaleX: fill.scaleX, displayWidth: fill.displayWidth };
  });
  assert(canvasProgressMetrics.width === 272, "Canvas loot progress fill has a zero native width");
  assert(
    Number.isFinite(canvasProgressMetrics.scaleX) && Number.isFinite(canvasProgressMetrics.displayWidth),
    "Canvas loot progress fill produced a non-finite transform",
  );
  await page.waitForFunction(() => {
    const scene = window.__ASHEN_GAME__.scene.getScene("GameScene");
    return scene.activeLootChest.revealedItemIds.size > 0;
  });

  await page.goto(`${BASE_URL}/?qa=loot`);
  await page.waitForFunction(() => window.__ASHEN_GAME__?.scene?.getScene("GameScene")?.lootPanelOpen === true);
  await page.evaluate(() => {
    const status = document.querySelector("#game-status");
    window.__LIVE_MUTATIONS__ = 0;
    new MutationObserver(() => {
      window.__LIVE_MUTATIONS__ += 1;
    }).observe(status, { childList: true, characterData: true, subtree: true });
  });
  await page.waitForFunction(() => {
    const scene = window.__ASHEN_GAME__.scene.getScene("GameScene");
    const firstItem = scene.activeLootChest.loot[0];
    return firstItem && scene.activeLootChest.revealedItemIds.has(firstItem.id);
  });
  await page.evaluate(() => {
    document.querySelector("#game-status").textContent = "";
    window.__LIVE_MUTATIONS__ = 0;
  });
  const lootBefore = await page.evaluate(() => {
    const scene = window.__ASHEN_GAME__.scene.getScene("GameScene");
    return { count: scene.activeLootChest.loot.length, itemId: scene.activeLootChest.loot[0].id };
  });
  await page.keyboard.press("1");
  await page.waitForFunction(
    (expected) => window.__ASHEN_GAME__.scene.getScene("GameScene").activeLootChest.loot.length === expected,
    lootBefore.count - 1,
  );
  const keyboardLoot = await page.evaluate(() => {
    const scene = window.__ASHEN_GAME__.scene.getScene("GameScene");
    const placements = scene.loadout.backpack.pockets.flatMap((pocket) => pocket.placements);
    return {
      storedItems: placements.length,
      mutations: window.__LIVE_MUTATIONS__,
    };
  });
  assert(keyboardLoot.storedItems === 1, "Number key 1 did not take the first chest item");

  await page.goto(`${BASE_URL}/?qa=pickup`);
  await page.waitForFunction(() => {
    const scene = window.__ASHEN_GAME__?.scene?.getScene("GameScene");
    return scene?.lootPanelOpen === true && scene.loadout.backpack?.pockets[0]?.placements.length === 1;
  });
  await page.evaluate(() => {
    const scene = window.__ASHEN_GAME__.scene.getScene("GameScene");
    scene.cancelLootItemSearch();
    scene.openInventoryPanel();
  });
  const dragSetup = await page.evaluate(() => {
    const scene = window.__ASHEN_GAME__.scene.getScene("GameScene");
    const placement = scene.loadout.backpack.pockets[0].placements[0];
    const cell = 46;
    const originX = 800;
    const originY = 282;
    const bounds = document.querySelector("canvas").getBoundingClientRect();
    const screenPoint = (x, y) => ({
      x: bounds.left + (x / 1280) * bounds.width,
      y: bounds.top + (y / 720) * bounds.height,
    });
    const start = screenPoint(originX + (placement.x + 0.5) * cell, originY + (placement.y + 0.5) * cell);
    const end = screenPoint(originX + (3 + 0.5) * cell, originY + (2 + 0.5) * cell);
    return {
      itemId: placement.item.id,
      startX: start.x,
      startY: start.y,
      endX: end.x,
      endY: end.y,
    };
  });
  await page.mouse.move(dragSetup.startX, dragSetup.startY);
  await page.mouse.down();
  await page.mouse.move(dragSetup.endX, dragSetup.endY, { steps: 8 });
  await page.mouse.up();
  try {
    await page.waitForFunction(
      (itemId) => {
        const placements = window.__ASHEN_GAME__.scene.getScene("GameScene").loadout.backpack.pockets[0].placements;
        const placement = placements.find((entry) => entry.item.id === itemId);
        return placement?.x === 3 && placement?.y === 2;
      },
      dragSetup.itemId,
      { timeout: 3_000 },
    );
  } catch (error) {
    const dragState = await page.evaluate((itemId) => {
      const game = window.__ASHEN_GAME__;
      const scene = game.scene.getScene("GameScene");
      const placement = scene.loadout.backpack.pockets[0].placements.find((entry) => entry.item.id === itemId);
      return {
        placement,
        loadoutDragActive: scene.loadoutDragActive,
        activePointerDown: scene.input.activePointer.isDown,
        search: scene.lootItemSearch,
        diagnostic: window.__ASHEN_LAST_ERROR__,
      };
    }, dragSetup.itemId);
    throw new Error(`Drag placement failed: ${JSON.stringify(dragState)}\n${String(error)}`);
  }
  await page.mouse.click(dragSetup.endX, dragSetup.endY);
  await clickHudLabel(page, "移入胸挂");
  await page.waitForFunction(
    (itemId) => {
      const scene = window.__ASHEN_GAME__.scene.getScene("GameScene");
      const backpackItems = scene.loadout.backpack.pockets.flatMap((pocket) => pocket.placements);
      const rigItems = scene.loadout.rig.pockets.flatMap((pocket) => pocket.placements);
      return !backpackItems.some((entry) => entry.item.id === itemId)
        && (rigItems.some((entry) => entry.item.id === itemId) || scene.loadout.weapon?.id === itemId || scene.loadout.rangedWeapon?.id === itemId);
    },
    dragSetup.itemId,
  );

  await page.goto(`${BASE_URL}/?qa=pickup`);
  await page.waitForFunction(() => {
    const scene = window.__ASHEN_GAME__?.scene?.getScene("GameScene");
    return scene?.lootPanelOpen === true && scene.loadout.backpack?.pockets[0]?.placements.length === 1;
  });
  const discardPoint = await page.evaluate(() => {
    const game = window.__ASHEN_GAME__;
    const scene = game.scene.getScene("GameScene");
    scene.cancelLootItemSearch();
    scene.openInventoryPanel();
    const placement = scene.loadout.backpack.pockets[0].placements[0];
    const canvasBounds = game.canvas.getBoundingClientRect();
    return {
      x: canvasBounds.left + ((800 + (placement.x + 0.5) * 46) / 1280) * canvasBounds.width,
      y: canvasBounds.top + ((282 + (placement.y + 0.5) * 46) / 720) * canvasBounds.height,
      itemId: placement.item.id,
    };
  });
  await page.mouse.click(discardPoint.x, discardPoint.y);
  await page.waitForFunction(() => {
    const texts = window.__ASHEN_GAME__.scene.getScene("HudScene").lootObjects
      .filter((object) => typeof object.text === "string")
      .map((object) => object.text);
    return texts.includes("用途") && texts.some((text) => text.includes("价值"));
  });
  await clickHudLabel(page, "丢弃物品");
  await clickHudLabel(page, "确认永久丢弃");
  await page.waitForFunction(
    (itemId) => !window.__ASHEN_GAME__.scene.getScene("GameScene").loadout.backpack.pockets
      .flatMap((pocket) => pocket.placements)
      .some((placement) => placement.item.id === itemId),
    discardPoint.itemId,
  );

  await page.goto(`${BASE_URL}/?qa=loot`);
  await page.waitForFunction(() => window.__ASHEN_GAME__?.scene?.getScene("GameScene")?.lootPanelOpen === true);
  await page.evaluate(() => {
    const scene = window.__ASHEN_GAME__.scene.getScene("GameScene");
    const item = scene.activeLootChest.loot[0];
    Object.assign(item, {
      name: "试作锋刃",
      tags: ["weapon", "valuable"],
      weaponStats: { damage: 40, attackIntervalMs: 600, critChance: 0.08 },
    });
    scene.activeLootChest.revealedItemIds.add(item.id);
    scene.emitLootState();
  });
  await page.waitForFunction(() => {
    const hud = window.__ASHEN_GAME__.scene.getScene("HudScene");
    return hud.lootObjects.some((object) => typeof object.text === "string" && object.text.includes("预计 ↑"));
  });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.evaluate(() => {
    const hud = window.__ASHEN_GAME__.scene.getScene("HudScene");
    const card = hud.lootObjects.find((object) => object.type === "Rectangle" && object.x === 132 && object.y === 190 && object.width === 276);
    card?.emit("pointerdown");
  });
  await page.waitForFunction(() => {
    const game = window.__ASHEN_GAME__;
    const texts = game.scene.getScene("HudScene").lootObjects
      .filter((object) => typeof object.text === "string")
      .map((object) => object.text);
    return game.registry.get("itemDetailOpen") === true
      && ["伤害", "攻速", "暴击", "DPS"].every((label) => texts.includes(label))
      && texts.some((text) => text.startsWith("↑"))
      && texts.some((text) => text.startsWith("↓"));
  });
  const weaponComparisonColors = await page.evaluate(() => window.__ASHEN_GAME__.scene
    .getScene("HudScene").lootObjects
    .filter((object) => typeof object.text === "string" && (object.text.startsWith("↑") || object.text.startsWith("↓")))
    .map((object) => ({ text: object.text, color: object.style.color })));
  assert(
    weaponComparisonColors.some((entry) => entry.text.startsWith("↑") && entry.color === "#69c58f"),
    "Weapon improvements are not shown with a green up arrow",
  );
  assert(
    weaponComparisonColors.some((entry) => entry.text.startsWith("↓") && entry.color === "#d87972"),
    "Weapon regressions are not shown with a red down arrow",
  );

  await page.goto(`${BASE_URL}/?qa=extract`);
  await page.waitForFunction(() => window.__ASHEN_GAME__?.scene?.getScene("GameScene")?.extractionPanelOpen === true);
  await page.keyboard.press("1");
  await page.waitForFunction(() => window.__ASHEN_GAME__?.scene?.getScene("GameScene")?.runState === "won");
  const fullExtractionResult = await page.evaluate(() => {
    const scene = window.__ASHEN_GAME__.scene.getScene("GameScene");
    const profile = JSON.parse(localStorage.getItem("ashen-vault.profile"));
    return { backpackRetained: scene.loadout.backpack !== undefined, extractionMode: profile.lastExtraction.mode };
  });
  assert(fullExtractionResult.backpackRetained, "Boss portal did not retain the backpack");
  assert(fullExtractionResult.extractionMode === "normal", "Boss portal persisted the wrong extraction mode");

  await page.goto(`${BASE_URL}/?qa=extract-drop`);
  await page.waitForFunction(() => window.__ASHEN_GAME__?.scene?.getScene("GameScene")?.runState === "won");
  const dropPackResult = await page.evaluate(() => {
    const scene = window.__ASHEN_GAME__.scene.getScene("GameScene");
    const profile = JSON.parse(localStorage.getItem("ashen-vault.profile"));
    return {
      backpackDropped: scene.loadout.backpack === undefined,
      extractionMode: profile.lastExtraction.mode,
      bossAlive: !scene.boss.dead,
    };
  });
  assert(dropPackResult.backpackDropped, "Early extraction point did not drop the backpack");
  assert(dropPackResult.extractionMode === "drop_pack", "Early extraction point persisted the wrong mode");
  assert(dropPackResult.bossAlive, "Early drop-pack extraction incorrectly required defeating the Boss");
  await page.keyboard.press("r");
  await page.waitForFunction(() => window.__ASHEN_GAME__?.scene?.isActive("HubScene"));
  assert(
    await page.evaluate(() => !window.__ASHEN_GAME__.scene.isActive("HudScene")),
    "Returning to the hub left the run HUD active",
  );
  assert(runtimeErrors.length === 0, `Browser runtime errors: ${runtimeErrors.join(" | ")}`);

  await context.close();
  process.stdout.write("Browser regression: 12 scenarios passed\n");
} finally {
  try {
    if (browser) await browser.close();
  } finally {
    await stopServer(server);
  }
}

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
  const runtimeErrors = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));

  await page.goto(BASE_URL);
  await page.waitForFunction(() => window.__ASHEN_GAME__?.scene?.isActive("HubScene"));
  await page.waitForFunction(() => {
    const hub = window.__ASHEN_GAME__.scene.getScene("HubScene");
    const labels = hub.objects.filter((object) => typeof object.text === "string").map((object) => object.text);
    return labels.includes("进入探索   Enter") && labels.includes("灰烬前厅") && labels.includes("仓库") && labels.includes("交易行");
  });
  await page.keyboard.press("Digit2");
  await page.waitForFunction(() => window.__ASHEN_GAME__.scene.getScene("HubScene").view === "warehouse");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.__ASHEN_GAME__.scene.getScene("HubScene").view === "home");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__ASHEN_GAME__?.scene?.isActive("GameScene"));
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
  await page.keyboard.press("Tab");
  await page.waitForFunction(() => window.__ASHEN_GAME__?.scene?.getScene("GameScene")?.lootPanelOpen === true);
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
  await page.mouse.click(270, 222);
  await page.waitForFunction(
    (itemId) => window.__ASHEN_GAME__.scene.getScene("GameScene").activeLootChest.revealedItemIds.has(itemId),
    searchedChestLootBefore.itemId,
  );
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.mouse.click(270, 222);
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
  await page.mouse.click(270, 222);
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
  await page.mouse.click(270, 222);
  await page.waitForTimeout(80);
  await page.mouse.click(270, 222);
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
  await page.mouse.click(270, 222);
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
    return {
      itemId: placement.item.id,
      startX: originX + (placement.x + 0.5) * cell,
      startY: originY + (placement.y + 0.5) * cell,
      endX: originX + (3 + 0.5) * cell,
      endY: originY + (2 + 0.5) * cell,
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
        && (rigItems.some((entry) => entry.item.id === itemId) || scene.loadout.weapon?.id === itemId);
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
  await page.mouse.click(270, 222);
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
  await page.keyboard.press("2");
  await page.waitForFunction(() => window.__ASHEN_GAME__?.scene?.getScene("GameScene")?.runState === "won");
  const dropPackResult = await page.evaluate(() => {
    const scene = window.__ASHEN_GAME__.scene.getScene("GameScene");
    const profile = JSON.parse(localStorage.getItem("ashen-vault.profile"));
    return {
      backpackDropped: scene.loadout.backpack === undefined,
      extractionMode: profile.lastExtraction.mode,
    };
  });
  assert(dropPackResult.backpackDropped, "Keyboard extraction choice 2 did not drop the backpack");
  assert(dropPackResult.extractionMode === "drop_pack", "Keyboard extraction persisted the wrong mode");
  await page.keyboard.press("r");
  await page.waitForFunction(() => window.__ASHEN_GAME__?.scene?.isActive("HubScene"));
  assert(
    await page.evaluate(() => !window.__ASHEN_GAME__.scene.isActive("HudScene")),
    "Returning to the hub left the run HUD active",
  );
  assert(runtimeErrors.length === 0, `Browser runtime errors: ${runtimeErrors.join(" | ")}`);

  await context.close();
  process.stdout.write("Browser regression: 11 scenarios passed\n");
} finally {
  try {
    if (browser) await browser.close();
  } finally {
    await stopServer(server);
  }
}

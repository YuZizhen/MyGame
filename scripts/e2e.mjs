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

async function waitForServer(server) {
  const deadline = Date.now() + 15_000;
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
  throw new Error("Timed out waiting for the Vite development server");
}

const server = spawn(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
  { cwd: process.cwd(), stdio: "ignore", windowsHide: true },
);
let browser;

try {
  await waitForServer(server);
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
  await page.waitForFunction(() => window.__ASHEN_GAME__.scene.getScene("GameScene").chests[0]?.opened === true);
  await page.keyboard.up("e");
  await page.waitForFunction(() => window.__ASHEN_GAME__.scene.getScene("GameScene").lootPanelOpen === true);
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
  await page.waitForFunction(
    (expected) => window.__ASHEN_GAME__.scene.getScene("GameScene").activeLootChest.loot.length === expected,
    searchedChestLootBefore.count - 1,
  );
  await page.keyboard.press("e");
  await page.waitForFunction(() => window.__ASHEN_GAME__.scene.getScene("GameScene").lootPanelOpen === false);

  await page.goto(`${BASE_URL}/?qa=loot`);
  await page.waitForFunction(() => window.__ASHEN_GAME__?.scene?.getScene("GameScene")?.lootPanelOpen === true);
  const clickLootBefore = await page.evaluate(
    () => {
      const chest = window.__ASHEN_GAME__.scene.getScene("GameScene").activeLootChest;
      return { count: chest.loot.length, itemId: chest.loot[0].id };
    },
  );
  await page.mouse.click(270, 222);
  await page.waitForFunction(
    (itemId) => window.__ASHEN_GAME__.scene.getScene("GameScene").activeLootChest.revealedItemIds.has(itemId),
    clickLootBefore.itemId,
  );
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.mouse.click(270, 222);
  await page.waitForFunction(
    (expected) => window.__ASHEN_GAME__.scene.getScene("GameScene").activeLootChest.loot.length === expected,
    clickLootBefore.count - 1,
  );
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.__ASHEN_GAME__.scene.getScene("GameScene").lootPanelOpen === false);

  await page.goto(`${BASE_URL}/?qa=loot`);
  await page.waitForFunction(() => window.__ASHEN_GAME__?.scene?.getScene("GameScene")?.lootPanelOpen === true);
  await page.evaluate(() => {
    const status = document.querySelector("#game-status");
    window.__LIVE_MUTATIONS__ = 0;
    new MutationObserver(() => {
      window.__LIVE_MUTATIONS__ += 1;
    }).observe(status, { childList: true, characterData: true, subtree: true });
  });
  const lootBefore = await page.evaluate(() => {
    const scene = window.__ASHEN_GAME__.scene.getScene("GameScene");
    return { count: scene.activeLootChest.loot.length, itemId: scene.activeLootChest.loot[0].id };
  });
  await page.keyboard.press("1");
  await page.waitForFunction(
    (itemId) => window.__ASHEN_GAME__.scene.getScene("GameScene").activeLootChest.revealedItemIds.has(itemId),
    lootBefore.itemId,
  );
  await page.waitForFunction(() => document.querySelector("#game-status")?.textContent?.includes("发现"));
  await new Promise((resolve) => setTimeout(resolve, 120));
  await page.evaluate(() => {
    document.querySelector("#game-status").textContent = "";
    window.__LIVE_MUTATIONS__ = 0;
  });
  await page.keyboard.press("1");
  await page.waitForFunction(
    (expected) => window.__ASHEN_GAME__.scene.getScene("GameScene").activeLootChest.loot.length === expected,
    lootBefore.count - 1,
  );
  await page.waitForFunction(() => document.querySelector("#game-status")?.textContent?.includes("已收取"));
  const keyboardLoot = await page.evaluate(() => {
    const scene = window.__ASHEN_GAME__.scene.getScene("GameScene");
    const placements = scene.loadout.backpack.pockets.flatMap((pocket) => pocket.placements);
    return {
      storedItems: placements.length,
      announcement: document.querySelector("#game-status")?.textContent ?? "",
      mutations: window.__LIVE_MUTATIONS__,
    };
  });
  assert(keyboardLoot.storedItems === 1, "Number key 1 did not take the first chest item");
  assert(keyboardLoot.announcement.includes("已收取"), "Keyboard loot was not announced to assistive technology");
  assert(keyboardLoot.mutations <= 2, "A single loadout message was announced more than once");

  await page.goto(`${BASE_URL}/?qa=pickup`);
  await page.waitForFunction(() => {
    const scene = window.__ASHEN_GAME__?.scene?.getScene("GameScene");
    return scene?.lootPanelOpen === true && scene.loadout.backpack?.pockets[0]?.placements.length === 1;
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
  await page.waitForFunction(
    (itemId) => {
      const placements = window.__ASHEN_GAME__.scene.getScene("GameScene").loadout.backpack.pockets[0].placements;
      const placement = placements.find((entry) => entry.item.id === itemId);
      return placement?.x === 3 && placement?.y === 2;
    },
    dragSetup.itemId,
  );
  await page.mouse.click(dragSetup.endX, dragSetup.endY);
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

  await page.goto(`${BASE_URL}/?qa=loot`);
  await page.waitForFunction(() => window.__ASHEN_GAME__?.scene?.getScene("GameScene")?.lootPanelOpen === true);
  await page.evaluate(() => {
    const scene = window.__ASHEN_GAME__.scene.getScene("GameScene");
    const item = scene.activeLootChest.loot[0];
    Object.assign(item, {
      name: "试作锋刃",
      tags: ["weapon", "valuable"],
      weaponStats: { damage: 36, attackIntervalMs: 450, critChance: 0.04 },
    });
    scene.activeLootChest.revealedItemIds.add(item.id);
    scene.emitLootState();
  });
  await page.waitForFunction(() => {
    const hud = window.__ASHEN_GAME__.scene.getScene("HudScene");
    return hud.lootObjects.some((object) => typeof object.text === "string" && object.text.includes("预计 ↑"));
  });

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
  assert(runtimeErrors.length === 0, `Browser runtime errors: ${runtimeErrors.join(" | ")}`);

  await context.close();
  process.stdout.write("Browser regression: 5 scenarios passed\n");
} finally {
  try {
    if (browser) await browser.close();
  } finally {
    await stopServer(server);
  }
}

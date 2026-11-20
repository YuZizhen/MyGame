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
    return scene.activeLootChest.loot.length;
  });
  await page.keyboard.press("1");
  await page.waitForFunction(
    (expected) => window.__ASHEN_GAME__.scene.getScene("GameScene").activeLootChest.loot.length === expected,
    lootBefore - 1,
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
  process.stdout.write("Browser regression: 3 scenarios passed\n");
} finally {
  try {
    if (browser) await browser.close();
  } finally {
    await stopServer(server);
  }
}

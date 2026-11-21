import Phaser from "phaser";
import "./style.css";
import { GameAudio } from "./audio/GameAudio";
import { installRuntimeDiagnostics } from "./debug/runtimeDiagnostics";
import { GameScene } from "./game/GameScene";
import { HudScene } from "./game/HudScene";

const rendererType = import.meta.env.DEV && new URLSearchParams(window.location.search).get("renderer") === "canvas"
  ? Phaser.CANVAS
  : Phaser.AUTO;
const game = new Phaser.Game({
  type: rendererType,
  parent: "game",
  backgroundColor: "#080b0f",
  pixelArt: false,
  antialias: true,
  width: 1280,
  height: 720,
  physics: {
    default: "arcade",
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 1280,
    height: 720,
  },
  input: {
    touch: {
      capture: false,
    },
  },
  scene: [GameScene, HudScene],
});
const gameAudio = new GameAudio(game);
gameAudio.start();
const runtimeDiagnostics = installRuntimeDiagnostics(game);

const gameShell = document.querySelector<HTMLElement>("#game-shell");
const gameStatus = document.querySelector<HTMLElement>("#game-status");
game.canvas.setAttribute("aria-hidden", "true");

const focusGame = (): void => gameShell?.focus({ preventScroll: true });
const announcementQueue: string[] = [];
let announcing = false;
let announcementTimer: number | undefined;
const announceNext = (): void => {
  if (!gameStatus || announcementQueue.length === 0) {
    announcing = false;
    return;
  }
  announcing = true;
  const message = announcementQueue.shift()!;
  gameStatus.textContent = "";
  window.requestAnimationFrame(() => {
    gameStatus.textContent = message.replaceAll("\n", "，");
    announcementTimer = window.setTimeout(announceNext, 100);
  });
};
const announce = (message: string): void => {
  if (!gameStatus) return;
  announcementQueue.push(message);
  if (!announcing) announceNext();
};
const announceExtraction = (outcome: { mode: string; retainedItemCount: number; droppedItemCount: number }): void => {
  announce(
    outcome.mode === "drop_pack"
      ? `丢包撤离成功，保留 ${outcome.retainedItemCount} 件，丢弃 ${outcome.droppedItemCount} 件`
      : `完整撤离成功，带出 ${outcome.retainedItemCount} 件`,
  );
};
const manageTabFocus = (event: KeyboardEvent): void => {
  if (event.code !== "Tab" || !gameShell) return;
  if (game.registry.get("lootPanelOpen") === true && !event.shiftKey) {
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) game.events.emit("input:loot-close");
    return;
  }
  if (document.activeElement !== gameShell || event.shiftKey) {
    event.stopPropagation();
    return;
  }
  event.preventDefault();
  if (!event.repeat) game.events.emit("input:inventory-toggle");
};
const closeLootFromWindow = (event: KeyboardEvent): void => {
  if (event.repeat) return;
  if (event.code === "Escape" && game.registry.get("itemDetailOpen") === true) {
    event.preventDefault();
    event.stopPropagation();
    game.events.emit("input:item-detail-close");
    return;
  }
  if (game.registry.get("lootPanelOpen") !== true) return;
  if (event.code !== "Escape" && event.code !== "KeyE") return;
  event.preventDefault();
  event.stopPropagation();
  game.events.emit("input:loot-close");
};
const releaseLoadoutDrag = (): void => {
  // Phaser may process its queued drag-start on the next frame, after the DOM pointerup.
  // Release once more after that frame so a click can never leave drag state latched.
  window.setTimeout(() => game.events.emit("loadout:drag-state", false), 250);
};
gameShell?.addEventListener("pointerdown", focusGame);
document.addEventListener("keydown", manageTabFocus, true);
window.addEventListener("keydown", closeLootFromWindow, true);
window.addEventListener("pointerup", releaseLoadoutDrag, true);
window.addEventListener("pointercancel", releaseLoadoutDrag, true);
window.addEventListener("mouseup", releaseLoadoutDrag, true);
window.addEventListener("touchend", releaseLoadoutDrag, true);
window.addEventListener("touchcancel", releaseLoadoutDrag, true);
game.events.on("hud:banner", announce);
game.events.on("extraction:result", announceExtraction);

if (import.meta.env.DEV) {
  (window as Window & { __ASHEN_GAME__?: Phaser.Game }).__ASHEN_GAME__ = game;
}

window.addEventListener("beforeunload", () => {
  gameShell?.removeEventListener("pointerdown", focusGame);
  document.removeEventListener("keydown", manageTabFocus, true);
  window.removeEventListener("keydown", closeLootFromWindow, true);
  window.removeEventListener("pointerup", releaseLoadoutDrag, true);
  window.removeEventListener("pointercancel", releaseLoadoutDrag, true);
  window.removeEventListener("mouseup", releaseLoadoutDrag, true);
  window.removeEventListener("touchend", releaseLoadoutDrag, true);
  window.removeEventListener("touchcancel", releaseLoadoutDrag, true);
  game.events.off("hud:banner", announce);
  game.events.off("extraction:result", announceExtraction);
  if (announcementTimer !== undefined) window.clearTimeout(announcementTimer);
  gameAudio.destroy();
  runtimeDiagnostics.destroy();
  game.destroy(true);
});


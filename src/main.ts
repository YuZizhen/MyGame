import Phaser from "phaser";
import "./style.css";
import { GameScene } from "./game/GameScene";
import { HudScene } from "./game/HudScene";

const game = new Phaser.Game({
  type: Phaser.AUTO,
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
  scene: [GameScene, HudScene],
});

if (import.meta.env.DEV) {
  (window as Window & { __ASHEN_GAME__?: Phaser.Game }).__ASHEN_GAME__ = game;
}

window.addEventListener("beforeunload", () => game.destroy(true));


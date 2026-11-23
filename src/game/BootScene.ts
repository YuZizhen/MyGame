import Phaser from "phaser";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  create(): void {
    const qaMode = import.meta.env.DEV ? new URLSearchParams(window.location.search).get("qa") : null;
    this.scene.start(qaMode ? "GameScene" : "HubScene");
  }
}

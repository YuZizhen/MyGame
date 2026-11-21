import type Phaser from "phaser";

interface LootSearchSnapshot {
  chestId: string;
  itemId: string;
  startedAt: number;
  duration: number;
}

interface DiagnosticGameScene extends Phaser.Scene {
  lootPanelOpen?: boolean;
  loadoutDragActive?: boolean;
  lootItemSearch?: LootSearchSnapshot;
  activeLootChest?: {
    id: string;
    loot: Array<{ id: string; name?: string }>;
    revealedItemIds: Set<string>;
  };
}

interface DiagnosticRecord {
  code: string;
  message: string;
  stack?: string;
  context: Record<string, unknown>;
  occurredAt: string;
}

interface DiagnosticController {
  destroy(): void;
  report(error: Error, code?: string, extra?: Record<string, unknown>): void;
  recoverLoop(reason: string, force?: boolean): void;
}

type DebugWindow = Window & {
  __ASHEN_LAST_ERROR__?: DiagnosticRecord;
};

function errorFromUnknown(value: unknown): Error {
  if (value instanceof Error) return value;
  if (typeof value === "string") return new Error(value);
  try {
    return new Error(JSON.stringify(value));
  } catch {
    return new Error(String(value));
  }
}

export function installRuntimeDiagnostics(game: Phaser.Game): DiagnosticController {
  const reportedCodes = new Set<string>();
  let lastFrame = game.loop.frame;
  let lastFrameAdvancedAt = performance.now();
  let trackedSearchKey = "";
  let trackedSearchClock = Number.NaN;
  let searchClockAdvancedAt = performance.now();
  let missingSearchSince: number | undefined;

  const diagnosticsRoot = document.createElement("section");
  diagnosticsRoot.id = "runtime-diagnostics";
  diagnosticsRoot.hidden = true;
  diagnosticsRoot.setAttribute("role", "alert");
  diagnosticsRoot.style.cssText = [
    "position:fixed",
    "inset:16px",
    "z-index:2147483647",
    "overflow:auto",
    "padding:18px",
    "background:rgba(20,5,7,.97)",
    "border:3px solid #ff5f62",
    "color:#ffe8e8",
    "font:14px/1.5 Consolas,monospace",
    "white-space:pre-wrap",
    "user-select:text",
  ].join(";");
  const heading = document.createElement("strong");
  heading.style.cssText = "display:block;font-size:20px;margin-bottom:10px;color:#ff9496";
  heading.textContent = "游戏运行异常（请截图或复制以下诊断）";
  const output = document.createElement("pre");
  output.style.cssText = "margin:0 0 14px;white-space:pre-wrap";
  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.textContent = "复制诊断";
  copyButton.style.cssText = "padding:10px 16px;margin-right:10px;cursor:pointer";
  const emergencyClose = document.createElement("button");
  emergencyClose.type = "button";
  emergencyClose.textContent = "紧急关闭搜刮界面";
  emergencyClose.style.cssText = "padding:10px 16px;margin-right:10px;cursor:pointer";
  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.textContent = "隐藏诊断";
  dismiss.style.cssText = "padding:10px 16px;cursor:pointer";
  diagnosticsRoot.append(heading, output, copyButton, emergencyClose, dismiss);
  document.body.append(diagnosticsRoot);

  const snapshot = (extra: Record<string, unknown> = {}): Record<string, unknown> => {
    const scene = game.scene.getScene("GameScene") as DiagnosticGameScene | null;
    const search = scene?.lootItemSearch;
    return {
      url: window.location.href,
      visibilityState: document.visibilityState,
      documentHasFocus: document.hasFocus(),
      activeElement: document.activeElement?.id || document.activeElement?.tagName || null,
      gameLoopRunning: game.loop.running,
      rafRunning: game.loop.raf.isRunning,
      gameLoopFrame: game.loop.frame,
      gameLoopActualFps: Number(game.loop.actualFps.toFixed(2)),
      gameLoopInFocus: game.loop.inFocus,
      gameSceneActive: game.scene.isActive("GameScene"),
      gameScenePaused: game.scene.isPaused("GameScene"),
      hudSceneActive: game.scene.isActive("HudScene"),
      registryLootPanelOpen: game.registry.get("lootPanelOpen") === true,
      sceneLootPanelOpen: scene?.lootPanelOpen ?? null,
      loadoutDragActive: scene?.loadoutDragActive ?? null,
      activeChestId: scene?.activeLootChest?.id ?? null,
      chestLootCount: scene?.activeLootChest?.loot.length ?? null,
      revealedItemCount: scene?.activeLootChest?.revealedItemIds.size ?? null,
      search: search ? { ...search, sceneClockNow: scene?.time.now, elapsed: scene.time.now - search.startedAt } : null,
      ...extra,
    };
  };

  const report = (error: Error, code = "UNHANDLED_RUNTIME_ERROR", extra: Record<string, unknown> = {}): void => {
    if (reportedCodes.has(code)) return;
    reportedCodes.add(code);
    const record: DiagnosticRecord = {
      code,
      message: error.message,
      stack: error.stack,
      context: snapshot(extra),
      occurredAt: new Date().toISOString(),
    };
    (window as DebugWindow).__ASHEN_LAST_ERROR__ = record;
    output.textContent = JSON.stringify(record, null, 2);
    diagnosticsRoot.hidden = false;
    console.error(`[${code}]`, error, record.context);
  };

  const raise = (code: string, message: string, extra: Record<string, unknown> = {}): void => {
    if (reportedCodes.has(code)) return;
    const error = new Error(`[${code}] ${message}\n${JSON.stringify(snapshot(extra), null, 2)}`);
    report(error, code, extra);
    window.setTimeout(() => {
      throw error;
    }, 0);
  };

  const recoverLoop = (reason: string, force = false): void => {
    if (force && game.loop.running) game.loop.sleep();
    if (!game.loop.running || !game.loop.raf.isRunning) game.loop.wake(true);
    if (game.scene.isPaused("GameScene")) game.scene.resume("GameScene");
    if (game.scene.isPaused("HudScene")) game.scene.resume("HudScene");
    game.events.emit("diagnostics:loop-recovered", reason);
  };

  const handleWindowError = (event: ErrorEvent): void => {
    const diagnosticCode = event.message.match(/\[([A-Z0-9_]+)\]/)?.[1] ?? "WINDOW_ERROR";
    report(event.error instanceof Error ? event.error : new Error(event.message), diagnosticCode, {
      filename: event.filename,
      line: event.lineno,
      column: event.colno,
    });
  };
  const handleRejection = (event: PromiseRejectionEvent): void => {
    report(errorFromUnknown(event.reason), "UNHANDLED_PROMISE_REJECTION");
  };
  const handleVisibility = (): void => {
    if (document.visibilityState === "visible") recoverLoop("visibility-visible");
  };
  const handleFocus = (): void => recoverLoop("window-focus");
  const handleInteraction = (): void => recoverLoop("user-interaction");

  window.addEventListener("error", handleWindowError);
  window.addEventListener("unhandledrejection", handleRejection);
  window.addEventListener("focus", handleFocus);
  window.addEventListener("pointerdown", handleInteraction, true);
  window.addEventListener("keydown", handleInteraction, true);
  document.addEventListener("visibilitychange", handleVisibility);

  copyButton.addEventListener("click", () => {
    void navigator.clipboard?.writeText(output.textContent ?? "");
    copyButton.textContent = "已复制";
  });
  emergencyClose.addEventListener("click", () => {
    recoverLoop("diagnostic-emergency-close", true);
    game.events.emit("input:loot-close");
    diagnosticsRoot.hidden = true;
  });
  dismiss.addEventListener("click", () => {
    diagnosticsRoot.hidden = true;
  });

  const watchdog = window.setInterval(() => {
    const now = performance.now();
    const panelOpen = game.registry.get("lootPanelOpen") === true;
    const scene = game.scene.getScene("GameScene") as DiagnosticGameScene | null;
    const search = scene?.lootItemSearch;

    if (game.loop.frame !== lastFrame) {
      lastFrame = game.loop.frame;
      lastFrameAdvancedAt = now;
    }
    if (panelOpen && document.visibilityState === "visible" && now - lastFrameAdvancedAt > 1800) {
      recoverLoop("watchdog-frame-stall", true);
      raise("GAME_LOOP_STALLED", "搜刮界面打开时游戏帧超过 1.8 秒没有推进", {
        lastFrameAdvancedAgoMs: Math.round(now - lastFrameAdvancedAt),
      });
    }

    if (!panelOpen) {
      trackedSearchKey = "";
      missingSearchSince = undefined;
      return;
    }
    if (scene?.loadoutDragActive) {
      missingSearchSince = undefined;
      return;
    }
    if (!search) {
      const unknownCount = scene?.activeLootChest
        ? scene.activeLootChest.loot.filter((item) => !scene.activeLootChest!.revealedItemIds.has(item.id)).length
        : 0;
      if (unknownCount <= 0) {
        missingSearchSince = undefined;
      } else if (missingSearchSince === undefined) {
        missingSearchSince = now;
      } else if (now - missingSearchSince > 1200) {
        raise("LOOT_SEARCH_MISSING", "宝箱存在未知物品，但没有活动搜索任务", { unknownCount });
      }
      return;
    }
    missingSearchSince = undefined;

    const searchKey = `${search.chestId}:${search.itemId}:${search.startedAt}`;
    if (searchKey !== trackedSearchKey) {
      trackedSearchKey = searchKey;
      trackedSearchClock = scene?.time.now ?? Number.NaN;
      searchClockAdvancedAt = now;
      return;
    }
    const currentClock = scene?.time.now ?? Number.NaN;
    if (currentClock !== trackedSearchClock) {
      trackedSearchClock = currentClock;
      searchClockAdvancedAt = now;
    } else if (document.visibilityState === "visible" && now - searchClockAdvancedAt > 1800) {
      raise("LOOT_SEARCH_CLOCK_STALLED", "物品搜索时钟超过 1.8 秒没有推进", {
        searchClockStalledMs: Math.round(now - searchClockAdvancedAt),
      });
    }
  }, 300);

  return {
    report,
    recoverLoop,
    destroy: () => {
      window.clearInterval(watchdog);
      window.removeEventListener("error", handleWindowError);
      window.removeEventListener("unhandledrejection", handleRejection);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("pointerdown", handleInteraction, true);
      window.removeEventListener("keydown", handleInteraction, true);
      document.removeEventListener("visibilitychange", handleVisibility);
      diagnosticsRoot.remove();
    },
  };
}

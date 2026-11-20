import type Phaser from "phaser";
import {
  getAudioCue,
  type AudioCue,
  type AudioEventPayload,
  type ToneStep,
} from "./audioCues";

type BrowserWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

interface SearchLoop {
  oscillator: OscillatorNode;
  envelope: GainNode;
}

export class GameAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private muted = false;
  private volume = 0.42;
  private readonly lastPlayedAt = new Map<string, number>();
  private readonly searchLoops = new Map<string, SearchLoop>();
  private readonly pendingSearchLoopIds = new Set<string>();

  constructor(private readonly game: Phaser.Game) {}

  start(): void {
    this.game.events.on("audio:event", this.handleEvent, this);
    window.addEventListener("pointerdown", this.unlock, { capture: true });
    window.addEventListener("keydown", this.unlock, { capture: true });
    window.addEventListener("keydown", this.handleShortcut);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : this.volume;
  }

  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume));
    if (this.master && !this.muted) this.master.gain.value = this.volume;
  }

  destroy(): void {
    this.game.events.off("audio:event", this.handleEvent, this);
    window.removeEventListener("pointerdown", this.unlock, { capture: true });
    window.removeEventListener("keydown", this.unlock, { capture: true });
    window.removeEventListener("keydown", this.handleShortcut);
    for (const containerId of this.searchLoops.keys()) this.stopSearchLoop(containerId, true);
    this.pendingSearchLoopIds.clear();
    if (this.context) void this.context.close().catch(() => undefined);
    this.context = undefined;
    this.master = undefined;
  }

  private readonly unlock = (): void => {
    if (!this.context) {
      const AudioContextClass = window.AudioContext ?? (window as BrowserWindow).webkitAudioContext;
      if (!AudioContextClass) return;
      this.context = new AudioContextClass();
      this.master = this.context.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(this.context.destination);
    }
    void this.context.resume().then(() => {
      this.removeUnlockListeners();
    }).catch(() => undefined);
  };

  private readonly handleShortcut = (event: KeyboardEvent): void => {
    if (event.code !== "KeyM" || event.repeat) return;
    this.setMuted(!this.muted);
    this.game.events.emit("hud:banner", this.muted ? "声音已静音" : "声音已开启");
  };

  private handleEvent(eventName: string, payload?: AudioEventPayload): void {
    if (eventName === "container.search.loop.stop") {
      if (payload?.containerId) {
        this.pendingSearchLoopIds.delete(payload.containerId);
        this.stopSearchLoop(payload.containerId);
      }
      return;
    }
    if (this.muted || !this.context || !this.master) return;
    if (eventName === "container.search.loop.start") {
      if (payload?.containerId) {
        const containerId = payload.containerId;
        this.pendingSearchLoopIds.add(containerId);
        this.runWhenContextReady(() => {
          if (this.pendingSearchLoopIds.has(containerId)) this.startSearchLoop(containerId);
        });
      }
      return;
    }
    const audioCue = getAudioCue(eventName, payload);
    if (!audioCue) return;
    this.runWhenContextReady(() => this.playWithCooldown(eventName, audioCue));
  }

  private runWhenContextReady(action: () => void): void {
    if (!this.context || !this.master || this.context.state === "closed") return;
    if (this.context.state === "running") {
      this.removeUnlockListeners();
      action();
      return;
    }
    void this.context.resume().then(() => {
      if (!this.context || this.context.state !== "running") return;
      this.removeUnlockListeners();
      action();
    }).catch(() => undefined);
  }

  private playWithCooldown(eventName: string, audioCue: AudioCue): void {
    const now = performance.now();
    const lastPlayedAt = this.lastPlayedAt.get(eventName) ?? Number.NEGATIVE_INFINITY;
    if (now - lastPlayedAt < audioCue.cooldownMs) return;
    this.lastPlayedAt.set(eventName, now);
    this.playCue(audioCue);
  }

  private removeUnlockListeners(): void {
    window.removeEventListener("pointerdown", this.unlock, { capture: true });
    window.removeEventListener("keydown", this.unlock, { capture: true });
  }

  private startSearchLoop(containerId: string): void {
    if (!this.context || !this.master || this.searchLoops.has(containerId)) return;
    this.pendingSearchLoopIds.delete(containerId);
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    const now = this.context.currentTime;
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(72, now);
    oscillator.frequency.linearRampToValueAtTime(88, now + 1.1);
    oscillator.frequency.linearRampToValueAtTime(72, now + 2.2);
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(0.045, now + 0.12);
    oscillator.connect(envelope);
    envelope.connect(this.master);
    oscillator.start(now);
    this.searchLoops.set(containerId, { oscillator, envelope });
  }

  private stopSearchLoop(containerId: string, immediate = false): void {
    const loop = this.searchLoops.get(containerId);
    if (!loop || !this.context) return;
    this.searchLoops.delete(containerId);
    const now = this.context.currentTime;
    const stopsAt = immediate ? now + 0.01 : now + 0.12;
    loop.envelope.gain.cancelScheduledValues(now);
    loop.envelope.gain.setValueAtTime(Math.max(0.0001, loop.envelope.gain.value), now);
    loop.envelope.gain.exponentialRampToValueAtTime(0.0001, stopsAt);
    loop.oscillator.stop(stopsAt + 0.01);
    loop.oscillator.onended = () => {
      loop.oscillator.disconnect();
      loop.envelope.disconnect();
    };
  }

  private playCue(audioCue: AudioCue): void {
    if (!this.context || !this.master) return;
    const startedAt = this.context.currentTime;
    audioCue.tones.forEach((tone) => this.playTone(tone, audioCue.gain, startedAt));
  }

  private playTone(tone: ToneStep, cueGain: number, startedAt: number): void {
    if (!this.context || !this.master) return;
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    const startsAt = startedAt + (tone.offsetMs ?? 0) / 1000;
    const endsAt = startsAt + tone.durationMs / 1000;
    const peak = Math.min(0.7, cueGain * (tone.gain ?? 1));

    oscillator.type = tone.waveform ?? "sine";
    oscillator.frequency.setValueAtTime(tone.frequency, startsAt);
    oscillator.frequency.exponentialRampToValueAtTime(tone.endFrequency ?? tone.frequency, endsAt);
    envelope.gain.setValueAtTime(0.0001, startsAt);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), startsAt + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, endsAt);
    oscillator.connect(envelope);
    envelope.connect(this.master);
    oscillator.start(startsAt);
    oscillator.stop(endsAt + 0.02);
  }
}

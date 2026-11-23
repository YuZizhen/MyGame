export type Waveform = "sine" | "square" | "sawtooth" | "triangle";

export interface ToneStep {
  frequency: number;
  durationMs: number;
  offsetMs?: number;
  gain?: number;
  waveform?: Waveform;
  endFrequency?: number;
}

export interface AudioCue {
  cooldownMs: number;
  gain: number;
  tones: readonly ToneStep[];
}

export type AudioRarity = "common" | "magic" | "rare" | "red";

export interface AudioEventPayload {
  containerId?: string;
  rarity?: AudioRarity;
}

const cue = (
  cooldownMs: number,
  gain: number,
  ...tones: ToneStep[]
): AudioCue => ({ cooldownMs, gain, tones });

export const AUDIO_CUES = {
  "container.proximity.enter": cue(1200, 0.18, { frequency: 520, durationMs: 70, waveform: "sine" }),
  "container.search.start": cue(180, 0.2, { frequency: 150, durationMs: 90, waveform: "triangle", endFrequency: 115 }),
  "container.search.loop.start": cue(0, 0.08),
  "container.search.loop.stop": cue(0, 0.08),
  "container.search.cancel": cue(180, 0.18, { frequency: 190, durationMs: 110, waveform: "square", endFrequency: 90 }),
  "container.search.complete": cue(220, 0.18, { frequency: 340, durationMs: 90, waveform: "triangle", endFrequency: 520 }),
  "container.open": cue(
    250,
    0.26,
    { frequency: 105, durationMs: 150, waveform: "triangle", endFrequency: 75 },
    { frequency: 420, durationMs: 120, offsetMs: 90, waveform: "sine", endFrequency: 620 },
  ),
  "loot.search.item.start": cue(90, 0.12, { frequency: 190, durationMs: 80, waveform: "triangle", endFrequency: 240 }),
  "loot.search.item.cancel": cue(120, 0.13, { frequency: 210, durationMs: 90, waveform: "square", endFrequency: 120 }),
  "loot.search.item.reveal": cue(
    80,
    0.16,
    { frequency: 420, durationMs: 70, waveform: "triangle", endFrequency: 520 },
  ),
  "loot.item.pickup": cue(70, 0.16, { frequency: 720, durationMs: 75, waveform: "sine", endFrequency: 920 }),
  "loot.item.pickup_failed": cue(350, 0.2, { frequency: 150, durationMs: 130, waveform: "square", endFrequency: 95 }),
  "inventory.item.place": cue(70, 0.13, { frequency: 260, durationMs: 60, waveform: "triangle", endFrequency: 210 }),
  "inventory.item.rotate": cue(90, 0.12, { frequency: 390, durationMs: 55, waveform: "square", endFrequency: 480 }),
  "inventory.item.reject": cue(300, 0.16, { frequency: 130, durationMs: 100, waveform: "square", endFrequency: 80 }),
  "player.dodge": cue(120, 0.16, { frequency: 240, durationMs: 120, waveform: "sawtooth", endFrequency: 90 }),
  "player.melee.swing": cue(90, 0.16, { frequency: 210, durationMs: 95, waveform: "sawtooth", endFrequency: 80 }),
  "combat.melee.hit": cue(65, 0.22, { frequency: 92, durationMs: 85, waveform: "square", endFrequency: 55 }),
  "combat.enemy.kill": cue(
    110,
    0.2,
    { frequency: 160, durationMs: 100, waveform: "triangle", endFrequency: 90 },
    { frequency: 360, durationMs: 100, offsetMs: 65, waveform: "sine" },
  ),
  "player.hurt": cue(180, 0.26, { frequency: 110, durationMs: 180, waveform: "sawtooth", endFrequency: 55 }),
  "player.heal": cue(
    220,
    0.2,
    { frequency: 330, durationMs: 100, waveform: "sine", endFrequency: 440 },
    { frequency: 660, durationMs: 180, offsetMs: 80, waveform: "sine", endFrequency: 880 },
  ),
  "boss.attack.telegraph": cue(450, 0.22, { frequency: 80, durationMs: 420, waveform: "sine", endFrequency: 155 }),
  "boss.encounter.start": cue(
    1200,
    0.28,
    { frequency: 55, durationMs: 700, waveform: "sawtooth", endFrequency: 82 },
    { frequency: 110, durationMs: 520, offsetMs: 240, waveform: "sine", endFrequency: 72 },
  ),
  "boss.defeated": cue(
    1200,
    0.28,
    { frequency: 90, durationMs: 300, waveform: "triangle", endFrequency: 55 },
    { frequency: 440, durationMs: 220, offsetMs: 250, waveform: "sine" },
    { frequency: 660, durationMs: 360, offsetMs: 430, waveform: "sine" },
  ),
  "map.poi.discovered": cue(
    600,
    0.17,
    { frequency: 480, durationMs: 90, waveform: "sine" },
    { frequency: 640, durationMs: 120, offsetMs: 100, waveform: "sine" },
  ),
  "run.victory": cue(
    1800,
    0.3,
    { frequency: 392, durationMs: 180, waveform: "sine" },
    { frequency: 523, durationMs: 180, offsetMs: 170, waveform: "sine" },
    { frequency: 659, durationMs: 420, offsetMs: 340, waveform: "sine" },
  ),
  "run.failure": cue(
    1800,
    0.27,
    { frequency: 220, durationMs: 220, waveform: "triangle" },
    { frequency: 165, durationMs: 260, offsetMs: 190, waveform: "triangle" },
    { frequency: 110, durationMs: 420, offsetMs: 410, waveform: "triangle" },
  ),
} as const satisfies Record<string, AudioCue>;

const PICKUP_RARITY_CUES: Record<AudioRarity, AudioCue> = {
  common: AUDIO_CUES["loot.item.pickup"],
  magic: cue(
    70,
    0.18,
    { frequency: 720, durationMs: 75, waveform: "sine", endFrequency: 980 },
    { frequency: 1180, durationMs: 90, offsetMs: 55, waveform: "sine" },
  ),
  rare: cue(
    90,
    0.22,
    { frequency: 660, durationMs: 100, waveform: "sine" },
    { frequency: 880, durationMs: 120, offsetMs: 80, waveform: "sine" },
    { frequency: 1175, durationMs: 170, offsetMs: 170, waveform: "sine" },
  ),
  red: cue(
    180,
    0.27,
    { frequency: 220, durationMs: 160, waveform: "triangle", endFrequency: 330 },
    { frequency: 660, durationMs: 220, offsetMs: 110, waveform: "sine" },
    { frequency: 990, durationMs: 360, offsetMs: 260, waveform: "sine" },
  ),
};

const REVEAL_RARITY_CUES: Record<AudioRarity, AudioCue> = {
  common: AUDIO_CUES["loot.search.item.reveal"],
  magic: cue(
    320,
    0.22,
    { frequency: 620, durationMs: 110, waveform: "sine" },
    { frequency: 830, durationMs: 150, offsetMs: 90, waveform: "sine" },
    { frequency: 1110, durationMs: 180, offsetMs: 190, waveform: "sine" },
  ),
  rare: cue(
    420,
    0.25,
    { frequency: 440, durationMs: 130, waveform: "triangle" },
    { frequency: 660, durationMs: 170, offsetMs: 110, waveform: "sine" },
    { frequency: 880, durationMs: 260, offsetMs: 250, waveform: "sine" },
  ),
  red: cue(
    700,
    0.3,
    { frequency: 110, durationMs: 300, waveform: "sawtooth", endFrequency: 165 },
    { frequency: 550, durationMs: 220, offsetMs: 180, waveform: "sine" },
    { frequency: 825, durationMs: 420, offsetMs: 360, waveform: "sine" },
  ),
};

export type AudioEventName = keyof typeof AUDIO_CUES;

export function getAudioCue(eventName: string, payload?: AudioEventPayload): AudioCue | undefined {
  if (eventName === "loot.item.pickup") {
    return PICKUP_RARITY_CUES[payload?.rarity ?? "common"];
  }
  if (eventName === "loot.search.item.reveal") {
    return REVEAL_RARITY_CUES[payload?.rarity ?? "common"];
  }
  return AUDIO_CUES[eventName as AudioEventName];
}

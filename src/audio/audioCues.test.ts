import { describe, expect, it } from "vitest";
import { AUDIO_CUES, getAudioCue } from "./audioCues";

const EMITTED_AUDIO_EVENTS = [
  "container.proximity.enter",
  "container.search.start",
  "container.search.loop.start",
  "container.search.loop.stop",
  "container.search.cancel",
  "container.search.complete",
  "container.open",
  "loot.search.item.start",
  "loot.search.item.cancel",
  "loot.search.item.reveal",
  "loot.item.pickup",
  "loot.item.pickup_failed",
  "inventory.item.place",
  "inventory.item.rotate",
  "inventory.item.reject",
  "player.dodge",
  "player.melee.swing",
  "combat.melee.hit",
  "combat.enemy.kill",
  "player.hurt",
  "player.heal",
  "boss.attack.telegraph",
  "boss.encounter.start",
  "boss.defeated",
  "map.poi.discovered",
  "run.victory",
  "run.failure",
];

describe("audio cue registry", () => {
  it("covers every audio event currently emitted by the game", () => {
    expect(EMITTED_AUDIO_EVENTS.filter((eventName) => !getAudioCue(eventName))).toEqual([]);
  });

  it("uses finite positive synthesis values and non-negative scheduling", () => {
    for (const audioCue of Object.values(AUDIO_CUES)) {
      expect(audioCue.cooldownMs).toBeGreaterThanOrEqual(0);
      expect(audioCue.gain).toBeGreaterThan(0);
      for (const tone of audioCue.tones) {
        expect(tone.frequency).toBeGreaterThan(0);
        expect(tone.durationMs).toBeGreaterThan(0);
        expect(tone.offsetMs ?? 0).toBeGreaterThanOrEqual(0);
        expect(tone.endFrequency ?? tone.frequency).toBeGreaterThan(0);
      }
    }
  });

  it("ignores unknown events", () => {
    expect(getAudioCue("unknown.event")).toBeUndefined();
  });

  it("uses richer pickup and reveal cues for higher rarities", () => {
    expect(getAudioCue("loot.item.pickup", { rarity: "red" })?.tones.length).toBeGreaterThan(
      getAudioCue("loot.item.pickup", { rarity: "common" })?.tones.length ?? 0,
    );
    expect(getAudioCue("loot.search.item.reveal", { rarity: "red" })?.tones.length).toBeGreaterThan(
      getAudioCue("loot.search.item.reveal", { rarity: "common" })?.tones.length ?? 0,
    );
  });
});

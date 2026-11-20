# Development Progress

Last updated: 2026-11-20

## Current branch

`codex/container-system-hardening`

## Goal

Evolve the current PvE prototype into a maintainable extraction-game foundation while preserving existing combat, dungeon, chest, minimap, boss, and loot behavior.

## Completed

- [x] Independent GAME REVIEW audit of architecture, gameplay, runtime risks, performance, accessibility, and test gaps.
- [x] Created a rollback baseline for the current playable prototype.
- [x] Confirmed `npm run build` passes with strict TypeScript checks.
- [x] Defined the target terminology: weapon slot, rig container, backpack container.
- [x] Confirmed rigs and backpacks use the same pocket rules but different extraction retention rules.
- [x] Integrated the domain loadout into the playable scene: independent weapon, rig, and backpack state.
- [x] Rendered rig and backpack side by side with one shared pocket renderer.
- [x] Added boss-exclusive `2×3` red cargo and protected its generation with tests.
- [x] Prevented the inventory overlay from opening during an active boss encounter.
- [x] Enforced red-cargo rejection at the rig domain boundary for every item size.
- [x] Made extraction settlement return detached snapshots suitable for persistence.
- [x] Added a two-option extraction screen with explicit retained/dropped previews.
- [x] Added a versioned local profile, write-ahead recovery, corrupt-data backup, and warehouse ledger.
- [x] Connected normal and drop-pack extraction to persistent run settlement.
- [x] Made extraction commits idempotent and every run item instance ID unique.
- [x] Displayed warehouse count, successful extractions, and cumulative value after reload.
- [x] Added atomic cross-container moves, weapon swaps, weapon unequip, and global duplicate-ID validation.
- [x] Added rig-compatible medicine, ammunition, and tactical loot with a guaranteed supply-box slot.
- [x] Made loadout items clickable so rig, backpack, and weapon state can be changed during play.
- [x] Added atomic in-place rotation and two-step safe return to the currently opened chest.
- [x] Preserved stable item instance IDs when an item is returned to and re-taken from a chest.
- [x] Added a Web Audio event consumer with autoplay unlock, per-event cooldowns, volume control, and `M` mute.
- [x] Added synthesized cues for every audio event currently emitted by gameplay.
- [x] Added rarity-aware pickup/reveal cues and per-container search loops that stop on cancel, damage, or completion.
- [x] Restored browser/pinch zoom, added screen-reader instructions/live announcements, and made the game shell keyboard-focusable.
- [x] Added keyboard loot slots (`1–5`) and extraction choices (`1/2`) with visible prompts.
- [x] Configured a GitHub Actions quality gate for unit tests, production build, and Chromium regression scenarios.

## Active plan

### P0 — Foundation

- [x] Add a pure TypeScript multi-container domain model.
- [x] Add Vitest and unit tests for independent pockets, placement, rotation, overlap rejection, and extraction settlement.
- [x] Add a dedicated weapon slot with item-tag validation.
- [x] Render rig and backpack side by side using the same pocket-view model.
- [x] Implement normal extraction and drop-pack extraction as atomic domain transactions.
- [x] Add versioned local profile persistence and corruption recovery.
- [x] Fix the inventory/Boss delayed-damage race.

### P1 — Interaction and quality

- [x] Add rotation, safe return, and cross-container movement.
- [ ] Add pointer drag-and-drop interactions.
- [ ] Add item attributes and equipment comparison.
- [ ] Split `GameScene` and `HudScene` responsibilities.
- [x] Prevent enemy overlap and add chest collision.
- [x] Skip unchanged fog redraws and gate minimap rendering by map-state revision.
- [x] Add a real audio event consumer.
- [x] Improve keyboard accessibility and allow browser zoom.

### P2 — Expansion

- [ ] Add run seeds, functional room types, shortcuts, and early extraction.
- [ ] Add insurance storage and recovery rules.
- [x] Add real-browser regression tests for keyboard focus, looting, and extraction.
- [x] Configure unit, build, and browser regression tests in CI.
- [ ] Confirm the first remote GitHub Actions run passes.

## Known risks

- `GameScene.ts` and `HudScene.ts` are oversized and should not absorb more domain logic.
- Loadout organization supports click actions but not direct pointer drag-and-drop yet.
- Items do not expose enough combat attributes for meaningful equipment comparison.
- The new GitHub Actions workflow has been checked locally but its first remote run has not yet been observed.
- The production bundle still reports a Phaser-driven chunk-size warning.

## Verification log

| Date | Stage | Verification | Result |
|---|---|---|---|
| 2026-11-20 | Baseline | `npm run build` | Passed; Vite bundle-size warning only |
| 2026-11-20 | Container domain | `npm run check` | Passed; 8 tests and production build |
| 2026-11-20 | Runtime loadout integration | `npm run check` | Passed; 13 tests and production build |
| 2026-11-20 | Runtime loadout integration | Headless Edge at `?qa=loot` and `?qa=pickup` | Passed; side-by-side layout and backpack auto-placement verified |
| 2026-11-20 | Extraction persistence | `npm run check` | Passed; 24 tests and production build |
| 2026-11-20 | Extraction persistence | Headless Edge at `?qa=extract` and `?qa=extract-drop` | Passed; choice preview, drop settlement, and saved result verified |
| 2026-11-20 | Profile reload | Isolated Edge profile, complete extraction, browser restart | Passed; HUD restored 2 warehouse items, 1 extraction, and 1951 total value |
| 2026-11-20 | Collision and map rendering | `npm run check` | Passed; 24 tests and production build |
| 2026-11-20 | Loadout interaction | `npm run check` | Passed; 30 tests and production build |
| 2026-11-20 | Loadout interaction | Headless Edge at `?qa=rig` | Passed; a `1×2` magazine rotated into a `2×1` rig pocket and backpack remained independent |
| 2026-11-20 | Loadout organization | `npm run check` | Passed; 33 tests and production build |
| 2026-11-20 | Loadout organization | Headless Edge at `?qa=rotate` and `?qa=discard` | Passed; in-place rotation and recoverable chest return verified |
| 2026-11-20 | Audio event layer | `npm run check` | Passed; 37 tests and production build |
| 2026-11-20 | Audio event layer | Headless Edge HUD render | Passed; mute shortcut help remains visible without clipping |
| 2026-11-20 | Accessibility | `npm run check` | Passed; 37 tests and production build |
| 2026-11-20 | Accessibility | Headless Edge at `?qa=loot` and `?qa=extract` | Passed; numbered keyboard prompts render without clipping |
| 2026-11-20 | Accessibility | Built HTML inspection | Passed; restrictive viewport flags absent and ARIA help/live regions present |
| 2026-11-20 | Browser regression | `npm run test:e2e` | Passed; 3 Edge scenarios cover Tab focus, keyboard looting, live announcements, drop-pack extraction, and a touch-capture smoke check |
| 2026-11-20 | CI quality gate | Workflow inspection + `npm run check:full` | Passed locally; workflow installs Playwright Chromium before running the same quality gate |

## Commits

- `5dbdbd2` — `feat: establish playable PvE extraction prototype`
- `8776254` — `docs: define loadout container architecture`
- `5de90de` — `feat: add tested multi-container loadout domain`
- `c6804ef` — `feat: integrate rig and backpack loadout UI`
- `bab22fc` — `feat: persist normal and drop-pack extractions`
- `3d8b318` — `fix: improve collisions and map rendering`
- `8390db0` — `feat: enable interactive rig loadouts`
- `6db6996` — `feat: add safe loadout organization actions`
- `ed26ac8` — `feat: add responsive synthesized game audio`


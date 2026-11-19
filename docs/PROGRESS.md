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

## Active plan

### P0 — Foundation

- [x] Add a pure TypeScript multi-container domain model.
- [x] Add Vitest and unit tests for independent pockets, placement, rotation, overlap rejection, and extraction settlement.
- [x] Add a dedicated weapon slot with item-tag validation.
- [ ] Render rig and backpack side by side using the same pocket-view model.
- [ ] Implement normal extraction and drop-pack extraction as atomic domain transactions.
- [ ] Add versioned local profile persistence and corruption recovery.
- [ ] Fix the inventory/Boss delayed-damage race.

### P1 — Interaction and quality

- [ ] Add drag, rotation, discard, and cross-container movement.
- [ ] Add item attributes and equipment comparison.
- [ ] Split `GameScene` and `HudScene` responsibilities.
- [ ] Prevent enemy overlap and add chest collision.
- [ ] Optimize fog and minimap dirty-region rendering.
- [ ] Add a real audio event consumer.
- [ ] Improve keyboard accessibility and allow browser zoom.

### P2 — Expansion

- [ ] Add run seeds, functional room types, shortcuts, and early extraction.
- [ ] Add insurance storage and recovery rules.
- [ ] Add browser regression tests and CI.

## Known risks

- `GameScene.ts` and `HudScene.ts` are oversized and should not absorb more domain logic.
- Boss attacks use delayed callbacks that can complete behind the inventory screen.
- The current single rectangular inventory model cannot represent independent rig pockets.
- There is no persistent profile, warehouse, or atomic extraction settlement yet.
- Fog and minimap redraw the full map frequently.

## Verification log

| Date | Stage | Verification | Result |
|---|---|---|---|
| 2026-11-20 | Baseline | `npm run build` | Passed; Vite bundle-size warning only |
| 2026-11-20 | Container domain | `npm run check` | Passed; 7 tests and production build |

## Commits

- `5dbdbd2` — `feat: establish playable PvE extraction prototype`
- `8776254` — `docs: define loadout container architecture`


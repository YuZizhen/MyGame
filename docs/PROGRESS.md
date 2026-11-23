# Development Progress

Last updated: 2026-11-23

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
- [x] Added atomic pointer drag-and-drop to exact rig/backpack pocket cells with valid/invalid previews.
- [x] Fixed missed panel shortcuts and verified normal hold-to-open, mouse pickup, and `E`/`Esc` close flows.
- [x] Added hidden chest silhouettes with rarity-scaled item searches, reveal light echoes, and rarity audio.
- [x] Added bounded weapon damage, speed, critical chance, real combat effects, and current-weapon comparison.
- [x] Fixed the container dead-end by automatically identifying unknown loot in sequence without locking loadout interaction.
- [x] Added focus-independent `E`/`Esc`/`Tab` close handling and a visible mouse close control.
- [x] Fixed the zero-width loot progress bar that produced an infinite render transform and terminated Phaser's RAF chain at 0%.
- [x] Added visible runtime diagnostics for stalled frames/search clocks, invalid search state, window errors, and emergency recovery.
- [x] Removed destroyed enemies from runtime state and prevented dead or missing physics bodies from crashing loot and extraction panels.
- [x] Added item detail windows with category, rarity, size, value, purpose, flavor text, weapon stats, and explicit context actions.
- [x] Added confirmed permanent discard from the standalone loadout and safe return when a chest is open.
- [x] Repositioned item details as narrow contextual panels beside items, made `Esc` close details first, and added race-free double-click pickup.
- [x] Added per-stat weapon comparison for damage, attack speed, critical chance, and expected DPS with independent gain/loss indicators.
- [x] Added seeded procedural room silhouettes: rectangular, chamfered, cross-shaped, cavern, and Boss arena layouts.
- [x] Added non-walkable lava borders, sparse collidable cinder-rock formations, ash details, and obstacle-aware enemy steering.
- [x] Added safe chest placement, enemy/chest spawn separation, disconnected-floor pruning, and exploration-radius-only minimap reveal.
- [x] Added a dedicated gray-ash hub with exploration, warehouse, and NPC gray-market views.
- [x] Added profile credits, explicit v1-to-v2 migration, category-aware sell rates, and atomic warehouse sales.
- [x] Routed normal startup through the hub while preserving direct QA deep links into combat.
- [x] Returned completed or failed runs to the hub without leaving the combat HUD or global shortcuts active.
- [x] Prevented free zero-value starter equipment from entering or inflating the warehouse ledger.
- [x] Added a real tactical pause menu with resume, persistent audio settings, controls, and game introduction pages.
- [x] Moved healing off the overloaded interact key: `Q` now consumes one of two starting potions and restores up to 35 HP.
- [x] Paused physics, scene time, tweens, player input, enemies, and active searches while the Esc menu is open.
- [x] Added live loadout-corruption tracking to the combat HUD and pause overview with threshold-aware coloring.
- [x] Removed the persistent bottom control legend now that controls live in the Esc settings page, restoring the lower combat view.

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
- [x] Add pointer drag-and-drop interactions.
- [x] Add item attributes and equipment comparison.
- [ ] Split `GameScene` and `HudScene` responsibilities.
- [x] Prevent enemy overlap and add chest collision.
- [x] Skip unchanged fog redraws and gate minimap rendering by map-state revision.
- [x] Add a real audio event consumer.
- [x] Improve keyboard accessibility and allow browser zoom.

### P2 — Expansion

- [x] Add a functional hub, warehouse browser, recent-extraction summary, and local NPC buyback market.
- [x] Add deterministic QA seeds, randomized playthrough seeds, and irregular room silhouettes.
- [ ] Add functional room types, shortcuts, and early extraction.
- [ ] Add insurance storage and recovery rules.
- [x] Add real-browser regression tests for keyboard focus, looting, and extraction.
- [x] Configure unit, build, and browser regression tests in CI.
- [ ] Confirm the first remote GitHub Actions run passes.

## Known risks

- `GameScene.ts` and `HudScene.ts` are oversized and should not absorb more domain logic.
- Armor is intentionally still cargo-only; adding defense requires a separate balance pass.
- The new GitHub Actions workflow has been checked locally but its first remote run has not yet been observed.
- The production bundle still reports a Phaser-driven chunk-size warning.
- Enemy obstacle avoidance is lightweight steering rather than full pathfinding; future dense or concave obstacle layouts require A* or a flow field.
- Lava is currently a clearly non-walkable boundary material, not a damage floor.
- The “交易行” is intentionally an offline NPC buyback market; real player listings require accounts, a trusted backend, and server-side validation.
- Warehouse equipment cannot be deployed into a run yet; that feature needs an atomic active-run ledger to avoid duplication and incorrect loss handling.
- Loot-tagged medicine remains physical extraction cargo; the current two potion charges are a separate free run resource until consumable item actions are implemented.

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
| 2026-11-20 | Browser regression | `npm run test:e2e` | Passed; 5 Edge scenarios cover Tab focus, normal chest search, mouse/keyboard looting, drag-and-drop, weapon comparison, panel close, live announcements, drop-pack extraction, and a touch-capture smoke check |
| 2026-11-20 | CI quality gate | Workflow inspection + `npm run check:full` | Passed locally; workflow installs Playwright Chromium before running the same quality gate |
| 2026-11-20 | Loot identification | `npm run check` | Passed; 46 tests and production build |
| 2026-11-20 | Loot identification | `npm run test:e2e` | Passed; hold-to-open, hidden reveal, second-action pickup, `E`/`Esc` close, drag, and extraction verified |
| 2026-11-20 | Weapon attributes | `npm run check` | Passed; 54 tests and production build, including legacy/invalid profile validation |
| 2026-11-20 | Weapon attributes | `npm run test:e2e` | Passed; revealed weapon comparison renders against the starter sword |
| 2026-11-21 | Container interaction recovery | `npm run check` | Passed; 54 tests and production build |
| 2026-11-21 | Container interaction recovery | `npm run test:e2e` | Passed; 5 Edge scenarios cover automatic sequential identification, search cancellation, mouse/keyboard/focus-independent close paths, pickup, loadout drag, and extraction |
| 2026-11-21 | Loot render deadlock | `npm run check` | Passed; 54 tests and production build |
| 2026-11-21 | Loot render deadlock | `npm run test:e2e` | Passed; 6 Edge scenarios verify finite progress transforms in default and Canvas renderers, forced loop sleep recovery, search/pickup/close, loadout drag, and extraction with no page errors |
| 2026-11-21 | Dead-mob panel crash | `npm run check:full` | Passed; 54 tests, production build, and 8 Edge scenarios including loot after normal-mob destruction and extraction after Boss destruction |
| 2026-11-22 | Item detail actions | `npm run check` | Passed; 57 tests and production build |
| 2026-11-22 | Item detail actions | `npm run test:e2e` | Passed; 9 Edge scenarios including detail rendering, button pickup, container move, confirmed permanent discard, and all previous regressions |
| 2026-11-22 | Contextual item details | `npm run check` | Passed; 57 tests and production build |
| 2026-11-22 | Contextual item details | `npm run test:e2e` | Passed; 10 Edge scenarios including adjacent panel sizing, detail-first `Esc`, race-free double-click pickup, and all previous regressions |
| 2026-11-22 | Weapon comparison | `npm run check` | Passed; 59 tests and production build |
| 2026-11-22 | Weapon comparison | `npm run test:e2e` | Passed; 10 Edge scenarios including mixed green improvements and red regressions in the same weapon detail |
| 2026-11-23 | Ashen terrain generation | `npm run check` | Passed; 62 tests, 64-seed connectivity coverage, and production build |
| 2026-11-23 | Ashen terrain generation | `npm run test:e2e` | Passed; 10 Edge scenarios including chest search, loot, Boss, extraction, minimap, and runtime-error checks on the new terrain |
| 2026-11-23 | Ashen terrain generation | Headless Edge screenshots at seed `20261122` | Passed; lava boundaries, cinder-rock blockers, floor continuity, and minimap silhouettes visually inspected |
| 2026-11-23 | Gray-ash hub and market | `npm run check` | Passed; 67 tests including v1 profile migration, atomic sales, pricing priority, zero-value starter exclusion, and production build |
| 2026-11-23 | Gray-ash hub and market | `npm run test:e2e` | Passed; 11 Edge scenarios including hub navigation, exploration start, previous combat/loot flows, extraction, and clean return to hub |
| 2026-11-23 | Gray-ash hub and market | Headless Edge screenshots at 1280×720 | Passed; home, empty/filled warehouse, and empty/filled gray-market layouts visually inspected |
| 2026-11-23 | Pause menu and potions | `npm run check` | Passed; 67 tests, audio cue coverage, strict TypeScript, and production build |
| 2026-11-23 | Pause menu and potions | `npm run test:e2e` | Passed; 12 Edge scenarios including Esc priority, frozen physics/time, settings, guide, volume changes, Q healing, and all previous regressions |
| 2026-11-23 | Pause menu and potions | Headless Edge screenshots at 1280×720 | Passed; overview, settings, and game-introduction pages visually inspected over the paused dungeon |
| 2026-11-23 | Corruption HUD cleanup | `npm run check` + `npm run test:e2e` | Passed; 67 tests, production build, and 12 Edge scenarios including live corruption and absence of the bottom control overlay |
| 2026-11-23 | Corruption HUD cleanup | Headless Edge screenshot at 1280×720 | Passed; corruption 27 renders clearly beside health while the lower dungeon view remains unobstructed |

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
- `41e9820` — `feat: improve keyboard and browser accessibility`
- `4e4a5a9` — `ci: run full browser quality gate`
- `fdd4636` — `feat: add searchable container interactions`
- `3a4a46b` — `feat: add comparable weapon attributes`
- `95127b5` — `fix: prevent container interaction deadlocks`
- `a9e0e8a` — `fix: prevent loot progress render crashes`
- `4118eaf` — `fix: ignore destroyed mobs in paused panels`
- `c6e9f48` — `feat: add actionable item detail windows`
- `590a64c` — `feat: refine contextual item interactions`
- `de6f92f` — `feat: compare weapon stats in item details`
- `6c6044f` — `feat: generate varied ashen dungeon terrain`
- `c9d7b5c` — `feat: add functional ashen hub`
- `a6b9b99` — `feat: add pause settings and healing`


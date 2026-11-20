# Chest Loot Identification

## Decision

Use search-first chest interaction with a restrained rarity reveal. Opening a chest does not spray every item onto the floor.

1. The opened chest shows one dark silhouette per item, including its grid dimensions but not its name, rarity, value, or type.
2. Clicking a silhouette or pressing its number starts identification.
3. Identification time is rarity-scaled: common 450 ms, magic 750 ms, rare 1100 ms, red 1600 ms.
4. A completed identification permanently reveals that item for the current run.
5. The next click or number press takes the revealed item.
6. Closing the chest cancels only the active identification; already revealed items remain known.

## Presentation

- Unknown items use a near-black shape, neutral border, diagonal surface marks, and an amber progress line.
- The search duration is allowed to hint that something unusual may be inside, but no rarity color or rarity sound plays early.
- On reveal, the chest emits a short, narrow rarity-colored light echo and a matching synthesized cue.
- Items remain in the chest. World drops and persistent light pillars are reserved for later explicit drop/discard rules.

## Interaction guarantees

- Normal hold-to-open, mouse interaction, number keys, `E`, `Tab`, and `Escape` are covered by browser regression tests.
- Unidentified items cannot enter the loadout through mouse or keyboard shortcuts.
- Returned loadout items are already known and do not require identification again.
- Item search cancellation never deletes or mutates loot.

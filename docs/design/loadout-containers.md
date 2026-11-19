# Loadout and Extraction Container Design

## Terminology

- **Weapon slot**: an equipped slot outside every storage container. It only accepts weapon-tagged items.
- **Rig**: a retained combat container made of independent pockets. It favors ammunition, medicine, and tactical items.
- **Backpack**: a larger loot container made of independent pockets or a large main compartment. Drop-pack extraction leaves the backpack and all of its contents behind.
- **Pocket**: an isolated placement region. An item may never cross from one pocket into another, even when the combined free-cell count would be sufficient.

The rig and backpack are peers in both the domain model and UI. Neither is a child of a generic “retained area.” Retention is an extraction rule, not a visual hierarchy.

## Domain invariants

1. Every item instance has a stable ID.
2. An item exists in exactly one location: weapon slot, one pocket placement, chest, warehouse, or dropped world state.
3. A placement belongs to exactly one pocket.
4. A placement must remain inside its pocket mask and cannot overlap another placement.
5. Accepted item tags are validated by the target slot or pocket.
6. Failed moves leave the entire source state unchanged.
7. Extraction settlement is produced as an immutable result before profile state is written.

## MVP equipment definitions

### Assault rig

- Two `2×1` magazine pockets.
- Two `1×2` tactical pockets.
- One `1×1` medicine pocket.
- No pocket can accept `2×2` or `2×3` cargo.

### Heavy rig

- One `2×2` utility pocket.
- Two `2×1` pockets.
- One `1×2` tactical pocket.
- Higher retained capacity, with a later movement penalty.

### Light backpack

- One `5×5` main pocket.
- Lower capacity and a smaller movement penalty.

### Expedition backpack

- One `7×6` main pocket.
- Accepts `2×3` red cargo.
- Higher capacity and a larger movement penalty.

## MVP extraction rules

### Normal extraction

- Retain equipped weapon.
- Retain the rig instance and every rig placement.
- Retain the backpack instance and every backpack placement.

### Drop-pack extraction

- Retain equipped weapon.
- Retain the rig instance and every rig placement.
- Convert the backpack instance and every backpack placement into a dropped-bag result.
- Remove corruption contributed by dropped backpack contents.
- Apply the light-load escape modifier after the drop transaction succeeds.

### Death

Death and insurance rules are intentionally separate from drop-pack extraction and will be added after the profile repository exists.

## Initial item sizes

- `1×1`: medicine, gems, rings, small currency bundles.
- `1×2`: magazines, long medicine, compact weapons.
- `2×1`: tools, helmets, horizontal valuables.
- `2×2`: armor plates and large relics.
- `2×3`: red valuables; backpack-only in the initial ruleset.

## UI contract

- Weapon slot appears separately.
- Rig and backpack render side by side at equal hierarchy.
- Both use a shared pocket renderer.
- Pocket boundaries remain visible; items cannot visually bridge gaps.
- Extraction preview explicitly lists retained and dropped instances before confirmation.


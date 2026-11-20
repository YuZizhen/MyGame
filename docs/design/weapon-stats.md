# First Weapon Attribute Layer

## Scope

Only the weapon slot affects combat in this stage. Armor remains valuable cargo and is explicitly labelled as loot rather than equippable gear.

Weapons expose three bounded values:

- damage per melee hit;
- attack interval in milliseconds;
- critical-hit chance, with critical hits dealing 150% damage.

The starter sword remains the combat baseline at 30 damage, 480 ms, and 0% critical chance. This preserves the prototype's previous ordinary-enemy and boss damage.

## Comparison

Revealed chest weapons show damage, attacks per second, critical chance, footprint, and estimated output change against the equipped weapon. Direction symbols accompany color so the result does not rely on red/green alone.

Estimated DPS is:

```text
damage × (1 + critical chance × 0.5) × 1000 / attack interval
```

This is a comparison aid, not a single combat-power score. Unknown chest silhouettes never construct or display the real stat text.

## Growth limits

- Ash blades: 30–34 damage depending on rarity.
- Breach axes: 34–38 damage with a slower base interval.
- Magic weapons receive a small 3% speed and 2% critical bonus.
- Rare weapons receive a 6% speed and 4% critical bonus.
- No item level, elemental damage, lifesteal, proc affixes, or armor mitigation is introduced yet.

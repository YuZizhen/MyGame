# Local Profile Persistence

## Scope

The first profile version records successful extraction results and a persistent item warehouse. It does not yet provide a camp or pre-run equipment selection screen.

## Keys

- `ashen-vault.profile`: committed profile document.
- `ashen-vault.profile.pending`: write-ahead document used during a commit.
- `ashen-vault.profile.corrupt`: last invalid primary document preserved for diagnosis.

## Commit protocol

1. Build an immutable extraction result from the run loadout.
2. Load and validate the current profile schema.
3. Reject a duplicate extraction record ID, or apply retained items to the warehouse in memory.
4. Write the complete next profile to the pending key.
5. Write the same document to the primary key.
6. Remove the pending key.

Each individual browser storage write is atomic. If the page stops between steps 4 and 6, the loader compares revisions and completes the newer pending commit.

## Recovery rules

- A valid primary profile is loaded normally.
- A newer valid pending profile wins and is promoted to primary.
- A valid pending profile repairs an invalid primary profile.
- An invalid primary profile is copied to the corrupt backup key before a clean profile is used.
- A profile from a newer schema version is never overwritten by this build.
- Missing, malformed, old, or negative schema versions are treated as corrupt data rather than being mistaken for a future version.
- Storage access failures do not crash the run; the result screen clearly reports that the extraction was not saved.

## Extraction storage

- Normal extraction stores weapon, rig contents, and backpack contents.
- Drop-pack extraction stores weapon and rig contents only.
- Container instance IDs are recorded in the extraction ledger even though containers do not yet appear as warehouse items.
- Loot instance IDs include a per-run UUID to prevent collisions across repeated dungeon layouts.
- The HUD loads the profile at startup and displays warehouse count, successful extractions, and cumulative extracted value.

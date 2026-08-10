# Layer 6 — "The Ledger" — Authoritative Implementation Contract

Target tree: branch `phase0-foundations`, HEAD `081cbf4`. Every anchor below was re-derived by reading
the current working copy. **The roadmap `docs/roadmap-prestige-layers-6-7.md` is superseded by this
document wherever they disagree.** Do not consult it for line numbers.

This document is organised **by file**. Each file has exactly one owning agent. An instruction that
appears here appears exactly once — if you think two sections tell you to edit the same lines, you
have misread; re-check the file heading.

Anchors are given as *function names and markup landmarks*, never bare line numbers, because line
numbers shift as parallel agents work. Where a line number appears it is parenthetical context only.

---

# PART 0 — SHARED CONTRACT

Every agent must honour this part. It is the interface. Nothing in it may be changed unilaterally.

## 0.1 New `gameData` fields and their exact defaults

All of these are declared in **`js/data.js` only**. No other file declares them.

### Top-level scalars (free migration — `replaceSaveDict(gameData, gameDataSave)` backfills them)

| Field | Default | Meaning |
|---|---|---|
| `etchings_log10` | `LOG_ZERO` | log10 of the Etchings balance. Never `-Infinity`, never `0`. |
| `sigils` | `0` | Bitmask of currently worn sigils over `SIGIL_BITS`. |
| `sigils_broken` | `0` | Bitmask of sigils **not** continuously worn since the last Ledger. |
| `last_sigils` | `0` | Bitmask served through the previous Ledger. Drives the repeat discount. |
| `rebirthSixCount` | `0` | Layer-6 counter. |
| `rebirthSixTime` | `0` | Layer-6 real-seconds timer. |

### Nested dict (needs its own `replaceSaveDict` call — see `js/main.js` §8.4)

```js
inscriptions: {
    milestones: [],   // array of requirement-key strings
    tasks: {},        // PLAIN OBJECT, taskName -> { base: <number>, hero: <number> }
    taxed: [],        // array of requirement-key strings; W's exemption set, ratcheted
    pledged: 0,       // high-water inscription count since the last Ledger
},
```

**`inscriptions.tasks` is a plain object, never an array.** This is a hard invariant, not a
preference. `JSON.stringify` serialises an Array by index only and silently drops every string-keyed
property, so an array here means `saveloop` erases every task inscription 3 seconds after it is
bought. It is also the only dict in the save with player-generated keys, so it must **never** be
passed to `replaceSaveDict` (whose delete loop would erase every entry against the empty default).

The value stored per task is **always the object `{ base, hero }`**, never a bare number. Only
`js/ledger.js` writes it (see §0.2).

### `gameData.stats` additions (one owned block; `replaceSaveDict(gameData.stats, …)` already exists)

| Field | Default | Meaning |
|---|---|---|
| `fastest6` | `null` | Fastest Ledger. **Mandatory** — `doRebirth`'s write guard is `== null`, which is true for `undefined`, so a missing default makes "fastest" mean "most recent" forever. |
| `sigilsEverUsed` | `0` | Lifetime OR of every loadout served through a completed Ledger. Layer-7 gate input. |
| `totalEtchingsEarnedLog10` | `LOG_ZERO` | Lifetime Etchings earned, across Authorships. Display only. |
| `maxEtchingsReachedLog10` | `LOG_ZERO` | High-water balance. Drives the milestone "Unknown" reveal. |

> **Rule (from the `fastest5` bug):** every key written anywhere in the codebase into
> `gameData.stats` / `settings` / `perks` / `metaverse` / `challenges` / `dark_matter_shop` **must**
> appear in the `js/data.js` defaults literal in the same commit. `replaceSaveDict` deletes any saved
> key the defaults do not declare, on every single load.

## 0.2 Global symbol table — one owning file per name

Every function in this codebase is a global. A second declaration of any name below, in any file,
silently wins or loses depending on script order, with **no error**. There are **no stub
implementations** anywhere in this design: declaration order across `<script>` tags does not matter
for cross-file *calls*, only for top-level *execution*, so every function is declared exactly once in
its owning file.

### `js/utils.js`
```js
function capWithLogTail(value, cap) -> number
```

### `js/classes.js`
```js
class EtchingRequirement extends Requirement   // this.type === "etching"
```

### `js/challenges.js` — sigils
```js
const SIGIL_BITS            // Object.freeze, name -> bit
const SIGIL_NAMES           // string[]
const SIGIL_ALL_BITS        // 63
const SIGIL_BASE_SLOTS      // 2
const SIGIL_SLOT_MILESTONES // string[] of milestone names granting +1 slot
const SIGIL_WEIGHT_FRESH    // 0.30
const SIGIL_WEIGHT_REPEAT   // 0.10
const SIGIL_GRACE_SECONDS   // 300

function isChallengeActive(name) -> boolean
function countSigils(mask) -> number
function getSigilSlots() -> number
function getServedSigils() -> number        // bitmask: worn AND not broken
function getSigilWeight() -> number         // finite, >= 0
function getSigilValue(name) -> number      // per-sigil weight for display
function isSigilWorn(name) -> boolean
function isSigilServed(name) -> boolean
function canChangeSigils() -> boolean
function toggleSigil(name) -> boolean
function updateSigilService() -> void       // called once per tick from update()
function commitSigils() -> void             // called from REBIRTH_LAYERS[6].grant, AFTER the gain
```

### `js/milestones.js` — currency generalisation + Marginal Milestones
```js
const MilestoneCurrency               // Object.freeze({ ESSENCE: "essence", ETCHINGS: "etchings" })
const milestoneCategoryCurrencies     // categoryName -> MilestoneCurrency
const ESSENCE_MILESTONE_NAMES         // string[] built at load, in category order
const MARGINAL_CATEGORY               // "Marginal Milestones"
const MARGINAL_GAIN_PER_TIER          // 0.5
const MARGINAL_GAIN_CAP               // 7.5
const MARGINAL_INSCRIPTION_SLOT_TIERS // string[]
const MARGINAL_SIGIL_SLOT_TIERS       // string[]
const MARGINAL_SLOT_COST_TIERS        // string[]
const MARGINAL_HYPERCUBE_TIERS        // [{name, hypercubes}]

function getMilestoneCurrency(name) -> "essence" | "etchings"
function createMilestoneRequirements() -> void         // EXISTING, modified
function isNextMilestoneInReach() -> boolean           // EXISTING, modified
function isNextMarginalMilestoneInReach() -> boolean
function isMarginalCompleted(name) -> boolean
function getMarginalBonusLog10() -> number             // finite, 0..MARGINAL_GAIN_CAP
function getMarginalInscriptionSlotBonus() -> number
function getMarginalSigilSlotBonus() -> number
function getInscriptionSlotCostReductionLog10() -> number
function keepsDarkMatterAbilitiesThroughLedger() -> boolean
function isAuthorshipUnlockedByMilestone() -> boolean
function getLedgerStartingHypercubes() -> number
```

### `js/ledger.js` — NEW FILE, single owner, Etchings + inscriptions
```js
const ETCHING_E_OFFSET, ETCHING_D_OFFSET, ETCHING_H_OFFSET, ETCHING_P_SCALE, ETCHING_TERM_CAP
const INSCRIBABLE_MILESTONES          // string[]

function getEtchingGainLog10() -> number       // finite; LOG_ZERO means "no payout"
function grantEtchings(gainLog10) -> void      // THE ONLY WRITE SITE for etchings_log10
function getTotalEtchingsEarnedLog10() -> number

function areInscriptionsActive() -> boolean
function isInscribedMilestone(name) -> boolean
function isInscribedTask(name) -> boolean
function hasMilestoneInscription(name) -> boolean
function hasTaskInscription(name) -> boolean
function getInscribedMilestoneCount() -> number
function getInscribedTaskCount() -> number
function getInscriptionCount() -> number
function getPledgedInscriptionCount() -> number
function getInscriptionSlotCostLog10(n) -> number
function getInscriptionPledgeLog10(count) -> number
function getPledgedEtchingsLog10() -> number
function canPledgeEtchings(extraCostLog10) -> boolean
function getInscribableEntries() -> [{kind, key, label}]
function canInscribe(kind, key) -> boolean
function inscribe(kind, key) -> boolean
function uninscribe(kind, key) -> boolean
function toggleInscription(kind, key) -> boolean
function isInscribed(kind, key) -> boolean
function updateInscribedTaskRecords() -> void   // once per tick from update()
function restoreInscribedMilestones() -> void
function restoreInscribedMaxLevels() -> void
function restoreInscriptions() -> void
function countUninscribedMilestonesCompleted() -> number
function reconcileInscriptionsAfterLedger() -> void
function normalizeInscriptions() -> void        // called once from loadGameData()
```

### `js/main.js`
```js
const ESSENCE_GAIN_LEDGER_EXCLUDED    // 2
function getEssenceGainFactors() -> number[]
function getEssenceGain() -> number                 // EXISTING, refactored
function getEssenceGainLog10() -> number
function assertContentTableIntegrity() -> void      // boot-time, console.error only
```

### `js/rebirth.js`
```js
const METAVERSE_CLEARS, DARK_MATTER_SKILL_CLEARS, DARK_MATTER_UNLOCKS
function resetMetaverse() -> void
function rebirthSix() -> boolean
```

### `js/ui.js`
```js
function setTabLedger(tab) -> void
function renderLedger() -> void
function createInscriptions(layoutName) -> void
function createInscription(template, entry) -> void
```

## 0.3 Signature changes to existing functions

* **`rebirthReset(set_tab_to_jobs = true)` — signature UNCHANGED.** Three specs proposed a second
  parameter with three different names and two opposite polarities. All are **dropped**. Suspension
  is derived from `gameData.active_challenge`, and the ordering hazard is removed instead by setting
  `active_challenge` **before** `rebirthReset(false)` in `enterChallenge` (§3.2).
* **`setAllMaxLevels(value)` — kept as-is.** The proposed `resetTaskLevels(options)` extraction is
  **dropped**: with the record-and-restore inscription design (§0.4) no sweep needs to be
  inscription-aware, so the extraction would add risk for nothing.

## 0.4 Cross-file invariants

1. **Etchings are stored as log10 and are monotone non-decreasing.** There is no subtraction — a log
   subtract is `-Infinity` at equality and `NaN` one ulp the wrong way, and both serialise to `null`,
   which `replaceSaveDict` never repairs. Every sink is a *threshold on total earned* or a *pledge*,
   never a deduction.
2. **`grantEtchings()` is the only write site for `gameData.etchings_log10`.** The layer-6 grant in
   `js/rebirth.js` must call it, not inline `logAdd`. No function feeding a `_log10` write may return
   `Infinity`.
3. **A non-finite value must never reach a `_log10` field.** `Number.isFinite`, not the global
   `isFinite` (`isFinite(null) === true`).
4. **Display of any `_log10` value goes through `formatLog10`, never `format`.** `format(4.7)` renders
   `"4.7"` for 50,000 Etchings without complaining.
5. **`format(undefined)` and `format(null)` THROW.** Verified: `format` reaches
   `math.floor(number, decimals)` in the vendored bundle, which throws `TypeError` on `undefined` and
   `null` but returns `NaN` for `NaN`. Therefore `Milestone.expense` must always be a **number** —
   Etching-priced milestones carry `expense: NaN`, never `undefined`.
6. **Inscriptions and sigils are suspended together.** `areInscriptionsActive()` is false while a
   challenge is running **and** while the `dance_with_the_devil` or `the_darkest_time` sigil is worn,
   because `Task.getMaxLevelMultiplier()` returns `10 / (maxLevel + 1)` — an *inverse* — under those
   two, so a restored max level is a penalty proportional to what the player paid for it.
7. **`enterChallenge` sets `gameData.active_challenge` before calling `rebirthReset(false)`.**
   Verified behaviour-neutral today: `rebirthReset` branches on no challenge state, and with
   `set_tab_to_jobs = false` the tab block is skipped entirely.
8. **A Ledger must never execute for zero payout.** Enforced in the driver (`payoutGate`, §7.4), not
   in the view. There are three entry points (sidebar button, `#rebirthNote9` button, `r` keybind)
   and a view-only guard covers one of them.
9. **Markup and its renderer land in one commit.** `renderSideBar`, `renderSettings`, `setLayout`,
   `renderLedger`, `createInscriptions` and `updateRequiredRows` all dereference `getElementById` /
   `querySelector` results with no null check on hot paths. A missing element is a dead session.
10. **Boot code is not protected by Phase 0's try/catch.** `loadGameData()`, `initializeUI()`, the
    first bare `update()` and `setTab()` all run before the two `setInterval`s are created, and
    `#errorInfo` is nested inside `#mainarea`, which is still hidden — so a boot throw is a blank
    page with **no banner and no game loop**. §8.1 fixes this and it is a release blocker.
11. **The class token for the Etchings required-row span is `etchings` (plural), everywhere.**
    Markup: `<span class="etchings color-etchings">`. Lookup: `querySelector(".etchings")`.

## 0.5 Content naming rule

`removeStrangeCharacters` strips **apostrophes only** (`replace(/'/g, "")`). `getQuerySelector` then
produces `"#row" + removeSpaces(...)` and hands it to `document.querySelectorAll` inside
`initializeUI()` — i.e. before `#mainarea` is unhidden, so a bad name is a blank page.

**Rule, stated positively:** after `removeSpaces(removeStrangeCharacters(name))`, the residue must
match `/^[A-Za-z_][A-Za-z0-9_-]*$/`, or consist only of characters ≥ U+0080. No commas, periods,
colons, parentheses, `#`, `/`, and no leading digit.

Testing "does it throw" is **not sufficient**: `"Errata, first edition"` yields
`#rowErrata,firstedition`, which parses fine and silently also selects every `<firstedition>` element.

This is enforced at boot by `assertContentTableIntegrity()` (§8.7), which `console.error`s rather than
throwing.

## 0.6 Balance constants and the CALIBRATION GATE

The four Etching-gain offsets are **provisional and release-blocking**. An adversarial pass
established that the roadmap's `180` offset for the essence term is roughly 95 orders of magnitude
above the structural ceiling of the quantity it measures, which would make that term identically zero
for every reachable save. The retained essence factors are bounded at ≈1e85 because the three `Skill`
factors are *linear* in level (`Skill.getEffect` is `1 + effect * (1000*level + 8000)`), Faint Hope is
hard-softcapped at ≈1.02e10, `a_gift_from_god` is bounded at `2.1^61` by its own `!= Infinity` cost
guard, and the dark-matter skill tree tops out at 2.5e13.

**Provisional values (ASSUMPTION — must be calibrated before release):**

```
ETCHING_E_OFFSET = 71
ETCHING_D_OFFSET = 105
ETCHING_H_OFFSET = 94
ETCHING_P_SCALE  = 30000
ETCHING_TERM_CAP = 30
```

**Calibration procedure — a release blocker, not a nice-to-have.** On a real save that has just
completed the "The End" milestone, paste into the devtools console:

```js
[getEssenceGainLog10(), Math.log10(getDarkMatterGain()), Math.log10(gameData.hypercubes), getTotalPerkPoints()]
```

Then set `ETCHING_E_OFFSET = round(e0) - 5`, `ETCHING_D_OFFSET = round(d0) - 5`,
`ETCHING_H_OFFSET = round(h0) - 5`, and verify that `getEtchingGainLog10()` returns a value in
`[4.0, 5.5]` (i.e. a first Ledger of roughly 10k–300k Etchings). **Every term must land strictly
inside `(offset, offset + ETCHING_TERM_CAP)`.** A term below its offset is dead; a term above
`offset + cap` is pinned at its ceiling. In both cases it is not a knob.

**Marginal Milestone cost schedule: `10^(3.4 + 0.8n)` for n = 1..15.** The reward is `+0.5` log10 per
tier. The cost step (0.8) **must** exceed the reward step (0.5). With equal steps the ladder's loop
gain is exactly 1, which makes the whole layer's length `5432 / 10^B0` Ledgers per tier — swinging
from 2 to 400 Ledgers on a constant nobody has measured. With 0.8 the track self-damps and a
mis-measured offset shifts the curve instead of scaling the layer. **Do not restore a 1:1 ratio.**

**Sigil weights: `SIGIL_WEIGHT_FRESH = 0.30`, `SIGIL_WEIGHT_REPEAT = 0.10`** (max 1.50 across the
five slots getSigilSlots() can reach). Provisional; tune with the same gate.

## 0.7 Things three specs proposed that are DROPPED

| Dropped | Replaced by | Why |
|---|---|---|
| `resetTaskLevels(options)` in `js/rebirth.js` | keep `setAllMaxLevels`, use record-and-restore | inscription awareness is no longer needed in any sweep |
| `inscribedFloor()` writing into `gameData.inscriptions` from `js/rebirth.js` | `updateInscribedTaskRecords()` in `js/ledger.js` | two writers with two value types corrupt the record and the normalizer then deletes it |
| second parameter on `rebirthReset` | ordering fix in `enterChallenge` | three names, two polarities, one positional slot |
| `#sigilPanel` on the Challenges tab | the Sigils sub-tab of `#ledger` | two id vocabularies for one feature |
| `logCap` as a name | `capWithLogTail` | `log*` in `js/utils.js` means "argument is already a log10" |
| `requirement` holding a log10 for `EtchingRequirement` | `requirement_log10` / `herequirement_log10` | every other subclass's `requirement` is linear |
| per-entry `milestone.baseData.currency` | category-derived `getMilestoneCurrency(name)` | two specs disagreed; category membership is already mandatory for rendering |
| `<td class="cost">` bare (milestone template) | `<td class="cost">` with nested `.essence` / `.etchings` spans | the bare form breaks the untouched `renderMilestones` |
| stub bodies in `js/ledger.js` | real implementations in their owning files | `ledger.js` loads last and its stubs would silently win |
| `toggleSigil` calling `rebirthReset(false)` as anti-cheese | `sigils_broken` continuous-service mask | `rebirthReset` clears **none** of the state the gain formula reads |
| adding `"Etchings info"` / `"Ledger"` to `permanentUnlocks` | rely on re-latch | `etchings_log10` survives layers 1–6, so they re-latch within one frame; listing them would stop layer 7 revoking them |

---

# PART 1 — `js/utils.js`

**1.1 — Add `capWithLogTail`.**
Anchor: immediately after `logSoftcap()`, before `formatLog10()`.

```js
// A near-hard cap for a value that is *measured* in orders of magnitude but is itself a plain
// number: linear up to `cap`, logarithmic above it.
//
// This is NOT logSoftcap() and NOT softcap(). Those apply a *power* tail to a value; this applies a
// *log* tail, and the difference is the whole point. capWithLogTail(500, 30) === 32.7 while
// softcap(500, 30) === 122.5. The Ledger gain formula uses it so that an unbounded input (idle
// hypercube accumulation, a clamped essence chain) cannot dominate every gameplay input.
//
// Do NOT rename this to logCap: in this file a log* prefix means "the argument is already a log10"
// (logAdd, logSoftcap, formatLog10), and this one's argument is linear.
function capWithLogTail(value, cap) {
    if (value <= cap) return value

    return cap + Math.log10(1 + value - cap)
}
```

Nothing else in `js/utils.js` changes. `LOG_ZERO`, `logAdd`, `logSoftcap`, `formatLog10` and
`bigIntSafe` already exist and are correct.

---

# PART 2 — `js/classes.js`

**2.1 — Append `EtchingRequirement` at end of file.**
Anchor: after the closing `}` of `class PerkPointRequirement` (the last declaration in the file; the
file ends without a trailing newline — add one first). CRLF line endings, 4-space indent.

It must live here, not in `js/ledger.js`: `requirementsBaseData` is built at `js/data.js` top level
and `classes.js` loads before `data.js`. A subclass declared later is a `ReferenceError` at `data.js`
parse time, i.e. a blank page with no banner.

```js
class EtchingRequirement extends Requirement {
    constructor(querySelectors, requirements) {
        super(querySelectors, requirements)
        this.type = "etching"
    }

    // Thresholds are stored in `requirement_log10` / `herequirement_log10`, NOT in `requirement`:
    // every other subclass's `requirement` is a linear value, so a bare 8 in that field would be
    // read and rendered as "8 Etchings" instead of 1e8. A missing or non-numeric threshold makes
    // the requirement unreachable rather than throwing - this runs at 20 Hz inside
    // renderRequirements(), where a throw is a dead session.
    getCondition(isHero, requirement) {
        const threshold = (isHero && requirement.herequirement_log10 != null)
            ? requirement.herequirement_log10
            : requirement.requirement_log10
        if (typeof threshold !== "number") return false

        // Tolerates classes.js loading before data.js declares the field.
        const owned = (typeof gameData.etchings_log10 === "number") ? gameData.etchings_log10 : LOG_ZERO
        return owned >= threshold
    }
}
```

**2.2 — `Milestone` gains `expense_log10`.**
Anchor: `class Milestone`'s constructor, the line `this.expense = baseData.expense`.

```js
        // Etching-priced milestones carry expense_log10 and no linear expense. `expense` is set to
        // NaN rather than left undefined on purpose: format(undefined) THROWS inside the vendored
        // math.js bundle, while format(NaN) renders the visible string "NaN".
        this.expense = (baseData.expense != null) ? baseData.expense : NaN
        this.expense_log10 = (baseData.expense_log10 != null)
            ? baseData.expense_log10
            : Math.log10(baseData.expense)
```

`milestoneData` is rebuilt from base data at every boot and is explicitly deleted from the save, so
`Milestone` needs no `assignMethods` branch and no migration.

**No other change to `js/classes.js`.** In particular `Task.getMaxLevelMultiplier` is **not** edited
here — its `active_challenge` comparisons are replaced by `isChallengeActive` under §3.5.

---

# PART 3 — `js/challenges.js`

This file owns **all** sigil logic. `js/challenges.js` declares only functions and consts at top level
and touches `gameData` only inside function bodies, so its load position is unconstrained.

**3.1 — Prepend the sigil block at the top of the file**, above `function enterChallenge`.

```js
// ---------------------------------------------------------------------------------
// Sigils
//
// A sigil is one of the six challenge modifiers worn as a run-long penalty OUTSIDE of
// a challenge, in exchange for an additive term in the Etching gain formula.
//
// gameData.sigils is a bitmask; bit (i-1) is the challenge whose ordinal is i in
// getChallengeBonus(), in gameData.challenges, and in ui.js's challengeButton<i> ids.
// Row order in the markup MUST match SIGIL_NAMES, or the bits mean the wrong sigils
// and nothing complains.
//
// Sigils are DORMANT while a challenge is active, for two reasons, both load-bearing:
//
//   1. Every challenge best-score stays byte-identical to pre-sigil behaviour.
//      setChallengeProgress() below is the only writer of gameData.challenges outside
//      the rebirth wipe, it is reached only from exitChallenge(), and it reads
//      gameData.active_challenge directly. Sigils therefore cannot touch a score.
//   2. Task.getMaxLevelMultiplier() returns 10/(maxLevel+1) under dance_with_the_devil,
//      and enterChallenge() forces every maxLevel to 0 - so at maxLevel 0 that
//      "penalty" is a 10x xp BUFF. A worn sigil inside a challenge would inflate
//      getChallengeTaskGoalProgress and every score derived from it.
//
// enterChallenge() additionally refuses to start while any sigil is worn, so the
// dormant branch should be unreachable in normal play. It is the invariant, not the
// mechanism.
//
// At gameData.sigils == 0, isChallengeActive(name) reduces to
// gameData.active_challenge == name in BOTH branches - exact identity for every
// existing save.
//
// ANTI-CHEESE. getSigilWeight() is read once, at the Ledger press. It counts only
// sigils SERVED - worn continuously since the last Ledger - tracked by the
// gameData.sigils_broken mask that updateSigilService() accumulates every tick. An
// earlier design charged a rebirthReset() for changing the loadout; that is not a cost,
// because rebirthReset() clears NONE of the state the Etching formula reads (essence,
// dark matter, hypercubes, the dark-matter shops and every metaverse modifier all
// survive it). Do not reintroduce it as the deterrent.
// ---------------------------------------------------------------------------------

const SIGIL_BITS = Object.freeze({
    an_unhappy_life: 1,
    rich_and_the_poor: 2,
    time_does_not_fly: 4,
    dance_with_the_devil: 8,
    legends_never_die: 16,
    the_darkest_time: 32,
})

const SIGIL_NAMES = Object.keys(SIGIL_BITS)
const SIGIL_ALL_BITS = 63

// Loadout size. Marginal Milestones raise it; the lookups are guarded so this file
// does not depend on that table existing.
const SIGIL_BASE_SLOTS = 2
const SIGIL_SLOT_MILESTONES = ["Footnote", "Watermark", "Catchword"]

// A sigil also served through the previous Ledger pays a third as much, so an optimal
// loadout has to rotate. Max weight is 6 x 0.30 = 1.80.
const SIGIL_WEIGHT_FRESH = 0.30
const SIGIL_WEIGHT_REPEAT = 0.10

// Real seconds after a Ledger during which the loadout may still be chosen without
// forfeiting service. Before the first Ledger the grace is unlimited, so a player who
// unlocks sigils mid-cycle is not locked out of their first use.
const SIGIL_GRACE_SECONDS = 300

function isChallengeActive(name) {
    if (gameData.active_challenge != "")
        return gameData.active_challenge == name
    return (gameData.sigils & SIGIL_BITS[name]) != 0
}

function countSigils(mask) {
    let count = 0
    for (const name of SIGIL_NAMES)
        if (mask & SIGIL_BITS[name]) count++
    return count
}

function getSigilSlots() {
    let slots = SIGIL_BASE_SLOTS
    for (const key of SIGIL_SLOT_MILESTONES) {
        const requirement = gameData.requirements[key]
        if (requirement != undefined && requirement.isCompleted()) slots++
    }
    return Math.min(slots, SIGIL_NAMES.length)
}

function isSigilWorn(name) {
    return (gameData.sigils & SIGIL_BITS[name]) != 0
}

// Worn AND never dropped since the last Ledger.
function getServedSigils() {
    return gameData.sigils & ~gameData.sigils_broken & SIGIL_ALL_BITS
}

function isSigilServed(name) {
    return (getServedSigils() & SIGIL_BITS[name]) != 0
}

function isSigilGraceActive() {
    return gameData.rebirthSixCount == 0 || gameData.rebirthSixTime <= SIGIL_GRACE_SECONDS
}

// Called once per tick from update(). Outside the grace window, any sigil not currently
// worn is marked broken for the rest of this Ledger cycle - so adding one late pays
// nothing this cycle, and dropping one just before pressing the button does not hand
// back the income.
function updateSigilService() {
    if (isSigilGraceActive()) return
    gameData.sigils_broken |= (SIGIL_ALL_BITS & ~gameData.sigils)
}

function getSigilValue(name) {
    return (gameData.last_sigils & SIGIL_BITS[name]) ? SIGIL_WEIGHT_REPEAT : SIGIL_WEIGHT_FRESH
}

// Additive term S in getEtchingGainLog10(). Finite and >= 0 by construction.
function getSigilWeight() {
    const served = getServedSigils()
    let weight = 0
    for (const name of SIGIL_NAMES)
        if (served & SIGIL_BITS[name]) weight += getSigilValue(name)
    return weight
}

function canChangeSigils() {
    const requirement = gameData.requirements["Sigils"]
    return gameData.active_challenge == "" && requirement != undefined && requirement.isCompleted()
}

function toggleSigil(name) {
    if (!canChangeSigils()) return false

    const bit = SIGIL_BITS[name]
    if (bit === undefined) return false

    const next = (gameData.sigils & bit) ? (gameData.sigils & ~bit) : (gameData.sigils | bit)
    if (countSigils(next) > getSigilSlots()) return false

    gameData.sigils = next
    return true
}

// Called from REBIRTH_LAYERS[6].grant, AFTER getEtchingGainLog10() has read
// getSigilWeight(). Ordering constraint of the same class as the ones documented at the
// top of rebirth.js: run it before the gain and the loadout the player just served pays
// nothing. The loadout itself is NOT cleared - keeping it worn is what lets a player
// serve the same sigils again (at the repeat rate) without re-choosing.
function commitSigils() {
    const served = getServedSigils()
    gameData.stats.sigilsEverUsed |= served
    gameData.last_sigils = served
    gameData.sigils_broken = 0
}
```

**3.2 — Replace `enterChallenge` in full.** This is the single merged version; three specs proposed
incompatible rewrites of these five lines.

```js
function enterChallenge(challengeName) {
    // Sigils and challenges are mutually exclusive. Beyond keeping best-scores clean, a
    // worn dance_with_the_devil sigil would turn getMaxLevelMultiplier's 10/(maxLevel+1)
    // into a 10x xp buff at the maxLevel 0 this function forces.
    if (gameData.sigils != 0) return

    // Set BEFORE the teardown, not after. Every inscription predicate is keyed on
    // active_challenge, and entry must run with inscriptions already suspended so the
    // challenge starts from a clean slate. Verified behaviour-neutral: rebirthReset()
    // branches on no challenge state, and with set_tab_to_jobs = false its tab block is
    // skipped entirely.
    gameData.active_challenge = challengeName
    rebirthReset(false)
    gameData.rebirthOneTime = 0
    gameData.rebirthTwoTime = 0

    for (const taskName in gameData.taskData) {
        const task = gameData.taskData[taskName]
        task.maxLevel = 0
    }
}
```

**3.3 — Replace `exitChallenge` in full.**

```js
function exitChallenge() {
    setChallengeProgress()
    rebirthReset(false)
    gameData.active_challenge = ""
    gameData.rebirthOneTime = 0
    gameData.rebirthTwoTime = 0

    for (const taskName in gameData.taskData) {
        const task = gameData.taskData[taskName]
        task.maxLevel = 0
    }

    // active_challenge is clear and the sweeps are done, so the record can be written
    // back. This is where an inscribed max level is handed over after a challenge.
    restoreInscriptions()
}
```

**3.4 — `setChallengeProgress()` is UNCHANGED.** It must keep reading `gameData.active_challenge`
directly, never `isChallengeActive`. That is the property that makes sigils provably unable to write
a challenge best score.

**3.5 — Substitute `isChallengeActive` at the 23 branch sites.**
`js/challenges.js` itself has none. The substitution belongs to the owners of `js/main.js`,
`js/classes.js`, `js/dark_matter.js` and `js/metaverse.js`; the full site list is in §8.9, §2.3 (below),
§4.1 and §5.1 respectively. **Do not substitute in `js/ui.js` or `js/challenges.js`.**

Acceptance check after all four files land:
`grep -c 'gameData.active_challenge ==' js/main.js js/classes.js js/dark_matter.js js/metaverse.js`
must print `0` for all four.

---

## PART 3b — `js/classes.js` sigil substitution (same owner as PART 2)

**2.3 — Two lines in `js/classes.js`.**

* `Task.getMaxLevelMultiplier()`, the challenge branch condition:
  ```js
        if (isChallengeActive("dance_with_the_devil") || isChallengeActive("the_darkest_time")) {
  ```
* `Job.getIncome()`, the return expression:
  ```js
        return isChallengeActive("rich_and_the_poor") || isChallengeActive("the_darkest_time") ? Math.pow(income, 0.35) : income
  ```
  (The `getChallengeBonus("rich_and_the_poor")` call one line above takes an explicit name and is
  **not** a substitution site.)

Both are hot paths — `getMaxLevelMultiplier` is bound into `xpMultipliers` and runs per task per
tick. `isChallengeActive` is one string compare plus one bit AND, cheaper than the two string
compares it replaces.

---

# PART 4 — `js/metaverse.js`

**4.1 — One substitution.** In `getTimeIsAFlatCircleXP()`:

```js
    if (isChallengeActive("the_darkest_time"))
        return 1
```

Nothing else in `js/metaverse.js` changes.

---

## PART 4b — `js/dark_matter.js`

**4b.1 — Ten substitutions. ORDER MATTERS.**

Four lines read exactly `    if (gameData.active_challenge == "the_darkest_time") return 1` (in
`getTaaAndMagicXpGain`, `getAGiftFromGodEssenceGain`, `getLifeCoachIncomeGain`, `getGottaBeFastGain`).

Six lines read exactly `    if (gameData.active_challenge == "the_darkest_time")` with differing
returns beneath (in `getDarkMatterSkillIncome`, `getDarkMatterSkillTimeWarping`,
`getDarkMatterSkillXP`, `getDarkMatterSkillEssence`, `getDarkMatterSkillEvil`,
`getDarkMatterSkillDarkMater`).

The second pattern is a **prefix** of the first. Do the four-line (longer) pattern **first** with
`replace_all`, then the six-line pattern. Doing it the other way round corrupts all four.

```js
    if (isChallengeActive("the_darkest_time")) return 1
```
```js
    if (isChallengeActive("the_darkest_time"))
```

Verify: `grep -c 'gameData.active_challenge' js/dark_matter.js` must print `0`.

---

# PART 5 — `js/milestones.js`

**5.1 — Add the currency tables.**
Anchor: immediately after the `milestoneCategories` object literal.

```js
// ---------------------------------------------------------------------------------------------
// Milestone currencies.
//
// A milestone's currency is a property of its CATEGORY, not of the entry. That is deliberate: a
// milestone has to be listed in milestoneCategories or createAllRows() never builds a row for it,
// so there is no way to ship a visible milestone whose currency was forgotten. Everything
// downstream derives from this one table - which Requirement subclass createMilestoneRequirements
// builds, which formatter the cost cell uses, which milestones the green Transcend button watches,
// and which milestones feed the Ledger gain formula's W term.
//
// Do NOT reintroduce a per-entry baseData.currency field. A per-entry field with an essence default
// fails OPEN: a forgotten field silently puts an Etching-priced tier into W, and the layer starts
// paying for itself.
const MilestoneCurrency = Object.freeze({
    ESSENCE: "essence",
    ETCHINGS: "etchings",
})

const milestoneCategoryCurrencies = {
    "Essence Milestones": MilestoneCurrency.ESSENCE,
    "Heroic Milestones": MilestoneCurrency.ESSENCE,
    "Dark Milestones": MilestoneCurrency.ESSENCE,
    "Metaverse Milestones": MilestoneCurrency.ESSENCE,
    "Marginal Milestones": MilestoneCurrency.ETCHINGS,
}

// name -> currency, plus the essence-priced subset in category order. Built once at load.
const milestoneCurrencyByName = {}
const ESSENCE_MILESTONE_NAMES = []
for (const categoryName in milestoneCategories) {
    const categoryCurrency = milestoneCategoryCurrencies[categoryName] || MilestoneCurrency.ESSENCE
    for (const milestoneName of milestoneCategories[categoryName]) {
        milestoneCurrencyByName[milestoneName] = categoryCurrency
        if (categoryCurrency === MilestoneCurrency.ESSENCE)
            ESSENCE_MILESTONE_NAMES.push(milestoneName)
    }
}

function getMilestoneCurrency(name) {
    return milestoneCurrencyByName[name] || MilestoneCurrency.ESSENCE
}
```

`ESSENCE_MILESTONE_NAMES` is the domain of the Ledger gain formula's W term. Because it is built by
*filtering on currency*, an Etching-priced tier is excluded **by construction** — there is no
blacklist to maintain and adding a 16th Marginal tier requires no W-side edit.

**5.2 — Add the 15 Marginal Milestone entries.**
Anchor: `milestoneBaseData`, after the `"The End"` entry, before the closing brace.

Tier convention: 1–99 are essence (`"The End"` is 99); 100 is deliberately unused as a boundary
marker; 101–115 are Marginal; 116+ is reserved for any future Etching/Axiom track. `tier` has no
functional role beyond `createGameObject` dispatching on `"tier" in entity`, which is exactly why the
convention has to be written down.

```js

    // Marginal Milestones - priced in Etchings, stored as log10 to match gameData.etchings_log10.
    // Cost schedule is 10^(3.4 + 0.8n) for n = 1..15. The cost step (0.8) MUST exceed the reward
    // step (0.5 log10 of Etching gain per tier), or the ladder's loop gain is exactly 1 and the
    // layer's total length is set entirely by an unmeasured constant. See the contract, section 0.6.
    //
    // NOTE: no `effect` field on any of these. renderMilestones() prefixes the description with
    // "x" + format(baseData.effect) whenever it is present, which is wrong for slots and flags.
    // No getEffect() either - nothing here enters setCustomEffects().
    "Marginal Note":   { name: "Marginal Note",   expense_log10:  4.2, tier: 101, description: "x3.16 Etching gain, +1 inscription slot" },
    "Footnote":        { name: "Footnote",        expense_log10:  5.0, tier: 102, description: "x3.16 Etching gain, +1 sigil slot" },
    "Marginalia":      { name: "Marginalia",      expense_log10:  5.8, tier: 103, description: "x3.16 Etching gain, +1 inscription slot" },
    "Rubrication":     { name: "Rubrication",     expense_log10:  6.6, tier: 104, description: "x3.16 Etching gain, inscription slots cost x0.32" },
    "Glossator":       { name: "Glossator",       expense_log10:  7.4, tier: 105, description: "x3.16 Etching gain, +1 inscription slot" },
    "Palimpsest":      { name: "Palimpsest",      expense_log10:  8.2, tier: 106, description: "x3.16 Etching gain, keep Dark Matter abilities through a Ledger" },
    "Watermark":       { name: "Watermark",       expense_log10:  9.0, tier: 107, description: "x3.16 Etching gain, +1 sigil slot" },
    "Interleaf":       { name: "Interleaf",       expense_log10:  9.8, tier: 108, description: "x3.16 Etching gain, start each Ledger with 1M hypercubes" },
    "Emendation":      { name: "Emendation",      expense_log10: 10.6, tier: 109, description: "x3.16 Etching gain, +1 inscription slot" },
    "First Draft":     { name: "First Draft",     expense_log10: 11.4, tier: 110, description: "x3.16 Etching gain, unlocks Authorship" },
    "Catchword":       { name: "Catchword",       expense_log10: 12.2, tier: 111, description: "x3.16 Etching gain, +1 sigil slot" },
    "Signature Mark":  { name: "Signature Mark",  expense_log10: 13.0, tier: 112, description: "x3.16 Etching gain, +1 inscription slot" },
    "Redaction":       { name: "Redaction",       expense_log10: 13.8, tier: 113, description: "x3.16 Etching gain, inscription slots cost another x0.32 (x0.1 total)" },
    "Recto and Verso": { name: "Recto and Verso", expense_log10: 14.6, tier: 114, description: "x3.16 Etching gain, start each Ledger with 1T hypercubes" },
    "The Wide Margin": { name: "The Wide Margin", expense_log10: 15.4, tier: 115, description: "x3.16 Etching gain, +1 inscription slot" },
```

All 15 names satisfy §0.5 and are verified absent from the current tree.

**5.3 — Register the category.**
Anchor: `milestoneCategories`, appended as a fifth entry after `"Metaverse Milestones"` (add a
trailing comma to that entry). Order within the array is the progression order used by the required-row
scan, so it must be ascending cost.

```js
    "Marginal Milestones": ["Marginal Note", "Footnote", "Marginalia", "Rubrication", "Glossator", "Palimpsest", "Watermark", "Interleaf", "Emendation", "First Draft", "Catchword", "Signature Mark", "Redaction", "Recto and Verso", "The Wide Margin"],
```

**5.4 — Replace `createMilestoneRequirements()` in full.**

```js
function createMilestoneRequirements() {
    for (const key in milestoneBaseData) {
        const milestone = milestoneData[key]
        const selectors = [getQuerySelector(milestone.name)]

        if (getMilestoneCurrency(milestone.name) === MilestoneCurrency.ETCHINGS) {
            gameData.requirements[milestone.name] = new EtchingRequirement(selectors,
                [{ requirement_log10: milestone.expense_log10 }])
        } else {
            gameData.requirements[milestone.name] = new EssenceRequirement(selectors,
                [{ requirement: milestone.expense }])
        }
    }
}
```

**5.5 — Replace `isNextMilestoneInReach()` and add its Ledger sibling.**

```js
function isNextMilestoneInReach() {
    const totalEssence = gameData.essence + getEssenceGain()

    for (const key in milestoneData) {
        // Essence-priced only. The old `instanceof EssenceRequirement` test happened to exclude
        // Etching milestones too, but only as a side effect of assignMethods() dispatch - state the
        // intent rather than relying on it.
        if (getMilestoneCurrency(key) !== MilestoneCurrency.ESSENCE) continue

        const requirementObject = gameData.requirements[key]
        if (requirementObject == null || requirementObject.isCompleted()) continue

        if (totalEssence >= requirementObject.requirements[0].requirement)
            return true
    }
    return false
}

// Ledger equivalent, for the green "Read the amulet" indicator. Etchings compare in log space and
// the pending gain combines with logAdd, not +.
function isNextMarginalMilestoneInReach() {
    if (typeof gameData.etchings_log10 !== "number") return false

    const totalEtchings = logAdd(gameData.etchings_log10, getEtchingGainLog10())

    for (const key in milestoneData) {
        if (getMilestoneCurrency(key) !== MilestoneCurrency.ETCHINGS) continue

        const requirementObject = gameData.requirements[key]
        if (requirementObject == null || requirementObject.isCompleted()) continue

        if (totalEtchings >= requirementObject.requirements[0].requirement_log10)
            return true
    }
    return false
}
```

**5.6 — Append the Marginal effect accessors at end of file.**

```js

// ---------------------------------------------------------------------------------------------
// Marginal Milestone effects.
//
// These use the milestone idiom already in the codebase: a latched requirement read at the point of
// use. No getEffect(), nothing in setCustomEffects(), no new multiplier lists in addMultipliers().
//
// The latches do NOT need to be in permanentUnlocks. rebirthReset() un-latches them, but
// isCompleted() re-evaluates and re-latches on the very next read, because etchings_log10 is
// untouched by layers 1-6. Keeping them out is also what lets Authorship (layer 7), which DOES zero
// etchings_log10, correctly revoke the whole track.

const MARGINAL_CATEGORY = "Marginal Milestones"
const MARGINAL_GAIN_PER_TIER = 0.5                 // log10 added to getEtchingGainLog10(); x3.16
const MARGINAL_GAIN_CAP = 7.5                      // == 15 tiers * MARGINAL_GAIN_PER_TIER
const MARGINAL_SLOT_COST_REDUCTION_LOG10 = 0.5     // per reduction tier; x0.316 each, x0.1 for both

const MARGINAL_INSCRIPTION_SLOT_TIERS = ["Marginal Note", "Marginalia", "Glossator", "Emendation", "Signature Mark", "The Wide Margin"]
const MARGINAL_SIGIL_SLOT_TIERS = ["Footnote", "Watermark", "Catchword"]
const MARGINAL_SLOT_COST_TIERS = ["Rubrication", "Redaction"]
const MARGINAL_HYPERCUBE_TIERS = [{ name: "Interleaf", hypercubes: 1e6 }, { name: "Recto and Verso", hypercubes: 1e12 }]

// A typo in the four lists above is otherwise a silently dead effect that no test can see.
for (const marginalList of [MARGINAL_INSCRIPTION_SLOT_TIERS, MARGINAL_SIGIL_SLOT_TIERS, MARGINAL_SLOT_COST_TIERS])
    for (const marginalName of marginalList)
        if (!(marginalName in milestoneBaseData)) console.error("Unknown Marginal milestone: " + marginalName)
for (const marginalTier of MARGINAL_HYPERCUBE_TIERS)
    if (!(marginalTier.name in milestoneBaseData)) console.error("Unknown Marginal milestone: " + marginalTier.name)

function isMarginalCompleted(name) {
    const requirement = gameData.requirements[name]
    return requirement != null && requirement.isCompleted()
}

function countMarginalCompleted(names) {
    let count = 0
    for (const name of names)
        if (isMarginalCompleted(name)) count++
    return count
}

// Additive term of getEtchingGainLog10(). The Math.min is redundant at 15 tiers and deliberate: it
// is what keeps a 16th tier from breaking the cap silently.
function getMarginalBonusLog10() {
    return Math.min(MARGINAL_GAIN_CAP,
        MARGINAL_GAIN_PER_TIER * countMarginalCompleted(milestoneCategories[MARGINAL_CATEGORY]))
}

function getMarginalInscriptionSlotBonus() { return countMarginalCompleted(MARGINAL_INSCRIPTION_SLOT_TIERS) }
function getMarginalSigilSlotBonus() { return countMarginalCompleted(MARGINAL_SIGIL_SLOT_TIERS) }

// Subtracted from the inscription slot ladder's exponent in js/ledger.js.
function getInscriptionSlotCostReductionLog10() {
    return MARGINAL_SLOT_COST_REDUCTION_LOG10 * countMarginalCompleted(MARGINAL_SLOT_COST_TIERS)
}

function keepsDarkMatterAbilitiesThroughLedger() { return isMarginalCompleted("Palimpsest") }
function isAuthorshipUnlockedByMilestone() { return isMarginalCompleted("First Draft") }

// Highest tier wins; these do not stack.
function getLedgerStartingHypercubes() {
    let hypercubes = 0
    for (const tier of MARGINAL_HYPERCUBE_TIERS)
        if (isMarginalCompleted(tier.name)) hypercubes = Math.max(hypercubes, tier.hypercubes)
    return hypercubes
}
```

> **Note for the sigils owner:** `SIGIL_SLOT_MILESTONES` in `js/challenges.js` and
> `MARGINAL_SIGIL_SLOT_TIERS` here list the same three names. That duplication is deliberate —
> `js/challenges.js` must not depend on the Marginal table existing. Keep them in sync.

---

# PART 6 — `js/ledger.js` (NEW FILE)

**Single owner. Nothing else in the codebase may declare any name from this file.** It declares only
consts and functions and touches no DOM and no `gameData` at load time, so its position in the script
list is unconstrained; it is loaded between `js/milestones.js` and `js/data.js`.

Create the file with exactly this content.

```js
/*
    Layer 6 - The Ledger. Currency: Etchings. Primary verb: Inscribe.

    Etchings are stored as gameData.etchings_log10, a plain double holding log10 of the true value.
    Never write that field directly and never write a bare `+=`: additions are multiplications in log
    space. grantEtchings() below is the ONLY write site.

    There is no subtraction. There is no safe logSub - a + log10(1 - 10^(b-a)) is -Infinity at
    equality and NaN one ulp the wrong way, and both serialize to null, which replaceSaveDict never
    repairs. Every Etching sink is therefore either a THRESHOLD on the total earned (Marginal
    Milestones, exactly like all 42 essence milestones) or a PLEDGE (inscription slots), never a
    deduction. A refund is a state change, not a credit.

    An inscription is a permanent record the amulet keeps of one thing, so that thing survives every
    reset from here on. Two classes are inscribable, because there is no single reset funnel:

      milestones  - the requirement latch is written back after every teardown
      task levels - the task's peak level is written back into maxLevel after every teardown,
                    recorded separately for its normal and its heroic incarnation

    Three rules hold this together and breaking any of them breaks the layer.

    1. RECORD CONTINUOUSLY, RESTORE AFTER TEARDOWN. updateInscribedTaskRecords() runs every tick;
       restoreInscriptions() runs as the last statement of every teardown. Keeping the record
       separate from the field is what makes a challenge round trip lossless - enterChallenge()
       zeroes every maxLevel, and a scheme that only protected the field would destroy the
       inscription the first time the player ran a challenge.

    2. SUSPENSION. Inscriptions are inert while a challenge is running AND while the
       dance_with_the_devil or the_darkest_time sigil is worn, because Task.getMaxLevelMultiplier()
       returns 10 / (maxLevel + 1) under those two - an INVERSE - so a restored max level is a
       penalty proportional to what the player paid for it.

    3. THE W TERM IS RATCHETED. inscriptions.taxed is every milestone inscribed at any point since
       the last Ledger, and it is what W consults. Without it the optimal play is to un-inscribe
       everything one tick before pressing the button, bank full W, and re-inscribe for free.
       inscriptions.pledged is the same idea for the slot budget.
*/

// ---------------------------------------------------------------------------------------------
// Balance constants.
//
// PROVISIONAL - see the contract's calibration gate. Every term must land strictly inside
// (offset, offset + ETCHING_TERM_CAP) on a real endgame save, or it is either dead or pinned.
// ---------------------------------------------------------------------------------------------

const ETCHING_E_OFFSET = 71
const ETCHING_D_OFFSET = 105
const ETCHING_H_OFFSET = 94
const ETCHING_P_SCALE = 30000
const ETCHING_TERM_CAP = 30

// ---------------------------------------------------------------------------------------------
// The gain.
// ---------------------------------------------------------------------------------------------

// Never reads banked essence: gameData.essence is pinned at its 1e308 clamp for anyone who reaches
// this layer, so log10(essence) carries zero information. It reads the unclamped gain chain instead.
function getEtchingGainLog10() {
    if (!gameData.requirements["The End"].isCompleted()) return LOG_ZERO

    const e = getEssenceGainLog10()
    const d = Math.log10(Math.max(1, getDarkMatterGain()))
    const h = Math.log10(Math.max(1, gameData.hypercubes))
    const p = getTotalPerkPoints()

    // Any of these can go non-finite from a clamped or wiped input. A NaN reaching
    // gameData.etchings_log10 would serialize to null and be unrepairable, so bail instead.
    if (!isFinite(e) || !isFinite(d) || !isFinite(h) || !isFinite(p)) return LOG_ZERO

    const tE = 0.20 * capWithLogTail(Math.max(0, e - ETCHING_E_OFFSET), ETCHING_TERM_CAP)
    const tD = 0.10 * capWithLogTail(Math.max(0, d - ETCHING_D_OFFSET), ETCHING_TERM_CAP)
    const tH = 0.20 * capWithLogTail(Math.max(0, h - ETCHING_H_OFFSET), ETCHING_TERM_CAP)
    const tP = 0.50 * Math.log10(1 + Math.max(0, p) / ETCHING_P_SCALE)

    // No input, no payout. Right after a Ledger all three max() terms are 0, and without this guard
    // the additive terms (W, S and the Marginal bonus) would mint free Etchings on a repeat click.
    // doRebirth's payoutGate is the enforcement; this is what it reads.
    if (tE + tD + tH <= 0) return LOG_ZERO

    const W = 0.05 * countUninscribedMilestonesCompleted()
    const S = getSigilWeight()

    // Flat additive schedule with a hard cap on the Marginal term. NEVER a multiplier on essence
    // gain, dark matter gain, or the gamespeed exponent: those close the loop x(n+1) = k*x(n), k > 1.
    // The Math.min stays even though getMarginalBonusLog10() caps internally - defence in depth on
    // the only term the player buys with the currency it produces.
    return tE + tD + tH + tP + W + S + Math.min(MARGINAL_GAIN_CAP, getMarginalBonusLog10())
}

// THE ONLY WRITE SITE for gameData.etchings_log10.
function grantEtchings(gainLog10) {
    if (!Number.isFinite(gainLog10) || gainLog10 <= LOG_ZERO) return

    gameData.etchings_log10 = logAdd(gameData.etchings_log10, gainLog10)
    gameData.stats.totalEtchingsEarnedLog10 = logAdd(gameData.stats.totalEtchingsEarnedLog10, gainLog10)
}

// Named with the _Log10 suffix on purpose: there is deliberately no un-suffixed variant, because a
// caller that forgot the scale would read 4.7 for 50 000 Etchings.
function getTotalEtchingsEarnedLog10() {
    return gameData.etchings_log10
}

// ---------------------------------------------------------------------------------------------
// Inscribable content.
// ---------------------------------------------------------------------------------------------

// Curated. Seven essence milestones are deliberately left out, in two groups.
//
//   INERT - nothing in the codebase reads their requirement's completed flag. Their descriptions
//   say "Unlocks X", but the unlock is performed by a separate EssenceRequirement at the same
//   threshold, so inscribing one would cost a slot and buy nothing:
//       "A new beginning", "A Dark Era", "The new Dark Matter", "Ruler of the Metaverse"
//
//   BALANCE / GATE:
//       "The End"               - the layer's own gate, read nowhere else
//       "The End is near"       - up to 1e75 of dark matter gain, which is an input to tD
//       "Time is a flat circle" - x1000 Time Warping plus x1e50 xp; permanent gamespeed feeding
//                                 the faucet from its own output
//
// Note W's domain is ESSENCE_MILESTONE_NAMES (all 42), not this list. The seven exclusions still
// count toward W - they are a constant the player cannot act on, which is the correct treatment.
const INSCRIBABLE_MILESTONES = [
    "Magic Eye", "Almighty Eye", "Deal with the Devil", "Transcendent Master", "Eternal Time",
    "Hell Portal", "Inferno", "God's Blessings", "Faint Hope",

    "New Beginning", "Rise of Great Heroes", "Lazy Heroes", "Dirty Heroes", "Angry Heroes",
    "Tired Heroes", "Scared Heroes", "Good Heroes", "Funny Heroes", "Beautiful Heroes",
    "Awesome Heroes", "Furious Heroes", "Superb Heroes",

    "Mind Control", "Galactic Emperor", "Dark Matter Harvester", "Dark Orbiter",
    "Dark Matter Mining", "The new gold", "The Devil inside you", "Strange Magic",
    "Speed speed speed", "Life is valueable", "Dark Matter Millionaire",

    "Strong Hope", "A New Hope",
]

// One flat list, used by BOTH createInscriptions() (which builds the DOM ids) and renderLedger()
// (which reads them), so the two can never disagree about which ids exist.
function getInscribableEntries() {
    const entries = []

    for (const name of INSCRIBABLE_MILESTONES) {
        const requirement = gameData.requirements[name]
        if (requirement === undefined) continue
        entries.push({ kind: "milestone", key: name, label: name })
    }

    for (const categoryName in jobCategories)
        for (const name of jobCategories[categoryName])
            entries.push({ kind: "task", key: name, label: name })

    for (const categoryName in skillCategories)
        for (const name of skillCategories[categoryName])
            entries.push({ kind: "task", key: name, label: name })

    return entries
}

// ---------------------------------------------------------------------------------------------
// Predicates.
// ---------------------------------------------------------------------------------------------

// The suspension rule, in one place. Sigils are covered as well as challenges: isChallengeActive()
// is true for a worn sigil outside a challenge, and those two modifiers make a restored max level a
// penalty rather than a benefit.
function areInscriptionsActive() {
    if (isChallengeActive("dance_with_the_devil")) return false
    if (isChallengeActive("the_darkest_time")) return false
    return gameData.active_challenge == ""
}

function getInscribedMilestoneCount() { return gameData.inscriptions.milestones.length }
function getInscribedTaskCount() { return Object.keys(gameData.inscriptions.tasks).length }
function getInscriptionCount() { return getInscribedMilestoneCount() + getInscribedTaskCount() }

// Raw membership: what the save records, suspended or not. Used by the buy/refund path and by the
// UI's slot accounting, which must not change shape when the player enters a challenge.
function hasMilestoneInscription(name) { return gameData.inscriptions.milestones.includes(name) }
function hasTaskInscription(name) { return gameData.inscriptions.tasks[name] !== undefined }

// Effective: recorded AND not suspended. Used by everything that ACTS on an inscription.
function isInscribedMilestone(name) { return areInscriptionsActive() && hasMilestoneInscription(name) }
function isInscribedTask(name) { return areInscriptionsActive() && hasTaskInscription(name) }

function isInscribed(kind, key) {
    return kind == "milestone" ? hasMilestoneInscription(key) : hasTaskInscription(key)
}

// High-water inscription count since the last Ledger. Un-inscribing frees the slot for something
// else but does not release the pledge until the books are balanced, so a SWAP is free and a
// SELL-OFF is not.
function getPledgedInscriptionCount() {
    return Math.max(gameData.inscriptions.pledged, getInscriptionCount())
}

// ---------------------------------------------------------------------------------------------
// Cost. Pledges against the total earned - never a deduction.
// ---------------------------------------------------------------------------------------------

function getInscriptionSlotCostLog10(n) {
    return 3.0 + 0.5 * n - getInscriptionSlotCostReductionLog10()
}

function getInscriptionPledgeLog10(count) {
    if (count === undefined) count = getPledgedInscriptionCount()

    let total = LOG_ZERO
    for (let n = 1; n <= count; n++)
        total = logAdd(total, getInscriptionSlotCostLog10(n))

    return total
}

// THE SEAM. Any future Etching pledge adds one log10 term here. Marginal Milestones do NOT: they are
// plain thresholds on the total earned, exactly like the 42 essence milestones.
function getPledgedEtchingsLog10() {
    return getInscriptionPledgeLog10()
}

function canPledgeEtchings(extraCostLog10) {
    return logAdd(getPledgedEtchingsLog10(), extraCostLog10) <= gameData.etchings_log10
}

// ---------------------------------------------------------------------------------------------
// Buy and refund.
// ---------------------------------------------------------------------------------------------

function canInscribe(kind, key) {
    if (!areInscriptionsActive()) return false

    if (kind == "milestone") {
        if (!INSCRIBABLE_MILESTONES.includes(key)) return false
        if (hasMilestoneInscription(key)) return false
        const requirement = gameData.requirements[key]
        if (requirement === undefined || !requirement.isCompleted()) return false
    } else if (kind == "task") {
        if (hasTaskInscription(key)) return false
        const task = gameData.taskData[key]
        if (task === undefined) return false
        if (Math.max(task.level, task.maxLevel) <= 0) return false
    } else {
        return false
    }

    // Re-using a slot that is already pledged is free.
    if (getInscriptionCount() < getPledgedInscriptionCount()) return true

    return canPledgeEtchings(getInscriptionSlotCostLog10(getPledgedInscriptionCount() + 1))
}

function inscribe(kind, key) {
    if (!canInscribe(kind, key)) return false

    if (kind == "milestone") {
        gameData.inscriptions.milestones.push(key)
        // W stops counting it now, and keeps not counting it for the rest of this Ledger cycle.
        if (!gameData.inscriptions.taxed.includes(key))
            gameData.inscriptions.taxed.push(key)
    } else {
        gameData.inscriptions.tasks[key] = { base: 0, hero: 0 }
    }

    gameData.inscriptions.pledged = Math.max(gameData.inscriptions.pledged, getInscriptionCount())

    updateInscribedTaskRecords()
    restoreInscriptions()
    return true
}

// Free in Etchings - nothing was ever deducted - but it returns neither this cycle's W nor the
// pledged slot. Both are re-derived at the next Ledger. Swapping one inscription for another is
// therefore free; un-inscribing to farm W before pressing the button is not.
//
// The milestone's latch is NOT cleared here: the record simply stops being renewed, and the latch
// falls away at the next teardown. Nothing else in this codebase un-latches a live requirement, and
// doing so would fight renderRequirements at 20 Hz.
function uninscribe(kind, key) {
    if (!areInscriptionsActive()) return false

    if (kind == "milestone") {
        const index = gameData.inscriptions.milestones.indexOf(key)
        if (index < 0) return false
        gameData.inscriptions.milestones.splice(index, 1)
    } else if (kind == "task") {
        if (!hasTaskInscription(key)) return false
        delete gameData.inscriptions.tasks[key]
    } else {
        return false
    }

    return true
}

function toggleInscription(kind, key) {
    return isInscribed(kind, key) ? uninscribe(kind, key) : inscribe(kind, key)
}

// ---------------------------------------------------------------------------------------------
// Record, and write back.
// ---------------------------------------------------------------------------------------------

// Called every tick from update(). Bounded by the number of inscriptions, not by the ~150 tasks.
function updateInscribedTaskRecords() {
    if (!areInscriptionsActive()) return

    for (const name in gameData.inscriptions.tasks) {
        const task = gameData.taskData[name]
        if (task === undefined) continue

        const record = gameData.inscriptions.tasks[name]
        const key = task.isHero ? "hero" : "base"
        const peak = Math.max(task.level, task.maxLevel)
        if (peak > record[key]) record[key] = peak
    }
}

function restoreInscribedMilestones() {
    if (!areInscriptionsActive()) return

    for (const name of gameData.inscriptions.milestones) {
        const requirement = gameData.requirements[name]
        if (requirement !== undefined) requirement.completed = true
    }
}

// Normal and heroic max levels are different scales - makeHero() zeroes maxLevel precisely so a
// pre-hero peak cannot leak into the heroic multiplier - so the record is kept per incarnation and
// only the matching one is ever written back.
function restoreInscribedMaxLevels() {
    if (!areInscriptionsActive()) return

    for (const name in gameData.inscriptions.tasks) {
        const task = gameData.taskData[name]
        if (task === undefined) continue

        const record = gameData.inscriptions.tasks[name][task.isHero ? "hero" : "base"]
        if (record > task.maxLevel) task.maxLevel = record
    }
}

// The single "write the record back" call. Idempotent, and a no-op while suspended. Every teardown
// ends with it, as its last statement, after active_challenge has been settled.
function restoreInscriptions() {
    restoreInscribedMilestones()
    restoreInscribedMaxLevels()
}

// ---------------------------------------------------------------------------------------------
// The W term, and balancing the books.
// ---------------------------------------------------------------------------------------------

// Completed, uninscribed, essence-priced milestones. Reads inscriptions.taxed rather than
// inscriptions.milestones: taxed is every milestone inscribed at any point since the last Ledger, so
// dropping an inscription just before pressing the button does not hand the income back.
//
// Domain is ESSENCE_MILESTONE_NAMES - derived by currency in js/milestones.js - so an Etching-priced
// tier can never enter W and the layer can never pay for itself. Max value is 42, i.e. W <= 2.10.
function countUninscribedMilestonesCompleted() {
    let count = 0

    for (const name of ESSENCE_MILESTONE_NAMES) {
        if (gameData.inscriptions.taxed.includes(name)) continue
        const requirement = gameData.requirements[name]
        if (requirement !== undefined && requirement.isCompleted()) count++
    }

    return count
}

// MUST be the last statement of the layer-6 driver: after the grant (which reads
// countUninscribedMilestonesCompleted) and after restoreInscriptions().
function reconcileInscriptionsAfterLedger() {
    gameData.inscriptions.taxed = gameData.inscriptions.milestones.slice()
    gameData.inscriptions.pledged = getInscriptionCount()
}

// A hand-edited, truncated or imported save can turn an array into null or an object, and
// .includes() on one of those throws inside update() - a dead game loop, not a bad number. Called
// once from loadGameData(), after assignMethods().
function normalizeInscriptions() {
    let inscriptions = gameData.inscriptions

    if (inscriptions === null || typeof inscriptions !== "object" || Array.isArray(inscriptions)) {
        gameData.inscriptions = { milestones: [], tasks: {}, taxed: [], pledged: 0 }
        return
    }

    if (!Array.isArray(inscriptions.milestones)) inscriptions.milestones = []
    if (!Array.isArray(inscriptions.taxed)) inscriptions.taxed = []
    if (inscriptions.tasks === null || typeof inscriptions.tasks !== "object" || Array.isArray(inscriptions.tasks))
        inscriptions.tasks = {}
    if (typeof inscriptions.pledged !== "number" || !isFinite(inscriptions.pledged)) inscriptions.pledged = 0

    const droppedMilestones = inscriptions.milestones.filter(name => !INSCRIBABLE_MILESTONES.includes(name))
    if (droppedMilestones.length > 0) console.warn("Dropped unknown inscriptions: " + droppedMilestones.join(", "))

    inscriptions.milestones = inscriptions.milestones.filter(name => INSCRIBABLE_MILESTONES.includes(name))
    inscriptions.taxed = inscriptions.taxed.filter(name => INSCRIBABLE_MILESTONES.includes(name))

    for (const name in inscriptions.tasks) {
        const record = inscriptions.tasks[name]
        if (gameData.taskData[name] === undefined || record === null || typeof record !== "object") {
            console.warn("Dropped unknown task inscription: " + name)
            delete inscriptions.tasks[name]
            continue
        }
        if (typeof record.base !== "number" || !isFinite(record.base)) record.base = 0
        if (typeof record.hero !== "number" || !isFinite(record.hero)) record.hero = 0
    }

    // taxed is a superset of milestones by construction; restore that after any pruning.
    for (const name of inscriptions.milestones)
        if (!inscriptions.taxed.includes(name)) inscriptions.taxed.push(name)

    // Pruning frees pledged slots: recompute DOWNWARD too, or a stale entry silently costs the
    // player a slot they paid a whole Ledger's income for.
    inscriptions.pledged = getInscriptionCount()
}
```

---

# PART 7 — `js/data.js`

**7.1 — Layer-6 top-level state.**
Anchor: the `gameData` object literal, immediately after the `perks: { … },` block and before
`paused: false,`.

```js
    // Layer 6 - The Ledger.
    // etchings_log10 stores log10 of the true Etching count, never the count itself. Zero is the
    // finite LOG_ZERO sentinel, not -Infinity: JSON.stringify turns -Infinity into null and
    // replaceSaveDict only backfills *absent* keys, so a null would never be repaired.
    etchings_log10: LOG_ZERO,

    // Sigil bitmasks over SIGIL_BITS (js/challenges.js). Scalars on purpose: a bitmask migrates for
    // free, a dict would need its own replaceSaveDict call.
    //   sigils        - currently worn
    //   sigils_broken - NOT continuously worn since the last Ledger; getSigilWeight ignores these
    //   last_sigils   - served through the previous Ledger; drives the repeat discount
    sigils: 0,
    sigils_broken: 0,
    last_sigils: 0,

    // NESTED DICT. It needs its own replaceSaveDict call in loadGameData, or a fifth key added here
    // later is undefined for every existing player (the standing gameData.evil_perks counterexample).
    //
    // `tasks` is a PLAIN OBJECT keyed by task name, mapping to { base, hero } peak levels. It must
    // never be an array (JSON.stringify drops string-keyed properties of an Array, which would erase
    // every task inscription on the next autosave) and it must never be passed to replaceSaveDict
    // (whose delete loop would erase every entry against the empty default).
    inscriptions: {
        milestones: [],
        tasks: {},
        taxed: [],
        pledged: 0,
    },
```

`LOG_ZERO` is a top-level `const` in `js/utils.js`, which loads first, so the reference resolves.

**7.2 — Layer-6 rebirth counters.**
Anchor: the rebirth counter block, after `rebirthFiveTime: 0,`.

```js
    rebirthSixCount: 0,
    rebirthSixTime: 0,
```

**7.3 — `gameData.stats` additions.** Single owned block.
Anchor: inside `stats: { … }`. `fastest6` goes after `fastest5`; the other three after
`maxEssenceReached: 0,`.

```js
        fastest6: null,
```
```js
        sigilsEverUsed: 0,
        totalEtchingsEarnedLog10: LOG_ZERO,
        maxEtchingsReachedLog10: LOG_ZERO,
```

**7.4 — `permanentUnlocks`.** Replace the whole single-line array with exactly this. Four specs
proposed four different replacements; this is the merge.

```js
const permanentUnlocks = ["Quick task display", "Evil perks", "Rebirth tab", "Milestones", "Dark Matter", "Dark Matter Skills", "Dark Matter Skills2", "Metaverse", "Metaverse Perks", "Metaverse Perks Button", "Congratulations", "Sigils"]
```

Two additions and their reasons:
* **`"Milestones"`** — fixes a pre-existing bug. The Milestones tab button is gated by an
  `EssenceRequirement` at 1 and is on neither exemption list, so `rebirthReset()` un-latches it on
  every reset. A Ledger zeroes essence, which would hide the tab that displays the Marginal track.
  **Behaviour change requiring a changelog line:** after a Collapse or a Metaverse the tab now stays
  visible instead of hiding until 1 essence is re-earned.
* **`"Sigils"`** — the panel gate is an `EssenceRequirement` at 1e300; without this the sigil UI
  disappears after every Ledger.

**Deliberately NOT added:** `"Rebirth button 6"`, `"Ledger"`, `"Etchings info"`, and every Marginal
Milestone name. All of them read `gameData.etchings_log10` or essence directly and re-latch on the
next frame; listing them would stop layer 7 from revoking them. `metaverseUnlocks` is unchanged.

**7.5 — New requirement rows.**
Anchor: `requirementsBaseData`.

Beside the other category gates (after `"Metaverse Guards"`):
```js
    "The Margin": new EssenceRequirement([removeSpaces(".The Margin")], [{ requirement: 1e300 }]),
    "Marginal Milestones": new EtchingRequirement([removeSpaces(".Marginal Milestones")], [{ requirement_log10: 0 }]),
```

At the end of the `// Metaverse Guards` block, as a new `// The Margin` block:
```js

    // The Margin
    "Errata Prima": new EssenceRequirement([getQuerySelector("Errata Prima")], [{ requirement: 1e300 }]),
    "Colophon": new TaskRequirement([getQuerySelector("Colophon")], [{ task: "Errata Prima", requirement: 1000, herequirement: 150000 }]),
    "Blank Leaf": new TaskRequirement([getQuerySelector("Blank Leaf")], [{ task: "Colophon", requirement: 2500, herequirement: 160000 }]),
    "Dedication": new TaskRequirement([getQuerySelector("Dedication")], [{ task: "Blank Leaf", requirement: 10000, herequirement: 175000 }]),
```
> `"Errata Prima"` deliberately has **no** `herequirement`. Essence is hard-clamped to 1e308, so any
> hero-tier essence threshold above that is unreachable forever and would permanently block the whole
> Margin hero tier.

Beside the other rebirth notes / buttons / sidebar items / keybind help:
```js
    "Rebirth note 9": new EssenceRequirement(["#rebirthNote9"], [{ requirement: 1e300 }]),
    "Rebirth button 6": new EssenceRequirement(["#rebirthButton6"], [{ requirement: 1e300 }]),
    "Etchings info": new EtchingRequirement(["#etchingsInfo"], [{ requirement_log10: 0 }]),
    "Ledger": new EtchingRequirement(["#ledgerTabButton"], [{ requirement_log10: 0 }]),
    "Sigils": new EssenceRequirement(["#sigilPanel"], [{ requirement: 1e300 }]),
    "key6": new EssenceRequirement(["#key6"], [{ requirement: 1e300 }]),
```

> **`"Ledger"` gates the tab BUTTON only, never the `#ledger` div.** `changeTab` detects the current
> tab from the div but tests a candidate's availability on its button; putting a tab div id into a
> Requirement's `querySelectors` breaks that asymmetry.

**7.6 — The Margin job entries.**
Anchor: `jobBaseData`, after the `"Omega"` entry.

```js
    "Errata Prima": { name: "Errata Prima", maxXp: Infinity, income: 2.5e66, heroxp: 3600 },
    "Colophon": { name: "Colophon", maxXp: Infinity, income: 2.5e70, heroxp: 4050 },
    "Blank Leaf": { name: "Blank Leaf", maxXp: Infinity, income: 2.5e74, heroxp: 4500 },
    "Dedication": { name: "Dedication", maxXp: Infinity, income: 2.5e78, heroxp: 5040 },
```

`heroxp` values are exact multiples of 9 so that `floor(heroxp / 9)` in `getHeroBigIntFactor` is
unambiguous: bands 400/450/500/560 against Omega's 346, i.e. +6480/+6000/+6000/+7200 levels of
equivalent cost at 120 levels per band. All ≥ 1000 keeps them in the `1 + maxLevel/effect` branch of
`getMaxLevelMultiplier`; all > 130 gives them the same hero income factors as Omega.

**7.7 — `jobCategories`.** Add a trailing comma to the `"Metaverse Guards"` entry and append:

```js
    "The Margin": ["Errata Prima", "Colophon", "Blank Leaf", "Dedication"]
```

Appending **last** is what makes `getPreviousTaskInCategory` hand `"Errata Prima"` the prerequisite
`"Omega"`. **Do not "fix" `getPreviousTaskInCategory`'s missing per-category `prev` reset** — that
carry-over is what produces the correct chain here, and resetting it would regress five existing
tasks (Squire, Student, Corrupted, Eternal Wanderer, Snow Crash).

**7.8 — `headerRowColors`.** Add a trailing comma to `"Metaverse Guards"` and append:

```js
    "The Margin": "#2b2b2b",
    "Marginal Milestones": "#7a5c3e"
```

**7.9 — `headerRowTextColors`.** Append:

```js
    "The Margin": "white",
    "Marginal Milestones": "gold",
```

A missing key here yields `color: undefined` under the colour-blind theme only, which is why it
survives casual testing.

---

# PART 8 — `js/rebirth.js`

**8.1 — Extend the header comment.** Amend phase 5's entry, amend phase 11, and add phases 0 and 13.
Do not renumber the existing phases — the numbers appear as trailing comments in the driver.

```
     0  payout gate     - optional per-layer predicate, checked BEFORE the counter increment.
                          Layer 6 only. A Ledger with no gain would still run the full wipe, and the
                          view-level guard covers only one of the three entry points (sidebar button,
                          rebirth note button, `r` keybind).
```
```
     5  clears          - MUST precede rebirthReset(), which reads dark_matter_shop.a_miracle to
                          re-grant Magic Eye and reads the currencies for its tab-retention test.
                          Layers 5 and 6 share the same teardown via resetMetaverse(); it runs last
                          within the phase, after the table's own clears.
```
```
    11  maxLevel AFTER  - layers 2/4/5/6. Exists purely to undo that promotion. Layer 1 does neither
                          and inherits it, which is what makes layer 1 a "keep" rather than a "zero".
    13  inscriptions    - MUST be last. Writes back the Layer 6 record (milestone latches, task max
                          levels) and then balances the W / pledge books. No-op while
                          active_challenge is set, so it has to run after phase 12; and after phase
                          11, or the restored max levels are re-zeroed.
```

**8.2 — Hoist layer 5's clears and add `resetMetaverse()`.**
Anchor: immediately above `const REBIRTH_LAYERS = {`.

Copy the three literals **verbatim** out of the current `REBIRTH_LAYERS[5]`.

```js
/*
    The metaverse / dark-matter teardown, shared by layers 5 and 6 so the two cannot drift.

    Lifted verbatim out of REBIRTH_LAYERS[5].clears / .conditionalClears. It runs at pipeline
    position 5. The three permanentUnlocks revokes that belong with it stay in `revokes` at position
    7 - they sit on the other side of the challenge wipe and cannot move into this function.
*/
const METAVERSE_CLEARS = {
    "essence": 0,
    "evil": 0,
    "dark_matter": 0,
    "dark_orbs": 0,
    "hypercubes": 0,
    "boost_active": false,
    "boost_timer": 0,
    "boost_cooldown": 0,
    "dark_matter_shop.dark_orb_generator": 0,
    "dark_matter_shop.a_miracle": false,
    "dark_matter_shop.a_deal_with_the_chairman": 0,
    "dark_matter_shop.a_gift_from_god": 0,
    "dark_matter_shop.gotta_be_fast": 0,
    "dark_matter_shop.life_coach": 0,
    "metaverse.boost_cooldown_modifier": 1,
    "metaverse.boost_timer_modifier": 1,
    "metaverse.boost_warp_modifier": 100,
    "metaverse.hypercube_gain_modifier": 1,
    "metaverse.evil_tran_gain": 0,
    "metaverse.essence_gain_modifier": 0,
    "metaverse.challenge_altar": 0,
    "metaverse.dark_mater_gain_modifer": 0,
}

const DARK_MATTER_SKILL_CLEARS = {
    "dark_matter_shop.speed_is_life": 0,
    "dark_matter_shop.your_greatest_debt": 0,
    "dark_matter_shop.essence_collector": 0,
    "dark_matter_shop.explosion_of_the_universe": 0,
    "dark_matter_shop.multiverse_explorer": 0,
}

// In permanentUnlocks, so rebirthReset() would otherwise preserve them.
const DARK_MATTER_UNLOCKS = ["Dark Matter", "Dark Matter Skills", "Dark Matter Skills2"]

// `layer` is passed so a Marginal Milestone can spare the dark-matter abilities on a Ledger without
// changing layer 5's behaviour.
function resetMetaverse(layer) {
    applyGameDataPaths(METAVERSE_CLEARS)

    const keepSkills = gameData.perks.keep_dark_mater_skills != 0
        || (layer === 6 && keepsDarkMatterAbilitiesThroughLedger())

    if (!keepSkills)
        applyGameDataPaths(DARK_MATTER_SKILL_CLEARS)

    // Marginal Milestones can seed the next Ledger with hypercubes. MUST run after the clear above,
    // and MUST be clamped: update() truncates hypercubes to getHypercubeCap() on the next tick.
    if (layer === 6) {
        const seed = getLedgerStartingHypercubes()
        if (seed > 0)
            gameData.hypercubes = Math.min(getHypercubeCap(), Math.max(gameData.hypercubes, seed))
    }
}
```

**8.3 — Rewrite `REBIRTH_LAYERS[5]`.** Delete the `clears` and `conditionalClears` properties, replace
them with `resetMetaverse: true`, and replace the inline `revokes` array with the shared const.
Everything else in the row is unchanged.

```js
    5: {
        gate: "Rebirth button 5",
        countKey: "rebirthFiveCount",
        statKey: "fastest5",
        timerKey: "rebirthFiveTime",
        timersCleared: ["rebirthOneTime", "rebirthTwoTime", "rebirthThreeTime", "rebirthFourTime", "rebirthFiveTime"],
        grant: () => { gameData.perks_points += getMetaversePerkPointsGain() },
        evilPerks: "inline",
        resetMetaverse: true,
        challengeWipe: () => gameData.perks.save_challenges == 0,
        revokes: DARK_MATTER_UNLOCKS,
        maxLevel: "zero",
        clearActiveChallenge: true,
    },
```

Behaviour-identical: phase 5 becomes clears (none) → conditional clears (none) → `resetMetaverse(5)`,
which applies the same scalar paths and then the same guarded skill-tree paths, in the same order,
with `layer !== 6` disabling both new branches. The oracle proves it.

**8.4 — Add `REBIRTH_LAYERS[6]`.**
Anchor: after the layer-5 row, before the table's closing brace.

```js
    /*
        Layer 6 - The Ledger. Grants Etchings, wipes everything layers 2-5 grant, and keeps the two
        things the balance design forbids resetting: perks_points (the unspent-perk dark matter buff
        is worth up to 1e75 and takes ~7 Metaverse runs to re-earn) and the challenge best scores
        (they multiply the essence and dark-matter gain chains the Etching formula reads, so wiping
        them would make each Ledger pay less than the one before).
    */
    6: {
        gate: "Rebirth button 6",
        // Refuses a Ledger that would pay nothing. This is the ENFORCEMENT of the no-input-no-payout
        // rule; the sidebar's hidden flag is a cosmetic echo of it and covers only one of the three
        // entry points.
        payoutGate: () => getEtchingGainLog10() > LOG_ZERO,
        countKey: "rebirthSixCount",
        statKey: "fastest6",
        timerKey: "rebirthSixTime",
        timersCleared: ["rebirthOneTime", "rebirthTwoTime", "rebirthThreeTime", "rebirthFourTime", "rebirthFiveTime", "rebirthSixTime"],
        // Position 3, and it has to be: getEtchingGainLog10() reads the essence gain chain, the dark
        // matter gain chain (via getChallengeBonus) and gameData.hypercubes, all of which
        // resetMetaverse() zeroes at position 5, and task effects that rebirthReset() destroys at
        // position 10.
        grant: () => {
            grantEtchings(getEtchingGainLog10())

            // AFTER the gain, which reads getSigilWeight(). Reversing these pays the player nothing
            // for the loadout they just served.
            commitSigils()
        },
        // Matches layers 4/5, not the guarded form. A new layer has no legacy behaviour to freeze,
        // and "guarded" would be a dead no-op here anyway: resetEvilPerks() bails on God's Blessings,
        // which every player who can reach 1e300 essence owns. If the layer-4/5 guard bug is ever
        // fixed, revisit this line deliberately rather than sweeping it along.
        evilPerks: "inline",
        resetMetaverse: true,
        // No challengeWipe. Deliberate - see the row comment.
        revokes: DARK_MATTER_UNLOCKS,
        // Position 11, not 9. "recall" reads pre-reset task levels through Cosmic Recollection's
        // effect, and layer 6 destroys that skill along with everything else, so a recall here would
        // be a maxLevel wipe wearing a rescale's clothes.
        maxLevel: "zero",
        clearActiveChallenge: true,
    },
```

**8.5 — Driver: add phase 0.**
Anchor: `doRebirth()`, immediately after the gate check `if (!gameData.requirements[spec.gate].isCompleted()) return false`.

```js
    if (spec.payoutGate !== undefined && !spec.payoutGate())               // 0
        return false
```

It **must** precede `gameData[spec.countKey] += 1`, or a refused Ledger still increments the counter.

**8.6 — Driver: add the phase-5 hook.**
Anchor: `doRebirth()`, after the `conditionalClears` loop, before the phase-6 `challengeWipe` block.

```js
    if (spec.resetMetaverse)                                            // 5, shared by layers 5/6
        resetMetaverse(layer)
```

**8.7 — Driver: add phase 13.**
Anchor: `doRebirth()`, after the phase-12 `clearActiveChallenge` block, before `return true`.

```js
    restoreInscriptions()                                               // 13
    reconcileInscriptionsAfterLedger()

    return true
```

`reconcileInscriptionsAfterLedger()` runs after `restoreInscriptions()` and after the grant (which
reads `countUninscribedMilestonesCompleted()`). Swapping them changes nothing today but will the
moment restore gains a side effect.

> Note: phase 13 runs for **every** layer, not only 6. That is correct — an inscribed milestone must
> survive a layer-1 rebirth too. `reconcileInscriptionsAfterLedger()` on a layer 1–5 rebirth is
> harmless: it re-syncs `taxed` to the live set and lowers `pledged` to the live count, which is the
> same thing a Ledger does. **ASSUMPTION**, flagged: if playtesting shows the W ratchet should only
> reset on an actual Ledger, guard the reconcile with `if (layer === 6)`.

**8.8 — Add the layer-6 wrapper.**
Anchor: beside `function rebirthFive() { return doRebirth(5) }`.

```js
function rebirthSix() { return doRebirth(6) }
```

**8.9 — `rebirthReset()` tab whitelist.**
Anchor: the compound `if` at the top of `rebirthReset`, after the `Tab.DARK_MATTER` clause.

```js
            || gameData.settings.selectedTab == Tab.LEDGER && gameData.etchings_log10 > LOG_ZERO
```

**8.10 — `rebirthReset()` requirement preserve loop.** Append the inscription clause.

```js
    for (const key in gameData.requirements) {
        const requirement = gameData.requirements[key]
        // Inscriptions are the player's own additions to permanentUnlocks. isInscribedMilestone() is
        // false while a challenge is running or a max-level-inverting sigil is worn, so a challenge
        // still starts from a clean slate. enterChallenge() sets active_challenge BEFORE calling
        // this, which is what makes that predicate correct at exactly the moment it matters.
        if (requirement.completed && (permanentUnlocks.includes(key) || metaverseUnlocks.includes(key)
            || isInscribedMilestone(key))) continue
        requirement.completed = false
    }
```

**`rebirthReset`'s signature does not change.** `setAllMaxLevels` is unchanged and is **not**
replaced. `js/rebirth.js` **never writes** to `gameData.inscriptions`.

---

# PART 9 — `js/main.js`

**9.1 — CRASH SAFETY AT BOOT (release blocker).**
Anchor: the bare boot block that begins at the comment
`// Loads the game save, does the initial render and starts the game update and render loop.`

Wrap everything from `createGameObjects(...)` down to and including
`setTabMetaverse("metaverseTab1")` in a function and call it inside a `try`/`catch`. `#errorInfo` is
nested inside `#mainarea`, which is hidden until the middle of that block, so an unprotected throw is
a blank page with no banner, no game loop and no autosave.

```js
// Loads the game save, does the initial render and starts the game update and render loop.
//
// Phase 0's try/catch protects only the setInterval body. Everything below runs BEFORE the two
// intervals exist, and #errorInfo lives inside #mainarea, which is hidden until part-way through -
// so an unprotected throw here is a blank page with no banner. The catch unhides the page, shows the
// banner permanently, and starts NEITHER loop: a failed boot must not autosave over the player's
// localStorage.
let bootFailed = false

function bootGame() {
    createGameObjects(gameData.taskData, jobBaseData)
    createGameObjects(gameData.taskData, skillBaseData)
    createGameObjects(gameData.itemData, itemBaseData)
    createGameObjects(milestoneData, milestoneBaseData)

    gameData.currentJob = gameData.taskData["Beggar"]
    gameData.currentProperty = gameData.itemData["Homeless"]
    gameData.currentMisc = []

    gameData.requirements = requirementsBaseData

    createMilestoneRequirements()

    assertContentTableIntegrity()

    tempData["requirements"] = {}
    for (const key in gameData.requirements) {
        const requirement = gameData.requirements[key]
        tempData["requirements"][key] = requirement
    }

    loadGameData()

    initializeUI()

    setCustomEffects()
    addMultipliers()

    if ("save_date_time" in gameData && gameData.save_date_time > 0) {
        calc_offline_progress(Date.now() - gameData.save_date_time)
    }

    if (!in_offline_progress)
        document.getElementById("mainarea").hidden = false

    onResize(window.outerWidth)
    update()

    setTab(gameData.settings.selectedTab)
    setTabSettings("settingsTab")
    setTabDarkMatter("shopTab")
    setTabMetaverse("metaverseTab1")
    setTabLedger("ledgerTab1")
}

try {
    bootGame()
} catch (error) {
    bootFailed = true
    console.error(error)
    const mainarea = document.getElementById("mainarea")
    if (mainarea != null) mainarea.hidden = false
    const errorInfo = document.getElementById("errorInfo")
    if (errorInfo != null) {
        errorInfo.textContent = "The game failed to start: " + error
        errorInfo.hidden = false
    }
}

let ticking = false;

var gameloop = bootFailed ? null : setInterval(function() {
    /* body unchanged */
}, 1000 / updateSpeed)
var saveloop = bootFailed ? null : setInterval(saveGameData, 3000)
```

**9.2 — `saveGameData` must not overwrite a failed load.**
Anchor: `function saveGameData()`.

```js
function saveGameData() {
    // A failed load leaves gameData as the pristine defaults. Autosaving that would destroy the
    // player's save as a side effect of the recovery path.
    if (loadFailed) return

    gameData.save_date_time = Date.now()
    localStorage.setItem("gameDataSave", JSON.stringify(gameData))
}
```
Declare `let loadFailed = false` beside the other module-level `let`s, and set `loadFailed = true` in
`loadGameData()`'s `catch` block (see §9.6).

**9.3 — Refactor `getEssenceGain` and add `getEssenceGainLog10`.**
Anchor: replace `function getEssenceGain()` in full; it sits between `getEvilGain()` and
`getDarkMatterGain()`.

```js
// The factors of essence gain, in multiplication order. getEssenceGain() reduces them;
// getEssenceGainLog10() sums their logs. One list, so the two readers cannot drift apart when a
// factor is added.
//
// The last ESSENCE_GAIN_LEDGER_EXCLUDED entries are excluded from the log10 sum and must stay last.
// lifeIsValueable is raw gameData.dark_matter and essenceMultGain() is 10^essence_gain_modifier; the
// Ledger already prices dark matter (tD) and hypercube spending (tH) directly, so counting them here
// as well would give dark matter a true weight of 1.5 and hypercubes 2.75 instead of 0.5 and 0.25.
const ESSENCE_GAIN_LEDGER_EXCLUDED = 2

function getEssenceGainFactors() {
    return [
        gameData.taskData["Yin Yang"].getEffect(),
        gameData.taskData["Essence Collector"].getEffect(),
        milestoneData["Transcendent Master"].getEffect(),
        milestoneData["Faint Hope"].getEffect(),
        milestoneData["Rise of Great Heroes"].getEffect(),
        getChallengeBonus("dance_with_the_devil"),
        getAGiftFromGodEssenceGain(),
        gameData.taskData["Dark Magician"].getEffect(),
        getDarkMatterSkillEssence(),
        gameData.requirements["The new gold"].isCompleted() ? 1000 : 1,

        // --- excluded from getEssenceGainLog10(); keep these last ---
        gameData.requirements["Life is valueable"].isCompleted() ? gameData.dark_matter : 1,
        essenceMultGain(),
    ]
}

function getEssenceGain() {
    const factors = getEssenceGainFactors()

    let essenceGain = 1
    for (const factor of factors)
        essenceGain *= factor

    return Math.min(essenceGain, 1e308)
}

// log10 of the essence gain chain, WITHOUT the 1e308 clamp and without the last two factors.
//
// Unclamped on purpose: gameData.essence is pinned at the clamp for anyone who reaches the Ledger,
// so log10(essence) carries no information. This reads the gain chain instead, in log space, where
// the product cannot overflow. It is READ-ONLY - it never writes gameData.essence and must never be
// used to grant essence.
//
// NOTE FOR BALANCE: the retained ten factors are bounded at roughly 1e85, because the three Skill
// factors are LINEAR in level, Faint Hope is hard-softcapped, a_gift_from_god is bounded by its own
// cost guard, and the dark-matter skill tree tops out at 2.5e13. Calibrate ETCHING_E_OFFSET against
// a real save; do not assume the roadmap's 180.
function getEssenceGainLog10() {
    const factors = getEssenceGainFactors()
    const counted = factors.length - ESSENCE_GAIN_LEDGER_EXCLUDED

    let total = 0
    for (let i = 0; i < counted; i++) {
        const factor = factors[i]

        // Faint Hope's second branch scales by log2(getUnpausedGameSpeed()), which is negative when
        // game speed drops below 1, so a non-positive factor is reachable. The linear chain just
        // goes negative; log space would go NaN. Report "no gain" instead.
        if (!(factor > 0)) return LOG_ZERO
        if (factor === Infinity) return Infinity

        total += Math.log10(factor)
    }

    return total
}
```

The reduce is bit-identical to the original chained product: the original associates left-to-right
and `1 * a === a` exactly for every double, and the factor order is preserved verbatim.

**9.4 — `increaseRealtime()`.** Anchor: after `gameData.rebirthFiveTime += realDiff`.

```js
    gameData.rebirthSixTime += realDiff
```

**9.5 — `makeHero(task)`.** Anchor: inside the `if` block, after `task.isHero = true`.

```js
        // maxLevel was just zeroed, and the heroic record is a different scale from the normal one.
        restoreInscribedMaxLevels()
```

`rebirthReset()` clears every `isHero` flag, so tasks re-heroify during every run and `makeHero()`
zeroes `maxLevel` each time. Without this an inscribed max level would be restored and then destroyed
minutes later.

**9.6 — `loadGameData()`.** Four edits.

(a) Guard and add the eleventh `replaceSaveDict` call, after `replaceSaveDict(gameData.perks, …)`:
```js
            // replaceSaveDict does `key in saveDict`, which THROWS on null and on primitives. A
            // hand-edited or imported save can supply either, and a throw here lands in the catch
            // below, which leaves gameData as the pristine defaults.
            if (gameDataSave.inscriptions == null || typeof gameDataSave.inscriptions !== "object"
                || Array.isArray(gameDataSave.inscriptions))
                gameDataSave.inscriptions = gameData.inscriptions
            replaceSaveDict(gameData.inscriptions, gameDataSave.inscriptions)
```
**Do NOT add a call for `gameData.inscriptions.tasks`.** Its keys are player data, not schema.

(b) Repairs. Single owned block, after the `perks_points` rescue and before the `settings.theme`
check. `replaceSaveDict` only backfills *absent* keys, so present-but-null is never repaired.
```js
            // Number.isFinite, not the global isFinite: isFinite(null) === true.
            if (!Number.isFinite(gameData.etchings_log10))
                gameData.etchings_log10 = LOG_ZERO

            if (!Number.isFinite(gameData.stats.totalEtchingsEarnedLog10))
                gameData.stats.totalEtchingsEarnedLog10 = gameData.etchings_log10

            if (!Number.isFinite(gameData.stats.maxEtchingsReachedLog10))
                gameData.stats.maxEtchingsReachedLog10 = gameData.etchings_log10

            if (gameData.sigils == null || isNaN(gameData.sigils)) gameData.sigils = 0
            if (gameData.sigils_broken == null || isNaN(gameData.sigils_broken)) gameData.sigils_broken = 0
            if (gameData.last_sigils == null || isNaN(gameData.last_sigils)) gameData.last_sigils = 0
            if (gameData.stats.sigilsEverUsed == null || isNaN(gameData.stats.sigilsEverUsed))
                gameData.stats.sigilsEverUsed = 0

            // Plain null/NaN guards. Deliberately NOT the `=== 0 -> gameData.realtime` pattern used
            // by rebirthOneTime..FourTime: seeding a timer introduced in this release from an
            // unrelated realtime would inflate every existing player's first stats.fastest6.
            if (gameData.rebirthFiveTime == null || isNaN(gameData.rebirthFiveTime))
                gameData.rebirthFiveTime = 0
            if (gameData.rebirthSixTime == null || isNaN(gameData.rebirthSixTime))
                gameData.rebirthSixTime = 0
```

(c) In the `catch` block, before the `alert`, add:
```js
        loadFailed = true
```

(d) At the tail, after `assignMethods()`:
```js
    normalizeInscriptions()
```

**9.7 — `assignMethods()` requirement chain.** Add an eleventh branch after `"perkpoint"`.

```js
        } else if (requirement.type == "etching") {
            requirement = Object.assign(new EtchingRequirement(requirement.querySelectors, requirement.requirements), requirement)
        }
```

Without it the save loads a prototype-less object on the **second** load (the first works, because
`replaceSaveDict` installs the live instance for an absent key), and `updateRequirements()` then
throws 20 times a second. `replaceSaveDict`'s type-mismatch repair does **not** catch a missing
branch.

**9.8 — `makeHeroes()`.** Widen the `EssenceRequirement` branch:

```js
        else if (req instanceof EssenceRequirement || req instanceof EtchingRequirement) {
```

`makeHeroes` has no `else` — an unmatched requirement type falls through with `isNewHero` still true
and the task heroifies for free.

**9.9 — `update()`.** Anchor: immediately before `applyMilestones()`.

```js
    updateSigilService()
    updateInscribedTaskRecords()
```

**9.10 — `updateStats()`.** Anchor: after the `maxEssenceReached` update.

```js
    if (gameData.etchings_log10 > gameData.stats.maxEtchingsReachedLog10)
        gameData.stats.maxEtchingsReachedLog10 = gameData.etchings_log10
```

**9.11 — Add `assertContentTableIntegrity()`.**
Anchor: anywhere above the boot block; called from `bootGame()` (§9.1) after
`createMilestoneRequirements()`.

`console.error` only — **never throw**. Its whole purpose is to convert a parallel-table miss from a
dead page into a console line.

```js
// Boot-time integrity check over the parallel content tables. console.error only: a throw here is a
// blank page (see bootGame's comment). Catches the failure modes that are otherwise silent or fatal:
//   - a task/item with no requirementsBaseData key -> TypeError in autoPromote(), 20 Hz
//   - a milestone in milestoneBaseData but not in milestoneCategories -> renderMilestones()
//     dereferences a null row (renderMilestones iterates milestoneData, NOT the categories)
//   - a name whose id transform is not a valid CSS ident -> querySelectorAll throws in initializeUI
//   - a missing tooltip -> the literal string "undefined" in the row
function assertContentTableIntegrity() {
    const identSafe = (name) => {
        const id = removeSpaces(removeStrangeCharacters(name))
        for (const ch of id) {
            const code = ch.codePointAt(0)
            if (code >= 0x80) continue
            if (!/[A-Za-z0-9_-]/.test(ch)) return false
        }
        return /^[A-Za-z_-￿]/.test(id)
    }

    const inCategories = (categories) => {
        const seen = {}
        for (const categoryName in categories) {
            if (headerRowColors[categoryName] === undefined)
                console.error("integrity: no headerRowColors entry for category " + categoryName)
            if (headerRowTextColors[categoryName] === undefined)
                console.error("integrity: no headerRowTextColors entry for category " + categoryName)
            for (const name of categories[categoryName]) seen[name] = true
        }
        return seen
    }

    const jobSeen = inCategories(jobCategories)
    const skillSeen = inCategories(skillCategories)
    const itemSeen = inCategories(itemCategories)
    const milestoneSeen = inCategories(milestoneCategories)

    const check = (table, seen, label, needsRequirement) => {
        for (const name in table) {
            if (!identSafe(name))
                console.error("integrity: " + label + " name is not id-safe: " + name)
            if (!seen[name])
                console.error("integrity: " + label + " missing from its categories table: " + name)
            if (tooltips[name] === undefined)
                console.error("integrity: no tooltip for " + label + " " + name)
            if (needsRequirement && gameData.requirements[name] === undefined)
                console.error("integrity: no requirementsBaseData entry for " + label + " " + name)
        }
    }

    check(jobBaseData, jobSeen, "job", true)
    check(skillBaseData, skillSeen, "skill", true)
    check(itemBaseData, itemSeen, "item", true)
    check(milestoneBaseData, milestoneSeen, "milestone", true)

    for (const layer in REBIRTH_LAYERS) {
        const spec = REBIRTH_LAYERS[layer]
        if (gameData.requirements[spec.gate] === undefined)
            console.error("integrity: layer " + layer + " gate missing: " + spec.gate)
        if (!(spec.countKey in gameData)) console.error("integrity: missing gameData." + spec.countKey)
        if (!(spec.timerKey in gameData)) console.error("integrity: missing gameData." + spec.timerKey)
        if (!(spec.statKey in gameData.stats)) console.error("integrity: missing gameData.stats." + spec.statKey)
    }
}
```

**9.12 — Sigil substitutions in `js/main.js` (10 lines).** Replace each verbatim.

* `getHappiness()`: `if (isChallengeActive("legends_never_die") || isChallengeActive("the_darkest_time")) return 1`
* `getHappiness()`: `if (isChallengeActive("dance_with_the_devil")) return Math.pow(happiness, 0.075)`
* `getHappiness()`: `if (isChallengeActive("an_unhappy_life")) return Math.pow(happiness, 0.5)`
* `getEvilXpGain()`: `if (isChallengeActive("legends_never_die") || isChallengeActive("the_darkest_time")) return 1`
* `getEvilXpGain()`: `if (isChallengeActive("dance_with_the_devil")) {`
* `getEssenceXpGain()`: `if (isChallengeActive("dance_with_the_devil") || isChallengeActive("the_darkest_time")) {`
* `getUnpausedGameSpeed()`: `if (isChallengeActive("time_does_not_fly") || isChallengeActive("the_darkest_time"))`
* `getUnpausedGameSpeed()`: `if (isChallengeActive("legends_never_die"))`
* `getIncome()`: `if (isChallengeActive("the_darkest_time"))`
* `getLifespan()`: `if (isChallengeActive("legends_never_die") || isChallengeActive("the_darkest_time")) return Math.pow(lifespan, 0.72) + 365 * 25`

The `getChallengeBonus("time_does_not_fly")` call inside `getUnpausedGameSpeed` takes an explicit name
and is **not** a substitution site. Do not reorder the `getLifespan` line — it sits above
`if (gameData.rebirthFiveCount > 0) return Infinity`, which is why wearing `legends_never_die` makes an
otherwise-immortal layer-5+ player mortal. That is intended and has an exit (a rebirth revives).

**9.13 — `addMultipliers()`: NO EDIT.** Confirmed: the category `else if` chain does not mention
`"Metaverse Guards"`, so those jobs already carry only the base `Job` multipliers. `"The Margin"`
inherits the identical set for free. Adding a branch would be a balance change.

---

# PART 10 — `js/ui.js`

**10.1 — `Tab` enum.** Add `LEDGER: "ledger",` between `METAVERSE` and `SETTINGS`. The string value
must equal the tab div's id.

**10.2 — `setTab`: null-guard the button.**
Anchor: `const element = document.getElementById(selectedTab + "TabButton")` and the final
`element.classList.add("w3-blue-gray")`.

```js
    const element = document.getElementById(selectedTab + "TabButton")
    ...
    if (element != null) element.classList.add("w3-blue-gray")
```

**10.3 — Replace `changeTab(direction)` in full.** The positional coupling between the `.tab` and
`.tabButton` lists becomes an id lookup, and the unbounded `while` becomes a bounded `for`.

```js
// Keyboard shortcuts + Loadouts ( courtesy of Pseiko )
//
// INVARIANTS:
//   1. The button for a tab is always "#" + <tab div id> + "TabButton". Looked up by id rather than
//      by matching ordinals between getElementsByClassName("tab") and ("tabButton"), so inserting a
//      tab no longer requires touching two lists in lockstep.
//   2. Index 0 of the "tab" list is #info. The `targetTab <= 0` branch hard-codes that stepping left
//      off #jobs lands on Settings rather than on #info, which is a quick-bar panel on wide screens
//      and not a real tab. If #info ever stops being first, fix that branch.
//   3. The CURRENT tab is detected from the tab DIV (only one has display != none), but a
//      CANDIDATE's availability is tested on its BUTTON. That asymmetry is deliberate:
//      requirement-gated tabs gate only the button, never the div. Never put a tab div id into a
//      Requirement's querySelectors.
function changeTab(direction){
    const tabs = Array.prototype.slice.call(document.getElementsByClassName("tab"))

    let currentTab = 0
    for (const i in tabs) {
        if (!tabs[i].style.display.includes("none") && !tabs[i].classList.contains("hidden"))
             currentTab = i*1
    }
    let targetTab = currentTab + direction
    if (targetTab <= 0) {
        setTab(Tab.SETTINGS)
        return
    }
    targetTab = Math.max(0,targetTab)
    if (targetTab > tabs.length - 1) targetTab = 0

    // Bounded. The old `while` clamped targetTab with Math.max(0, ...) on the way down, so a hidden
    // button at index 0 spun forever; only the early return above kept index 0 out of the loop.
    for (let step = 0; step < tabs.length; step++) {
        const button = document.getElementById(tabs[targetTab].id + "TabButton")
        if (button != null && !button.style.display.includes("none") && !button.classList.contains("hidden"))
            break
        if (targetTab <= 0 && direction < 0) {
            setTab(Tab.SETTINGS)
            return
        }
        targetTab = targetTab + direction
        targetTab = Math.max(0, targetTab)
        if (targetTab > tabs.length-1) targetTab = 0
    }

    setTab(tabs[targetTab].id)
}
```

**10.4 — Add `setTabLedger`.** Anchor: after `setTabMetaverse()`. Verbatim copy with Metaverse →
Ledger.

```js
function setTabLedger(tab) {
    const element = document.getElementById(tab + "TabButton")

    const tabs = Array.prototype.slice.call(document.getElementsByClassName("tabLedger"))
    tabs.forEach(function (tab) {
        tab.style.display = "none"
    })
    document.getElementById(tab).style.display = "flex"

    const tabButtons = document.getElementsByClassName("tabButtonLedger")
    for (const tabButton of tabButtons) {
        tabButton.classList.remove("w3-blue-gray")
    }
    element.classList.add("w3-blue-gray")
}
```

**10.5 — `setLayout(id)`: add the Ledger block.**
Anchor: after the metaverse layout block, before `selectElementInGroup("Layout", …)`.

The Ledger participates in WIDE at the **sub-tab level only** — it does not join the
jobs/skills/shop three-column merge. In WIDE every other sub-tab button column is hidden; if the
Ledger did nothing, `#tabcolumnLedger` would be the only one left on screen and `#ledgerPage2` would
be unreachable.

```js
    // ledger layout

    if (id == 0) {
        document.getElementById("tabcolumnLedger").classList.add("hidden")
        document.getElementById("ledgerTab1").appendChild(document.getElementById("ledgerPage2"))
        setTabLedger("ledgerTab1")

        document.getElementById("maincolumnLedger").classList.remove("settings-main-column")
    }
    else {
        document.getElementById("tabcolumnLedger").classList.remove("hidden")
        document.getElementById("ledgerTab2").appendChild(document.getElementById("ledgerPage2"))

        document.getElementById("maincolumnLedger").classList.add("settings-main-column")
    }
```

**10.6 — `initializeUI()`.** Anchor: after `createPerks("perksLayout")`.

```js
    createInscriptions("inscriptionsLayout")
```

**10.7 — `updateUI()`.** Anchor: after the `Tab.METAVERSE` guard.

```js
    if (currentTab == Tab.LEDGER)
        renderLedger()
```

**10.8 — `renderSideBar()`: Etchings block.**
Anchor: after `document.getElementById("hypercubesDisplay").textContent = …`.

Compute the gain **once** into a single local named `etchingGain`, used by both this block and 10.9.

```js
    // formatLog10, never format: format(4.7) renders "4.7" for 50 000 Etchings without complaining.
    const etchingGain = getEtchingGainLog10()
    document.getElementById("etchingsDisplay").textContent = formatLog10(gameData.etchings_log10)
    document.getElementById("etchingsGainNoteDisplay").textContent = formatLog10(etchingGain)
    document.getElementById("etchingsGainButtonDisplay").textContent = "+" + formatLog10(etchingGain)
```

There is **one** `#etchingsDisplay` (sidebar), **one** `#etchingsGainNoteDisplay` (`#rebirthNote9`),
and **one** `#etchingsGainButtonDisplay` (`#rebirthButton6`). No duplicate ids.

**10.9 — `renderSideBar()`: the second visibility mechanism.**
Anchor: after the existing `document.getElementById("rebirthButton5").hidden = …` line.

```js
    // #rebirthButton5 and #rebirthButton6 each have TWO independent visibility mechanisms and show
    // only when both agree:
    //   1. the `hidden` CLASS, owned by renderRequirements() via the "Rebirth button N" requirement
    //   2. the `hidden` DOM PROPERTY, owned by this function, for state a Requirement cannot express
    // If the button will not appear, check both before touching either. This is cosmetic only - the
    // enforcement is REBIRTH_LAYERS[6].payoutGate, because this covers one of three entry points.
    document.getElementById("rebirthButton6").hidden = etchingGain <= LOG_ZERO

    // Read the amulet indicator, mirroring the Transcend one above.
    const ledgerButton = document.getElementById("rebirthButton6").querySelector(".button")
    if (isNextMarginalMilestoneInReach())
        ledgerButton.classList.add("button-transcend")
    else
        ledgerButton.classList.remove("button-transcend")
```

**10.10 — `renderSideBar()`: the un-latch guard.**
Anchor: at the end of the function, beside the existing `Dark Matter info` un-latch.

```js
    // Requirement.isCompleted() latches. The only other place that clears it is rebirthReset()'s
    // loop, which SKIPS anything in permanentUnlocks / metaverseUnlocks. Any currency that can fall
    // back to zero without going through rebirthReset needs its info block un-latched by hand.
    // Etchings are threshold-only today, but layer 7 zeroes them, and this costs one comparison.
    if (gameData.etchings_log10 <= LOG_ZERO)
        gameData.requirements["Etchings info"].completed = false
```

**10.11 — `renderMilestones()`: currency-aware cost cell.** Replace the `.essence` write.

```js
        // Do NOT collapse these onto formatLog10. format(5000) is "5.0k" but
        // formatLog10(Math.log10(5000)) is "4.9k": 10^(log10(x)) is not x for a double, and
        // math.floor() truncates the shortfall downward.
        const isEtchingPriced = getMilestoneCurrency(milestone.name) === MilestoneCurrency.ETCHINGS
        row.querySelector(".essence").textContent = isEtchingPriced ? "" : format(milestone.expense)
        row.querySelector(".etchings").textContent = isEtchingPriced ? formatLog10(milestone.expense_log10) : ""
```

**10.12 — `createRow()`: stamp the milestone cost colour once.**
Anchor: the `if (categoryType == itemCategories) { … }` block; add an `else if`.

```js
    else if (categoryType == milestoneCategories) {
        // The cost cell's colour is fixed by the milestone's currency, so renderMilestones only has
        // to write text at 20 Hz.
        row.getElementsByClassName("cost")[0].classList.add("color-" + getMilestoneCurrency(name))
    }
```

**10.13 — `updateRequiredRows()`: element lookup and hide.**
Anchor: the block of `requiredRow.querySelector(…)` lookups, and the block of
`…classList.add("hiddenTask")` calls.

```js
            const etchingElement = requiredRow.querySelector(".etchings")
```
```js
            // Guarded, deliberately inconsistent with the six unguarded siblings. This block runs
            // for every requiredRow on every frame of four tabs; if the index.html span lands in a
            // different commit from this file, an unguarded null.classList here is an immediate
            // dead page for 100% of players. Do not "clean this up".
            if (etchingElement) etchingElement.classList.add("hiddenTask")
```

**10.14 — `updateRequiredRows()`: the `gameData.taskData` instanceof chain.**
Replace from the `AgeRequirement` branch through the closing brace of the bare `else`.

```js
                } else if (requirementObject instanceof AgeRequirement) {
                    essenceElement.classList.remove("hiddenTask")
                    essenceElement.textContent = "Age " + format(requirements[0].requirement)
                } else if (requirementObject instanceof EtchingRequirement) {
                    if (etchingElement) {
                        etchingElement.classList.remove("hiddenTask")
                        etchingElement.textContent = formatLog10(requirements[0].requirement_log10) + " Etchings"
                    }
                }
                // Explicit, not a catch-all. A Requirement subclass with no `.task` used to land in
                // the old bare `else` and throw on gameData.taskData[undefined].level, at 20 Hz.
                // Anything unrecognised now degrades to a visible "Unknown" instead.
                else if (requirementObject instanceof TaskRequirement) {
                    levelElement.classList.remove("hiddenTask")
                    for (const requirement of requirements) {
                        const task = gameData.taskData[requirement.task]
                        if (task.level >= requirement.requirement) continue
                        finalText += " " + requirement.task + " " + formatLevel(task.level) + "/" + formatLevel(requirement.requirement) + ","
                    }
                    finalText = finalText.substring(0, finalText.length - 1)
                    levelElement.textContent = finalText
                }
                else {
                    levelElement.classList.remove("hiddenTask")
                    levelElement.textContent = "Unknown"
                }
```

**10.15 — `updateRequiredRows()`: the `milestoneData` branch.** Replace the whole branch.

```js
            else if (data == milestoneData) {
                const milestone = milestoneData[nextEntity.name]
                const isEtchingPriced = getMilestoneCurrency(milestone.name) === MilestoneCurrency.ETCHINGS

                if (isEtchingPriced && etchingElement) {
                    etchingElement.classList.remove("hiddenTask")
                    etchingElement.textContent = formatLog10(requirements[0].requirement_log10) + " Etchings"
                } else {
                    essenceElement.classList.remove("hiddenTask")
                    essenceElement.textContent = format(requirements[0].requirement) + " essence"
                }

                if (milestone.baseData.description != null) {
                    effectElement.classList.remove("hiddenTask")
                    const revealed = isEtchingPriced
                        ? gameData.stats.maxEtchingsReachedLog10 >= milestone.expense_log10
                        : gameData.stats.maxEssenceReached > milestone.expense
                    effectValueElement.textContent = revealed ? milestone.baseData.description : "Unknown"
                }
            }
```

**10.16 — `getHeroicRequiredTooltip()`: two edits.** Add an Etching branch after the
`DarkMatterRequirement` branch, change the bare `else {` to
`else if (requirementObject instanceof TaskRequirement) {` (its body is unchanged), and append a
benign final `else`.

```js
    } else if (requirementObject instanceof EtchingRequirement) {
        reqlist += formatLog10((requirements[0].herequirement_log10 == undefined) ? requirements[0].requirement_log10 : requirements[0].herequirement_log10) + " Etchings<br>"
    } else if (requirementObject instanceof TaskRequirement) {
```
```js
    } else {
        reqlist += "Unknown<br>"
    }
```

This runs for every non-hero job and skill on every frame once heroes unlock — the highest-frequency
instance of the trap.

**10.17 — Add `renderLedger()`.** Anchor: after `renderPerks()`, before `renderDarkMatter()`.

```js
function renderLedger() {
    const gain = getEtchingGainLog10()

    document.getElementById("etchingsLedgerDisplay").textContent = formatLog10(gameData.etchings_log10)
    document.getElementById("etchingsLedgerGainDisplay").textContent = formatLog10(gain)
    document.getElementById("etchingsPledgedDisplay").textContent = formatLog10(getPledgedEtchingsLog10())

    // Inscriptions
    const used = getInscriptionCount()
    const pledged = getPledgedInscriptionCount()

    document.getElementById("inscriptionSlotsDisplay").textContent = formatWhole(used, 0) + " / " + formatWhole(pledged, 0)
    document.getElementById("inscriptionSlotCostDisplay").textContent = formatLog10(getInscriptionSlotCostLog10(pledged + 1))

    for (const entry of getInscribableEntries()) {
        // Same source list createInscriptions() built from, so the id always exists - but renderPerks
        // omits this guard and is one renamed key away from a dead session. Do not copy that.
        const button = document.getElementById("insc" + removeSpaces(removeStrangeCharacters(entry.key)))
        if (button == null) continue

        const inscribed = isInscribed(entry.kind, entry.key)
        button.classList.toggle("inscription-bought", inscribed)
        button.classList.toggle("inscription-locked", !inscribed && !canInscribe(entry.kind, entry.key))
        button.getElementsByClassName("inscriptionCost")[0].textContent = inscribed ? "Inscribed" : ("Slot " + formatWhole(used + 1, 0))
    }

    // Sigils
    const challengeKeys = Object.keys(gameData.challenges)
    const inChallenge = gameData.active_challenge != ""
    const worn = countSigils(gameData.sigils)
    const sigilSlots = getSigilSlots()

    document.getElementById("sigilLockedNote").classList.toggle("hidden", !inChallenge)
    document.getElementById("sigilGraceNote").classList.toggle("hidden", !isSigilGraceActive())
    document.getElementById("sigilSlotsDisplay").textContent = formatWhole(worn, 0) + " / " + formatWhole(sigilSlots, 0)
    document.getElementById("sigilWeightDisplay").textContent = format(getSigilWeight(), 2)

    for (let i = 0; i < challengeKeys.length; i++) {
        const key = challengeKeys[i]
        const card = document.getElementById("sigilCard" + (i + 1))
        const button = document.getElementById("sigilButton" + (i + 1))
        const isWorn = isSigilWorn(key)

        // Gate on the challenge's own unlock so a sigil never precedes the challenge it copies.
        card.hidden = !gameData.requirements["Challenge_" + key].isCompleted()
        button.textContent = isWorn ? "Remove sigil" : "Wear sigil"
        button.disabled = inChallenge || (!isWorn && worn >= sigilSlots)
        document.getElementById("sigilValue" + (i + 1)).textContent =
            format(getSigilValue(key), 2) + (isWorn && !isSigilServed(key) ? " (broken)" : "")
    }
}
```

**10.18 — Add `createInscriptions` / `createInscription`.** Anchor: after `createPerk()`.

```js
function createInscriptions(layoutName) {
    const buttonTemplate = document.getElementsByClassName("inscriptionItem")
    const layout = document.getElementById(layoutName)
    if (buttonTemplate.length === 0 || layout == null) return

    for (const entry of getInscribableEntries()) {
        layout.appendChild(createInscription(buttonTemplate, entry))
    }
}

function createInscription(template, entry) {
    const button = template[0].content.firstElementChild.cloneNode(true)
    button.getElementsByClassName("inscriptionName")[0].textContent = entry.label
    // "insc" prefix keeps these out of the "row"+name and "id"+name id namespaces. Entry keys are
    // subject to the same naming rule as task names - see the contract, section 0.5.
    button.id = "insc" + removeSpaces(removeStrangeCharacters(entry.key))
    button.onclick = () => { toggleInscription(entry.kind, entry.key) }

    return button
}
```

**10.19 — `renderSettings()`: layer-6 stats.** Four insertions, each after its layer-5 counterpart.

```js
    if (gameData.rebirthSixCount > 0)
        document.getElementById("statsRebirth6").classList.remove("hidden")
    else
        document.getElementById("statsRebirth6").classList.add("hidden")
```
```js
    document.getElementById("rebirthSixCountDisplay").textContent = gameData.rebirthSixCount
```
```js
    document.getElementById("rebirthSixTimeDisplay").textContent = formatTime(gameData.rebirthSixTime, true)
```
```js
    document.getElementById("rebirthSixFastestDisplay").textContent = formatTime(gameData.stats.fastest6, true)
```

**10.20 — Keybind.** Anchor: the `keydown` listener, after the `if (e.key == "g")` block.

```js
        if (e.key == "r") {
            rebirthSix()
        }
```

`r` is free; the handler bails on ctrl/shift/alt, so it never collides with Ctrl+R.

---

# PART 11 — `js/tooltips.js`

**11.1 — The Margin jobs.** Anchor: after the `"Omega": "ω",` entry.

```js

    // The Margin
    "Errata Prima": "The list of everything the first edition got wrong. It is longer than the edition.",
    "Colophon": "The note at the back that records who set the type, in what face, and on what paper. Someone had to be told.",
    "Blank Leaf": "The page that carries nothing, so the binding has somewhere to end. Being nothing is full-time work.",
    "Dedication": "For you. There was never anyone else it could have been.",
```

**11.2 — Marginal Milestones and the Ledger verbs.** Anchor: after the `"The End"` entry, before the
closing brace.

```js

    // Marginal Milestones
    "Marginal Note": "A hand you do not recognise has written in the margin. It is your hand.",
    "Footnote": "Everything important was always at the bottom of the page.",
    "Marginalia": "The margin is wider than the text now.",
    "Rubrication": "Mark the important parts in red. All of it is important.",
    "Glossator": "You have started explaining the book to itself.",
    "Palimpsest": "Scraped clean and written over, but the old script keeps showing through.",
    "Watermark": "Hold the page to the light and the amulet is there, pressed into the fibre.",
    "Interleaf": "Blank pages bound in between, waiting for something you have not thought of yet.",
    "Emendation": "You correct a line you wrote a hundred lifetimes ago. It was not wrong.",
    "First Draft": "If this is the copy, somewhere there is an original. And an author.",
    "Catchword": "The last word of this page is the first word of the next, forever.",
    "Signature Mark": "The folded sheets are numbered, so the binder knows the order. Someone bound this.",
    "Redaction": "Some of it was struck out before you were given it.",
    "Recto and Verso": "Both faces of the amulet are full. There is only the rim left.",
    "The Wide Margin": "Nothing but margin now, and a number that has nowhere left to go.",

    // Layer 6 - The Ledger
    "Inscribe": "Pledge Etchings and the amulet keeps a permanent record. An inscribed milestone stays unlocked through every reset from here on; an inscribed job or skill has its highest level written back after every reset. Etchings are never spent, only pledged: drop an inscription and the pledge is free again at the next Ledger.",
    "Inscriptions": "The amulet only pays for what it watches you re-earn. Every milestone you inscribe stops counting toward your Etching gain, and it keeps not counting until the next Ledger, even if you erase it first. Permanence is bought with income.",
    "Inscriptions in challenges": "The record is set aside for the length of a challenge, and while you wear the Dance with the Devil or Darkest Time sigil. Inscribed milestones lock again and inscribed levels sit at zero until you stop, then everything comes back untouched. This protects you: those two score you on 10 / (max level + 1), so a remembered max level would make them harder, not easier.",
    "Sigils": "Wear a challenge's penalty for a whole Ledger and the amulet pays you more for it. A sigil only counts if you wore it continuously since your last reading, and one you wore last time pays a third as much. Rotate them.",
```

The `"Inscribe"` / `"Inscriptions"` / `"Sigils"` keys are read by the Ledger page markup's tooltip
spans, not by `createRow`.

---

# PART 12 — `index.html`

**File conventions: TABS for indentation, CRLF line endings.** Do not let an editor convert either.

**12.1 — Load `js/ledger.js`.** Anchor: the script list; insert between `js/milestones.js` and
`js/data.js`.

```html
	<script type="text/javascript" src="js/ledger.js"></script>
```

**12.2 — Ledger tab button.** Anchor: the `#tabcolumn` button list; insert immediately **before**
`#settingsTabButton`. No `hidden` class — `renderRequirements` owns it via the `"Ledger"` requirement.

```html
						<div class="w3-button w3-bar-item tabButton baritem" id="ledgerTabButton" onClick="setTab('ledger')">Ledger</div>
```

**12.3 — Ledger tab div.** Anchor: between the closing `</div>` of the `#metaverse` tab div and the
opening of `<div class="tab column" style="display:none" id="settings">`.

Both sub-panes must exist statically: `setLayout()` runs inside `initializeUI()` and calls
`setTabLedger()`, which throws on a missing element.

```html
<div class="tab column" style="display:none" id="ledger">
	<div id="tabcolumnLedger" class="panel w3-margin-left" style="display: flex">
		<div class="w3-button w3-bar-item tabButtonLedger baritem w3-blue-gray" id="ledgerTab1TabButton" onClick="setTabLedger('ledgerTab1')">Inscribe</div>
		<div class="w3-button w3-bar-item tabButtonLedger baritem" id="ledgerTab2TabButton" onClick="setTabLedger('ledgerTab2')">Sigils</div>
	</div>
	<div id="maincolumnLedger" class="panel w3-margin-left w3-margin-top">
		<div id="ledgerTab1" class="tabLedger">
			<div id="ledgerPage1" class="page panel page-column w3-padding">
				<div class="text-caption"><span class="color-etchings">Etchings: </span><span id="etchingsLedgerDisplay"></span></div>
				<div style="color:gray">Next reading is worth <span class="color-etchings" id="etchingsLedgerGainDisplay"></span> Etchings.</div>
				<div style="color:gray">Pledged: <span class="color-etchings" id="etchingsPledgedDisplay"></span>. Etchings are never spent, only pledged.</div>
				<div style="padding-top:1em">
					<div class="text-caption ledger-title">The amulet only records what it watches you do.</div>
					<div style="color:gray">An inscription survives every reset from here on. But an inscribed milestone stops counting toward your Etching gain, so every permanence you buy taxes the faucet that pays for the next one.</div>
					<div style="color:gray">Inscriptions are suspended inside challenges, and while you wear the Dance with the Devil or Darkest Time sigil.</div>
				</div>
				<div style="padding-top:1em">
					<div class="text-caption">Inscriptions: <span id="inscriptionSlotsDisplay"></span></div>
					<div style="color:gray">The next slot opens at <span class="color-etchings" id="inscriptionSlotCostDisplay"></span> Etchings earned in total.</div>
				</div>
				<div id="inscriptionsLayout" class="perk-grid" style="padding-top:1em">
					<template class="inscriptionItem">
						<button class="perk inscription"><div class="inscriptionName"></div><div style="font-size: smaller;" class="inscriptionCost"></div></button>
					</template>
				</div>
			</div>
		</div>
		<div id="ledgerTab2" class="tabLedger">
			<div id="ledgerPage2" class="page panel page-column w3-padding">
				<div id="sigilPanel">
					<div class="text-caption ledger-title">Sigils</div>
					<div style="color:gray">A worn sigil applies its challenge's penalty for the whole run and raises what the amulet pays you for it.</div>
					<div style="color:gray">A sigil only counts if you have worn it continuously since your last reading. One you wore last time pays a third as much, so rotate them.</div>
					<div style="color:gray">Sigils cannot be changed while a challenge is active.</div>
					<div style="padding-top:1em">
						<div class="text-caption">Worn: <span id="sigilSlotsDisplay"></span></div>
						<div style="color:gray">Etching gain from sigils: +<span class="color-etchings" id="sigilWeightDisplay"></span></div>
						<div id="sigilGraceNote" class="hidden" style="color:gold">You may still change your loadout without losing credit for this reading.</div>
						<div id="sigilLockedNote" class="hidden" style="color:red">Exit your challenge before changing sigils.</div>
					</div>
					<div id="sigilCard1" style="padding-top:2em">
						<div class="text-caption">1. An unhappy life</div>
						<div style="color: gray; padding-bottom: 0.3em">Reduces happiness by ^0.5</div>
						<div style="color: gray; padding-bottom: 0.3em">Etching gain: +<span id="sigilValue1"></span></div>
						<button id="sigilButton1" class="w3-button button" onclick="toggleSigil('an_unhappy_life')">Wear sigil</button>
					</div>
					<div id="sigilCard2" style="padding-top:2em">
						<div class="text-caption">2. The rich and the poor</div>
						<div style="color: gray; padding-bottom: 0.3em">Reduces income by ^0.35</div>
						<div style="color: gray; padding-bottom: 0.3em">Etching gain: +<span id="sigilValue2"></span></div>
						<button id="sigilButton2" class="w3-button button" onclick="toggleSigil('rich_and_the_poor')">Wear sigil</button>
					</div>
					<div id="sigilCard3" style="padding-top:2em">
						<div class="text-caption">3. Time does not fly</div>
						<div style="color: gray; padding-bottom: 0.3em">Reduces time warping by ^0.7</div>
						<div style="color: gray; padding-bottom: 0.3em">Etching gain: +<span id="sigilValue3"></span></div>
						<button id="sigilButton3" class="w3-button button" onclick="toggleSigil('time_does_not_fly')">Wear sigil</button>
					</div>
					<div id="sigilCard4" style="padding-top:2em">
						<div class="text-caption">4. Dance with the devil</div>
						<div style="color: gray; padding-bottom: 0.3em">Happiness ^0.075, and max level reduces XP gain. Suspends your inscriptions.</div>
						<div style="color: gray; padding-bottom: 0.3em">Etching gain: +<span id="sigilValue4"></span></div>
						<button id="sigilButton4" class="w3-button button" onclick="toggleSigil('dance_with_the_devil')">Wear sigil</button>
					</div>
					<div id="sigilCard5" style="padding-top:2em">
						<div class="text-caption">5. Legends never die</div>
						<div style="color: gray; padding-bottom: 0.3em">Lifespan ^0.72 and finite again, time warping ^0.75, happiness does nothing.</div>
						<div style="color: gray; padding-bottom: 0.3em">Etching gain: +<span id="sigilValue5"></span></div>
						<button id="sigilButton5" class="w3-button button" onclick="toggleSigil('legends_never_die')">Wear sigil</button>
					</div>
					<div id="sigilCard6" style="padding-top:2em">
						<div class="text-caption">6. The darkest time</div>
						<div style="color: gray; padding-bottom: 0.3em">All of the above, income is 0, Dark Matter items disabled. Suspends your inscriptions.</div>
						<div style="color: gray; padding-bottom: 0.3em">Etching gain: +<span id="sigilValue6"></span></div>
						<button id="sigilButton6" class="w3-button button" onclick="toggleSigil('the_darkest_time')">Wear sigil</button>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>
```

Sigil card ordinals 1–6 **must** match `Object.keys(gameData.challenges)` order, which is the
convention `renderChallenges` already uses. Getting the order wrong is silent.

**12.4 — Sidebar Etchings block.** Anchor: after the `#hypercubesInfo` block, before
`<div id="rebirthButton1" class="hidden">`. Give it a static `class="hidden"` (unlike
`#hypercubesInfo`, which lacks one and flashes for a frame at boot).

```html
										<div id="etchingsInfo" class="hidden">
											<div class="text-caption"><span class="color-etchings">Etchings: </span><span id="etchingsDisplay"></span></div>
											<div style="color: gray" class="sidebar-element">What the amulet has written down about you</div>
										</div>
```

**12.5 — Sidebar layer-6 button.** Anchor: after the `#rebirthButton5` block, before the closing
`</div>` of `#infoPage`.

```html
										<div id="rebirthButton6" class="hidden">
											<button class="w3-button button" style="margin-bottom: 0.1em; margin-top: 0.8em; width: 100% " onClick="rebirthSix()">Read the amulet: <span class="color-etchings" id="etchingsGainButtonDisplay"></span></button>
										</div>
```

**12.6 — `#rebirthNote9`.** Anchor: the rebirth-note `<ul>`, after the `</li>` closing
`#rebirthNote8`, before `</ul>`.

```html
<li id="rebirthNote9" class="hidden">
	<i class="color-etchings">
		The shivering stops. It does not start again.
	</i>
	<i style="color: grey">
		<br>
		The etching you first noticed on your 45th birthday has spread across both faces of the amulet and around the rim. It is not a symbol. It is a number, and it has no room left to get any longer.
		<br>
		If you <b>read the amulet</b>, everything the eye, the mouth, the tendrils and the Metaverse ever gave you is struck out: essence, evil, evil perks, dark matter, dark orbs, both dark matter shops, hypercubes and every sacrifice at the altar. Your Metaverse perk points and your challenge records are not touched. In exchange the amulet gives you
		<i class="color-etchings">
			<b><span id="etchingsGainNoteDisplay"></span> Etchings</b>,
		</i>
		and for the first time it lets you decide what it keeps.
	</i>
	<br>
	<button class="w3-button button" style="margin-bottom: 0.4em; margin-top: 0.4em " onClick="rebirthSix()">Read the amulet</button>
</li>
```

**12.7 — `requiredRowTemplate`.** Anchor: the `<span class="hypercube color-hypercubes">` inside the
`.value` div; insert immediately after it. **Class token is `etchings`, plural.**

```html
										<span class="etchings color-etchings"></span>
```

**12.8 — `rowMilestoneTemplate` cost cell.** Replace `<td class="essence color-essence"></td>` with:

```html
									<td class="cost"><span class="essence color-essence"></span><span class="etchings color-etchings"></span></td>
```

Nested spans, **not** a bare `<td class="cost">`. Keeping the `.essence` element present means
`renderMilestones` still resolves it if the two files land in different commits.

**12.9 — Keybind help line.** Anchor: after `<div id="key5" …>`, before `#keyChallenge`.

```html
													<div id="key6" class="hidden">r - Read the amulet</div>
```

**12.10 — Layer-6 stats block.** Anchor: after the `#statsRebirth5` block, before `#statsChallenges`.

```html
										<div id="statsRebirth6" class="hidden">
											<ul>
												<li>You have read the amulet <span id="rebirthSixCountDisplay"></span> times.</li>
												<li>You have spent <span id="rebirthSixTimeDisplay"></span> in this reading.</li>
												<li>Your fastest reading is in <span id="rebirthSixFastestDisplay"></span>.</li>
											</ul>
										</div>
```

**12.11 — Version bump.** `<span id="version" …>Version: 3.0.0</span>`, and add a matching
newest-first entry to `changelog.txt`. The changelog entry **must** mention: the Milestones tab now
staying visible through a Collapse/Metaverse, and that exporting a save before downgrading is
mandatory because loading a 3.0.0 save in an older build irreversibly strips Layer 6 state.

---

# PART 13 — `css/styles.css`

**13.1 — `.color-etchings`.** Anchor: the `.color-*` block, after `.color-income`.

```css
.color-etchings {
    color: rgb(184, 115, 51);
}
```

Copper, matching the amulet's description. Contrast measured against the four surfaces the game
paints: light body 3.42, white panel 3.79, dark body 4.30, dark panel 3.58 — the only candidate
tested that clears 3.0 on all four. `css/dark.css` and `css/colorblind.css` contain **zero**
`.color-*` rules, so this single declaration serves all three themes.

**13.2 — Inscription button states and the Ledger section title.** Anchor: after `.perk-locked`,
before the `.color-*` block.

```css
.inscription {
    background-color: rgb(184, 115, 51);
    width: 100%;
}

.inscription:hover {
    background-color: rgb(205, 137, 74);
}

.inscription-bought, .inscription-bought:hover {
    background-color: rgb(110, 66, 27);
}

.inscription-locked, .inscription-locked:hover {
    background-color: #3e3e3e;
}

.ledger-title {
    color: rgb(184, 115, 51);
    border-bottom: 0.1em solid rgb(184, 115, 51);
    padding-bottom: 0.4em;
    margin-bottom: 0.4em;
}
```

`.inscription` reuses the existing `.perk` base rule for sizing, exactly as `.metaperk` and
`.evilperk` do, so only the background needs declaring. `.inscription-locked` deliberately reuses
`.perk-locked`'s `#3e3e3e`.

---

# PART 14 — `test/rebirth-oracle.js`

The oracle covers layers 1–5 only. **Do not add a sixth "original"** — there is none, and inventing
one would test the spec against a copy of itself.

**14.1 — Header comment.** Amend the "Scope" paragraph.

```
    Scope. The five verbatim originals are an oracle for layers 1-5 only; layer 6 has no original to
    diff against and is covered by the assertion suites below instead. The 1-5 oracle diff is also
    the regression guard for the resetMetaverse() extraction - it only holds while that suite runs
    with gameData.inscriptions empty, which is where the extraction is provably identity. Do not add
    a sixth "original".
```

**14.2 — `SOURCES`.** Add `js/challenges.js` and `js/ledger.js`.

```js
const SOURCES = ['js/utils.js', 'js/classes.js', 'js/challenges.js', 'js/ui.js', 'js/data.js', 'js/milestones.js', 'js/ledger.js', 'js/rebirth.js']
```

Both declare only functions and consts at top level, so load position is cosmetic. `doRebirth` now
calls `restoreInscriptions()` and `reconcileInscriptionsAfterLedger()`; without `js/ledger.js` every
trial throws.

**14.3 — `BOOT` exports.** Top-level consts live in the context's lexical scope and never become
sandbox properties, so re-export what the suites need.

```js
    globalThis.exportedTab = Tab
    globalThis.exportedRebirthLayers = REBIRTH_LAYERS
    globalThis.exportedLogZero = LOG_ZERO
    globalThis.exportedLogAdd = logAdd
    globalThis.exportedMetaverseClears = METAVERSE_CLEARS
    globalThis.exportedDarkMatterSkillClears = DARK_MATTER_SKILL_CLEARS
    globalThis.exportedDarkMatterUnlocks = DARK_MATTER_UNLOCKS
    globalThis.exportedSigilAllBits = SIGIL_ALL_BITS
```

**14.4 — Economy stubs in `buildWorld()`.** Add beside the existing five.

```js
    sandbox.getEtchingGainLog10 = () => 4.7
    sandbox.getEssenceGainLog10 = () => 76
    sandbox.getDarkMatterGain = () => 5
    sandbox.setChallengeProgress = () => {}
    sandbox.getHypercubeCap = () => Infinity
    sandbox.getLedgerStartingHypercubes = () => 0
    sandbox.keepsDarkMatterAbilitiesThroughLedger = () => false
```

Function *declarations* do become sandbox properties (unlike `const`/`class`), so plain reassignment
overrides them. 4.7 is the worked first-Ledger figure, so the expected `etchings_log10` is
hand-checkable.

**14.5 — `randomizeWorld(sandbox, seed, inscribe = false)`.** Extend the per-layer loop to 6, add the
new scalars, and gate the inscription state behind the new argument.

```js
    g.etchings_log10 = pick([sandbox.exportedLogZero, 0, 3.2, 4.7, 12.5])
    g.stats.totalEtchingsEarnedLog10 = g.etchings_log10
    g.stats.maxEtchingsReachedLog10 = g.etchings_log10
    g.sigils = Math.floor(rng() * 64)
    g.sigils_broken = Math.floor(rng() * 64)
    g.last_sigils = Math.floor(rng() * 64)
    g.stats.sigilsEverUsed = Math.floor(rng() * 64)

    for (let i = 1; i <= 6; i++) {
        const word = ['One', 'Two', 'Three', 'Four', 'Five', 'Six'][i - 1]
        g['rebirth' + word + 'Count'] = Math.floor(rng() * 50)
        g['rebirth' + word + 'Time'] = rng() * 1e5
        g.stats['fastest' + i] = rng() < 0.3 ? null : rng() * 1e5
    }

    g.inscriptions = { milestones: [], tasks: {}, taxed: [], pledged: 0 }
    if (inscribe) {
        for (const name in g.taskData)
            if (rng() < 0.15) g.inscriptions.tasks[name] = { base: Math.floor(rng() * 5000), hero: Math.floor(rng() * 5000) }
        for (const name of ['Faint Hope', 'Inferno', 'The new gold'])
            if (rng() < 0.5) { g.inscriptions.milestones.push(name); g.inscriptions.taxed.push(name) }
        g.inscriptions.pledged = Object.keys(g.inscriptions.tasks).length + g.inscriptions.milestones.length
    }
```

`inscribe` **must** default to `false`. The layer-1..5 oracle diff is the only proof that the
`resetMetaverse` extraction preserves behaviour, and it only proves it while inscriptions are empty.

**14.6 — Keep `main()`'s oracle loop at `layer <= 5` and `inscribe = false`.** Add two assertions
inside it:

```js
            const before = snapshot(worldB)
            const returned = worldB.doRebirth(layer)
            if (returned !== gateOpen)
                failures.push({ seed, layer, phase: 'gate', problems: [`doRebirth returned ${returned}, gateOpen=${gateOpen}`] })
            if (!gateOpen && diff(before, snapshot(worldB)).length > 0)
                failures.push({ seed, layer, phase: 'gated-noop', problems: diff(before, snapshot(worldB)).slice(0, 5) })
```

**14.7 — Add six assertion suites.** Each takes `(buildWorld, randomizeWorld, seed)` and returns a
list of problem strings, so `main()`'s existing failure reporting is reused unchanged.

**(A) `checkTableIntegrity(world)`** — run once against a pristine world. For every layer in
`REBIRTH_LAYERS`: `gate` exists in `gameData.requirements`; `countKey` and `timerKey` are `in
gameData`; `statKey` is `in gameData.stats`; every `revokes` key exists; and every dotted path in
`preGrantClears`, `clears`, `conditionalClears[].paths`, `METAVERSE_CLEARS` and
`DARK_MATTER_SKILL_CLEARS` resolves (walk all but the last segment requiring a non-null object, then
require the final segment to be `in` it). This mechanically catches the `fastest5` bug class for
every layer, forever, and catches a typo'd clear path that `setGameDataPath` would otherwise create
silently.

**(B) `checkPayoutGate(seed)`** — build a world with the layer-6 gate open, stub
`getEtchingGainLog10` to return `LOG_ZERO`, snapshot, call `doRebirth(6)`. Assert it returned `false`
**and** that the snapshot is byte-identical — in particular `rebirthSixCount` did not move.

**(C) `checkInscriptionContainment(layer, seed)`** — build world A with `inscribe = false` and world B
with `inscribe = true` from the same seed, run `doRebirth(layer)` in both, diff. Every reported
difference must be either `scalars.inscriptions` or `tasks.<name>` for a name in B's
`inscriptions.tasks`; and for those task rows only the `maxLevel` field may differ. Run for layers
1..6. This is the strongest available statement that inscriptions are a per-task-local effect, and is
what keeps the layer-1..5 oracle diff meaningful for players who own inscriptions.

**(D) `checkChallengeSuspension(seed)`** — with `inscribe = true`: call
`enterChallenge('the_darkest_time')` and assert every task `maxLevel` is 0 including inscribed ones,
and that no inscribed milestone key is still `completed`. Then call `exitChallenge()` and assert every
inscribed task's `maxLevel` equals its recorded `base`, every other is 0, and every inscribed
milestone key is `completed` again.

**(E) `checkGrantOrdering(layer, seed)`** — replace the grant-side stubs with recording versions.
For layer 6, `getEtchingGainLog10` records `gameData.hypercubes`, `dark_matter`, `essence`,
`perks_points`, JSON of `challenges`, JSON of `metaverse` and the Cosmic Recollection level; all must
equal the pre-call snapshot. For layer 4 assert essence and evil are already 0 at grant time while
challenges are still pre-wipe; for layer 5 assert essence is still non-zero at grant time. This is the
executable form of the phase-3 constraint — the one bug class this cascade has had every time.

**(F) `checkLayerSixPostState(seed)`** — one explicit expected-value table on a randomized world with
the gate open and a positive gain: `etchings_log10 === logAdd(before, 4.7)`;
`essence/evil/dark_matter/dark_orbs/hypercubes === 0`; `boost_active` false and both boost timers 0;
every `dark_matter_shop` upgradable 0 and `a_miracle` false; the five skill-tree keys 0 iff
`perks.keep_dark_mater_skills == 0`; every `gameData.metaverse` key at its `METAVERSE_CLEARS` value;
**`perks_points` UNCHANGED**; every `gameData.perks` key UNCHANGED; **every `gameData.challenges`
value UNCHANGED**; `rebirthOneCount..FiveCount` UNCHANGED and `rebirthSixCount` +1;
`hypercube_cap_unlocked` UNCHANGED; all six `rebirth*Time === 0`;
`stats.fastest6 === min(before, rebirthSixTime)`; `active_challenge === ''`; `sigils_broken === 0`;
`last_sigils === getServedSigils()` before the call; `stats.sigilsEverUsed === (before | served)`;
every task level/xp 0 and `isHero` false; the three `DARK_MATTER_UNLOCKS` keys false; `'Metaverse'`,
`'Metaverse Perks'`, `'Congratulations'` still true if they were true before.

**(G) `checkLayerFiveSixAgreement(seed)`** — same seed, layer 5 in world A and layer 6 in world B,
both gates open. Assert every path in `METAVERSE_CLEARS` and `DARK_MATTER_SKILL_CLEARS` holds the same
value in both worlds, and that the three `DARK_MATTER_UNLOCKS` keys are false in both. This is what
gives the `resetMetaverse` extraction its point.

**14.8 — Reporting.** Report per-suite counts and reword the PASS line so it does not claim more than
it proves.

```js
    console.log(`rebirth-oracle: ${cases} oracle cases (layers 1-5) + ${assertions} assertions (layers 1-6)`)
    ...
    console.log('PASS - layers 1-5 are behaviour-identical to the original five functions, and layer 6 satisfies its assertion suite')
```

---

# PART 15 — DEFINITION OF DONE

## 15.1 Automated

* `node test/rebirth-oracle.js` exits 0. The layers 1–5 oracle diff must still be **zero
  mismatches** — that is the proof the `resetMetaverse` extraction and the `getEssenceGain` refactor
  did not change shipped behaviour.
* All seven assertion suites (A–G) pass at the default trial count.
* `grep -c 'gameData.active_challenge ==' js/main.js js/classes.js js/dark_matter.js js/metaverse.js`
  prints `0` for all four.
* `grep -rn 'gameData.etchings_log10 *=' js/` shows writes only in `js/ledger.js`
  (`grantEtchings`) and `js/data.js` (the default) and `js/main.js` (the loader repair).

## 15.2 Manual verification, in the browser (`python3 -m http.server 8000`)

Serve over HTTP; `file://` breaks the Changelog tab's `fetch`.

**Fresh-save smoke (catches every naming and markup failure at once):**
1. `localStorage.clear()`, reload. The console must be **clean** and `#mainarea` visible. If the name
   transform is wrong the page is blank, so this check is unmissable.
2. Check the console for any `integrity:` lines from `assertContentTableIntegrity()`. There must be
   none.
3. Arrow-key left and right through every tab. Navigation must not throw and must not skip or land on
   a hidden tab.

**Second-load check (catches a missing `assignMethods` branch — this only breaks on the SECOND
load):**
4. In the console: `gameData.etchings_log10 = 6; update()`. Confirm the Ledger tab button and the
   Etchings sidebar block appear.
5. Reload. Reload **again**. The console must still be clean and the game must still tick.

**Layer-6 flow:**
6. `gameData.essence = 1e300; update()`. Confirm: the Margin job category appears on the Hero tab
   with four rows and a Required row; `#rebirthNote9` appears on the Amulet tab; `#rebirthButton6`
   appears in the sidebar; `#key6` appears in Settings > Shortcuts.
7. Run the **calibration snippet** from §0.6 and record the four values. Adjust the offsets. Confirm
   `getEtchingGainLog10()` is in `[4.0, 5.5]`.
8. Press **Read the amulet**. Confirm: Etchings increase; essence/evil/dark matter/dark orbs/
   hypercubes are 0; `gameData.perks_points` is **unchanged**; `gameData.challenges` is
   **unchanged**; the Milestones tab is still visible; `gameData.stats.fastest6` is set.
9. Press it again immediately. **Nothing must happen** — `doRebirth(6)` returns `false` and
   `rebirthSixCount` does not move. Repeat via the `#rebirthNote9` button and via the `r` keybind;
   all three must be refused.

**Inscriptions:**
10. On the Ledger tab, inscribe one milestone and one task. Rebirth (layer 1). Confirm the milestone
    is still unlocked and the task's `maxLevel` is restored.
11. Enter a challenge. Confirm the inscribed milestone is **locked** and every `maxLevel` is 0. Exit.
    Confirm both come back untouched.
12. Wear the Dance with the Devil sigil outside a challenge. Confirm the inscribed `maxLevel` drops to
    the un-inscribed value (suspension), and comes back when the sigil is removed.
13. Reload. Confirm the inscriptions survive — this is the check that
    `gameData.inscriptions.tasks` is a plain object, not an array.

**Sigils:**
14. Wear two sigils immediately after a Ledger. Confirm the grace note is shown and the Etching gain
    rises. Wait past `SIGIL_GRACE_SECONDS`, drop one, and confirm its contribution goes to zero and
    the card reads "(broken)".
15. Try to enter a challenge with a sigil worn. It must be refused.

**Display and themes:**
16. Cycle all three `settings.numberNotation` values with a Margin row and a Marginal Milestone
    visible. `formatLog10`'s first production use is here; check the tier<3 and
    tier>=formatUnits.length branches.
17. Cycle all three themes. Confirm `.color-etchings` is legible in light, dark and colour-blind, and
    that the Margin / Marginal Milestones header rows are legible (colour-blind reads
    `headerRowTextColors`).
18. Toggle WIDE / narrow layout with the Ledger tab open. Both sub-panes must remain reachable.

**Save integrity:**
19. Settings > Export, then Import the same blob. The game must reload with all layer-6 state intact.
20. Hand-edit the save to set `"inscriptions": null`, reload. The game must boot, warn, and **not**
    overwrite the save with a fresh game.

## 15.3 Release bookkeeping

* `changelog.txt` newest entry first, `version 3.0.0 / DD.MM.YYYY`, including the two behaviour notes
  from §12.11.
* `#version` span bumped to match.
* The calibration values from §15.2 step 7 recorded in the PR description.

---

# PART 16 — EXPLICIT ASSUMPTIONS AND UNVERIFIED CLAIMS

Everything below is stated as an assumption because it was reasoned from code rather than measured on
a real save, or could not be verified in this pass.

1. **The four `ETCHING_*_OFFSET` values are provisional.** The bounding argument for the essence
   chain (≈1e85 ceiling) was derived by reading `Skill.getEffect`, the Faint Hope softcap, the
   `a_gift_from_god` cost guard and the dark-matter skill tree; the resulting first-Ledger figure was
   not measured. §0.6's calibration is a release blocker for exactly this reason.
2. **The sigil weights (0.30 / 0.10) are provisional**, as is `SIGIL_GRACE_SECONDS = 300`. The claim
   that a full loadout is worth wearing depends on the calibrated term magnitudes.
3. **The Marginal cost schedule `10^(3.4 + 0.8n)`** is derived, not measured. The *invariant* (cost
   step > reward step) is not negotiable; the specific 0.8 is.
4. **The Margin `heroxp` values (3600/4050/4500/5040)** are calibrated against the existing Metaverse
   Guards band spacing, not against an observed endgame xp gain. Retune in multiples of 9 only — a
   ±1 change is usually a silent no-op because of the `floor(heroxp / 9)`.
5. **The Margin level thresholds (1000/2500/10000) and herequirements (150000/160000/175000)** are
   patterned on the Metaverse Guards block and adjusted for the steeper bands; validate against a real
   save's Omega level.
6. **Phase 13 running `reconcileInscriptionsAfterLedger()` for every layer, not only layer 6**, is a
   judgement call (§8.7). If playtesting shows the W ratchet should only reset on an actual Ledger,
   guard it with `if (layer === 6)`.
7. **The claim that `format(undefined)` throws** was reported by an adversarial pass that loaded the
   vendored `js/math.js` in a `vm` and called `math.floor(undefined, 1)`. It was not re-verified in
   this pass. The mitigation (`Milestone.expense = NaN`, never `undefined`) is safe either way.
8. **Contrast ratios for `rgb(184, 115, 51)`** were computed, not eyeballed in the browser. Confirm at
   §15.2 step 17.
9. **The claim that `changeTab`'s `while` loop is unbounded** was reasoned, not reproduced. The
   rewrite bounds it regardless.
10. **`makeHero()` restoring a pre-hero floor onto a hero task**: the record is kept per incarnation
    (`base` / `hero`) so this should not arise, but the interaction between an inscribed task and
    heroification has not been played through. Watch step 10 of §15.2.
11. **The offline catch-up cost** of `updateSigilService()` + `updateInscribedTaskRecords()` +
    `getEtchingGainLog10()` at 20 Hz was not measured. `renderSideBar` already calls
    `getEssenceGain()` and `getDarkMatterGain()` twice each, so the added cost is proportionate, but
    a capped offline run replays `update()` ~72,000 times.
12. **`getPreviousTaskInCategory`'s missing per-category `prev` reset** was verified by an earlier
    pass to produce the desired `Errata Prima -> Omega` chain. Not re-verified here. Do not change it.

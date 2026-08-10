# Roadmap: Prestige Layers 6 and 7

Proposal for extending Progress Knight Quest past its current ending. Layer 6 is **The Ledger**
(currency: Etchings), layer 7 is **Authorship** (currency: Axioms). The design is a proposal; the
engineering phases (Phase 0) hold regardless of theme.

Every line number and formula below was verified against `2c6c3c6`. Anything not verifiable by
reading the code is labelled **assumption**.

---

## 1. Where the game currently ends

| Layer | Function | Gate | Grants | Wipes |
|---|---|---|---|---|
| 1 Rebirth | `rebirthOne()` `main.js:718` | age 65 † | max-level xp multipliers | the run |
| 2 Evil rebirth | `rebirthTwo()` `:730` | age 200 † | Evil | + max levels, evil perks (unless God's Blessings) |
| 3 Transcend | `rebirthThree()` `:753` | Cosmic Recollection lvl 1 | Essence | **evil** (set to `evilTranGain()` = 0 unless the metaverse evil-transfer upgrade is owned); evil perk points (unless God's Blessings); max levels rescaled by Cosmic Recollection |
| 4 Collapse | `rebirthFour()` `:783` | 5e10 essence | Dark Matter | essence, evil, evil perk points, max levels; challenges only if neither `challenge_altar` nor `save_challenges` is owned |
| 5 Metaverse | `rebirthFive()` `:818` | 1e60 essence | Metaverse perk points | essence, evil, evil perk points, dark matter, orbs, hypercubes, metaverse shop, both dark matter shops (skill tree kept with `keep_dark_mater_skills`), boost state, max levels; challenges unless `save_challenges` |

† Gates 1 and 2 are **not constants**: `applyEvilPerks()` (`main.js:1401,1405`) overwrites
`requirementsBaseData` in place every tick with `getEyeRequirement()` / `getEvilRequirement()`
(`evilperks.js:14-24`), flooring at age 15 and 25. Gates 3-5 are static.

The ceiling today:

- **"The End"** costs `1e300` essence (`milestones.js:49`), and essence is clamped to `1e308` in
  **five** places — `getEssence()` (`main.js:290`), `getEssenceGain()` (`:368`), `rebirthThree()`
  (`:759`), `applyMilestones()` (`:925`), `applyPerks()` (`:1383`) — plus two sites in
  `evilperks.js` (`:7-10`, `:64`). **Remaining essence headroom: eight orders of magnitude.** Evil
  is capped the same way (`main.js:349`); dark matter, orbs and hypercubes have no explicit clamp
  but hit the same IEEE-754 boundary.
- **Essence is no longer an axis.** With `instant_essence`, `applyPerks()` reassigns
  `gameData.essence = getEssenceGain() * 10` every tick, and the unclamped product is far above
  `1e308` — so essence is pinned at the ceiling, and the milestone table has nothing between
  `1e100`, `1e200` and `1e300`.
- **The layer-5 economy is exhausted.** `getMetaversePerkPointsGain()` returns
  `(floor(log10(essence)) − 89)` × up to 20 (`metaverse.js:166`), so a run at the clamp yields
  20 × (308 − 89) = **4,380**, while every perk in `perks_cost` totals **8,750**. Two clamp-essence
  runs (three from `1e300`) buy the tree. `getHypercubeCap()` (`metaverse.js:295`) returns
  `Infinity` the moment `getTotalPerkPoints()` reaches 1 — counting *spent* points — and nothing
  short of a save wipe lowers it.
- **Post-float content is precedented.** Metaverse Guards (`data.js:189-192`) all have
  `maxXp: Infinity`, so `getMaxXp()` trips `isFinished` at level 0 (`classes.js:35-36`) on the first
  call and the task runs the BigInt path from tick 2. Ten `baseData` entries have `heroxp > 308`,
  including the six Darkness skills (`data.js:242-247`), which do the same once heroic.

Layer 6 therefore cannot be "a bigger number after essence." It needs a verb, and it needs the
numeric guards in §2 before it touches any ceiling.

---

## 2. The number substrate

**Recommendation: logspace doubles for the new currencies**, as a single representation — never a
companion field beside a clamped double.

| Option | Verdict |
|---|---|
| **Logspace double** (`etchings_log10`) | **Chosen.** Multiplicative gain becomes addition; comparisons trivial; JSON unchanged; one helper. New currencies sit at the *top* of the dependency graph — nothing existing reads them — so the log/linear boundary is one-directional. |
| **BigInt** (`Task.xpBigInt`) | **Disqualified.** `JSON.stringify` *throws* on a BigInt, and the serializer in the tree is lossy: `bigIntToExponential` (`utils.js:212`) keeps exactly one mantissa digit via `charAt(0)`, so every 3 s autosave truncates `xpBigInt` to one significant figure (a reload can discard ~50% of partial-level xp). `exponentialToRawNumberString` (`utils.js:225`) also allocates an exponent-length array. Fine for sub-level xp; fatal for a spendable currency. |
| **break_infinity.js** | Rejected. First runtime dependency in a project with none; every formula would need porting. |

**Honest scoping note.** At the §6 numbers the currency stays under `1e16` for ~15 resets, so
logspace is *insurance*, not necessity — the gain formula is naturally computed in log space from
`Math.log10` of existing doubles, so it costs nothing. The real `1e308` problem is elsewhere: the
five essence clamps, the unclamped `getDarkMatterGain()`, and H2 below.

### Hazards that survived adversarial review

| # | Hazard | Mitigation |
|---|---|---|
| **H1** | **Never dual-write essence.** An `essence_log10` companion beside the clamped `gameData.essence` is two fields for one quantity with a lossy copy between them. They diverge permanently once the ceiling rises, and ~50 unmigrated readers keep the stale one: all 44 milestone `EssenceRequirement`s, `getMetaversePerkPointsGain` (`metaverse.js:170`), `getEssenceReward` (`evilperks.js:38`), `getEvilPerksGeneration` (`:7`), `getEvilPerkCost` (`:64`), `isNextMilestoneInReach` (`milestones.js:69`), `stats.maxEssenceReached` (`main.js:1442`), 91 `format()` sites in `ui.js`. | Migrate **in one shot** or not at all, with `getEssence()` as the sole legacy accessor clamping at the boundary — one clamp instead of five. §3 sidesteps it by never reading banked essence. |
| **H2** | **`BigInt(Infinity)` throws `RangeError`, and the throw bricks the save.** Raising the essence ceiling makes `getEssenceXpGain` return `Infinity` to `applyMultipliers` (`main.js:304-310`); Almightiness is on the BigInt path, and `getXpGainBigInt` does `BigInt(Math.ceil(multiplier()))` (`classes.js:74`). `update()` has no `try/catch`, and the loop (`main.js:1572-1589`) sets `ticking = true` with no `try/finally` — one throw latches the loop dead for the page's life while `saveloop` persists the poisoned state every 3 s. | **P0-0.** `try/finally { ticking = false }` plus a catch pausing `saveloop`; clamp `classes.js:71,74` with `Math.min(multiplier(), 1e300)`. The five essence clamps are crash guards, not headroom. |
| **H3** | **`-Infinity` and `NaN` serialize to `null`,** and `replaceSaveDict` only backfills *absent* keys, so a null is never repaired. `Math.pow(10, null)` is 1, so zero displays as 1 Etching. Four hand-written NaN rescues already exist (`main.js:1242-1252`). | Finite sentinel `LOG_ZERO = -1e300`; never store a non-finite in `gameData`; add an `isFinite` guard beside the existing four. |
| **H4** | **Logspace is fail-silent.** `format(etchings_log10)` renders `"4.7"` — a plausible wrong number that ships. BigInt fails loud (`Math.log10(10n)` throws). The `_log10` suffix is the only guard, in a codebase shipping `dark_mater_gain_modifer`. | `formatLog10()` mirrors all three `numberNotation` branches, the 35-entry SI table and the `tier < 3` case (~30 lines). Dev-mode warn in `format()` on suspiciously small values. |
| **H5** | **There is no safe `logSub`.** `a + log10(1 − 10^(b−a))` is `-Infinity` at equality and `NaN` one ulp the wrong way; both serialize to `null` (H3). Every existing currency has a `-=` path, so an implementer will reach for it. | **Design constraint:** every Etching sink is a *threshold on total earned*, never a deduction — mirroring `EssenceRequirement.getCondition` (`classes.js:361`), a bare `>=`, and all 44 milestones. |
| **H6** | **Milestone thresholds are number literals** (`expense: 1e300`) compared by `EssenceRequirement`, and `createMilestoneRequirements()` (`milestones.js:60-66`) hardcodes `new EssenceRequirement`. | See P0-4. |

Attacks that **did not** land, recorded so they are not re-litigated: precision loss is symmetric
with linear doubles (`logAdd(300, log10(1e-3)) === 300` *and* `1e300 + 1e-3 === 1e300`); `softcap()`
ports to one line in log space (`L <= capLog ? L : p*L + (1−p)*capLog`) and cannot overflow there;
and `format()` handles finite doubles to `1.8e308` correctly (`format(1e308)` → `"100.0e306"`, or
`"1.0e308"` scientific). What it does *not* handle is the sentinels a clamped currency produces:
`Math.log10(Infinity)/3|0` and `Math.log10(NaN)/3|0` both collapse to tier 0, so `utils.js:13`
returns the raw strings `"Infinity"` and `"NaN"` to the UI.

```js
const LOG_ZERO = -1e300

function logAdd(aLog, bLog) {            // log10(10^a + 10^b), overflow-safe
    if (aLog <= LOG_ZERO) return bLog
    if (bLog <= LOG_ZERO) return aLog
    const hi = Math.max(aLog, bLog), lo = Math.min(aLog, bLog)
    return hi + Math.log10(1 + Math.pow(10, lo - hi))
}
function logCap(x, cap) { return x <= cap ? x : cap + Math.log10(1 + x - cap) }
function formatLog10(logValue, decimals = 1) { /* mirrors format(), honours numberNotation */ }
```

---

## 3. Layer 6 — The Ledger

**Fiction.** `rebirthNote1` mentions "a strange etching on the centre of the amulet" and never
explains it; layer 4 threatens "no memory of milestones and challenges from any of your past
selves." The Ledger answers both: the amulet has been keeping a record, and it now lets you decide
what survives.

Tab **"Ledger"**, button **"Read the amulet"** (`rebirthSix`), `#rebirthNote9`.

**Unlock.** `new EssenceRequirement(["#rebirthButton6"], [{requirement: 1e300}])` — the "The End"
milestone, the game's own declaration that you beat it — plus `rebirthFiveCount >= 1`. No new gating
concept, no new Requirement subclass for the gate itself.

**Currency: Etchings**, `gameData.etchings_log10`, a plain double holding log10. Top-level scalar,
so the existing `replaceSaveDict(gameData, gameDataSave)` (`main.js:1218`) backfills it for every
save with zero new code. Zero is `LOG_ZERO` (H3). Name it `etchings_log10`, never `etchings`: a
future `gameData.etchings += x` or an `applySpeed()` wrapper corrupts the scale silently (H4).

Formula and costs are in §6. Two things about its *shape* are design decisions, not tuning:

- It **never reads banked essence** — `gameData.essence` is pinned at the clamp for anyone who
  reaches layer 6, so `log10(essence)` carries zero information. It reads the unclamped *gain chain*.
- It has a **no-input-no-payout guard.** After a Ledger all inputs are zero, but a tree bonus is an
  unconditional additive term — without the guard, and with the unlock latched in `permanentUnlocks`,
  the button mints free Etchings on every click.

**Reset scope.** Everything layers 1-5 grant: essence, evil, evil perks and points, dark matter,
orbs, both dark matter shops (including `a_miracle`), hypercubes, `gameData.metaverse` to defaults.
Implemented by extracting `rebirthFive()`'s existing block into `resetMetaverse()` and calling it
from both — a pure extraction, no behaviour change to layer 5. **Perk points and `gameData.perks`
are NOT reset** (§6). Kept: `etchings_log10`, `gameData.inscriptions`, `gameData.sigils`,
`gameData.stats`.

### Primary verb: Inscribe

Spend Etchings to make one thing permanent across every reset from now on, including layer 7 — you
author the game's own `permanentUnlocks` list.

The tension, and why this beats a slot-shopping-list: **the amulet only records what it watches you
do.** An inscribed milestone stops counting toward the `W` term of the gain formula. More permanence
permanently taxes income. Optimal play changes shape three times — inscribe aggressively early
(slots cheap, re-climbs miserable, `W` small), stop and grind mid-layer (each inscription taxes the
faucet), resume late once the Marginal track restores the ceiling. That is a question whose answer
*moves*, which the layer-5 perk tree cannot do.

Inscriptions are **thresholds on total Etchings earned, never deductions** (H5), so `isCompleted()`
latching stays a scalar compare.

**Exactly two inscribable classes**, because there is no single reset funnel (P0-1):

| Class | Hook |
|---|---|
| Milestones | one appended clause at `main.js:980`: `\|\| gameData.inscriptions.milestones.includes(key)`. Curated `INSCRIBABLE` whitelist — exclude "The End", "The End is near", "Time is a flat circle" and every tab-unlock key. |
| Task levels | one extracted `resetTaskLevels({zeroMaxLevel})` carrying an `isInscribedTask(name)` guard, replacing all five hand-copied maxLevel sweeps (`main.js:747`, `:810`, `:883`; `challenges.js:7`, `:20`). |

Inscriptions are **suspended inside challenges**, and the tooltip must say so: `getMaxLevelMultiplier`
returns `10/(maxLevel+1)` for `heroxp >= 1000`, so an inscribed max level makes
`dance_with_the_devil` and `the_darkest_time` *harder*.

### Secondary verb: Sigils

Before a Ledger, equip up to N of the six existing challenge modifiers as run-long penalties. Each
fresh sigil adds to the exponent; one worn on the immediately previous Ledger pays a third as much
(`gameData.last_sigils`, one integer), so rotation is forced and the loadout differs run to run.

~13 lines plus a mechanical substitution: `gameData.sigils` as a top-level bitmask (free migration),
a 3-line `isChallengeActive(name)` in `challenges.js`, and replacing
`gameData.active_challenge == "<literal>"` with `isChallengeActive("<literal>")` across exactly **23
lines** in `main.js`, `classes.js`, `dark_matter.js`, `metaverse.js`. Those four files contain
**zero** `== ""` comparisons, so the substitution provably cannot corrupt the no-challenge-active
branches. `ui.js` and `challenges.js` (scoring, display) stay untouched, so sigils never write
challenge best-scores. At `sigils == 0` it is identity for every existing save.

Refuse to equip sigils while `active_challenge != ""`: `the_darkest_time` plus `rich_and_the_poor`
produces a run with no legal exit.

### New content

- **Marginal Milestones** — a new category in the existing `milestoneBaseData` /
  `milestoneCategories` tables, priced in `etchings_log10`: inscription slots, sigil slots, cost
  reductions, keep-dark-matter-abilities-through-Ledger, start-with-`1e6`-hypercubes, and the layer-7
  unlock. Effects use the cheapest existing idiom (`baseData.effect` plus
  `requirements["Name"].isCompleted() ? X : 1` at the point of use), so nothing new enters
  `setCustomEffects()`. **Excluded from `W`** — decided before the first line of code, or each one is
  a permanent multiplier on income and the layer goes superexponential. Reserve tiers above 99
  ("The End" is tier 99). Four generator/render sites in P0-4.
- **Job category "The Margin"** — four jobs above Omega, `maxXp: Infinity` matching Metaverse
  Guards: *Errata, 1st ed.*, *Colophon*, *Blank Leaf*, *Dedication*. **No new skill category** and
  **no new challenges** (§7).
- **`rebirthNote9`** — the amulet stops shivering, and the etching from your 45th birthday has spread
  across both faces and the rim; it is not a symbol, it is a number, and it has no room left to get
  any longer.

---

## 4. Layer 7 — Authorship

**Fiction.** You stop playing the simulation and start editing it. Tab **"Authorship"**, button
**"Close the eye"** (`rebirthSeven`), `#rebirthNote10`.

**Unlock.** `new EtchingRequirement(["#rebirthButton7"], [{requirement: 8}])` — reusing the subclass
layer 6 added, so layer 7 contributes **zero** new Requirement subclasses and zero new
`assignMethods()` branches. Plus two variety conditions: at least one inscription in **each** class,
and **4 distinct sigils** carried through a completed Ledger (`stats.sigilsEverUsed`, one bitmask).
You cannot brute-force in on one optimal loadout — the gate enforces the thesis rather than
asserting it.

**Currency: Axioms** — `gameData.axioms`, a small non-negative integer modelled on `perks_points`.
Deliberately **no number-system work**; layer 6 solved scale and layer 7 must not re-solve it.

**Reset scope.** Total: everything layer 6 resets, plus `etchings_log10`, `gameData.sigils`,
`gameData.inscriptions`, and the Marginal latches. Kept: `axioms`, purchased axioms, `stats`. The
layer-6 inscription clause at `main.js:980` must be **skipped when `active_challenge != ""`**, or
inscribed requirements stay latched inside challenges and invalidate six sets of best-scores.

**The verb: each Axiom rewrites one RULE, not one number.** No axiom contains a multiplier.

| Axiom | Edit |
|---|---|
| Faster / Longer | raise `baseGameSpeed` (4) or `baseLifespan` (365×70) |
| Born Heroic | `isHeroesUnlocked()` (`main.js:1031`) returns true unconditionally |
| Standing Trials | challenges never reset |
| Not From Scratch | start every life at a chosen job instead of Beggar |
| Unbound | `offline_max_time` (`main.js:1311`) stops being one hour |
| Two at Once | `active_challenge` becomes a set; challenges run concurrently and stack — nearly free, since the sigil substitution already turned every penalty site into `isChallengeActive()` |
| Held Open | inscriptions survive Authorship |

"Held Open" is load-bearing: it makes layer 7's reset scope itself a purchase, retiring the layer-6
economy *into* layer 7 instead of letting it rot the way the layer-5 perk tree did.

"Born Heroic" has two consequences: `makeHeroes()` only re-verifies `TaskRequirement` and
`EssenceRequirement` tasks (`main.js:1059-1072`), so tasks gated by `Age`/`Coin`/`EtchingRequirement`
heroify as soon as the previous-task chain allows; and `rebirthReset()` clears every `isHero` flag
(`main.js:972,975`), which the Axiom must exempt.

This is why **P0-3** must land first: `baseGameSpeed`, `baseLifespan` and `heroIncomeMult` are
`const` at `data.js:139-142`.

**Ending. Testimony** — a Rebirth sub-tab, one line unlocked per Axiom *spent*: the only place in the
game speaking in first person as the amulet, answering what the copper is, why it shivered on
birthdays, and who it was made for. The final line lands on "Lost in the dark" — the one Metaverse
Guards entry that is not a book with a year attached, between *Snow Crash, 1992* and *ω*.

The first button in this game is **"Touch the eye."** The last is its opposite: **"Put it down."** It
writes `stats.putDownDate`, rolls credits on the existing `"Congratulations"` permanent unlock, and
changes no other value — the game keeps running exactly as before. Nothing is withheld from a player
who never presses it.

---

## 5. Phase 0 — foundations

Ordered. P0-0 and P0-5 are prerequisites for everything else.

### P0-0. Stop a throw from bricking the save

`main.js:1572-1589` sets `ticking = true`, calls `update()`, clears it — no `try/finally`. Any throw
latches `ticking` for the page's life while `saveloop` (`:1590`) keeps writing every 3 s. Errors are
already swallowed into the red banner (`onerror`, `:1-7`), which also sets `tempData.hasError`,
making `isAlive()` false for the session (`:1024`). One `try/finally` plus a catch that pauses
`saveloop` converts every future numeric bug from "bricked save" to "recoverable error". Also clamp
`classes.js:71,74` against `BigInt(Infinity)` (H2).

### P0-1. Reset cascade: a documented pipeline, not a pure table

A `REBIRTH_LAYERS` table **does** work — a 9-phase driver plus per-layer rows reproduces all five
layers exactly (verified by deep final-state equality across 20,000 randomized `gameData` states ×
5 layers). But it is **not purely declarative**, and the original P0-1 schema (gate, currency,
cleared paths, conditional paths, `fastestN`) covers ~80% of the fields and 0% of the bugs.
Everything that has caused drift here is *ordering* or an irregular special case. The deliverable is
the phase order with its constraints:

| Phase | Constraint that pins it |
|---|---|
| 1 pre-grant clears | Layer 4 only: `main.js:788-790` zeroes essence/evil *before* `getDarkMatterGain()`. Safe only because its gates are `EssenceRequirement`s short-circuiting on the sticky `completed` flag (`classes.js:285-292`). |
| 2 **grants** | Must precede all clears. `getDarkMatterGain()` reads `getChallengeBonus("the_darkest_time")` (`challenges.js:63`) that `main.js:794-798` is about to wipe; `getMetaversePerkPointsGain()` reads `gameData.essence` that `:824` zeroes one line later. Grants are not uniform: layer 3 does `essence +=` **with a `1e308` clamp** and `evil =` (assignment, destroys accumulated evil). |
| 3 evil perks | Layers 2/3 call `resetEvilPerks()` (God's Blessings + `evil_perks_keep` guards, `:704-716`). **Layers 4/5 do not** — they inline a partial, *unguarded* reset (`:791-792`, `:826-827`) ignoring both guards and never touching `evil_perks.reduce_*`. Almost certainly a bug; the table must freeze it as literal clears. |
| 4 scalar + conditional clears | Must precede `rebirthReset()`: it reads `dark_matter_shop.a_miracle` (`:985`) to re-grant Magic Eye, and hypercubes/evil/essence/dark_matter for the tab-retention test (`:935-942`). |
| 5 challenge wipe | **Two different predicates.** Layer 4 (`:794`) preserved by `challenge_altar` **or** `save_challenges`; layer 5 (`:847`) only by `save_challenges` — and it zeroes `challenge_altar` 31 lines later. |
| 6 revoke permanent unlocks | Layer 5's `Dark Matter` / `Dark Matter Skills` / `Dark Matter Skills2` (`:854-856`) must precede the preserve-loop at `:978-982`, because those three **are** in `permanentUnlocks`. By contrast `requirements["Challenges"].completed = false` (`:798`, `:851`) is **dead code** — "Challenges" is in neither exemption list. |
| 7 `fastestN`, then timers | The stat must read the timer before it is zeroed. Adjacent in the originals; easy to lose across table columns. |
| 8 maxLevel **before** `rebirthReset()` | Layer 3 only: reads pre-reset `task.level`, and **overwrites** maxLevel rather than raising it. |
| 9 maxLevel **after** `rebirthReset()` | Layers 2/4/5: exists solely to undo the level→maxLevel promotion at `:965`. Layer 1 does neither and inherits it. |
| 10 `active_challenge = ""` | Last. `getChallengeBonus`, `getDarkMatterSkillEvil`, `getDarkMatterSkillDarkMater` all branch on it. Layer 1 never clears it at all. |

maxLevel policy is a **pipeline position**, not a value: `keep` (1) / `zero` (2,4,5, after) /
`recall` (3, before). No table field can express "runs on the other side of the `rebirthReset` call";
it is an enum the driver switches on.

**Ship the harness, not just the refactor.** There are no tests, and "verified against saves from
each layer" is a manual ritual that will not be repeated in 3.1.0. A ~250-line dependency-free Node
file keeping the verbatim originals as an oracle and diffing old-vs-new across randomized states is
the only executable specification this cascade will ever have. Freeze the states as golden fixtures
after one release.

**Split the bug decisions out.** Folding a fix into a "no behaviour change" release destroys its one
useful property. File separately: (a) layers 4/5 bypassing the God's Blessings and `evil_perks_keep`
guards, (b) layer 4 honouring Challenge Altar while layer 5 does not, (c) layer 1 never clearing
`active_challenge`. The two dead statements (`:798`, `:851`) can be dropped in the refactor itself.

**Caveat.** ~120 lines of data plus a ~60-line driver replacing ~170 lines of straight-line
assignments is not a large volume win, and at five layers the duplication is legible enough that the
drift argument is speculative. The win is real at seven layers, and only if the phase order is
documented. **If layers 6/7 slip, do not ship this refactor on its own.**

### P0-2. Big-number substrate

`LOG_ZERO`, `logAdd`, `logCap`, `formatLog10` per §2. **Do not convert essence** (H1) — the Ledger
reads the unclamped essence *gain chain*, so nothing in layers 6/7 requires essence past `1e308`.

Also here: clamp `getDarkMatterGain()` (`main.js:371-382`) to `1e308` the way evil and essence
already are (commit `59fbfd8`). It is an unclamped product of ~8 factors including `10^m` from the
hypercube shop and `1e75` from the perk buff; `Math.log10(Infinity)` in the gain formula would make
every sink free forever — permanently, since `Infinity` serializes to `null`.

### P0-3. Accessorize tunable constants

`data.js:139-142` declares four `const`s, read at **16 sites** across four files: `updateSpeed` 8
(`main.js:317, 325, 331, 645, 1315, 1450, 1589`; `metaverse.js:16`), `baseGameSpeed` 5
(`main.js:417`; `challenges.js:34, 55`; `ui.js:126, 127`), `heroIncomeMult` 2
(`classes.js:179, 266`), `baseLifespan` 1 (`main.js:1000`).

Convert the latter three to accessors: **eight edits, no behaviour change.** Leave `updateSpeed`
alone — its sites are tick-rate arithmetic (`setInterval` periods, `applySpeed` divisors), not a
tunable an Axiom should rewrite.

### P0-4. Plumbing traps, by severity

**High — breaks the game**

| Trap | Detail |
|---|---|
| `instanceof` chains in `ui.js` | `updateRequiredRows` (`ui.js:974-991`) and `getHeroicRequiredTooltip` (`:1042-1050`) dispatch on `instanceof Evil/Essence/DarkMatter/Metaverse/Hypercube/AgeRequirement`, then fall through to an `else` doing `gameData.taskData[requirement.task].level`. An `EtchingRequirement` has no `.task` → TypeError → `tempData.hasError` → dead session; both run for every non-hero task once heroes unlock. Add branches to both, plus a `<span class="etching color-etchings">` in `requiredRowTemplate` (`index.html:139-159`) with matching `hiddenTask` toggles (`ui.js:950-966`) — or fold the chain into a `requirement.getRequiredRowText()` base method. |
| Script load order | `requirementsBaseData` is built at top level in `data.js` from classes in `classes.js`. New Requirement subclasses go in **`classes.js`**, not a new `js/ledger.js`. Any new file goes **before** `data.js` in `index.html`'s `<script>` list and must not touch `gameData` at top level. A ReferenceError here is a blank page with no error banner. |
| `assignMethods()` | `EtchingRequirement` needs `this.type = "etching"` **and** a branch at `main.js:1118-1147` (10 branches, 10 subclasses). Unmatched types load prototype-less and `renderRequirements()` calls `isCompleted()` on a plain object every frame. Breaks on the **second** load, not the first. |
| Milestones are essence-hardwired | `createMilestoneRequirements()` (`milestones.js:60-66`) unconditionally builds `new EssenceRequirement`; `rowMilestoneTemplate` hardcodes `<td class="essence color-essence">` (`index.html:126-138`); `renderMilestones` uses `format(milestone.expense)` (`ui.js:516-532`); `updateRequiredRows`'s milestone branch hardcodes `+ " essence"` (`ui.js:1012-1021`); `isNextMilestoneInReach()` (`milestones.js:68-82`) filters on `instanceof EssenceRequirement` and drives the green Transcend button. Four fixes: a `currency` field + generator branch, a generalized cost cell, scope `isNextMilestoneInReach` to essence-priced milestones, reserve tiers > 99. |
| Do **not** reuse `gameData.perks` | `getTotalPerkPoints()` (`metaverse.js:259-266`) iterates every key of it and `getHypercubeCap()` returns `Infinity` once that total ≥ 1 — new keys there silently uncap hypercubes and corrupt layer-4/5 balance. `renderPerks` (`ui.js:637-665`) also does `getElementById("id" + key)` with no null check. Layer 6 gets its own dict, cost map, `<template>`, container and renderer. |
| `getHypercubeCap()`'s sentinel is derived state | `getTotalPerkPoints() >= 1` (`metaverse.js:295`). Any layer resetting perks reverts the cap to `1e7 * 10^(3 × rebirthFiveCount)`, and `update()` hard-truncates hypercubes to it every tick (`main.js:1361`). At `1e7` that is *below* `essenceMultCost` (`1e9`) — a hard progression stop. §3 does not reset perks, but replace the sentinel with a stored `permanentUnlocks` flag anyway; one line today. |
| Names are DOM ids | `getQuerySelector(name)` → `"#row" + removeSpaces(removeStrangeCharacters(name))` (`ui.js:1274`), and `removeStrangeCharacters` strips only apostrophes. A colon, dot, comma or paren makes `querySelectorAll` throw inside `initializeUI()` — the game never boots. Category names become global element ids (`ui.js:838-844`). **Rule: `[A-Za-z0-9 ']` only, unique across jobs + skills + items + milestones + categories + requirement keys.** |
| Names must be Latin-1 | `exportGameData` (`main.js:1475-1485`) is a bare `window.btoa(JSON.stringify(gameData))` and `Task.toJSON()` serializes `baseData.name`. `btoa("Ω axiom")` throws `DOMException` → frozen session, from the Settings tab. Ban Ω/∞/Δ in persisted names; wrap export/import in try/catch. |
| Sidebar wiring | `renderSideBar()` (`ui.js:87-195`) runs at 20 Hz with no null checks on ~25 ids. Each currency needs a markup block (`#etchingsDisplay`, `#etchingsGainDisplay`), an `"Etchings info"` requirement (pattern at `data.js:346-352`), and a `#rebirthButton6` block. `#rebirthButton5` uses **two** visibility mechanisms — the `hidden` class from `renderRequirements` *and* the `hidden` DOM property at `ui.js:154` — and `ui.js:193-194` hand-un-latches `"Dark Matter info"` because `isCompleted()` latches. Skip that and "Etchings: 0" shows forever after an Authorship. |
| `changeTab` index alignment | `ui.js:1408-1431` indexes `getElementsByClassName("tab")` and `("tabButton")` positionally and assumes alignment (11 of each; the first four tab divs nest inside `#hero`, the rest are siblings). Insert `#ledger` at the same ordinal in both and state the invariant in a comment — or fix `changeTab` to use `getElementById(tabs[i].id + "TabButton")`. Commit `6313fc5` shows this function is already fragile. |

**Medium**

- **`metaverseUnlocks` is a second exemption list.** `rebirthReset()` skips un-latching when
  `permanentUnlocks.includes(key) || metaverseUnlocks.includes(key)` (`main.js:978-982`), and that
  loop runs on every rebirth **and** on entering/exiting a challenge (`challenges.js:2,15`). Only
  keys gated on state the reset destroys (task levels, coins, age, a wiped currency) need listing —
  anything else re-latches within one frame via `renderRequirements()` → `isCompleted()`.
- **`rebirthReset()`'s tab whitelist** (`main.js:931-947`) yanks the player to jobs unless the current
  tab is one of seven. Add `Tab.LEDGER` (guarded on `etchings_log10 > LOG_ZERO`) and
  `Tab.AUTHORSHIP`, or every layer-1/2 rebirth throws the player off the new tab.
- **Nested dicts backfill wholesale on first load** — the top-level `replaceSaveDict` copies the
  entire default object in when the key is absent. What does *not* backfill is a key added **inside**
  them later. Add `replaceSaveDict(gameData.inscriptions, …)` and `(gameData.axiom_perks, …)` when
  the dicts are introduced, beside the ten at `main.js:1218-1227`. `gameData.evil_perks` is the
  standing counterexample — the only nested dict without a call, so a new key there is `undefined`
  for every existing save.
- **Content checklist for "The Margin."** CLAUDE.md's six-item list covers jobs *and* skills *and*
  items, not one task's edits. Mandatory in an **existing** category: `jobBaseData`, the
  `jobCategories` array, and `requirementsBaseData` (a missing key throws in `update()` at
  `main.js:1352` **every tick**). A `tooltips` entry is cosmetic but renders the literal string
  `undefined`. A **new category** adds `headerRowColors`, `headerRowTextColors` (`data.js:597`,
  `:622`) and a category-level requirement (`data.js:311-323`) to keep the header hidden.
  `addMultipliers()` is **optional and per-category** — Metaverse Guards has no branch
  (`main.js:53-88`) and runs on class-generic multipliers.
- **Heroes.** Add an `EtchingRequirement` branch to `makeHeroes()` (`main.js:1059-1072`) or
  Etching-gated tasks heroify with zero Etchings. `getPreviousTaskInCategory` (`data.js:647-666`)
  resets `prev` only once, between jobs and skills, so the first task of an appended job category
  inherits **Omega** as its prerequisite hero. `heroxp` is load-bearing in three places —
  `10^heroxp` (`classes.js:33`), `2n ** (BigInt(heroxp)/9n)` (`:42-49`), and the `< 1000` branch of
  `getMaxLevelMultiplier` (`:55-64`) — so pick The Margin's values deliberately.
- **Layout.** `setLayout` (`ui.js:1112-1201`) re-parents pages and hard-codes flex ratios in *both*
  branches; `updateUI` guards renderers with compound `layout == 0` conditions (`ui.js:51-60`). Ledger
  sub-tabs need a fourth copy of `setTabX` plus its own class pair and a boot initializer
  (`main.js:1567-1570`). Decide explicitly whether the Ledger participates in WIDE.

**Low**

- **CSS lives in `styles.css` only** — all nine `.color-*` rules at `:477-503`; `dark.css` and
  `colorblind.css` contain **no** `.color-*` overrides. Add one `.color-etchings` / `.color-axioms`
  readable on both `rgb(243,243,243)` and `rgb(32,32,32)`, plus `headerRowColors` **and**
  `headerRowTextColors` — the latter is the colour-blind theme's only hook (`ui.js:846-868`; a
  missing entry yields `color: undefined`).
- **Keybinds are three places**: the keydown switch (`ui.js:1450-1494`), a `#key6`/`#key7` div
  (`index.html:904-914`), and its own requirement (`data.js:558-564`). Avoid `q/e/t/u/g`, digits 1-6,
  space and arrows. `key5`'s threshold (`1e90`) already disagrees with the button it documents
  (`1e60`) — fix in passing.
- **`onResize`** (`ui.js:1088-1109`) calls `setTab(Tab.HERO)`, absent from the enum
  (`ui.js:1282-1294`) — only `setTab`'s null fallback saves it. Fix to `Tab.JOBS`, and verify each
  new tab across both `onResize` branches × both `setLayout` modes.

### P0-5. Per-layer bookkeeping (first — P0-1 depends on it)

`stats.fastest5` is one instance of a six-array pattern, and it is broken today. `rebirthFive()`
writes it (`main.js:859-860`), `renderSettings()` displays it (`ui.js:789`, span at
`index.html:977`), but it is **absent from the `gameData.stats` defaults** (`data.js:71-85` has
`fastest1`..`fastest4` and `fastestGame`). `loadGameData()` parses the save (`:1203`); the top-level
`replaceSaveDict` (`:1218`) leaves `stats` alone since the key exists in both;
`replaceSaveDict(gameData.stats, gameDataSave.stats)` (`:1223`) then hits its delete loop
(`:1173-1177`) and removes `fastest5`; `gameData = gameDataSave` (`:1228`) keeps the stripped object
and none of the null-guards at `:1230-1272` touch `stats`.

Two visible effects: the stat renders as **"unknown"** after every reload (`formatTime(undefined)`,
`utils.js:116-118` — not blank), and because the write guard is `fastest5 == null` — true for
`undefined` — the first Metaverse run after each reload **overwrites the record unconditionally**
instead of taking the minimum.

Add `fastest5: null` now, then treat the whole pattern as one checklist for layers 6/7:
`rebirthSix/SevenCount` and `Time`; two lines in `increaseRealtime()` (`main.js:641-653`); two more
entries in every layer's zeroing cascade; `fastest6`/`fastest7` defaults; and twelve new ids in the
stats tab (`index.html:943-979`, read by `renderSettings` — a missing one is a null-deref whenever
Settings is open). `rebirthFiveTime` is *already* missing from the null-backfills at `:1258-1272`.
Ideally drive all of it from the P0-1 table.

### P0-6. Performance budget

`getMaxBigIntXp()` is recomputed inside `increaseXp`'s level loop (`classes.js:110`); each call costs
two `getMaxXp()` evaluations, two BigInt conversions and two BigInt exponentiations — for Omega
(`heroxp` 3120), `2n ** 346n` per pass. Obvious first cache, but it is level-dependent via
`2n ** (BigInt(this.level) / 120n)`, so it can only be cached across the 120 levels between exponent
steps, not hoisted out of the loop.

Offline is the bigger cost and does **not** scale with BigInt tasks alone. `calc_offline_progress`
caps at 1 hour = exactly **72,000 ticks** (`main.js:1305-1319`), as 720 batches of 100 via
`setIntervalX(…, 20, times)` — a ~14.4 s wall-clock floor that never adapts. Each tick calls
`updateRequirements()` → `isCompleted()` on **every** requirement, and layers 6/7 add ~60.
`update_times` also writes `#offline_time.textContent` inside the inner loop — 72,000 DOM writes.
Three cheap fixes: hoist that write out, make the batch size adaptive (target ~16 ms/frame), and
skip latched requirements in `updateRequirements()`. The same path fires mid-session on any tick gap
> 10 s.

---

## 6. Balance

### Gain formula

```js
// PRECONDITIONS (§2, P0-2):
//  1. getEssenceGainLog10() sums log10 of getEssenceGain()'s factors WITHOUT the
//     Math.min(_, 1e308) — otherwise the essence term is a constant and carries no information.
//  2. It must EXCLUDE lifeIsValueable (== raw gameData.dark_matter) and essenceMultGain()
//     (== 10^metaverse.essence_gain_modifier). Both are already paid for by tD and tH; leaving
//     them in gives dark matter a true weight of 1.5 and hypercubes 2.75, not 0.5 and 0.25.
//  3. getDarkMatterGain() gets the same 1e308 clamp evil and essence already have.
//  4. getHypercubeCap()'s `getTotalPerkPoints() >= 1` sentinel becomes a stored flag.

function getEtchingGainLog10() {
    if (!gameData.requirements["The End"].isCompleted()) return LOG_ZERO

    const e = getEssenceGainLog10()                          // ~185 at first Ledger
    const d = Math.log10(getDarkMatterGain())                // ~167 maxed
    const h = Math.log10(Math.max(1, gameData.hypercubes))   // ~99 after ~1h
    const p = getTotalPerkPoints()                           // ~30 000 maxed
    if (!isFinite(e) || !isFinite(d) || !isFinite(h)) return LOG_ZERO

    const tE = 0.20 * logCap(Math.max(0, e - 180), 30)       // 0 at 1e180, 6.0 at 1e210
    const tD = 0.10 * logCap(Math.max(0, d - 160), 30)       // 0 at 1e160, 3.0 at 1e190
    const tH = 0.20 * logCap(Math.max(0, h -  95), 30)       // 0 at 1e95,  6.0 at 1e125
    const tP = 0.50 * Math.log10(1 + p / 30000)              // explicit, capped, not laundered

    // No input, no payout. Without this the tree bonus alone mints Etchings on a repeat click:
    // all three max() terms are 0 right after a Ledger and the unlock is latched permanent.
    if (tE + tD + tH <= 0) return LOG_ZERO

    const W = 0.05 * countUninscribedMilestonesCompleted()   // 0..41, EXCLUDES Marginal Milestones
    const S = getSigilWeight()                               // 0.15 fresh / 0.05 repeat, 6 max

    // Flat additive schedule with a hard cap. NEVER a multiplier on essence gain, dark matter
    // gain, or the gamespeed exponent — those close the loop x(n+1) = k*x(n) with k > 1.
    return tE + tD + tH + tP + W + S + Math.min(7.5, getMarginalBonusLog10())
}
```

First Ledger, maxed save: `tE 1.00 + tD 0.70 + tH 0.80 + tP 0.15 + W 2.05 + S 0 = 4.70` →
**~50,000 Etchings**.

Three shape rules, not negotiable during tuning:

- **Cap the hypercube term.** `getHypercubeCap()` is `Infinity` for anyone here, and hypercubes grow
  as roughly `10^(84.5 + 4·log10 t)` — linear in AFK duration with no ceiling. The `logCap` tail is
  what stops idle time from dominating every gameplay input.
- **No gamespeed-exponent node in the Marginal track.** Level-ups are iteration-capped (301 BigInt /
  2501 float per tick, `classes.js:105,130`) so extra gamespeed stops producing levels, but
  `gameData.hypercubes += applySpeed(getHypercubeGeneration())` (`main.js:1360`) is strictly linear
  in it. Pure runaway — and `getLifespan()` returns `Infinity` once `rebirthFiveCount > 0`, so
  nothing bounds run length.
- **Do not reset perk points at layer 6.** `getUnspentPerksDarkmatterGainBuff()`
  (`metaverse.js:289-293`) is worth up to `1e75` of dark matter gain, softcapping around
  `perks_points ≈ 27,037`. Resetting it makes Ledger 2 pay ~37 orders *less* than Ledger 1, and
  re-earning 27k points takes ~7 Metaverse runs at 4,380/run. The buff is already hard-capped by its
  `0.01` power, so preserving it cannot run away; `tP` prices it explicitly instead.

### Cost curves

| Sink | Cost |
|---|---|
| Inscription slot *n* | `10^(0.5n + 3.0)` — slot 1 ≈ 3.2e3, slot 4 = 1e5, slot 10 = 1e8 |
| Marginal Milestone tier *n* (15 tiers) | `10^(3.4 + 0.5n)`, each granting a flat **+0.5** to `gain_log10`, capped at +7.5 total |
| Authorship gate | `etchings_log10 >= 8` |

Slots and tiers compete for the same budget, which is where the choice lives: a first Ledger buys
~3 slots (of ~74 tasks) *or* the first two Marginal tiers, not both.

### Pacing targets

| Milestone | Target |
|---|---|
| First Ledger, from a `1e300`-essence save | a button press — the player is already at max essence with saturated shops. It is the after-credits, not a run. |
| Ledgers 2-5 | one Metaverse-run level rebuild each (~30-60 min) — achievable **only because perk points are preserved**; if they are reset it is ~7× that |
| Marginal track fully bought | ~15 Ledgers (gain runs `10^4.7 → 10^12.2`, cumulative ~`10^12.4` against a ~`10^10.9` track plus slots) |
| First Authorship | ~Ledger 8 |
| Full Axiom set | ~20 Authorships |

**Assumption — validate before shipping.** The offsets `180 / 160 / 95 / 30000` are derived from
reading the code, not measured. Paste
`[getEssenceGainLog10(), Math.log10(getDarkMatterGain()), Math.log10(gameData.hypercubes), getTotalPerkPoints()]`
into the console on three real endgame saves; the dark-matter and hypercube figures swing 40+ orders
depending on how long the save has idled.

Cost the reset honestly, too: wiping the dark matter and dark orb shops is nearly free, because each
is already saturated by its own `!= Infinity` purchase guard (`dark_orb_generator` stops around 150
levels, `a_deal_with_the_chairman` at 101, `a_gift_from_god` at 60, `life_coach` at 29) and
`instant_dark_matter` re-maxes them in seconds. The only expensive parts of a Ledger are rebuilding
max levels and — if it were reset — re-earning perk points.

---

## 7. Risks

- **A throw is a bricked save.** P0-0 — highest severity in the document, cheapest to fix.
- **Save compatibility.** Concentrated in P0-1 and P0-4. Test each release against saves captured at
  layers 1, 3, 4 and 5, plus a pre-2.5.0 save.
- **Display.** `format()` is fine for finite doubles, so the hazard is not overflow — it is
  fail-silence (H4) and the raw strings `"Infinity"` / `"NaN"` reaching the UI from a clamped
  currency. Every new-currency site uses `formatLog10`: sidebar, rebirth notes, tooltips, stats tab,
  milestone cost cells.
- **Offline progress.** Already the slowest path; +60 requirements makes it slower independently of
  task count. P0-6.
- **`isChallengeActive()` substitution.** 23 lines across four files, and it cannot be reviewed by
  playing the game. Ship it **alone, dormant at `sigils == 0`**, where it is provably identity.
- **Scope.** Inscribe is the one genuinely new system; keep it, or layer 6 is just another
  multiplier. Cut in this order: **(1) new challenges** — each needs a key in `gameData.challenges`
  (position matters; `ui.js:444/453/508` index by ordinal), branches in all three of
  `setChallengeProgress` / `getChallengeBonus` (name *and* ordinal) / `getChallengeGoal`, a
  `"Challenge_<name>"` requirement (`data.js:536`), card markup (`index.html:376-424`), current- and
  sidebar-reward spans (`index.html:369-374`, `:167-172` — **mandatory**: `ui.js:508-513`
  `getElementById`s one per challenge key with no null guard and throws if absent), stats rows
  (`index.html:982-987`), hard-coded lines in `renderChallenges` (`ui.js:464-487`) and
  `renderSettings` (`ui.js:801-813`), a keybind case, and the penalty branches. Sigils extract more
  play from the six that already exist at a fraction of that surface. **(2)** A second skill
  category. **(3)** Testimony's later stanzas.

---

## 8. Suggested release sequence

| Version | Contents |
|---|---|
| 2.5.1 | P0-0 (`try/finally` + BigInt clamp), P0-5 (`fastest5`), P0-3 (accessors) — small, independently shippable |
| 2.5.2 | The `isChallengeActive()` substitution **alone**, dormant at `sigils == 0`; soaks the riskiest diff by itself |
| 2.6.0 | P0-1 reset pipeline + the Node harness, no player-visible change. **Skip entirely if 3.0.0 slips.** |
| 3.0.0 | P0-2, P0-4, Ledger core: `etchings_log10`, Inscribe, Sigils, `resetMetaverse()` / `resetTaskLevels()` extractions |
| 3.1.0 | Marginal Milestones + "The Margin" job category |
| 3.2.0 | Authorship, Axioms, Testimony |
| 3.3.0 | "Put it down." and the ending screen |

Estimated total: ~900-1,100 lines across one new JS file (`js/ledger.js`, loaded **before**
`data.js`) and ~250 lines of HTML, with the migration surface held to two new `replaceSaveDict`
calls and one new Requirement subclass.

Each release bumps both `changelog.txt` (newest first, `version X.Y.Z / DD.MM.YYYY`) and the
`#version` span in `index.html`.

# Layer 7 — "Authorship" — Implementation Plan

Decision document. Written against `b9241e3` (`origin/main`, shipped as `3.0.0`). Every anchor below
was re-derived from the current tree; the roadmap's §4 sketch is stale wherever the two disagree, and
the shipped code wins. Claims I could not execute are marked **ASSUMPTION**.

This is not the file-by-file contract. It decides *whether* and *how*; a contract follows.

---

## 1. Verdict

**Build it — but not as the roadmap designs it. The premise degenerates as written, and four of the
seven sketched Axioms are worth literally nothing in the shipped code.**

The thesis is "each Axiom rewrites a rule rather than scaling a number." Checked against the tree,
the sketch's own catalogue fails its own test:

- **Longer** is dead. `getLifespan()` (js/main.js:819-834) computes the lifespan at :827 and then
  returns `Infinity` at :832 whenever `rebirthFiveCount > 0`. No layer clears any `countKey` — the
  driver only increments (js/rebirth.js:262) and `rebirthReset` never touches counters — so every
  layer-7 player discards that arithmetic permanently. The only branch that *reads* it sits above the
  short-circuit, at :830, and fires only under `legends_never_die` / `the_darkest_time` — i.e. the
  Axiom can only sell back the penalty of two sigils the player is *paid* 0.30 log10 each to wear.
- **Standing Trials** is already owned. `gameData.perks.save_challenges` is checked in
  `REBIRTH_LAYERS[4].challengeWipe` and `[5].challengeWipe` (js/rebirth.js:169, 183), and layer 6 has
  no `challengeWipe` at all (js/rebirth.js:223). Layer 7 does not reset `gameData.perks`. The player
  bought this several layers ago.
- **Not From Scratch** is a no-op. `autoPromote()` runs unconditionally every tick (js/main.js:1225,
  defined :656-668) and reassigns `currentJob` to the highest-income *unlocked* job, overwriting
  `rebirthReset`'s `currentJob = taskData["Beggar"]` (js/rebirth.js:373) within one frame. The version
  that would matter — starting at a *locked* job — is what a layer-6 task inscription already does.
- **Faster** is a bare multiplier on `getBaseGameSpeed()`, which contradicts the sketch's own headline
  ("No axiom contains a multiplier"), *and* it buys almost nothing: `Task.increaseXp()` caps level-ups
  per tick and discards the overflow (`iterations > 300` → `excess = -1n`, js/classes.js:126,136;
  `> 2500` → `excess = -1`, :154,161).

That is a catalogue where more than half the entries do nothing observable. Shipping it would produce
exactly the failure the roadmap warns about one layer down: a perk tree with better names, most of
whose rows are inert.

**What fixes it.** An Axiom must be an edit to a *named rule seam that has no numeric parameter*, and
each one must be individually audited against the Etching faucet. The generic escape hatch proposed
during review — "an Axiom is a declared diff against `REBIRTH_LAYERS`" — is **rejected as fatal**:
`REBIRTH_LAYERS[5].grant` is `perks_points += getMetaversePerkPointsGain()` at phase 3, and
`resetMetaverse()` at phase 5 is the *only* thing that zeroes essence (`METAVERSE_CLEARS.essence`,
js/rebirth.js:61). Delete `resetMetaverse: true` from layer 5 and essence stays pinned at `1e308`,
layer 5 has no `payoutGate`, and Rebirth Five becomes worth 4380 perk points *per keypress, forever*.
The same edit on layer 6 makes its `payoutGate` (`getEtchingGainLog10() > LOG_ZERO`, js/rebirth.js:201)
permanently true, turning "Read the amulet" into a free repeatable button. Removing a clear is not a
rule rewrite; it is deleting the price of a grant.

So: **a hand-curated catalogue of seven audited rule edits** (§2), each of which changes how the game
is played and none of which contains a tunable. That is a real layer, and it is a smaller layer than
the sketch implies. Three of the seven are cut candidates if it needs to be smaller still.

### 1.1 Prerequisite ruling: must Layer 6 be calibrated first?

**Yes, before Layer 7's *economy*; no, before Layer 7's *structure*. And the calibration is now a
live-bug fix-forward, not a pre-release gate — it should ship as `3.0.1` regardless of Layer 7.**

The framing in the contract is stale. `docs/layer6-contract.md` §0.6 calls the four `ETCHING_*`
offsets "provisional and release-blocking" — but Layer 6 has already shipped: `origin/main` is at
`b9241e3`, `changelog.txt:1` reads `version 3.0.0 / 10.08.2026`, and `index.html:1040` says
`Version: 3.0.0`. The gate was passed unmet. Players may be holding an unreachable prestige layer
right now.

The failure is asymmetric and total. js/ledger.js:79 returns `LOG_ZERO` when `tE + tD + tH <= 0`;
js/rebirth.js:201 makes that layer 6's `payoutGate`; js/rebirth.js:259-260 returns `false` on a failed
gate. If all three offsets sit above their reachable values, **`doRebirth(6)` returns false forever**
and both Layer 6 and Layer 7 are unreachable content. In the other direction all three terms pin at
`ETCHING_TERM_CAP`, giving `tE + tD + tH = 6.0 + 3.0 + 6.0 = 15.0`, which on a *first* Ledger clears
the top Marginal tier (The Wide Margin, `expense_log10: 15.4`) and any Authorship gate at once. Both
outcomes are decided by a constant nobody has measured, whose predecessor (the roadmap's `180`) was
~95 orders wrong.

Layer 7's structure is calibration-independent: no Layer 7 code path reads any `ETCHING_*` constant,
and the gate reads `gameData.etchings_log10`, which the contract's own §15.2 already blesses setting
by console. Layer 7's *balance* is not: how many Ledgers it takes to reach the Authorship gate sets
Axioms-per-Authorship.

**Ruling:** calibrate as Phase 0 / `3.0.1`, in parallel with Layer 7 design and skeleton work; block
Phase 2 (Axiom content and pricing) on it. Do not block Phase 1.

---

## 2. The Axiom catalogue

Seven Axioms, 14 Axioms of total cost. Every hook is a single existing seam. None contains a number
the player can raise twice.

| # | Name | Rule it rewrites | Exact hook | Cost | Safety verdict |
|---|---|---|---|---|---|
| 1 | **The Same Hand** | Heroification no longer costs you your peak | `makeHero()` — the line `task.maxLevel = 0` (js/main.js:865) becomes `task.maxLevel = Math.max(task.maxLevel, task.level)` | 1 | **Safe, with a caveat.** Bounded: `getMaxLevelMultiplier()` is linear in `maxLevel` against an exponential xp curve. Caveat in §2.1. |
| 2 | **The Long Hour** | The one-hour offline amnesia becomes four | `calc_offline_progress` — `var offline_max_time = 3600 * 1000` (js/main.js:1169) → `getOfflineMaxTimeMs()` | 1 | **Safe.** Hard ceiling 4 h. Not uncapped — see rejects. |
| 3 | **Unlevied** | The amulet stops taxing what it records | `countUninscribedMilestonesCompleted()` — the `if (…taxed.includes(name)) continue` line (js/ledger.js:373) is skipped | 2 | **Safe, provably bounded.** Domain is `ESSENCE_MILESTONE_NAMES` (42 entries × 0.05), so the max effect is restoring W to 2.10 — a value the formula already reaches when nothing is inscribed. Removes a choice-cost; does not raise the ceiling. |
| 4 | **Born Heroic** | Heroes unlock from the milestone track instead of One Above All lvl 2000 | `isHeroesUnlocked()` (js/main.js:858-860) returns true when `requirements["Superb Heroes"].isCompleted()` | 2 | **Safe only in the gated form.** The unconditional form bricks the save — §2.2. Needs a boot assertion. |
| 5 | **Dress Rehearsal** | A challenge round trip stops destroying your max levels | `enterChallenge()` snapshots `maxLevel` before its sweep (js/challenges.js:172-176); `exitChallenge()` restores after its sweep, before `restoreInscriptions()` (js/challenges.js:185-192) | 2 | **Safe.** Best scores stay byte-identical — `maxLevel` is still 0 for the whole challenge; only the post-exit state changes. Must use bare `hasAxiom` — §2.3. |
| 6 | **The Book Reopens** | The Ledger's four `1e300`-essence gates drop to `1e60` | new `applyAxioms()` beside `applyPerks()` (js/main.js:1249) rewrites `requirements[k].requirements[0].requirement` for `"Rebirth button 6"`, `"Rebirth note 9"`, `"Sigils"`, `"key6"`; `getEtchingGainLog10()`'s `requirements["The End"]` gate (js/ledger.js:60) routes through `isLedgerUnlocked()` | 3 | **Safe.** Does not touch the no-input-no-payout guard (js/ledger.js:79), which still demands real progress. Precedented: `applyEvilPerks()` already rewrites sixteen thresholds per tick. |
| 7 | **Nothing Is Unlearned** | Layers 1-6 stop zeroing your max levels | `doRebirth` phase 11 `setAllMaxLevels(0)` (js/rebirth.js:310-311) skipped for `layer < 7`; phase 9's recall (js/rebirth.js:304) becomes `Math.max(task.maxLevel, recalled)` | 3 | **Safe only with a companion fix** to `getMaxLevelMultiplier()` — §2.4. Strongest entry; first cut candidate. |

Costs are **relative value only** and are not calibrated. See §7.

### 2.1 The Same Hand — the caveat nobody costed

`Task.getMaxLevelMultiplier()` (js/classes.js:74-83) uses `1 + maxLevel/10` only when
`heroxp < 1000`; above that it uses `1 + maxLevel/effect`, where `effect` is Cosmic Recollection's
`getEffect()` with `effect == 0 ? 1 : effect` substituted. `rebirthReset` zeroes every task level, so
on the first tick of every fresh life the effect *is* 0, the substitution fires, and the multiplier is
`1 + maxLevel` rather than `1 + maxLevel/10`. Price it against `1 + maxLevel`, and say so in the
tooltip. Exposure is income (the eight `maxXp: Infinity` jobs), not the essence chain — every essence
Skill is `heroxp < 1000` and takes the `/10` branch. **ASSUMPTION:** I read the arithmetic; I did not
run it.

Read through **bare `hasAxiom()`, not a suspension-aware predicate.** Suspending here would *zero*
the peak, which is destructive and irreversible — the opposite of what suspension does for
inscriptions, which merely decline to restore.

### 2.2 Born Heroic — why unconditional bricks the save

`makeHero()` (js/main.js:862-872) is one-way: it zeroes `level`, `maxLevel` and `xp` and sets
`isHero`. Heroic Beggar's level-0 `maxXp` is `10^36 × 50 = 5e37` (`heroxp: 36`, js/data.js:195;
formula js/classes.js:33). Every heroic xp multiplier in `getHeroXpGainMultipliers()`
(js/main.js:120-167) is a latched **essence** milestone, and an Authorship zeroes essence
(`METAVERSE_CLEARS`) while `rebirthReset` un-latches them all (js/rebirth.js:399-408). On a fresh
post-Authorship life the multiplier stack collapses to ~1, Beggar never reaches level 20, the chain
guard at js/main.js:885 blocks every downstream job forever, and no `TaskRequirement` ever completes
again. Coins still accumulate (`getHeroIncomeMult()` = 2.5e18), so the save *looks* healthy.

Gating on `"Superb Heroes"` fixes it and is self-enforcing: at `1e10` essence it is the **maximum**
threshold among the thirteen milestones `getHeroXpGainMultipliers` reads (js/milestones.js:26), so
latching it implies the whole stack — and because it is an essence latch, the Axiom is automatically
inert on a fresh post-Authorship life, which is exactly the state that would brick.

That invariant is load-bearing and invisible: a new heroic-xp milestone added at a *higher* essence
price silently re-opens the brick. Assert it in `assertContentTableIntegrity()` (js/main.js:1432), not
in a comment. Keep the Axiom refundable.

### 2.3 Dress Rehearsal — the bug in the obvious implementation

Routing this through a suspension-aware `hasActiveAxiom()` makes it a **purchased no-op**, and no
post-state assertion would catch it. `enterChallenge()` sets `gameData.active_challenge = challengeName`
at js/challenges.js:167 — deliberately, before the teardown — and `areInscriptionsActive()` ends with
`return gameData.active_challenge == ""` (js/ledger.js:171). So by the time the snapshot would be
taken, the suspension predicate is already false. Use bare `hasAxiom()` for both the snapshot and the
restore. The restore runs in `exitChallenge()` after `active_challenge = ""`, where suspension no
longer applies anyway.

Store the snapshot in `gameData.challenge_maxlevels`, a plain object keyed by task name, default `{}`.
It must **never** be passed to `replaceSaveDict` (the delete loop would erase every entry against the
empty default) and must never be an Array. Clear it after restore; tolerate a missing or garbage
snapshot rather than throwing — this runs inside the tick.

No sigil interaction to reason about: `enterChallenge` refuses to start while any sigil is worn
(js/challenges.js:160) and `canChangeSigils` requires `active_challenge == ""` (js/challenges.js:126-129).

### 2.4 Nothing Is Unlearned — the companion fix it requires

`getMaxLevelMultiplier()` returns `10 / (maxLevel + 1)` under `dance_with_the_devil` or
`the_darkest_time` (js/classes.js:74-77) — an **inverse**. Today `maxLevel` is bounded by one cascade
cycle, because layers 2/4/5/6 zero it at phase 11. This Axiom removes that bound, so `maxLevel`
ratchets indefinitely and a worn `dance_with_the_devil` sigil becomes a total xp shutdown
(at `maxLevel` 50,000 the multiplier is 2e-4). The player's only escape is removing the sigil — which
is the freeze described in §4.1.

**Fix:** floor the inverse, `Math.max(10 / (maxLevel + 1), FLOOR)`. This cannot disturb any challenge
best score: `enterChallenge` forces every `maxLevel` to 0, so inside a challenge the expression is 10
and the floor never binds. It binds only for worn **sigils** outside a challenge, and
`setChallengeProgress()` reads `gameData.active_challenge` directly (js/challenges.js:195-214), so a
sigil provably never writes a score. `FLOOR` is a calibration item — see §7.

Scope the Axiom to layers 1-6 only. Layer 7's own row keeps `maxLevel: "zero"` unconditionally:
rebuilding max levels is the only expensive part of the re-climb, so an Authorship whose max levels
survive is an Authorship with no cost.

---

## 3. Rejected Axioms

The rejects are the more useful half of this document — several were proposed by more than one spec.

| Rejected | Why |
|---|---|
| **Faster** (raise `getBaseGameSpeed`) | A bare multiplier, contradicting the layer's stated thesis, *and* near-worthless: level-ups are iteration-capped and **lossy** (js/classes.js:126,136,154,161), so past saturation extra speed produces nothing on the xp axis. Its one linear consumer, hypercube generation, is log-of-log damped by `tH = 0.20 * capWithLogTail(h - 94, 30)`. Measured coefficient into the faucet: **0.30 log10 Etchings per order of hypercubes** (0.20 via `tH`, plus 0.10 via `tD`, since `darkMatterMultCost = 1e19 · 10^n` / `gain = 10^n` makes the dark-matter multiplier track `log10(H)` 1:1). So ×2 speed = ×1.23 Etchings. The loop does not close, but the coefficient is not zero — record it for anyone tuning a hypercube effect. |
| **Longer** (raise `getBaseLifespan`) | Dead code path for every layer-7 player (§1). Its one live branch sells back a penalty the sigil system pays for. |
| **Standing Trials** (challenges never reset) | Redundant with `gameData.perks.save_challenges`, which layer 7 does not reset. Would also strand against layers 6/7, which have no `challengeWipe` at all. |
| **Not From Scratch** (start at a chosen job) | Overwritten by `autoPromote()` within one frame (§1). The working version is a task inscription. Also a crash vector: an unresolvable stored job name makes `gameData.currentJob` `undefined` and `getIncome()` throws inside `update()`. |
| **Two at Once** (concurrent challenges) | **Two independent exploits.** (a) `getSigilWeight()` → `getServedSigils()` never consults `gameData.active_challenge`, so wearing `the_darkest_time` as a sigil while running it as a challenge changes no penalty site yet still pays 0.30 — ×31.6 Etching gain for nothing at five slots. (b) `getMaxLevelMultiplier()` returns 10 at the `maxLevel` 0 `enterChallenge` forces, so `dance_with_the_devil` run concurrently is a flat **10× xp buff** that writes permanent, monotone best scores into `gameData.challenges` — which feed `getChallengeBonus` → the essence and dark-matter chains → `tE` and `tD`. There is no recompute-scores path anywhere in the tree, so the corruption is irreversible. Cost is also ~31 references across 5 files, and retyping `active_challenge` to an array is a migration `replaceSaveDict` cannot repair. js/challenges.js:12-25 documents that this is precisely what the sigil dormancy rule exists to prevent. |
| **Held Open / Foreword** (inscriptions survive Authorship, as a *purchase*) | **Bootstrap paradox plus a broken promise.** `grant` runs at phase 3 and the inscription wipe would run at phase 5 of the *same* `doRebirth` call, so on the first Authorship the Axiom cannot possibly be owned — the wipe is unconditional and deletes `inscriptions.tasks`, the only copy of each inscribed task's peak levels. It also retracts copy already shipped to players: `index.html:868` ("An inscription survives every reset from here on") and `js/tooltips.js:242`. **Replaced by:** inscriptions survive Layer 7 *unconditionally*, with zero new code (§4.2). That is the roadmap's stated purpose for the Axiom — retiring the layer-6 economy into layer 7 — just free instead of purchased. |
| **Standing Margin** (Marginal latches survive Authorship) | Self-defeating as specified: setting `requirement.completed = true` at the end of `doRebirth(7)` survives only until the next `rebirthReset()`, whose preserve loop (js/rebirth.js:399-408) skips only `permanentUnlocks` / `metaverseUnlocks` / `isInscribedMilestone` — and Marginal names are in none of them and can never be inscribed (`INSCRIBABLE_MILESTONES` is essence-only). So the first Rebirth One after the Authorship deletes a 3-Axiom purchase. And if made to work via a per-tick re-latch, it returns +7.5 log10 gain, 6 free inscription slots, 3 sigil slots, the hypercube seed and Palimpsest — roughly **30% of the entire faucet**, permanently, for free. |
| **Older** (raise the starting age) | Lethal. Post-Authorship, `lifespan` collapses to `getBaseLifespan()` = 25550, so the `legends_never_die` / `the_darkest_time` branch (js/main.js:830) returns `pow(25550, 0.72) + 9125 ≈ 10614` days. A starting age of 365×30 = 10950 > 10614 means the player spawns dead, permanently, in either challenge or under either sigil. Upside is nil anyway: `gameData.days` is read in exactly two places. |
| **Unbroken** (sigils stop breaking) | Deletes the anti-cheese `sigils_broken` exists for (js/challenges.js:31-37): with it, the loadout can be put on one tick before the press and collect the whole S term. Converts a run-long commitment into a click. |
| **Unbound** (uncapped offline) | 24 h uncapped is 1,728,000 `update()` calls. The adaptive 16 ms batcher prevents a freeze but not the linear wall-clock cost, and `isAlive()`'s break never fires because `getLifespan()` is `Infinity`. Shipped in bounded form as **The Long Hour** (4 h). Raising it further needs a reduced-fidelity offline mode, which is its own project. |
| **Soften every softcap** | Definitionally a number, and it is the one number that closes a loop. js/main.js:233 is `softcap(1e308, 10000000, 0.01)` — a **constant expression** whose entire value is the power argument: `log10(result) = 7 + 301p`, so softening `p` by 0.01 is worth 3 orders of essence gain and by 0.49 is worth 147. Six of the ten `softcap()` call sites are `getChallengeBonus` (js/challenges.js:218-233), which feeds the essence chain (`tE`) and the dark-matter chain (`tD`) — i.e. it would soften the faucet that pays for softening it. |
| **Axiom-as-diff-against-`REBIRTH_LAYERS`** (generic mechanism) | Fatal (§1). If any part of it is ever revisited, `clears` / `preGrantClears` / `resetMetaverse` / `challengeWipe` must be outside whatever an Axiom may edit, and any layer whose clears become editable must gain a `payoutGate`. |

---

## 4. Currency and reset scope

### 4.1 Currency

**`gameData.axioms`** — plain non-negative integer, unspent balance. **`gameData.axioms_owned`** —
bitmask over a frozen `AXIOM_BITS`. Both **top-level scalars**, backfilled for free by
`replaceSaveDict(gameData, gameDataSave)` (js/main.js:1054).

**Not a nested dict.** Three specs proposed three different dict names (`axiom_edits`, `axiom_rules`,
`axiom_perks`) and each claimed sole ownership of `js/authorship.js`. A nested dict needs its own
`replaceSaveDict` call *and* the null/primitive shape guard the shipped `inscriptions` call carries
(js/main.js:1065-1070 — `key in saveDict` throws on `null` and on primitives, and a throw there lands
in the catch that leaves `gameData` as pristine defaults) *and* a normalizer. A bitmask needs none of
that; js/data.js:49-56 already makes this argument for the sigil masks.

**Never keys inside `gameData.perks`.** `getTotalPerkPoints()` (js/metaverse.js:259-266) sums
`getPerkCost(key)` over every key at 1; an unknown key returns `undefined` and the total becomes
`NaN`. That `NaN` reaches `getEtchingGainLog10()`'s `p` and trips its `!isFinite(p)` bail
(js/ledger.js:69) — every future Ledger silently pays nothing. `collectPerkPoints()`
(js/metaverse.js:268-274) would additionally call `buyPerk()` on it, making `perks_points` `NaN`
permanently.

**Gain.**

```js
const AXIOM_BASE_LOG10 = milestoneBaseData["First Draft"].expense_log10   // 11.4, by reference
const AXIOM_STEP_LOG10 = 1.5
const AXIOM_GAIN_CAP   = 5

function getProjectedEtchingsLog10() {   // banked + the Ledger not yet pressed
    const banked  = (typeof gameData.etchings_log10 === "number") ? gameData.etchings_log10 : LOG_ZERO
    const pending = getEtchingGainLog10()
    return Number.isFinite(pending) ? logAdd(banked, pending) : banked
}

function getAxiomGain() {
    if (!isAuthorshipUnlockedByMilestone()) return 0
    const projected = getProjectedEtchingsLog10()
    if (!Number.isFinite(projected) || projected < AXIOM_BASE_LOG10) return 0
    return Math.min(AXIOM_GAIN_CAP, 1 + Math.floor((projected - AXIOM_BASE_LOG10) / AXIOM_STEP_LOG10))
}
```

Three properties are design, not tuning:

- **`AXIOM_BASE_LOG10` is read from `milestoneBaseData`, never duplicated.** `js/milestones.js` loads
  before `js/data.js` (index.html:1130, :1132), so the constant is in scope. This is what makes the
  gate follow the `ETCHING_*` recalibration automatically. `AXIOM_STEP_LOG10` does *not* follow — it
  is calibrated against the *spread* of the Marginal track (11.4 to 15.4); if the 0.8 cost step moves,
  re-derive it as `(topTier − firstDraft) / 2`.
- **The projection, not the bare balance.** `getEtchingGainLog10()` is unaffected by `grantEtchings()`,
  so without projecting, "press Read the amulet, then press Close the eye" beats "press Close the eye"
  by up to a full Axiom step and the game never says so.
- **`AXIOM_GAIN_CAP` is a correctness constraint, not a balance knob.** It is what makes the gain
  bounded per run and linear in Authorship count, which is why Axioms need no `_log10` treatment. If
  any future Axiom multiplies Etching gain directly, the cap stops being sufficient and the layer
  needs re-deriving. **The rule to put in `js/authorship.js`: an Axiom may add a bounded constant to
  `getEtchingGainLog10()` and may never multiply it, and may never touch `grantEtchings()`'s `logAdd`.**

Supply table: 11.4 → 1, 12.9 → 2, 14.4 → 3, 15.4 → 3, 15.9 → 4, 17.4+ → 5. A player who finishes the
Marginal track before their first press gets 3; pressing the instant the gate latches gets 1, never 0.

### 4.2 Reset scope — `REBIRTH_LAYERS[7]`

```
gate               "Rebirth button 7"                    EtchingRequirement @ AXIOM_BASE_LOG10
payoutGate         () => isAuthorshipReady()
countKey           "rebirthSevenCount"
statKey            "fastest7"
timerKey           "rebirthSevenTime"
timersCleared      all SEVEN, including rebirthSixTime
grant  (phase 3)   grantAxioms(getAxiomGain())
evilPerks          "inline"                              matches layers 4/5/6; inherits the frozen bug
clears (phase 5)   etchings_log10 -> LOG_ZERO
                   sigils -> 0, sigils_broken -> 0, last_sigils -> 0
resetMetaverse     true
challengeWipe      ABSENT                                deliberate, matching layer 6
revokes            DARK_MATTER_UNLOCKS
maxLevel           "zero"                                position 11, same reason as layer 6
clearActiveChallenge  true
reconcileInscriptions true                               NEW table field, also set on layer 6
```

**No inscription wipe.** `gameData.inscriptions` is untouched (§3, Held Open). This costs zero code:
`rebirthReset`'s preserve loop already exempts `isInscribedMilestone(key)` (js/rebirth.js:405-406) and
phase 13 already calls `restoreInscriptions()` (js/rebirth.js:316).

**`timersCleared` must include `rebirthSixTime`.** `isSigilGraceActive()` is
`rebirthSixCount == 0 || rebirthSixTime <= 300` (js/challenges.js:100-102). Layer 7 keeps
`rebirthSixCount`, so leaving the timer set closes the grace window from the first tick,
`updateSigilService()` ORs all six bits into `sigils_broken` (js/challenges.js:110), `getServedSigils()`
returns 0 for the entire cycle, and **the first Ledger after every Authorship pays S = 0 whatever the
player wears** — invisibly, since the UI still shows the sigils as worn.

**Clearing the sigil masks is load-bearing twice.** See §5.1. It must happen at phase 5, before
`rebirthReset()`, because `rebirthReset`'s preserve loop reaches `gameData.sigils` transitively via
`isInscribedMilestone` → `areInscriptionsActive` → `isChallengeActive`.

**`last_sigils` must be cleared too**, or `getSigilValue()` (js/challenges.js:113-115) prices the whole
first post-Authorship loadout at `SIGIL_WEIGHT_REPEAT` (0.10) instead of 0.30 — a silent 3× cut to S
for one cycle.

**`resetMetaverse(7)` is correct unchanged.** Both of its layer-6 special cases —
`keepsDarkMatterAbilitiesThroughLedger()` and `getLedgerStartingHypercubes()` — are guarded by
`layer === 6` (js/rebirth.js:102, :109), and both come from Marginal Milestones the Authorship is
revoking. **Do not widen those guards to `>= 6`.**

**Kept, deliberately:** `perks_points` and the whole `perks` dict, `gameData.challenges`,
`hypercube_cap_unlocked`, every `rebirthNCount`, all of `gameData.stats`. This is layer 6's row
comment (js/rebirth.js:189-195) applied transitively — each of those multiplies the essence and
dark-matter chains that `getEtchingGainLog10()` reads, so wiping them makes each Authorship pay less
than the one before. Keeping every `rebirthNCount` is a hard requirement, not a preference:
`getHypercubeCap()` reads `rebirthFiveCount` (js/metaverse.js:303) and `isSigilGraceActive()` reads
`rebirthSixCount`.

`gameData.stats.maxEtchingsReachedLog10` must **not** be reset — it is the description-reveal key, so
resetting it would flip every Marginal Milestone's description back to the literal string "Unknown"
for content the player has already read.

**Gate predicate.**

```js
function isAuthorshipReady() {
    if (!isAuthorshipUnlockedByMilestone()) return false            // first and only call site
    if (countSigils(gameData.stats.sigilsEverUsed) < 4) return false
    if (getInscribedMilestoneCount() < 1) return false              // raw membership, not suspension-aware
    if (getInscribedTaskCount() < 1) return false
    return getAxiomGain() >= 1
}
```

`isAuthorshipUnlockedByMilestone()` (js/milestones.js:236, zero call sites today) finally gets used.
The roadmap's `etchings_log10 >= 8` is stale — First Draft costs 11.4. The variety conditions live in
`payoutGate` rather than in a Requirement because neither is expressible as a threshold, which is what
keeps the promise of **zero new Requirement subclasses and zero new `assignMethods()` branches**. Note
the inscription counts are the *raw* accessors (js/ledger.js:174-175), not the suspension-aware ones,
so a worn sigil cannot deadlock the gate.

A refused Authorship is silent (`doRebirth` just returns `false`) and layer 7's wipe is the largest in
the game, so the Authorship tab must render `isAuthorshipReady()`'s clauses **individually**, not as
one boolean. Give the UI a sibling function returning per-clause status.

---

## 5. Layer 6 interaction rules — where this layer is most dangerous

Every rule here is derived from a landed attack. Treat this section as mandatory.

### 5.1 Sigils — clear the masks, and fix `toggleSigil` regardless

`getSigilSlots()` (js/challenges.js:82-85) is `SIGIL_BASE_SLOTS (2) + getMarginalSigilSlotBonus()`, and
that bonus counts Footnote / Watermark / Catchword — all three revoked by an Authorship. Slots go
**5 → 2** on the frame after the press.

`toggleSigil` (js/challenges.js:137-138) computes `next` for both directions and then applies one
**symmetric** test: `if (countSigils(next) > getSigilSlots()) return false`. At 5 worn / 2 slots a
removal yields 4 bits, `4 > 2`, refused. **Every toggle is refused in both directions.** The UI does
not reveal it — `renderLedger` disables the button only on `!isWorn && worn >= sigilSlots`, so the
Remove control is enabled and simply does nothing.

If the frozen loadout includes `the_darkest_time`: income 0, happiness 1, gamespeed `pow(s, 0.7)`,
the player becomes mortal again (js/main.js:830 sits *above* the `Infinity` return), `maxLevel`
inverted, and every dark-matter ability returns 1. Both escapes are closed simultaneously —
`enterChallenge` early-returns on `gameData.sigils != 0`, and `canInscribe` returns false because
`areInscriptionsActive()` is false.

This state is unreachable today (nothing lowers `getSigilSlots()`). **Layer 7 creates it.**

**Two fixes, ship both:**

1. `REBIRTH_LAYERS[7].clears` includes `sigils`, `sigils_broken`, `last_sigils` at phase 5.
2. Make the slot test apply to **additions only**:
   `const isRemoval = (gameData.sigils & bit) != 0; … if (!isRemoval && countSigils(next) > getSigilSlots()) return false`.
   One comparison against a permanently stuck run; correct regardless of Layer 7, and reachable from a
   hand-edited save today.

### 5.2 The Ledger tab must survive its own currency being zeroed

`"Ledger"` is an `EtchingRequirement` at `requirement_log10: 0` (js/data.js:627) and is **not** in
`permanentUnlocks` (js/data.js:190). Layer 7 sets `etchings_log10 = LOG_ZERO`, so
`EtchingRequirement.getCondition` (js/classes.js:471-477) returns false and `rebirthReset`'s loop drops
the latch. `#inscriptionsLayout` and `#sigilPanel` both live inside `<div id="ledger">`, so the player
can neither see nor manage the inscriptions that survived. Worse for sigils: `"Sigils"` **is** in
`permanentUnlocks`, so `canChangeSigils()` keeps returning true — the game believes the loadout is
editable while the only control is inside a hidden tab.

**Add `"Ledger"` to `permanentUnlocks`.** This is the identical bug the Layer 6 author already fixed
for `"Milestones"` and `"Sigils"`, with the reasoning written at js/data.js:187-189.

**Do not add** `"Marginal Milestones"`, the 15 Marginal keys, or `"Etchings info"`. The Marginal track
is *supposed* to revoke (js/milestones.js:186-188 says so explicitly, and that comment names Layer 7
as the reason), and `"Etchings info"` is already hand-un-latched in `renderSideBar`
(js/ui.js:222-226, whose comment already anticipates layer 7).

`"Authorship"` and `"Axioms info"` **do** go in `permanentUnlocks`, gated by `EtchingRequirement` at
`AXIOM_BASE_LOG10`: they latch once and never fall, so the tab that spends the Axioms the run just
paid for does not vanish at the moment of payment. `"Rebirth button 7"`, `"Rebirth note 10"` and
`"key7"` use the same threshold and stay **out** of `permanentUnlocks` — they should re-lock.

### 5.3 The Marginal track revokes for free — if and only if ordering holds

`rebirthReset` un-latches all 15 at phase 10; the next `isCompleted()` call is the following tick's
`updateRequirements()`. If `etchings_log10` is still positive at that point, all 15 **re-latch** and
the player permanently keeps +7.5 log10 gain, 6 inscription slots, 3 sigil slots, the 1e12 hypercube
seed and Palimpsest — nothing else ever clears them.

`etchings_log10` must therefore be zeroed at **phase 5**, before `rebirthReset()`. This is invisible
to any test that does not read requirement latches after the call.

### 5.4 `reconcileInscriptionsAfterLedger` — run it, via a table field

Replace `if (layer === 6)` (js/rebirth.js:324) with `if (spec.reconcileInscriptions)`, set on layers 6
and 7, and rewrite the comment to state the property that excludes a layer rather than naming one.

The exploit the layer-6 guard defends against — un-inscribe everything (leaving `taxed` intact),
press a cheap Rebirth, both ratchets clear while essence survives to re-latch every milestone — is
defeated by layer 7 on every clause: it zeroes essence *and* `etchings_log10`, and
`getEtchingGainLog10()` early-returns `LOG_ZERO` until "The End" is re-earned.

**Not running it is the dangerous choice.** `getPledgedInscriptionCount()` is
`max(pledged, count, marginalBonus)` (js/ledger.js:194-199), `uninscribe()` never lowers `pledged`, and
`canInscribe` short-circuits on `getInscriptionCount() < getPledgedInscriptionCount()`
(js/ledger.js:257). Leave `pledged` as a stale high-water at a `LOG_ZERO` balance and the player gets
free re-targeting of every historic slot, forever.

**Do not** instead try to *release* the ratchet by setting `pledged = 0`. That was proposed and it does
not survive a page load: `normalizeInscriptions()` unconditionally executes
`inscriptions.pledged = getInscriptionCount()` on every load (js/ledger.js:428, called from
js/main.js:1155). Any assertion about `pledged` must be run through a serialize / `normalizeInscriptions`
round trip or the harness cannot see this class of bug at all.

Post-Authorship the ladder re-prices upward (Rubrication and Redaction revoke, worth −1.0 log10
combined; granted slots revert to full price), so a player with 12 inscriptions carries a standing
pledge near `10^9.1` before slot 13 — comfortably below the `10^11.4` Authorship gate, so it can never
strand. Un-inscribing becomes destructive until the balance recovers: **the UI needs a warning line on
the uninscribe control once `rebirthSevenCount > 0`.**

### 5.5 A live Layer 6 defect this layer inherits and amplifies

Pressing "Read the amulet" while wearing `dance_with_the_devil` or `the_darkest_time` **silently voids
every inscribed milestone latch for a whole cycle, today.** `commitSigils()` deliberately does not
clear the loadout (js/challenges.js:147-153), so at phase 10 `rebirthReset`'s preserve loop asks
`isInscribedMilestone(key)` → `areInscriptionsActive()` → `isChallengeActive("the_darkest_time")` →
reads `gameData.sigils` → true → suspended → `requirement.completed = false` for every inscribed
milestone. Phase 13's `restoreInscriptions()` is a no-op for the same predicate. And
`restoreInscriptions()` has exactly three call sites — js/ledger.js:277, js/rebirth.js:316,
js/challenges.js:192 — none per-tick, so removing the sigil afterwards restores nothing. The player
paid a full Ledger's income for permanence that evaporated, with no error.

**Fix:** call `restoreInscriptions()` once per tick in `update()`, beside
`updateInscribedTaskRecords()` (js/main.js:1244-1245). Both halves are idempotent, both no-op while
suspended, and both are bounded by the inscription count rather than the ~150 tasks. This is what makes
`js/tooltips.js:244`'s "then everything comes back untouched" true.

Ship it in Phase 0. Layer 7's own phase-5 sigil clear protects layer 7's teardown but does nothing for
layer 6's, and after an Authorship the re-latch window stretches across an entire book.

### 5.6 "The Margin" needs no Layer 7 work

The roadmap calls it Etching-gated. It is not: both the category header (js/data.js:377) and Errata
Prima are `EssenceRequirement` at `1e300`. Zeroing essence hides it and re-climbing restores it,
exactly as it already behaves on every Ledger. Its four jobs *are* inscribable
(`getInscribableEntries` iterates all of `jobCategories`), so an inscribed one keeps its `maxLevel`
through an Authorship.

---

## 6. Mechanical footprint

Layer 7 inherits Layer 6's entire substrate. Realistic size: **~800–1,000 lines**, against Layer 6's
~2,194 non-doc lines (`b9241e3` is 6,938 insertions, of which 3,705 are docs and 932 the oracle).

**Zero** new number systems. **Zero** new `Requirement` subclasses. **Zero** new `assignMethods()`
branches (`etching` is already dispatched at js/main.js:970). **Zero** `changeTab` work — it now
resolves buttons by `tabs[i].id + "TabButton"` (js/ui.js:1610-1642), retiring the ordinal-alignment
trap the roadmap flagged.

### New save state

| Field | Default | Note |
|---|---|---|
| `gameData.axioms` | `0` | Top-level scalar. Free migration. |
| `gameData.axioms_owned` | `0` | Top-level bitmask over `AXIOM_BITS`. Free migration. |
| `gameData.rebirthSevenCount` | `0` | |
| `gameData.rebirthSevenTime` | `0` | Must be incremented in `increaseRealtime()` (js/main.js:728) **and** NaN-repaired in `loadGameData()`. |
| `gameData.challenge_maxlevels` | `{}` | Dress Rehearsal snapshot. **Never** pass to `replaceSaveDict`; never an Array. Normalize instead. |
| `gameData.stats.fastest7` | `null` | **Mandatory.** `doRebirth`'s guard is `== null`, true for `undefined`, so a missing default makes "fastest" mean "most recent" forever — the shipped `fastest5` bug. |
| `gameData.stats.totalAxiomsEarned` | `0` | Display only. One name, decided here; three specs proposed three. |
| `gameData.stats.putDownDate` | `null` | Phase 3. A number (ms), never a `Date`. |

Every key written into `gameData.stats` must appear in the `js/data.js` defaults literal in the **same
commit** — `replaceSaveDict(gameData.stats, …)` deletes undeclared keys on every load.

### Files

| File | Work |
|---|---|
| `js/authorship.js` | **NEW.** Sole owner of `AXIOM_BITS`, `AXIOM_COST`, `AXIOM_NAMES`, `AXIOM_REVERSIBLE`, `AXIOM_BASE_LOG10`, `AXIOM_STEP_LOG10`, `AXIOM_GAIN_CAP`, `hasAxiom`, `canBuyAxiom`, `buyAxiom`, `unbuyAxiom`, `getSpentAxioms`, `getTotalAxioms`, `normalizeAxioms`, `getProjectedEtchingsLog10`, `getAxiomGain`, `grantAxioms`, `isAuthorshipReady`, and one effect accessor per Axiom. **Load between `js/ledger.js` and `js/data.js`** (index.html:1131-1132) — `js/data.js` reads `AXIOM_BASE_LOG10` at top level, and `js/milestones.js` is already before both. Declares only consts and functions; touches no DOM and no `gameData` at load time. |
| `index.html` | Script tag; `#authorshipTabButton` after `#ledgerTabButton`; `#authorship` tab div (two sub-tabs, cloned from the `#ledger` block); `#axiomsInfo` sidebar block; `#rebirthButton7`; `#rebirthNote10`; `#statsRebirth7`; version bump. |
| `js/data.js` | 5 scalars + 3 stats; requirements `"Rebirth button 7"`, `"Rebirth note 10"`, `"Authorship"`, `"Axioms info"` (all `EtchingRequirement`); `permanentUnlocks += "Ledger", "Authorship", "Axioms info"`; 1 new accessor (`getOfflineMaxTimeMs`). |
| `js/rebirth.js` | `REBIRTH_LAYERS[7]`; new `reconcileInscriptions` table field replacing the `layer === 6` literal; `rebirthSeven()`; `Tab.AUTHORSHIP` clause in `rebirthReset`'s tab-retention chain (unconditional — Axioms are never zeroed); phase-11/phase-9 hooks for Nothing Is Unlearned; header-comment phase-table update. |
| `js/main.js` | `increaseRealtime` +1 line; `loadGameData` guards + `normalizeAxioms()`; `makeHero` maxLevel guard; `isHeroesUnlocked` prefix; `offline_max_time` → accessor (**the one true call-site conversion**); new `applyAxioms()` called beside `applyPerks()`; `assertContentTableIntegrity` extension; per-tick `restoreInscriptions()` (Phase 0). |
| `js/ui.js` | `Tab.AUTHORSHIP`; `renderAuthorship`; `createAxioms`; `setTabAuthorship` (fifth copy of the sub-tab pattern); `setLayout` authorship block; `renderSideBar` axioms block + `#rebirthButton7` hidden property; `renderSettings` layer-7 rows; keydown guard fix (Phase 0). |
| `js/ledger.js` | One line: the `taxed.includes` skip in `countUninscribedMilestonesCompleted` (Unlevied). Plus a header-comment rule stating the pledge is a purchase gate, not collateral, so nobody later adds an affordability check to the restore path. |
| `js/challenges.js` | `toggleSigil` asymmetry fix (Phase 0); Dress Rehearsal snapshot/restore. |
| `js/classes.js` | `getMaxLevelMultiplier` inverse floor (Phase 2, companion to Nothing Is Unlearned). |
| `css/styles.css` | `.color-axioms` + axiom button classes. All in `styles.css` only — `dark.css` and `colorblind.css` contain no `.color-*` overrides, so one rule must read on both backgrounds. |
| `test/rebirth-oracle.js` | `SOURCES` += `js/authorship.js` (before `js/rebirth.js`); `randomizeWorld` gains a fourth default-false `axioms` parameter, assigned **last**; new suites (§6.1). |
| `changelog.txt` | One entry per phase, newest first, with the downgrade warning. |

### 6.1 Testing — and a correction about what the oracle proves

**The oracle does not cover `rebirthReset()`.** `test/rebirth-oracle.js:310` is
`const rebirthResetOracle = sandbox.rebirthReset` — the **live** function, not a verbatim copy, called
on the oracle side at :319/:330/:355/:378/:436. An Axiom branch inside `rebirthReset` is therefore
applied to *both* sides of the diff: the test stays green while proving nothing about the edit. That
is silent escape, worse than a broken proof. The `getOfflineMaxTimeMs` conversion is outside
`rebirthReset`; the Nothing Is Unlearned phase-9/11 edits are in `doRebirth`, which *is* covered.

The suite currently reports `2000 oracle cases (layers 1-5) + 326 assertions (layers 1-6)` and PASSes.

Layer 7 uses **assertion suites**, not a verbatim oracle — the file's own header (:16-20) forbids a
sixth original, and layer 7 has none either. Free win: `checkTableIntegrity()` iterates
`Object.keys(layers)`, so it validates `REBIRTH_LAYERS[7]`'s gate / countKey / timerKey / statKey /
timersCleared / revokes and every `clears` path the moment the row exists — which is what catches a
typo'd `"etchings_log10"` that `setGameDataPath` would otherwise silently create as a new leaf.

Required new suites:

- **`checkAuthorshipPayoutGate`** — a refused Authorship moves zero state.
- **`checkLayerSevenPostState`** — one explicit expected-value table. Must assert the Marginal revoke
  with `isCompleted()`, **not** `.completed`, so the re-latch path is actually exercised against the
  zeroed balance; and must assert `gameData.inscriptions` is deep-equal to its pre-state.
- **`checkAxiomContainment(layer, seed)`** — two worlds from one seed, one with every Axiom owned; any
  state difference outside a per-Axiom licence table is a failure. This is the **only** instrument that
  can see an Axiom's effect on the cascade, and it is what a `rebirthReset` edit would otherwise escape.
- **`checkAxiomIdentityAtZero`** — with `axioms_owned == 0`, layers 1-5 still diff clean. Holds today
  for free because `randomizeWorld` only writes keys it names; assert it rather than assume it.
- **`checkEtchingTerms`** (Phase 0) — asserts `tE`, `tD`, `tH` each land strictly inside
  `(0, ETCHING_TERM_CAP)` for a stated plausible-input band. This does not measure the game; it pins
  the assumption somewhere executable.
- Extend **`checkGrantOrdering`** and **`checkInscriptionContainment`** to layer 7. In the latter, move
  the two book reads *above* the `doRebirth` calls.

Extending `randomizeWorld`'s counter loop to 7 shifts RNG consumption, so every existing seed maps to a
different world. The layers 1-5 identity proof survives (both worlds are built from the same seed by
the same function) but historical coverage is re-rolled — run `node test/rebirth-oracle.js 4000` once
after the change.

**Manual passes must reload twice.** Save-shape bugs break on the *second* load, not the first.

### 6.2 Do not repeat Layer 6's 14-agent machinery

Layer 6 needed it because it *created* the substrate, and the contract-writing cost (3,127 lines)
exceeded the implementation. Layer 7 inherits all of it, and parallelism would serialize anyway: five
of the seven Axioms touch `js/main.js`. Build directly, with at most 3-way fan-out inside a phase
(cascade+oracle / authorship+data / ui+markup+css), against a contract of ~600–800 lines that
incorporates `docs/layer6-contract.md` §0.2 and §0.4 **by reference**. `js/main.js` stays with one
owner throughout and is never split.

---

## 7. Build sequence

Each phase is independently shippable.

### Phase 0 — `3.0.1` — Calibration and hardening
*Parallel with Phase 1 design; blocks Phase 2.*

1. **Calibrate `ETCHING_E/D/H_OFFSET`.** Probe *per factor*, not per total:
   `getEssenceGainFactors().map(f => Math.log10(f))` (js/main.js:381) tells you *which* term is short,
   which the aggregate cannot. Record the measurements in the changelog and the PR body.
   `ETCHING_H_OFFSET` has no single correct value — hypercube accumulation is linear in AFK time with
   `getHypercubeCap()` at `Infinity` — so document the session length it targets instead of pretending
   it is measured.
2. `toggleSigil` removals unblocked (§5.1).
3. Per-tick `restoreInscriptions()` in `update()` (§5.5).
4. Clamp `gameData.hypercubes` to `1e308` beside the cap clamp (js/main.js:1241). It is the one
   late-game currency without the guard commit `59fbfd8` added to evil and essence; at `Infinity`,
   `getEtchingGainLog10()`'s `isFinite(h)` bail kills the Ledger permanently. **ASSUMPTION:** not
   reachable at current magnitudes (~1e244 ticks), so this is insurance.
5. Keydown handler: add `&& !e.metaKey` to the guard (js/ui.js:1661) and gate the dangerous binds on
   `e.target == document.body`, as the space branch already does. Today **Cmd+R fires `rebirthSix()`**
   and Cmd+Q fires `rebirthOne()` — including while the player is inside `#importExportBox` copying
   their save.
6. Wrap `doRebirth`'s body from phase 1 onward in `try/catch` calling `onTickError(error)`. A throw
   mid-cascade currently reaches `window.onerror`, which — unlike `onTickError` (js/main.js:24) — does
   **not** `clearInterval(saveloop)`, so a half-executed prestige reset is persisted within 3 s with no
   recovery path.
7. `checkEtchingTerms` suite.

### Phase 1 — `3.1.0` — The layer
The cascade row, the currency, the tab, the gate, all plumbing from §6, and the three lowest-risk
Axioms: **The Same Hand**, **The Long Hour**, **Unlevied**. Ships as a complete, spendable prestige
layer.

Two ordering constraints must be written into the phase table now, not retrofitted — retrofitting a
conditional into a cascade phase is exactly the bug class js/rebirth.js:1-51 exists to prevent:
`getAxiomGain()`'s inputs are read at phase 3, before phase 5 zeroes `etchings_log10`; and the sigil
masks clear at phase 5, before `rebirthReset()` reads them transitively.

Done when: oracle PASSes with layers 1-5 unchanged; `checkLayerSevenPostState` and
`checkAxiomIdentityAtZero` pass; a save survives export → import → **two** reloads.

### Phase 2 — `3.2.0` — The remaining Axioms
**Born Heroic**, **Dress Rehearsal**, **The Book Reopens**, **Nothing Is Unlearned**, plus the
`getMaxLevelMultiplier` floor (§2.4) and the `assertContentTableIntegrity` check pinning "Superb
Heroes" as the max heroic-xp threshold (§2.2).

One Axiom per commit, each with its own `checkAxiomContainment` licence entry. Batching them makes an
oracle diff ambiguous about which Axiom caused it.

Blocked on Phase 0's calibration, because Axiom pricing depends on how many Ledgers reach the gate.

### Phase 3 — `3.3.0` — Testimony and "Put it down."
One Testimony line per Axiom spent, inside the Authorship tab's second sub-tab. Not a Rebirth sub-tab
(there is no `setTabRebirth`), not a milestone (would need a third `MilestoneCurrency` and four render
branches), not the existing `#Congratulations` panel (wrong currency, wrong tab, and it is in
`permanentUnlocks` so Layer 7 could not revoke it).

**"Put it down." — anti-soft-lock contract, enforced verbatim.** It writes exactly one field,
`gameData.stats.putDownDate`, and only when currently `null`. It must **not**: set `gameData.paused`;
`clearInterval` either loop; hide `#mainarea` (which contains `#errorInfo` — hiding it hides the only
error surface); write any `requirement.completed`; zero any currency; call `setTab` or `rebirthReset`;
or persist any UI-open flag. Because visibility is derived from `putDownDate`, a player who presses it
loses nothing and a player who never presses it loses nothing.

Two-step the button (arm, then confirm) or use a plain `confirm()`. It sits adjacent to the axiom grid
the player has been clicking, and a misclick spends the beat.

---

## 8. Open questions a human must answer before implementation

1. **Does a real endgame save exist, and who has it?** This is the only external dependency on the
   calibration critical path. If none exists, Phase 0 ships synthetic-probe values plus the
   `checkEtchingTerms` assertion and says plainly in the changelog that the constants are estimated.
   Synthesis is cheap for two of three terms: `gameData.essence = 1e300; update()` latches every
   essence milestone, and `instant_dark_matter` re-maxes both dark-matter shops in seconds.
2. **Is `origin/main` the build players actually download?** Determines whether `3.0.1` is an urgent
   hotfix or a quiet correction.
3. **Axiom pricing.** Supply is fixed here: 1–3 on a first Authorship, 5 maximum per run, `5 ×
   (number of Authorships)` lifetime. The catalogue costs 14. Flat pricing at ~3/run retires it in
   ~5 Authorships, against the roadmap's "~20 Authorships" target. Options: raise costs; make the
   *k*-th Axiom purchased cost *k*; or accept a shorter layer and add content in `3.3.0`. **My
   recommendation:** accept ~5–7 Authorships for the first release rather than inflate seven audited
   Axioms into a grind.
4. **Is Nothing Is Unlearned wanted at all?** It is the strongest entry by a wide margin — effectively
   Almighty Eye applied to the whole cascade — and it will compress Layer 6's pacing targets. It is
   the first thing to cut or re-cost if the layer feels short. If it is cut, the
   `getMaxLevelMultiplier` floor is no longer required.
5. **`FLOOR` for the max-level inverse** (§2.4). A 100× penalty ceiling (`0.01`) is a guess. Needs the
   same calibration pass as the `ETCHING_*` offsets.
6. **Keybind, or none?** I recommend **none** in `3.1.0`. `c` collides with Cmd+C in the export
   workflow, and the free letters are all macOS chords. Revisit after Phase 0's guard fix.
7. **Are Axioms refundable?** I recommend yes and free, but only while `gameData.active_challenge == ""`
   (mirroring `canChangeSigils`), because Dress Rehearsal writes its snapshot at challenge entry.
   Born Heroic must be refundable but is not *undoable* — `makeHero` is one-way, so un-buying does not
   un-hero anything.
8. **Does Layer 7 wipe `gameData.perks` / `perks_points`?** I have ruled **no** (§4.2), and two rejects
   depend on that answer: Standing Trials is redundant only because nothing resets `gameData.perks`,
   and `tP` in the Etching formula stays near its maximum. If someone overrules this, both need
   revisiting.
9. **Does the Authorship tab participate in the WIDE layout?** `setLayout` (js/ui.js:1336-1350) has a
   ledger branch; Authorship needs the same decision made explicitly rather than discovered. Every
   `getElementById` in `setLayout` is unguarded and it runs from `initializeUI()` before `#mainarea` is
   unhidden — a missing id is a blank page with no banner.

---

## 9. Unverified claims

Marked so nobody treats them as measured.

- All `ETCHING_*` offsets, and therefore every figure in the Axiom supply table, sit downstream of
  numbers nobody has measured. The *structure* of `getAxiomGain` — floored, capped, gated at the
  milestone price, projection-inclusive — is what I am confident in; the constants are not.
- Wall-clock cost of a 4 h offline catch-up (288,000 ticks through the 16 ms budget loop). If it
  exceeds ~2 minutes on a mid-range machine, drop The Long Hour to 2 h.
- The `1 + maxLevel` substitution in §2.1: read, not run.
- The `gameData.hypercubes` overflow is argued unreachable (~1e244 ticks); the clamp is insurance.
- I did not verify the Authorship tab / `#rebirthButton7` markup against `createAllRows` /
  `initializeUI`, nor whether `#rebirthNote10` needs an entry in any rebirth-note rendering path.
- Whether any requirement chain outside `jobCategories` / `skillCategories` could strand a player after
  Born Heroic fires early: I checked the xp arithmetic and the `makeHeroes` prerequisite chain, not all
  ~74 requirement rows individually.

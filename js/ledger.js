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

    THE PLEDGE IS A PURCHASE GATE, NOT COLLATERAL. inscriptions.pledged decides whether the player
    may buy the NEXT slot; it is never re-checked against the balance afterwards, and nothing in the
    restore path may ever consult it. An Authorship zeroes etchings_log10 while every inscription
    survives, so a player is routinely below their own standing pledge - and an affordability test
    added to restoreInscriptions() or to updateInscribedTaskRecords() would silently confiscate the
    permanence they already paid for, at the exact moment the layer above says it is safe.
*/

// ---------------------------------------------------------------------------------------------
// Balance constants.
//
// ESTIMATED, NOT MEASURED. No real endgame save exists, so these were derived by SYNTHETIC PROBE:
// the game sources were loaded into a Node vm, a set of states consistent with having latched
// "The End" was constructed by hand, and getEssenceGainLog10() / getDarkMatterGain() /
// gameData.hypercubes were read back per factor. Nobody has played to this point. Treat every
// number below as a first estimate to be re-derived against a real save, and read the two
// constraints before changing any of them - both failure modes are total.
//
// CONSTRAINT 1 - an offset ABOVE its reachable value kills the term. If all three die at once,
// getEtchingGainLog10()'s "no input, no payout" guard returns LOG_ZERO forever, doRebirth(6)'s
// payoutGate never passes, and layers 6 and 7 are unreachable content. Err LOW.
//
// CONSTRAINT 2 - an offset BELOW the residual left one tick AFTER a Ledger opens a repeat-click
// faucet: the guard stops firing and W + S + tP + the Marginal bonus (~11 log10) mint on every
// press. So each offset must sit strictly ABOVE its own post-Ledger residual. The probe modelled
// the worst case (Palimpsest keeping the dark-matter skill tree, Recto and Verso seeding 1e12
// hypercubes, a maximal dance_with_the_devil best that survives because layer 6 has no
// challengeWipe) and measured: e <= 34, d <= 7, h = 12.
//
// What the probe read at the press, over five routings of a Ledger-capable save (essence-heavy,
// dark-matter-heavy, balanced, several Ledgers in, deep endgame):
//
//     e = log10 of the retained ten essence factors   46 .. 83
//     d = log10(getDarkMatterGain())                 104 .. 243
//     h = log10(gameData.hypercubes)                  30 .. 260
//
// e is the term with a real floor. Faint Hope alone pins 10.0 once "A New Hope" latches, The new
// gold 3.0, the dark-matter skill tree 13.4, and the two hero essence Skills a few more each, so
// e never came in under 46 in any consistent state and never exceeded 83 (every retained factor is
// either linear in level, hard-softcapped, or a flat milestone). 40 sits below that floor and 6
// above the post-Ledger residual, so tE runs 1.3 -> 6.2 across the whole band: live, not pinned.
//
// d and h have no such floor - they trade off against each other, because essence only reaches
// 1e300 if e + log10(dark_matter) + metaverse.essence_gain_modifier >= ~297, and the modifier is
// bought with hypercubes at 1e9 * 10^n. That identity is also why the joint failure is hard to
// reach: e <= 40 and d <= 95 and h <= 60 together bound essence gain at ~1e191, which cannot have
// latched "The End" in the first place. It is an argument about PEAK hypercubes though - a player
// who spends down to nothing right before pressing weakens it - which is the reason H sits far
// below the observed band rather than inside it. A tH refusal then lasts only as long as it takes
// hypercubes to regenerate, instead of forever.
//
// ETCHING_H_OFFSET has no correct value in the way the other two do: with getHypercubeCap() at
// Infinity, hypercube accumulation is linear in AFK time, so any offset is really a session-length
// target. 60 targets a save that has banked ~1e60 hypercubes at least once - roughly the point at
// which the metaverse shop's own ladder (dark_mater_gain_modifer at 1e19 * 10^n) has been climbed
// for a while - and it clears the 1e12 Recto and Verso seed by 48 orders.
//
// Deliberately NOT touched here: ETCHING_P_SCALE. getTotalPerkPoints() came back at 39k-5M in the
// probe, so tP runs 0.18 -> 1.11, which is inside its intended band.
// ---------------------------------------------------------------------------------------------

const ETCHING_E_OFFSET = 40
const ETCHING_D_OFFSET = 95
const ETCHING_H_OFFSET = 60
const ETCHING_P_SCALE = 30000
const ETCHING_TERM_CAP = 30

// ---------------------------------------------------------------------------------------------
// The door.
//
// The layer is normally behind "The End", the 1e300-essence milestone that ends the game below it.
// The Book Reopens Axiom (js/authorship.js) is a second key to the same door at a far lower essence
// price, and to the four requirement thresholds that hide the layer's controls - those four are
// rewritten by applyAxioms() (js/main.js), which reads both constants below.
//
// LEDGER_SEALED_ESSENCE is taken BY REFERENCE from the milestone, never written out again, the same
// way AXIOM_BASE_LOG10 is the price of First Draft. js/milestones.js loads before this file.
//
// The Axiom does NOT lower the milestone itself. "The End" carries its own latch effects, and this
// gate is the only one of them the layer above is allowed to buy.
// ---------------------------------------------------------------------------------------------

const LEDGER_SEALED_ESSENCE = milestoneBaseData["The End"].expense
const LEDGER_REOPENED_ESSENCE = 1e60

function isLedgerUnlocked() {
    if (gameData.requirements["The End"].isCompleted()) return true
    return hasAxiom("the_book_reopens") && gameData.essence >= LEDGER_REOPENED_ESSENCE
}

// ---------------------------------------------------------------------------------------------
// The gain.
// ---------------------------------------------------------------------------------------------

// Never reads banked essence: gameData.essence is pinned at its 1e308 clamp for anyone who reaches
// this layer, so log10(essence) carries zero information. It reads the unclamped gain chain instead.
function getEtchingGainLog10() {
    // Opening this door early does NOT open the faucet: the "no input, no payout" guard below is
    // untouched, so a player who walks in at 1e60 essence still earns nothing until the gain chains
    // themselves clear ETCHING_E/D/H_OFFSET.
    if (!isLedgerUnlocked()) return LOG_ZERO

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
    return gameData.stats.totalEtchingsEarnedLog10
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
    // Floored at the slots Marginal Milestones grant outright. Those rungs cost LOG_ZERO, so
    // including them changes no pledge total - but it is what makes a granted slot readable as
    // capacity, both to canInscribe's free-reuse check and to the "used / total" display.
    return Math.max(gameData.inscriptions.pledged, getInscriptionCount(), getMarginalInscriptionSlotBonus())
}

// ---------------------------------------------------------------------------------------------
// Cost. Pledges against the total earned - never a deduction.
// ---------------------------------------------------------------------------------------------

function getInscriptionSlotCostLog10(n) {
    // Slots granted by Marginal Milestones are free, so the paid ladder starts after them. Zeroing
    // the cost here rather than special-casing canInscribe is what makes the six "+1 inscription
    // slot" tiers reach the pledge total, the affordability check and the cost display at once.
    // A granted slot does not discount the slots above it - those keep their own rung's price.
    if (n <= getMarginalInscriptionSlotBonus()) return LOG_ZERO

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

// Deliberately NOT suspension-aware, unlike restoreInscribedMaxLevels below. Suspension exists to
// stop an inscribed max level feeding getMaxLevelMultiplier's inverse under two challenges - it is
// about the effect of task levels, not about whether the player still owns what they bought. A reset
// performed while suspended would otherwise clear the latch with nothing to ever restore it, and
// since the Ledger zeroes essence in the same breath, the milestone could not re-latch on its own
// either: purchased permanence, permanently gone.
function restoreInscribedMilestones() {
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
//
// The Unlevied Axiom (js/authorship.js) removes the tax, not the cap: with it every completed
// essence milestone counts whether it is inscribed or not, so the term returns to a value the
// formula already reaches when nothing is inscribed at all. It removes a choice-cost and cannot
// raise the ceiling, which is why it passes the faucet rule in js/authorship.js's header.
function countUninscribedMilestonesCompleted() {
    const levied = !hasAxiom("unlevied")
    let count = 0

    for (const name of ESSENCE_MILESTONE_NAMES) {
        if (levied && gameData.inscriptions.taxed.includes(name)) continue
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

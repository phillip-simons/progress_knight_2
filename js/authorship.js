/*
    Layer 7 - Authorship. Currency: Axioms. Primary verb: Rewrite.

    An Axiom is not an upgrade. It is a permanent edit to one named rule of the game, chosen from a
    hand-curated catalogue of seven. None of them contains a number the player can raise twice, and
    that is the whole design: the layer below this one (the Ledger) is already a pile of additive
    log10 terms, and a second pile would be the same layer with better names.

    THE FAUCET RULE. Every Axiom is audited against getEtchingGainLog10() before it enters the
    catalogue. An Axiom may add a BOUNDED CONSTANT to that formula and may NEVER multiply it, and it
    may never touch grantEtchings()'s logAdd. AXIOM_GAIN_CAP below is what makes the Axiom supply
    bounded per run and linear in the number of Authorships; a multiplicative Axiom would close the
    loop x(n+1) = k*x(n) and the cap would stop being sufficient. If a future Axiom ever wants to
    scale Etching gain, the whole layer needs re-deriving first.

    Nothing here may be added to gameData.perks. getTotalPerkPoints() (js/metaverse.js) sums
    getPerkCost(key) over every key in that dict; an unknown key returns undefined, the total becomes
    NaN, and getEtchingGainLog10()'s !isFinite(p) bail then makes every future Ledger pay nothing,
    permanently and silently.

    STATE. Two top-level scalars, gameData.axioms (unspent balance) and gameData.axioms_owned (a
    bitmask over AXIOM_BITS). Both migrate for free through replaceSaveDict(gameData, save). A nested
    dict would need its own replaceSaveDict call, the null/primitive shape guard the inscriptions call
    carries, and a normalizer; a bitmask needs none of that. js/data.js makes the same argument for
    the sigil masks.

    This file declares only consts and functions. It touches no DOM and no gameData at load time, and
    it loads between js/ledger.js and js/data.js because js/data.js reads AXIOM_BASE_LOG10 at top
    level to price the layer-7 requirements.
*/

// ---------------------------------------------------------------------------------------------
// The catalogue.
//
// APPEND ONLY. An entry's BIT IS ITS INDEX IN THIS ARRAY, and that bit is what the save persists,
// so reordering or deleting an entry silently re-points every existing player's purchases at a
// different Axiom. Retiring one means leaving its row in place and making it unbuyable.
//
// `cost` is relative value, in Axioms. The catalogue totals 14 against a supply of 1-5 per
// Authorship, which is a deliberate ~5-7 Authorship layer; do not inflate these to pad length.
//
// `reversible` is refundable, NOT undoable. Born Heroic cannot un-hero a task (makeHero() is
// one-way) but the player still gets the Axiom back. Refunds are free and cost no Etchings - there
// is no Etching subtraction anywhere in this game - and are blocked inside a challenge by
// canRefundAxiom() below.
//
// `hook` names the single existing seam each Axiom edits. The effects themselves are NOT implemented
// here: they live in the file that owns the seam, and each reads hasAxiom() directly.
// ---------------------------------------------------------------------------------------------

const AXIOM_CATALOGUE = Object.freeze([
    Object.freeze({
        key: "the_same_hand",
        title: "The Same Hand",
        cost: 1,
        reversible: true,
        rule: "Becoming a hero no longer costs you your peak.",
        hook: "makeHero() (js/main.js) keeps maxLevel instead of zeroing it",
    }),
    Object.freeze({
        key: "the_long_hour",
        title: "The Long Hour",
        cost: 1,
        reversible: true,
        rule: "The world remembers four hours away instead of one.",
        hook: "calc_offline_progress()'s offline_max_time (js/main.js)",
    }),
    Object.freeze({
        key: "unlevied",
        title: "Unlevied",
        cost: 2,
        reversible: true,
        rule: "The amulet stops taxing what it records.",
        hook: "countUninscribedMilestonesCompleted()'s taxed skip (js/ledger.js)",
    }),
    Object.freeze({
        key: "born_heroic",
        title: "Born Heroic",
        cost: 2,
        reversible: true,
        rule: "Heroes answer to the milestone track, not to One Above All.",
        hook: "isHeroesUnlocked() (js/main.js), gated on the \"Superb Heroes\" latch",
    }),
    Object.freeze({
        key: "dress_rehearsal",
        title: "Dress Rehearsal",
        cost: 2,
        reversible: true,
        rule: "A challenge stops costing you your max levels.",
        hook: "enterChallenge()/exitChallenge() (js/challenges.js), via gameData.challenge_maxlevels",
    }),
    Object.freeze({
        key: "the_book_reopens",
        title: "The Book Reopens",
        cost: 3,
        reversible: true,
        rule: "The Ledger reopens far below the price it first asked.",
        hook: "applyAxioms() (js/main.js) rewrites four 1e300 essence thresholds",
    }),
    Object.freeze({
        key: "nothing_is_unlearned",
        title: "Nothing Is Unlearned",
        cost: 3,
        reversible: true,
        rule: "Rebirths one through six stop taking your max levels back.",
        hook: "doRebirth phases 9 and 11 (js/rebirth.js), for layer < 7 only",
    }),
])

// Derived lookups, built from the catalogue rather than written out a second time. A hand-kept
// parallel table is two lists with nothing asserting they agree - the failure mode js/milestones.js
// guards its Marginal tier lists against with a load-time console.error.
const AXIOM_BITS = {}
const AXIOM_COST = {}
const AXIOM_TITLES = {}
const AXIOM_REVERSIBLE = {}

for (let axiomIndex = 0; axiomIndex < AXIOM_CATALOGUE.length; axiomIndex++) {
    const axiomEntry = AXIOM_CATALOGUE[axiomIndex]
    AXIOM_BITS[axiomEntry.key] = 1 << axiomIndex
    AXIOM_COST[axiomEntry.key] = axiomEntry.cost
    AXIOM_TITLES[axiomEntry.key] = axiomEntry.title
    AXIOM_REVERSIBLE[axiomEntry.key] = axiomEntry.reversible
}

Object.freeze(AXIOM_BITS)
Object.freeze(AXIOM_COST)
Object.freeze(AXIOM_TITLES)
Object.freeze(AXIOM_REVERSIBLE)

// Catalogue order. Iterate this, never Object.keys(gameData) or the bitmask, so the UI and the
// accounting agree on order and membership.
const AXIOM_NAMES = Object.freeze(Object.keys(AXIOM_BITS))
const AXIOM_ALL_BITS = (1 << AXIOM_CATALOGUE.length) - 1

// What retiring the whole catalogue costs. Display only.
const AXIOM_TOTAL_COST = AXIOM_CATALOGUE.reduce((total, axiom) => total + axiom.cost, 0)

// ---------------------------------------------------------------------------------------------
// The gain.
// ---------------------------------------------------------------------------------------------

// By reference, never duplicated: the Authorship gate is exactly the price of the Marginal milestone
// that announces the layer, so a recalibration of the Etching economy moves both together.
// js/milestones.js loads before this file.
const AXIOM_BASE_LOG10 = milestoneBaseData["First Draft"].expense_log10

// One more Axiom per this many further orders of Etchings. Calibrated against the SPREAD of the
// Marginal track (11.4 to 15.4), i.e. (topTier - firstDraft) / 2. If the 0.8 cost step of that
// ladder ever moves, re-derive this from the new spread rather than nudging it.
const AXIOM_STEP_LOG10 = 1.5

// A CORRECTNESS CONSTRAINT, not a balance knob. It is what keeps the Axiom supply bounded per run
// and linear in Authorship count, which is why Axioms are a plain integer and need no _log10
// treatment. See the faucet rule in the header.
const AXIOM_GAIN_CAP = 5

// What a refund costs. Without it every Axiom is RENTABLE and the catalogue's real price is
// max(cost) = 3 rather than its nominal 14: refunds are instant and unlimited, while six of the seven
// effects either fire as a one-shot event inside a single frame (Nothing Is Unlearned, Unlevied,
// The Long Hour) or write permanent state (The Same Hand's kept peak, Born Heroic's isHero flag,
// The Book Reopens' latches, Dress Rehearsal's restore). Buy, let it fire, refund, repeat - measured
// at a net cost of zero for three uses of a 3-cost Axiom.
//
// One Axiom per refund keeps re-planning a build affordable while making renting cost real supply,
// against a faucet of ~5 per Authorship. A 1-cost Axiom therefore refunds nothing at all, which is
// intended: churning the cheap ones is exactly the case a percentage fee would leave free.
// PROVISIONAL - this is a balance decision, not a correctness one.
const AXIOM_REFUND_FEE = 1

// Variety clauses of the gate. An Authorship is the largest wipe in the game and these exist so it
// cannot be pressed by a player who has used none of the layer below it.
const AUTHORSHIP_SIGIL_VARIETY = 4

// Banked Etchings plus the Ledger the player has not pressed yet. The projection is design, not
// convenience: getEtchingGainLog10() is unaffected by grantEtchings(), so without it "press Read the
// amulet, then press Close the eye" would silently beat "press Close the eye" by up to a whole Axiom
// step, and nothing in the UI would ever say so.
function getProjectedEtchingsLog10() {
    const banked = (typeof gameData.etchings_log10 === "number") ? gameData.etchings_log10 : LOG_ZERO
    const pending = getEtchingGainLog10()
    return Number.isFinite(pending) ? logAdd(banked, pending) : banked
}

// Floored, capped, gated at the milestone price, projection-inclusive. Read at phase 3 of
// doRebirth(7), which is BEFORE phase 5 zeroes etchings_log10 - see the layer-7 row in js/rebirth.js.
function getAxiomGain() {
    if (!isAuthorshipUnlockedByMilestone()) return 0

    const projected = getProjectedEtchingsLog10()
    if (!Number.isFinite(projected) || projected < AXIOM_BASE_LOG10) return 0

    return Math.min(AXIOM_GAIN_CAP, 1 + Math.floor((projected - AXIOM_BASE_LOG10) / AXIOM_STEP_LOG10))
}

// THE ONLY WRITE SITE for gameData.axioms that adds to it. Refunds go through unbuyAxiom().
function grantAxioms(count) {
    if (!Number.isFinite(count) || count <= 0) return

    const granted = Math.floor(count)
    gameData.axioms += granted
    gameData.stats.totalAxiomsEarned += granted
}

// ---------------------------------------------------------------------------------------------
// Ownership, buy and refund.
// ---------------------------------------------------------------------------------------------

// Bare and never suspension-aware. Every consumer of this predicate edits a rule whose absence is
// destructive rather than merely inert - The Same Hand suspended would ZERO a peak rather than
// decline to restore one, and Dress Rehearsal reads it after enterChallenge() has already set
// active_challenge, where any suspension predicate is false by construction.
function hasAxiom(key) {
    const bit = AXIOM_BITS[key]
    if (bit === undefined) return false
    return (gameData.axioms_owned & bit) != 0
}

function getSpentAxioms() {
    let spent = 0
    for (const key of AXIOM_NAMES)
        if (hasAxiom(key)) spent += AXIOM_COST[key]
    return spent
}

function getTotalAxioms() {
    return gameData.axioms + getSpentAxioms()
}

function canBuyAxiom(key) {
    if (AXIOM_BITS[key] === undefined) return false
    if (hasAxiom(key)) return false
    return gameData.axioms >= AXIOM_COST[key]
}

function buyAxiom(key) {
    if (!canBuyAxiom(key)) return false

    gameData.axioms -= AXIOM_COST[key]
    gameData.axioms_owned |= AXIOM_BITS[key]
    return true
}

// A refund returns the cost MINUS ONE - see AXIOM_REFUND_FEE. The challenge lock alone is not a
// deterrent against churn: Dress Rehearsal writes gameData.challenge_maxlevels at challenge ENTRY, so
// refunding it mid-run would strand a restore with no matching snapshot, and that is the only reason
// for the lock. Mirrors canChangeSigils().
function canRefundAxiom(key) {
    if (!hasAxiom(key)) return false
    if (!AXIOM_REVERSIBLE[key]) return false
    return gameData.active_challenge == ""
}

// Refundable is not undoable. Born Heroic cannot un-hero a task - makeHero() is one-way - and The
// Same Hand cannot take back a max level it already preserved. Un-buying stops the rule edit from
// here on; it does not rewind its history.
function unbuyAxiom(key) {
    if (!canRefundAxiom(key)) return false

    gameData.axioms_owned &= ~AXIOM_BITS[key]
    gameData.axioms += Math.max(0, AXIOM_COST[key] - AXIOM_REFUND_FEE)
    return true
}

// A hand-edited, truncated or downgraded save can put a string, a null or a stale bit in either
// field. Called once from loadGameData(), beside normalizeInscriptions().
//
// Masking against AXIOM_ALL_BITS means a save from a FUTURE version, downgraded, loses the Axioms it
// bought above this build's catalogue - deliberately, because getSpentAxioms() cannot price a key it
// does not know and a phantom bit would otherwise read as a permanent unbuyable purchase.
function normalizeAxioms() {
    if (typeof gameData.axioms !== "number" || !isFinite(gameData.axioms) || gameData.axioms < 0)
        gameData.axioms = 0
    gameData.axioms = Math.floor(gameData.axioms)

    if (typeof gameData.axioms_owned !== "number" || !isFinite(gameData.axioms_owned))
        gameData.axioms_owned = 0
    gameData.axioms_owned = Math.floor(gameData.axioms_owned) & AXIOM_ALL_BITS

    if (typeof gameData.stats.totalAxiomsEarned !== "number" || !isFinite(gameData.stats.totalAxiomsEarned)
        || gameData.stats.totalAxiomsEarned < 0)
        gameData.stats.totalAxiomsEarned = getTotalAxioms()
}

// ---------------------------------------------------------------------------------------------
// The gate.
//
// A refused Authorship is silent - doRebirth() just returns false - and layer 7's wipe is the
// largest in the game, so the clauses are exposed INDIVIDUALLY and isAuthorshipReady() is derived
// from that same list. Two hand-kept copies of this predicate would drift, and the direction they
// would drift in is "the button does nothing and the tab does not say why".
//
// The variety clauses live here rather than in a Requirement because neither is expressible as a
// threshold, which is what keeps layer 7 at zero new Requirement subclasses and zero new
// assignMethods() branches.
// ---------------------------------------------------------------------------------------------

function getAuthorshipGateStatus() {
    const sigilVariety = countSigils(gameData.stats.sigilsEverUsed)

    // RAW inscription counts, not the suspension-aware isInscribed* predicates: a worn sigil would
    // otherwise deadlock the gate, and the loadout is exactly what a player about to press this has
    // been wearing all cycle.
    const milestoneInscriptions = getInscribedMilestoneCount()
    const taskInscriptions = getInscribedTaskCount()
    const gain = getAxiomGain()

    return [
        {
            key: "milestone",
            label: "Reach First Draft in the margin",
            met: isAuthorshipUnlockedByMilestone(),
            have: isAuthorshipUnlockedByMilestone() ? 1 : 0,
            need: 1,
        },
        {
            key: "sigils",
            label: "Sigils served through a Ledger",
            met: sigilVariety >= AUTHORSHIP_SIGIL_VARIETY,
            have: sigilVariety,
            need: AUTHORSHIP_SIGIL_VARIETY,
        },
        {
            key: "milestoneInscription",
            label: "Milestones inscribed",
            met: milestoneInscriptions >= 1,
            have: milestoneInscriptions,
            need: 1,
        },
        {
            key: "taskInscription",
            label: "Tasks inscribed",
            met: taskInscriptions >= 1,
            have: taskInscriptions,
            need: 1,
        },
        {
            key: "gain",
            label: "Axioms this book would pay",
            met: gain >= 1,
            have: gain,
            need: 1,
        },
    ]
}

// doRebirth(7)'s payoutGate, checked at phase 0 - before the counter increment and before anything
// is cleared.
function isAuthorshipReady() {
    for (const clause of getAuthorshipGateStatus())
        if (!clause.met) return false
    return true
}

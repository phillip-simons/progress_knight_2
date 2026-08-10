var milestoneData = {}

const milestoneBaseData = {
    "Magic Eye": { name: "Magic Eye", expense: 5000, tier: 1, description: "Automatically gain max levels at age 65" },
    "Almighty Eye": { name: "Almighty Eye", expense: 15000, tier: 2, description: "Automatically gain max levels" },
    "Deal with the Devil": { name: "Deal with the Devil", expense: 30000, tier: 3, description: "Passively gain a small amount of Evil" },
    "Transcendent Master": { name: "Transcendent Master", expense: 50000, tier: 4, description: "Essence gain" },
    "Eternal Time": { name: "Eternal Time", expense: 75000, tier: 5, description: "x2 Time Warping" },
    "Hell Portal": { name: "Hell Portal", expense: 120000, tier: 6, description: "Passively gain a huge amount of Evil" },
    "Inferno": { name: "Inferno", expense: 170000, tier: 7, description: "x5 Evil gain" },
    "God's Blessings": { name: "God's Blessings", expense: 250000, tier: 8, description: "x10M Happiness, keep Evil Perks on reset" },
    "Faint Hope": { name: "Faint Hope", expense: 400000, tier: 9, description: "Essence gain (increases over time, influenced by time warping)" },
    "New Beginning": { name: "New Beginning", expense: 5000000, tier: 10, description: "Great heroes, skills and items are unlocked" },

    "Rise of Great Heroes": { name: "Rise of Great Heroes", expense: 10000000, tier: 11, description: "Essence gain + x10000 Great Hero & Skill XP" },
    "Lazy Heroes": { name: "Lazy Heroes", expense: 20000000, tier: 12, description: "Great Hero & Skill XP", effect: 1e12 },
    "Dirty Heroes": { name: "Dirty Heroes", expense: 30000000, tier: 13, description: "Great Hero & Skill XP", effect: 1e15 },
    "Angry Heroes": { name: "Angry Heroes", expense: 50000000, tier: 14, description: "Great Hero & Skill XP, 10x faster Faint Hope", effect: 1e15 },
    "Tired Heroes": { name: "Tired Heroes", expense: 100000000, tier: 15, description: "Great Hero & Skill XP", effect: 1e15 },
    "Scared Heroes": { name: "Scared Heroes", expense: 150000000, tier: 16, description: "Great Hero & Skill XP, new Evil Perk", effect: 1e15 },
    "Good Heroes": { name: "Good Heroes", expense: 200000000, tier: 17, description: "Great Hero & Skill XP", effect: 1e15 },
    "Funny Heroes": { name: "Funny Heroes", expense: 300000000, tier: 18, description: "Great Hero & Skill XP", effect: 1e25 },
    "Beautiful Heroes": { name: "Beautiful Heroes", expense: 400000000, tier: 19, description: "Great Hero & Skill XP", effect: 1e50 },
    "Awesome Heroes": { name: "Awesome Heroes", expense: 500000000, tier: 20, description: "Great Hero & Skill XP", effect: 1e10 },
    "Furious Heroes": { name: "Furious Heroes", expense: 750000000, tier: 21, description: "Great Hero & Skill XP", effect: 1e18 },
    "Superb Heroes": { name: "Superb Heroes", expense: 10000000000, tier: 22, description: "Great Hero & Skill XP", effect: 1e3 },
    "A new beginning": { name: "A new beginning", expense: 5e10, tier: 23, description: "Unlocks Dark Matter" },

    "Mind Control": { name: "Mind Control", expense: 1e13, tier: 24, description: "Makes Hell Portal even stronger" },
    "Galactic Emperor": { name: "Galactic Emperor", expense: 1e15, tier: 25, description: "Passively gain a small amount of Essence" },
    "Dark Matter Harvester": { name: "Dark Matter Harvester", expense: 1e17, tier: 26, description: "Multiply Dark Matter gain by 10x" },
    "A Dark Era": { name: "A Dark Era", expense: 1e20, tier: 27, description: "Unlocks Dark Matter Abilities" },
    "Dark Orbiter": { name: "Dark Orbiter", expense: 1e22, tier: 28, description: "Multiply Dark Orb gain by 1e10x, keep four Evil Perks always" },
    "Dark Matter Mining": { name: "Dark Matter Mining", expense: 1e25, tier: 29, description: "Multiply Dark Matter gain by 3x" },
    "The new gold": { name: "The new gold", expense: 1e30, tier: 30, description: "Multiply Essence gain by 1000x" },
    "The Devil inside you": { name: "The Devil inside you", expense: 1e35, tier: 31, description: "Multiply Evil gain by 1e15x" },
    "Strange Magic": { name: "Strange Magic", expense: 1e38, tier: 32, description: "Multiply Darkness xp gain by 1e50x" },
    "Speed speed speed": { name: "Speed speed speed", expense: 1e40, tier: 33, description: "Multiply Time Warping and Lifespan by 1000x. Heavily boosts Faint Hope" },
    "Life is valueable": { name: "Life is valueable", expense: 1e47, tier: 34, description: "Multiply your lifespan by 1e5x. New challenge unlocked. Dark Matter boosts essence gain." },
    "Dark Matter Millionaire": { name: "Dark Matter Millionaire", expense: 1e55, tier: 35, description: "Multiply Dark Matter gain by 500x" },
    "The new Dark Matter": { name: "The new Dark Matter", expense: 1e60, tier: 36, description: "Unlocks Metaverse" },

    "Strong Hope": { name: "Strong Hope", expense: 1e70, tier: 37, description: "Faint Hope does not reset on transcend or collapse" },

    "Ruler of the Metaverse": { name: "Ruler of the Metaverse", expense: 1e90, tier: 38, description: "Unlocks Metaverse Perks, Metaverse Guards Job Category" },
    "A New Hope": { name: "A New Hope", expense: 1e95, tier: 39, description: "Faint Hope always at maximum" },
    "Time is a flat circle": { name: "Time is a flat circle", expense: 1e100, tier: 40, description: "Multiply Time Warping by 1000x, Multiply all xp gain by 1e50x" },
    "The End is near": { name: "The End is near", expense: 1e200, tier: 50, description: "Unspent Multiverse Perk Points buffs Dark Matter" },
    "The End": { name: "The End", expense: 1e300, tier: 99, description: "Congratulations! You have beaten the game!" },

    // Marginal Milestones - priced in Etchings, stored as log10 to match gameData.etchings_log10.
    // Cost schedule is 10^(3.4 + 0.8n) for n = 1..15. The cost step (0.8) MUST exceed the reward
    // step (0.5 log10 of Etching gain per tier), or the ladder's loop gain is exactly 1 and the
    // layer's total length is set entirely by an unmeasured constant.
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
    "First Draft":     { name: "First Draft",     expense_log10: 11.4, tier: 110, description: "x3.16 Etching gain, and the first page of the next book" },
    "Catchword":       { name: "Catchword",       expense_log10: 12.2, tier: 111, description: "x3.16 Etching gain, +1 sigil slot" },
    "Signature Mark":  { name: "Signature Mark",  expense_log10: 13.0, tier: 112, description: "x3.16 Etching gain, +1 inscription slot" },
    "Redaction":       { name: "Redaction",       expense_log10: 13.8, tier: 113, description: "x3.16 Etching gain, inscription slots cost another x0.32 (x0.1 total)" },
    "Recto and Verso": { name: "Recto and Verso", expense_log10: 14.6, tier: 114, description: "x3.16 Etching gain, start each Ledger with 1T hypercubes" },
    "The Wide Margin": { name: "The Wide Margin", expense_log10: 15.4, tier: 115, description: "x3.16 Etching gain, +1 inscription slot" },
}

const milestoneCategories = {
    "Essence Milestones": ["Magic Eye", "Almighty Eye", "Deal with the Devil", "Transcendent Master", "Eternal Time", "Hell Portal", "Inferno", "God's Blessings", "Faint Hope"],
    "Heroic Milestones": ["New Beginning", "Rise of Great Heroes", "Lazy Heroes", "Dirty Heroes", "Angry Heroes", "Tired Heroes", "Scared Heroes", "Good Heroes", "Funny Heroes", "Beautiful Heroes", "Awesome Heroes", "Furious Heroes", "Superb Heroes", "A new beginning"],
    "Dark Milestones": ["Mind Control", "Galactic Emperor", "Dark Matter Harvester", "A Dark Era", "Dark Orbiter", "Dark Matter Mining", "The new gold", "The Devil inside you", "Strange Magic", "Speed speed speed", "Life is valueable", "Dark Matter Millionaire", "The new Dark Matter"],
    "Metaverse Milestones": ["Strong Hope", "Ruler of the Metaverse", "A New Hope", "Time is a flat circle", "The End is near", "The End"],
    "Marginal Milestones": ["Marginal Note", "Footnote", "Marginalia", "Rubrication", "Glossator", "Palimpsest", "Watermark", "Interleaf", "Emendation", "First Draft", "Catchword", "Signature Mark", "Redaction", "Recto and Verso", "The Wide Margin"],
}

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

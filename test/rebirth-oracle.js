/*
    Oracle test for the prestige cascade.

    js/rebirth.js replaced five hand-written rebirth functions with a table and a driver. This file
    keeps verbatim copies of those five originals and proves the replacement is behaviour-identical:
    it builds two identical randomized worlds, runs the original in one and doRebirth() in the other,
    and deep-compares the final state.

    There is no test framework and no build step in this repo, so this is plain Node with no
    dependencies:

        node test/rebirth-oracle.js [trials]

    Exits non-zero on any mismatch. Run it after touching js/rebirth.js.

    Scope. The five verbatim originals are an oracle for layers 1-5 only; layers 6 and 7 have no
    original to diff against and are covered by the assertion suites below instead. The 1-5 oracle
    diff is also the regression guard for the resetMetaverse() extraction - it only holds while that
    suite runs with gameData.inscriptions empty, which is where the extraction is provably identity.
    Do not add a sixth "original".

    Layer 7 (Authorship) adds one more obligation to that list: the Axioms it sells are edits to
    EXISTING rule seams, not new code paths, so the suites here have to prove both directions -
    checkAxiomIdentityAtZero, that a player who owns none is unaffected, and checkAxiomContainment,
    that a player who owns all of them changes nothing outside a per-Axiom licence list.

    What the oracle validates is the *cascade* - ordering, clears, conditionals, maxLevel policy,
    stat and timer bookkeeping. The economy functions that produce grant amounts are stubbed with
    deterministic values, because what is under test is when a grant is computed relative to the
    clears, not what it computes. Cosmic Recollection uses the base Skill.getEffect rather than the
    setCustomEffects override in main.js; both sides use the same one, so the comparison holds.
*/

const fs = require('fs')
const path = require('path')
const vm = require('vm')

const REPO = path.join(__dirname, '..')
// js/challenges.js and js/ledger.js declare only functions and consts at top level, so their
// position here is cosmetic - but doRebirth() calls restoreInscriptions() and
// reconcileInscriptionsAfterLedger(), so without js/ledger.js every trial throws.
//
// The tail of this list now matches index.html's order, and has to: js/authorship.js reads
// milestoneBaseData["First Draft"] at top level to derive AXIOM_BASE_LOG10, and js/data.js reads
// AXIOM_BASE_LOG10 at top level to price the layer-7 requirements. js/milestones.js must therefore
// load before js/authorship.js, which must load before js/data.js.
const SOURCES = ['js/utils.js', 'js/classes.js', 'js/challenges.js', 'js/ui.js', 'js/milestones.js', 'js/ledger.js', 'js/authorship.js', 'js/data.js', 'js/rebirth.js']

// Compile once, instantiate per world - building a fresh context is the expensive part otherwise.
const COMPILED = SOURCES.map(rel => new vm.Script(fs.readFileSync(path.join(REPO, rel), 'utf8'), { filename: rel }))

/*
    This has to run *inside* the context. Top-level const/class declarations (jobBaseData, Job, Tab,
    REBIRTH_LAYERS...) go into the context's global lexical scope, which later scripts in the same
    context can see but which never becomes a property of the sandbox object - so they are invisible
    from Node. Anything the harness needs from outside is re-exported onto globalThis here.
*/
const BOOT = new vm.Script(`
    gameData.taskData = {}
    gameData.itemData = {}
    for (const name in jobBaseData) gameData.taskData[name] = new Job(jobBaseData[name])
    for (const name in skillBaseData) gameData.taskData[name] = new Skill(skillBaseData[name])
    for (const name in itemBaseData) gameData.itemData[name] = new Item(itemBaseData[name])
    for (const name in milestoneBaseData) milestoneData[name] = new Milestone(milestoneBaseData[name])

    gameData.requirements = requirementsBaseData
    createMilestoneRequirements()

    gameData.currentJob = gameData.taskData["Beggar"]
    gameData.currentProperty = gameData.itemData["Homeless"]
    gameData.currentMisc = []

    globalThis.exportedTab = Tab
    globalThis.exportedRebirthLayers = REBIRTH_LAYERS
    globalThis.exportedLogZero = LOG_ZERO
    globalThis.exportedLogAdd = logAdd
    globalThis.exportedMetaverseClears = METAVERSE_CLEARS
    globalThis.exportedDarkMatterSkillClears = DARK_MATTER_SKILL_CLEARS
    globalThis.exportedDarkMatterUnlocks = DARK_MATTER_UNLOCKS
    globalThis.exportedSigilAllBits = SIGIL_ALL_BITS
    globalThis.exportedEtchingOffsets = {
        e: ETCHING_E_OFFSET,
        d: ETCHING_D_OFFSET,
        h: ETCHING_H_OFFSET,
        cap: ETCHING_TERM_CAP,
    }
    globalThis.exportedSigilBits = SIGIL_BITS
    globalThis.exportedMarginalNames = milestoneCategories[MARGINAL_CATEGORY]
    globalThis.exportedAxioms = {
        catalogue: AXIOM_CATALOGUE,
        names: AXIOM_NAMES,
        allBits: AXIOM_ALL_BITS,
        baseLog10: AXIOM_BASE_LOG10,
        stepLog10: AXIOM_STEP_LOG10,
        gainCap: AXIOM_GAIN_CAP,
        sigilVariety: AUTHORSHIP_SIGIL_VARIETY,
    }
`, { filename: 'harness-boot' })

// ---------------------------------------------------------------------------------------------
// Deterministic RNG, so a failure is reproducible from its seed.
// ---------------------------------------------------------------------------------------------

function makeRng(seed) {
    let state = seed >>> 0
    return function () {
        state = (state * 1664525 + 1013904223) >>> 0
        return state / 4294967296
    }
}

// ---------------------------------------------------------------------------------------------
// A sandboxed copy of the game, with just enough of the browser stubbed to load the sources.
// ---------------------------------------------------------------------------------------------

function buildWorld() {
    const noop = () => {}
    const element = new Proxy({}, {
        get: (t, k) => (k in t ? t[k] : (k === 'classList' ? { add: noop, remove: noop, contains: () => false } : noop)),
        set: (t, k, v) => { t[k] = v; return true },
    })

    const sandbox = {
        console,
        document: {
            getElementById: () => element,
            querySelector: () => element,
            querySelectorAll: () => [],
            getElementsByClassName: () => [],
            addEventListener: noop,
        },
        window: { addEventListener: noop },
        addEventListener: noop,
        localStorage: { getItem: () => null, setItem: noop },
        setTimeout: noop,
        setInterval: () => 0,
        clearInterval: noop,
        // utils.js format() needs this; the cascade never calls it.
        math: { floor: (x) => x },
    }
    vm.createContext(sandbox)

    for (const script of COMPILED) script.runInContext(sandbox)

    // Economy stubs. Fixed values so grants are observable and identical on both sides. Function
    // *declarations* do become sandbox properties (unlike const/class), so the ones that are really
    // defined by a loaded source - getLedgerStartingHypercubes, keepsDarkMatterAbilitiesThroughLedger,
    // setChallengeProgress - are overridden here by plain reassignment.
    sandbox.getEvilGain = () => 1000
    sandbox.getEssenceGain = () => 2e7
    sandbox.getDarkMatterGain = () => 5
    sandbox.getMetaversePerkPointsGain = () => 7
    sandbox.evilTranGain = () => 3
    sandbox.setTab = (tab) => { sandbox.lastSetTab = tab }
    // 4.7 is the worked first-Ledger figure, so the expected etchings_log10 is hand-checkable.
    sandbox.getEtchingGainLog10 = () => 4.7
    sandbox.getEssenceGainLog10 = () => 76
    sandbox.setChallengeProgress = () => {}
    sandbox.getHypercubeCap = () => Infinity
    sandbox.getLedgerStartingHypercubes = () => 0
    sandbox.keepsDarkMatterAbilitiesThroughLedger = () => false

    BOOT.runInContext(sandbox)

    if (Object.keys(sandbox.gameData.taskData).length === 0)
        throw new Error('harness boot produced no tasks - check the source list and load order')

    return sandbox
}

// ---------------------------------------------------------------------------------------------
// Randomize every input the cascade branches on.
// ---------------------------------------------------------------------------------------------

// `inscribe` must default to false. The layer-1..5 oracle diff is the only proof that the
// resetMetaverse() extraction preserves behaviour, and it only proves it while inscriptions are
// empty - which is also why the inscription block is the LAST thing this function does, so a world
// built with inscribe = true is identical to one built with inscribe = false in every other field.
//
// `axioms` must default to false for the same reason, and its block is assigned last of all. It
// consumes NO rng deliberately: it is the paired input to checkAxiomIdentityAtZero and
// checkAxiomContainment, which compare two worlds built from one seed that differ only in whether
// the catalogue is owned, so an rng draw here would desynchronise everything after it.
function randomizeWorld(sandbox, seed, inscribe = false, axioms = false) {
    const rng = makeRng(seed)
    const g = sandbox.gameData
    const pick = (arr) => arr[Math.floor(rng() * arr.length)]
    const magnitude = () => pick([0, 1, 1e3, 1e10, 5e10, 1e60, 1e90, 1e308])
    const flag = () => (rng() < 0.5 ? 0 : 1)

    g.coins = magnitude()
    g.days = Math.floor(rng() * 40000)
    g.evil = magnitude()
    g.essence = magnitude()
    g.dark_matter = magnitude()
    g.dark_orbs = magnitude()
    g.hypercubes = magnitude()
    g.perks_points = Math.floor(rng() * 5000)
    g.evil_perks_points = Math.floor(rng() * 100)
    g.evil_perks_keep = rng() < 0.5
    g.realtime = rng() * 1e6
    g.active_challenge = pick(['', 'an_unhappy_life', 'the_darkest_time', 'legends_never_die'])
    g.paused = rng() < 0.5
    g.boost_active = rng() < 0.5
    g.boost_timer = rng() * 100
    g.boost_cooldown = rng() * 100
    g.settings.selectedTab = pick(Object.values(sandbox.exportedTab))

    g.etchings_log10 = pick([sandbox.exportedLogZero, 0, 3.2, 4.7, 12.5])
    g.stats.totalEtchingsEarnedLog10 = g.etchings_log10
    g.stats.maxEtchingsReachedLog10 = g.etchings_log10
    g.sigils = Math.floor(rng() * 64)
    g.sigils_broken = Math.floor(rng() * 64)
    g.last_sigils = Math.floor(rng() * 64)
    g.stats.sigilsEverUsed = Math.floor(rng() * 64)

    // Captured with new Date() when gameData is constructed, so it differs between the two worlds by
    // a millisecond. Nothing in the cascade touches it.
    g.stats.startDate = 'fixed'

    for (const key in g.evil_perks) g.evil_perks[key] = Math.floor(rng() * 5)
    for (const key in g.perks) g.perks[key] = flag()
    for (const key in g.challenges) g.challenges[key] = rng() * 1000
    for (const key in g.metaverse) g.metaverse[key] = Math.floor(rng() * 10)
    for (const key in g.dark_matter_shop) g.dark_matter_shop[key] = flag()
    g.dark_matter_shop.a_miracle = rng() < 0.5

    for (let i = 1; i <= 7; i++) {
        const word = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven'][i - 1]
        g['rebirth' + word + 'Count'] = Math.floor(rng() * 50)
        g['rebirth' + word + 'Time'] = rng() * 1e5
        // null exercises the "first run" branch of the fastestN write guard.
        g.stats['fastest' + i] = rng() < 0.3 ? null : rng() * 1e5
    }

    for (const name in g.taskData) {
        const task = g.taskData[name]
        task.level = Math.floor(rng() * 5000)
        task.maxLevel = Math.floor(rng() * 5000)
        task.xp = rng() * 1e6
        task.xpBigInt = BigInt(Math.floor(rng() * 1e6))
        task.isHero = rng() < 0.3
        task.isFinished = rng() < 0.3
        task.unlocked = rng() < 0.5
    }

    for (const name in g.itemData) g.itemData[name].isHero = rng() < 0.3

    for (const key in g.requirements) g.requirements[key].completed = rng() < 0.5

    g.inscriptions = { milestones: [], tasks: {}, taxed: [], pledged: 0 }
    if (inscribe) {
        for (const name in g.taskData)
            if (rng() < 0.15) g.inscriptions.tasks[name] = { base: Math.floor(rng() * 5000), hero: Math.floor(rng() * 5000) }
        for (const name of ['Faint Hope', 'Inferno', 'The new gold'])
            if (rng() < 0.5) { g.inscriptions.milestones.push(name); g.inscriptions.taxed.push(name) }
        g.inscriptions.pledged = Object.keys(g.inscriptions.tasks).length + g.inscriptions.milestones.length
    }

    // Last, and rng-free. Exactly two fields, so checkAxiomContainment's licence list can be exactly
    // two entries: anything else the owned world moves is an Axiom escaping its hook.
    g.axioms = axioms ? 4 : 0
    g.axioms_owned = axioms ? sandbox.exportedAxioms.allBits : 0

    return rng
}

// Both are in the tables the game validates against: ARMED_MILESTONE_INSCRIPTION is in
// INSCRIBABLE_MILESTONES (normalizeInscriptions would otherwise drop it) and ARMED_TASK_INSCRIPTION
// is a real task, so restoreInscribedMaxLevels has something to write back to.
const ARMED_MILESTONE_INSCRIPTION = 'Faint Hope'
const ARMED_TASK_INSCRIPTION = 'Concentration'

// Deliberately NOT one of the three names randomizeWorld inscribes, so it is always a milestone that
// was inscribed earlier this cycle and has since been dropped - i.e. a stale `taxed` entry.
const ARMED_STALE_TAXED = 'Magic Eye'

/*
    Put a world into the state doRebirth(7) demands, which is far more specific than any other
    layer's: isAuthorshipReady() checks five clauses, and four of them are about the layer BELOW
    (an Etching balance, four sigils served, a milestone inscribed, a task inscribed). Without all
    of them the layer-7 suites would only ever exercise the refusal path.

    Everything here is deterministic. It is applied AFTER randomizeWorld, so two worlds built from
    one seed and armed the same way stay identical.
*/
function armAuthorship(world) {
    const g = world.gameData
    const axiomConsts = world.exportedAxioms

    // Comfortably over AXIOM_BASE_LOG10 (the First Draft price) on the banked balance alone, so the
    // gate does not depend on whatever getEtchingGainLog10 is stubbed to return. Far enough over it
    // that AXIOM_GAIN_CAP has to bind as well - at +5 the uncapped formula already returns 4 of a
    // cap of 5, so a getAxiomGain() that dropped its Math.min would look identical.
    g.etchings_log10 = axiomConsts.baseLog10 + 20
    g.stats.totalEtchingsEarnedLog10 = g.etchings_log10
    g.stats.maxEtchingsReachedLog10 = g.etchings_log10

    // Latch the whole Marginal track, so "the Authorship revokes it" is a statement about something
    // that was actually there. First Draft is the one isAuthorshipUnlockedByMilestone() reads.
    for (const name of world.exportedMarginalNames)
        if (g.requirements[name] !== undefined) g.requirements[name].completed = true

    // Four DIFFERENT sigils served at some point in the save's history. Built from the constant
    // rather than hard-coded, so raising the variety requirement does not silently stop arming it.
    let served = 0
    for (let bit = 0; bit < axiomConsts.sigilVariety; bit++) served |= (1 << bit)
    g.stats.sigilsEverUsed = served

    // One inscription of each kind, ADDED rather than replaced: checkInscriptionContainment(7) arms
    // both of its worlds, so the plain world's inscriptions have to stay a subset of the inscribed
    // world's or its own restores read as an escape.
    if (!g.inscriptions.milestones.includes(ARMED_MILESTONE_INSCRIPTION)) {
        g.inscriptions.milestones.push(ARMED_MILESTONE_INSCRIPTION)
        g.inscriptions.taxed.push(ARMED_MILESTONE_INSCRIPTION)
    }
    if (g.inscriptions.tasks[ARMED_TASK_INSCRIPTION] === undefined)
        g.inscriptions.tasks[ARMED_TASK_INSCRIPTION] = { base: 1234, hero: 567 }

    // Leave BOTH ratchets stale on purpose. `taxed` carries a milestone that is no longer inscribed
    // and `pledged` sits above the live count, which is what phase 14 exists to clear. Arming them
    // already balanced would make the reconcile assertions in checkLayerSevenPostState vacuous -
    // and a missing reconcile leaves a high-water pledge against a LOG_ZERO balance, which is free
    // re-targeting of every historic inscription slot, forever.
    if (!g.inscriptions.taxed.includes(ARMED_STALE_TAXED))
        g.inscriptions.taxed.push(ARMED_STALE_TAXED)
    g.inscriptions.pledged = world.getInscriptionCount() + 3
}

/*
    Gate the layer under test open or shut, so both paths get exercised, and report what the gate
    will actually say. Asking for "shut" is a request, not a guarantee: isCompleted() re-evaluates
    its live condition whenever the latch is false, and randomizeWorld hands out essence up to 1e308,
    which clears every essence gate on its own. Resolving it here latches both worlds identically and
    keeps the returned-value assertion in main() honest.
*/
function setGate(sandbox, layer, open) {
    const requirement = sandbox.gameData.requirements[sandbox.exportedRebirthLayers[layer].gate]
    requirement.completed = open
    return requirement.isCompleted()
}

// ---------------------------------------------------------------------------------------------
// Snapshot: every piece of state either implementation could touch.
// ---------------------------------------------------------------------------------------------

// Mirrors the join order of out.tasks below. Only used to name the offending field in a message.
const TASK_SNAPSHOT_FIELDS = ['level', 'maxLevel', 'xp', 'xpBigInt', 'isHero', 'isFinished', 'unlocked']

function snapshot(sandbox) {
    const g = sandbox.gameData
    const out = { scalars: {}, tasks: {}, items: {}, requirements: {}, autoBuyEnabled: sandbox.autoBuyEnabled }

    for (const key of Object.keys(g)) {
        if (key === 'taskData' || key === 'itemData' || key === 'requirements') continue
        if (key === 'currentJob' || key === 'currentProperty') { out.scalars[key] = g[key] ? g[key].name : null; continue }
        if (key === 'currentMisc') { out.scalars[key] = (g[key] || []).map(i => i.name); continue }
        out.scalars[key] = JSON.stringify(g[key])
    }

    for (const name of Object.keys(g.taskData)) {
        const t = g.taskData[name]
        out.tasks[name] = [t.level, t.maxLevel, t.xp, t.xpBigInt.toString(), t.isHero, t.isFinished, t.unlocked].join('|')
    }
    for (const name of Object.keys(g.itemData)) out.items[name] = g.itemData[name].isHero
    for (const key of Object.keys(g.requirements)) out.requirements[key] = g.requirements[key].completed

    return out
}

function diff(a, b) {
    const problems = []
    for (const section of Object.keys(a)) {
        if (typeof a[section] !== 'object' || a[section] === null) {
            if (a[section] !== b[section]) problems.push(`${section}: ${a[section]} != ${b[section]}`)
            continue
        }
        for (const key of Object.keys(a[section])) {
            const x = JSON.stringify(a[section][key])
            const y = JSON.stringify(b[section][key])
            if (x !== y) problems.push(`${section}.${key}: original=${x} new=${y}`)
        }
    }
    return problems
}

// ---------------------------------------------------------------------------------------------
// The oracle: the five original functions, verbatim except for their names.
// ---------------------------------------------------------------------------------------------

function runOracle(sandbox, layer) {
    const gameData = sandbox.gameData
    const { getEvilGain, getEssenceGain, getDarkMatterGain, getMetaversePerkPointsGain, evilTranGain } = sandbox

    function resetEvilPerksOracle() {
        if (gameData.requirements["God's Blessings"].isCompleted())
            return;
        gameData.evil_perks_points = 0
        gameData.evil_perks.receive_essence = 0

        if (!gameData.evil_perks_keep) {
            gameData.evil_perks.reduce_eye_requirement = 0
            gameData.evil_perks.reduce_evil_requirement = 0
            gameData.evil_perks.reduce_the_void_requirement = 0
            gameData.evil_perks.reduce_celestial_requirement = 0
        }
    }

    const rebirthResetOracle = sandbox.rebirthReset

    const layers = {
        1: () => {
            if (!gameData.requirements["Rebirth button 1"].isCompleted()) return;
            gameData.rebirthOneCount += 1
            if (gameData.stats.fastest1 == null || gameData.rebirthOneTime < gameData.stats.fastest1)
                gameData.stats.fastest1 = gameData.rebirthOneTime
            gameData.rebirthOneTime = 0
            rebirthResetOracle()
        },
        2: () => {
            if (!gameData.requirements["Rebirth button 2"].isCompleted()) return;
            gameData.rebirthTwoCount += 1
            gameData.evil += getEvilGain()
            resetEvilPerksOracle()
            if (gameData.stats.fastest2 == null || gameData.rebirthTwoTime < gameData.stats.fastest2)
                gameData.stats.fastest2 = gameData.rebirthTwoTime
            gameData.rebirthOneTime = 0
            gameData.rebirthTwoTime = 0
            rebirthResetOracle()
            gameData.active_challenge = ""
            for (const taskName in gameData.taskData) {
                const task = gameData.taskData[taskName]
                task.maxLevel = 0
            }
        },
        3: () => {
            if (!gameData.requirements["Rebirth button 3"].isCompleted()) return;
            gameData.rebirthThreeCount += 1
            gameData.essence += getEssenceGain()
            if (gameData.essence == Infinity || gameData.essence > 1e308)
                gameData.essence = 1e308
            gameData.evil = evilTranGain()
            resetEvilPerksOracle()
            if (gameData.stats.fastest3 == null || gameData.rebirthThreeTime < gameData.stats.fastest3)
                gameData.stats.fastest3 = gameData.rebirthThreeTime
            gameData.rebirthOneTime = 0
            gameData.rebirthTwoTime = 0
            gameData.rebirthThreeTime = 0
            const recallEffect = gameData.taskData["Cosmic Recollection"].getEffect();
            for (const taskName in gameData.taskData) {
                const task = gameData.taskData[taskName]
                task.maxLevel = Math.floor(recallEffect * task.level);
            }
            rebirthResetOracle()
            gameData.active_challenge = ""
        },
        4: () => {
            if (!gameData.requirements["Rebirth button 4"].isCompleted()) return;
            gameData.rebirthFourCount += 1
            gameData.essence = 0
            gameData.evil = 0
            gameData.dark_matter += getDarkMatterGain()
            gameData.evil_perks_points = 0
            gameData.evil_perks.receive_essence = 0
            if (gameData.metaverse.challenge_altar == 0 && gameData.perks.save_challenges == 0) {
                for (const challenge in gameData.challenges) {
                    gameData.challenges[challenge] = 0
                }
                gameData.requirements["Challenges"].completed = false
            }
            if (gameData.stats.fastest4 == null || gameData.rebirthFourTime < gameData.stats.fastest4)
                gameData.stats.fastest4 = gameData.rebirthFourTime
            gameData.rebirthOneTime = 0
            gameData.rebirthTwoTime = 0
            gameData.rebirthThreeTime = 0
            gameData.rebirthFourTime = 0
            rebirthResetOracle()
            for (const taskName in gameData.taskData) {
                const task = gameData.taskData[taskName]
                task.maxLevel = 0
            }
            gameData.active_challenge = ""
        },
        5: () => {
            if (!gameData.requirements["Rebirth button 5"].isCompleted()) return;
            gameData.rebirthFiveCount += 1
            gameData.perks_points += getMetaversePerkPointsGain()
            gameData.essence = 0
            gameData.evil = 0
            gameData.evil_perks_points = 0
            gameData.evil_perks.receive_essence = 0
            gameData.dark_matter = 0
            gameData.dark_orbs = 0
            gameData.dark_matter_shop.dark_orb_generator = 0
            gameData.dark_matter_shop.a_miracle = false
            gameData.dark_matter_shop.a_deal_with_the_chairman = 0
            gameData.dark_matter_shop.a_gift_from_god = 0
            gameData.dark_matter_shop.gotta_be_fast = 0
            gameData.dark_matter_shop.life_coach = 0
            if (gameData.perks.keep_dark_mater_skills == 0) {
                gameData.dark_matter_shop.speed_is_life = 0
                gameData.dark_matter_shop.your_greatest_debt = 0
                gameData.dark_matter_shop.essence_collector = 0
                gameData.dark_matter_shop.explosion_of_the_universe = 0
                gameData.dark_matter_shop.multiverse_explorer = 0
            }
            if (gameData.perks.save_challenges == 0) {
                for (const challenge in gameData.challenges) {
                    gameData.challenges[challenge] = 0
                }
                gameData.requirements["Challenges"].completed = false
            }
            gameData.requirements["Dark Matter"].completed = false
            gameData.requirements["Dark Matter Skills"].completed = false
            gameData.requirements["Dark Matter Skills2"].completed = false
            if (gameData.stats.fastest5 == null || gameData.rebirthFiveTime < gameData.stats.fastest5)
                gameData.stats.fastest5 = gameData.rebirthFiveTime
            gameData.rebirthOneTime = 0
            gameData.rebirthTwoTime = 0
            gameData.rebirthThreeTime = 0
            gameData.rebirthFourTime = 0
            gameData.rebirthFiveTime = 0
            gameData.boost_active = false
            gameData.boost_timer = 0
            gameData.boost_cooldown = 0
            gameData.hypercubes = 0
            gameData.metaverse.boost_cooldown_modifier = 1
            gameData.metaverse.boost_timer_modifier = 1
            gameData.metaverse.boost_warp_modifier = 100
            gameData.metaverse.hypercube_gain_modifier = 1
            gameData.metaverse.evil_tran_gain = 0
            gameData.metaverse.essence_gain_modifier = 0
            gameData.metaverse.challenge_altar = 0
            gameData.metaverse.dark_mater_gain_modifer = 0
            rebirthResetOracle()
            for (const taskName in gameData.taskData) {
                const task = gameData.taskData[taskName]
                task.maxLevel = 0
            }
            gameData.active_challenge = ""
        },
    }

    layers[layer]()
}

// ---------------------------------------------------------------------------------------------
// Assertion suites. Layer 6 has no original to diff against, so it is pinned by explicit statements
// about its post-state and about the phase ordering instead. Each suite returns a list of problem
// strings, so main()'s failure reporting is reused unchanged.
// ---------------------------------------------------------------------------------------------

function readGameDataPath(gameData, path) {
    const parts = path.split('.')
    let target = gameData
    for (const part of parts) {
        if (target === null || typeof target !== 'object') return undefined
        target = target[part]
    }
    return target
}

// A path only resolves if every segment but the last is a live object and the last segment already
// exists - setGameDataPath would happily *create* a typo'd leaf and clear nothing.
function pathResolves(gameData, path) {
    const parts = path.split('.')
    let target = gameData
    for (let i = 0; i < parts.length - 1; i++) {
        if (target === null || typeof target !== 'object') return false
        target = target[parts[i]]
    }
    return target !== null && typeof target === 'object' && parts[parts.length - 1] in target
}

/*
    (A) Every key the table names must exist. This is the fastest5 bug class - a statKey with no
    default in js/data.js makes "fastest" mean "most recent" forever - caught mechanically for every
    layer, plus every clear path, which setGameDataPath would otherwise silently create.
*/
function checkTableIntegrity(world) {
    const problems = []
    const g = world.gameData
    const layers = world.exportedRebirthLayers

    const checkPaths = (label, paths) => {
        for (const path in paths || {})
            if (!pathResolves(g, path)) problems.push(`${label}: "${path}" does not resolve in gameData`)
    }

    for (const layer of Object.keys(layers)) {
        const spec = layers[layer]

        if (!(spec.gate in g.requirements)) problems.push(`layer ${layer}: gate "${spec.gate}" is not a requirement`)
        if (!(spec.countKey in g)) problems.push(`layer ${layer}: countKey "${spec.countKey}" is not in gameData`)
        if (!(spec.timerKey in g)) problems.push(`layer ${layer}: timerKey "${spec.timerKey}" is not in gameData`)
        if (!(spec.statKey in g.stats)) problems.push(`layer ${layer}: statKey "${spec.statKey}" is not in gameData.stats`)

        for (const timer of spec.timersCleared)
            if (!(timer in g)) problems.push(`layer ${layer}: timersCleared "${timer}" is not in gameData`)
        for (const key of spec.revokes || [])
            if (!(key in g.requirements)) problems.push(`layer ${layer}: revokes "${key}" is not a requirement`)

        checkPaths(`layer ${layer} preGrantClears`, spec.preGrantClears)
        checkPaths(`layer ${layer} clears`, spec.clears)
        for (const group of spec.conditionalClears || [])
            checkPaths(`layer ${layer} conditionalClears`, group.paths)
    }

    checkPaths('METAVERSE_CLEARS', world.exportedMetaverseClears)
    checkPaths('DARK_MATTER_SKILL_CLEARS', world.exportedDarkMatterSkillClears)

    for (const key of world.exportedDarkMatterUnlocks)
        if (!(key in g.requirements)) problems.push(`DARK_MATTER_UNLOCKS: "${key}" is not a requirement`)

    return problems
}

// (B) A Ledger that would pay nothing must not run at all - phase 0 sits before the counter.
function checkPayoutGate(seed) {
    const problems = []
    const world = buildWorld()
    randomizeWorld(world, seed)
    setGate(world, 6, true)

    world.getEtchingGainLog10 = () => world.exportedLogZero

    const before = snapshot(world)
    const returned = world.doRebirth(6)

    if (returned !== false) problems.push(`doRebirth(6) returned ${returned} with a zero payout, expected false`)
    for (const problem of diff(before, snapshot(world)))
        problems.push(`refused Ledger moved state - ${problem}`)

    return problems
}

/*
    (C) Inscriptions are a per-task-local effect. Two worlds from one seed, one with inscriptions and
    one without: the only differences a rebirth may produce are the inscription book itself, the
    maxLevel of an inscribed task, and the latch of an inscribed milestone. This is what keeps the
    layer-1..5 oracle diff meaningful for players who own inscriptions.
*/
function checkInscriptionContainment(layer, seed) {
    const problems = []

    const plain = buildWorld()
    randomizeWorld(plain, seed, false)
    setGate(plain, layer, true)

    const inscribed = buildWorld()
    randomizeWorld(inscribed, seed, true)
    setGate(inscribed, layer, true)

    // Layer 7's payoutGate demands a milestone AND a task inscribed, so the "plain" world cannot be
    // empty for it. armAuthorship() adds the same pair to both, which keeps plain's inscriptions a
    // strict subset of inscribed's - the property the exemptions below rely on.
    if (layer === 7) {
        armAuthorship(plain)
        armAuthorship(inscribed)
    }

    // Read the book BEFORE the press. It survives every layer today, layer 7 included, but a suite
    // that reads its own exemption list out of the post-state would quietly stop exempting anything
    // the day some layer does wipe it.
    const records = Object.assign({}, inscribed.gameData.inscriptions.tasks)
    const milestones = inscribed.gameData.inscriptions.milestones.slice()

    plain.doRebirth(layer)
    inscribed.doRebirth(layer)

    const maxLevelField = TASK_SNAPSHOT_FIELDS.indexOf('maxLevel')

    const a = snapshot(plain)
    const b = snapshot(inscribed)

    for (const section of Object.keys(a)) {
        if (typeof a[section] !== 'object' || a[section] === null) {
            if (a[section] !== b[section])
                problems.push(`layer ${layer}: ${section} escaped containment: plain=${a[section]} inscribed=${b[section]}`)
            continue
        }

        for (const key of Object.keys(a[section])) {
            const x = JSON.stringify(a[section][key])
            const y = JSON.stringify(b[section][key])
            if (x === y) continue

            if (section === 'scalars' && key === 'inscriptions') continue
            if (section === 'requirements' && milestones.includes(key)) continue

            if (section === 'tasks' && records[key] !== undefined) {
                const fieldsA = a.tasks[key].split('|')
                const fieldsB = b.tasks[key].split('|')
                for (let i = 0; i < fieldsA.length; i++)
                    if (i !== maxLevelField && fieldsA[i] !== fieldsB[i])
                        problems.push(`layer ${layer}: inscribed task ${key} differs in ${TASK_SNAPSHOT_FIELDS[i]}: plain=${fieldsA[i]} inscribed=${fieldsB[i]}`)
                continue
            }

            problems.push(`layer ${layer}: ${section}.${key} escaped containment: plain=${x} inscribed=${y}`)
        }
    }

    return problems
}

/*
    (D) A challenge round trip is lossless. Inscriptions are inert while one is running - so the
    challenge starts from a clean slate - and the record is written back on the way out.
*/
function checkChallengeSuspension(seed) {
    const problems = []
    const world = buildWorld()
    randomizeWorld(world, seed, true)

    const g = world.gameData
    // enterChallenge refuses to start while any sigil is worn, and a worn dance_with_the_devil or
    // the_darkest_time sigil suspends inscriptions on its own.
    g.sigils = 0
    g.sigils_broken = 0
    g.active_challenge = ''

    const records = g.inscriptions.tasks
    const milestones = g.inscriptions.milestones

    world.enterChallenge('the_darkest_time')

    if (g.active_challenge !== 'the_darkest_time')
        problems.push(`enterChallenge left active_challenge as "${g.active_challenge}"`)

    for (const name of Object.keys(g.taskData))
        if (g.taskData[name].maxLevel !== 0)
            problems.push(`inside the challenge, ${name} kept maxLevel ${g.taskData[name].maxLevel}`)

    for (const name of milestones)
        if (g.requirements[name] !== undefined && g.requirements[name].completed)
            problems.push(`inside the challenge, inscribed milestone ${name} was still latched`)

    world.exitChallenge()

    for (const name of Object.keys(g.taskData)) {
        const expected = records[name] !== undefined ? records[name].base : 0
        if (g.taskData[name].maxLevel !== expected)
            problems.push(`after the challenge, ${name} has maxLevel ${g.taskData[name].maxLevel}, expected ${expected}`)
    }

    for (const name of milestones)
        if (g.requirements[name] !== undefined && !g.requirements[name].completed)
            problems.push(`after the challenge, inscribed milestone ${name} was not restored`)

    return problems
}

/*
    (E) The executable form of the phase-3 constraint: a grant reads state the clears are about to
    destroy, so it has to run first. This is the one bug class the cascade has had every time.
*/
function checkGrantOrdering(layer, seed) {
    const problems = []
    const world = buildWorld()
    randomizeWorld(world, seed)
    setGate(world, layer, true)

    const g = world.gameData
    // magnitude() can hand out 0, and layer 5's assertion is that essence is still readable.
    g.essence = 1e60
    g.dark_matter = 1e10
    g.hypercubes = 1e20
    g.perks_points = 4321

    let grantCalls = 0

    if (layer === 6) {
        const readState = () => ({
            hypercubes: g.hypercubes,
            dark_matter: g.dark_matter,
            essence: g.essence,
            perks_points: g.perks_points,
            challenges: JSON.stringify(g.challenges),
            metaverse: JSON.stringify(g.metaverse),
            recollection: g.taskData['Cosmic Recollection'].level,
        })
        const before = readState()

        world.getEtchingGainLog10 = () => {
            grantCalls++
            const now = readState()
            for (const key of Object.keys(before))
                if (now[key] !== before[key])
                    problems.push(`layer 6: ${key} was already ${now[key]} when the gain was computed, expected ${before[key]}`)
            return 4.7
        }
    } else if (layer === 4) {
        const challengesBefore = JSON.stringify(g.challenges)

        world.getDarkMatterGain = () => {
            grantCalls++
            if (g.essence !== 0) problems.push(`layer 4: essence was ${g.essence} at grant time, expected the pre-grant clear to have zeroed it`)
            if (g.evil !== 0) problems.push(`layer 4: evil was ${g.evil} at grant time, expected the pre-grant clear to have zeroed it`)
            if (JSON.stringify(g.challenges) !== challengesBefore) problems.push('layer 4: challenges were wiped before the grant read them')
            return 5
        }
    } else if (layer === 5) {
        world.getMetaversePerkPointsGain = () => {
            grantCalls++
            if (g.essence === 0) problems.push('layer 5: essence was already 0 at grant time, and the grant reads it')
            return 7
        }
    } else if (layer === 7) {
        armAuthorship(world)

        // The real getAxiomGain, wrapped rather than replaced: what is under test is that its INPUTS
        // are still intact when phase 3 calls it, so substituting a stub for it would test nothing.
        // Every field below is destroyed by phase 5 of the same call.
        const readState = () => ({
            etchings_log10: g.etchings_log10,
            sigils: g.sigils,
            sigils_broken: g.sigils_broken,
            last_sigils: g.last_sigils,
            sigilsEverUsed: g.stats.sigilsEverUsed,
            milestoneInscriptions: world.getInscribedMilestoneCount(),
            taskInscriptions: world.getInscribedTaskCount(),
            essence: g.essence,
            dark_matter: g.dark_matter,
            hypercubes: g.hypercubes,
            firstDraft: g.requirements['First Draft'].isCompleted(),
        })
        const before = readState()
        const realGetAxiomGain = world.getAxiomGain

        world.getAxiomGain = () => {
            grantCalls++
            const now = readState()
            for (const key of Object.keys(before))
                if (now[key] !== before[key])
                    problems.push(`layer 7: ${key} was already ${now[key]} when the Axiom gain was computed, expected ${before[key]}`)
            return realGetAxiomGain()
        }
    }

    if (!world.doRebirth(layer))
        problems.push(`layer ${layer}: doRebirth returned false with the gate open`)
    else if (grantCalls === 0)
        problems.push(`layer ${layer}: the recording stub was never called, so nothing was asserted`)

    return problems
}

// (F) One explicit expected-value table for the whole layer-6 post-state.
function checkLayerSixPostState(seed) {
    const problems = []
    const world = buildWorld()
    randomizeWorld(world, seed)
    setGate(world, 6, true)

    const g = world.gameData
    const logAdd = world.exportedLogAdd
    const clears = world.exportedMetaverseClears

    const eq = (label, actual, expected) => {
        if (actual !== expected) problems.push(`${label}: got ${actual}, expected ${expected}`)
    }

    const before = {
        etchings: g.etchings_log10,
        perksPoints: g.perks_points,
        perks: JSON.stringify(g.perks),
        challenges: JSON.stringify(g.challenges),
        hypercubeCap: g.hypercube_cap_unlocked,
        fastestSix: g.stats.fastest6,
        sixTime: g.rebirthSixTime,
        keepSkills: g.perks.keep_dark_mater_skills,
        skills: {},
        counts: {},
        latches: {},
        served: world.getServedSigils(),
        sigilsEverUsed: g.stats.sigilsEverUsed,
    }
    for (const path in world.exportedDarkMatterSkillClears) before.skills[path] = readGameDataPath(g, path)
    for (const word of ['One', 'Two', 'Three', 'Four', 'Five', 'Six']) before.counts[word] = g['rebirth' + word + 'Count']
    for (const key of ['Metaverse', 'Metaverse Perks', 'Metaverse Perks Button']) before.latches[key] = g.requirements[key].completed

    if (!world.doRebirth(6)) return ['doRebirth(6) returned false with the gate open and a positive gain']

    eq('etchings_log10', g.etchings_log10, logAdd(before.etchings, 4.7))

    for (const key of ['essence', 'evil', 'dark_matter', 'dark_orbs', 'hypercubes']) eq(key, g[key], 0)
    eq('boost_active', g.boost_active, false)
    eq('boost_timer', g.boost_timer, 0)
    eq('boost_cooldown', g.boost_cooldown, 0)

    for (const key of ['dark_orb_generator', 'a_deal_with_the_chairman', 'a_gift_from_god', 'life_coach', 'gotta_be_fast'])
        eq('dark_matter_shop.' + key, g.dark_matter_shop[key], 0)
    eq('dark_matter_shop.a_miracle', g.dark_matter_shop.a_miracle, false)

    // The skill tree survives only when the metaverse perk says so - the Marginal Milestone that
    // would also spare it is stubbed off in this harness.
    for (const path in before.skills)
        eq(path, readGameDataPath(g, path), before.keepSkills == 0 ? 0 : before.skills[path])

    for (const key of Object.keys(g.metaverse)) {
        const path = 'metaverse.' + key
        if (!(path in clears)) { problems.push(`metaverse.${key} has no METAVERSE_CLEARS entry`); continue }
        eq(path, g.metaverse[key], clears[path])
    }

    // Kept on purpose: perk points take ~7 Metaverse runs to re-earn, and the challenge best scores
    // multiply the gain chains the Etching formula reads.
    eq('perks_points', g.perks_points, before.perksPoints)
    eq('perks', JSON.stringify(g.perks), before.perks)
    eq('challenges', JSON.stringify(g.challenges), before.challenges)
    eq('hypercube_cap_unlocked', g.hypercube_cap_unlocked, before.hypercubeCap)

    for (const word of ['One', 'Two', 'Three', 'Four', 'Five'])
        eq('rebirth' + word + 'Count', g['rebirth' + word + 'Count'], before.counts[word])
    eq('rebirthSixCount', g.rebirthSixCount, before.counts.Six + 1)

    for (const word of ['One', 'Two', 'Three', 'Four', 'Five', 'Six'])
        eq('rebirth' + word + 'Time', g['rebirth' + word + 'Time'], 0)
    eq('stats.fastest6', g.stats.fastest6, before.fastestSix == null ? before.sixTime : Math.min(before.fastestSix, before.sixTime))

    eq('active_challenge', g.active_challenge, '')
    eq('sigils_broken', g.sigils_broken, 0)
    eq('last_sigils', g.last_sigils, before.served)
    eq('stats.sigilsEverUsed', g.stats.sigilsEverUsed, before.sigilsEverUsed | before.served)

    for (const name of Object.keys(g.taskData)) {
        const task = g.taskData[name]
        if (task.level !== 0 || task.xp !== 0 || task.xpBigInt !== 0n || task.isHero)
            problems.push(`task ${name} survived the Ledger: level=${task.level} xp=${task.xp} xpBigInt=${task.xpBigInt} isHero=${task.isHero}`)
    }

    for (const key of world.exportedDarkMatterUnlocks) eq(`requirements.${key}`, g.requirements[key].completed, false)
    for (const key of Object.keys(before.latches))
        if (before.latches[key]) eq(`requirements.${key}`, g.requirements[key].completed, true)

    return problems
}

/*
    (G) What gives the resetMetaverse() extraction its point: layers 5 and 6 leave the metaverse and
    dark-matter teardown in exactly the same state, from the same starting world.
*/
function checkLayerFiveSixAgreement(seed) {
    const problems = []

    const five = buildWorld()
    randomizeWorld(five, seed)
    setGate(five, 5, true)

    const six = buildWorld()
    randomizeWorld(six, seed)
    setGate(six, 6, true)

    if (!five.doRebirth(5)) problems.push('doRebirth(5) returned false with the gate open')
    if (!six.doRebirth(6)) problems.push('doRebirth(6) returned false with the gate open')
    if (problems.length > 0) return problems

    const paths = Object.assign({}, five.exportedMetaverseClears, five.exportedDarkMatterSkillClears)
    for (const path in paths) {
        const a = readGameDataPath(five.gameData, path)
        const b = readGameDataPath(six.gameData, path)
        if (a !== b) problems.push(`${path}: layer 5 left ${a}, layer 6 left ${b}`)
    }

    for (const key of five.exportedDarkMatterUnlocks) {
        if (five.gameData.requirements[key].completed) problems.push(`layer 5 left ${key} latched`)
        if (six.gameData.requirements[key].completed) problems.push(`layer 6 left ${key} latched`)
    }

    return problems
}

/*
    (H) The three ETCHING_*_OFFSET constants are ESTIMATED, not measured - no real endgame save
    exists, so js/ledger.js derives them from a synthetic probe. This suite does not measure the game
    either. It pins the estimate somewhere executable, because both ways of getting an offset wrong
    are total and neither is visible from any other test:

      too HIGH - every term is 0, getEtchingGainLog10()'s no-input-no-payout guard returns LOG_ZERO,
                 layer 6's payoutGate never passes, and layers 6 and 7 are unreachable content
      too LOW  - a term is still positive one tick AFTER a Ledger, the guard stops firing, and
                 W + S + tP + the Marginal bonus mint on every repeat press

    ETCHING_PRESS_STATES is the (e, d, h) band js/ledger.js's probe read at the press, over five
    routings of a Ledger-capable save. ETCHING_POST_LEDGER_STATE is the worst-case residual one tick
    after it, with Palimpsest keeping the dark-matter skill tree, Recto and Verso seeding 1e12
    hypercubes, and a maximal dance_with_the_devil best surviving because layer 6 has no
    challengeWipe. Update both tables in the same commit as any offset edit, and say what changed.

    `live` names the terms that must be strictly positive in that state. tE and tD are required
    everywhere: e has a real floor (Faint Hope alone pins 10.0 log10 once "A New Hope" latches) and
    d is dominated by the hard-softcapped unspent-perk-point buff, so a dead one of those means the
    offset is above the band rather than that the player routed differently. tH is required only
    where the routing banks hypercubes - accumulation is linear in AFK time with getHypercubeCap() at
    Infinity, so a dark-matter-routed save legitimately presses with h below the offset, and that
    refusal lasts only as long as it takes hypercubes to regenerate.
*/
const ETCHING_PRESS_STATES = [
    { name: 'essence-route',       e: 46.4, d: 103.5, h: 200, live: ['tE', 'tD', 'tH'] },
    { name: 'dark-matter-route',   e: 49.6, d: 123.7, h: 30,  live: ['tE', 'tD'] },
    { name: 'balanced',            e: 49.8, d: 114.4, h: 110, live: ['tE', 'tD', 'tH'] },
    { name: 'several Ledgers in',  e: 63.7, d: 167.6, h: 190, live: ['tE', 'tD', 'tH'] },
    { name: 'deep endgame',        e: 83.3, d: 242.5, h: 260, live: ['tE', 'tD', 'tH'] },
]

const ETCHING_POST_LEDGER_STATE = { name: 'one tick after a Ledger', e: 34, d: 7, h: 12 }

function checkEtchingTerms(world) {
    const problems = []
    const offsets = world.exportedEtchingOffsets
    const capWithLogTail = world.capWithLogTail

    // The three terms of getEtchingGainLog10(), recomputed here rather than called: the harness stubs
    // getEssenceGainLog10 / getDarkMatterGain / getEtchingGainLog10, so the live function cannot be
    // driven from a state table. The weights and the Math.max(0, ...) are copied from js/ledger.js and
    // must be kept in step with it.
    const terms = (state) => ({
        tE: 0.20 * capWithLogTail(Math.max(0, state.e - offsets.e), offsets.cap),
        tD: 0.10 * capWithLogTail(Math.max(0, state.d - offsets.d), offsets.cap),
        tH: 0.20 * capWithLogTail(Math.max(0, state.h - offsets.h), offsets.cap),
    })

    for (const key of ['e', 'd', 'h', 'cap']) {
        const value = offsets[key]
        if (typeof value !== 'number' || !isFinite(value) || value <= 0)
            problems.push(`ETCHING offset "${key}" is ${value}, expected a finite positive number`)
    }
    if (problems.length > 0) return problems

    // (1) The layer is reachable: every plausible press pays something.
    for (const state of ETCHING_PRESS_STATES) {
        const t = terms(state)
        const sum = t.tE + t.tD + t.tH
        if (!(sum > 0))
            problems.push(`${state.name}: tE+tD+tH = ${sum}, so doRebirth(6) would refuse forever - an offset is above its reachable value`)

        // (2) And each term the state is supposed to pay is actually alive, not a dead constant.
        for (const key of state.live)
            if (!(t[key] > 0))
                problems.push(`${state.name}: ${key} = 0 - its offset is above what this routing produces`)
    }

    // (3) The no-input-no-payout guard still fires, so a repeat press mints nothing.
    const residual = terms(ETCHING_POST_LEDGER_STATE)
    const residualSum = residual.tE + residual.tD + residual.tH
    if (residualSum > 0)
        problems.push(`${ETCHING_POST_LEDGER_STATE.name}: tE+tD+tH = ${residualSum.toFixed(3)} > 0 - a repeat press would mint W + S + tP + the Marginal bonus for free`)

    // (4) Same statement, per constant, so a failure names the one to move.
    const residualPairs = [['ETCHING_E_OFFSET', offsets.e, ETCHING_POST_LEDGER_STATE.e],
        ['ETCHING_D_OFFSET', offsets.d, ETCHING_POST_LEDGER_STATE.d],
        ['ETCHING_H_OFFSET', offsets.h, ETCHING_POST_LEDGER_STATE.h]]
    for (const [name, offset, residualInput] of residualPairs)
        if (!(offset > residualInput))
            problems.push(`${name} is ${offset}, at or below the ${residualInput} left one tick after a Ledger`)

    return problems
}

/*
    (I) A refused Authorship moves zero state.

    Layer 7 has five gate clauses and four of them are about the layer below it - an Etching
    balance, four different sigils served, a milestone inscribed, a task inscribed. None of that is
    expressible as a Requirement threshold, so all of it lives in payoutGate, which runs at phase 0
    BEFORE the counter increment. Each scenario below breaks one clause and asserts three things: the
    named clause reports unmet, every other clause still reports met, and the press is a no-op.

    The last of those is the one that matters. doRebirth returning false is silent to the player, and
    layer 7's wipe is the largest in the game, so a refusal that had already incremented the counter
    or cleared a mask would be unrecoverable and invisible.
*/
const AUTHORSHIP_REFUSALS = [
    {
        name: 'no First Draft',
        // "Rebirth button 7" is already latched by setGate, so this reaches the payoutGate rather
        // than stopping at the requirement one line earlier. Two clauses read the balance.
        breakIt: (world) => {
            world.gameData.etchings_log10 = world.exportedLogZero
            world.gameData.requirements['First Draft'].completed = false
        },
        unmet: ['milestone', 'gain'],
    },
    {
        name: 'too few sigils ever served',
        breakIt: (world) => { world.gameData.stats.sigilsEverUsed = 1 },
        unmet: ['sigils'],
    },
    {
        name: 'no milestone inscribed',
        breakIt: (world) => { world.gameData.inscriptions.milestones = [] },
        unmet: ['milestoneInscription'],
    },
    {
        name: 'no task inscribed',
        breakIt: (world) => { world.gameData.inscriptions.tasks = {} },
        unmet: ['taskInscription'],
    },
    {
        name: 'a book that would pay less than one Axiom',
        // First Draft stays latched - isCompleted() short-circuits on the latch - so this isolates
        // the gain clause from the milestone clause at a balance just under the Axiom price.
        breakIt: (world) => {
            world.gameData.etchings_log10 = world.exportedAxioms.baseLog10 - 1
            world.getEtchingGainLog10 = () => world.exportedLogZero
        },
        unmet: ['gain'],
    },
]

function checkAuthorshipPayoutGate(seed) {
    const problems = []

    for (const scenario of AUTHORSHIP_REFUSALS) {
        const world = buildWorld()
        randomizeWorld(world, seed, true)
        setGate(world, 7, true)
        armAuthorship(world)
        scenario.breakIt(world)

        const status = {}
        for (const clause of world.getAuthorshipGateStatus()) status[clause.key] = clause.met

        for (const key of scenario.unmet)
            if (status[key] !== false)
                problems.push(`${scenario.name}: gate clause "${key}" reported met, expected unmet`)
        for (const key of Object.keys(status))
            if (!scenario.unmet.includes(key) && status[key] !== true)
                problems.push(`${scenario.name}: gate clause "${key}" reported unmet, but this scenario only breaks ${scenario.unmet.join(' + ')}`)

        const before = snapshot(world)
        const returned = world.doRebirth(7)

        if (returned !== false) problems.push(`${scenario.name}: doRebirth(7) returned ${returned}, expected false`)
        for (const problem of diff(before, snapshot(world)))
            problems.push(`${scenario.name}: refused Authorship moved state - ${problem}`)
    }

    // Without this every refusal above would also pass against a layer that can never fire at all.
    const armed = buildWorld()
    randomizeWorld(armed, seed, true)
    setGate(armed, 7, true)
    armAuthorship(armed)
    if (!armed.doRebirth(7))
        problems.push('a fully armed world was refused too, so the refusal scenarios prove nothing')

    return problems
}

/*
    (J) Layer 7's two mandated phase-ordering constraints, made executable.

    Both are invisible to any post-state assertion, because both are about what some LATER phase
    reads rather than about what the field ends up as:

      etchings_log10 must be LOG_ZERO before rebirthReset() - phase 10 un-latches the 15 Marginal
      Milestones and the next isCompleted() re-evaluates them. At a positive balance all 15 re-latch
      on the following tick and the player permanently keeps +7.5 log10 of Etching gain, 6
      inscription slots, 3 sigil slots, the hypercube seed and Palimpsest.

      the sigil masks must be 0 before rebirthReset() - its preserve loop reaches gameData.sigils
      transitively, through isInscribedMilestone -> areInscriptionsActive -> isChallengeActive. With
      a dance_with_the_devil sigil still worn, every inscription is suspended for the teardown and
      phase 13's restoreInscribedMaxLevels() is a no-op, so the player's inscribed peaks are gone.

    So the probes are hung on the reads themselves: rebirthReset is wrapped to assert the pre-state
    it is entered with, and isChallengeActive is wrapped to assert what the preserve loop sees. The
    end-to-end consequence - the inscribed task got its peak back - is asserted too, because that is
    what a player would notice.
*/
function checkLayerSevenOrdering(seed) {
    const problems = []
    const world = buildWorld()
    randomizeWorld(world, seed, true)
    setGate(world, 7, true)
    armAuthorship(world)

    const g = world.gameData
    const logZero = world.exportedLogZero

    // The dangerous shape exactly: no challenge running, a max-level-inverting sigil worn. This is
    // reachable in normal play - commitSigils() deliberately leaves the loadout on.
    g.active_challenge = ''
    g.sigils = world.exportedSigilBits.dance_with_the_devil
    g.sigils_broken = 0
    g.last_sigils = world.exportedSigilBits.the_darkest_time

    let inReset = false
    let resetCalls = 0
    let preserveProbes = 0

    const realRebirthReset = world.rebirthReset
    world.rebirthReset = function (...args) {
        resetCalls++
        if (g.etchings_log10 !== logZero)
            problems.push(`etchings_log10 was ${g.etchings_log10} when rebirthReset() ran - phase 5 must zero it first, or all 15 Marginal Milestones re-latch on the next tick`)
        if (g.sigils !== 0 || g.sigils_broken !== 0 || g.last_sigils !== 0)
            problems.push(`the sigil masks were ${g.sigils}/${g.sigils_broken}/${g.last_sigils} when rebirthReset() ran - phase 5 must clear all three first`)

        inReset = true
        try {
            return realRebirthReset(...args)
        } finally {
            inReset = false
        }
    }

    const realIsChallengeActive = world.isChallengeActive
    world.isChallengeActive = function (name) {
        if (inReset) {
            preserveProbes++
            if (g.sigils !== 0)
                problems.push(`rebirthReset()'s preserve loop read the sigil mask as ${g.sigils} while deciding what to keep`)
        }
        return realIsChallengeActive(name)
    }

    const record = g.inscriptions.tasks[ARMED_TASK_INSCRIPTION]

    if (!world.doRebirth(7))
        return ['doRebirth(7) returned false with the gate open and the world armed']

    if (resetCalls !== 1) problems.push(`rebirthReset() ran ${resetCalls} times, expected exactly 1`)
    if (preserveProbes === 0)
        problems.push('rebirthReset() never reached the inscription-suspension test, so nothing was asserted about the sigil masks')

    const armedTask = g.taskData[ARMED_TASK_INSCRIPTION]
    if (armedTask.maxLevel !== record.base)
        problems.push(`inscribed task ${ARMED_TASK_INSCRIPTION} ended at maxLevel ${armedTask.maxLevel}, expected its record ${record.base} - a sigil still worn at phase 13 suspends the restore`)

    for (const key of ['sigils', 'sigils_broken', 'last_sigils'])
        if (g[key] !== 0) problems.push(`${key} survived the Authorship as ${g[key]}, expected 0`)

    return problems
}

// (K) One explicit expected-value table for the whole layer-7 post-state.
function checkLayerSevenPostState(seed) {
    const problems = []
    const world = buildWorld()
    randomizeWorld(world, seed, true)
    setGate(world, 7, true)
    armAuthorship(world)

    const g = world.gameData
    const logZero = world.exportedLogZero
    const clears = world.exportedMetaverseClears
    const axiomConsts = world.exportedAxioms

    const eq = (label, actual, expected) => {
        if (actual !== expected) problems.push(`${label}: got ${actual}, expected ${expected}`)
    }

    // A nonzero purchase, so "an Authorship never revokes an Axiom you already bought" is a claim
    // about something rather than about 0 == 0. Owning the catalogue cannot perturb the table below:
    // whether it does is checkAxiomContainment's question, not this suite's.
    g.axioms_owned = axiomConsts.allBits

    const before = {
        gain: world.getAxiomGain(),
        projected: world.getProjectedEtchingsLog10(),
        axioms: g.axioms,
        axiomsOwned: g.axioms_owned,
        totalAxiomsEarned: g.stats.totalAxiomsEarned,
        perksPoints: g.perks_points,
        perks: JSON.stringify(g.perks),
        challenges: JSON.stringify(g.challenges),
        challengeMaxLevels: JSON.stringify(g.challenge_maxlevels),
        hypercubeCap: g.hypercube_cap_unlocked,
        fastestSeven: g.stats.fastest7,
        sevenTime: g.rebirthSevenTime,
        keepSkills: g.perks.keep_dark_mater_skills,
        sigilsEverUsed: g.stats.sigilsEverUsed,
        maxEtchings: g.stats.maxEtchingsReachedLog10,
        totalEtchings: g.stats.totalEtchingsEarnedLog10,
        milestones: JSON.stringify(g.inscriptions.milestones),
        tasks: JSON.stringify(g.inscriptions.tasks),
        inscriptionCount: world.getInscriptionCount(),
        skills: {},
        counts: {},
        marginalLatched: 0,
        permanent: {},
    }
    for (const path in world.exportedDarkMatterSkillClears) before.skills[path] = readGameDataPath(g, path)
    for (const word of ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven']) before.counts[word] = g['rebirth' + word + 'Count']
    for (const name of world.exportedMarginalNames)
        if (g.requirements[name].isCompleted()) before.marginalLatched++
    // Read through isCompleted(), so the armed balance latches them and the survival assertion below
    // is about something that was actually there.
    for (const key of ['Ledger', 'Authorship', 'Axioms info']) before.permanent[key] = g.requirements[key].isCompleted()

    if (!world.doRebirth(7))
        return ['doRebirth(7) returned false with the gate open and the world armed']

    // The currency. AXIOM_GAIN_CAP is a correctness constraint, not a balance knob: it is what keeps
    // the supply linear in Authorship count, so it is asserted rather than assumed.
    const uncapped = 1 + Math.floor((before.projected - axiomConsts.baseLog10) / axiomConsts.stepLog10)
    if (uncapped <= axiomConsts.gainCap)
        problems.push(`armAuthorship banked too little: the uncapped formula returns ${uncapped} against a cap of ${axiomConsts.gainCap}, so the cap assertion below is vacuous`)
    eq('getAxiomGain()', before.gain, axiomConsts.gainCap)
    eq('axioms', g.axioms, before.axioms + before.gain)
    eq('stats.totalAxiomsEarned', g.stats.totalAxiomsEarned, before.totalAxiomsEarned + before.gain)
    eq('axioms_owned', g.axioms_owned, before.axiomsOwned)

    // The Ledger economy, retired into the next book.
    eq('etchings_log10', g.etchings_log10, logZero)
    for (const key of ['sigils', 'sigils_broken', 'last_sigils']) eq(key, g[key], 0)

    // Layer 7 does NOT call commitSigils(), and the two Etching history fields are description-reveal
    // keys - resetting maxEtchingsReachedLog10 would flip every Marginal Milestone's description back
    // to the literal string "Unknown" for content the player has already read.
    eq('stats.sigilsEverUsed', g.stats.sigilsEverUsed, before.sigilsEverUsed)
    eq('stats.maxEtchingsReachedLog10', g.stats.maxEtchingsReachedLog10, before.maxEtchings)
    eq('stats.totalEtchingsEarnedLog10', g.stats.totalEtchingsEarnedLog10, before.totalEtchings)

    // The metaverse / dark-matter teardown, shared with layers 5 and 6.
    for (const key of ['essence', 'evil', 'dark_matter', 'dark_orbs', 'hypercubes']) eq(key, g[key], 0)
    eq('boost_active', g.boost_active, false)
    eq('boost_timer', g.boost_timer, 0)
    eq('boost_cooldown', g.boost_cooldown, 0)
    for (const key of ['dark_orb_generator', 'a_deal_with_the_chairman', 'a_gift_from_god', 'life_coach', 'gotta_be_fast'])
        eq('dark_matter_shop.' + key, g.dark_matter_shop[key], 0)
    eq('dark_matter_shop.a_miracle', g.dark_matter_shop.a_miracle, false)
    for (const path in before.skills)
        eq(path, readGameDataPath(g, path), before.keepSkills == 0 ? 0 : before.skills[path])
    for (const key of Object.keys(g.metaverse)) {
        const path = 'metaverse.' + key
        if (!(path in clears)) { problems.push(`metaverse.${key} has no METAVERSE_CLEARS entry`); continue }
        eq(path, g.metaverse[key], clears[path])
    }

    // Kept on purpose. Each of these multiplies the essence and dark-matter chains the Etching
    // formula reads, so wiping them would make each Authorship pay less than the one before. The
    // counters are a hard requirement, not a preference: getHypercubeCap() reads rebirthFiveCount
    // and isSigilGraceActive() reads rebirthSixCount.
    eq('perks_points', g.perks_points, before.perksPoints)
    eq('perks', JSON.stringify(g.perks), before.perks)
    eq('challenges', JSON.stringify(g.challenges), before.challenges)
    eq('hypercube_cap_unlocked', g.hypercube_cap_unlocked, before.hypercubeCap)
    // Dress Rehearsal's snapshot. Layer 7 must not write it, and must not turn it into an Array.
    eq('challenge_maxlevels', JSON.stringify(g.challenge_maxlevels), before.challengeMaxLevels)
    for (const word of ['One', 'Two', 'Three', 'Four', 'Five', 'Six'])
        eq('rebirth' + word + 'Count', g['rebirth' + word + 'Count'], before.counts[word])
    eq('rebirthSevenCount', g.rebirthSevenCount, before.counts.Seven + 1)

    // All SEVEN timers, and rebirthSixTime is the load-bearing one: layer 7 keeps rebirthSixCount, so
    // leaving that timer set closes the sigil grace window from the first tick and the first Ledger
    // after every Authorship pays S = 0 whatever the player wears.
    for (const word of ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven'])
        eq('rebirth' + word + 'Time', g['rebirth' + word + 'Time'], 0)
    eq('stats.fastest7', g.stats.fastest7, before.fastestSeven == null ? before.sevenTime : Math.min(before.fastestSeven, before.sevenTime))

    eq('active_challenge', g.active_challenge, '')

    // Tasks. Uninscribed max levels go to 0 at phase 11; an inscribed task gets its recorded peak
    // handed back at phase 13.
    const records = JSON.parse(before.tasks)
    for (const name of Object.keys(g.taskData)) {
        const task = g.taskData[name]
        if (task.level !== 0 || task.xp !== 0 || task.xpBigInt !== 0n || task.isHero)
            problems.push(`task ${name} survived the Authorship: level=${task.level} xp=${task.xp} xpBigInt=${task.xpBigInt} isHero=${task.isHero}`)
        eq(`taskData.${name}.maxLevel`, task.maxLevel, records[name] !== undefined ? records[name].base : 0)
    }

    /*
        INSCRIPTIONS SURVIVE. This is the single most load-bearing assertion in the layer: "An
        inscription survives every reset from here on" is shipped copy in index.html and
        js/tooltips.js, and layer 7 keeps that promise with zero code - which is exactly the kind of
        behaviour a later edit deletes without noticing. The record itself must be byte-identical.

        taxed and pledged are the two ratchets, and phase 14 rebalances both: `taxed` back to the
        live inscription list (nothing is owed once the Etching balance is gone) and `pledged` down
        to the live count, so a stale high-water cannot hand out free re-targeting forever.
    */
    eq('inscriptions.milestones', JSON.stringify(g.inscriptions.milestones), before.milestones)
    eq('inscriptions.tasks', JSON.stringify(g.inscriptions.tasks), before.tasks)
    eq('inscriptions.taxed', JSON.stringify(g.inscriptions.taxed), before.milestones)
    eq('inscriptions.pledged', g.inscriptions.pledged, before.inscriptionCount)

    // The Marginal track revokes - asserted through isCompleted(), NOT .completed, so the re-latch
    // path is actually exercised against the zeroed balance. Reading the latch alone would pass even
    // if etchings_log10 were still positive.
    if (before.marginalLatched !== world.exportedMarginalNames.length)
        problems.push(`only ${before.marginalLatched} of ${world.exportedMarginalNames.length} Marginal Milestones were latched before the press, so the revoke assertion is weaker than it looks`)
    for (const name of world.exportedMarginalNames)
        if (g.requirements[name].isCompleted())
            problems.push(`Marginal Milestone "${name}" re-latched after the Authorship - etchings_log10 was not zeroed before rebirthReset()`)

    for (const key of world.exportedDarkMatterUnlocks) eq(`requirements.${key}`, g.requirements[key].completed, false)

    // permanentUnlocks additions: the tab that spends the Axioms the run just paid for must not
    // vanish at the moment of payment, even though its own requirement is priced in the currency
    // this layer just zeroed.
    for (const key of Object.keys(before.permanent))
        if (before.permanent[key]) eq(`requirements.${key}`, g.requirements[key].completed, true)

    // ...and the three that are deliberately NOT permanent re-lock.
    for (const key of ['Rebirth button 7', 'Rebirth note 10', 'key7'])
        if (g.requirements[key].isCompleted())
            problems.push(`requirements.${key} is still met after the Authorship, expected it to re-lock`)

    return problems
}

/*
    (L) With axioms_owned == 0, every Axiom hook must be provably identity.

    This is the assertion that protects the ~everyone who will never own an Axiom, and it is worth
    more than any statement about what an Axiom does. Each of the seven is an edit to an existing
    seam rather than a new code path, so the failure mode is not "the Axiom is broken" - it is "the
    game changed for players who did not buy it", which no other suite here would see.

    Four of the seven hooks live in js/main.js, which this harness deliberately does not load (its
    boot sequence needs a DOM). AXIOM_HOOK_COVERAGE records that fact per Axiom rather than leaving
    it implicit, and a catalogue entry with no row fails - so adding an eighth Axiom forces someone
    to decide whether its identity is provable here, instead of silently not being.
*/
function checkUnleviedIdentity(seed) {
    const problems = []
    const world = buildWorld()
    randomizeWorld(world, seed)
    const g = world.gameData

    // ARMED_MILESTONE_INSCRIPTION is essence-priced, so it is in the W term's domain.
    g.requirements[ARMED_MILESTONE_INSCRIPTION].completed = true

    g.inscriptions.taxed = []
    const untaxed = world.countUninscribedMilestonesCompleted()
    g.inscriptions.taxed = [ARMED_MILESTONE_INSCRIPTION]
    const taxed = world.countUninscribedMilestonesCompleted()

    if (taxed !== untaxed - 1)
        problems.push(`countUninscribedMilestonesCompleted() counted ${untaxed} untaxed and ${taxed} taxed; with the Axiom unowned the taxed skip must still cost exactly one`)

    return problems
}

function checkDressRehearsalIdentity(seed) {
    const problems = []
    const world = buildWorld()
    randomizeWorld(world, seed)
    const g = world.gameData

    // enterChallenge() refuses to start while any sigil is worn.
    g.sigils = 0
    g.sigils_broken = 0
    g.active_challenge = ''
    g.challenge_maxlevels = {}
    for (const name of Object.keys(g.taskData)) g.taskData[name].maxLevel = 4321

    world.enterChallenge('dance_with_the_devil')
    world.exitChallenge()

    for (const name of Object.keys(g.taskData))
        if (g.taskData[name].maxLevel !== 0) {
            problems.push(`with the Axiom unowned, ${name} came out of a challenge round trip at maxLevel ${g.taskData[name].maxLevel}, expected 0`)
            break
        }

    if (JSON.stringify(g.challenge_maxlevels) !== '{}')
        problems.push(`a challenge round trip wrote gameData.challenge_maxlevels with the Axiom unowned: ${JSON.stringify(g.challenge_maxlevels)}`)

    return problems
}

function checkNothingIsUnlearnedIdentity(seed) {
    const problems = []

    // Phase 11 - "zero". One layer that has always zeroed and one that must keep doing so.
    for (const layer of [2, 6]) {
        const world = buildWorld()
        randomizeWorld(world, seed)
        setGate(world, layer, true)

        if (!world.doRebirth(layer)) { problems.push(`layer ${layer}: doRebirth returned false with the gate open`); continue }

        for (const name of Object.keys(world.gameData.taskData))
            if (world.gameData.taskData[name].maxLevel !== 0) {
                problems.push(`layer ${layer}: with the Axiom unowned, ${name} kept maxLevel ${world.gameData.taskData[name].maxLevel} - phase 11 must still zero it`)
                break
            }
    }

    // Phase 9 - "recall". The Axiom would turn the assignment into Math.max(task.maxLevel, recalled);
    // unowned it must still OVERWRITE, so the pre-reset maxLevel cannot survive. rebirthReset()'s own
    // level -> maxLevel promotion at phase 10 is the other half of the expected value.
    const world = buildWorld()
    randomizeWorld(world, seed)
    setGate(world, 3, true)

    // Pin the recall multiplier at 1 and put every peak ABOVE its live level. Left randomized,
    // Cosmic Recollection's effect reaches ~1600 when it happens to be a hero, floor(effect * level)
    // then dwarfs any maxLevel a world can hold, and the mutation this check exists to catch -
    // phase 9 raising instead of overwriting - becomes invisible for most seeds.
    const g = world.gameData
    g.taskData['Cosmic Recollection'].isHero = false
    g.taskData['Cosmic Recollection'].level = 0
    for (const name of Object.keys(g.taskData)) g.taskData[name].maxLevel = g.taskData[name].level + 1000

    const recallEffect = g.taskData['Cosmic Recollection'].getEffect()
    const expected = {}
    for (const name of Object.keys(g.taskData))
        expected[name] = Math.max(g.taskData[name].level, Math.floor(recallEffect * g.taskData[name].level))

    if (!world.doRebirth(3)) {
        problems.push('layer 3: doRebirth returned false with the gate open')
    } else {
        for (const name of Object.keys(g.taskData))
            if (g.taskData[name].maxLevel !== expected[name]) {
                problems.push(`layer 3: with the Axiom unowned, ${name} ended at maxLevel ${g.taskData[name].maxLevel}, expected ${expected[name]} - phase 9 must overwrite, not raise`)
                break
            }
    }

    return problems
}

const AXIOM_HOOK_COVERAGE = {
    the_same_hand: { reachable: false, why: 'makeHero() is in js/main.js, which this harness does not load' },
    the_long_hour: { reachable: false, why: "calc_offline_progress()'s offline_max_time is in js/main.js" },
    unlevied: { reachable: true, check: checkUnleviedIdentity },
    born_heroic: { reachable: false, why: 'isHeroesUnlocked() is in js/main.js' },
    dress_rehearsal: { reachable: true, check: checkDressRehearsalIdentity },
    the_book_reopens: { reachable: false, why: 'applyAxioms() is in js/main.js' },
    nothing_is_unlearned: { reachable: true, check: checkNothingIsUnlearnedIdentity },
}

function checkAxiomIdentityAtZero(seed) {
    const problems = []

    const world = buildWorld()
    randomizeWorld(world, seed)
    const g = world.gameData
    const axiomConsts = world.exportedAxioms

    // (1) The accounting itself is inert.
    if (g.axioms_owned !== 0) problems.push(`randomizeWorld left axioms_owned at ${g.axioms_owned}, expected 0 by default`)
    for (const key of axiomConsts.names) {
        if (world.hasAxiom(key)) problems.push(`hasAxiom("${key}") is true at axioms_owned == 0`)
        if (world.canRefundAxiom(key)) problems.push(`canRefundAxiom("${key}") is true with nothing owned`)
    }
    if (world.hasAxiom('no_such_axiom')) problems.push('hasAxiom() answered true for a key outside the catalogue')
    if (world.getSpentAxioms() !== 0) problems.push(`getSpentAxioms() is ${world.getSpentAxioms()} at axioms_owned == 0, expected 0`)
    if (world.getTotalAxioms() !== g.axioms) problems.push(`getTotalAxioms() is ${world.getTotalAxioms()}, expected the unspent balance ${g.axioms}`)

    // (2) Every catalogue entry is accounted for, in both directions.
    for (const entry of axiomConsts.catalogue)
        if (!(entry.key in AXIOM_HOOK_COVERAGE))
            problems.push(`Axiom "${entry.key}" has no AXIOM_HOOK_COVERAGE row - decide whether its hook is reachable from this harness and say which`)
    for (const key of Object.keys(AXIOM_HOOK_COVERAGE))
        if (!axiomConsts.names.includes(key))
            problems.push(`AXIOM_HOOK_COVERAGE names "${key}", which is not in AXIOM_CATALOGUE`)

    // (3) The reachable hooks, one at a time, so a failure names the Axiom.
    for (const key of Object.keys(AXIOM_HOOK_COVERAGE)) {
        const coverage = AXIOM_HOOK_COVERAGE[key]
        if (!coverage.reachable) continue
        for (const problem of coverage.check(seed)) problems.push(`${key}: ${problem}`)
    }

    // (4) No layer writes the layer-7 currency it was not given. This is deliberately a direct read
    // of the post-state rather than an oracle diff: the oracle calls the LIVE rebirthReset on both
    // sides, so a `gameData.axioms = 0` added in there would be applied to both and diff clean.
    for (let layer = 1; layer <= 7; layer++) {
        const w = buildWorld()
        randomizeWorld(w, seed)
        setGate(w, layer, true)
        if (layer === 7) armAuthorship(w)

        const gd = w.gameData
        gd.axioms = 4
        gd.stats.totalAxiomsEarned = 9
        const gain = layer === 7 ? w.getAxiomGain() : 0

        if (!w.doRebirth(layer)) { problems.push(`layer ${layer}: doRebirth returned false with the gate open`); continue }

        if (gd.axioms_owned !== 0) problems.push(`layer ${layer} wrote axioms_owned: ${gd.axioms_owned}, expected 0`)
        if (gd.axioms !== 4 + gain) problems.push(`layer ${layer} left gameData.axioms at ${gd.axioms}, expected ${4 + gain}`)
        if (gd.stats.totalAxiomsEarned !== 9 + gain) problems.push(`layer ${layer} left stats.totalAxiomsEarned at ${gd.stats.totalAxiomsEarned}, expected ${9 + gain}`)
    }

    return problems
}

/*
    (M) The other direction: two worlds from one seed, one owning the entire catalogue. Any state
    difference outside the licence list is an Axiom leaking into the cascade.

    This is the only instrument that can see an Axiom's effect on a prestige reset, and it is what an
    edit placed inside rebirthReset() would otherwise escape entirely (see (4) above).

    AXIOM_LICENCES has one entry per catalogue key, and an entry is a promise about what that Axiom
    is allowed to move and on which layers. Four of the seven are licensed to move NOTHING here, and
    that is a statement about this harness rather than about the Axiom: their seams live in
    js/main.js, which this file does not load. `layers` is not decoration - it is what makes
    "Nothing Is Unlearned is scoped to layers 1-6" an assertion rather than a comment, because layer
    7 is left unlicensed and its max levels must therefore still come out identical.

    Do not widen an entry to make a run green. A path names one field of one snapshot section;
    'tasks.*.maxLevel' names one field of the joined task record, not the record.
*/
const AXIOM_LICENCES = {
    // js/main.js seams. Not reachable here, so nothing is licensed and any movement is a real
    // escape - which is also the only thing this suite can say about them.
    the_same_hand: { layers: [], paths: [] },
    the_long_hour: { layers: [], paths: [] },
    born_heroic: { layers: [], paths: [] },
    // Half of it is applyAxioms() in js/main.js. The half that lives here, isLedgerUnlocked(), is
    // pinned instead by latching "The End" in both worlds below.
    the_book_reopens: { layers: [], paths: [] },
    // js/challenges.js, and this suite never enters a challenge.
    dress_rehearsal: { layers: [], paths: [] },
    // Moves the W term of getEtchingGainLog10, so the two layers that grant off that formula grant
    // different amounts. Layer 7's grant lands in gameData.axioms, which is licensed already.
    unlevied: { layers: [6, 7], paths: ['scalars.etchings_log10'] },
    // The whole of it: doRebirth phases 9 and 11, one field of one section, layers 1-6 only.
    nothing_is_unlearned: { layers: [1, 2, 3, 4, 5, 6], paths: ['tasks.*.maxLevel'] },
}

function checkAxiomContainment(layer, seed) {
    const problems = []

    const none = buildWorld()
    randomizeWorld(none, seed, false, false)
    setGate(none, layer, true)

    const all = buildWorld()
    randomizeWorld(all, seed, false, true)
    setGate(all, layer, true)

    if (layer === 7) {
        armAuthorship(none)
        armAuthorship(all)
    }

    // Latch "The End" in BOTH worlds. The Book Reopens' half that lives in js/ledger.js is
    // isLedgerUnlocked(), which substitutes an essence threshold for exactly this latch - and
    // randomizeWorld latches requirements at random against essence up to 1e308, so leaving it
    // random means the layer-6 payoutGate itself can differ between the two worlds. A containment
    // suite whose two worlds took different paths through the press cannot say anything about
    // containment; it just prints the whole snapshot. Latched, the Axiom is a no-op here and says
    // so, and the seeds stay deterministic.
    none.gameData.requirements['The End'].completed = true
    all.gameData.requirements['The End'].completed = true

    none.doRebirth(layer)
    all.doRebirth(layer)

    // Purchases are permanent. No layer revokes an Axiom, layer 7 included - it grants the currency
    // and never spends or destroys it. Asserted here rather than in the post-state table because
    // this is the only suite that presses a button with the catalogue actually owned.
    if (none.gameData.axioms_owned !== 0)
        problems.push(`layer ${layer}: the unowned world came out with axioms_owned = ${none.gameData.axioms_owned}, expected 0`)
    if (all.gameData.axioms_owned !== all.exportedAxioms.allBits)
        problems.push(`layer ${layer}: axioms_owned went from ${all.exportedAxioms.allBits} to ${all.gameData.axioms_owned} - a prestige reset revoked a purchased Axiom`)

    // The two fields randomizeWorld's `axioms` block writes, plus whatever the catalogue is licensed
    // to move ON THIS LAYER. An Axiom licensed for layers 1-6 is unlicensed here when layer is 7.
    const licensed = new Set(['scalars.axioms', 'scalars.axioms_owned'])
    const licensedTaskFields = new Set()

    for (const key of Object.keys(AXIOM_LICENCES)) {
        const licence = AXIOM_LICENCES[key]
        if (!licence.layers.includes(layer)) continue
        for (const path of licence.paths) {
            // out.tasks is one joined string per task, so a task licence has to name a FIELD of that
            // join rather than the whole record - otherwise licensing maxLevel would also license
            // level, isHero and every other field beside it.
            if (path.startsWith('tasks.*.')) licensedTaskFields.add(path.slice('tasks.*.'.length))
            else licensed.add(path)
        }
    }

    const a = snapshot(none)
    const b = snapshot(all)

    for (const section of Object.keys(a)) {
        if (typeof a[section] !== 'object' || a[section] === null) {
            if (a[section] !== b[section])
                problems.push(`layer ${layer}: ${section} escaped containment: unowned=${a[section]} owned=${b[section]}`)
            continue
        }

        for (const key of Object.keys(a[section])) {
            if (licensed.has(`${section}.${key}`)) continue
            const x = JSON.stringify(a[section][key])
            const y = JSON.stringify(b[section][key])
            if (x === y) continue

            if (section === 'tasks' && licensedTaskFields.size > 0) {
                const fieldsA = a[section][key].split('|')
                const fieldsB = b[section][key].split('|')
                for (let i = 0; i < TASK_SNAPSHOT_FIELDS.length; i++) {
                    if (licensedTaskFields.has(TASK_SNAPSHOT_FIELDS[i])) continue
                    if (fieldsA[i] !== fieldsB[i])
                        problems.push(`layer ${layer}: tasks.${key}.${TASK_SNAPSHOT_FIELDS[i]} escaped containment: unowned=${fieldsA[i]} owned=${fieldsB[i]}`)
                }
                continue
            }

            problems.push(`layer ${layer}: ${section}.${key} escaped containment: unowned=${x} owned=${y}`)
        }
    }

    return problems
}

// ---------------------------------------------------------------------------------------------

function main() {
    const trials = Number(process.argv[2] || 400)
    const failures = []
    let cases = 0

    // The oracle stays at layers 1-5 and inscribe = false: that diff is the regression guard for the
    // resetMetaverse() extraction, and it only proves the extraction while inscriptions are empty.
    for (let trial = 0; trial < trials; trial++) {
        for (let layer = 1; layer <= 5; layer++) {
            const seed = trial * 31 + layer

            const worldA = buildWorld()
            randomizeWorld(worldA, seed)
            setGate(worldA, layer, trial % 8 !== 0)

            const worldB = buildWorld()
            randomizeWorld(worldB, seed)
            const gateOpen = setGate(worldB, layer, trial % 8 !== 0)

            const startA = snapshot(worldA)
            const startB = snapshot(worldB)
            const setupDrift = diff(startA, startB)
            if (setupDrift.length > 0) {
                failures.push({ seed, layer, phase: 'setup', problems: setupDrift.slice(0, 5) })
                continue
            }

            runOracle(worldA, layer)
            const returned = worldB.doRebirth(layer)
            cases++

            if (returned !== gateOpen)
                failures.push({ seed, layer, phase: 'gate', problems: [`doRebirth returned ${returned}, gateOpen=${gateOpen}`] })

            const after = snapshot(worldB)
            if (!gateOpen) {
                const moved = diff(startB, after)
                if (moved.length > 0)
                    failures.push({ seed, layer, phase: 'gated-noop', problems: moved.slice(0, 5) })
            }

            const problems = diff(snapshot(worldA), after)
            if (problems.length > 0)
                failures.push({ seed, layer, gateOpen, problems: problems.slice(0, 8) })
        }
    }

    // Layer 6 has no original, so it is pinned by the suites instead. They are far more expensive per
    // seed than one oracle case, so they run over a bounded slice of the same seed space.
    const assertionTrials = Math.max(1, Math.min(trials, 25))
    const suiteCounts = {}
    let assertions = 0

    const runSuite = (name, context, problems) => {
        assertions++
        suiteCounts[name] = (suiteCounts[name] || 0) + 1
        if (problems.length > 0)
            failures.push(Object.assign({ phase: name, problems: problems.slice(0, 8) }, context))
    }

    runSuite('table-integrity', {}, checkTableIntegrity(buildWorld()))
    runSuite('etching-terms', {}, checkEtchingTerms(buildWorld()))

    for (let trial = 0; trial < assertionTrials; trial++) {
        const seed = 9001 + trial * 7

        runSuite('payout-gate', { seed }, checkPayoutGate(seed))
        runSuite('challenge-suspension', { seed }, checkChallengeSuspension(seed))
        runSuite('layer-six-post-state', { seed }, checkLayerSixPostState(seed))
        runSuite('layer-five-six-agreement', { seed }, checkLayerFiveSixAgreement(seed))
        runSuite('authorship-payout-gate', { seed }, checkAuthorshipPayoutGate(seed))
        runSuite('layer-seven-ordering', { seed }, checkLayerSevenOrdering(seed))
        runSuite('layer-seven-post-state', { seed }, checkLayerSevenPostState(seed))

        for (let layer = 1; layer <= 7; layer++)
            runSuite('inscription-containment', { seed, layer }, checkInscriptionContainment(layer, seed))

        for (const layer of [4, 5, 6, 7])
            runSuite('grant-ordering', { seed, layer }, checkGrantOrdering(layer, seed))
    }

    // The two Axiom suites build a world per layer, so they run over a shorter slice of the same
    // seed space. What they assert is structural rather than seed-sensitive: nothing in either one
    // branches on a randomized value that a handful of seeds would not already cover.
    const axiomTrials = Math.max(1, Math.min(assertionTrials, 8))
    for (let trial = 0; trial < axiomTrials; trial++) {
        const seed = 9001 + trial * 7

        runSuite('axiom-identity-at-zero', { seed }, checkAxiomIdentityAtZero(seed))
        for (const layer of [1, 3, 6, 7])
            runSuite('axiom-containment', { seed, layer }, checkAxiomContainment(layer, seed))
    }

    console.log(`rebirth-oracle: ${cases} oracle cases (layers 1-5) + ${assertions} assertions (layers 1-7)`)
    for (const name of Object.keys(suiteCounts)) console.log(`  ${name}: ${suiteCounts[name]}`)

    if (failures.length === 0) {
        console.log('PASS - layers 1-5 are behaviour-identical to the original five functions, and layers 6-7 satisfy their assertion suites')
        process.exit(0)
    }

    console.log(`\nFAIL - ${failures.length} failing cases\n`)
    for (const f of failures.slice(0, 5)) {
        const context = [f.phase || 'oracle']
        if (f.layer !== undefined) context.push(`layer ${f.layer}`)
        if (f.seed !== undefined) context.push(`seed ${f.seed}`)
        if (f.gateOpen !== undefined) context.push(`gateOpen=${f.gateOpen}`)
        console.log(`  ${context.join(', ')}`)
        for (const p of f.problems) console.log(`    ${p}`)
    }
    process.exit(1)
}

main()

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

    Scope. The five verbatim originals are an oracle for layers 1-5 only; layer 6 has no original to
    diff against and is covered by the assertion suites below instead. The 1-5 oracle diff is also
    the regression guard for the resetMetaverse() extraction - it only holds while that suite runs
    with gameData.inscriptions empty, which is where the extraction is provably identity. Do not add
    a sixth "original".

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
const SOURCES = ['js/utils.js', 'js/classes.js', 'js/challenges.js', 'js/ui.js', 'js/data.js', 'js/milestones.js', 'js/ledger.js', 'js/rebirth.js']

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
function randomizeWorld(sandbox, seed, inscribe = false) {
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

    for (let i = 1; i <= 6; i++) {
        const word = ['One', 'Two', 'Three', 'Four', 'Five', 'Six'][i - 1]
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

    return rng
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

    plain.doRebirth(layer)
    inscribed.doRebirth(layer)

    const records = inscribed.gameData.inscriptions.tasks
    const milestones = inscribed.gameData.inscriptions.milestones
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
    for (const key of ['Metaverse', 'Metaverse Perks', 'Congratulations']) before.latches[key] = g.requirements[key].completed

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

    for (let trial = 0; trial < assertionTrials; trial++) {
        const seed = 9001 + trial * 7

        runSuite('payout-gate', { seed }, checkPayoutGate(seed))
        runSuite('challenge-suspension', { seed }, checkChallengeSuspension(seed))
        runSuite('layer-six-post-state', { seed }, checkLayerSixPostState(seed))
        runSuite('layer-five-six-agreement', { seed }, checkLayerFiveSixAgreement(seed))

        for (let layer = 1; layer <= 6; layer++)
            runSuite('inscription-containment', { seed, layer }, checkInscriptionContainment(layer, seed))

        for (const layer of [4, 5, 6])
            runSuite('grant-ordering', { seed, layer }, checkGrantOrdering(layer, seed))
    }

    console.log(`rebirth-oracle: ${cases} oracle cases (layers 1-5) + ${assertions} assertions (layers 1-6)`)
    for (const name of Object.keys(suiteCounts)) console.log(`  ${name}: ${suiteCounts[name]}`)

    if (failures.length === 0) {
        console.log('PASS - layers 1-5 are behaviour-identical to the original five functions, and layer 6 satisfies its assertion suite')
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

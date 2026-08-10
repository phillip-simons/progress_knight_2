/*
    The prestige cascade.

    rebirthOne() through rebirthFive() were five hand-written blocks of field assignments that shared
    most of their behaviour and drifted in the details. They are now one driver plus a table.

    The table is NOT purely declarative, and pretending otherwise is how this cascade breaks: every
    bug it has had was an *ordering* bug or an irregular special case, neither of which a flat list of
    fields can express. The phase order below is the actual specification. Each phase carries the
    constraint that pins it there.

     0  payout gate     - optional per-layer predicate, checked BEFORE the counter increment.
                          Layer 6 only. A Ledger with no gain would still run the full wipe, and the
                          view-level guard covers only one of the three entry points (sidebar button,
                          rebirth note button, `r` keybind).
     1  count           - the layer's own counter.
     2  pre-grant clears - layer 4 only, which zeroes essence/evil *before* computing its grant.
     3  grants          - MUST precede the general clears. getDarkMatterGain() reads a challenge bonus
                          that phase 6 is about to wipe, and getMetaversePerkPointsGain() reads the
                          essence that phase 5 zeroes. Grants are irregular (+=, clamped +=, plain
                          assignment), so each is a function rather than a table field.
     4  evil perks      - layers 2/3 use the guarded resetEvilPerks(); layers 4/5 inline a partial,
                          *unguarded* reset that ignores God's Blessings and evil_perks_keep. That is
                          almost certainly a bug, but it is frozen here as literal behaviour. Fixing
                          it is a separate change with its own release note.
     5  clears          - MUST precede rebirthReset(), which reads dark_matter_shop.a_miracle to
                          re-grant Magic Eye and reads the currencies for its tab-retention test.
                          Layers 5 and 6 share the same teardown via resetMetaverse(); it runs last
                          within the phase, after the table's own clears.
     6  challenge wipe  - two different predicates: layer 4 is spared by challenge_altar OR
                          save_challenges, layer 5 only by save_challenges.
     7  revokes         - MUST precede rebirthReset()'s preserve-loop, because the three Dark Matter
                          keys layer 5 revokes are themselves in permanentUnlocks.
     8  stat, then timers - the fastestN stat reads its timer before phase 9 zeroes it.
     9  maxLevel BEFORE - layer 3 only. Reads pre-reset task.level and *overwrites* maxLevel.
    10  rebirthReset()  - shared teardown. Promotes level into maxLevel.
    11  maxLevel AFTER  - layers 2/4/5/6. Exists purely to undo that promotion. Layer 1 does neither
                          and inherits it, which is what makes layer 1 a "keep" rather than a "zero".
    12  active_challenge - last: getChallengeBonus and the dark matter ability effects all branch on
                          it. Layer 1 never clears it at all.
    13  inscriptions    - MUST be last. Writes back the Layer 6 record (milestone latches, task max
                          levels) and then balances the W / pledge books. No-op while
                          active_challenge is set, so it has to run after phase 12; and after phase
                          11, or the restored max levels are re-zeroed.

    maxLevel is therefore a pipeline *position*, not a value: keep / recall (before) / zero (after).
    No table field can say "runs on the other side of the rebirthReset call".

    Verified against the original five functions by test/rebirth-oracle.js, which keeps them verbatim
    as an oracle and diffs final state across randomized inputs. Run it after touching this file.
*/

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

const REBIRTH_LAYERS = {
    1: {
        gate: "Rebirth button 1",
        countKey: "rebirthOneCount",
        statKey: "fastest1",
        timerKey: "rebirthOneTime",
        timersCleared: ["rebirthOneTime"],
        grant: null,
        evilPerks: "none",
        maxLevel: "keep",
        clearActiveChallenge: false,
    },

    2: {
        gate: "Rebirth button 2",
        countKey: "rebirthTwoCount",
        statKey: "fastest2",
        timerKey: "rebirthTwoTime",
        timersCleared: ["rebirthOneTime", "rebirthTwoTime"],
        grant: () => { gameData.evil += getEvilGain() },
        evilPerks: "guarded",
        maxLevel: "zero",
        clearActiveChallenge: true,
    },

    3: {
        gate: "Rebirth button 3",
        countKey: "rebirthThreeCount",
        statKey: "fastest3",
        timerKey: "rebirthThreeTime",
        timersCleared: ["rebirthOneTime", "rebirthTwoTime", "rebirthThreeTime"],
        grant: () => {
            gameData.essence += getEssenceGain()
            if (gameData.essence == Infinity || gameData.essence > 1e308)
                gameData.essence = 1e308
            // Assignment, not +=: transcending destroys accumulated evil unless the metaverse
            // evil-transfer upgrade is owned.
            gameData.evil = evilTranGain()
        },
        evilPerks: "guarded",
        maxLevel: "recall",
        clearActiveChallenge: true,
    },

    4: {
        gate: "Rebirth button 4",
        countKey: "rebirthFourCount",
        statKey: "fastest4",
        timerKey: "rebirthFourTime",
        timersCleared: ["rebirthOneTime", "rebirthTwoTime", "rebirthThreeTime", "rebirthFourTime"],
        preGrantClears: { "essence": 0, "evil": 0 },
        grant: () => { gameData.dark_matter += getDarkMatterGain() },
        evilPerks: "inline",
        challengeWipe: () => gameData.metaverse.challenge_altar == 0 && gameData.perks.save_challenges == 0,
        maxLevel: "zero",
        clearActiveChallenge: true,
    },

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
}

function setGameDataPath(path, value) {
    const parts = path.split(".")
    let target = gameData
    for (let i = 0; i < parts.length - 1; i++)
        target = target[parts[i]]
    target[parts[parts.length - 1]] = value
}

function applyGameDataPaths(paths) {
    if (paths === undefined) return
    for (const path in paths)
        setGameDataPath(path, paths[path])
}

function setAllMaxLevels(value) {
    for (const taskName in gameData.taskData)
        gameData.taskData[taskName].maxLevel = value
}

// Returns false when the layer's gate is not met, matching the original early returns.
function doRebirth(layer) {
    const spec = REBIRTH_LAYERS[layer]

    if (!gameData.requirements[spec.gate].isCompleted())
        return false

    if (spec.payoutGate !== undefined && !spec.payoutGate())            // 0
        return false

    // Everything past the gates runs inside try/catch. doRebirth is reached from onClick, not from
    // update(), so a throw here lands in window.onerror - which shows the banner but does NOT stop
    // saveloop the way onTickError does. A half-executed cascade would then be committed to
    // localStorage within three seconds, with no recovery path.
    try {
        return runRebirthPhases(layer, spec)
    } catch (error) {
        // The oracle harness loads this file without main.js, and there a swallowed throw would turn
        // a real failure into a silent pass.
        if (typeof onTickError != "function") throw error
        onTickError(error)
        return false
    }
}

function runRebirthPhases(layer, spec) {
    gameData[spec.countKey] += 1                                        // 1

    applyGameDataPaths(spec.preGrantClears)                             // 2

    if (spec.grant !== null)                                            // 3
        spec.grant()

    if (spec.evilPerks === "guarded") {                                 // 4
        resetEvilPerks()
    } else if (spec.evilPerks === "inline") {
        gameData.evil_perks_points = 0
        gameData.evil_perks.receive_essence = 0
    }

    applyGameDataPaths(spec.clears)                                     // 5
    for (const group of spec.conditionalClears || []) {
        if (group.when())
            applyGameDataPaths(group.paths)
    }

    if (spec.resetMetaverse)                                            // 5, shared by layers 5/6
        resetMetaverse(layer)

    if (spec.challengeWipe !== undefined && spec.challengeWipe()) {     // 6
        for (const challenge in gameData.challenges)
            gameData.challenges[challenge] = 0
        // The original also cleared requirements["Challenges"].completed here. That was dead code:
        // "Challenges" is in neither exemption list, so rebirthReset() clears it two phases later.
    }

    for (const key of spec.revokes || [])                               // 7
        gameData.requirements[key].completed = false

    if (gameData.stats[spec.statKey] == null || gameData[spec.timerKey] < gameData.stats[spec.statKey])
        gameData.stats[spec.statKey] = gameData[spec.timerKey]          // 8
    for (const timer of spec.timersCleared)
        gameData[timer] = 0

    if (spec.maxLevel === "recall") {                                   // 9
        const recallEffect = gameData.taskData["Cosmic Recollection"].getEffect()
        for (const taskName in gameData.taskData) {
            const task = gameData.taskData[taskName]
            task.maxLevel = Math.floor(recallEffect * task.level)
        }
    }

    rebirthReset()                                                      // 10

    if (spec.maxLevel === "zero")                                       // 11
        setAllMaxLevels(0)

    if (spec.clearActiveChallenge)                                      // 12
        gameData.active_challenge = ""

    restoreInscriptions()                                               // 13

    // Layer 6 only. Both ratchets this clears - `taxed` (the milestones W refuses to pay for) and
    // `pledged` (the slot high-water) - exist to stop inscriptions being churned for profit, and a
    // Ledger is the only reset that costs enough to have earned the reset. Running it on any cheaper
    // layer is an exploit: un-inscribe everything (which leaves `taxed` intact, so W stays
    // suppressed), press Rebirth One, and both ratchets clear while essence survives to re-latch
    // every milestone - restoring W to its maximum and refunding the pledge.
    if (layer === 6)
        reconcileInscriptionsAfterLedger()

    return true
}

// Bound to onClick in index.html.
function rebirthOne() { return doRebirth(1) }
function rebirthTwo() { return doRebirth(2) }
function rebirthThree() { return doRebirth(3) }
function rebirthFour() { return doRebirth(4) }
function rebirthFive() { return doRebirth(5) }
function rebirthSix() { return doRebirth(6) }

function resetEvilPerks() {
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

// Shared teardown for every layer, and for entering and leaving a challenge.
function rebirthReset(set_tab_to_jobs = true) {
    if (set_tab_to_jobs) {
        if (gameData.settings.selectedTab == Tab.METAVERSE && gameData.hypercubes > 0
            || gameData.settings.selectedTab == Tab.CHALLENGES && gameData.evil > 10000
            || gameData.settings.selectedTab == Tab.MILESTONES && gameData.essence > 0
            || gameData.settings.selectedTab == Tab.DARK_MATTER && gameData.dark_matter > 0
            || gameData.settings.selectedTab == Tab.LEDGER && gameData.etchings_log10 > LOG_ZERO
            || gameData.settings.selectedTab == Tab.REBIRTH
            || gameData.settings.selectedTab == Tab.EVILPERKS
            || gameData.settings.selectedTab == Tab.INFO
        ) {
            // do not switch tab
        }
        else
            setTab("jobs")
    }

    gameData.coins = 0
    gameData.days = 365 * 14
    gameData.realtime = 0
    gameData.currentJob = gameData.taskData["Beggar"]
    gameData.currentProperty = gameData.itemData["Homeless"]
    gameData.currentMisc = []
    gameData.stats.EssencePerSecond = 0
    gameData.stats.maxEssencePerSecond = 0
    gameData.stats.maxEssencePerSecondRt = 0
    gameData.stats.EvilPerSecond = 0
    gameData.stats.maxEvilPerSecond = 0
    gameData.stats.maxEvilPerSecondRt = 0
    autoBuyEnabled = true

    for (const taskName in gameData.taskData) {
        const task = gameData.taskData[taskName]
        if (task.level > task.maxLevel) task.maxLevel = task.level
        task.level = 0
        task.xp = 0
        task.xpBigInt = BigInt(0)
        task.isHero = false
        task.isFinished = false
    }

    for (const itemName in gameData.itemData) {
        var item = gameData.itemData[itemName]
        item.isHero = false
    }

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

    // Keep milestones which were bought in the Dark Matter shop
    if (gameData.dark_matter_shop.a_miracle) {
        gameData.requirements["Magic Eye"].completed = true
        if (gameData.rebirthOneCount == 0)
            gameData.rebirthOneCount = 1
    }
}

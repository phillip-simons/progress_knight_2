/*
    The prestige cascade.

    rebirthOne() through rebirthFive() were five hand-written blocks of field assignments that shared
    most of their behaviour and drifted in the details. They are now one driver plus a table.

    The table is NOT purely declarative, and pretending otherwise is how this cascade breaks: every
    bug it has had was an *ordering* bug or an irregular special case, neither of which a flat list of
    fields can express. The phase order below is the actual specification. Each phase carries the
    constraint that pins it there.

     0  payout gate     - optional per-layer predicate, checked BEFORE the counter increment.
                          Layers 6 and 7. A Ledger with no gain would still run the full wipe, and
                          the view-level guard covers only one of the three entry points (sidebar
                          button, rebirth note button, `r` keybind). Layer 7 additionally carries the
                          variety clauses of its gate here, because neither "four different sigils
                          served" nor "something inscribed" is expressible as a Requirement
                          threshold.
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
                          Layers 5, 6 and 7 share the same teardown via resetMetaverse(); it runs
                          last within the phase, after the table's own clears. Layer 7 has two more
                          constraints of the same class: etchings_log10 must be zeroed here or the
                          Marginal Milestones un-latched at phase 10 all re-latch on the next tick,
                          and the sigil masks must be cleared here because rebirthReset()'s preserve
                          loop reads gameData.sigils transitively, through isInscribedMilestone ->
                          areInscriptionsActive -> isChallengeActive.
     6  challenge wipe  - two different predicates: layer 4 is spared by challenge_altar OR
                          save_challenges, layer 5 only by save_challenges.
     7  revokes         - MUST precede rebirthReset()'s preserve-loop, because the three Dark Matter
                          keys layer 5 revokes are themselves in permanentUnlocks.
     8  stat, then timers - the fastestN stat reads its timer before phase 9 zeroes it.
     9  maxLevel BEFORE - layer 3 only. Reads pre-reset task.level and *overwrites* maxLevel. The
                          Nothing Is Unlearned Axiom makes that overwrite a Math.max, for layers
                          1-6 only - see keepsMaxLevelsThroughRebirth().
    10  rebirthReset()  - shared teardown. Promotes level into maxLevel.
    11  maxLevel AFTER  - layers 2/4/5/6/7. Exists purely to undo that promotion. Layer 1 does
                          neither and inherits it, which is what makes layer 1 a "keep" rather than
                          a "zero". The same Axiom skips this phase for layers 1-6, which is why
                          layer 7 keeping its "zero" is what makes an Authorship cost anything.
    12  active_challenge - last: getChallengeBonus and the dark matter ability effects all branch on
                          it. Layer 1 never clears it at all.
    13  inscriptions    - writes back the Layer 6 record (milestone latches, task max levels). The
                          max-level half is suspended while active_challenge is set, so it has to
                          run after phase 12; and after phase 11, or what it restores is re-zeroed.
                          Layer 7 does NOT wipe gameData.inscriptions - an inscription surviving
                          every reset is shipped copy, not a purchase - so this is what carries the
                          player's Layer 6 record into the next book.
    14  reconcile       - MUST be last, and only for a layer that has already destroyed the value of
                          the ratchets it releases. Balances the W / pledge books.

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
        reconcileInscriptions: true,
    },

    /*
        Layer 7 - Authorship. Grants Axioms, revokes the entire Marginal track, and retires the
        Ledger economy into the next book.

        What it KEEPS, deliberately, is layer 6's row comment applied transitively: perks_points and
        the whole perks dict, gameData.challenges, hypercube_cap_unlocked, every rebirthNCount and
        all of gameData.stats. Each of those multiplies the essence and dark-matter chains that
        getEtchingGainLog10() reads, so wiping them would make each Authorship pay less than the one
        before. The counters are a hard requirement rather than a preference: getHypercubeCap() reads
        rebirthFiveCount and isSigilGraceActive() reads rebirthSixCount.

        INSCRIPTIONS SURVIVE UNCONDITIONALLY. That is shipped player-facing copy ("An inscription
        survives every reset from here on"), not a purchase, and it costs zero code here:
        rebirthReset()'s preserve loop already exempts isInscribedMilestone(key) and phase 13 already
        calls restoreInscriptions(). gameData.inscriptions is untouched by this row.

        THE MARGINAL TRACK REVOKES FOR FREE, but only because etchings_log10 is zeroed at phase 5.
        rebirthReset() un-latches all 15 at phase 10 and the next isCompleted() is one tick later; at
        a positive balance every one of them re-latches and the player permanently keeps +7.5 log10
        of gain, 6 inscription slots, 3 sigil slots, the hypercube seed and Palimpsest.

        "The Margin" job category needs no work here. Both its header and Errata Prima are
        EssenceRequirements at 1e300, so zeroing essence hides it and re-climbing restores it,
        exactly as on every Ledger.
    */
    7: {
        gate: "Rebirth button 7",
        // Position 0. Reads the Etching balance, the pending Ledger gain, the sigil history and the
        // inscription counts - every one of which this row is about to destroy. isAuthorshipReady()
        // is the single source for both this and the tab's per-clause display.
        payoutGate: () => isAuthorshipReady(),
        countKey: "rebirthSevenCount",
        statKey: "fastest7",
        timerKey: "rebirthSevenTime",
        // All SEVEN, and rebirthSixTime is the load-bearing one. isSigilGraceActive() is
        // `rebirthSixCount == 0 || rebirthSixTime <= 300`, and layer 7 keeps rebirthSixCount - so
        // leaving that timer set closes the grace window from the first tick, updateSigilService()
        // ORs every bit into sigils_broken, and the first Ledger after every Authorship pays S = 0
        // whatever the player wears, invisibly.
        timersCleared: ["rebirthOneTime", "rebirthTwoTime", "rebirthThreeTime", "rebirthFourTime", "rebirthFiveTime", "rebirthSixTime", "rebirthSevenTime"],
        // Position 3, and it has to be: getAxiomGain() reads gameData.etchings_log10 and the pending
        // getEtchingGainLog10(), and phase 5 below zeroes the first and every input to the second.
        grant: () => { grantAxioms(getAxiomGain()) },
        // Matches layers 4/5/6 rather than the guarded form, for the reason written on layer 6.
        evilPerks: "inline",
        clears: {
            // Position 5, before rebirthReset(). See the header's phase 5 note - both entries here
            // are ordering constraints, not preferences.
            "etchings_log10": LOG_ZERO,
            "sigils": 0,
            "sigils_broken": 0,
            // Without this, getSigilValue() prices the whole first post-Authorship loadout at
            // SIGIL_WEIGHT_REPEAT instead of SIGIL_WEIGHT_FRESH - a silent 3x cut to S for a cycle.
            "last_sigils": 0,
        },
        // resetMetaverse(7) is correct unchanged: both of its layer-6 special cases are guarded on
        // `layer === 6` and both come from Marginal Milestones this row is revoking. Do NOT widen
        // those guards to >= 6.
        resetMetaverse: true,
        // No challengeWipe, matching layer 6. The best scores multiply the gain chains the Etching
        // formula reads.
        revokes: DARK_MATTER_UNLOCKS,
        // Position 11, same reason as layer 6. Rebuilding max levels is the only expensive part of
        // the re-climb, so an Authorship that kept them would be an Authorship with no cost - which
        // is also why the Nothing Is Unlearned Axiom is scoped to layers 1-6 only.
        maxLevel: "zero",
        clearActiveChallenge: true,
        reconcileInscriptions: true,
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

// Nothing Is Unlearned (js/authorship.js) edits exactly two phases of this driver, 9 and 11, and
// nothing else. Layer 7 is excluded unconditionally, which is what its own row's maxLevel: "zero"
// comment says: rebuilding max levels is the only expensive part of the re-climb, so an Authorship
// whose max levels survived would be an Authorship with no cost. Written `layer < 7` rather than
// `!= 7` so that a future layer has to make this decision for itself rather than inherit it.
//
// The companion fix is not optional. Task.getMaxLevelMultiplier() INVERTS under the
// dance_with_the_devil and the_darkest_time sigils, and this is what removes the one-cycle bound on
// maxLevel that made that inverse survivable; MAX_LEVEL_INVERSE_FLOOR (js/classes.js) is what stops
// a worn sigil from becoming a total xp shutdown whose only escape is removing the sigil.
function keepsMaxLevelsThroughRebirth(layer) {
    return layer < 7 && hasAxiom("nothing_is_unlearned")
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
        const keepsMaxLevels = keepsMaxLevelsThroughRebirth(layer)
        for (const taskName in gameData.taskData) {
            const task = gameData.taskData[taskName]
            const recalled = Math.floor(recallEffect * task.level)
            // The recall OVERWRITES, so at a low Cosmic Recollection effect it is a demotion as
            // often as a grant. Nothing Is Unlearned turns it into a ratchet; without the Axiom the
            // assignment is byte-identical to the original layer-3 block.
            task.maxLevel = keepsMaxLevels ? Math.max(task.maxLevel, recalled) : recalled
        }
    }

    rebirthReset()                                                      // 10

    // Phase 11 exists only to undo rebirthReset()'s promotion of level into maxLevel, so skipping it
    // is exactly "the promotion stands" - not a separate write. Layer 7 always takes the zero.
    if (spec.maxLevel === "zero" && !keepsMaxLevelsThroughRebirth(layer)) // 11
        setAllMaxLevels(0)

    if (spec.clearActiveChallenge)                                      // 12
        gameData.active_challenge = ""

    restoreInscriptions()                                               // 13

    // A table field, not a layer number. Both ratchets this clears - `taxed` (the milestones W
    // refuses to pay for) and `pledged` (the slot high-water) - exist to stop inscriptions being
    // churned for profit, so the PROPERTY that admits a layer is: it must already have destroyed
    // what the ratchet was protecting. Layers 6 and 7 both zero the Etching gain chain outright.
    //
    // Running it on any cheaper layer is an exploit: un-inscribe everything (which leaves `taxed`
    // intact, so W stays suppressed), press Rebirth One, and both ratchets clear while essence
    // survives to re-latch every milestone - restoring W to its maximum and refunding the pledge.
    //
    // Not running it on layer 7 is the dangerous direction: uninscribe() never lowers `pledged`, and
    // canInscribe() treats count < pledged as a free slot, so a stale high-water against a LOG_ZERO
    // balance is free re-targeting of every historic slot, forever.
    if (spec.reconcileInscriptions)                                     // 14
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
function rebirthSeven() { return doRebirth(7) }

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
            // Unconditional, unlike every currency-guarded clause above it: an Authorship never
            // zeroes gameData.axioms, so the tab that spends them is never empty after a reset.
            || gameData.settings.selectedTab == Tab.AUTHORSHIP
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

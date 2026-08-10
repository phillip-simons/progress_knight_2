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

// Loadout size. Marginal Milestones raise it, via getMarginalSigilSlotBonus() in js/milestones.js -
// which owns that table. Keeping a second copy of the milestone names here would be two lists with
// nothing asserting they agree. js/milestones.js loads after this file, but getSigilSlots() only
// runs at call time, so the dependency is safe.
const SIGIL_BASE_SLOTS = 2

// A sigil also served through the previous Ledger pays a third as much, so an optimal
// loadout has to rotate. getSigilSlots() tops out at 5 (2 base + 3 milestones), so the
// real ceiling is 5 x 0.30 = 1.50, not 6 x 0.30.
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
    const bonus = typeof getMarginalSigilSlotBonus == "function" ? getMarginalSigilSlotBonus() : 0
    return Math.min(SIGIL_BASE_SLOTS + bonus, SIGIL_NAMES.length)
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

    const removing = (gameData.sigils & bit) != 0
    const next = removing ? (gameData.sigils & ~bit) : (gameData.sigils | bit)

    // Capacity constrains ADDING only. Slots collapse when the Etching-priced milestones that grant
    // them un-latch - which is exactly what a Ledger does - so the worn count can legitimately exceed
    // the slot count. Testing removals too would then refuse every toggle in both directions and
    // freeze the loadout permanently; with the_darkest_time stuck on, that is an unrecoverable save.
    if (!removing && countSigils(next) > getSigilSlots()) return false

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

function setChallengeProgress() {
    if (gameData.active_challenge == "an_unhappy_life") {
        gameData.challenges.an_unhappy_life = Math.max(gameData.challenges.an_unhappy_life, getHappiness())
    }
    if (gameData.active_challenge == "rich_and_the_poor") {
        gameData.challenges.rich_and_the_poor = Math.max(gameData.challenges.rich_and_the_poor, getIncome())
    }
    if (gameData.active_challenge == "time_does_not_fly") {
        gameData.challenges.time_does_not_fly = Math.max(gameData.challenges.time_does_not_fly, getUnpausedGameSpeed() / getBaseGameSpeed())
    }
    if (gameData.active_challenge == "dance_with_the_devil") {
        gameData.challenges.dance_with_the_devil = Math.max(gameData.challenges.dance_with_the_devil, Math.max(0, getEvilGain() - 10))
    }
    if (gameData.active_challenge == "legends_never_die") {
        gameData.challenges.legends_never_die = Math.max(gameData.challenges.legends_never_die, getChallengeTaskGoalProgress("Chairman"))
    }
    if (gameData.active_challenge == "the_darkest_time") {
        gameData.challenges.the_darkest_time = Math.max(gameData.challenges.the_darkest_time, getChallengeTaskGoalProgress("Sigma Proioxis") / 100)
    }
}

function getChallengeBonus(challenge_name, current = false) {
    if (challenge_name == "an_unhappy_life" || challenge_name == 1) {
        return softcap(Math.pow((current ? getHappiness() : gameData.challenges.an_unhappy_life) + 1, 0.31), 500, 0.45)
    }
    if (challenge_name == "rich_and_the_poor" || challenge_name == 2) {
        return softcap(Math.pow((current ? getIncome() : gameData.challenges.rich_and_the_poor) + 1, 0.25), 25, 0.55)
    }
    if (challenge_name == "time_does_not_fly" || challenge_name == 3) {
        return softcap(Math.pow((current ? getUnpausedGameSpeed() / getBaseGameSpeed() : gameData.challenges.time_does_not_fly) + 1, 0.055), 2)
    }
    if (challenge_name == "dance_with_the_devil" || challenge_name == 4) {
        return softcap(Math.pow((current ? Math.max(0, getEvilGain() - 10) : gameData.challenges.dance_with_the_devil) + 1, 0.09), 2, 0.75)
    }
    if (challenge_name == "legends_never_die" || challenge_name == 5) {
        return softcap(Math.pow((current ? getChallengeTaskGoalProgress("Chairman") : gameData.challenges.legends_never_die) + 1, 0.85), 25, 0.6)
    }
    if (challenge_name == "the_darkest_time" || challenge_name == 6) {
        return softcap(Math.pow((current ? getChallengeTaskGoalProgress("Sigma Proioxis") / 100.0 : gameData.challenges.the_darkest_time) + 1, 0.85), 25, 0.6)
    }
}

function getChallengeGoal(challenge_name) {
    if (challenge_name == "an_unhappy_life" || challenge_name == 1) {
        return gameData.challenges.an_unhappy_life + 1
    }
    if (challenge_name == "rich_and_the_poor" || challenge_name == 2) {
        return gameData.challenges.rich_and_the_poor + 1
    }
    if (challenge_name == "time_does_not_fly" || challenge_name == 3) {
        return Math.max(1, gameData.challenges.time_does_not_fly + 0.1)
    }
    if (challenge_name == "dance_with_the_devil" || challenge_name == 4) {
        return gameData.challenges.dance_with_the_devil + 10.1
    }
    if (challenge_name == "legends_never_die" || challenge_name == 5) {
        return gameData.challenges.legends_never_die + 1
    }
    if (challenge_name == "the_darkest_time" || challenge_name == 6) {
        return gameData.challenges.the_darkest_time + 1
    }
}
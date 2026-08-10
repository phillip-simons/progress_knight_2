onerror = () => {
    document.getElementById("errorInfo").hidden = false
    tempData.hasError = true
    setTimeout(() => {
        document.getElementById("errorInfo").hidden = true
    }, 30 * 1000)
}

let tickErrorReported = false
let loadFailed = false

// A throw inside update() used to leave `ticking` latched for the life of the page while saveloop
// kept writing every 3 seconds. The loop now recovers; stop autosaving so that whatever state
// triggered the throw does not overwrite the last good save.
function onTickError(error) {
    // Report once only. A deterministic failure throws 20 times a second, and hasError has already
    // halted the simulation by then, so the repeats carry no information.
    if (tickErrorReported) return
    tickErrorReported = true
    console.error(error)

    tempData.hasError = true
    document.getElementById("errorInfo").hidden = false
    document.getElementById("errorSaveInfo").hidden = false
    clearInterval(saveloop)
}

window.addEventListener('resize', function(event) {
    onResize(event.target.outerWidth)
}, true);


function addMultipliers() {
    for (const taskName in gameData.taskData) {
        const task = gameData.taskData[taskName]

        task.xpMultipliers = []
        if (task instanceof Job) task.incomeMultipliers = []

        task.xpMultipliers.push(task.getMaxLevelMultiplier.bind(task))
        task.xpMultipliers.push(getHappiness)
        task.xpMultipliers.push(getDarkMatterXpGain)
        task.xpMultipliers.push(getBindedTaskEffect("Dark Influence"))
        task.xpMultipliers.push(getBindedTaskEffect("Demon Training"))
        task.xpMultipliers.push(getBindedTaskEffect("Void Influence"))
        task.xpMultipliers.push(getBindedTaskEffect("Parallel Universe"))
        task.xpMultipliers.push(getBindedTaskEffect("Immortal Ruler"))
        task.xpMultipliers.push(getBindedTaskEffect("Blinded By Darkness"))
        task.xpMultipliers.push(getDarkMatterSkillXP)
        task.xpMultipliers.push(getTimeIsAFlatCircleXP)

        if (task instanceof Job) {
            task.incomeMultipliers.push(task.getLevelMultiplier.bind(task))
            task.incomeMultipliers.push(getBindedTaskEffect("Demon's Wealth"))
            task.incomeMultipliers.push(getLifeCoachIncomeGain)
            task.xpMultipliers.push(getBindedTaskEffect("Productivity"))
            task.xpMultipliers.push(getBindedTaskEffect("Dark Knowledge"))
            task.xpMultipliers.push(getBindedItemEffect("Personal Squire"))
        } else if (task instanceof Skill) {
            task.xpMultipliers.push(getBindedTaskEffect("Concentration"))
            task.xpMultipliers.push(getBindedItemEffect("Book"))
            task.xpMultipliers.push(getBindedItemEffect("Study Desk"))
            task.xpMultipliers.push(getBindedItemEffect("Library"))
            task.xpMultipliers.push(getBindedItemEffect("Void Blade"))
            task.xpMultipliers.push(getBindedTaskEffect("Void Symbiosis"))
            task.xpMultipliers.push(getBindedItemEffect("Universe Fragment"))
            task.xpMultipliers.push(getBindedItemEffect("Custom Galaxy"))
            task.xpMultipliers.push(getBindedTaskEffect("Evil Incarnate"))
            task.xpMultipliers.push(getBindedTaskEffect("Dark Prince"))
        }

        if (jobCategories["Military"].includes(task.name)) {
            task.incomeMultipliers.push(getBindedTaskEffect("Strength"))
            task.xpMultipliers.push(getBindedTaskEffect("Battle Tactics"))
            task.xpMultipliers.push(getBindedItemEffect("Steel Longsword"))
        } else if (task.name == "Strength") {
            task.xpMultipliers.push(getBindedTaskEffect("Muscle Memory"))
            task.xpMultipliers.push(getBindedItemEffect("Dumbbells"))
        } else if (skillCategories["Magic"].includes(task.name)) {
            task.xpMultipliers.push(getBindedItemEffect("Sapphire Charm"))
            task.xpMultipliers.push(getBindedItemEffect("Observatory"))
            task.xpMultipliers.push(getBindedTaskEffect("Universal Ruler"))
            task.xpMultipliers.push(getTaaAndMagicXpGain)
        } else if (skillCategories["Void Manipulation"].includes(task.name)) {
            task.xpMultipliers.push(getBindedItemEffect("Void Necklace"))
            task.xpMultipliers.push(getBindedItemEffect("Void Orb"))
        } else if (jobCategories["The Arcane Association"].includes(task.name)) {
            task.xpMultipliers.push(getBindedTaskEffect("Mana Control"))
            task.xpMultipliers.push(getTaaAndMagicXpGain)
            task.incomeMultipliers.push(getBindedTaskEffect("All Seeing Eye"))
        } else if (jobCategories["The Void"].includes(task.name)) {
            task.xpMultipliers.push(getBindedTaskEffect("Void Amplification"))
            task.xpMultipliers.push(getBindedItemEffect("Void Armor"))
            task.xpMultipliers.push(getBindedItemEffect("Void Dust"))
        } else if (jobCategories["Galactic Council"].includes(task.name)) {
            task.xpMultipliers.push(getBindedItemEffect("Celestial Robe"))
            task.xpMultipliers.push(getBindedTaskEffect("Epiphany"))
        } else if (skillCategories["Dark Magic"].includes(task.name)) {
            task.xpMultipliers.push(getEvilXpGain)
        } else if (skillCategories["Almightiness"].includes(task.name)) {
            task.xpMultipliers.push(getEssenceXpGain)
        } else if (skillCategories["Fundamentals"].includes(task.name)) {
            task.xpMultipliers.push(getBindedItemEffect("Mind's Eye"))
        } else if (skillCategories["Darkness"].includes(task.name)) {
            task.xpMultipliers.push(getDarknessXpGain)
        }
    }

    for (const itemName in gameData.itemData) {
        const item = gameData.itemData[itemName]
        item.expenseMultipliers = []
        item.expenseMultipliers.push(getBindedTaskEffect("Bargaining"))
        item.expenseMultipliers.push(getBindedTaskEffect("Intimidation"))
        item.expenseMultipliers.push(getBindedTaskEffect("Brainwashing"))
        item.expenseMultipliers.push(getBindedTaskEffect("Abyss Manipulation"))
        item.expenseMultipliers.push(getBindedTaskEffect("Galactic Command"))
    }
}

function getHeroXpGainMultipliers(job)
{
    var baseMult = 1

    if (job instanceof Job)
        baseMult = 50000

    if (gameData.requirements["Rise of Great Heroes"].isCompleted())
        baseMult *= 10000

    if (gameData.requirements["Lazy Heroes"].isCompleted())
        baseMult *= 1e12

    if (gameData.requirements["Dirty Heroes"].isCompleted())
        baseMult *= 1e15

    if (gameData.requirements["Angry Heroes"].isCompleted())
        baseMult *= 1e15

    if (gameData.requirements["Tired Heroes"].isCompleted())
        baseMult *= 1e15

    if (gameData.requirements["Scared Heroes"].isCompleted())
        baseMult *= 1e15

    if (gameData.requirements["Good Heroes"].isCompleted())
        baseMult *= 1e15

    if (gameData.requirements["Funny Heroes"].isCompleted())
        baseMult *= 1e25

    if (gameData.requirements["Beautiful Heroes"].isCompleted())
        baseMult *= 1e50

    if (gameData.requirements["Awesome Heroes"].isCompleted())
        baseMult *= 1e10

    if (gameData.requirements["Furious Heroes"].isCompleted()) {
        if (job instanceof Job)
            baseMult *= 1000000
        baseMult *= 1e12
    }

    if (gameData.requirements["Superb Heroes"].isCompleted())
        baseMult *= 1e3

    return baseMult
}


function setCustomEffects() {
    const bargaining = gameData.taskData["Bargaining"]
    bargaining.getEffect = function () {
        const multiplier = 1 - getBaseLog(bargaining.isHero? 3 : 7, bargaining.level + 1) / 10
        if (multiplier < 0.1) return 0.1
        return multiplier
    }

    const intimidation = gameData.taskData["Intimidation"]
    intimidation.getEffect = function () {
        const multiplier = 1 - getBaseLog(intimidation.isHero ? 3 : 7, intimidation.level + 1) / 10
        if (multiplier < 0.1) return 0.1
        return multiplier
    }

    const brainwashing = gameData.taskData["Brainwashing"]
    brainwashing.getEffect = function () {
        const multiplier = 1 - getBaseLog(brainwashing.isHero ? 3 : 7, brainwashing.level + 1) / 10
        if (multiplier < 0.1) return 0.1
        return multiplier
    }

    const abyssManipulation = gameData.taskData["Abyss Manipulation"]
    abyssManipulation.getEffect = function () {
        const multiplier = 1 - getBaseLog(abyssManipulation.isHero ? 3 : 7, abyssManipulation.level + 1) / 10
        if (multiplier < 0.1) return 0.1
        return multiplier
    }

    const galacticCommand = gameData.taskData["Galactic Command"]
    galacticCommand.getEffect = function () {
        const multiplier = 1 - getBaseLog(galacticCommand.isHero ? 3 : 7, galacticCommand.level + 1) / 10
        if (multiplier < 0.1) return 0.1
        return multiplier
    }

    const timeWarping = gameData.taskData["Time Warping"]
    timeWarping.getEffect = function() {
        return 1 + getBaseLog(timeWarping.isHero ? 1.005 : 10, timeWarping.level + 1)
    }

    const immortality = gameData.taskData["Life Essence"]
    immortality.getEffect = function () {
        return 1 + getBaseLog(immortality.isHero ? 1.01 : 33, immortality.level + 1)
    }

    const unholyRecall = gameData.taskData["Cosmic Recollection"];
    unholyRecall.getEffect = function() {
        return unholyRecall.level * (unholyRecall.isHero ? 0.065 : 0.00065);
    }

    const transcendentMaster = milestoneData["Transcendent Master"]
    transcendentMaster.getEffect = function () {
        if (gameData.requirements["Transcendent Master"].isCompleted())
            return 1.5

        return 1
    }

    const faintHope = milestoneData["Faint Hope"]
    faintHope.getEffect = function () {
        var mult = 1
        if (gameData.requirements["A New Hope"].isCompleted()) { 
            mult = softcap(1e308, 10000000, 0.01)
        }
        else if (gameData.requirements["Speed speed speed"].isCompleted()) {
            mult = 7.5275 * Math.exp(0.0053 * (gameData.requirements["Strong Hope"].isCompleted() ? gameData.rebirthFiveTime
                : gameData.rebirthThreeTime)) * (Math.log(getUnpausedGameSpeed()) / Math.log(2))            
            if (mult == Infinity)
                mult = 1e308
            mult = softcap(mult, 10000000, 0.01)
        }
        else if (gameData.requirements["Faint Hope"].isCompleted()) {
            let kickin = 1.1754 - 0.082 * Math.log(gameData.rebirthThreeTime)
            if (kickin < 0.15)
                kickin = 0.15

            mult = 1 + ((gameData.rebirthThreeTime * (gameData.requirements["Angry Heroes"].isCompleted() ? 10 : 1)) / (7750 * kickin)) * (Math.log(getUnpausedGameSpeed()) / Math.log(2))            
            mult = softcap(mult, 200)
        }

        return mult
    }

    const riseOfGreatHeroes = milestoneData["Rise of Great Heroes"]
    riseOfGreatHeroes.getEffect = function () {
        var mult = 1
        if (gameData.requirements["Rise of Great Heroes"].isCompleted()) {
            var countHeroes = 0
            for (const taskName in gameData.taskData) {
                if (gameData.taskData[taskName].isHero)
                    countHeroes++
            }
            mult = 1 + 6 * countHeroes / 74
        }

        return mult
    }
}

function getDarknessXpGain() {
    const strangeMagic = gameData.requirements["Strange Magic"].isCompleted() ? 1e50 : 1
    return strangeMagic
}

function getHappiness() {
    if (isChallengeActive("legends_never_die") || isChallengeActive("the_darkest_time")) return 1

    const meditationEffect = getBindedTaskEffect("Meditation")
    const butlerEffect = getBindedItemEffect("Butler")
    const mindreleaseEffect = getBindedTaskEffect("Mind Release")
    const multiverseFragment = getBindedItemEffect("Multiverse Fragment")
    const godsBlessings = gameData.requirements["God's Blessings"].isCompleted() ? 10000000 : 1
    const stairWayToHeaven = getBindedItemEffect("Stairway to heaven")
    const happiness = godsBlessings * meditationEffect() * butlerEffect() * mindreleaseEffect()
        * multiverseFragment() * gameData.currentProperty.getEffect() * getChallengeBonus("an_unhappy_life") * stairWayToHeaven()

    if (isChallengeActive("dance_with_the_devil")) return Math.pow(happiness, 0.075)
    if (isChallengeActive("an_unhappy_life")) return Math.pow(happiness, 0.5)

    return happiness
}

function getEvil() {
    return gameData.evil
}

function getEvilXpGain() {
    if (isChallengeActive("legends_never_die") || isChallengeActive("the_darkest_time")) return 1

    if (isChallengeActive("dance_with_the_devil")) {
        const evilEffect = (Math.pow(getEvil(), 0.35) / 1e3) - 1
        return evilEffect < 0 ? 0 : evilEffect
    }

    return getEvil()
}

function getEssence() {
    if (gameData.essence == Infinity || gameData.essence > 1e308)
        return 1e308
    return gameData.essence
}

function getEssenceXpGain() {
    if (isChallengeActive("dance_with_the_devil") || isChallengeActive("the_darkest_time")) {
        const essenceEffect = (Math.pow(getEssence(), 0.35) / 1e2) - 1
        return essenceEffect <= 0.01 ? 0 : essenceEffect
    }

    return getEssence()
}

function applyMultipliers(value, multipliers) {
    var finalMultiplier = 1
    multipliers.forEach((multiplierFunction) => {
        finalMultiplier *= multiplierFunction()
    })
    return value * finalMultiplier
}

function applySpeed(value) {
    if (value == 0)
        return 0
    if (value == Infinity)
        return Infinity
    return value * getGameSpeed() / updateSpeed
}

function applyUnpausedSpeed(value) {
    if (value == 0)
        return 0
    if (value == Infinity)
        return Infinity
    return value * getUnpausedGameSpeed() / updateSpeed
}

function applySpeedOnBigInt(value) {
    if (value == 0n)
        return 0n
    return value * bigIntSafe(Math.floor(getGameSpeed())) / BigInt(Math.floor(updateSpeed))
}

function getEvilGain() {
    const evilControl = gameData.taskData["Evil Control"]
    const bloodMeditation = gameData.taskData["Blood Meditation"]
    const absoluteWish = gameData.taskData ["Absolute Wish"]
    const oblivionEmbodiment = gameData.taskData ["Void Embodiment"]
    const yingYang = gameData.taskData["Yin Yang"]
    const inferno = gameData.requirements["Inferno"].isCompleted() ? 5 : 1    
    const theDevilInsideYou = gameData.requirements["The Devil inside you"].isCompleted() ? 1e15 : 1
    const stairWayToHell = getBindedItemEffect("Highway to hell")
    const evilBooster = (gameData.perks.evil_booster == 1) ? 1e50 : 1

    const evilGain = evilControl.getEffect() * bloodMeditation.getEffect() * absoluteWish.getEffect()
        * oblivionEmbodiment.getEffect() * yingYang.getEffect() * inferno * getChallengeBonus("legends_never_die")
        * getDarkMatterSkillEvil() * theDevilInsideYou * stairWayToHell() * evilBooster

    return Math.min(evilGain, 1e308)
}

// The factors of essence gain, in multiplication order. getEssenceGain() reduces them;
// getEssenceGainLog10() sums their logs. One list, so the two readers cannot drift apart when a
// factor is added.
//
// The last ESSENCE_GAIN_LEDGER_EXCLUDED entries are excluded from the log10 sum and must stay last.
// lifeIsValueable is raw gameData.dark_matter and essenceMultGain() is 10^essence_gain_modifier; the
// Ledger already prices dark matter (tD) and hypercube spending (tH) directly, so counting them here
// as well would give dark matter a true weight of 1.5 and hypercubes 2.75 instead of 0.5 and 0.25.
const ESSENCE_GAIN_LEDGER_EXCLUDED = 2

function getEssenceGainFactors() {
    return [
        gameData.taskData["Yin Yang"].getEffect(),
        gameData.taskData["Essence Collector"].getEffect(),
        milestoneData["Transcendent Master"].getEffect(),
        milestoneData["Faint Hope"].getEffect(),
        milestoneData["Rise of Great Heroes"].getEffect(),
        getChallengeBonus("dance_with_the_devil"),
        getAGiftFromGodEssenceGain(),
        gameData.taskData["Dark Magician"].getEffect(),
        getDarkMatterSkillEssence(),
        gameData.requirements["The new gold"].isCompleted() ? 1000 : 1,

        // --- excluded from getEssenceGainLog10(); keep these last ---
        gameData.requirements["Life is valueable"].isCompleted() ? gameData.dark_matter : 1,
        essenceMultGain(),
    ]
}

function getEssenceGain() {
    const factors = getEssenceGainFactors()

    let essenceGain = 1
    for (const factor of factors)
        essenceGain *= factor

    return Math.min(essenceGain, 1e308)
}

// log10 of the essence gain chain, WITHOUT the 1e308 clamp and without the last two factors.
//
// Unclamped on purpose: gameData.essence is pinned at the clamp for anyone who reaches the Ledger,
// so log10(essence) carries no information. This reads the gain chain instead, in log space, where
// the product cannot overflow. It is READ-ONLY - it never writes gameData.essence and must never be
// used to grant essence.
//
// NOTE FOR BALANCE: the retained ten factors are bounded at roughly 1e85, because the three Skill
// factors are LINEAR in level, Faint Hope is hard-softcapped, a_gift_from_god is bounded by its own
// cost guard, and the dark-matter skill tree tops out at 2.5e13. Calibrate ETCHING_E_OFFSET against
// a real save; do not assume the roadmap's 180.
function getEssenceGainLog10() {
    const factors = getEssenceGainFactors()
    const counted = factors.length - ESSENCE_GAIN_LEDGER_EXCLUDED

    let total = 0
    for (let i = 0; i < counted; i++) {
        const factor = factors[i]

        // Faint Hope's second branch scales by log2(getUnpausedGameSpeed()), which is negative when
        // game speed drops below 1, so a non-positive factor is reachable. The linear chain just
        // goes negative; log space would go NaN. Report "no gain" instead.
        if (!(factor > 0)) return LOG_ZERO
        if (factor === Infinity) return Infinity

        total += Math.log10(factor)
    }

    return total
}

function getDarkMatterGain() {
    const darkRuler = gameData.taskData["Dark Ruler"]
    const darkMatterHarvester = gameData.requirements["Dark Matter Harvester"].isCompleted() ? 10 : 1
    const darkMatterMining = gameData.requirements["Dark Matter Mining"].isCompleted() ? 3 : 1
    const darkMatterMillionaire = gameData.requirements["Dark Matter Millionaire"].isCompleted() ? 500 : 1
    const Desintegration = gameData.itemData['Desintegration'].getEffect()
    const TheEndIsNear = getUnspentPerksDarkmatterGainBuff() 


    const darkMatterGain = 1 * darkRuler.getEffect() * darkMatterHarvester * darkMatterMining * darkMatterMillionaire * getChallengeBonus("the_darkest_time") * getDarkMatterSkillDarkMater() * darkMatterMultGain() *
        (Desintegration == 0 ? 1 : Desintegration) * TheEndIsNear

    // Clamped like evil and essence (commit 59fbfd8). This is an unclamped product of eight factors,
    // and Infinity serializes to null, so an overflow here would be permanent rather than transient.
    return Math.min(darkMatterGain, 1e308)
}

function getDarkMatter() {
    return gameData.dark_matter;
}

function getDarkMatterXpGain() {
    if (getDarkMatter() < 1)
        return 1

    return getDarkMatter() + 1;
}

function getDarkOrbs() {
    return gameData.dark_orbs
}

function getGameSpeed() {
    if (!canSimulate())
        return 0

    return getUnpausedGameSpeed()
}

function getUnpausedGameSpeed() {
    const boostWarping = gameData.boost_active ? gameData.metaverse.boost_warp_modifier : 1
    const timeWarping = gameData.taskData["Time Warping"]
    const temporalDimension = gameData.taskData["Temporal Dimension"]
    const timeLoop = gameData.taskData["Time Loop"]
    const warpDrive = (gameData.requirements["Eternal Time"].isCompleted()) ? 2 : 1
    const speedSpeedSpeed = gameData.requirements["Speed speed speed"].isCompleted() ? 1000 : 1
    const timeIsAFlatCircle = gameData.requirements["Time is a flat circle"].isCompleted() ? 1000 : 1

    const timeWarpingSpeed = boostWarping * timeWarping.getEffect() * temporalDimension.getEffect() * timeLoop.getEffect() * warpDrive * speedSpeedSpeed * timeIsAFlatCircle

    const gameSpeed = getBaseGameSpeed() * timeWarpingSpeed * getChallengeBonus("time_does_not_fly") * getGottaBeFastGain() * getDarkMatterSkillTimeWarping()

    if (isChallengeActive("time_does_not_fly") || isChallengeActive("the_darkest_time"))
        return Math.pow(gameSpeed, 0.7)

    if (isChallengeActive("legends_never_die"))
        return Math.pow(gameSpeed, 0.75)

    return gameSpeed
}

function applyExpenses() {
    if (gameData.coins == Infinity)
        return

    gameData.coins -= applySpeed(getExpense())

    if (gameData.coins < 0) {
        gameData.coins = 0
        if (getIncome() < getExpense())
            goBankrupt()
    }
}

function goBankrupt() {
    gameData.coins = 0
    gameData.currentProperty = gameData.itemData["Homeless"]
    gameData.currentMisc = []
    autoBuyEnabled = true
}

async function downloadFile() {
    let response = await fetch("./changelog.txt");

    if (response.status != 200) {
        throw new Error("Server Error");
    }

    // read response stream as text
    let text_data = await response.text();

    return text_data;
}

document.querySelector("#changelogTabTabButton").addEventListener('click', async function () {
    try {
        let text_data = await downloadFile();
        document.querySelector("#changelog").textContent = text_data;
    }
    catch (e) {
        alert(e.message);
    }
});

function togglePause() {
    gameData.paused = !gameData.paused
}

function forceAutobuy() {
    autoBuyEnabled = true
}

function setCurrentProperty(propertyName) {
    if (gameData.paused)
        return
    autoBuyEnabled = false
    gameData.currentProperty = gameData.itemData[propertyName]
}

function setMisc(miscName) {
    if (gameData.paused)
        return
    autoBuyEnabled = false
    const misc = gameData.itemData[miscName]
    if (gameData.currentMisc.includes(misc)) {
        for (i = 0; i < gameData.currentMisc.length; i++) {
            if (gameData.currentMisc[i] == misc) {
                gameData.currentMisc.splice(i, 1)
            }
        }
    } else {
        gameData.currentMisc.push(misc)
    }
}

function createGameObjects(data, baseData) {
    for (const key in baseData)
        createGameObject(data, baseData[key])
}

function createGameObject(data, entity) {
    if ("income" in entity) { data[entity.name] = new Job(entity) }
    else if ("maxXp" in entity) { data[entity.name] = new Skill(entity) }
    else if ("tier" in entity) { data[entity.name] = new Milestone(entity) }
    else {data[entity.name] = new Item(entity)}
    data[entity.name].id = "row " + entity.name
}

function setCurrency(index) {
    gameData.settings.currencyNotation = index
    selectElementInGroup("CurrencyNotation", index)
}

function setNotation(index) {
    gameData.settings.numberNotation = index
    selectElementInGroup("Notation", index)
}

function getNet() {
    return Math.abs(getIncome() - getExpense())
}

function getIncome() {
    if (isChallengeActive("the_darkest_time"))
        return 0
    
    return gameData.currentJob.getIncome() * getDarkMatterSkillIncome()
}

function getExpense() {
    var expense = 0
    expense += gameData.currentProperty.getExpense()
    for (misc of gameData.currentMisc) {
        expense += misc.getExpense()
    }
    return expense
}

function increaseCoins() {
    gameData.coins += applySpeed(getIncome())
}

function autoPerks() {
    // perks
    if (gameData.perks.auto_boost == 1 && !gameData.boost_active && gameData.boost_cooldown <= 0)
        applyBoost()

    if (gameData.perks.auto_dark_orb == 1 && gameData.dark_matter >= getDarkOrbGeneratorCost() * 10 && gameData.dark_orbs != Infinity)
        buyDarkOrbGenerator()

    if (gameData.perks.auto_dark_orb == 1 && gameData.dark_matter >= 100 && gameData.dark_matter_shop.a_miracle == false)
        buyAMiracle()

    if (gameData.perks.auto_dark_shop == 1 && gameData.dark_orbs >= 1000) {
        buyADealWithTheChairman()
        buyAGiftFromGod()
        buyGottaBeFast()
        buyLifeCoach()
    }

    if (gameData.perks.auto_sacrifice == 1 && gameData.hypercubes > 1000) {
        buyDarkMaterMult()
        buyChallengeAltar()
        buyEssenceMult()
        if (gameData.hypercubes > evilTranCost() * 100)
            buyEvilTran()
        if (gameData.hypercubes > boostDurationCost() * 100)
            buyBoostDuration()
        if (gameData.hypercubes > reduceBoostCooldownCost() * 100)
            buyReduceBoostCooldown()
        if (gameData.hypercubes > hypercubeGainCost() * 100)
            buyHypercubeGain()
    }
}

function autoPromote() {
    let maxIncome = 0;
    for (const key in gameData.taskData) {
        const task = gameData.taskData[key]
        if (task instanceof Job && gameData.requirements[key].isCompleted()) {
            const income = task.getIncome();
            if (income > maxIncome) {
                maxIncome = income
                gameData.currentJob = task
            }
        }
    }
}

function autoBuy() {
    if (!autoBuyEnabled) return

    let usedExpense = 0
    const income = getIncome()

    for (const key in gameData.itemData) {
        if (gameData.requirements[key].isCompleted()) {
            const item = gameData.itemData[key]
            const expense = item.getExpense()

            if (itemCategories['Properties'].indexOf(key) != -1) {
                if (expense < income && expense >= usedExpense) {
                    gameData.currentProperty = item
                    usedExpense = expense
                }
            }
        }
    }

    for (const key in gameData.currentMisc) {
        usedExpense += gameData.currentMisc[key].getExpense()
    }

    for (const key in gameData.itemData) {
        if (gameData.requirements[key].isCompleted()) {
            const item = gameData.itemData[key]
            const expense = item.getExpense()
            if (itemCategories['Misc'].indexOf(key) != -1) {
                if (expense < income - usedExpense) {
                    if (gameData.currentMisc.indexOf(item) == -1) {
                        gameData.currentMisc.push(item)
                        usedExpense += expense
                    }
                }
            }
        }
    }   
}

function increaseDays() {
    gameData.days += applySpeed(1)
    gameData.totalDays += applySpeed(1)
}

function increaseRealtime() {
    if (!canSimulate())
        return;

    const realDiff = 1.0 / updateSpeed

    gameData.realtime += realDiff
    gameData.realtimeRun += realDiff
    gameData.rebirthOneTime += realDiff
    gameData.rebirthTwoTime += realDiff
    gameData.rebirthThreeTime += realDiff
    gameData.rebirthFourTime += realDiff
    gameData.rebirthFiveTime += realDiff
    gameData.rebirthSixTime += realDiff
    gameData.rebirthSevenTime += realDiff

    if (gameData.boost_active) {
        gameData.boost_timer -= realDiff
        if (gameData.boost_timer < 0) {
            gameData.boost_timer = 0
            gameData.boost_active = false
            gameData.boost_cooldown = getBoostCooldownSeconds()
        }
    }
    else {
        gameData.boost_cooldown -= realDiff

        if (gameData.boost_cooldown < 0) 
            gameData.boost_cooldown = 0
    }
}

function setTheme(index, reload=false) {
    const body = document.getElementById("body")

    body.classList.remove("dark")
    body.classList.remove("colorblind")


    if (index == 0) {
        // lignt
    }
    else if (index == 1) {
        // dark
        body.classList.add("dark")
    }
    else if (index == 2){
        // colorblind Tritanopia
        body.classList.add("colorblind")
    }

    gameData.settings.theme = index
    selectElementInGroup("Theme", index)

    if (reload) {
        saveGameData()
        location.reload()
    }
}

function setEnableKeybinds(enableKeybinds) {
    gameData.settings.enableKeybinds = enableKeybinds
    selectElementInGroup("EnableKeybinds", enableKeybinds ? 0 : 1)
}

function applyMilestones() {
    if (((gameData.requirements["Magic Eye"].isCompleted()) && (gameData.requirements["Rebirth note 2"].isCompleted())) ||
        (gameData.requirements["Almighty Eye"].isCompleted())){
        for (taskName in gameData.taskData) {
            const task = gameData.taskData[taskName]
            const effect = gameData.taskData["Cosmic Recollection"].getEffect()
            const maxlevel = Math.floor(task.level * (effect == 0 ? 1 : effect))
            if (maxlevel > task.maxLevel)
                task.maxLevel = maxlevel
        }
    }

    if (canSimulate()) {
        if (gameData.requirements["Deal with the Devil"].isCompleted() && gameData.requirements["Rebirth note 3"].isCompleted()) {
            if (gameData.evil == 0)
                gameData.evil = 1
            if (gameData.evil < getEvilGain())
                gameData.evil *= Math.pow(1.001, 1)
        }

        if (gameData.requirements["Hell Portal"].isCompleted()) {
            if (gameData.evil == 0)
                gameData.evil = 1
            if (gameData.evil < getEvilGain()) {
                const exponent = gameData.requirements["Mind Control"].isCompleted() ? 1.07 : 1.01
                gameData.evil *= Math.pow(exponent, 1)
            }
        }

        if (gameData.requirements["Galactic Emperor"].isCompleted()) {
            if (gameData.essence == 0)
                gameData.essence = 1
            if (gameData.essence < getEssenceGain() * 10)
                gameData.essence *= Math.pow(1.002, 1)
            if (gameData.essence == Infinity || gameData.essence > 1e308)
                gameData.essence = 1e308
        }
    }
}

function getLifespan() {
    const immortality = gameData.taskData["Life Essence"]
    const superImmortality = gameData.taskData["Astral Body"]
    const higherDimensions = gameData.taskData["Higher Dimensions"]
    const abyss = gameData.taskData["Ceaseless Abyss"]
    const cosmicLongevity = gameData.taskData["Cosmic Longevity"]
    const speedSpeedSpeed = gameData.requirements["Speed speed speed"].isCompleted() ? 1000 : 1
    const lifeIsValueable = gameData.requirements["Life is valueable"].isCompleted() ? 1e5 : 1
    const lifespan = getBaseLifespan() * immortality.getEffect() * superImmortality.getEffect() * abyss.getEffect()
        * cosmicLongevity.getEffect() * higherDimensions.getEffect() * lifeIsValueable * speedSpeedSpeed

    if (isChallengeActive("legends_never_die") || isChallengeActive("the_darkest_time")) return Math.pow(lifespan, 0.72) + 365 * 25

    if (gameData.rebirthFiveCount > 0) return Infinity

    return lifespan
}

function isAlive() {
    const condition = gameData.days < getLifespan() || getLifespan() == Infinity

    if (!condition) {
        gameData.days = getLifespan()        
    }

    if (!in_offline_progress){
        const deathText = document.getElementById("deathText")
        if (!condition)  
            deathText.classList.remove("hidden")        
        else 
            deathText.classList.add("hidden")        
    }
    return condition && !tempData.hasError
}

function canSimulate() {
    return !gameData.paused && isAlive()
}

// The milestone Born Heroic (js/authorship.js) unlocks heroes from, instead of One Above All level
// 2000. Its safety argument is that this is the MOST EXPENSIVE essence milestone the heroic xp stack
// reads, and that argument is asserted in assertContentTableIntegrity() rather than left as a
// comment - a new heroic-xp milestone priced above it would silently re-open the brick.
const BORN_HEROIC_GATE = "Superb Heroes"

function isHeroesUnlocked() {
    // "New Beginning" stays a hard prerequisite in both branches: it is the milestone that unlocks
    // great heroes, skills and items at all, and it is free to keep - it costs 5e6 essence against
    // BORN_HEROIC_GATE's 1e10, so a latched Born Heroic gate implies it.
    if (!gameData.requirements["New Beginning"].isCompleted()) return false

    // Born Heroic replaces the One Above All clause, and only that clause. Gating on ESSENCE is what
    // makes it safe: an Authorship zeroes essence and un-latches every heroic xp multiplier with it,
    // so on the fresh life that would otherwise brick - Heroic Beggar facing a 5e37 maxXp with a ~1x
    // multiplier stack - the Axiom is automatically inert.
    //
    // isCompletedActual(), NOT isCompleted(): the latch is deliberately bypassed here. BORN_HEROIC_GATE
    // is in INSCRIBABLE_MILESTONES, restoreInscribedMilestones() (js/ledger.js) sets completed = true
    // unconditionally, and doRebirth phase 13 calls it - so a player who inscribed it walks out of an
    // Authorship with essence 0 and the latch back on. Reading the latch would make the Axiom live in
    // exactly the state the safety argument above says it cannot be, and makeHero() is one-way.
    if (hasAxiom("born_heroic") && gameData.requirements[BORN_HEROIC_GATE].isCompletedActual())
        return true

    return gameData.taskData["One Above All"].level >= 2000 || gameData.taskData["One Above All"].isHero
}

function makeHero(task) {
    if ((task instanceof Job || task instanceof Skill) && !task.isHero) {
        // The Same Hand (js/authorship.js): heroification stops costing the player their peak. Read
        // here, BEFORE task.level is zeroed on the next line, and through the BARE hasAxiom - a
        // suspension-aware predicate would DESTROY the peak while suspended rather than merely
        // decline to restore one, which is the opposite of what suspension does for an inscription.
        const keptPeak = hasAxiom("the_same_hand") ? Math.max(task.maxLevel, task.level) : 0

        task.level = 0
        task.maxLevel = keptPeak
        task.xp = 0
        task.isHero = true

        // maxLevel was just rewritten, and the heroic record is a different scale from the normal
        // one. Only ever raises, so it cannot undo the line above.
        restoreInscribedMaxLevels()
    }
}

function makeHeroes() {
    if (!isHeroesUnlocked()) return

    for (const taskname in gameData.taskData) {
        const task = gameData.taskData[taskname]

        if (task.isHero)
            continue

        const prev = getPreviousTaskInCategory(taskname)

        if (prev != "" && (!gameData.taskData[prev].isHero || gameData.taskData[prev].level < 20))
                continue

        const req = gameData.requirements[taskname]
        let isNewHero = true

        if (req instanceof TaskRequirement) {
            if (!req.isCompletedActual(true))
                continue
            for (const requirement of req.requirements)
                if (!(gameData.taskData[requirement.task] && gameData.taskData[requirement.task].isHero)) {
                    isNewHero = false
                    break
                }
        }
        else if (req instanceof EssenceRequirement || req instanceof EtchingRequirement) {
            if (!req.isCompletedActual(true))
                continue
        }

        if (isNewHero)
            makeHero(task)
    }

    for (const key in gameData.itemData) {
        const item = gameData.itemData[key]
        if (item.isHero)
            continue
        item.isHero = true
        gameData.currentProperty = gameData.itemData["Homeless"]
        gameData.currentMisc = []
    }
}


function assignMethods() {
    for (const key in gameData.taskData) {
        let task = gameData.taskData[key]
        if (task.baseData.income) {
            task.baseData = jobBaseData[task.name]
            task = Object.assign(new Job(jobBaseData[task.name]), task)

        } else {
            task.baseData = skillBaseData[task.name]
            task = Object.assign(new Skill(skillBaseData[task.name]), task)
        }

        // There are two cases. The number is stored as a large number or in the scientific notation.
        if (typeof task.xpBigInt === "string" && task.xpBigInt.includes("e"))
            task.xpBigInt = BigInt(exponentialToRawNumberString(task.xpBigInt))
        else
            task.xpBigInt = BigInt(task.xpBigInt)

        gameData.taskData[key] = task
    }

    for (const key in gameData.itemData) {
        let item = gameData.itemData[key]
        item.baseData = itemBaseData[item.name]
        item = Object.assign(new Item(itemBaseData[item.name]), item)
        gameData.itemData[key] = item
    }

    for (const key in gameData.requirements) {
        let requirement = gameData.requirements[key]
        if (requirement.type == "task") {
            requirement = Object.assign(new TaskRequirement(requirement.querySelectors, requirement.requirements), requirement)
        } else if (requirement.type == "coins") {
            requirement = Object.assign(new CoinRequirement(requirement.querySelectors, requirement.requirements), requirement)
        } else if (requirement.type == "age") {
            requirement = Object.assign(new AgeRequirement(requirement.querySelectors, requirement.requirements), requirement)
        } else if (requirement.type == "evil") {
            requirement = Object.assign(new EvilRequirement(requirement.querySelectors, requirement.requirements), requirement)
        } else if (requirement.type == "essence") {
            requirement = Object.assign(new EssenceRequirement(requirement.querySelectors, requirement.requirements), requirement)
        } else if (requirement.type == "darkMatter") {
            requirement = Object.assign(new DarkMatterRequirement(requirement.querySelectors, requirement.requirements), requirement)
        } else if (requirement.type == "darkOrb") {
            requirement = Object.assign(new DarkOrbsRequirement(requirement.querySelectors, requirement.requirements), requirement)
        } else if (requirement.type == "metaverse") {
            requirement = Object.assign(new MetaverseRequirement(requirement.querySelectors, requirement.requirements), requirement)
        } else if (requirement.type == "hypercube") {
            requirement = Object.assign(new HypercubeRequirement(requirement.querySelectors, requirement.requirements), requirement)
        } else if (requirement.type == "perkpoint") {
            requirement = Object.assign(new PerkPointRequirement(requirement.querySelectors, requirement.requirements), requirement)
        } else if (requirement.type == "etching") {
            requirement = Object.assign(new EtchingRequirement(requirement.querySelectors, requirement.requirements), requirement)
        }
        

        const tempRequirement = tempData["requirements"][key]
        requirement.elements = tempRequirement.elements
        requirement.requirements = tempRequirement.requirements
        gameData.requirements[key] = requirement
    }

    gameData.currentJob = gameData.taskData[gameData.currentJob.name]
    gameData.currentProperty = gameData.itemData[gameData.currentProperty.name]
    const newArray = []
    for (const misc of gameData.currentMisc) {
        newArray.push(gameData.itemData[misc.name])
    }
    gameData.currentMisc = newArray
}

function replaceSaveDict(dict, saveDict) {
    for (const key in dict) {
        if (!(key in saveDict)) {
            saveDict[key] = dict[key]
        } else if (dict == gameData.requirements) {
            if (saveDict[key].type != tempData["requirements"][key].type) {
                saveDict[key] = tempData["requirements"][key]
            }
            else if (saveDict[key].querySelectors == undefined) {
                saveDict[key].querySelectors = tempData["requirements"][key].querySelectors
            }

        }
    }

    for (const key in saveDict) {
        if (!(key in dict)) {
            delete saveDict[key]
        }
    }
}

function saveGameData() {
    // A failed load leaves gameData as the pristine defaults. Autosaving that would destroy the
    // player's save as a side effect of the recovery path.
    if (loadFailed) return

    gameData.save_date_time = Date.now()
    localStorage.setItem("gameDataSave", JSON.stringify(gameData))
}

function peekSettingFromSave(setting) {
    try {
        const save = localStorage.getItem("gameDataSave")
        if (save == null)
            return gameData.settings[setting]
        const gameDataSave = JSON.parse(save)
        if (gameDataSave.settings == undefined || gameDataSave.settings[setting] == undefined)
            return gameData.settings[setting]
        return gameDataSave.settings[setting]
    } catch (error) {
        console.error(error)
        console.log(localStorage.getItem("gameDataSave"))
        alert("It looks like you tried to load a corrupted save... If this issue persists, feel free to contact the developers!")
    }
}

function loadGameData() {
    try {
        const gameDataSave = JSON.parse(localStorage.getItem("gameDataSave"))

        if (gameDataSave !== null) {
            // When the game contains completedTimes, add 1 Dark Matter and remove the instance.
            if ("completedTimes" in gameDataSave && gameDataSave["completedTimes"] > 0) {
                delete gameDataSave["completedTimes"]
                gameDataSave.dark_matter += 1
                console.log("Gave 1 free Dark Matter")
            }

            // remove milestoneData from gameData
            if ("milestoneData" in gameDataSave) {
                delete gameDataSave["milestoneData"]                
            }

            replaceSaveDict(gameData, gameDataSave)
            replaceSaveDict(gameData.requirements, gameDataSave.requirements)
            replaceSaveDict(gameData.taskData, gameDataSave.taskData)
            replaceSaveDict(gameData.itemData, gameDataSave.itemData)
            replaceSaveDict(gameData.settings, gameDataSave.settings)
            replaceSaveDict(gameData.stats, gameDataSave.stats)
            replaceSaveDict(gameData.challenges, gameDataSave.challenges)
            replaceSaveDict(gameData.dark_matter_shop, gameDataSave.dark_matter_shop)
            replaceSaveDict(gameData.metaverse, gameDataSave.metaverse)
            replaceSaveDict(gameData.perks, gameDataSave.perks)
            replaceSaveDict(gameData.evil_perks, gameDataSave.evil_perks)
            // replaceSaveDict does `key in saveDict`, which THROWS on null and on primitives. A
            // hand-edited or imported save can supply either, and a throw here lands in the catch
            // below, which leaves gameData as the pristine defaults.
            if (gameDataSave.inscriptions == null || typeof gameDataSave.inscriptions !== "object"
                || Array.isArray(gameDataSave.inscriptions))
                gameDataSave.inscriptions = gameData.inscriptions
            replaceSaveDict(gameData.inscriptions, gameDataSave.inscriptions)
            gameData = gameDataSave

            if (gameData.coins == null)
                gameData.coins = 0

            if (gameData.essence == null)
                gameData.essence = 0

            if (gameData.days == null)
                gameData.days = 365 * 14

            if (gameData.evil == null)
                gameData.evil = 0

            if (gameData.dark_matter == null || isNaN(gameData.dark_matter))
                gameData.dark_matter = 0

            if (gameData.dark_orbs == null || isNaN(gameData.dark_matter) || isNaN(gameData.dark_orbs))
                gameData.dark_orbs = 0

            if (gameData.hypercubes == null || isNaN(gameData.hypercubes))
                gameData.hypercubes = 0

            if (gameData.perks_points == null || isNaN(gameData.perks_points))
                gameData.perks_points = 0

            // Number.isFinite, not the global isFinite: isFinite(null) === true.
            if (!Number.isFinite(gameData.etchings_log10))
                gameData.etchings_log10 = LOG_ZERO

            if (!Number.isFinite(gameData.stats.totalEtchingsEarnedLog10))
                gameData.stats.totalEtchingsEarnedLog10 = gameData.etchings_log10

            if (!Number.isFinite(gameData.stats.maxEtchingsReachedLog10))
                gameData.stats.maxEtchingsReachedLog10 = gameData.etchings_log10

            if (gameData.sigils == null || isNaN(gameData.sigils)) gameData.sigils = 0
            if (gameData.sigils_broken == null || isNaN(gameData.sigils_broken)) gameData.sigils_broken = 0
            if (gameData.last_sigils == null || isNaN(gameData.last_sigils)) gameData.last_sigils = 0
            if (gameData.stats.sigilsEverUsed == null || isNaN(gameData.stats.sigilsEverUsed))
                gameData.stats.sigilsEverUsed = 0

            // Plain null/NaN guards. Deliberately NOT the `=== 0 -> gameData.realtime` pattern used
            // by rebirthOneTime..FourTime: seeding a timer introduced in this release from an
            // unrelated realtime would inflate every existing player's first stats.fastest6.
            if (gameData.rebirthFiveTime == null || isNaN(gameData.rebirthFiveTime))
                gameData.rebirthFiveTime = 0
            if (gameData.rebirthSixTime == null || isNaN(gameData.rebirthSixTime))
                gameData.rebirthSixTime = 0
            if (gameData.rebirthSevenTime == null || isNaN(gameData.rebirthSevenTime))
                gameData.rebirthSevenTime = 0

            if (gameData.settings.theme == null) {
                gameData.settings.theme = 1
            }

            if (gameData.rebirthOneTime == null || gameData.rebirthOneTime === 0) {
                gameData.rebirthOneTime = gameData.realtime
            }

            if (gameData.rebirthTwoTime == null || gameData.rebirthTwoTime === 0) {
                gameData.rebirthTwoTime = gameData.realtime
            }

            if (gameData.rebirthThreeTime == null || gameData.rebirthThreeTime === 0) {
                gameData.rebirthThreeTime = gameData.realtime
            }

            if (gameData.rebirthFourTime == null || gameData.rebirthFourTime === 0) {
                gameData.rebirthFourTime = gameData.realtime
            }

            // Remove invalid active misc items
            gameData.currentMisc = gameData.currentMisc.filter((element) => element instanceof Item)
            
        }
    } catch (error) {
        console.error(error)
        console.log(localStorage.getItem("gameDataSave"))
        loadFailed = true
        alert("It looks like you tried to load a corrupted save... If this issue persists, feel free to contact the developers!")
    }

    assignMethods()

    normalizeInscriptions()

    normalizeAxioms()
}

var intervalID = 0;
var totalTimes = 0;
var executedTimes = 0;
var in_offline_progress=false;
var lastUpdate = 0;

// The Long Hour (js/authorship.js). Bounded on purpose, and this is the one true call site: offline
// catch-up replays real update() ticks, so its cost is linear in wall clock - four hours is 288,000
// of them through runOfflineBatch's 16 ms frame budget. Uncapped offline is a different project (it
// needs a reduced-fidelity replay mode) and is not what the Axiom buys. If a four-hour catch-up
// measures worse than ~2 minutes on a mid-range machine, drop THE_LONG_HOUR_MAX_TIME_MS to two hours
// rather than reaching for the batcher.
const OFFLINE_MAX_TIME_MS = 3600 * 1000
const THE_LONG_HOUR_MAX_TIME_MS = 4 * 3600 * 1000

function getOfflineMaxTimeMs() {
    return hasAxiom("the_long_hour") ? THE_LONG_HOUR_MAX_TIME_MS : OFFLINE_MAX_TIME_MS
}

function calc_offline_progress(ms){
    if (ms > 10000){
        in_offline_progress = true
        intervalID = 0
        executedTimes = 0
        var offline_max_time = getOfflineMaxTimeMs()
        if (ms > offline_max_time)
            ms = offline_max_time
        totalTimes = Math.floor(ms / (1000 / updateSpeed))

        if (totalTimes < 1) {
            in_offline_progress = false
            return
        }

        document.getElementById("offline_progress").hidden = false
        document.getElementById("mainarea").hidden = true
        intervalID = window.setInterval(runOfflineBatch, 20)
    }
}

// Catch-up used to run a fixed 100 ticks per frame and write #offline_time inside the inner loop, so
// a full hour cost 72,000 DOM writes and took ~14 s of wall clock no matter how fast the machine was.
// Run as many ticks as fit in a frame budget instead, and report progress once per frame.
function runOfflineBatch(){
    const budgetEnd = Date.now() + 16
    let alive = true

    while (executedTimes < totalTimes) {
        update(false)
        executedTimes++

        if (!isAlive()) {
            alive = false
            break
        }

        if (Date.now() >= budgetEnd)
            break
    }

    document.getElementById("offline_time").textContent = Math.floor(executedTimes * 100 / totalTimes) + "%"

    if (!alive || executedTimes >= totalTimes)
        stopOffline()
}

function stopOffline(){
    window.clearInterval(intervalID);
    document.getElementById("offline_progress").hidden = true
    document.getElementById("mainarea").hidden = false
    in_offline_progress = false;
}

function update(needUpdateUI = true) {
    if (in_offline_progress && needUpdateUI)
        return
    makeHeroes()
    increaseRealtime()
    increaseDays()
    autoPerks()
    autoPromote()
    autoBuy()
    applyExpenses()
    for (const key in gameData.taskData) {
        const task = gameData.taskData[key]
        if ((task instanceof Skill || task instanceof Job) && gameData.requirements[key].isCompleted()) {
            task.increaseXp()
        }
    }
    increaseCoins()

    gameData.evil_perks_points += applySpeed(getEvilPerksGeneration())
    gameData.dark_orbs += applySpeed(getDarkOrbGeneration())
    gameData.hypercubes += applySpeed(getHypercubeGeneration())
    if (!gameData.hypercube_cap_unlocked && getTotalPerkPoints() >= 1)
        gameData.hypercube_cap_unlocked = true
    if (gameData.hypercubes > getHypercubeCap())
        gameData.hypercubes = getHypercubeCap()
    // The cap is Infinity for anyone past the metaverse, so the clamp above does not bind.
    // Insurance, matching the guard commit 59fbfd8 put on evil and essence: at Infinity
    // getEtchingGainLog10()'s isFinite(h) bail returns LOG_ZERO forever and the Ledger is dead,
    // and Infinity serializes to null, so the damage would be permanent rather than transient.
    if (gameData.hypercubes > 1e308)
        gameData.hypercubes = 1e308

    updateSigilService()
    updateInscribedTaskRecords()
    // The write-back half of the same pair. restoreInscribedMilestones() is deliberately NOT
    // called here: it is unsuspendable, so a per-tick call would hand every inscribed essence
    // milestone back one tick into a challenge, which enterChallenge() has just torn down on
    // purpose - and challenge best scores are permanent and feed the essence and dark-matter
    // chains. The max-level half is suspension-aware, so it no-ops inside a challenge and
    // under the two sigils, and only fires once the suspension lifts. Without it, a teardown
    // performed while a dance_with_the_devil or the_darkest_time sigil is worn leaves every
    // inscribed task at maxLevel 0 for the whole cycle: restoreInscriptions() runs only at
    // teardowns, so removing the sigil afterwards restored nothing.
    restoreInscribedMaxLevels()

    applyMilestones()
    applyEvilPerks()
    applyPerks()
    applyAxioms()
    updateStats()
    if (needUpdateUI && !document.hidden)
        updateUI()
    else
        updateRequirements()
}

function applyPerks() {
    if (gameData.perks.instant_evil == 1) {
        if (gameData.evil < getEvilGain() * 10)
            gameData.evil = getEvilGain() * 10
    }

    if (gameData.perks.instant_essence == 1) {
        if (gameData.essence < getEssenceGain() * 10)
            gameData.essence = getEssenceGain() * 10
        if (gameData.essence == Infinity || gameData.essence > 1e308)
            gameData.essence = 1e308
    }

    if (gameData.perks.instant_dark_matter == 1) {
        if (gameData.dark_matter < getDarkMatterGain() * 10)
            gameData.dark_matter = getDarkMatterGain() * 10
    }
}

// The Book Reopens (js/authorship.js): the four essence doors that guard the Ledger drop from the
// price of "The End" to LEDGER_REOPENED_ESSENCE. Same mechanism applyEvilPerks() below already uses
// for sixteen thresholds - a per-tick rewrite of requirement.requirements[0].requirement - which
// also means the four literals in js/data.js are defaults that this function overwrites on the first
// tick. Both directions are written, so refunding the Axiom puts the price back; a latch already
// granted does not fall here, because requirement.completed is cleared by rebirthReset(), never by
// raising the threshold under it.
//
// getEtchingGainLog10()'s own "The End" gate is the fifth door and is deliberately NOT rewritten
// from here: it reads a milestone whose latch carries its own game effects, so lowering its price
// would hand those out too. It routes through isLedgerUnlocked() (js/ledger.js) instead.
const LEDGER_ESSENCE_GATES = ["Rebirth button 6", "Rebirth note 9", "Sigils", "key6"]

function applyAxioms() {
    const gate = hasAxiom("the_book_reopens") ? LEDGER_REOPENED_ESSENCE : LEDGER_SEALED_ESSENCE

    for (const key of LEDGER_ESSENCE_GATES) {
        const requirement = gameData.requirements[key]
        if (requirement !== undefined)
            requirement.requirements[0].requirement = gate
    }
}

function applyEvilPerks() {
    if (!gameData.evil_perks_keep && gameData.requirements["Dark Orbiter"].isCompleted())
        gameData.evil_perks_keep = true


    gameData.requirements["Rebirth note 0"].requirements[0].requirement = getAge0Requirement()
    gameData.requirements["Rebirth note 1"].requirements[0].requirement = getAge1Requirement()
    gameData.requirements["Rebirth note 2"].requirements[0].requirement = getEyeRequirement()
    gameData.requirements["Rebirth button 1"].requirements[0].requirement = getEyeRequirement()
    gameData.requirements["key1"].requirements[0].requirement = getEyeRequirement()

    gameData.requirements["Rebirth note 3"].requirements[0].requirement = getEvilRequirement()
    gameData.requirements["Rebirth button 2"].requirements[0].requirement = getEvilRequirement()
    gameData.requirements["Rebirth stats evil"].requirements[0].requirement = getEvilRequirement()    
    gameData.requirements["key2"].requirements[0].requirement = getEvilRequirement()

    gameData.requirements["Rebirth note 4"].requirements[0].requirement = getVoidRequirement()
    gameData.requirements["Void Manipulation"].requirements[0].requirement = getVoidRequirement()
    gameData.requirements["The Void"].requirements[0].requirement = getVoidRequirement()
    gameData.requirements["Corrupted"].requirements[0].requirement = getVoidRequirement()

    gameData.requirements["Galactic Council"].requirements[0].requirement = getCelestialRequirement()
    gameData.requirements["Celestial Powers"].requirements[0].requirement = getCelestialRequirement()
    gameData.requirements["Rebirth note 5"].requirements[0].requirement = getCelestialRequirement()
    gameData.requirements["Eternal Wanderer"].requirements[0].requirement = getCelestialRequirement()
}

function updateRequirements() {
    // Call isCompleted on every requirement as that function caches its result in requirement.completed
    for (const i in gameData.requirements) gameData.requirements[i].isCompleted()
}

function updateStats() {
    if (gameData.requirements["Rebirth stats evil"].isCompleted()) {
        gameData.stats.EvilPerSecond = Math.min(getEvilGain() / gameData.rebirthTwoTime, Number.MAX_VALUE)
        if (gameData.stats.EvilPerSecond > gameData.stats.maxEvilPerSecond) {
            gameData.stats.maxEvilPerSecond = gameData.stats.EvilPerSecond
            gameData.stats.maxEvilPerSecondRt = gameData.rebirthTwoTime
        }
    }

    if (gameData.requirements["Rebirth stats essence"].isCompleted()) {
        gameData.stats.EssencePerSecond = Math.min(getEssenceGain() / gameData.rebirthThreeTime, Number.MAX_VALUE)
        if (gameData.stats.EssencePerSecond > gameData.stats.maxEssencePerSecond) {
            gameData.stats.maxEssencePerSecond = gameData.stats.EssencePerSecond
            gameData.stats.maxEssencePerSecondRt = gameData.rebirthThreeTime
        }
    }

    if (gameData.essence > gameData.stats.maxEssenceReached)
        gameData.stats.maxEssenceReached = gameData.essence

    if (gameData.etchings_log10 > gameData.stats.maxEtchingsReachedLog10)
        gameData.stats.maxEtchingsReachedLog10 = gameData.etchings_log10
}

function resetGameData() {
    clearInterval(saveloop)
    clearInterval(gameloop)
    if (!confirm('Are you sure you want to reset the game?')) {
        gameloop = startGameLoop()
        saveloop = setInterval(saveGameData, 3000)
        return
    }
    localStorage.clear()
    location.reload()
}

function importGameData() {
    try {
        const importExportBox = document.getElementById("importExportBox")
        if (importExportBox.value == "") {
            alert("It looks like you tried to load an empty save... Paste save data into the box, then click \"Import Save\" again.")
            return
        }
        const data = JSON.parse(window.atob(importExportBox.value))
        clearInterval(gameloop)
        gameData = data
        saveGameData()
        location.reload()
    } catch (error) {
        alert("It looks like you tried to load a corrupted save... If this issue persists, feel free to contact the developers!")
    }
}

function exportGameData() {
    const importExportBox = document.getElementById("importExportBox")

    let saveString
    try {
        // btoa throws a DOMException on any character above U+00FF, which would otherwise freeze the
        // session from the Settings tab. Persisted content names are Latin-1 by rule; this is the net.
        saveString = window.btoa(JSON.stringify(gameData))
    } catch (error) {
        console.error(error)
        alert("Your save could not be exported. If this issue persists, feel free to contact the developers!")
        return
    }

    importExportBox.value = saveString
    copyTextToClipboard(saveString)
    setTimeout(() => {
        if (importExportBox.value == saveString) {
            importExportBox.value = ""
        }
    }, 15 * 1000)
}

function copyTextToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        const tooltip = document.getElementById("exportTooltip");
        tooltip.innerHTML = "&nbsp;&nbsp;Save copied to clipboard!" ;
    }, err => {
        //console.error('Async: Could not copy text: ', err);
    })
}

function outExportButton() {
    const tooltip = document.getElementById("exportTooltip");
    tooltip.textContent = "";
}

function onFontButtonHover() {
    const tooltip = document.getElementById("fontSizeTooltip");
    tooltip.classList.remove("hidden")
}

function onFontButtonStopHover() {
    const tooltip = document.getElementById("fontSizeTooltip");
    tooltip.classList.add("hidden")
}

function isNextDarkMagicSkillInReach() {
    const totalEvil = gameData.evil + getEvilGain()

    for (const key in gameData.taskData) {
        const skill = gameData.taskData[key]
        if (skillCategories["Dark Magic"].includes(key)) {
            const requirement = gameData.requirements[key]
            if (!requirement.isCompleted()) {
                if (totalEvil >= requirement.requirements[0].requirement) {
                    return true
                }
            }
        }
    }
    return false
}

// Boot-time integrity check over the parallel content tables. console.error only: a throw here is a
// blank page (see bootGame's comment). Catches the failure modes that are otherwise silent or fatal:
//   - a task/item with no requirementsBaseData key -> TypeError in autoPromote(), 20 Hz
//   - a milestone in milestoneBaseData but not in milestoneCategories -> renderMilestones()
//     dereferences a null row (renderMilestones iterates milestoneData, NOT the categories)
//   - a name whose id transform is not a valid CSS ident -> querySelectorAll throws in initializeUI
//   - a missing tooltip -> the literal string "undefined" in the row
function assertContentTableIntegrity() {
    const identSafe = (name) => {
        const id = removeSpaces(removeStrangeCharacters(name))
        for (const ch of id) {
            const code = ch.codePointAt(0)
            if (code >= 0x80) continue
            if (!/[A-Za-z0-9_-]/.test(ch)) return false
        }
        return /^[A-Za-z_-￿]/.test(id)
    }

    const inCategories = (categories) => {
        const seen = {}
        for (const categoryName in categories) {
            if (headerRowColors[categoryName] === undefined)
                console.error("integrity: no headerRowColors entry for category " + categoryName)
            if (headerRowTextColors[categoryName] === undefined)
                console.error("integrity: no headerRowTextColors entry for category " + categoryName)
            for (const name of categories[categoryName]) seen[name] = true
        }
        return seen
    }

    const jobSeen = inCategories(jobCategories)
    const skillSeen = inCategories(skillCategories)
    const itemSeen = inCategories(itemCategories)
    const milestoneSeen = inCategories(milestoneCategories)

    const check = (table, seen, label, needsRequirement) => {
        for (const name in table) {
            if (!identSafe(name))
                console.error("integrity: " + label + " name is not id-safe: " + name)
            if (!seen[name])
                console.error("integrity: " + label + " missing from its categories table: " + name)
            if (tooltips[name] === undefined)
                console.error("integrity: no tooltip for " + label + " " + name)
            if (needsRequirement && gameData.requirements[name] === undefined)
                console.error("integrity: no requirementsBaseData entry for " + label + " " + name)
        }
    }

    check(jobBaseData, jobSeen, "job", true)
    check(skillBaseData, skillSeen, "skill", true)
    check(itemBaseData, itemSeen, "item", true)
    check(milestoneBaseData, milestoneSeen, "milestone", true)

    // Born Heroic's load-bearing invariant: BORN_HEROIC_GATE must be the most expensive essence
    // milestone getHeroXpGainMultipliers() reads, so that latching it implies the whole heroic xp
    // stack. Add a heroic-xp milestone above it and Born Heroic unlocks heroes into a ~1x multiplier
    // stack that Heroic Beggar's 5e37 maxXp never clears - a save that looks healthy and can never
    // progress again.
    //
    // The name list is read out of the function itself rather than kept beside it, because the
    // hazard is precisely someone adding a line to that function and not knowing this list exists.
    const heroXpNames = []
    const heroXpPattern = /requirements\[\s*"([^"]+)"\s*\]/g
    let heroXpMatch
    while ((heroXpMatch = heroXpPattern.exec(getHeroXpGainMultipliers.toString())) !== null)
        heroXpNames.push(heroXpMatch[1])

    if (heroXpNames.length < 2) {
        console.error("integrity: could not read the milestone list out of getHeroXpGainMultipliers - Born Heroic's gate is unchecked")
    } else if (!heroXpNames.includes(BORN_HEROIC_GATE)) {
        console.error("integrity: " + BORN_HEROIC_GATE + " is not read by getHeroXpGainMultipliers, so it cannot gate Born Heroic")
    } else {
        const gateExpense = milestoneBaseData[BORN_HEROIC_GATE].expense
        for (const name of heroXpNames) {
            const milestone = milestoneBaseData[name]
            if (milestone === undefined || typeof milestone.expense !== "number") {
                console.error("integrity: heroic xp milestone has no essence price: " + name)
                continue
            }
            if (milestone.expense > gateExpense)
                console.error("integrity: heroic xp milestone " + name + " costs more essence than " + BORN_HEROIC_GATE + " - Born Heroic would unlock heroes without it")
        }
    }

    for (const layer in REBIRTH_LAYERS) {
        const spec = REBIRTH_LAYERS[layer]
        if (gameData.requirements[spec.gate] === undefined)
            console.error("integrity: layer " + layer + " gate missing: " + spec.gate)
        if (!(spec.countKey in gameData)) console.error("integrity: missing gameData." + spec.countKey)
        if (!(spec.timerKey in gameData)) console.error("integrity: missing gameData." + spec.timerKey)
        if (!(spec.statKey in gameData.stats)) console.error("integrity: missing gameData.stats." + spec.statKey)
    }
}

// Loads the game save, does the initial render and starts the game update and render loop.
//
// Phase 0's try/catch protects only the setInterval body. Everything below runs BEFORE the two
// intervals exist, and #errorInfo lives inside #mainarea, which is hidden until part-way through -
// so an unprotected throw here is a blank page with no banner. The catch unhides the page, shows the
// banner permanently, and starts NEITHER loop: a failed boot must not autosave over the player's
// localStorage.
let bootFailed = false

function bootGame() {
    createGameObjects(gameData.taskData, jobBaseData)
    createGameObjects(gameData.taskData, skillBaseData)
    createGameObjects(gameData.itemData, itemBaseData)
    createGameObjects(milestoneData, milestoneBaseData)

    gameData.currentJob = gameData.taskData["Beggar"]
    gameData.currentProperty = gameData.itemData["Homeless"]
    gameData.currentMisc = []

    gameData.requirements = requirementsBaseData

    createMilestoneRequirements()

    assertContentTableIntegrity()

    tempData["requirements"] = {}
    for (const key in gameData.requirements) {
        const requirement = gameData.requirements[key]
        tempData["requirements"][key] = requirement
    }

    loadGameData()

    initializeUI()

    setCustomEffects()
    addMultipliers()

    if ("save_date_time" in gameData && gameData.save_date_time > 0) {
        calc_offline_progress(Date.now() - gameData.save_date_time)
    }

    if (!in_offline_progress)
        document.getElementById("mainarea").hidden = false

    onResize(window.outerWidth)
    update()

    setTab(gameData.settings.selectedTab)
    setTabSettings("settingsTab")
    setTabDarkMatter("shopTab")
    setTabMetaverse("metaverseTab1")
    setTabLedger("ledgerTab1")
}

try {
    bootGame()
} catch (error) {
    bootFailed = true
    console.error(error)
    const mainarea = document.getElementById("mainarea")
    if (mainarea != null) mainarea.hidden = false
    const errorInfo = document.getElementById("errorInfo")
    if (errorInfo != null) {
        errorInfo.textContent = "The game failed to start: " + error
        errorInfo.hidden = false
    }
}

let ticking = false;

// Every site that starts the loop must go through here. resetGameData's cancel branch used to build
// its own bare setInterval(update, ...), which silently dropped the re-entrancy guard, the error
// handling and the mid-session offline catch-up for the rest of the session.
function startGameLoop() {
    return setInterval(function() {
        if (ticking) return;
        ticking = true;
        try {
            update();
            var ms = Date.now() - lastUpdate
            if (lastUpdate != 0 && ms >= 10000 && !in_offline_progress)
                calc_offline_progress(ms)
            lastUpdate = Date.now()

            // fps for debug only
            //var thisFrameTime = (thisLoop = new Date) - lastLoop;
            //frameTime += (thisFrameTime - frameTime) / filterStrength;
            //lastLoop = thisLoop;
        } catch (error) {
            onTickError(error)
        } finally {
            ticking = false;
        }
    }, 1000 / updateSpeed)
}

var gameloop = bootFailed ? null : startGameLoop()
var saveloop = bootFailed ? null : setInterval(saveGameData, 3000)

/* FPS */
/*
var filterStrength = 20;
var frameTime = 0, lastLoop = new Date, thisLoop;
var fpsOut = document.getElementById('fps');
setInterval(function () {
    fpsOut.innerHTML = (1000 / frameTime).toFixed(1) + " fps";
}, 1000);
*/
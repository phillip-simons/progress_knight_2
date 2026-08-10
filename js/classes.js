// Floor for the inverted max-level multiplier below. PROVISIONAL - a 100x penalty ceiling is a
// guess, not a measurement, and it wants the same calibration pass the ETCHING_* offsets got.
//
// Deliberately NOT gated on hasAxiom("nothing_is_unlearned"). maxLevel ratchets once that Axiom is
// owned and refunding it does not lower a single one of them, so a floor that switched off with the
// purchase would re-arm the shutdown it exists to prevent, against max levels the player can no
// longer get rid of. It also cannot disturb a challenge best score: enterChallenge() forces every
// maxLevel to 0, so inside a challenge the expression is 10 and the floor never binds. It binds only
// for a worn sigil outside a challenge, and setChallengeProgress() reads gameData.active_challenge
// directly, so a sigil provably never writes a score.
const MAX_LEVEL_INVERSE_FLOOR = 0.01

class Task {
    constructor(baseData) {
        this.baseData = baseData
        this.name = baseData.name
        this.level = 0
        this.maxLevel = 0
        this.xp = 0
        this.xpBigInt = BigInt(0)
        this.isHero = false
        this.isFinished = false
        this.unlocked = false

        this.xpMultipliers = []

        this.elementsCache = {}
    }

    toJSON() {
        return {
            baseData: this.baseData,
            name: this.name,
            level: this.level,
            maxLevel: this.maxLevel,
            xp: this.xp,
            xpBigInt: bigIntToExponential(this.xpBigInt),
            isHero: this.isHero,
            isFinished: this.isFinished,
            unlocked: this.unlocked
        }
    }

    getMaxXp() {
        const maxXp = (this.isHero ? Math.pow(10, this.baseData.heroxp) : 1) * this.baseData.maxXp * (this.level + 1) * Math.pow(this.isHero ? 1.08 : 1.01, this.level)

        if (isNaN(maxXp) || maxXp == Infinity || maxXp > 1e305) {
            this.isFinished = true
        }

        return maxXp
    }

    getMaxBigIntXp() {
        const rawMaxXp = this.getMaxXp()
        const maxXp = (rawMaxXp == Infinity || isNaN(rawMaxXp)) ? BigInt(1e305) : bigIntSafe(Math.floor(rawMaxXp));

        if (maxXp < 1e305)
            return maxXp

        return maxXp * this.getLevelBigIntFactor() * this.getHeroBigIntFactor()
    }

    // Both factors used to be recomputed on every pass of increaseXp's level loop. The hero factor is
    // constant per task, and the level factor only steps once per 120 levels - for Omega (heroxp 3120)
    // that was 2n ** 346n per pass.
    getLevelBigIntFactor() {
        const band = Math.floor(this.level / 120)
        if (this.levelBigIntBand !== band) {
            this.levelBigIntBand = band
            this.levelBigIntFactor = 2n ** BigInt(band)
        }
        return this.levelBigIntFactor
    }

    getHeroBigIntFactor() {
        if (this.heroBigIntFactor === undefined)
            this.heroBigIntFactor = 2n ** (BigInt(this.baseData.heroxp) / 9n)
        return this.heroBigIntFactor
    }

    getXpLeft() {
        return this.getMaxXp() - this.xp
    }

    getMaxLevelMultiplier() {
        if (isChallengeActive("dance_with_the_devil") || isChallengeActive("the_darkest_time")) {
           return Math.max(10 / (this.maxLevel + 1), MAX_LEVEL_INVERSE_FLOOR)
        }
        else {
            let effect = gameData.taskData['Cosmic Recollection'].getEffect();
            effect = effect == 0 ? 1 : effect
            return (this.baseData.heroxp < 1000) ? 1 + this.maxLevel / 10 : 1 + this.maxLevel / effect
        }
    }

    getXpGain() {
        return (this.isHero ? getHeroXpGainMultipliers(this) : 1) * applyMultipliers(10, this.xpMultipliers)
    }

    getXpGainBigInt() {
        let xpGain = bigIntSafe(Math.floor(this.isHero ? getHeroXpGainMultipliers(this) : 1), 1n)

        this.xpMultipliers.forEach(multiplier => {
            xpGain *= bigIntSafe(Math.ceil(multiplier()), 1n)
        })

        return xpGain
    }

    getXpGainFormatted() {
        if (this.isFinished)
            return bigIntToExponential(this.getXpGainBigInt())
        return format(this.getXpGain())
    }

    getXpLeftFormatted() {
        if (this.isFinished)
            return bigIntToExponential(this.getMaxBigIntXp() - this.xpBigInt)
        return format(this.getXpLeft())
    }

    increaseXp() {
        if (this.isFinished) {
            this.xpBigInt += applySpeedOnBigInt(this.getXpGainBigInt())

            let maxBigIntXp = this.getMaxBigIntXp()

            if (this.xpBigInt >= maxBigIntXp) {
                let excess = this.xpBigInt - maxBigIntXp

                let iterations = 0
                while (excess >= 0n) {
                    iterations += 1

                    // This amount is way lower because calculations with a BigInt are really expensive.
                    // Probably want to look into more optimizations.
                    if (iterations > 300)
                        excess = -1n

                    this.level += 1
                    this.unlocked = true
                    // Depends on the level just incremented, so it has to be recomputed here - but
                    // the two calls that did not depend on it are now hoisted out.
                    maxBigIntXp = this.getMaxBigIntXp()
                    excess -= maxBigIntXp
                }
                this.xpBigInt = maxBigIntXp + excess
            }
        } else {
            this.xp += applySpeed(this.getXpGain())

            if (this.xp > 1e275 || isNaN(this.xp) || this.xp == Infinity || this.getXpGain() == Infinity
                || this.getMaxXp() == Infinity || this.getXpLeft() == Infinity) {
                this.isFinished = true
                return
            }

            if (this.xp >= this.getMaxXp()) {
                let excess = this.xp - this.getMaxXp()

                let iterations = 0
                while (excess >= 0) {
                    iterations += 1

                    if (iterations > 2500)
                        excess = -1

                    this.level += 1
                    this.unlocked = true
                    excess -= this.getMaxXp()
                }
                this.xp = this.getMaxXp() + excess
            }
        }
    }

    querySelector(selector, row) {
        const cachedElement = this.elementsCache[selector]

        if (cachedElement !== undefined)
            return cachedElement

        const element = row.querySelector(selector)
        this.elementsCache[selector] = element
        return element
    }

}

class Milestone {
    constructor(baseData) {
        this.baseData = baseData
        this.name = baseData.name
        this.tier = baseData.tier
        // Etching-priced milestones carry expense_log10 and no linear expense. `expense` is set to
        // NaN rather than left undefined on purpose: format(undefined) THROWS inside the vendored
        // math.js bundle, while format(NaN) renders the visible string "NaN".
        this.expense = (baseData.expense != null) ? baseData.expense : NaN
        this.expense_log10 = (baseData.expense_log10 != null)
            ? baseData.expense_log10
            : Math.log10(baseData.expense)
        this.description = baseData.description
        this.unlocked = false
    }

    getTier() { return this.tier }
}

class Job extends Task {
    constructor(baseData) {
        super(baseData)
        this.incomeMultipliers = []
    }

    getLevelMultiplier() {
        return 1 + Math.log10(this.level + 1)
    }

    getIncome() {
        const income = (this.isHero ? getHeroIncomeMult()
            * (this.baseData.heroxp > 78 ? 1e6 : 1)
            * (this.baseData.heroxp > 130 ? 1e5 : 1)
            : 1) * applyMultipliers(this.baseData.income, this.incomeMultipliers) * getChallengeBonus("rich_and_the_poor")

        return isChallengeActive("rich_and_the_poor") || isChallengeActive("the_darkest_time") ? Math.pow(income, 0.35) : income
    }
}

class Skill extends Task {
    constructor(baseData) {
        super(baseData)
    }

    getEffect() {
        var effect = 1 + this.baseData.effect * (this.isHero ? 1000 * this.level + 8000 : this.level)
        return effect
    }

    getEffectDescription() {
        return "x" + format(this.getEffect(), 2) + " " + this.baseData.description
    }
}

class Item {
    constructor(baseData) {
        this.baseData = baseData
        this.name = baseData.name
        this.expenseMultipliers = []
        this.isHero = false
        this.unlocked = false
    }

    getEffect() {
        let effect = this.baseData.effect

        if (this.isHero) {
            if (itemCategories["Misc"].includes(this.name))
            {
                if (gameData.currentMisc.includes(this)) {
                    effect *= this.baseData.heroeffect                    
                    this.unlocked = true
                }
            }

            if (itemCategories["Properties"].includes(this.name)) {
                if (gameData.currentProperty == this) {
                    effect = this.baseData.heroeffect
                    this.unlocked = true
                }
                else
                    effect = 1
            }
        } else {
            if (gameData.currentProperty != this && !gameData.currentMisc.includes(this))
                return 1
            else
                this.unlocked = true
        }

        return effect
    }

    getEffectDescription() {
        let description = this.baseData.description
        let effect = this.baseData.effect

        if (this.isHero) {
            if (itemCategories["Misc"].includes(this.name)) {
                effect *= this.baseData.heroeffect
            }

            if (itemCategories["Properties"].includes(this.name)) {
                description = "Happiness"
                effect = this.baseData.heroeffect
            }
        }
        else {
            if (itemCategories["Properties"].includes(this.name)) description = "Happiness"
        }

        return "x" + format(effect) + " " + description
    }

    getExpense(heroic) {
        if (heroic === undefined)
            heroic = this.isHero
        return (heroic ? 4 * Math.pow(10, this.baseData.heromult) * getHeroIncomeMult() : 1)
            * applyMultipliers(this.baseData.expense, this.expenseMultipliers)
    }
}

class Requirement {
    constructor(querySelectors, requirements) {
        this.querySelectors = querySelectors
        this.elements = []
        this.requirements = requirements
        this.completed = false
    }

    queryElements() {
        this.querySelectors.forEach(querySelector => {
            this.elements.push(...document.querySelectorAll(querySelector))
        })
    }

    isCompleted() {
        if (this.completed) return true
        for (const requirement of this.requirements) {
            if (!this.getCondition(false, requirement)) {
                return false
            }
        }
        this.completed = true
        return true
    }

    isCompletedActual(isHero = false) {
        for (const requirement of this.requirements) {
            if (!this.getCondition(isHero, requirement)) {
                return false
            }
        }
        return true
    }
}

class TaskRequirement extends Requirement {
    constructor(querySelectors, requirements) {
        super(querySelectors, requirements)
        this.type = "task"
    }

    getCondition(isHero, requirement) {
        if (isHero && requirement.herequirement != null)
            return gameData.taskData[requirement.task].level >= requirement.herequirement
        else if (gameData.taskData[requirement.task].isHero && requirement.isHero)
            return true
        else
            return gameData.taskData[requirement.task].level >= requirement.requirement
    }
}

class CoinRequirement extends Requirement {
    constructor(querySelectors, requirements) {
        super(querySelectors, requirements)
        this.type = "coins"
    }

    getCondition(isHero, requirement) {
        return gameData.coins >= requirement.requirement
    }
}

class AgeRequirement extends Requirement {
    constructor(querySelectors, requirements) {
        super(querySelectors, requirements)
        this.type = "age"
    }

    getCondition(isHero, requirement) {
        return daysToYears(gameData.days) >= requirement.requirement
    }
}

class EvilRequirement extends Requirement {
    constructor(querySelectors, requirements) {
        super(querySelectors, requirements)
        this.type = "evil"
    }

    getCondition(isHero, requirement) {
        return gameData.evil >= requirement.requirement
    }
}

class EssenceRequirement extends Requirement {
    constructor(querySelectors, requirements) {
        super(querySelectors, requirements)
        this.type = "essence"
    }

    getCondition(isHero, requirement) {
        //return gameData.essence >= requirement.requirement

        if (isHero && requirement.herequirement != null)
            return gameData.essence >= requirement.herequirement
        else
            return gameData.essence >= requirement.requirement

    }
}

class DarkMatterRequirement extends Requirement {
    constructor(querySelectors, requirements) {
        super(querySelectors, requirements)
        this.type = "darkMatter"
    }

    getCondition(isHero, requirement) {
        return gameData.dark_matter >= requirement.requirement
    }
}

class DarkOrbsRequirement extends Requirement {
    constructor(querySelectors, requirements) {
        super(querySelectors, requirements)
        this.type = "darkOrb"
    }

    getCondition(isHero, requirement) {
        return gameData.dark_orbs >= requirement.requirement
    }
}

class MetaverseRequirement extends Requirement {
    constructor(querySelectors, requirements) {
        super(querySelectors, requirements)
        this.type = "metaverse"
    }

    getCondition(isHero, requirement) {
        return gameData.rebirthFiveCount >= requirement.requirement
    }
}

class HypercubeRequirement extends Requirement {
    constructor(querySelectors, requirements) {
        super(querySelectors, requirements)
        this.type = "hypercube"
    }

    getCondition(isHero, requirement) {
        return gameData.hypercubes >= requirement.requirement
    }
}

class PerkPointRequirement extends Requirement {
    constructor(querySelectors, requirements) {
        super(querySelectors, requirements)
        this.type = "perkpoint"
    }

    getCondition(isHero, requirement) {
        return gameData.perks_points >= requirement.requirement
    }
}

class EtchingRequirement extends Requirement {
    constructor(querySelectors, requirements) {
        super(querySelectors, requirements)
        this.type = "etching"
    }

    // Thresholds are stored in `requirement_log10` / `herequirement_log10`, NOT in `requirement`:
    // every other subclass's `requirement` is a linear value, so a bare 8 in that field would be
    // read and rendered as "8 Etchings" instead of 1e8. A missing or non-numeric threshold makes
    // the requirement unreachable rather than throwing - this runs at 20 Hz inside
    // renderRequirements(), where a throw is a dead session.
    getCondition(isHero, requirement) {
        const threshold = (isHero && requirement.herequirement_log10 != null)
            ? requirement.herequirement_log10
            : requirement.requirement_log10
        if (typeof threshold !== "number") return false

        // Tolerates classes.js loading before data.js declares the field.
        const owned = (typeof gameData.etchings_log10 === "number") ? gameData.etchings_log10 : LOG_ZERO
        return owned >= threshold
    }
}

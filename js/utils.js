function softcap(value, cap, power = 0.5) {
    if (value <= cap) return value

    return Math.pow(value, power) * Math.pow(cap, 1 - power)
}

// BigInt() throws a RangeError on Infinity and NaN. Late game the multipliers feeding the BigInt xp
// path do reach Infinity, and a throw inside update() takes the whole game loop down with it, so
// every conversion of a computed number goes through here. NaN substitutes nanFallback because a
// zeroed multiplier would silently stop all progression.
function bigIntSafe(number, nanFallback = 0n) {
    if (isNaN(number)) return nanFallback
    if (number === Infinity) return BigInt(Number.MAX_VALUE)
    if (number === -Infinity) return -BigInt(Number.MAX_VALUE)
    // Every finite double converts exactly, so only the two sentinels above change behaviour.
    // Math.trunc keeps this total: BigInt() also throws on a non-integer.
    return BigInt(Math.trunc(number))
}

// Currencies that outgrow 1e308 are stored as log10 of their true value, in a field suffixed _log10.
// A zero balance is a finite sentinel rather than -Infinity: JSON.stringify turns -Infinity into
// null, and replaceSaveDict only backfills *absent* keys, so a null would never be repaired.
const LOG_ZERO = -1e300

// log10(10^a + 10^b) without leaving log space.
function logAdd(aLog, bLog) {
    if (aLog <= LOG_ZERO) return bLog
    if (bLog <= LOG_ZERO) return aLog

    const hi = Math.max(aLog, bLog)
    const lo = Math.min(aLog, bLog)

    // Past ~17 orders of magnitude the smaller term cannot move a double anyway.
    if (hi - lo > 17) return hi

    return hi + Math.log10(1 + Math.pow(10, lo - hi))
}

// softcap() for a value already in log space: cap is also a log10.
function logSoftcap(logValue, logCap, power = 0.5) {
    if (logValue <= logCap) return logValue

    return logValue * power + logCap * (1 - power)
}

// A near-hard cap for a value that is *measured* in orders of magnitude but is itself a plain
// number: linear up to `cap`, logarithmic above it.
//
// This is NOT logSoftcap() and NOT softcap(). Those apply a *power* tail to a value; this applies a
// *log* tail, and the difference is the whole point. capWithLogTail(500, 30) === 32.7 while
// softcap(500, 30) === 122.5. The Ledger gain formula uses it so that an unbounded input (idle
// hypercube accumulation, a clamped essence chain) cannot dominate every gameplay input.
//
// Do NOT rename this to logCap: in this file a log* prefix means "the argument is already a log10"
// (logAdd, logSoftcap, formatLog10), and this one's argument is linear.
function capWithLogTail(value, cap) {
    if (value <= cap) return value

    return cap + Math.log10(1 + value - cap)
}

// format() for a log10 value. Mirrors all three numberNotation branches, so a logspace currency
// renders identically to a linear one. Non-finite input is rejected rather than displayed: a
// silently wrong small number is the main hazard of logspace storage.
function formatLog10(logValue, decimals = 1) {
    if (typeof logValue !== "number" || isNaN(logValue)) return "NaN"
    if (logValue <= LOG_ZERO) return math.floor(0, decimals).toFixed(decimals)
    if (logValue === Infinity) return "Infinity"

    const tier = logValue / 3 | 0
    if (tier <= 0) return math.floor(Math.pow(10, logValue), decimals).toFixed(decimals)

    if ((gameData.settings.numberNotation == 0 || tier < 3) && (tier < formatUnits.length)) {
        const scaled = Math.pow(10, logValue - tier * 3)
        return math.floor(scaled, decimals).toFixed(decimals) + formatUnits[tier]
    }

    const exp = gameData.settings.numberNotation == 1 ? (logValue | 0) : (logValue / 3 | 0) * 3
    const scaled = Math.pow(10, logValue - exp)
    return math.floor(scaled, decimals).toFixed(decimals) + "e" + exp
}

const formatUnits = ["", "k", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "O", "N", "D", "Ud", "Dd", "Td", "Qad", "Qid", "Sxd", "Spd", "Od", "Nd", "V", "Uv", "Dv", "Tv",
"Qav", "Qiv", "Sxv", "Spv", "Ov", "Nv", "Tr", "Ut", "Dt", "Tt"]

function format(number, decimals = 1) {
    const units = formatUnits

    // what tier? (determines SI symbol)
    const tier = Math.log10(number) / 3 | 0;
    if (tier <= 0) return math.floor(number, decimals).toFixed(decimals);

    if ((gameData.settings.numberNotation == 0 || tier < 3) && (tier < units.length)) {
        const suffix = units[tier];
        const scale = Math.pow(10, tier * 3);
        const scaled = number / scale;
        return math.floor(scaled, decimals).toFixed(decimals) + suffix;
    } else {
        if (gameData.settings.numberNotation == 1) {
            const exp = Math.log10(number) | 0;
            const scale = Math.pow(10, exp);
            const scaled = number / scale;
            return math.floor(scaled, decimals).toFixed(decimals) + "e" + exp;
        }
        else {
            const exp = Math.log10(number) / 3 | 0;
            const scale = Math.pow(10, exp * 3);
            const scaled = number / scale;
            return math.floor(scaled, decimals).toFixed(decimals) + "e" + exp * 3;
        }
    }
}

function getCoinsData() {
    switch (gameData.settings.currencyNotation) {
        case 0: return [
            { "name": "p", "color": "#79b9c7", "value": 1e6 },
            { "name": "g", "color": "#E5C100", "value": 10000 },
            { "name": "s", "color": "#a8a8a8", "value": 100 },
            { "name": "c", "color": "#a15c2f", "value": 1 },
        ];
        case 1: return [
            { "name": " 𒀱", "color": "#ffffff", "value": 1e62, "class": "currency-shadow-rainbow" },
            { "name": " 𒀱", "color": "#ffffff", "value": 1e47, "class": "currency-shadow" },
            { "name": " 𒇫", "color": "#66ccff", "value": 1e41, "class": "currency-shadow" },
            { "name": "🜊", "color": "#00ff00", "value": 1e35, "class": "currency-bold" },
            { "name": "✹", "color": "#ffffcc", "value": 1e30 },
            { "name": "∰", "color": "#ff0083", "value": 1e26 },
            { "name": "Φ", "color": "#27b897", "value": 1e23 },
            { "name": "Ξ", "color": "#cd72ff", "value": 1e20 },
            { "name": "Δ", "color": "#f5c211", "value": 1e17 },
            { "name": "d", "color": "#ffffff", "value": 1e14 },
            { "name": "r", "color": "#ed333b", "value": 1e12 },
            { "name": "S", "color": "#6666ff", "value": 1e10 },
            { "name": "e", "color": "#2ec27e", "value": 1e8 },
            { "name": "p", "color": "#79b9c7", "value": 1e6 },
            { "name": "g", "color": "#E5C100", "value": 10000 },
            { "name": "s", "color": "#a8a8a8", "value": 100 },
            { "name": "c", "color": "#a15c2f", "value": 1 },
        ];
        case 2: return [
            { "name": "", "color": "#E5C100", "value": 240, "prefix": "£" },
            { "name": "s", "color": "#a8a8a8", "value": 12 },
            { "name": "d", "color": "#a15c2f", "value": 1 },
        ];
        default: throw new Error("Invalid currency notation set");
    }
}

function formatWhole(number, decimals = 1) {
    if (number >= 1e3 || (number <= 0.99 && number != 0)) {
        return format(number, decimals)
    }
    return format(number, 0);
}

function formatCoins(coins, element) {
    for (const c of element.children) {
        c.textContent = "";
    }

    switch (gameData.settings.currencyNotation) {
        case 0:
        case 1:
        case 2:
            const money2 = getCoinsData()

            let coinsUsed = 0
            for (let i = 0; i < money2.length; i++) {
                const m = money2[i];
                const prev = money2[i - 1];
                const diff = prev ? prev.value / m.value : Infinity;
                const amount = Math.floor(coins / m.value) % diff;
                if ((amount > 0 || (coins < 1 && m.value == 1))) {
                    element.children[coinsUsed].textContent = (m.prefix ?? "") + format(amount, amount < 1000 ? 0 : 2) + m.name
                    element.children[coinsUsed].style.color = m.color
                    element.children[coinsUsed].className = m.class ? m.class : ""
                    coinsUsed++
                }
                if (coinsUsed >= 2 || amount >= 100) break;
            }
            break;
        case 3:
            element.children[0].textContent = "$" + format(coins / 100, 2)
            element.children[0].style.color = "#E5C100"
            element.children[0].className = ""
            break;
        default:
            throw new Error("Invalid currency notation set");
    }
}

function formatTime(sec_num, show_ms = false) {
    if (sec_num == null) {
        return "unknown"
    }
    if (sec_num < 0) {
        return '-' + formatTime(-sec_num, show_ms)
    }

    if (sec_num >= 31536000) {
        let years = Math.floor(sec_num / 31536000)
        if (years >= 1000) {
            return formatWhole(years) + ' years'
        }
        return years + 'y ' + formatTime(sec_num % 31536000, show_ms)
    }
    if (sec_num >= 86400) {
        let days = Math.floor(sec_num / 86400)
        return days + 'd ' + formatTime(sec_num % 86400, show_ms)
    }

    let hours = Math.floor(sec_num / 3600)
    let minutes = Math.floor((sec_num - (hours * 3600)) / 60)
    let seconds = Math.floor(sec_num - (hours * 3600) - (minutes * 60))
    let ms = Math.floor((sec_num - Math.floor(sec_num)) * 1000)
    let mss = (show_ms ? "." + ms.toString().padStart(3, "0") : "")

    if (hours < 10) hours = "0" + hours
    if (minutes < 10) minutes = "0" + minutes
    if (seconds < 10) seconds = "0" + seconds
    return (sec_num > 3600 ? hours + ':' : "") + minutes + ':' + seconds + mss
}

function formatTreshold(number, decimals = 1, treshold = 100000) {
    if (number < treshold)
        return Math.floor(number)
    else
        return format(number, decimals)
}

function formatLevel(level) {
    if (level >= 100000)
        return format(level)

    return level.toLocaleString()
}

function formatAge(days) {
    const years = daysToYears(days)
    const day = getCurrentDay(days)
    if (years > 10000)
        return "Age " + format(years)
    else
        return "Age " + years + " Day " + day
}

function getBaseLog(x, y) {
    return Math.log(y) / Math.log(x);
}

function yearsToDays(years) {
    return years * 365
}

function daysToYears(days) {
    return Math.floor(days / 365)
}

function getCurrentDay(days) {
    return Math.floor(days - daysToYears(days) * 365)
}

function getElementsByClass(className) {
    return document.getElementsByClassName(removeSpaces(className))
}

function removeSpaces(string) {
    return string.replace(/ /g, "")
}

function removeStrangeCharacters(string) {
    return string.replace(/'/g, "")
}

function bigIntToExponential(value) {
    if(typeof value !== 'bigint') throw new Error("Argument must be a bigint, but a " + (typeof value) + " was supplied.");

    const isNegative = value < 0;
    if (isNegative) value = -value; // Using the absolute value for the digits.

    const str = value.toString();

    const exp = str.length - 1;
    if (exp == 0) return (isNegative ? "-" : '') + str + "e0";

    const mantissaDigits = str.replace(/(0+)$/, ''); // Remove any mathematically insignificant zeroes.

    // Use the single first digit for the integral part of the mantissa
    const mantissa = mantissaDigits.charAt(0);

    return (isNegative ? "-" : '') + mantissa + "e" + exp.toString();
}

function exponentialToRawNumberString(value) {
    if (value == "" || value.length == 0)
        return "0"

    const split = value.split("e")
    const first = split[0]
    const exponent = Number(split[1])

    return first + [...Array(exponent)].map(() => "0").join("")
}

function getChallengeTaskGoalProgress(taskName) {
    if (!Object.keys(gameData.taskData).includes(taskName))
        return 0
    if (gameData.taskData[taskName].isHero)
        return gameData.taskData[taskName].level * 1000
    else
        return gameData.taskData[taskName].level
}

function getFormattedChallengeTaskGoal(taskName, level) {
    if (level < 100000)
        return taskName + " lvl " + formatLevel(level)
    else
        return "Great " + taskName + " lvl " + formatLevel(Math.ceil(level / 1000))
}

function getFormattedTitle(parameter) {    
    let title = parameter.replaceAll("_", " ")
    title = title.charAt(0).toUpperCase() + title.slice(1)

    return title
}

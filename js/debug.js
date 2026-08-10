/*
    Debug panel. Press ` (grave/backtick) to toggle.

    ============================================================================
    REMOVING THIS FOR A RELEASE BUILD
    ============================================================================
    Delete this file and its one <script> tag in index.html. That is the whole
    procedure. Nothing else in the codebase references anything defined here:
    the panel builds its own markup, injects its own CSS, registers its own key
    handler, and installs its multipliers by wrapping the existing functions at
    load time. There are no hooks in game code to find and rip out, and no debug
    field in gameData to migrate away.

    To disable it without deleting it, set DEBUG_ENABLED to false below.

    ============================================================================
    WHY IT IS BUILT THIS WAY
    ============================================================================
    Debug state lives in `debugState`, NOT in gameData. Adding fields to
    gameData would put them in every player's save, and replaceSaveDict deletes
    save keys absent from the defaults - so a debug field would be a migration
    problem in both directions. As a consequence the multipliers reset on
    reload, which is the safer default anyway.

    A caveat worth knowing while testing: the game-speed multiplier goes through
    getUnpausedGameSpeed(), which setChallengeProgress() reads when scoring the
    "time does not fly" challenge. Challenge best scores are permanent and have
    no recompute path, so exiting that challenge with a debug speed set writes a
    permanent inflated score. Same for any challenge scored off xp progress with
    the xp multiplier set. Test challenges on a throwaway save.
*/

const DEBUG_ENABLED = true

if (DEBUG_ENABLED && typeof gameData !== "undefined") {

const debugState = {
    xpMultiplier: 1,
    speedMultiplier: 1,
    open: false,
    built: false,
}

// ---------------------------------------------------------------------------------------------
// Hooks. Installed by wrapping, so game code needs no debug-aware branches.
// ---------------------------------------------------------------------------------------------

if (typeof Task !== "undefined") {
    const baseGetXpGain = Task.prototype.getXpGain
    Task.prototype.getXpGain = function () {
        return baseGetXpGain.call(this) * debugState.xpMultiplier
    }

    // The BigInt path is separate and ignores the double path entirely, so it needs its own wrap.
    // bigIntSafe keeps a non-finite or fractional multiplier from throwing a RangeError in here.
    const baseGetXpGainBigInt = Task.prototype.getXpGainBigInt
    Task.prototype.getXpGainBigInt = function () {
        const gain = baseGetXpGainBigInt.call(this)
        if (debugState.xpMultiplier === 1) return gain
        return gain * bigIntSafe(Math.floor(debugState.xpMultiplier), 1n)
    }
}

// Wrapping the unpaused variant covers the BigInt speed path too: applySpeedOnBigInt reads
// getGameSpeed(), which composes from this.
if (typeof getUnpausedGameSpeed === "function") {
    const baseGetUnpausedGameSpeed = getUnpausedGameSpeed
    getUnpausedGameSpeed = function () {
        return baseGetUnpausedGameSpeed() * debugState.speedMultiplier
    }
}

// ---------------------------------------------------------------------------------------------
// Currencies. Each knows how to read and add itself, because they are not on one scale:
// etchings are stored as log10 and must go through grantEtchings, and axioms are a small integer.
// ---------------------------------------------------------------------------------------------

const DEBUG_CURRENCIES = [
    { key: "coins", label: "Coins", read: () => gameData.coins, add: (n) => { gameData.coins += n } },
    { key: "evil", label: "Evil", read: () => gameData.evil, add: (n) => { gameData.evil = Math.min(gameData.evil + n, 1e308) } },
    { key: "essence", label: "Essence", read: () => gameData.essence, add: (n) => { gameData.essence = Math.min(gameData.essence + n, 1e308) } },
    { key: "dark_matter", label: "Dark Matter", read: () => gameData.dark_matter, add: (n) => { gameData.dark_matter += n } },
    { key: "dark_orbs", label: "Dark Orbs", read: () => gameData.dark_orbs, add: (n) => { gameData.dark_orbs += n } },
    { key: "hypercubes", label: "Hypercubes", read: () => gameData.hypercubes, add: (n) => { gameData.hypercubes += n } },
    { key: "perks_points", label: "Perk Points", read: () => gameData.perks_points, add: (n) => { gameData.perks_points += n } },
    { key: "evil_perks_points", label: "Evil Perk Pts", read: () => gameData.evil_perks_points, add: (n) => { gameData.evil_perks_points += n } },
    {
        key: "etchings", label: "Etchings", log10: true,
        read: () => gameData.etchings_log10,
        // Stored as log10, so "add 1e12" means granting 12 in log space. grantEtchings owns the
        // only write to that field and keeps the lifetime-earned stat in step.
        add: (n) => {
            if (n <= 0) return
            if (typeof grantEtchings === "function") grantEtchings(Math.log10(n))
            else gameData.etchings_log10 = logAdd(gameData.etchings_log10, Math.log10(n))
        },
    },
    { key: "axioms", label: "Axioms", read: () => gameData.axioms, add: (n) => { gameData.axioms += Math.floor(n) } },
]

function debugFormat(currency) {
    const value = currency.read()
    if (value === undefined) return "n/a"
    if (currency.log10) return typeof formatLog10 === "function" ? formatLog10(value) : String(value)
    return typeof format === "function" ? format(value) : String(value)
}

// ---------------------------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------------------------

function debugUnlockEverything() {
    for (const key in gameData.requirements)
        gameData.requirements[key].completed = true
}

function debugSetAge(years) {
    gameData.days = Math.max(0, years * 365)
}

function debugAddTaskLevels(levels) {
    for (const name in gameData.taskData) {
        const task = gameData.taskData[name]
        task.level += levels
        if (task.level > task.maxLevel) task.maxLevel = task.level
    }
}

function debugReadAmount() {
    const raw = document.getElementById("debugAmount").value
    const parsed = Number(raw)
    return isFinite(parsed) && parsed > 0 ? parsed : 0
}

// ---------------------------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------------------------

const DEBUG_CSS = `
#debugPanel { position: fixed; top: 0; right: 0; width: 340px; max-height: 100vh; overflow-y: auto;
  background: #14161a; color: #d6d9de; font: 12px/1.45 ui-monospace, Menlo, Consolas, monospace;
  border-left: 2px solid #e0b341; z-index: 99999; padding: 10px 12px 16px; }
#debugPanel h3 { margin: 0 0 2px; font-size: 13px; color: #e0b341; letter-spacing: .04em; }
#debugPanel .debugHint { color: #7c828c; margin-bottom: 10px; }
#debugPanel .debugSection { border-top: 1px solid #2a2e35; margin-top: 10px; padding-top: 8px; }
#debugPanel .debugSection > .debugTitle { color: #9aa2ad; text-transform: uppercase;
  font-size: 10px; letter-spacing: .09em; margin-bottom: 6px; }
#debugPanel button { background: #232830; color: #d6d9de; border: 1px solid #39404a;
  border-radius: 3px; padding: 3px 7px; margin: 0 3px 3px 0; cursor: pointer; font: inherit; }
#debugPanel button:hover { background: #2f3742; border-color: #e0b341; }
#debugPanel input { background: #0e1013; color: #d6d9de; border: 1px solid #39404a;
  border-radius: 3px; padding: 3px 5px; font: inherit; width: 100%; box-sizing: border-box; }
#debugPanel .debugRow { display: flex; justify-content: space-between; align-items: center;
  gap: 6px; margin-bottom: 3px; }
#debugPanel .debugRow > span { color: #9aa2ad; white-space: nowrap; }
#debugPanel .debugValue { color: #7fd1a0; text-align: right; overflow: hidden;
  text-overflow: ellipsis; flex: 1; }
#debugPanel .debugWarn { color: #d98b8b; margin-top: 8px; }
`

function buildDebugPanel() {
    const style = document.createElement("style")
    style.textContent = DEBUG_CSS
    document.head.appendChild(style)

    const panel = document.createElement("div")
    panel.id = "debugPanel"
    panel.hidden = true

    const multiplierButtons = (kind) => [1, 10, 1000, 1e6, 1e12, 1e30]
        .map(v => `<button data-mult="${kind}" data-value="${v}">${v === 1 ? "off" : "x" + format(v)}</button>`)
        .join("")

    panel.innerHTML = `
        <h3>DEBUG</h3>
        <div class="debugHint">\` to close &middot; not saved &middot; resets on reload</div>

        <div class="debugSection">
            <div class="debugTitle">XP gain &mdash; <span id="debugXpValue"></span></div>
            ${multiplierButtons("xp")}
        </div>

        <div class="debugSection">
            <div class="debugTitle">Game speed &mdash; <span id="debugSpeedValue"></span></div>
            ${multiplierButtons("speed")}
        </div>

        <div class="debugSection">
            <div class="debugTitle">Add resources</div>
            <input id="debugAmount" type="text" value="1e12" spellcheck="false">
            <div id="debugCurrencies" style="margin-top:6px"></div>
        </div>

        <div class="debugSection">
            <div class="debugTitle">Shortcuts</div>
            <button data-action="unlock">Unlock everything</button>
            <button data-action="levels">+1000 levels</button>
            <button data-action="age">Age 10k</button>
            <button data-action="youth">Age 14</button>
        </div>

        <div class="debugWarn">
            Game speed and xp feed challenge scoring, and best scores are permanent.
            Use a throwaway save when testing challenges.
        </div>
    `
    document.body.appendChild(panel)

    const currencies = panel.querySelector("#debugCurrencies")
    for (const currency of DEBUG_CURRENCIES) {
        const row = document.createElement("div")
        row.className = "debugRow"
        row.innerHTML = `<button data-currency="${currency.key}">+</button>
            <span>${currency.label}</span>
            <span class="debugValue" id="debugValue_${currency.key}"></span>`
        currencies.appendChild(row)
    }

    // One delegated listener, so nothing has to be rebound as rows are added.
    panel.addEventListener("click", function (e) {
        const target = e.target
        if (target.tagName !== "BUTTON") return

        if (target.dataset.mult) {
            const value = Number(target.dataset.value)
            if (target.dataset.mult === "xp") debugState.xpMultiplier = value
            else debugState.speedMultiplier = value
        } else if (target.dataset.currency) {
            const currency = DEBUG_CURRENCIES.find(c => c.key === target.dataset.currency)
            const amount = debugReadAmount()
            if (currency && amount > 0) currency.add(amount)
        } else if (target.dataset.action === "unlock") {
            debugUnlockEverything()
        } else if (target.dataset.action === "levels") {
            debugAddTaskLevels(1000)
        } else if (target.dataset.action === "age") {
            debugSetAge(10000)
        } else if (target.dataset.action === "youth") {
            debugSetAge(14)
        }

        renderDebugPanel()
    })

    debugState.built = true
}

function renderDebugPanel() {
    if (!debugState.built || !debugState.open) return

    document.getElementById("debugXpValue").textContent = "x" + format(debugState.xpMultiplier)
    document.getElementById("debugSpeedValue").textContent = "x" + format(debugState.speedMultiplier)

    for (const currency of DEBUG_CURRENCIES) {
        const element = document.getElementById("debugValue_" + currency.key)
        if (element) element.textContent = debugFormat(currency)
    }
}

function toggleDebugPanel() {
    if (!debugState.built) buildDebugPanel()

    debugState.open = !debugState.open
    document.getElementById("debugPanel").hidden = !debugState.open
    renderDebugPanel()
}

window.addEventListener("keydown", function (e) {
    if (e.key !== "`" && e.key !== "~") return

    // Same guards the game's own handler uses: never steal the key from a text field, and leave
    // browser and OS chords alone.
    const typing = e.target != null && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return

    e.preventDefault()
    toggleDebugPanel()
})

// Cheap enough at 2 Hz, and only while the panel is actually open.
setInterval(renderDebugPanel, 500)

console.log("Debug panel loaded - press ` to toggle. Delete js/debug.js and its script tag for release.")

}

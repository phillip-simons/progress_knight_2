# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Progress Knight Quest — an idle/incremental browser game continuing Progress Knight 2.0, with 5 prestige layers. Per the README, "PRs which fix bugs are welcome" — the project is primarily maintained through bugfixes rather than large refactors.

## Running it

There is no build system, package manager, dependency install, or linter. The game is plain ES5/ES6 scripts loaded by `<script>` tags.

```bash
python3 -m http.server 8000       # then open http://localhost:8000
node test/rebirth-oracle.js       # the one automated test; exits non-zero on failure
```

Serve over HTTP rather than opening `index.html` via `file://`: the Changelog tab uses `fetch("./changelog.txt")`, which fails under `file://`.

`test/rebirth-oracle.js` is dependency-free Node. It loads the game sources into a `vm` context with a stubbed DOM, keeps verbatim copies of the five original rebirth functions as an oracle, and diffs final state against the current `doRebirth()` across randomized worlds. Run it after touching `js/rebirth.js`. Note that top-level `const`/`class` declarations land in the context's global *lexical* scope and never become properties of the sandbox object — that is why the harness does its boot work inside the context and re-exports what it needs.

Everything else is tested manually, in the browser. Useful facts when doing so:
- Save lives in `localStorage["gameDataSave"]`; clear it to test a fresh game. Settings > Import/Export moves saves as base64-ish JSON blobs.
- `gameData` and every function are globals, so the devtools console can drive the game directly (`gameData.essence = 1e60; update()`).
- Errors are swallowed into a red banner (`onerror` at the top of `main.js` shows `#errorInfo` for 30s) — check the console, not just the page.

## Architecture

### Load order and boot

`index.html` loads, in order: `utils.js`, `ui.js`, `math.js`, `HackTimer.js`, `classes.js`, `evilperks.js`, `challenges.js`, `dark_matter.js`, `metaverse.js`, `tooltips.js`, `milestones.js`, `data.js`, `rebirth.js`, `main.js`. Nothing is a module — all state and functions are global, and order matters (`data.js` constructs `requirementsBaseData` using classes from `classes.js`, so any new `Requirement` subclass belongs in `classes.js` and any new file must load before `data.js`).

The boot sequence is bare top-level code at the bottom of `main.js` (from the `// Loads the game save...` comment): build game objects from base data → `loadGameData()` → `initializeUI()` → `setCustomEffects()` / `addMultipliers()` → offline progress → start `setInterval` loops. Anything that must run once at startup goes there.

`math.js` is a vendored minified math.js bundle (used only for `math.floor(n, decimals)` in `format`). `HackTimer.js` replaces `setInterval`/`setTimeout` with Web Worker–backed versions so the game keeps ticking in background tabs. Don't hand-edit either.

### State: one global `gameData`

`gameData` (top of `data.js`) is the entire game state and is `JSON.stringify`'d wholesale into localStorage every 3s by `saveloop`. Consequences that drive most of the save/load code in `main.js`:

- **Adding a field to `gameData` is the migration.** `replaceSaveDict(defaults, save)` copies keys missing from the save and deletes keys no longer in defaults. Nested objects need their own `replaceSaveDict` call inside `loadGameData()` — `requirements`, `taskData`, `itemData`, `settings`, `stats`, `challenges`, `dark_matter_shop`, `metaverse`, `perks` each have one. A new nested dict without that call will not backfill for existing players.
- **Class instances lose their prototypes on load.** `assignMethods()` re-wraps every saved task/item/requirement with `Object.assign(new Job(...), plainObject)`, dispatching on `baseData.income` for Job-vs-Skill and on `requirement.type` for the Requirement subclasses. A new `Requirement` subclass must be added to that `if/else` chain and given a `this.type` string in its constructor, or saves silently degrade.
- `baseData` is re-pointed at the current `*BaseData` constants on load, so balance changes apply to existing saves.
- `tempData["requirements"]` holds the pristine pre-load requirement objects (built at boot), used by `assignMethods`/`replaceSaveDict` to restore `elements` and `querySelectors`, which do not survive JSON.

### Game loop and time

`gameloop` runs `update()` at `updateSpeed` (20) Hz. Every per-tick quantity is scaled through `applySpeed(value)` = `value * getGameSpeed() / updateSpeed` (`applySpeedOnBigInt` for BigInt xp, `applyUnpausedSpeed` for things that ignore pause). Never add a raw per-tick increment without going through these.

`getGameSpeed()` returns 0 when paused or dead; `getUnpausedGameSpeed()` composes base speed with Time Warping skills, boosts, milestones, and challenge exponents.

Offline progress (`calc_offline_progress`) fast-forwards by replaying `update(false)` in batches, capped at 1 hour, while `#mainarea` is hidden and `in_offline_progress` is true. It also triggers mid-session if a tick gap exceeds 10s. `update(needUpdateUI)` skips rendering in that mode.

### Content is data-driven

Adding a job, skill, or item means touching several parallel tables — miss one and the row silently never appears:

1. `jobBaseData` / `skillBaseData` / `itemBaseData` in `data.js` (`heroxp`, `heromult`, `heroeffect` are the heroic-tier variants).
2. The matching `jobCategories` / `skillCategories` / `itemCategories` array — order within a category defines progression and drives `getPreviousTaskInCategory`, the "required" rows, and hero unlocking.
3. `requirementsBaseData` in `data.js`, keyed by the same name — a `Requirement` subclass carrying CSS selectors (`getQuerySelector(name)` for task rows) plus threshold data.
4. `tooltips` in `tooltips.js`, keyed by name.
5. New category → `headerRowColors` and `headerRowTextColors` in `data.js`, plus a category-level entry in `requirementsBaseData`.
6. Multipliers in `addMultipliers()` (`main.js`), which wires per-task xp/income multiplier function lists by class and category. Non-linear effects are monkey-patched in `setCustomEffects()`.

Milestones live in `milestoneBaseData` / `milestoneCategories` (`milestones.js`); their requirements are generated by `createMilestoneRequirements()`. Metaverse perks are in `perks_cost` / `perk_names` (`metaverse.js`).

### Requirements = unlocks

A `Requirement` owns the DOM elements it gates (via `querySelectors`) and a list of threshold objects. `isCompleted()` **latches**: once true it stays true until `rebirthReset()` clears it, so it is cheap to call every frame. `isCompletedActual(isHero)` re-evaluates live and is what heroes and re-checks use. `renderRequirements()` toggles `hidden` on the elements each frame.

`permanentUnlocks` and `metaverseUnlocks` (`data.js`) are the keys exempted from that reset.

### Rendering

All DOM rows are cloned at boot from `<template>` elements in `index.html` (`rowTaskTemplate`, `rowItemTemplate`, `rowMilestoneTemplate`, `requiredRowTemplate`, and their header variants) by `createAllRows`. Row ids are `"row" + removeSpaces(removeStrangeCharacters(name))`.

Two conventions stated in `ui.js` and worth keeping:
- Render only from inside `updateUI()`; nothing else writes to the screen.
- `updateUI()` guards each renderer on the active tab (`Tab` enum, `gameData.settings.selectedTab`) so only visible content costs anything at 20 Hz. The sidebar and requirements render unconditionally. `layout == 0` (WIDE) shows jobs/skills/shop together, hence the compound conditions.

`Task.querySelector(selector, row)` memoizes per-task element lookups in `elementsCache` — use it in hot render paths instead of `row.querySelector`.

### Numbers

Values routinely exceed IEEE 754 range. The patterns in use:
- `Task` flips `isFinished = true` once xp/maxXp go past ~1e275 or non-finite, and switches from `this.xp` (number) to `this.xpBigInt` (BigInt), with `getMaxBigIntXp`/`getXpGainBigInt`. BigInt level-ups are iteration-capped (300 vs 2500) for performance. BigInt values are persisted via `bigIntToExponential` and parsed back by `exponentialToRawNumberString`.
- `bigIntSafe()` (`utils.js`) wraps every `BigInt()` conversion of a computed double. `BigInt(Infinity)` and `BigInt(NaN)` throw `RangeError`, and the late-game multipliers feeding the BigInt path do reach `Infinity` — an uncaught throw inside `update()` is a dead game loop. Never call `BigInt()` directly on a computed value.
- `softcap(value, cap, power)` (`utils.js`) is the standard diminishing-returns tool, used heavily in challenge bonuses and milestone effects.
- For quantities that will exceed `1e308`, store `log10` of the value in a field suffixed `_log10` and use `LOG_ZERO` / `logAdd` / `logSoftcap` / `formatLog10` (`utils.js`). A zero balance is the finite `LOG_ZERO` sentinel, not `-Infinity`, because `JSON.stringify` turns `-Infinity` into `null` and `replaceSaveDict` only backfills *absent* keys.
- Evil and essence gains are explicitly clamped to `1e308`; hypercubes to `getHypercubeCap()`.
- Display goes through `format` / `formatWhole` / `formatCoins` / `formatTime` / `formatLevel`, which honor `settings.numberNotation` and `settings.currencyNotation`.

### Prestige layers

The whole cascade lives in `rebirth.js`: a `REBIRTH_LAYERS` table plus one `doRebirth(layer)` driver, with `rebirthOne()` … `rebirthFive()` as thin wrappers (they are bound to `onClick` in `index.html`). Currencies by layer: coins → evil (+ evil perks, `evilperks.js`) → essence (milestones) → dark matter / dark orbs (`dark_matter.js`) → hypercubes / perk points (`metaverse.js`, boosts).

**The phase order in `doRebirth` is the specification, not an implementation detail** — every bug this cascade has had was an ordering bug. Grants must precede clears (`getDarkMatterGain()` reads a challenge bonus that is about to be wiped; `getMetaversePerkPointsGain()` reads essence zeroed one line later), clears must precede `rebirthReset()` (which reads `a_miracle` and the currencies), and revokes must precede its preserve-loop. `maxLevel` is a pipeline *position*, not a table value: `keep` (layer 1) / `recall` before the reset (layer 3) / `zero` after it (layers 2, 4, 5). The header comment in `rebirth.js` records the constraint pinning each phase; read it before reordering anything, and re-run the oracle test after.

`rebirthReset(set_tab_to_jobs)` is the shared teardown: it zeroes coins/days/realtime, resets task levels into `maxLevel`, drops hero flags, and un-latches non-permanent requirements. Challenges (`challenges.js`) reuse it via `enterChallenge`/`exitChallenge` without incrementing rebirth counters; a challenge's stored best value feeds `getChallengeBonus`, and being *inside* a challenge applies penalties scattered through `getIncome`, `getHappiness`, `getUnpausedGameSpeed`, `getLifespan`, and `getMaxLevelMultiplier` (`the_darkest_time` triggers all of them at once).

Heroes are the endgame content-doubling layer: `makeHeroes()` runs every tick once `isHeroesUnlocked()`, converting tasks to `isHero` in category order (requires the previous task in the category to be a hero at level 20+), which swaps in the `hero*` fields from base data.

## Conventions

- 4-space indent in JS, tabs in `index.html`; semicolons mostly omitted; `var`/`const`/`let` mixed — match the surrounding file.
- `w3.css` (vendored W3.CSS) plus `styles.css`; `dark.css`, `colorblind.css`, and `currencies.css` are theme overlays selected by `setTheme(index)` / `setSignDisplay()`.
- On a release, bump both `changelog.txt` (newest entry first, `version X.Y.Z / DD.MM.YYYY`) and the `#version` span in `index.html`.

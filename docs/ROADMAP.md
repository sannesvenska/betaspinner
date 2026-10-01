# Betaspinner – Roadmap

> Work packages (AP) for implementing [game-design.md](game-design.md) with the [design-system.md](design-system.md).
> Size: **S** ≈ < 1 day · **M** ≈ 1–3 days · **L** ≈ 3+ days (rough, focused work).
> Status: ⬜ open · 🟨 in progress · ✅ done

## Milestones

| Milestone                      | Reached after | Meaning                                                                       |
| ------------------------------ | ------------- | ----------------------------------------------------------------------------- |
| **M0 – Ready to build**        | AP0           | Concept + design system final, open questions closed                          |
| **M1 – Playable**              | AP5           | Start wheel → session → rounds with normal cards → goal; autosave, pause      |
| **M2 – Full session cycle**    | AP6           | Win check, final wheel, outcomes, penalties, progression                      |
| **M3 – Feature-complete game** | AP8           | All actions, effects, visual effects                                          |
| **M4 – Gameplay v2**           | AP9           | Game-design Revision 3: release chance, conversions, performers, action cards |
| **M5 – Configurable**          | AP10          | Admin covers every `default` value                                            |
| **M6 – Masks**                 | AP11          | Media Library + Mask Editor                                                   |
| **M6b – Beta variant**         | AP11c         | Switchable beta mode to compare a game variant                                |
| **v1.0**                       | AP12          | Stats, backup, audit, installer                                               |

Order note: win flow (AP6) comes **before** actions (AP7) so a complete session loop is testable early. The pause hotkey ships in AP5 (privacy). Gameplay v2 (AP9) comes **before** the admin (AP10) so the admin is built once against the final rule set.

---

## AP0 – Design finalization · M · ✅

| #   | Task                                                                                                                                                                                       | Status |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| 0.1 | Q&A with product owner, decisions recorded (game-design §24)                                                                                                                               | ✅     |
| 0.2 | Concept moved to `docs/game-design.md` and updated (ring, keyboard, sound, media formats, rules)                                                                                           | ✅     |
| 0.3 | Design system v0.3 (`docs/design-system.md`): tokens, accessibility fixes, layout grid, ring spec, components, motion, sound, screen inventory                                             | ✅     |
| 0.4 | Update core mockup: main screen with console chips, neutral direction buttons, hatched bad segments, action marker shapes, goal icon, ring-center preview (`Game Screen v0.3.html`, local) | ✅     |
| 0.5 | Decided: remaining screens (design-system §9) are designed **in code** in the dev showcase route (AP1.9) instead of static mockups                                                         | ✅     |

**Result:** M0.

## AP1 – Foundation · M · ✅

| #    | Task                                                                                                                                                        | Status |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1.1  | Scaffold: electron-vite 5 + Vite 7 + React 19 + TypeScript 6 strict, pnpm                                                                                   | ✅     |
| 1.2  | Tooling: ESLint flat config (strict type-checked, no `any`, named exports only), Prettier, Vitest, `pnpm check`                                             | ✅     |
| 1.3  | Electron security: `contextIsolation`, `sandbox`, no `nodeIntegration`, CSP, navigation/popup blocking, single-instance lock                                | ✅     |
| 1.4  | Typed IPC contract (`src/shared/ipc.ts`), `Result` wrapper, preload `window.api.invoke` with channel whitelist                                              | ✅     |
| 1.5  | Storage: `createJsonStore` – atomic writes, `schemaVersion`, migrations, corrupt-file quarantine, newer-version guard (tested)                              | ✅     |
| 1.6  | i18n: i18next with typed keys, `en-nsfw` pack, `pnpm check:i18n` (missing/unused keys)                                                                      | ✅     |
| 1.7  | Design tokens → Tailwind v4 `@theme` (default palette removed), local fonts via `@fontsource`                                                               | ✅     |
| 1.8  | Base components: Button, KeyHint, Chip, Stat, GroupCount, Tooltip, Dialog, Drawer, Countdown (+ `useCountdown`), HoldToConfirm, Icon (20 action + UI icons) | ✅     |
| 1.9  | Dev showcase (`import.meta.env.DEV` only)                                                                                                                   | ✅     |
| 1.10 | Window: min 1280×720, fullscreen default (off in dev), F11, neutral fixed title, F12 devtools in dev                                                        | ✅     |

**Notes:** electron-vite 5 caps Vite at 7 and typescript-eslint caps TypeScript below 6.1 – upgrade together later. `config.json` currently holds `AppSettings` only; game rules config joins in AP3/AP10.

## AP2 – Content pipeline · M · ✅

| #   | Task                                                                                                                                                                                                                                               | Status |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 2.1 | `config.json` v2 `{ settings, folders }` with v1 migration; tolerant folder normalization; config service (read-only when the file is from a newer version)                                                                                        | ✅     |
| 2.2 | Scanner in a worker thread (`?nodeWorker`): non-recursive, jpg/jpeg/png/webp/gif/webm/mp4, header parsing (dimensions, animated GIF/WebP/APNG), SHA-1 full (images) / partial (videos), cache by `path + size + mtime`, unreadable images rejected | ✅     |
| 2.3 | `image-index.json` (schema bump = cache rebuild), startup scan, single-flight rescan, progress events                                                                                                                                              | ✅     |
| 2.4 | `bs-media://media/<hash>` protocol: index-only lookup, path containment check, Range/206 for video, `no-store`                                                                                                                                     | ✅     |
| 2.5 | `Media` component: image / looping muted video & GIF, `contain`, broken-media state                                                                                                                                                                | ✅     |
| 2.6 | Library screen (folder list by group/role, status, rename, group/role, enable, remove, paged preview grid), first-run empty state, folder setup dialog, missing-folder / too-few-files / skipped-files states                                      | ✅     |

**Verified:** 33 unit tests; e2e in the running app (videos play and seek via Range, unknown hashes 404, corrupt file skipped, missing folder flagged); rescan of 6,000 cached files < 3 s.

## AP3 – Session generator (pure) · L · ✅

| #   | Task                                                                                                                                                                                                                                                                                                            | Status |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 3.1 | Seeded PRNG (mulberry32) with serializable state + helpers (randInt, shuffle, weighted pick), track geometry                                                                                                                                                                                                    | ✅     |
| 3.2 | Types + defaults: `ActionConfig` catalog (20 actions), `SessionRules`, `Progression`, `Card`, `SessionState`                                                                                                                                                                                                    | ✅     |
| 3.3 | Pipeline §6.1–6.6: start wheel + penalty check, start placement, category selection (cooldown/freshness/relaxation), composition, action slots (gates, blocks, min/max, requires), stratified placement with gap, image bags (no repeats, recency, `allowedActions`, `shareWeight` split), neutral action cards | ✅     |
| 3.4 | Tests per step + 1,000-seed distribution tests (placement spread/gap/protection, Mistress Says No ≈ 5 %, requires never violated, goodChance ratio, no image repeats, determinism)                                                                                                                              | ✅     |

**Result:** `generateSession()` in `src/shared/session/` – 30 tests. Config storage for rules/actions joins with the admin (AP10); until then the defaults are used.

## AP4 – Game engine (pure) · L · ✅

| #   | Task                                                                                                                                                         | Status |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| 4.1 | `reduce(state, event, context)` phase machine with resolution queue; invalid events return an error and the unchanged state                                  | ✅     |
| 4.2 | Movement: exact goal landing, discovered only on landing, revisit re-roll, U Turn blocking, Decision Maker roll choice, End Early                            | ✅     |
| 4.3 | Effects engine (§11): apply/remove/tick, multiplier, pace, direction block, pixel level, splatter, success multiplier, shield                                | ✅     |
| 4.4 | All 20 action resolvers incl. safety zones (Goal Teleport, Moving Day), Switcheroo (content + action pools, X of Y), consumed-card conversion, Guessing Game | ✅     |
| 4.5 | Action hint (`split_by_side` arcs)                                                                                                                           | ✅     |
| 4.6 | Tests: effects, flow, every action, determinism, fuzz test (100 random games: no rejected valid event, invariants hold after every event)                    | ✅     |

**Result:** 95 tests total. Rule clarifications in game-design §11.1.

## AP5 – Core game UI · L · ✅

| #    | Task                                                                                                                                                                  | Status |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 5.1  | Main process owns session + progression (`sessionService`): spin, generate, `reduce`, atomic autosave after every event, close with image recency                     | ✅     |
| 5.2  | Start screen with seeded start wheel (precomputed angle, 4–6 turns, skippable), penalty fields, lockout countdown, "not ready" state                                  | ✅     |
| 5.3  | Initial task, category reveal (reroll: setting is off by default – UI follows with the admin, AP10)                                                                   | ✅     |
| 5.4  | Main layout: console (ring, stats, effect chips, Gallery/Pause/End Early), stage, task bar                                                                            | ✅     |
| 5.5  | Ring: hatched bad segments, action marker shapes, goal flag, targets + path preview, continuous rotation incl. wrap-around, hover/keyboard preview in the ring center | ✅     |
| 5.6  | Dice animation, direction buttons (neutral, per-side hint, U Turn blocked state), movement animation, card reveal fade; all skippable                                 | ✅     |
| 5.7  | Functional UI for every resolution step (task, hold, timed, notice, pick effect, guess, reward, Switcheroo) – visual polish in AP7                                    | ✅     |
| 5.8  | Discovered gallery drawer (`G`)                                                                                                                                       | ✅     |
| 5.9  | Resume dialog on app start, End Early (hold 1.5 s or Ctrl+Backspace), session end screen                                                                              | ✅     |
| 5.10 | Pause / neutral screen + global hotkey `Ctrl+Shift+Space` (media paused, countdowns frozen)                                                                           | ✅     |
| 5.11 | Keyboard map (§7.2), reduced motion / animation speed scale                                                                                                           | ✅     |

**Verified:** 99 tests; e2e in the running app (spin → initial task → reveal → rounds with rolls, directions, Double Trouble; gallery; pause; resume; End Early; close; next session). Found and fixed: dialog default focus pointed at the destructive action (Enter ended the session).

**Deferred:** U Turn dashed arc on the ring (AP7), win check / final wheel (AP6).

## AP6 – Win flow & progression · M · ✅

| #   | Task                                                                                                                                                                 | Status |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 6.1 | Engine win flow: win check roll + chance (§14.1), final wheel decided on start, outcome choice with rewards, Denied neutral                                          | ✅     |
| 6.2 | Final wheel UI: constant spin, Hold Position countdown, deceleration planned to stop exactly on the decided spot (unit tested), pause-aware, labeled + hatched areas | ✅     |
| 6.3 | Outcome screen (I succeeded → reward / Interrupted / No result), Denied screen, end screen with progression preview                                                  | ✅     |
| 6.4 | Progression rules: loss escalation (step × streak, cap 40), rewards, partial removal, good chance clamp, Guessing Game removals, hourly decay with remainder         | ✅     |
| 6.5 | Main: idempotent close (`lastAppliedSessionId`), `history.json`, decay on start + every minute with push to the UI, lockout from penalty rules                       | ✅     |
| 6.6 | Start screen: next decay countdown, next-loss hint                                                                                                                   | ✅     |

**Verified:** 116 tests; e2e in the running app for Denied (neutral, history written) and Allowed → Success → reward (good chance 0.40 → 0.43, streak reset).

## AP7 – Actions & effects UI · L · ✅

| #   | Task                                                                                                                                                                                                                                                | Status |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 7.1 | Action reveal: banner animation (scale 0.96 → 1), icon in a dark circle, one-time red top-border flash for bad actions                                                                                                                              | ✅     |
| 7.2 | Action-specific UI: effect picker tiles with icon + remaining rounds, die faces for Guessing Game (picks + roll result), Switcheroo pool tiles with affected card count and folder previews, shield notice, Mistress Says No card on the end screen | ✅     |
| 7.3 | Ring: dashed U Turn arc + icon on the blocked half, pulsing goal after Goal Teleport; chips animate in; shield chip uses the shield icon                                                                                                            | ✅     |
| 7.4 | Sound cues synthesized with Web Audio (dice, reveal good/bad, last-3-seconds ticks, countdown end, wheel stop) – off by default, silenced by Pause                                                                                                  | ✅     |
| 7.5 | Settings dialog on the start screen: sound on/off + volume, animation speed, reduced motion, start in fullscreen                                                                                                                                    | ✅     |
| 7.6 | Dev-only QA hook `dev:placeAction` (not registered in packaged builds)                                                                                                                                                                              | ✅     |

**Verified:** 116 tests; visual e2e of every action screen in the running app via the QA hook.

## AP8 – Canvas effect renderer · M · ✅

| #   | Task                                                                                                                                                                     | Status |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| 8.1 | Pipeline §12.4: contain-fit, pixelate (6 levels, nearest-neighbour upscale), splatter stamps clipped to the media, deterministic per seed (unit tested)                  | ✅     |
| 8.2 | `EffectMedia`: plain media without effects; canvas for images, videos (per frame) and GIF / animated WebP (`ImageDecoder`); frame-budget fallback to a still; pause-safe | ✅     |
| 8.3 | Generated placeholder splatter textures (`pnpm generate:splatter`), replaceable by dropping files into `assets/splatter/`                                                | ✅     |
| 8.4 | Same pipeline for stage, ring preview and gallery; `unmaskedEffectBehavior: none` respected                                                                              | ✅     |
| 8.5 | Dev showcase "Visual effects" (every level × media kind)                                                                                                                 | ✅     |

**Verified:** 126 tests; showcase and in-game e2e (image static, GIF + video animating with effects, untainted canvas).

**Result:** M3 – feature-complete game.

## AP9 – Gameplay v2 · L · ✅

Implements game-design **Revision 3** (all rules marked **[v2]**, decision log §24.1). Order: data model → generator → engine → UI, so every step stays testable.

| #    | Task                                                                                                                                                                                                                                       | Status |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| 9.1  | Design-system update: session briefing, release-chance stat with breakdown tooltip, undiscovered counter, performer progress (tier markers), collectible marker (star), detour badge, forced-reversal state, stroke tier buttons, 1–3 dice | ✅     |
| 9.2  | Data model + migration: `config.json` v3 (role `action` → disabled `content`, role `performer`, `allowedActions` dropped), `ActionCardDefinition` store with 21 built-ins, session `schemaVersion`; old sessions discarded unscored (§8.3) | ✅     |
| 9.3  | Action-art store: copy picked file into `userData/action-art/`, hash, uniqueness check, `bs-media://` serves the store (§10.4)                                                                                                             | ✅     |
| 9.4  | Generator: initial task = N (§6.1), category count ranges (§6.2), performer selection (§6.2.1), action pool (§6.4), collectibles in composition + placement (§6.3/6.5), action images from definitions, collectible image bag (§6.6)       | ✅     |
| 9.5  | Engine – release chance: pure `getReleaseChance` (discovered × rate + tier bonus, × multiplier, clamp), win check without roll, hold cap 60 s (§14)                                                                                        | ✅     |
| 9.6  | Engine – board changes: detour conversion + cap (§8.4), revisit conversion (§8.5), collectibles (collect, revisit task 10–25, bonus tiers, §9.4), new resolver `redemption` (§10.1)                                                        | ✅     |
| 9.7  | Engine – movement: goal drift on overshoot (§8.8), stroke tier ×1/×2/×3 → 1–3 dice (§8.6), forced reversal (§8.7); new round order (§8.2 v2)                                                                                               | ✅     |
| 9.8  | Switcheroo rework: pools = active categories, action pools removed, collectibles untouched (§10.3)                                                                                                                                         | ✅     |
| 9.9  | Tests: unit per rule, fuzz test with the new events, balancing simulation (1,000 bot games: rounds, final chance, share of bad cards seen, conversions, drifts) to verify the defaults                                                     | ✅     |
| 9.10 | Game UI: session briefing (categories, performer, action pool), console stats, detour badge, forced reversal, stroke tier picker, multi-dice animation, collectible marker + tier notice, goal drift pulse, win check screen without roll  | ✅     |
| 9.11 | Library screen (minimal until AP10): folder role `performer`; action card list with image assign / duplicate / enable                                                                                                                      | ✅     |
| 9.12 | Stats + history fields (§17 v2), i18n keys (`pnpm check:i18n`), game-design: remove the `[v2]` markers and superseded rules once implemented                                                                                               | ✅     |

**Risk:** the defaults (detour conversion 2, rate 0.4 %, tiers, drift range, reversal 10 %) interact – 9.9 decides whether they need tuning before the admin exposes them.

**Verified:** 147 tests (engine rules per mechanic, fuzz test with tiers/drift/reversal, config v2 → v3 migration, action card service, legacy session discard); e2e in the running app with generated media: library action cards tab (image assigned), initial task = N, briefing, stroke tiers + multi-dice, detour badge + conversions, forced reversal, collectibles + tiers, goal drift, final wheel with release chance breakdown. Found and fixed: `allocateByWeight` dropped a card with a remainder of 2 (3 categories → a normal card without folder).

**Balancing (9.9):** simulation with a bot that explores until a target chance, then heads for the goal (`engine/balancingBot.ts`). The first defaults (0.4 % per card, 2 conversions per detour) gave Ø 126 rounds / 40 %; the product target is Ø 80–100 rounds at ≈ 40 %. Parameter grid (100 games each):

| Rate | Conversions | Bot stops at | Ø rounds | Ø final chance |
| ---- | ----------- | ------------ | -------- | -------------- |
| 0.4  | 2           | 25 %         | 121      | 38 %           |
| 0.5  | 1           | 25 %         | 81       | 41 %           |
| 0.5  | 1           | 30 %         | 102      | 47 %           |
| 0.6  | 1           | 25 %         | 72       | 42 %           |

**Decision (product owner, 2026-09-30):** 0.5 % per discovered card, 1 conversion per detour. The balancing test now guards 70–105 rounds and 35–47 %.

**Result:** M4 – Gameplay v2.

## AP10 – Admin · L · ✅

| #    | Task                                                                                                                                                                                                         | Status |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| 10.1 | `config.json` v4: `game` = session rules, penalties, visual effects; `settings.pauseHotkey`. One declarative field schema (`src/shared/config/gameConfig.ts`) drives validation and normalization            | ✅     |
| 10.2 | Main: rules come from the config and are **snapshot into each session** (session schema v3), penalties/decay/lockout from the config, pixelate levels from visual effects, hotkey re-registered live         | ✅     |
| 10.3 | IPC: `config:getGame/updateGame/resetGame` (invalid input rejected, never clamped), `progression:reset`, `session:reroll`, `admin:simulate`; action card edits validated in main                             | ✅     |
| 10.4 | Admin screen with sections: Folders (+ properties: weights, task range, min files, effects without mask), Action cards, Session rules, Performers, Visual effects, Penalties & progression, Sound & controls | ✅     |
| 10.5 | Action cards: per-card editor (weight, min/max, session gate, `requires`, params) + generator simulation (1,000 runs: action cards, pool size, collectibles, performer share, pool share per card)           | ✅     |
| 10.6 | Performers: collectible count, revisit task range, bonus tier editor; Penalties: all values + progression reset (hold to confirm)                                                                            | ✅     |
| 10.7 | Sound & controls: settings form shared with the start screen dialog + pause hotkey capture (modifier required)                                                                                               | ✅     |
| 10.8 | Previously fixed defaults now live: `allowReroll` (briefing reroll, once), `actionHint` modes (off / total / split / per direction), configurable pixelate levels                                            | ✅     |
| 10.9 | Validation + inline errors (bounds, whole numbers, min ≤ max, ascending tiers/levels, action + collectible cards ≤ 45, drift max ≥ drift range); label coverage test for every schema field                  | ✅     |

**Verified:** 166 tests (schema validation/normalization, simulation, config v3 → v4, reroll, progression reset, rules snapshot, card validation, accelerators, label coverage); e2e in the running app: every admin section, invalid value blocked with inline error, saved rule applied to the next session, simulation, card editor, briefing reroll. Found and fixed: the card service threw synchronously instead of rejecting; removing a session gate did not survive a reload (`sessionChance` is now `number | null`, `null` = no gate).

**Result:** M5 – configurable.

## AP11 – Media Library & Mask Editor · L · ✅

| #    | Task                                                                                                                                                                                                | Status |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 11.1 | `src/shared/masks.ts`: types, normalized geometry (hit test, move, corner resize, polygon scaling), lasso simplification (RDP), status rules, tolerant normalization                                | ✅     |
| 11.2 | `masks.json` keyed by hash (main `maskService`): save with derived status, bulk "no regions" (never overwrites regions) / clear, review progress per folder, folder listing with filter             | ✅     |
| 11.3 | Effect pipeline: masked images get pixelate and splatter only inside the regions of each effect, feathered by a blurred alpha mask; unmasked images keep the folder behaviour (game, gallery, ring) | ✅     |
| 11.4 | Admin section "Media library": folder sidebar with review progress, virtualized grid (only visible rows), status badges, filters, click / Ctrl / Shift selection, bulk actions                      | ✅     |
| 11.5 | Mask Editor (native modal): select/move/resize, rectangle, ellipse, polygon, lasso; zoom (wheel, around the cursor) and pan (Space / middle mouse); undo/redo; region effects + feather; delete     | ✅     |
| 11.6 | Editor workflow: ←/→ navigation with autosave, C copy regions from previous, N no regions + next, preview pixelate level 0–5 and splatter through the real renderer, autosave on close              | ✅     |

**Verified:** 180 tests (geometry, RDP, status/normalization, mask service, history, masked card effects); e2e in the running app with patterned test images: bulk "no regions", rectangle + lasso drawn, region moved, undo/redo, preview level 4 pixelates only inside the regions with soft edges, navigation autosaves, progress and badges update. Found and fixed: the six-segment preview control overflowed the side panel; a focused radio button blocked the editor shortcuts.

**Result:** M6 – masks.

## AP11b – Session draft & mask additions · M · ✅

| #     | Task                                                                                                                                                                      | Status |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 11b.1 | Masks: "no regions" = no visual effects; inverted masks (effects outside the regions) in model, pipeline and editor                                                       | ✅     |
| 11b.2 | Add folders: the picker starts next to the most recently added folder                                                                                                     | ✅     |
| 11b.3 | Draft model (`src/shared/draft.ts`): shuffled board, picks, outcome (good share, start pixelate 1/3/5, win factor); config with field schema and validation               | ✅     |
| 11b.4 | Main: pending draft in progression (survives restarts and lockouts), spin only after a complete draft, outcome applied by the generator, reroll keeps it; draft art store | ✅     |
| 11b.5 | Start screen: hidden fields → reveal all → summary → wheel; briefing, console and final wheel show the draft; admin section with square crop editor                       | ✅     |

**Verified:** 190 tests; e2e in the running app: draft image assigned and cropped, 6 picks, full reveal + summary, session started with the drawn good share, start pixelate and win factor; inverted mask preview. Found and fixed: the first good-share formula applied the shifts one after another (average 30 % instead of the agreed 40 %).

## AP11c – Beta mode · M · ✅

| #     | Task                                                                                                                                                       | Status |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 11c.1 | Config: `beta` section (active, visible performer cards, pixelate relief, draft mix, splash share) + `effectiveGameConfig` used by sessions and simulation | ✅     |
| 11c.2 | Draft field type "Splash" (cumulative share of splattered cards at the start); card image slot                                                             | ✅     |
| 11c.3 | Engine: pixelate relief on the first collection; action card Freshen Up (pixelate −1 or clean 30 % of the splatter), beta sessions only                    | ✅     |
| 11c.4 | Ring shows the performer cards before discovery; start screen marks the beta mode; admin section "Beta mode"                                               | ✅     |
| 11c.5 | Session schema v5 (beta fields in rules snapshot and draft outcome), `betaMode` in history                                                                 | ✅     |

**Verified:** 204 tests; e2e in the running app: beta switched on in the admin, untouched draft re-dealt with the beta mix (6 pixelate / 3 splash / 2 bad / 1 win), 4 pixelate picks → start level 5, 5 performer cards visible on the ring, beta marker on the start screen. Found and fixed: an untouched pending draft was only re-dealt when none existed, so admin mix changes (and switching the beta mode) did not reach it.

## AP11d – Library comfort, revisit penalty, final wheel · M · ✅

| #     | Task                                                                                                                                             | Status |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| 11d.1 | Add folders: media count per folder in the setup dialog, warning + skip for folders already in the library, new folder selected                  | ✅     |
| 11d.2 | Media library: move selected files to the recycle bin (index and orphaned masks cleaned up)                                                      | ✅     |
| 11d.3 | Mask editor: invert + preview splatter as top-bar toggles (`I` / `S`); tool, invert start value, previews remembered in settings                 | ✅     |
| 11d.4 | Revisit penalty: a revisited good field costs 0.5 % release chance; console, task bar and final wheel show it; session schema v6                 | ✅     |
| 11d.5 | Final wheel: accelerate → cruise → short random hard brake instead of a long readable deceleration                                               | ✅     |
| 11d.6 | Dev component showcase removed (was AP12.5)                                                                                                      | ✅     |
| 11d.7 | Help screen for players (mechanics, effects, action cards, controls) with values from the active config                                          | ✅     |
| 11d.8 | Beta mode becomes the only mode (defaults, config v6 migration, admin section and flags removed); balancing bot aims for visible performer cards | ✅     |
| 11d.9 | Action cards never get pixelate or splatter (renderer and splatter targets)                                                                      | ✅     |

## AP13 – Content packages · L · ✅

| #    | Task                                                                                                                       | Status |
| ---- | -------------------------------------------------------------------------------------------------------------------------- | ------ |
| 13.1 | Model: config v7 (settings + library), `package.json` per package, generic config service, per-package state in `userData` | ✅     |
| 13.2 | Package context (library, action cards, draft art, sessions) swapped on activation; IPC routes through the active package  | ✅     |
| 13.3 | Folder import copies into the package (hash dedupe, progress); removing a folder trashes its copy; masks always kept       | ✅     |
| 13.4 | Setup screen: library folder once; old content copied into "Default" (folder ids, progression, session, history kept)      | ✅     |
| 13.5 | Management: create, rename, duplicate, delete, activate, move library; start screen + settings show the active package     | ✅     |
| 13.6 | ZIP export / import (`yazl` / `yauzl`) with masks, replace or copy, zip-slip and foreign-path protection                   | ✅     |
| 13.7 | Performer bonus tiers 2/3/4 (config v7 lowers stored 3/4/5)                                                                | ✅     |

**Verified:** 219 tests; e2e in the running app: old config → setup → 7 folders / 210 files copied into "Default", new package, ZIP export, import as copy (conflict dialog), switch to another package (reload with its content). Balancing with tiers 2/3/4: Ø 83 rounds, Ø 39 % release chance.

## AP12 – Stats, backup, polish, release · M · ⬜

1. Session stats collection + History screen (sortable table, summary).
2. Session summary screen.
3. Backup export/import of the app-wide data (settings, masks, per-package progress) – content is already exchangeable as package ZIP (AP13).
4. Accessibility audit (keyboard, focus, contrast, reduced motion), performance audit (6,000 files).
5. ~~Remove the dev component showcase~~ – done in AP11d.6.
6. E2E driver: capture the Playwright walkthrough used for AP9 as a project script (clear `ELECTRON_RUN_AS_NODE` when launched from VS Code).
7. electron-builder installer (NSIS) + portable build; app icon.

**Result:** v1.0.

## Later (parking lot)

- Pace metronome · Admin PIN · additional language packs.
- Category zones on the ring · session composition by draft or deck presets.

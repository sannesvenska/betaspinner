# Chance Runner – Roadmap

> Work packages (AP) for implementing [game-design.md](game-design.md) with the [design-system.md](design-system.md).
> Size: **S** ≈ < 1 day · **M** ≈ 1–3 days · **L** ≈ 3+ days (rough, focused work).
> Status: ⬜ open · 🟨 in progress · ✅ done

## Milestones

| Milestone                      | Reached after | Meaning                                                                  |
| ------------------------------ | ------------- | ------------------------------------------------------------------------ |
| **M0 – Ready to build**        | AP0           | Concept + design system final, open questions closed                     |
| **M1 – Playable**              | AP5           | Start wheel → session → rounds with normal cards → goal; autosave, pause |
| **M2 – Full session cycle**    | AP6           | Win check, final wheel, outcomes, penalties, progression                 |
| **M3 – Feature-complete game** | AP8           | All actions, effects, visual effects                                     |
| **M4 – Configurable**          | AP9           | Admin covers every `default` value                                       |
| **M5 – Masks**                 | AP10          | Media Library + Mask Editor                                              |
| **v1.0**                       | AP11          | Stats, backup, audit, installer                                          |

Order note: win flow (AP6) comes **before** actions (AP7) so a complete session loop is testable early. The pause hotkey ships in AP5 (privacy).

---

## AP0 – Design finalization · M · ✅

| #   | Task                                                                                                                                                                                                     | Status |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 0.1 | Q&A with product owner, decisions recorded (game-design §24)                                                                                                                                             | ✅     |
| 0.2 | Concept moved to `docs/game-design.md` and updated (ring, keyboard, sound, media formats, rules)                                                                                                         | ✅     |
| 0.3 | Design system v0.3 (`docs/design-system.md`): tokens, accessibility fixes, layout grid, ring spec, components, motion, sound, screen inventory                                                           | ✅     |
| 0.4 | Update core mockup: main screen with console chips, neutral direction buttons, hatched bad segments, action marker shapes, goal icon, ring-center preview (`Chance Runner Game Screen v0.3.html`, local) | ✅     |
| 0.5 | Decided: remaining screens (design-system §9) are designed **in code** in the dev showcase route (AP1.9) instead of static mockups                                                                       | ✅     |

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

**Notes:** electron-vite 5 caps Vite at 7 and typescript-eslint caps TypeScript below 6.1 – upgrade together later. `config.json` currently holds `AppSettings` only; game rules config joins in AP3/AP9.

## AP2 – Content pipeline · M · ✅

| #   | Task                                                                                                                                                                                                                                               | Status |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 2.1 | `config.json` v2 `{ settings, folders }` with v1 migration; tolerant folder normalization; config service (read-only when the file is from a newer version)                                                                                        | ✅     |
| 2.2 | Scanner in a worker thread (`?nodeWorker`): non-recursive, jpg/jpeg/png/webp/gif/webm/mp4, header parsing (dimensions, animated GIF/WebP/APNG), SHA-1 full (images) / partial (videos), cache by `path + size + mtime`, unreadable images rejected | ✅     |
| 2.3 | `image-index.json` (schema bump = cache rebuild), startup scan, single-flight rescan, progress events                                                                                                                                              | ✅     |
| 2.4 | `cr-media://media/<hash>` protocol: index-only lookup, path containment check, Range/206 for video, `no-store`                                                                                                                                     | ✅     |
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

**Result:** `generateSession()` in `src/shared/session/` – 30 tests. Config storage for rules/actions joins with the admin (AP9); until then the defaults are used.

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
| 5.3  | Initial task, category reveal (reroll: setting is off by default – UI follows with the admin, AP9)                                                                    | ✅     |
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

## AP7 – Actions & effects UI · L · ⬜

1. Action banner + action-specific UIs for all 20 actions (pickers, timers, number choice, Switcheroo 2-step, teleport/moving animations).
2. Effect chips with tooltips; shield indicator; U Turn on ring + button.
3. Neutral action card design.
4. Sound cues (optional, off by default) + settings.

**Result:** all actions playable.

## AP8 – Canvas effect renderer · M · ⬜

1. Pipeline §12.4: pixelate levels, splatter overlays with per-card seed, cache.
2. Animated media through canvas (frame loop) with fallback to static frame.
3. Generated placeholder splatter textures (replaceable files).
4. Thumbnails/previews through the same pipeline.

**Result:** M3 – feature-complete game.

## AP9 – Admin · L · ⬜

1. Folders (full properties, weights, task ranges, allowed actions).
2. Actions (enabled, weights, min/max, sessionChance, requires, params) + generator simulation (1,000 runs) with distribution preview.
3. Session Rules, Visual Effects, Penalties & Progression (+ reset), Sound & Controls (hotkey, animation speed, reduced motion).
4. Validation + inline errors.

**Result:** M4 – configurable.

## AP10 – Media Library & Mask Editor · L · ⬜

1. Library: folder sidebar with review progress, virtualized grid, status badges, filters, bulk actions.
2. Mask editor: rect/ellipse/polygon/lasso (RDP), select/move/resize, zoom/pan, undo/redo, shortcuts, copy-from-previous, preview slider through the real renderer, autosave.
3. `masks.json` keyed by hash, normalized coordinates.

**Result:** M5 – masks.

## AP11 – Stats, backup, polish, release · M · ⬜

1. Session stats collection + History screen (sortable table, summary).
2. Session summary screen.
3. Backup export/import (ZIP, path remapping).
4. Accessibility audit (keyboard, focus, contrast, reduced motion), performance audit (6,000 files).
5. electron-builder installer (NSIS) + portable build; app icon.

**Result:** v1.0.

## Later (parking lot)

- Pace metronome · Admin PIN · additional language packs.

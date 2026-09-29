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

## AP3 – Session generator (pure) · L · ⬜

1. Seeded PRNG (mulberry32) with serializable state.
2. `generateSession` pipeline §6.1–6.6 incl. initial task range, start jitter, category selection with cooldown/freshness, card composition, action slots (gates, min/max, requires), stratified placement, image assignment (shuffle bags, recency).
3. Unit tests per step + distribution tests over 1,000 seeds.

**Result:** deterministic generator, fully tested.

## AP4 – Game engine (pure) · L · ⬜

1. Session state machine: `reduce(state, event) → state` for all phases (§8, §20).
2. Movement rules: exact goal landing, discovered only on landing, revisit re-roll.
3. Effects engine §11: apply/remove/tick, multipliers, pace, direction block, shield (not vs. `mistress_says_no`).
4. Action resolvers for all 20 actions incl. safety zones, Switcheroo, consumed-card conversion.
5. Action hint calculation (`split_by_side` arcs).
6. Unit tests for every rule and action.

**Result:** complete game logic without UI.

## AP5 – Core game UI · L · ⬜

1. Start screen: start wheel (seeded, choreographed), penalty fields, lockout countdown, History/Admin links.
2. Initial task, category reveal (+ reroll).
3. Main layout: console, ring (SVG, all states from design-system §5), stats, stage, task bar.
4. Dice, direction buttons (neutral + per-side hint), movement animation, card reveal, normal cards.
5. Ring hover preview + discovered gallery drawer.
6. Autosave after every state change, resume dialog.
7. **Pause / neutral screen** + global hotkey (main process `globalShortcut`), stops media/sound/countdowns.
8. Keyboard control map (§7.2), focus management, reduced motion.
9. End Early (hold-to-confirm) → loss.

**Result:** M1 – playable.

## AP6 – Win flow & progression · M · ⬜

1. Win check screen (discovered, roll, chance calc).
2. Final wheel with Hold Position choreography.
3. Outcomes + reward choice; Denied neutral.
4. Penalty escalation, decay (lazy + every minute), lockout.
5. `progression.json` updates; history entry.

**Result:** M2 – full session cycle.

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

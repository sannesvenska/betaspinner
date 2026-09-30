# Chance Runner – Design System "Darkroom" v0.3

> Visual source of truth for the renderer. Game rules: [game-design.md](game-design.md).
> v0.3 = v0.2 mockups (local, not versioned) + accessibility fixes + Q&A decisions of 2026-09-29.

---

## 1. Principles

| Principle                  | Rule                                                                                                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Image first**            | Media is never cropped (`contain`) and never covered by permanent chrome. The console lives in the left panel; text over the stage only in the task bar. Flat warm blacks, no gradients or glows. |
| **One decision at a time** | Each phase shows exactly one primary (filled ink) button. Exception: direction choice – both directions are equal outline buttons (neutral, no recommendation).                                   |
| **Never color-only**       | Good/bad is always encoded twice: color **plus** pattern, shape, icon or label. Must still work in deuteranopia (amber and red collapse to olive tones).                                          |
| **Overlay, not on-image**  | Canvas effects (pixelate, splatter) never touch UI.                                                                                                                                               |
| **Keyboard-complete**      | Every control has a key; the key hint is printed on the control. Visible focus ring everywhere.                                                                                                   |
| **Privacy beats polish**   | Pause is instant (0 ms), silences sound and stops playback.                                                                                                                                       |

---

## 2. Color Tokens

Defined once as CSS variables and exposed to Tailwind v4 via `@theme`. Components use token names only – never raw hex.

### 2.1 Primitives → semantic tokens

| Token         | Value                                        | Use                                                                  | Contrast vs `panel` |
| ------------- | -------------------------------------------- | -------------------------------------------------------------------- | ------------------- |
| `bg`          | `#0C0B0A`                                    | Window background                                                    | –                   |
| `panel`       | `#100E0C`                                    | Left console                                                         | –                   |
| `surface`     | `#1A1714`                                    | Chips, tiles, cards                                                  | –                   |
| `stage`       | `#171411`                                    | Media letterbox / placeholder                                        | –                   |
| `line`        | `rgba(236,230,219,.08)`                      | 1px dividers                                                         | –                   |
| `line-strong` | `rgba(236,230,219,.25)`                      | Outline buttons                                                      | –                   |
| `ink`         | `#ECE6DB`                                    | Primary text, primary button, current field, goal marker             | 15.5:1              |
| `ink-2`       | `#B5AC9F`                                    | Secondary text                                                       | 8.6:1               |
| `ink-muted`   | `#8E857A`                                    | Labels, meta, disabled, path preview outline                         | 5.3:1               |
| `good`        | `#E3A64A`                                    | Good group                                                           | 9.0:1               |
| `bad`         | `#E0442F`                                    | Bad group                                                            | 4.6:1               |
| `penalty`     | → `bad`                                      | Penalty fields on the start wheel (own name so it can diverge later) | 4.6:1               |
| `danger`      | → `bad`                                      | Destructive controls (End Early hold progress)                       | 4.6:1               |
| `ring-empty`  | `#3A332D`                                    | Undiscovered segment                                                 | 1.55:1 ¹            |
| `overlay`     | `rgba(12,11,10,.86)` + `backdrop-blur(24px)` | Task bar, drawers                                                    | –                   |
| `focus`       | `ink`                                        | 2px focus ring, 2px offset                                           | 15.5:1              |

¹ _Changed from `#2A2521` (1.27:1)._ Undiscovered segments carry no information, so they stay quiet; everything that **does** carry meaning on the ring (current field, goal, targets, path preview, discovered segments) is ≥ 3:1.

### 2.2 Removed / changed from v0.2

- `ring-path` fill (`#4A4038`, 1.9:1) → path preview is now a **2px `ink-muted` outline** on the segments in range.
- Discovered segments no longer use 55 % opacity (made amber and red indistinguishable). Full color + pattern instead (§5).

---

## 3. Typography

All fonts bundled locally (`@fontsource/barlow-condensed`, `@fontsource/barlow`, `@fontsource/jetbrains-mono`). No CDN.

| Role         | Font                                                    | Size (at 1920×1080) | Notes                               |
| ------------ | ------------------------------------------------------- | ------------------- | ----------------------------------- |
| `display-xl` | Barlow Condensed 700                                    | 132–168 / 0.85      | Field number, die result, countdown |
| `display`    | Barlow Condensed 700, uppercase                         | 64–96 / 0.9         | Task, action name, screen titles    |
| `stat`       | Barlow Condensed 600                                    | 40–64               | Console stats                       |
| `button`     | Barlow Condensed 600–700, uppercase, tracking .06–.12em | 18–32               | Buttons, chips                      |
| `body`       | Barlow 400                                              | 16–19 / 1.5         | Instructions, descriptions          |
| `label`      | JetBrains Mono, uppercase, tracking .16–.2em            | 12–14               | Eyebrows, counters, key hints       |

Fluid sizing: display sizes use `clamp()` against viewport height so 1280×720 stays readable (min `label` 12px, min `body` 16px).

---

## 4. Layout

### 4.1 Main game screen (grid, not absolute positions)

```
┌──────────── console ────────────┬──────────────── stage ────────────────┐
│ CHANCE RUNNER                   │                                        │
│         ┌──── ring ────┐        │                                        │
│         │  FIELD 37    │        │            media (contain)             │
│         │ ← 53 · 47 →  │        │                                        │
│         └──────────────┘        │                                        │
│ ROUND  DISCOVERED               │                                        │
│ ACTIONS LEFT  MULTIPLIER        ├──────────────── task bar ──────────────┤
│ [effect chips…]                 │ GOOD · CATEGORY                        │
│ [Gallery G] [Pause] [End Early] │ STROKE ×28                    [ DONE ] │
└─────────────────────────────────┴────────────────────────────────────────┘
```

| Element       | Rule                                                                                                             |
| ------------- | ---------------------------------------------------------------------------------------------------------------- |
| Console width | `clamp(400px, 31vw, 600px)`                                                                                      |
| Ring          | SVG with `viewBox`, fills console width minus gutters; square                                                    |
| Stage         | Remaining width, full height above the task bar (effect chips moved to the console → +68px image height vs v0.2) |
| Task bar      | `clamp(136px, 16vh, 176px)` high, `overlay` token                                                                |
| Frame gutter  | `clamp(24px, 2.5vw, 48px)`                                                                                       |
| Window        | Min 1280×720, fullscreen by default, F11 toggles                                                                 |
| Supported     | 1280×720 → 2560×1440 at Windows scaling 100/125/150 %                                                            |

### 4.2 Spacing scale

`4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96` (px). Tokens `space-1` … `space-9`.

### 4.3 Radius & elevation

- Radius **2px** everywhere. Circles only for spin hub, ring, dice face and action markers.
- No shadows in flow. Depth = surface steps (`bg → panel → surface`) + 1px lines.
- Dialogs/drawers only: `0 24px 80px rgba(0,0,0,.6)` + scrim `rgba(0,0,0,.6)`.

### 4.4 Hit targets

Min 44×44px for any control; primary buttons 72px high, direction buttons 112px, console buttons 52px.

---

## 5. Ring

| State                      | Rendering                                                                                |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| Undiscovered               | `ring-empty` fill                                                                        |
| Discovered good            | `good` fill                                                                              |
| Discovered bad             | `bad` fill **+ diagonal hatch** (2px `panel` lines at 45°, 5px pitch)                    |
| Current field              | `ink` fill, raised +14px outward                                                         |
| Target fields (after roll) | raised +8px, 2px `ink` outline, field number label outside                               |
| Path preview               | 2px `ink-muted` outline on segments between position and targets                         |
| Goal field                 | `bg` fill, 2px `ink` outline, **goal icon** (flag) outside the ring                      |
| Discovered action          | marker inside the ring: **circle = good**, **diamond = bad**, in group color             |
| Blocked direction (U Turn) | half-ring on the blocked side gets a dashed `bad` inner arc + U Turn icon at the arc end |

Ring center: phase-dependent – `FIELD n` + distances `← 53 · 47 →`, or `ROLLED n`, or a countdown.

**Hover / focus on a discovered segment:** the **ring center** temporarily shows a 200×200 preview (media thumbnail with current effects, `contain` on `stage`), `FIELD n · ▼ BAD` label, action icon if any, and the distance from the current field (`← 4 FROM HERE`). Leaving the segment restores the phase content. No floating tooltip – it would cover the ring. Segments are focusable in a roving tab-index group (`←`/`→` moves focus when the ring has focus). Disabled while a phase needs `←`/`→` for direction choice unless the ring itself has focus.

Reference mockup: `Chance Runner Game Screen v0.3.html` (local mockup folder) – screens 01–03 + ring legend.

---

## 6. Components

| Component               | Spec                                                                                                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Button – primary**    | `ink` bg, `bg` text, 72px, key hint label right-aligned (`SPACE`)                                                                                                                                 |
| **Button – outline**    | 1px `line-strong`, `ink` text                                                                                                                                                                     |
| **Button – text**       | `ink-muted`, no border                                                                                                                                                                            |
| **Key hint**            | `label` font 11px in a 1px `line-strong` box. Long combos (Pause hotkey) are shown in the tooltip only, not on the button                                                                         |
| **Direction button**    | Outline, 112px, content: arrow icon + `LEFT · FIELD 33`, second line `GOAL 53 · ▲2 ▼5` (label font); key hint `←`/`→`. Both identical in style. Blocked: disabled + U Turn icon + "BLOCKED 2 RD." |
| **Hold-to-confirm**     | Text button; while held a 2px `danger` bar fills left→right over 1.5 s; release cancels. Used for End Early                                                                                       |
| **Effect chip**         | 40px, `surface`, 3px left bar in group color, icon 16px, name, remaining (`3 RD.`, `LV 2`). Tooltip on hover/focus with description                                                               |
| **Stat**                | `label` + `stat`; group counts always as `▲4 good · ▼8 bad` icons + color                                                                                                                         |
| **Picker tile**         | 188×112, `surface`, 3px group bar; selected = 2px `good` outline + check icon; number key hint top-right                                                                                          |
| **Countdown**           | `display-xl`, 1 s ticks without tween; last 3 s in `bad` + optional tick sound; progress bar 6px                                                                                                  |
| **Dialog / drawer**     | `overlay` + scrim, focus trapped, `Esc` closes                                                                                                                                                    |
| **Gallery drawer**      | Right-side drawer over the stage, 4-column virtualized thumbnail grid, field number + group bar + action icon                                                                                     |
| **Neutral action card** | Stage placeholder: action icon 160px in group color on `surface` with a subtle diagonal pattern                                                                                                   |
| **Toast / result line** | In task bar only, never floating over media                                                                                                                                                       |

### Action icons

24×24 grid, 1.5px stroke (1.8 at 16px), round caps/joins, no fills, colored by group. Paths from the v0.2 icon sheet are kept (20 icons) – they will live in `src/renderer/ui/icons/actionIcons.ts`. New icons needed: `goal` (flag), `shield`, `gallery`, `sound-on/off`.

---

## 7. Motion

Framer Motion. Every animation is skippable (`Space`/click → end state), every result is decided before the animation starts. `animationSpeed` multiplies all durations. With `prefers-reduced-motion` or the `reducedMotion` setting, all movement becomes a 150 ms crossfade and wheels/dice jump to their result.

| Element       | Duration                   | Easing                        | Choreography                                                                                                               |
| ------------- | -------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Dice roll     | 900 ms                     | `cubic-bezier(.2,.8,.2,1)`    | Ring center cycles 10–12 numbers, decelerating, lands with scale 1.06 → 1 (160 ms). Direction buttons fade in 150 ms after |
| Marker move   | 120 ms / field             | linear per step               | Ring rotates one segment per step; passed segments flash `ink-muted` outline, stay undiscovered                            |
| Card reveal   | 420 ms                     | easeInOut                     | Landed segment fills; media crossfades in (240 ms); task bar slides up 8px + fades (200 ms, 80 ms delay)                   |
| Start wheel   | 4.5–6 s                    | `cubic-bezier(.12,.72,.18,1)` | Precomputed target angle + 4–6 turns. Penalty landing: segment pulses once, then lockout countdown replaces the hub        |
| Final wheel   | = discovered s             | custom decel to t = 0         | Constant spin until Hold Position, then decelerates to stop exactly at 0                                                   |
| Countdown     | 1 s ticks                  | none                          | Number swaps, last 3 s `bad`                                                                                               |
| Effect chip   | 200 ms                     | easeOut                       | Enter fade + y 6 → 0; counter crossfade; exit 160 ms, siblings reflow (layout animation)                                   |
| Action reveal | 320 ms                     | easeOut                       | Banner scales 0.96 → 1; bad actions: single 1px `bad` flash on the task bar top border                                     |
| Drawer        | 220 ms enter / 160 ms exit | easeOut / easeIn              | Slide from right 24px + fade                                                                                               |
| Pause         | 0 ms                       | –                             | Instant both ways                                                                                                          |

---

## 8. Sound (optional, off by default)

| Cue                          | When                                 |
| ---------------------------- | ------------------------------------ |
| `dice`                       | Die lands                            |
| `reveal-good` / `reveal-bad` | Card reveal                          |
| `tick`                       | Each of the last 3 countdown seconds |
| `countdown-end`              | Countdown reaches 0                  |
| `wheel-stop`                 | Start/final wheel stops              |

Short (< 400 ms), synthesized with Web Audio (no files, offline) – `src/renderer/src/sound/sound.ts`. Can be swapped for bundled samples without changing callers. One master volume (Low / Medium / High).

---

## 9. Screen Inventory

✅ = mocked in v0.2 (needs v0.3 update) · ⬜ = still to design

| Screen / state                                                                                                                                                                               | Status                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Start wheel (penalty fields)                                                                                                                                                                 | ✅                                   |
| Lockout countdown                                                                                                                                                                            | ⬜                                   |
| Initial task                                                                                                                                                                                 | ⬜                                   |
| Category reveal (+ reroll)                                                                                                                                                                   | ⬜                                   |
| Resume session dialog                                                                                                                                                                        | ⬜                                   |
| Main: normal card + task                                                                                                                                                                     | ✅                                   |
| Main: roll phase                                                                                                                                                                             | ⬜                                   |
| Main: choose direction                                                                                                                                                                       | ✅ (make neutral, add per-side hint) |
| Main: moving                                                                                                                                                                                 | ⬜                                   |
| Main: bad action – Edge & Hold                                                                                                                                                               | ✅                                   |
| Main: good action – Good Fairy picker                                                                                                                                                        | ✅                                   |
| Actions: Decision Maker, Guessing Game, Switcheroo (2 steps), Highperformer, Squeeze, Goal Teleport, Moving Day, U Turn, Clearing Edges, Hail Mary, Bad Luck, Mistress Says No, shield block | ⬜                                   |
| Neutral action card                                                                                                                                                                          | ⬜                                   |
| Discovered gallery drawer + ring hover preview                                                                                                                                               | ⬜                                   |
| End Early (hold-to-confirm)                                                                                                                                                                  | ⬜                                   |
| Win check (discovered, roll)                                                                                                                                                                 | ⬜                                   |
| Final wheel                                                                                                                                                                                  | ✅                                   |
| Outcome + reward choice                                                                                                                                                                      | ⬜                                   |
| Session summary                                                                                                                                                                              | ⬜                                   |
| Pause / neutral                                                                                                                                                                              | ✅                                   |
| Empty state + first-run wizard                                                                                                                                                               | ⬜                                   |
| Error states (missing folder, media failed)                                                                                                                                                  | ⬜                                   |
| Admin: Folders, Actions (+ simulation), Session Rules, Visual Effects, Penalties, Sound/Controls, Backup                                                                                     | ⬜                                   |
| History                                                                                                                                                                                      | ⬜                                   |
| Media Library + Mask Editor                                                                                                                                                                  | ⬜ (own milestone)                   |

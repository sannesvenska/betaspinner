# Chance Runner – Game Design Document

> **Purpose of this document:** Single source of truth for implementing Chance Runner with Claude Code.
> Sections marked **[RULE]** are binding implementation rules. Values marked `default` are configurable in the admin area.
> All user-facing text is referenced via i18n keys; names used here (e.g. action names) are **internal IDs**, not display labels.
> Visual rules live in [design-system.md](design-system.md); work packages in [ROADMAP.md](ROADMAP.md).
> **Revision 2 (2026-09-29):** Q&A decisions merged – see §24.
> **Revision 3 (2026-09-30) – Gameplay v2:** implemented in ROADMAP AP9. Rules marked **[v2]** override the older text of the same section (kept until the balancing is confirmed, AP9.12). Decision log: §24.1, implementation notes: §24.2.

---

## 1. Overview

Chance Runner is a local Windows 11 Electron application that runs a 100-field, chance-based board game centered on displaying images. The app uses local image folders grouped into categories, a card generation system with weighted categories and action cards, stackable effects, a penalty/progression system across sessions, and persistent session state. All text labels are managed via a translation system so that wording sets can be swapped without code changes.

The app works fully offline. No network calls are made.

---

## 2. Tech Stack

| Area                       | Choice                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------ |
| Shell                      | Electron (main + preload + renderer)                                                 |
| Build                      | electron-vite, packaged with electron-builder                                        |
| Package manager            | pnpm                                                                                 |
| UI                         | React 19 + TypeScript (strict)                                                       |
| State                      | Zustand (separate stores: `config`, `session`, `progression`, `ui`)                  |
| Styling                    | Tailwind CSS v4 (design tokens as CSS variables via `@theme`)                        |
| Fonts                      | Bundled locally via `@fontsource/*` (no CDN – offline rule)                          |
| Animation                  | Framer Motion                                                                        |
| Rendering of image effects | HTML Canvas (2D context)                                                             |
| i18n                       | i18next with JSON resource files                                                     |
| Persistence                | JSON files in the user data directory, read/written only by the main process via IPC |
| Testing                    | Vitest for all pure game logic (generator, effects engine, RNG, penalty math)        |

---

## 3. Glossary

| Term                       | Meaning                                                                                                                 |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Field**                  | One of the 100 positions on the circular track (numbered 1–100, wraps 100 → 1). Displayed as a segment of the **ring**. |
| **Discovered**             | A field the player has **landed on** (or the start field). Fields passed over during movement stay undiscovered.        |
| **Card**                   | The content placed on a field: an image plus either a task (normal card) or an action (action card).                    |
| **Goal Field**             | The field the player must land on to trigger the win check. Has no image task.                                          |
| **Category**               | A content folder of images, belonging to the `good` or `bad` group.                                                     |
| **Action Folder**          | _(removed in v2)_ A folder tagged as action source. Replaced by **action card definitions** with their own image.       |
| **Action Card Definition** | **[v2]** A uniquely defined action card: resolver type + name + params + weights + one unique image (§10.4).            |
| **Action Pool**            | **[v2]** The subset of action card definitions that can appear in one session (§6.4).                                   |
| **Performer**              | **[v2]** A gallery folder of one performer. One per session; its images are placed as **collectible** cards (§9.4).     |
| **Detour**                 | **[v2]** A move that increases the shortest distance to the Goal Field; converts bad cards to good (§8.4).              |
| **Release Chance**         | **[v2]** The live win-check chance shown in the console; replaces the win-check die roll (§14.1).                       |
| **Round**                  | One complete move: roll → choose direction → move → resolve landed card. Effect durations count in rounds.              |
| **Effect**                 | A temporary or session-long modifier (e.g. Double Trouble, Pixelate).                                                   |
| **Task**                   | A physical instruction with a count or duration that the player confirms with a button.                                 |
| **Penalty Field**          | A red segment on the start wheel that blocks starting a session for a time.                                             |
| **Progression**            | Persistent values carried between sessions (good chance, penalty fields, blocked effects, loss streak).                 |

---

## 4. Core Loop (Summary)

1. Open app → penalty decay is applied → start wheel shows current penalty fields.
2. Spin start wheel → Goal Field value N (or penalty lockout if a red field is hit).
3. Perform the initial task (**[v2]** count = N, §6.1) → confirm.
4. Session is generated (categories, performer, action pool, cards, start position) → session briefing.
5. Repeat rounds until the Goal Field is reached or the session ends (End Early / Mistress Says No). **[v2]** The player watches the live release chance and decides when to head for the goal.
6. Win check → final wheel → outcome → progression update → stats saved.

---

## 5. Content Model: Folders and Categories

### 5.1 Folder Types

Every registered folder has exactly one **group** and one **role**:

| Group  | Role      | Used for                                  |
| ------ | --------- | ----------------------------------------- |
| `good` | `content` | Normal cards with favorable/reward images |
| `bad`  | `content` | Normal cards with challenging images      |
| `good` | `action`  | Visuals for good action cards             |
| `bad`  | `action`  | Visuals for bad action cards              |

**[RULE]** Content folders and action folders are separate pools. A content folder never produces action cards and an action folder never produces normal cards. This makes the action card count fully controllable and independent of which categories are picked.

**[v2] Folder roles change:**

| Group    | Role        | Used for                                                             |
| -------- | ----------- | -------------------------------------------------------------------- |
| `good`   | `content`   | Normal cards with favorable/reward images                            |
| `bad`    | `content`   | Normal cards with challenging images                                 |
| – (none) | `performer` | Gallery of one performer; source of collectible cards (§6.2.1, §9.4) |

- The `action` role is **removed**. Action visuals come from action card definitions (§10.4). Migration: existing action folders are converted to disabled `content` folders of their group (the user can remove them); `allowedActions` is dropped.
- Performer folders have no group. `selectionWeight`, `taskRange`, `minImages` and `unmaskedEffectBehavior` apply; `shareWeight` does not.

### 5.2 Folder Properties

| Property                 | Type                  | Default     | Description                                                                                                                            |
| ------------------------ | --------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                     | string                | generated   | Stable ID (UUID).                                                                                                                      |
| `path`                   | string                | –           | Absolute path on disk.                                                                                                                 |
| `displayName`            | string                | folder name | Shown in admin and on the category reveal screen.                                                                                      |
| `group`                  | `good` \| `bad`       | –           |                                                                                                                                        |
| `role`                   | `content` \| `action` | `content`   |                                                                                                                                        |
| `enabled`                | boolean               | true        | Disabled folders are ignored entirely.                                                                                                 |
| `selectionWeight`        | number (1–100)        | 50          | How likely this category is picked for a session (content only).                                                                       |
| `shareWeight`            | number (1–100)        | 50          | Image share among the selected categories of the same group (only relevant if more than one category per group is picked).             |
| `taskRange`              | [min, max]            | [6, 18]     | Task count range for normal cards from this folder.                                                                                    |
| `allowedActions`         | ActionId[] \| null    | null        | Action folders only: restrict which actions may use this folder's images. `null` = any action of the matching group. **[v2] removed.** |
| `unmaskedEffectBehavior` | `full` \| `none`      | `full`      | How visual effects apply to images without a defined mask (see §12).                                                                   |
| `minImages`              | number                | 5           | Folder is only eligible for selection if it contains at least this many images.                                                        |

> **Change vs. original concept:** the single "weight" property was ambiguous (it meant both "how often is this folder picked" and "how many images does it contribute"). It is split into `selectionWeight` and `shareWeight`.

### 5.3 Image Index

On startup and on demand ("Rescan"), the main process scans all folders and builds an image index:

- Supported formats: images `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`; videos `.webm`, `.mp4`. "Image" in this document means any supported media file.
- **[RULE] Animated media:** GIF, WebM and MP4 autoplay, loop and are **muted**. When a visual effect applies, animated media are rendered frame by frame through the effect canvas (§12.4). If rendering exceeds the frame budget (`animatedEffectFallback default true`), the renderer falls back to a static first frame for that card.
- Each file gets a **content hash** (SHA-1), cached by `path + size + mtime` so rescans are fast. Images hash the full file bytes; videos hash `size + first 1 MB + last 1 MB` to keep scans fast on large files.
- **[RULE]** Folders are scanned **non-recursively** (one folder = one category). Hidden files are ignored. Images whose header cannot be parsed are skipped and counted as unreadable – they never appear on a card.
- The hash is the stable key for masks and recency tracking, so renaming or moving a file does not lose its data.

---

## 6. Session Setup (Generation Pipeline)

**[RULE]** Session generation is a **pure, deterministic function**: `generateSession(config, progression, imageIndex, history, seed) → SessionState`. It uses a seeded PRNG (e.g. mulberry32). The seed is stored in the session so any session can be reproduced for debugging. This function must be covered by unit tests.

**Implementation:** `src/shared/session/` (`generateSession`, one module per step, tests incl. 1,000-seed distribution checks). Clarifications made during implementation:

- The session index is `progression.sessionCounter + 1`; `sessionsSinceLastUse = sessionIndex − lastUsedSessionIndex`. A category is on cooldown while `sessionsSinceLastUse ≤ cooldownSessions`.
- The generator is pure: it returns the session **and** the updated `categoryUsage`; progression is persisted when the session actually starts.
- Action slots that cannot be filled (all actions of a group disabled, blocked or at `maxPerSession`) become normal cards.
- Action images come from all enabled action folders of the group (no `minImages` threshold); `allowedActions` filters per card.
- Placement segments start at a random offset on the ring so segment borders are not predictable.

Pipeline order:

1. Goal Field and start position (§6.1)
2. Category selection (§6.2)
3. Card composition – counts per type (§6.3)
4. Action slot assignment – which actions (§6.4)
5. Placement on the track (§6.5)
6. Image assignment (§6.6)

### 6.1 Goal Field and Start Position

- The start wheel yields a value N from `wheel.range` (`default [1, 100]`). N is the Goal Field number.
- **[RULE]** The initial task count is rolled separately with the seeded RNG from `initialTask.range` (`default [10, 40]`) and shown after the wheel stops.
- **[v2] [RULE]** The initial task count **equals N** (the wheel value). `initialTask.range` is removed. No multiplier applies.
- **[RULE]** The start position is **not** fixed to field 1. It is placed roughly opposite the goal: `start = wrap(N + 50 + randInt(-startJitter, +startJitter))`, `startJitter default 15`. This guarantees a meaningful distance in both directions regardless of N.
- Configurable `minGoalDistance` (`default 25`, measured as the shorter way around). The jitter is re-rolled until satisfied.

### 6.2 Category Selection with Guaranteed Variety

Goal: every session should feel different, and categories should rotate fairly without becoming predictable.

**Configuration:**

| Setting                     | Default | Description                                                                     |
| --------------------------- | ------- | ------------------------------------------------------------------------------- |
| `categoriesPerSession.good` | 1       | Number of good content categories per session.                                  |
| `categoriesPerSession.bad`  | 1       | Number of bad content categories per session.                                   |
| `cooldownSessions`          | 2       | A category used in the last X sessions is excluded.                             |
| `freshnessBonus`            | 0.5     | Extra weight per session since last use.                                        |
| `freshnessCap`              | 6       | Max sessions counted for the bonus.                                             |
| `allowReroll`               | false   | If true, the player may reroll the category selection once on the setup screen. |

**Algorithm (per group, independently):**

1. Candidates = enabled content folders of the group with `imageCount ≥ minImages`, minus folders blocked by progression.
2. Remove folders on cooldown (used in the last `cooldownSessions` sessions).
3. If fewer candidates remain than needed, re-add cooled-down folders starting with the one used longest ago (cooldown relaxes gracefully with small libraries).
4. Score each candidate:
   `score = selectionWeight × (1 + freshnessBonus × min(sessionsSinceLastUse, freshnessCap))`
   Never-used folders count as `freshnessCap`.
5. Weighted random pick **without replacement** until the required count is reached.
6. Store `lastUsedSessionIndex` for each picked folder in progression.

Effect: high-weight categories still appear more often, but a category that has not been seen for a while becomes increasingly likely, and immediate repeats are impossible (as long as the library is large enough).

**Setup screen:** after generation, a short "category reveal" shows the chosen good and bad category names (display names via i18n-safe labels). If `allowReroll` is on, a single "Reroll" button is available.

**[v2] More categories per session:**

- `categoriesPerSession.good` / `.bad` become ranges, `default [2, 3]` each (a fixed number is written as `[n, n]`). The count per group is rolled per session; the algorithm above is unchanged.
- Normal cards of a group are split between its categories by `shareWeight` and mixed by a plain shuffle (no zones).
- Wherever a rule draws "a new image from the active category of a group" (consumed action cards, revisit conversion §8.5, detour conversion §8.4, Redemption), the category is picked by `shareWeight` among the active categories of that group.
- The category reveal becomes the **session briefing**: good categories, bad categories, the performer (§6.2.1) and the session's action pool (§6.4) as icon row.
- _Later option (parking lot):_ **category zones** – each category owns contiguous arcs of the ring so the player can steer into a category.

### 6.2.1 Performer Selection [v2]

- One performer folder per session, picked with the same cooldown / freshness algorithm as categories (own candidate list: enabled `performer` folders with `imageCount ≥ collectibles.count.max`).
- If no eligible performer folder exists, the session has no collectibles (the briefing and console hide the collection).
- The performer's `categoryUsage` is tracked like a category.

### 6.3 Card Composition

The track has 100 fields:

- 1 field = Goal Field (special, no image task).
- 1 field = Start field (always a normal card, never an action card).
- 98 fields remain for normal and action cards (plus the start field as normal card).

**Configuration:**

| Setting                  | Default  | Description                                                                                       |
| ------------------------ | -------- | ------------------------------------------------------------------------------------------------- |
| `actionCards.count`      | [14, 22] | Random number of action cards per session.                                                        |
| `actionCards.goodShare`  | `linked` | `linked` = uses `progression.goodChance`; or a fixed value 0–1.                                   |
| `progression.goodChance` | 0.40     | Share of good cards among normal cards. Modified by rewards/penalties, clamped to `[0.20, 0.70]`. |

**Computation:**

```
A           = randInt(actionCards.count.min, actionCards.count.max)
A_good      = round(A × goodActionShare)
A_bad       = A − A_good
normalCount = 99 − A                     // includes the start field
N_good      = round(normalCount × goodChance)
N_bad       = normalCount − N_good
```

**[RULE]** If the action folders of a group contain zero images, action cards of that group still exist but use a neutral built-in action card design instead of an image.

**[v2] Collectibles:** `collectibles.count` (`default [6, 8]`) collectible cards are added when a performer is selected:

```
C           = performer ? randInt(collectibles.count.min, collectibles.count.max) : 0
normalCount = 99 − A − C                 // includes the start field
```

`N_good` / `N_bad` are computed from the reduced `normalCount` as before. **[v2]** Action cards without an image use the neutral built-in design (action folders no longer exist).

### 6.4 Action Slot Assignment

Each action slot receives a concrete action type. Every action has these configurable parameters:

| Parameter       | Description                                                                                                     |
| --------------- | --------------------------------------------------------------------------------------------------------------- |
| `enabled`       | Excluded when false.                                                                                            |
| `weight`        | Relative likelihood for a slot of its group.                                                                    |
| `maxPerSession` | Hard cap (e.g. Mistress Says No = 1).                                                                           |
| `minPerSession` | Guaranteed minimum if enabled (default 0).                                                                      |
| `sessionChance` | Optional gate for rare actions: rolled once per session; if it fails, the action is excluded from this session. |
| `requires`      | Optional dependency: the action is only eligible if another listed action is present in this session.           |
| `params`        | Action-specific ranges (task counts, durations…).                                                               |

**Algorithm (per group):**

1. Roll `sessionChance` gates; remove failed actions.
2. Remove actions blocked by progression (reward "block a bad effect").
3. Fill `minPerSession` guarantees first.
4. Fill remaining slots by weighted random pick, respecting `maxPerSession`.
5. Resolve `requires` after both groups are filled: if a dependent action lacks its requirement, re-roll that slot (max 10 attempts, then fall back to the highest-weight eligible action).

Example dependencies (defaults):

- `cleaning_lady` requires `pixelate` or `splatter`.
- `bad_luck` requires `hail_mary`.

**[v2] Action pool per session.** Slots are filled from **action card definitions** (§10.4) instead of the fixed 20 actions. Before slot assignment, the session draws its **action pool**:

1. Candidates = enabled definitions, minus those blocked by progression, minus failed `sessionChance` gates (rolled per definition).
2. Definitions with `minPerSession > 0` are always in the pool.
3. Fill up to `actionPool.size` (`default [8, 10]` distinct definitions, rolled per session) by weighted pick without replacement; keep at least 1 good and 1 bad definition if available.
4. `requires` refers to **resolver types** (e.g. `cleaning_lady` requires type `pixelate` or `splatter`); a definition whose requirement is not in the pool is replaced (max 10 attempts, then dropped).
5. Slot assignment (steps 3–5 above) then works on the pool only. `maxPerSession` is per definition.

The pool is shown in the session briefing. Actions outside the pool cannot appear in this session.

### 6.5 Placement on the Track

Action cards should be spread across the whole track – not clustered and not predictable.

**[RULE] Stratified placement:**

1. Build the list of eligible fields: all fields except Goal, Start, and **protected zones** (`startProtection default ±2`, `goalProtection default ±2`).
2. Divide the circular list into A equal segments.
3. In each segment place one action card at a random position.
4. Enforce `minActionGap` (`default 2` – no two action cards directly adjacent). If violated, shift within the segment; after 20 failed attempts, relax the gap for that card.
5. Shuffle which action (from §6.4) lands in which slot.

All remaining fields become normal cards; good/bad normal cards are distributed by a plain shuffle.

**[v2]** Collectible cards are placed together with action cards: the stratified placement runs over `A + C` slots, and collectibles take random slots of that set. `minActionGap` applies between all special cards.

### 6.6 Image Assignment

**Normal cards:**

- Images are drawn from the selected categories of the matching group, split by `shareWeight` if more than one category is active.
- **[RULE]** No image repeats within a session (shuffle bag per category). Only if a category runs out is the bag refilled.
- **Cross-session recency:** images shown in the last `imageRecencySessions` sessions (`default 3`) are placed at the end of the bag, so fresh images are preferred.

**Action cards:**

- The action type is decided first; then an image is drawn from action folders of the matching group whose `allowedActions` includes this action (or is `null`).
- Fallback: any action folder of the group → built-in neutral action design.
- **[v2]** Every action card shows the **image of its definition** (§10.4); without an image → built-in neutral action design. No image bags for actions.

**[v2] Collectible cards:** images from the session's performer folder (shuffle bag, no repeats, recency preference); task count from the performer folder's `taskRange`.

**Task counts:**

- Normal cards roll their task count from their folder's `taskRange` **at generation time** and store it on the card (so reloading a session does not change it). Modifiers (e.g. Double Trouble) are applied at display time.
- **[RULE] Revisits:** landing again on an already discovered normal card shows the same task with a **new** count, rolled from the same `taskRange` with the session RNG and stored on the card before display (reload-safe).
- **[v2]** Replaced by the revisit conversion (§8.5): revisited cards become bad cards with a new image.

---

## 7. UI Layout

### 7.1 Main View

Layout (see design-system.md for sizes): **left console** (ring, stats, active effects, Pause/End Early) · **image stage** (right, full height above the task bar) · **task bar** (bottom right).

- **Image stage:** current card media, as large as possible without cropping (`object-fit: contain`), rendered through the effect canvas (§12). No permanent chrome on top of the image.
- **Task bar / instruction overlay:** task text, action banner, effect results and buttons are rendered in a layer **above** the canvas, never affected by pixelation/splatter.
- **Ring (replaces the former card-track strip) [RULE]:**
  - All 100 fields as ring segments; the current field is always at 12 o'clock and drawn raised. Clockwise = right, counter-clockwise = left.
  - Undiscovered: neutral segment. Discovered: filled in group color; **bad** segments additionally carry a pattern (never color-only).
  - Discovered action cards: a marker inside the ring – circle = good, diamond = bad.
  - Goal Field: goal icon marker outside the ring, always visible; the ring center shows the distance to the goal in both directions.
  - After rolling, the two target fields are outlined and the path preview is shown.
  - **Hover/focus on a discovered segment** shows a thumbnail preview (with active visual effects applied).
  - Blocked direction (U Turn) is shown on the ring and on the direction button.
- **Discovered gallery:** a drawer opened from the console (hotkey `G`) showing all discovered cards as thumbnails with field number, group and action icon. Read-only; it pauses nothing.
- **Active effects:** chips in the console below the stats, each with icon, name (i18n) and remaining rounds. Hover/focus shows a description.
- **Stats:** round, discovered count, success multiplier, and the **action card hint** (§7.4).
- **[v2] Stats layout [RULE]:** release chance · discovered / undiscovered · actions left (round and win multiplier leave the console; the multiplier is part of the release chance breakdown and the Hail Mary chip).
- **[v2] Additional stats [RULE]:**
  - **Release chance** – the live value of §14.1 (e.g. "Release chance 18 %"), prominent in the stats block; hover/focus shows the breakdown (discovered × rate, performer bonus, multiplier, cap).
  - **Undiscovered normal cards** – "32 good · 41 bad" (updates after reveals, conversions and track changes).
  - **Performer collection** – performer name + progress towards the next bonus tier ("2 / 5", tier markers at 3 / 4 / 5); hidden without performer.
- **[v2] Direction buttons** additionally show a **detour badge** on a side whose move would be a detour (§8.4), e.g. "Detour · +2 good", and the forced-reversal state (§8.7).

### 7.2 Controls

**[RULE]** Every control is reachable by keyboard; key hints are printed on the buttons.

| Control                                                            | Mouse                         | Keyboard                      |
| ------------------------------------------------------------------ | ----------------------------- | ----------------------------- |
| Primary action of the phase (Done / Roll / Spin / Start / Confirm) | button                        | `Space` or `Enter`            |
| Direction left / right                                             | direction buttons             | `←` / `→`                     |
| Number choice (Decision Maker, Guessing Game)                      | number buttons                | `1`–`6`                       |
| **[v2]** Stroke tier on normal cards (×1 / ×2 / ×3, §8.6)          | tier buttons                  | `1` / `2` / `3`               |
| Picker selection (effects, rewards, Switcheroo)                    | tiles                         | `←` `→` + `Enter`, or `1`–`9` |
| Discovered gallery                                                 | console button                | `G`                           |
| Cancel / close dialog or drawer                                    | button                        | `Esc`                         |
| Skip current animation                                             | click                         | `Space`                       |
| Pause / Neutral Screen                                             | console button                | global hotkey (§19)           |
| End Early                                                          | press-and-hold button (1.5 s) | hold `Ctrl+Backspace` 1.5 s   |

- **Direction buttons [RULE]:** both directions are styled **neutrally** (no highlight of the shorter way). Each shows target field, distance to goal and the per-side action hint (§7.4). Disabled until rolled; a blocked direction is disabled with the U Turn icon.
- **End Early:** always available until the Goal Field is reached; press-and-hold replaces a confirmation dialog and is visually separated from Pause.

### 7.3 Movement Animation

The marker moves field by field (~120 ms per field) while the ring rotates so the current field stays on top; passed segments flash briefly but stay undiscovered. Then the landed segment fills and the image fades in. Players can skip the animation (click or `Space`; setting: `animationSpeed`). `prefers-reduced-motion` or the setting `reducedMotion` replaces all movement with short crossfades.

### 7.5 Sound Cues

Optional (`sound.enabled default false`, `sound.volume`). Cues: dice result, card reveal (good/bad differ), countdown ticks in the last 3 s, countdown end, wheel stop. Sounds are bundled files, never streamed. Pause silences everything instantly.

### 7.4 Action Card Hint

The console stats and the direction buttons show how many action cards are still undiscovered, so the player can weigh risk when choosing a direction. Positions are never revealed.

| Setting `actionHint`        | Display                                                                                |
| --------------------------- | -------------------------------------------------------------------------------------- |
| `off`                       | No hint                                                                                |
| `total`                     | "Action cards left: 12"                                                                |
| `split`                     | "Action cards left: 4 good · 8 bad"                                                    |
| `split_by_side` (`default`) | Like `split`, additionally broken down by direction and shown on each direction button |

**`split_by_side` definition [RULE]:** the current position and the Goal Field split the ring into two arcs (left arc and right arc, both excluding the current field and the Goal Field). Each direction button shows the good/bad count of undiscovered, non-consumed action cards on its arc. The console stat shows the total.

- **[RULE]** The counter updates after every reveal and after every action that changes the track (`goal_teleport`, `moving_day`, `switcheroo`).
- Cards with `actionConsumed = true` (retrigger mode `once`) are not counted.
- i18n keys: `hint.actions.total`, `hint.actions.split`, `hint.actions.side.short`, `hint.actions.side.long`.

---

## 8. Gameplay Flow

### 8.1 New Session

1. App start → apply penalty decay → load progression.
2. If a lockout is active (penalty field hit), show countdown; spinning is disabled.
3. Spin start wheel. If it lands on a penalty field → lockout for `penaltyLockoutMinutes` (`default 15`), no session.
4. Otherwise: Goal Field = N. Roll the initial task count (§6.1) and show the initial task → "Done".
5. Generate session (§6) → category reveal → game starts on the start field (card revealed and counted as discovered, its task shown).

### 8.2 Round Structure

1. Resolve the current card (task or action) → player confirms.
2. Player rolls the dice.
3. Player chooses a direction (unless blocked).
4. Movement animation → landed card is revealed and marked as discovered. Only the landing field becomes discovered; passed fields do not.
5. Effect durations tick down by one (**[RULE]** ticking happens at the end of each round, after the landed card is resolved; effects created during this round start ticking next round).
6. If landed **exactly** on the Goal Field → win flow (§14). Passing over the Goal Field has no effect. Otherwise → back to 1.

**[v2] Round structure:**

1. Resolve the current card (task or action). On a normal card the player first picks the **stroke tier** (§8.6) → confirms.
2. **Forced reversal check** (§8.7) – if it triggers, only the reverse direction is allowed this round.
3. Player rolls the dice (1–3 dice depending on the stroke tier).
4. Player chooses a direction (unless blocked / forced).
5. Movement animation. Then, in this order:
   1. **Overshoot:** if the path passed over the Goal Field without landing on it → goal drift (§8.8).
   2. **Detour:** if the move increased the shortest distance to the goal (measured against the goal before the move) → detour conversion (§8.4).
   3. **Landing:** first visit → reveal, mark as discovered, +release chance. Revisit → revisit conversion (§8.5) or collectible revisit (§9.4).
6. Effect ticking as before.
7. Exactly on the Goal Field → win flow (§14); otherwise → back to 1.

### 8.3 Resume

**[RULE]** The session is autosaved after every state change. If the app is closed mid-session, the next start offers "Resume session" (or "End Early", which counts as a loss).

**[v2]** A saved session with an older session `schemaVersion` cannot be resumed: it is discarded **without scoring** (no loss, no history entry) and the start screen shows a one-time notice.

### 8.4 Detour Conversion [v2]

**[RULE]** A rolled move is a **detour** when `shortestDistance(landing, goal) > shortestDistance(start, goal)`, with `goal` = the Goal Field before the move. Teleports (Moving Day) are never detours.

- Each detour converts `detourConversion` (`default 2`) random **undiscovered bad normal cards** into good normal cards: group → `good`, new image from an active good category (§6.2), task count from that folder's `taskRange`. Collectibles and action cards are never converted.
- Applied immediately after the move; a notice step shows "2 bad fields turned good" and the undiscovered counter updates.
- `maxDetourConversions` (`default null` = unlimited) caps the conversions per session. With no bad cards left, the detour badge is hidden.
- Direction buttons show the detour badge before the choice (§7.1), so the trade-off (longer way + more tasks vs. better board) is a visible decision.

### 8.5 Revisit Conversion [v2]

**[RULE]** Landing on an **already discovered** field (not by teleport onto an undiscovered field) converts it into a **bad normal card**: new image from an active bad category (§6.2), new task count from that folder's `taskRange`, then it is resolved like a fresh card.

- Applies to good and bad normal cards (bad cards also get a new image), the start field and consumed action cards.
- **Exceptions:** collectible cards (§9.4), action cards that still trigger (`actionRetrigger: always`), the Goal Field.
- The discovered count and the release chance do not change (the field was already counted).
- Effect: lingering around the goal gets progressively worse, but the images never repeat.

### 8.6 Stroke Tier [v2]

**[RULE]** On every **normal card** (good or bad; not on action cards, collectibles, the initial task) the player chooses a tier before confirming:

| Tier | Task count | Next move         |
| ---- | ---------- | ----------------- |
| ×1   | × 1        | roll 1 die        |
| ×2   | × 2        | roll 2 dice (sum) |
| ×3   | × 3        | roll 3 dice (sum) |

- The tier multiplies with other task multipliers (Double Trouble).
- Decision Maker overrides the roll (choice 1–6 regardless of the tier). Guessing Game dice are unaffected.
- The dice UI shows 1–3 dice; the action hint and targets work for any step count.
- Setting `strokeTiers.enabled` (`default true`); max tier `strokeTiers.max` (`default 3`).

### 8.7 Forced Reversal [v2]

**[RULE]** Before each roll (not in the first round after the start card, not while U Turn is active, not directly after a forced reversal), with `forcedReversalChance` (`default 0.10`) the player may only move in the **opposite direction of the last move** this round.

- Shown before the roll as a notice and on the direction buttons (blocked side with its own icon, distinct from U Turn).
- Implemented with the direction-block mechanism for exactly one move; it is not an effect and not removable.

### 8.8 Goal Drift on Overshoot [v2]

**[RULE]** When a rolled move **passes over** the Goal Field without landing on it, the Goal Field jumps to a random **undiscovered** field within `goalDrift.range` (`default [3, 8]` fields, shorter distance, either side) of its current position, excluding the player's field.

- The jump swaps the Goal Field with the target card (same as `goal_teleport`); the ring shows the goal pulse animation.
- No valid field → widen the range by 4 up to 20; still none → any undiscovered field; still none → the goal stays.
- Intended decision: 3 fields before the goal with a roll of 4, the player either goes 4 back (revisits → bad cards, §8.5) and retries, or jumps over the goal and chases it into fresh, undiscovered territory (+release chance).
- Action hint counters update after the drift.

---

## 9. Card Types

### 9.1 Normal Card

Shows the image and a task with count = stored `taskCount` × active multipliers. Pace effects (Take it Slow / Speed it Up) are shown as an additional instruction line.

### 9.2 Action Card

Shows the image with an action banner (name + description via i18n) and the action's interactive UI. Setting `actionRetrigger`: `always` | `once` (`default once`).

**[RULE] Consumed action cards (`once`):** after the first trigger the card becomes a normal card: same group as the action card, task count rolled from `consumedTaskRange` (`default [6, 20]`), new random image from the session's active content category of that group (normal image rules apply). The swap happens at trigger time and is saved.

If no action image is available, the card uses the built-in neutral action design (large action icon on a patterned surface in group color).

### 9.3 Goal Field

No image task. Landing triggers the win flow (§14).

### 9.4 Collectible Card (Performer) [v2]

**[RULE]**

- Shows a performer image and a task (count from the performer folder's `taskRange`). Ring: its own marker shape (star) once discovered; never color-only.
- **First landing** collects the card: the collection counter increases and bonus tiers are checked.
- **Revisit:** no bonus again; the card shows only a stroke task with count `collectibles.revisitTaskRange` (`default [10, 25]`), same image. It is exempt from the revisit conversion (§8.5), the detour conversion and Switcheroo.
- Collectibles count as discovered (release chance) like any card.
- Splatter can hit collectibles; Goal Teleport / goal drift / Moving Day treat them like normal undiscovered cards (the goal swap moves the card).

**Bonus tiers [RULE]** (`collectibles.tiers`, configurable; each tier triggers once, immediately, cumulative):

| Collected | Bonus (default)                                           |
| --------- | --------------------------------------------------------- |
| 3         | Convert 5 undiscovered bad normal cards to good (as §8.4) |
| 4         | +5 % release chance (flat, added to the base, §14.1)      |
| 5         | +10 % release chance (total +15 %)                        |

A reached tier shows a reward notice step (performer image + bonus text).

---

## 10. Action Catalog

All actions are identified by ID; labels and descriptions come from i18n keys `action.<id>.name` / `action.<id>.description`.

### 10.1 Good Actions

| ID                    | Default weight | Behavior                                                                                                                                                                                                                                                                                           | Params (defaults)                 |
| --------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `clearing_edges`      | 20             | Player performs a Hold Position task; on completion, the player removes one active negative effect of their choice.                                                                                                                                                                                | hold duration 15–35 s             |
| `good_fairy`          | 15             | Player removes one active negative effect of their choice for free. If none are active, it grants a "shield" that blocks the next bad action (`shieldEnabled default true`).                                                                                                                       | –                                 |
| `decision_maker`      | 20             | Player chooses the step count (1–6) for the next move instead of rolling.                                                                                                                                                                                                                          | –                                 |
| `cleaning_lady`       | 15             | Removes all visual effects (pixelate level to 0, all splatters).                                                                                                                                                                                                                                   | requires `pixelate` or `splatter` |
| `hail_mary`           | 10             | Grants a success multiplier for the win check.                                                                                                                                                                                                                                                     | range 1.5–3.0, step 0.5           |
| `redemption` **[v2]** | 10             | Converts N random undiscovered bad normal cards into good ones (same rules as §8.4). If none are left, shows "nothing to convert".                                                                                                                                                                 | N 3–5                             |
| `switcheroo`          | 10             | Player first chooses a **target pool** (good category, bad category, good action images, bad action images), then picks one of 3 random alternative folders of that pool. All undiscovered cards of that pool get new images from the chosen folder. Discovered cards remain unchanged. See §10.3. | alternatives 3                    |

### 10.2 Bad Actions

| ID                 | Default weight | Behavior                                                                                                                                                                                                        | Params (defaults)                       |
| ------------------ | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `pixelate`         | 15             | Increases the global pixelation level by 1 (cumulative, capped at max level).                                                                                                                                   | levels see §12.4                        |
| `splatter`         | 10             | Applies a splatter overlay to N random cards (discovered and undiscovered, excluding Goal).                                                                                                                     | N 3–10                                  |
| `squeeze_task`     | 12             | Tension task with a count.                                                                                                                                                                                      | count 5–20                              |
| `edge_and_hold`    | 12             | "Hold Position" → spinner animates ~3 s and lands on a duration; countdown runs; at 0 the player confirms.                                                                                                      | duration 15–35 s                        |
| `double_trouble`   | 10             | Task counts ×2 for N rounds. Re-triggering adds rounds instead of stacking the multiplier.                                                                                                                      | rounds 2–8                              |
| `mistress_says_no` | 100            | Session ends immediately; counts as a loss.                                                                                                                                                                     | `sessionChance 0.05`, `maxPerSession 1` |
| `guessing_game`    | 8              | Player picks two **different** numbers (1–6), then rolls one die. Match (either number) → choose: remove one negative effect **or** remove 2 penalty fields. No match → roll two dice, perform (d1 × d2) tasks. | –                                       |
| `goal_teleport`    | 5              | Task (15–35), then the Goal Field swaps position with a random undiscovered field outside the safety zones.                                                                                                     | safety zone 12                          |
| `u_turn`           | 8              | Blocks the current direction of travel for N rounds.                                                                                                                                                            | rounds 2–4                              |
| `moving_day`       | 5              | Task (15–35), then player moves to a random undiscovered field outside the safety zones (landed card is resolved normally).                                                                                     | safety zone 12                          |
| `highperformer`    | 8              | Timed task: as many as possible within the countdown; player only confirms (no count entry).                                                                                                                    | duration 5–15 s                         |
| `bad_luck`         | 5              | Removes the active success multiplier.                                                                                                                                                                          | requires `hail_mary`                    |
| `take_it_slow`     | 6              | Slow pace for N rounds (replaces an active fast pace). Shown as an extra text line on tasks.                                                                                                                    | rounds 2–5                              |
| `speed_it_up`      | 6              | Fast pace for N rounds (replaces an active slow pace). Shown as an extra text line on tasks.                                                                                                                    | rounds 2–5                              |

> **Pace display:** text only in v1. A visual/audio metronome is a possible later extension (§25).

> **Note on `mistress_says_no`:** it is controlled by `sessionChance` (probability that it exists in the session at all) instead of a per-card percentage. Its high weight only matters once the gate passes, ensuring exactly one such card is placed.

### 10.3 Switcheroo Rules

**[RULE]**

| Target pool        | Affected cards                            | Alternatives drawn from                                           | What changes                                                                     |
| ------------------ | ----------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Good category      | Undiscovered normal cards of group `good` | Enabled good content folders, excluding the currently active ones | Image and `folderId`; `taskCount` is re-rolled from the new folder's `taskRange` |
| Bad category       | Undiscovered normal cards of group `bad`  | Enabled bad content folders, excluding the currently active ones  | Same as above                                                                    |
| Good action images | Undiscovered action cards of group `good` | Enabled good action folders                                       | Image only; the action type stays the same                                       |
| Bad action images  | Undiscovered action cards of group `bad`  | Enabled bad action folders                                        | Image only; the action type stays the same                                       |

- Cooldown rules are ignored for alternatives; `minImages` still applies.
- If a pool has fewer than 3 alternatives, all available ones are shown; a pool with no alternatives is hidden from the choice.
- For action pools: if the chosen folder's `allowedActions` does not include a card's action, that card keeps its current image. The UI shows "X of Y cards changed".
- Newly assigned images follow the normal image rules (no repeats in the session, recency preference).
- The session's `categories` record is updated for content pools; for action pools, `activeActionFolders[group]` is set to the chosen folder for all later image draws (e.g. after `goal_teleport`).
- Stats record the swap (`from`, `to`, `pool`).

**[v2] Switcheroo with several categories and without action folders:**

- The action image pools are **removed** (action images belong to definitions).
- Step 1 lists the **active categories** (good and bad) as pools; the player picks one. Step 2 offers up to 3 alternative folders of the same group (excluding all active categories). Only undiscovered normal cards of the chosen category change; the chosen folder replaces it in `categories`.
- Collectible cards are never affected.

**Safety zones [RULE]:** for `goal_teleport` and `moving_day`, the target field must be undiscovered and at least `safetyZone` fields (shorter distance) away from both the current position and the current Goal Field. If no such field exists, reduce the zone by 2 until a valid field is found; if still none, the action only performs its task.

### 10.4 Action Card Definitions [v2]

**[RULE]** Actions are no longer tags on folders. Every action card is a uniquely defined **ActionCardDefinition**:

| Field                                                                  | Description                                                                                                                                                  |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                                                                   | Stable ID (slug for built-ins, e.g. `pixelate`; UUID for user-created cards).                                                                                |
| `type`                                                                 | Resolver type = one of the action IDs of §10.1/10.2 (incl. `redemption`). The group is derived from the type.                                                |
| `name` / `description`                                                 | Built-ins: i18n keys `action.<type>.name/description`. User cards: free text (user content, not i18n – the only exception to the no-hardcoded-strings rule). |
| `image`                                                                | The card's **unique** image in the action-art store (`hash`, `fileName`, `mimeType`, `kind`), or `null` → neutral built-in design.                           |
| `enabled`, `weight`, `minPerSession`, `maxPerSession`, `sessionChance` | As in §6.4, per definition.                                                                                                                                  |
| `requires`                                                             | Resolver types (any of) that must be in the session's action pool.                                                                                           |
| `params`                                                               | Type-specific params (defaults from §10.1/10.2), overridable per definition.                                                                                 |

- **Built-ins:** one definition per type (21 incl. `redemption`) ships as default and can be edited, disabled or duplicated; built-ins cannot be deleted (reset to default instead).
- **Variants:** the user can create more cards of the same type with their own name, params, weight and image (e.g. "Squeeze – hard" with count 15–30).
- **Images [RULE]:** assigned in the admin by picking any supported media file. The file is **copied** into `userData/action-art/` and addressed by its content hash via `cr-media://` (the protocol serves index files and the action-art store only). One image per definition; the same file may not be assigned to two definitions (uniqueness check by hash).
- Stats and history record the definition id **and** type.

---

## 11. Effects System

**[RULE]** All temporary modifiers are represented as `ActiveEffect` objects in the session state. The effects engine is pure logic (unit tested) and exposes: `applyEffect`, `removeEffect`, `tickRound`, `getTaskMultiplier`, `getBlockedDirection`, `getPace`, `getVisualState`.

| Effect                     | Kind                                                       | Duration        | Stacking                        | Counts as "negative" (removable)    |
| -------------------------- | ---------------------------------------------------------- | --------------- | ------------------------------- | ----------------------------------- |
| Double Trouble             | task multiplier ×2                                         | rounds          | adds rounds                     | yes                                 |
| Take it Slow / Speed it Up | pace                                                       | rounds          | mutually exclusive, newest wins | yes                                 |
| U Turn                     | direction block                                            | rounds          | refreshes rounds                | yes                                 |
| Pixelate                   | visual, global level                                       | session         | +1 level                        | yes (removing reduces level by 1)   |
| Splatter                   | visual, per card                                           | session         | per card                        | yes (removing clears all splatters) |
| Hail Mary                  | success multiplier                                         | until win check | highest value kept              | no                                  |
| Shield (Good Fairy)        | blocks next bad action (**all except `mistress_says_no`**) | until used      | max 1                           | no                                  |

When a player removes "one negative effect", a picker lists all active negative effects.

---

### 11.1 Engine Implementation Notes

Implemented as a pure reducer in `src/shared/session/engine/` (`reduce(state, event, context)`), covered by unit tests and a random-play fuzz test. Clarifications:

- **Rounds:** the round counter increases on every roll/choice. Effects created while resolving a round's card start ticking at the end of the _next_ round, so "N rounds" means the next N moves. The start card (round 0) never ticks.
- **Resolution queue:** each card produces steps (task, hold, timed task, pick effect, notice, guess, reward choice, Switcheroo pool/folder). The head step is what the task bar shows; the round ends when the queue is empty.
- **Task multiplier** (Double Trouble) applies to card tasks, Squeeze, and the tasks of Goal Teleport / Moving Day. It does not apply to the initial task or to the Guessing Game penalty (d1 × d2).
- **U Turn** blocks the direction of the move that landed on it.
- **Shield** blocking a bad action counts as a trigger (the card is consumed with `actionRetrigger: once`).
- **Consumed conversion** happens at trigger time; the UI shows the action via the `reveal` snapshot.
- **Hail Mary** rolls on the step grid (1.5 / 2.0 / 2.5 / 3.0). **Bad Luck** without an active multiplier shows "nothing to remove".
- **Switcheroo action pools** are only offered when the swap can change something (with "all action folders active" at least two folders are needed).
- **Moving Day** never lands on the Goal Field (targets are undiscovered non-goal fields) and resolves the landed card in the same round.
- **Guessing Game** rewards: "remove 2 penalty fields" is collected in `penaltyFieldsRemoved` and applied to progression at session end (§13).

## 12. Visual Effects and Region Masks

### 12.1 Concept

Pixelate and Splatter can be restricted to **regions** defined per image. Each image may have a mask consisting of one or more regions. The effect is applied only inside those regions. Images without a mask follow their folder's `unmaskedEffectBehavior` (`full` = whole image, `none` = unaffected).

> **Scope:** the Media Library and Mask Editor (§12.2–12.3) are a **separate milestone** after the core game. Until then every folder behaves as `unmaskedEffectBehavior: full`.

### 12.2 Media Library (Admin)

A dedicated admin screen to review all images and manage masks:

- **Left sidebar:** folder list grouped by good/bad and content/action, each with a progress indicator ("42 / 120 reviewed").
- **Main area:** virtualized thumbnail grid of the selected folder.
- **Status badge per thumbnail:**
  - `unreviewed` (grey) – no decision yet
  - `masked` (blue) – has ≥ 1 region, shows count
  - `no_regions` (green) – explicitly marked as "no regions needed"
- **Filters:** all / unreviewed / masked / no regions.
- **Actions:** open editor (double-click), mark selected as "no regions", clear masks for selected.

### 12.3 Mask Editor

Opens an image in a full-screen editor.

**Tools:**

| Tool             | Shortcut | Description                                                   |
| ---------------- | -------- | ------------------------------------------------------------- |
| Select / move    | `V`      | Select, move, resize (handles), delete regions                |
| Rectangle        | `R`      | Drag to draw                                                  |
| Ellipse          | `E`      | Drag to draw                                                  |
| Polygon          | `P`      | Click points, double-click / Enter to close                   |
| Lasso (freehand) | `L`      | Drag to draw; simplified to a polygon (Ramer–Douglas–Peucker) |

**Region properties panel:** effects this region applies to (`pixelate`, `splatter`, or both), edge feather (0–10 % of short image side).

**Other features:**

- Zoom (mouse wheel) and pan (space + drag).
- Undo / redo (`Ctrl+Z` / `Ctrl+Y`), delete region (`Del`).
- **Preview slider:** shows the image with pixelate level 0–max applied through the real renderer.
- Navigation: previous/next image in the folder (`←` / `→`), autosave on navigation.
- `C` = copy regions from the previous image (useful for series with similar composition).
- `N` = mark current image as "no regions needed" and go to next.

**[RULE] Storage:** regions are stored in **normalized coordinates** (0–1 relative to the image's natural width/height), keyed by the image's content hash. This makes masks independent of display size and survives file renames.

### 12.4 Effect Rendering

**[RULE]** Rendering pipeline per displayed image (renderer process, canvas):

1. Draw the original image to an offscreen canvas at display resolution.
2. **Pixelate** (if level > 0): create a pixelated copy by downscaling to `shortSide / blockCount` and upscaling with `imageSmoothingEnabled = false`. Composite it onto the image, clipped to the mask regions (or full image / nothing per `unmaskedEffectBehavior`). Feathered edges via a blurred alpha mask.
3. **Splatter** (if this card is splattered): draw the overlay texture (built-in set of semi-transparent PNGs, randomly rotated/positioned from a per-card seed) clipped the same way.
4. Output to the visible canvas; cache the result per `(imageHash, pixelLevel, splatterSeed, size)`.

Pixelation levels (configurable): `blockSizes = [0, 0.012, 0.022, 0.035, 0.05, 0.075]` as fraction of the image's short side (level 0 = off, max level = 5).

Ring hover previews and the discovered gallery use the same pipeline at small size.

**Implementation notes (AP8):** `src/renderer/src/effects/`.

- Without active effects media render as plain `<img>`/`<video>`; the canvas pipeline only runs for affected cards.
- Images draw once (redrawn on resize); videos draw per decoded frame (`requestVideoFrameCallback`); GIF / animated WebP decode frames with `ImageDecoder`. Thumbnails (ring preview, gallery) always draw a single frame.
- Frame budget: if drawing averages more than 16 ms over 30 frames, animated media freeze on the current frame (`animatedEffectFallback`).
- Decoded images are cached by hash (64 entries) instead of caching processed frames – drawing is cheap, fetching is not (the media protocol sends `no-store`).
- The media scheme is CORS-enabled so canvases stay untainted and `ImageDecoder` can fetch.
- Splatter textures live in `src/renderer/src/assets/splatter/` (any PNG/SVG/WebP there is used); `pnpm generate:splatter` recreates the placeholders. Stamp layout is deterministic per `splatterSeed`.
- Region masks (§12.1) are not applied yet: folders behave as `unmaskedEffectBehavior` says (`full` / `none`) until the Mask Editor milestone (AP11).

---

## 13. Penalty System

### 13.1 Penalty Fields

- Penalty fields are red segments on the start wheel (positions stored in progression).
- Landing on one → lockout for `penaltyLockoutMinutes` (`default 15`), shown as a countdown; no session starts.

### 13.2 Losses

A session counts as a **loss** when: End Early is used, `mistress_says_no` triggers, or a resumed session is abandoned.

A `Denied` result on the final wheel is **not** a loss (see §14.3).

**Escalation [RULE]:** `added = penaltyStep × lossStreak` (`penaltyStep default 2` → 2, 4, 6, …), capped at `maxPenaltyFields` (`default 40`). New fields are placed on random non-penalty positions. `lossStreak` resets to 0 on `success`, `interrupted` and `no_result`. `denied` leaves `lossStreak` unchanged.

### 13.3 Decay

**[RULE]** Every full hour since `lastDecayAt`, `decayAmount` (`default 2`) penalty fields are removed (random ones). Calculated lazily on app start and every minute while the app is open, using stored timestamps – no background process required.

---

## 14. Winning the Session

### 14.1 Win Check

When the player lands on the Goal Field:

1. Show discovered vs undiscovered card count.
2. Player rolls one die → `roll`.
3. `baseChance = floor(discovered / roll)` (in percent).
4. `finalChance = clamp(floor(baseChance × successMultiplier), minChance, maxChance)` (`minChance default 1`, `maxChance default 95`).

**[v2] Release chance without a die [RULE]:** the win-check roll is **removed**. The chance is deterministic and shown live in the console (§7.1) during the whole session:

```
base        = discovered × chancePerDiscovered + collectibleBonus   // percent
finalChance = clamp(floor(base × successMultiplier), minChance, maxChance)
```

- `chancePerDiscovered` `default 0.4` (keeps the old average: E[1/d6] ≈ 0.41). All discovered cards count the same (good, bad, action, collectible, start).
- `collectibleBonus` = sum of reached percentage tiers (§9.4).
- No separate win check screen: landing on the goal opens the final wheel directly; its side panel shows the breakdown (base, performer bonus, multiplier, final chance). The `win_check` phase no longer exists.
- Purpose: the player sees the potential chance and decides whether to reveal more fields before heading for the goal.

### 14.2 Final Wheel

- Wheel with a white area (= `finalChance` %) and a red area (rest).
- "Start Task" → wheel starts spinning.
- Button changes to "Hold Position"; pressing it starts a countdown equal to the discovered count (in seconds). The wheel decelerates so that it stops exactly at 0.
- **[v2]** Countdown = `min(discovered, holdSecondsCap)`, `holdSecondsCap default 60`.
- **[RULE]** The result is determined by the seeded RNG when "Start Task" is pressed; the animation is choreographed to land on it.
- Result: `Success Allowed` (white) or `Denied` (red).

### 14.3 Outcomes

| Final wheel     | Available choices | Effect                                                                                                                                                   |
| --------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Success Allowed | **I Succeeded**   | Choose one reward: remove 4 penalty fields · increase good chance by `goodChanceStep` (`default +0.03`) · block a random bad action for the next session |
| Success Allowed | **Interrupted**   | Remove 2 penalty fields                                                                                                                                  |
| Success Allowed | **No Result**     | Remove 2 penalty fields, decrease good chance by `goodChanceStep / 2`                                                                                    |
| Denied          | (confirm only)    | **Neutral outcome:** no penalty fields added or removed, `goodChance` unchanged, `lossStreak` unchanged. The session is recorded in history as `denied`. |

---

### 14.4 Implementation Notes

Engine: `src/shared/session/engine/winFlow.ts`; progression math: `src/shared/session/progressionRules.ts` (both unit tested).

- The final wheel result and the landing spot (10–90 % inside the winning area) are decided by the session RNG on "Start Task". Hold Position runs a countdown of `discovered` seconds; the wheel decelerates from its current speed so it stops exactly at 0 on that spot. Pause freezes the countdown and the wheel.
- "Block a random bad action" picks an enabled bad action except Mistress Says No (already gated by `sessionChance`).
- Progression is applied when the finished session is closed ("Back to start"). `lastAppliedSessionId` is written atomically with it, so a crash between writes never applies a session twice; history entries are de-duplicated by session id.
- Decay keeps the remainder of a started hour (`lastDecayAt` advances by whole hours) and runs on start and every minute.
- The end screen previews the progression change before it is applied.

## 15. Persistent Progression

Stored in `progression.json`:

- `goodChance` (0.20–0.70)
- `penaltyFields` (list of wheel positions) and `lastDecayAt`
- `lossStreak`
- `lockoutUntil` (timestamp or null)
- `blockedActionsNextSession` (ActionId[], cleared after use)
- `categoryUsage` (folderId → lastUsedSessionIndex, timesUsed) – **[v2]** includes performer folders
- `blockedActionsNextSession` **[v2]** holds action card definition ids
- `imageRecency` (imageHash → lastSessionIndex)
- `sessionCounter`

---

## 16. Admin & Configuration

Admin is a separate route, reachable from the start screen. (Admin PIN: later, not in v1.)

**Expected library size:** start with 3–4 good and 3–4 bad content folders; later 20–30 folders with 100–200 media files each (~6,000 files). Scanning, hashing and grids must stay responsive at that size.

**First-run:** with no folders registered, the start screen shows an empty state that leads into a setup wizard (add folder → group → role → scan).

| Screen                       | Contents                                                                                                                                                                                                              |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Folders**                  | Add/remove folders, group, role, enabled, `selectionWeight`, `shareWeight`, `taskRange`, `allowedActions`, `unmaskedEffectBehavior`, image count, rescan.                                                             |
| **Media Library**            | Thumbnail review and Mask Editor (§12.2–12.3).                                                                                                                                                                        |
| **Actions**                  | Per action: enabled, weight, min/max per session, sessionChance, requires, params. Live preview: "expected action cards per session" and a simulated distribution (run the generator 1,000× with random seeds).       |
| **Session Rules**            | Categories per session, cooldown, freshness, action card count range, protected zones, gap, start distance, animation speed, retrigger mode.                                                                          |
| **Visual Effects**           | Pixelation block sizes, splatter count range, splatter textures.                                                                                                                                                      |
| **Penalties & Progression**  | Step, cap, decay, lockout duration, good chance bounds/step; buttons to reset progression.                                                                                                                            |
| **[v2] Action Cards**        | Replaces "Actions": list of definitions grouped by good/bad with image thumbnail; create/duplicate/edit/disable/reset; image picker (copy into action-art, uniqueness check); action pool size; simulation as before. |
| **[v2] Performers**          | Performer folders (enabled, weight, taskRange), collectible count, revisit task range, bonus tiers.                                                                                                                   |
| **[v2] Session Rules (add)** | Categories per session ranges, detour conversion + cap, release chance rate, hold cap, goal drift range, stroke tiers, forced reversal chance.                                                                        |
| **Backup**                   | Export/import of config, progression, masks and history as one ZIP/JSON bundle (image files excluded; folder paths are remapped on import if missing).                                                                |

---

## 17. Stats & History

Per session:

- Date, duration, seed
- Goal value N, selected categories
- Rounds played, total dice rolls
- Total tasks performed (sum of counts), hold/edge tasks (count + total seconds)
- Discovered cards, action cards triggered (per type)
- Max pixelate level reached
- Win check: roll, chance, multiplier, wheel result (**[v2]** no roll; chance breakdown instead)
- **[v2]** Performer + collected count + reached tiers, detours + converted cards, revisit conversions, goal drifts, stroke tier usage, forced reversals, action pool (definition ids)
- Outcome: `success` | `interrupted` | `no_result` | `denied` | `ended_early` | `mistress_says_no`

History screen: table of past sessions (sortable), plus summary (sessions, win rate, average discovered cards, current streak).

---

## 18. Translation System

- All UI text uses abstract keys (e.g. `task.default`, `effect.pixelate.name`, `goal.field`, `action.edge_and_hold.description`).
- **v1 ships one pack only: English, `locales/en-nsfw.json`.** No SFW pack and no other languages for now; the architecture keeps packs swappable.
- Config: `"languagePack": "en-nsfw"`.
- **[RULE]** No hardcoded user-facing strings in components. A dev check (script or ESLint rule) reports keys used in code but missing in the pack, and unused keys.
- Switching the pack is possible at runtime (i18next `changeLanguage`) – no restart required.
- Interpolation for counts: `"task.count": "Perform {{count}} tasks"`.

---

## 19. Privacy & Safety

- **Pause / Neutral Screen:** button plus global hotkey (`default Ctrl+Shift+Space`, configurable, displayed in Windows notation). Instantly replaces the entire window with a neutral screen ("Chance Runner · Paused", no images, no game data), stops all media playback and sounds, and freezes running countdowns. Unpausing requires a click or the hotkey again.
- Optional: hotkey also minimizes the window.
- Window title and taskbar name stay neutral ("Chance Runner").
- No thumbnails are written to the OS cache; thumbnails are generated in memory only.
- Optional admin PIN.

---

## 20. Data Model (TypeScript)

> Source of truth in code: `src/shared/session/types.ts` and `src/shared/content.ts`. Differences to the sketch below: `ActionConfig` has no `group` (derived from the id) and `maxPerSession: number | null`; `SessionState` additionally stores `sessionIndex`, `startField` and `initialTaskCount`.

```ts
type Group = 'good' | 'bad';
type FolderRole = 'content' | 'action';
type ActionId =
  | 'clearing_edges'
  | 'good_fairy'
  | 'decision_maker'
  | 'cleaning_lady'
  | 'hail_mary'
  | 'switcheroo'
  | 'pixelate'
  | 'splatter'
  | 'squeeze_task'
  | 'edge_and_hold'
  | 'double_trouble'
  | 'mistress_says_no'
  | 'guessing_game'
  | 'goal_teleport'
  | 'u_turn'
  | 'moving_day'
  | 'highperformer'
  | 'bad_luck'
  | 'take_it_slow'
  | 'speed_it_up';

interface FolderConfig {
  id: string;
  path: string;
  displayName: string;
  group: Group;
  role: FolderRole;
  enabled: boolean;
  selectionWeight: number;
  shareWeight: number;
  taskRange: [number, number];
  allowedActions: ActionId[] | null;
  unmaskedEffectBehavior: 'full' | 'none';
  minImages: number;
}

interface ActionConfig {
  id: ActionId;
  group: Group;
  enabled: boolean;
  weight: number;
  minPerSession: number;
  maxPerSession: number;
  sessionChance?: number; // 0..1
  requires?: ActionId[]; // any of
  params: Record<string, number | [number, number]>;
}

interface Card {
  field: number; // 1..100
  kind: 'normal' | 'action' | 'goal';
  group?: Group;
  folderId?: string;
  imageHash?: string;
  taskCount?: number; // normal cards
  action?: ActionId; // action cards
  actionConsumed?: boolean;
  discovered: boolean;
  splatterSeed?: number;
}

interface ActiveEffect {
  id: string;
  type:
    | 'double_trouble'
    | 'pace_slow'
    | 'pace_fast'
    | 'u_turn'
    | 'pixelate'
    | 'splatter'
    | 'success_multiplier'
    | 'shield';
  remainingRounds?: number;
  value?: number; // multiplier, pixel level, blocked direction (-1/1)
}

interface SessionState {
  id: string;
  seed: number;
  rngState: number;
  startedAt: string;
  goalValue: number;
  goalField: number;
  position: number;
  categories: { good: string[]; bad: string[] };
  activeActionFolders: { good: string | null; bad: string | null }; // null = all enabled action folders
  cards: Card[]; // length 100, index = field - 1
  effects: ActiveEffect[];
  round: number;
  phase:
    | 'initial_task'
    | 'resolve_card'
    | 'roll'
    | 'choose_direction'
    | 'moving'
    | 'win_check'
    | 'final_wheel'
    | 'outcome'
    | 'ended';
  lastRoll?: number;
  stats: SessionStats;
}

interface MaskRegion {
  id: string;
  shape: 'rect' | 'ellipse' | 'polygon';
  // normalized 0..1 coordinates
  rect?: { x: number; y: number; w: number; h: number };
  points?: { x: number; y: number }[];
  effects: ('pixelate' | 'splatter')[];
  feather: number; // 0..0.1 of short side
}

interface ImageMask {
  imageHash: string;
  status: 'unreviewed' | 'masked' | 'no_regions';
  regions: MaskRegion[];
  updatedAt: string;
}
```

**[v2] Model changes (sketch):**

```ts
type FolderRole = 'content' | 'performer'; // 'action' removed
type ActionType = ActionId | 'redemption'; // resolver types

interface ActionCardDefinition {
  id: string; // slug for built-ins, UUID for user cards
  type: ActionType;
  builtIn: boolean;
  name: string | null; // null = i18n key action.<type>.name
  description: string | null;
  image: ActionArtImage | null; // action-art store: { hash, fileName, mimeType, kind }
  enabled: boolean;
  weight: number;
  minPerSession: number;
  maxPerSession: number | null;
  sessionChance?: number;
  requires?: ActionType[];
  params: Record<string, number | [number, number]>;
}

interface Card {
  // … as above, plus:
  kind: 'normal' | 'action' | 'goal' | 'collectible';
  actionDefinitionId?: string; // replaces `action` as source of truth; type derived from the definition
  collected?: boolean; // collectibles
}

interface SessionState {
  // … as above, plus:
  schemaVersion: number;
  performerFolderId: string | null;
  actionPool: string[]; // definition ids
  collected: number;
  reachedTiers: number[];
  detourConversions: number;
  nextDice: number; // set by the stroke tier of the last normal card
  forcedDirection: 'left' | 'right' | null; // forced reversal for the current roll
  lastForcedRound: number | null; // never two forced reversals in a row
  lastRoll: number | null; // sum (or chosen value)
  lastDice: number[]; // 1–3 dice, empty for a chosen value
  // phase 'win_check' is removed: landing on the goal starts 'final_wheel'
}
```

---

## 21. Storage Layout

All files live in `app.getPath('userData')` (e.g. `%APPDATA%/ChanceRunner/`):

| File                   | Contents                                                                    |
| ---------------------- | --------------------------------------------------------------------------- |
| `config.json`          | Folders, actions, session rules, effects, penalties, language pack, hotkeys |
| `progression.json`     | §15                                                                         |
| `session-current.json` | Active session (autosave)                                                   |
| `history.json`         | Past session stats                                                          |
| `masks.json`           | ImageMask records keyed by hash                                             |
| `image-index.json`     | Cached scan (path, size, mtime, hash, dimensions)                           |
| `action-art/`          | **[v2]** Copied action card images, file name = content hash + extension    |

**[RULE]** Writes are atomic (write to temp file, then rename). Every file has a `schemaVersion` field; a migration function runs on load.

---

## 22. Technical Notes

- **Electron security:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`; the renderer talks to the main process only through a typed preload API (`window.api.*`).
- **Local image loading:** register a custom protocol (e.g. `cr-media://<hash>`) via `protocol.handle` that serves only files from registered folders. Do not use `file://` in the renderer.
- **Canvas effects:** see §12.4; heavy work (hashing, thumbnail generation) runs in the main process or a worker, never blocking the UI.
- **RNG:** one seeded PRNG for all game randomness; its state is saved in the session so reloads continue deterministically.
- **Animations:** Framer Motion for dice, card movement, card flips and wheels. Wheels use a precomputed target angle with an easing curve so the result is decided before the animation.
- **Performance:** ring previews and gallery thumbnails are lazy-loaded; media library grid is virtualized.

---

## 23. Implementation Phases

See [ROADMAP.md](ROADMAP.md) for work packages, order and milestones.

---

## 24. Resolved Design Decisions

| Topic                                | Decision                                                                                         | Section       |
| ------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------- |
| `Denied` on the final wheel          | Neutral outcome: no penalty, no progression change, loss streak unchanged                        | §13.2, §14.3  |
| Hint about undiscovered action cards | Console total + per direction on the buttons; format configurable, default `split_by_side`       | §7.4          |
| `switcheroo` scope                   | Can swap content categories **and** action folder images; action types are never changed         | §10.3         |
| Track visualization                  | 100-segment ring replaces the horizontal card strip; thumbnails via hover and discovered gallery | §7.1          |
| Window                               | Min 1280×720, fullscreen by default (F11 toggles); single monitor                                | design-system |
| Language                             | English only, one pack (`en-nsfw`)                                                               | §18           |
| Input                                | Full keyboard control                                                                            | §7.2          |
| Sound                                | Optional cues, off by default                                                                    | §7.5          |
| Goal landing                         | Exact landing only; passing over has no effect                                                   | §8.2          |
| Discovered                           | Landed fields + start field; passed fields don't count                                           | §3, §8.2      |
| Revisiting a normal card             | Same task, new random count                                                                      | §6.6          |
| Shield                               | Blocks all bad actions except `mistress_says_no`                                                 | §11           |
| Task counting                        | "Done" only, no rep counter                                                                      | §9.1          |
| Pace effects                         | Text only in v1                                                                                  | §10.2         |
| Consumed action card                 | Same group, count 6–20, random image from active content category                                | §9.2          |
| Guessing Game                        | Two different numbers, one die, either matches                                                   | §10.2         |
| Initial task count                   | Own configurable range, separate from goal wheel                                                 | §6.1          |
| Highperformer                        | Confirm only                                                                                     | §10.2         |
| Direction buttons                    | Neutral styling, no recommendation                                                               | §7.2          |
| Action hint default                  | `split_by_side`                                                                                  | §7.4          |
| Media formats                        | jpg/png/webp/gif/webm/mp4; animated ones autoplay + loop, muted                                  | §5.3          |
| Splatter textures                    | Generated placeholders, replaceable later                                                        | §12.4         |
| Admin PIN                            | Later                                                                                            | §16           |
| Mask editor                          | Own milestone after core game                                                                    | §12           |

### 24.1 Revision 3 – Gameplay v2 (2026-09-30)

| Topic                | Decision                                                                                                                             | Section      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------ |
| Initial task         | Count = start wheel value N, no own range                                                                                            | §6.1         |
| Category variety     | 2–3 categories per group (range), mixed by shuffle; zones as later option                                                            | §6.2         |
| Bad → good           | Detour (distance to goal grows) converts 2 undiscovered bad cards immediately; optional cap; plus `redemption` action                | §8.4, §10.1  |
| Undiscovered counter | Console shows undiscovered good · bad normal cards                                                                                   | §7.1         |
| Release chance       | Win-check die removed; `discovered × 0.4 %` (all cards equal) × multiplier + bonuses, live in the stats                              | §14.1        |
| Hold Position        | Countdown capped at 60 s                                                                                                             | §14.2        |
| Revisits             | Every revisit turns the field into a bad card with a new image; collectibles, still-triggering actions, goal exempt                  | §8.5         |
| Actions              | Uniquely defined action cards (type + params + unique image), variants possible; action folders removed                              | §10.4        |
| Action images        | Picked in admin, copied into `action-art/`, hash-addressed, unique per card                                                          | §10.4        |
| Session composition  | Rule-based random: categories + performer + action pool (8–10 definitions); shown in a session briefing                              | §6.2, §6.4   |
| Performers           | One per session, 6–8 collectibles, known from the start, progress in console; tiers 3/4/5; revisit = stroke task 10–25 without bonus | §6.2.1, §9.4 |
| Goal hopping         | Overshoot moves the goal to an undiscovered field 3–8 away                                                                           | §8.8         |
| Stroke tier          | Normal cards: ×1/×2/×3 task → 1/2/3 dice next move                                                                                   | §8.6         |
| Forced reversal      | 10 % per roll: only the reverse of the last direction allowed                                                                        | §8.7         |
| Old saved sessions   | Discarded without scoring after the schema change                                                                                    | §8.3         |

### 24.2 Implementation Notes (AP9)

- **Code:** generator `src/shared/session/` (`selectActionPool`, `assignActionSlots`, `generateSession`); engine `engine/boardChanges.ts` (detour, goal drift, collectibles), `engine/releaseChance.ts`, `engine/reduce.ts` (round order, stroke tiers, forced reversal); main `config/actionCardsConfig.ts`, `config/actionCardService.ts`, `content/actionArtStore.ts`.
- **Stroke tier:** sent with the task's `confirm` event (`{ type: 'confirm', tier }`); only tasks with `tierable: true` accept it. The start card counts as a normal card (tierable).
- **Revisit markers:** task steps carry `revisit: 'converted'` (field turned bad) or `'collectible'` (collected card, plain task) so the UI can explain it.
- **Notice order:** drift and detour notices are queued **before** the landed card's steps; their title is always the notice text.
- **Release chance rounding:** `floor(x + 1e-9)`, so floating point noise (0.4 × 35 = 14.000000000000002) never costs a percent.
- **Action images:** `cr-media://` serves library media first, then images assigned to a card from `userData/action-art/`; replaced or cleared images are deleted from the store when no card uses them.
- **Config:** `config.json` v3; missing built-in cards are added on load (e.g. `redemption` after an update); an image assigned to two cards stays on the first one only.
- **Session file:** schema v2; a v1 file migrates to a marker and is discarded unscored, the start screen shows a notice once.
- **Balancing:** simulation results and the open tuning question are in ROADMAP AP9.

---

## 25. Later / Parking Lot

- Pace metronome (visual pulse + optional click) for Take it Slow / Speed it Up.
- Admin PIN.
- Additional language packs (SFW, German).
- Category zones on the ring (§6.2).
- Session composition by draft (player picks categories) or deck presets.

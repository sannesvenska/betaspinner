# Chance Runner – Game Design Document

> **Purpose of this document:** Single source of truth for implementing Chance Runner with Claude Code.
> Sections marked **[RULE]** are binding implementation rules. Values marked `default` are configurable in the admin area.
> All user-facing text is referenced via i18n keys; names used here (e.g. action names) are **internal IDs**, not display labels.
> Visual rules live in [design-system.md](design-system.md); work packages in [ROADMAP.md](ROADMAP.md).
> **Revision 2 (2026-09-29):** Q&A decisions merged – see §24.

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

| Term              | Meaning                                                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Field**         | One of the 100 positions on the circular track (numbered 1–100, wraps 100 → 1). Displayed as a segment of the **ring**. |
| **Discovered**    | A field the player has **landed on** (or the start field). Fields passed over during movement stay undiscovered.        |
| **Card**          | The content placed on a field: an image plus either a task (normal card) or an action (action card).                    |
| **Goal Field**    | The field the player must land on to trigger the win check. Has no image task.                                          |
| **Category**      | A content folder of images, belonging to the `good` or `bad` group.                                                     |
| **Action Folder** | A folder tagged as action source. Its images are used exclusively as visuals for action cards.                          |
| **Round**         | One complete move: roll → choose direction → move → resolve landed card. Effect durations count in rounds.              |
| **Effect**        | A temporary or session-long modifier (e.g. Double Trouble, Pixelate).                                                   |
| **Task**          | A physical instruction with a count or duration that the player confirms with a button.                                 |
| **Penalty Field** | A red segment on the start wheel that blocks starting a session for a time.                                             |
| **Progression**   | Persistent values carried between sessions (good chance, penalty fields, blocked effects, loss streak).                 |

---

## 4. Core Loop (Summary)

1. Open app → penalty decay is applied → start wheel shows current penalty fields.
2. Spin start wheel → Goal Field value N (or penalty lockout if a red field is hit).
3. Perform the initial task (count from its own range, §6.1) → confirm.
4. Session is generated (categories, cards, action slots, start position).
5. Repeat rounds until the Goal Field is reached or the session ends (End Early / Mistress Says No).
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

### 5.2 Folder Properties

| Property                 | Type                  | Default     | Description                                                                                                                |
| ------------------------ | --------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------- |
| `id`                     | string                | generated   | Stable ID (UUID).                                                                                                          |
| `path`                   | string                | –           | Absolute path on disk.                                                                                                     |
| `displayName`            | string                | folder name | Shown in admin and on the category reveal screen.                                                                          |
| `group`                  | `good` \| `bad`       | –           |                                                                                                                            |
| `role`                   | `content` \| `action` | `content`   |                                                                                                                            |
| `enabled`                | boolean               | true        | Disabled folders are ignored entirely.                                                                                     |
| `selectionWeight`        | number (1–100)        | 50          | How likely this category is picked for a session (content only).                                                           |
| `shareWeight`            | number (1–100)        | 50          | Image share among the selected categories of the same group (only relevant if more than one category per group is picked). |
| `taskRange`              | [min, max]            | [6, 18]     | Task count range for normal cards from this folder.                                                                        |
| `allowedActions`         | ActionId[] \| null    | null        | Action folders only: restrict which actions may use this folder's images. `null` = any action of the matching group.       |
| `unmaskedEffectBehavior` | `full` \| `none`      | `full`      | How visual effects apply to images without a defined mask (see §12).                                                       |
| `minImages`              | number                | 5           | Folder is only eligible for selection if it contains at least this many images.                                            |

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

### 6.5 Placement on the Track

Action cards should be spread across the whole track – not clustered and not predictable.

**[RULE] Stratified placement:**

1. Build the list of eligible fields: all fields except Goal, Start, and **protected zones** (`startProtection default ±2`, `goalProtection default ±2`).
2. Divide the circular list into A equal segments.
3. In each segment place one action card at a random position.
4. Enforce `minActionGap` (`default 2` – no two action cards directly adjacent). If violated, shift within the segment; after 20 failed attempts, relax the gap for that card.
5. Shuffle which action (from §6.4) lands in which slot.

All remaining fields become normal cards; good/bad normal cards are distributed by a plain shuffle.

### 6.6 Image Assignment

**Normal cards:**

- Images are drawn from the selected categories of the matching group, split by `shareWeight` if more than one category is active.
- **[RULE]** No image repeats within a session (shuffle bag per category). Only if a category runs out is the bag refilled.
- **Cross-session recency:** images shown in the last `imageRecencySessions` sessions (`default 3`) are placed at the end of the bag, so fresh images are preferred.

**Action cards:**

- The action type is decided first; then an image is drawn from action folders of the matching group whose `allowedActions` includes this action (or is `null`).
- Fallback: any action folder of the group → built-in neutral action design.

**Task counts:**

- Normal cards roll their task count from their folder's `taskRange` **at generation time** and store it on the card (so reloading a session does not change it). Modifiers (e.g. Double Trouble) are applied at display time.
- **[RULE] Revisits:** landing again on an already discovered normal card shows the same task with a **new** count, rolled from the same `taskRange` with the session RNG and stored on the card before display (reload-safe).

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

### 7.2 Controls

**[RULE]** Every control is reachable by keyboard; key hints are printed on the buttons.

| Control                                                            | Mouse                         | Keyboard                      |
| ------------------------------------------------------------------ | ----------------------------- | ----------------------------- |
| Primary action of the phase (Done / Roll / Spin / Start / Confirm) | button                        | `Space` or `Enter`            |
| Direction left / right                                             | direction buttons             | `←` / `→`                     |
| Number choice (Decision Maker, Guessing Game)                      | number buttons                | `1`–`6`                       |
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

### 8.3 Resume

**[RULE]** The session is autosaved after every state change. If the app is closed mid-session, the next start offers "Resume session" (or "End Early", which counts as a loss).

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

---

## 10. Action Catalog

All actions are identified by ID; labels and descriptions come from i18n keys `action.<id>.name` / `action.<id>.description`.

### 10.1 Good Actions

| ID               | Default weight | Behavior                                                                                                                                                                                                                                                                                           | Params (defaults)                 |
| ---------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `clearing_edges` | 20             | Player performs a Hold Position task; on completion, the player removes one active negative effect of their choice.                                                                                                                                                                                | hold duration 15–35 s             |
| `good_fairy`     | 15             | Player removes one active negative effect of their choice for free. If none are active, it grants a "shield" that blocks the next bad action (`shieldEnabled default true`).                                                                                                                       | –                                 |
| `decision_maker` | 20             | Player chooses the step count (1–6) for the next move instead of rolling.                                                                                                                                                                                                                          | –                                 |
| `cleaning_lady`  | 15             | Removes all visual effects (pixelate level to 0, all splatters).                                                                                                                                                                                                                                   | requires `pixelate` or `splatter` |
| `hail_mary`      | 10             | Grants a success multiplier for the win check.                                                                                                                                                                                                                                                     | range 1.5–3.0, step 0.5           |
| `switcheroo`     | 10             | Player first chooses a **target pool** (good category, bad category, good action images, bad action images), then picks one of 3 random alternative folders of that pool. All undiscovered cards of that pool get new images from the chosen folder. Discovered cards remain unchanged. See §10.3. | alternatives 3                    |

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

**Safety zones [RULE]:** for `goal_teleport` and `moving_day`, the target field must be undiscovered and at least `safetyZone` fields (shorter distance) away from both the current position and the current Goal Field. If no such field exists, reduce the zone by 2 until a valid field is found; if still none, the action only performs its task.

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

### 14.2 Final Wheel

- Wheel with a white area (= `finalChance` %) and a red area (rest).
- "Start Task" → wheel starts spinning.
- Button changes to "Hold Position"; pressing it starts a countdown equal to the discovered count (in seconds). The wheel decelerates so that it stops exactly at 0.
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

## 15. Persistent Progression

Stored in `progression.json`:

- `goodChance` (0.20–0.70)
- `penaltyFields` (list of wheel positions) and `lastDecayAt`
- `lossStreak`
- `lockoutUntil` (timestamp or null)
- `blockedActionsNextSession` (ActionId[], cleared after use)
- `categoryUsage` (folderId → lastUsedSessionIndex, timesUsed)
- `imageRecency` (imageHash → lastSessionIndex)
- `sessionCounter`

---

## 16. Admin & Configuration

Admin is a separate route, reachable from the start screen. (Admin PIN: later, not in v1.)

**Expected library size:** start with 3–4 good and 3–4 bad content folders; later 20–30 folders with 100–200 media files each (~6,000 files). Scanning, hashing and grids must stay responsive at that size.

**First-run:** with no folders registered, the start screen shows an empty state that leads into a setup wizard (add folder → group → role → scan).

| Screen                      | Contents                                                                                                                                                                                                        |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Folders**                 | Add/remove folders, group, role, enabled, `selectionWeight`, `shareWeight`, `taskRange`, `allowedActions`, `unmaskedEffectBehavior`, image count, rescan.                                                       |
| **Media Library**           | Thumbnail review and Mask Editor (§12.2–12.3).                                                                                                                                                                  |
| **Actions**                 | Per action: enabled, weight, min/max per session, sessionChance, requires, params. Live preview: "expected action cards per session" and a simulated distribution (run the generator 1,000× with random seeds). |
| **Session Rules**           | Categories per session, cooldown, freshness, action card count range, protected zones, gap, start distance, animation speed, retrigger mode.                                                                    |
| **Visual Effects**          | Pixelation block sizes, splatter count range, splatter textures.                                                                                                                                                |
| **Penalties & Progression** | Step, cap, decay, lockout duration, good chance bounds/step; buttons to reset progression.                                                                                                                      |
| **Backup**                  | Export/import of config, progression, masks and history as one ZIP/JSON bundle (image files excluded; folder paths are remapped on import if missing).                                                          |

---

## 17. Stats & History

Per session:

- Date, duration, seed
- Goal value N, selected categories
- Rounds played, total dice rolls
- Total tasks performed (sum of counts), hold/edge tasks (count + total seconds)
- Discovered cards, action cards triggered (per type)
- Max pixelate level reached
- Win check: roll, chance, multiplier, wheel result
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

---

## 25. Later / Parking Lot

- Pace metronome (visual pulse + optional click) for Take it Slow / Speed it Up.
- Admin PIN.
- Additional language packs (SFW, German).

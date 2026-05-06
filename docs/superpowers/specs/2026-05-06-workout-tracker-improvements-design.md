# Workout Tracker Improvements — Design Spec
**Date:** 2026-05-06
**File:** `Claude/WorkoutTracker/gym-plan.html`

---

## Overview

Nine targeted improvements to the existing gym tracker app. All changes are contained within `gym-plan.html`. No new files, no new dependencies. Existing localStorage key (`pgymplan_v5`), Sheets sync, and all other features are untouched unless explicitly noted.

---

## 1. Exercise Name Cleanup

Remove parenthetical qualifiers from all exercise `name` fields. The qualifying detail already lives in the `tip` field — it should not duplicate into the name.

**Changes:**

| ID | Old Name | New Name |
|---|---|---|
| d2_cable_row | Seated Cable Row (V-bar, narrow) | Cable Row |
| d2_straight_arm_pulldown | Straight-Arm Pulldown (cable) | Straight-Arm Pulldown |
| d2_face_pull | Face Pulls (cable) | Face Pulls |
| d4_face_pull | Face Pulls (cable) | Face Pulls |
| d3_hip_thrust | Hip Thrust (barbell or machine) | Hip Thrust |
| d3_leg_curl | Leg Curl Machine | Leg Curl |
| d2_db_row | Single-Arm Dumbbell Row | DB Row |
| d5_skull_crushers | Skull Crushers (light EZ bar) | Skull Crushers |
| d5_cable_curl | Cable Curl (straight bar or rope) | Cable Curl |
| d1_oh_tricep | Overhead Tricep Extension (cable) | OHT Extension |
| d5_oh_tricep | Overhead Tricep Extension (cable) | OHT Extension |
| d4_core_circuit | Plank / Dead Bug / Bird Dog | Core Circuit |

---

## 2. Barbell RDL in Intensification (Wednesday)

`d3_db_rdl` gets a `nameByPhase` field, transitioning from dumbbell to barbell in intensification. Dumbbells cap loading at ~50 lbs/hand; barbell allows proper progressive overload for a compound anchor.

```js
{ id:"d3_db_rdl",
  nameByPhase:{ accumulation:"Dumbbell RDL", deload:"Dumbbell RDL", intensification:"Barbell RDL" },
  type:"compound", isDumbbell:true,
  ...
}
```

The `isDumbbell` flag stays true (doesn't affect rendering in the current codebase). Tip field gets a `tipByPhase` addition (see §4).

---

## 3. Intensification Sets Grid — 5 Columns for Compounds

### Problem
`getSetsForExercise()` already returns "4-5 × 5-6" for compounds in intensification, but `buildCard()` always renders exactly 3 set input columns. The UI contradicts the program.

### Solution
`buildCard()` reads the current phase and exercise type to determine column count:

| Phase | Exercise Type | Columns | Set 5 Label |
|---|---|---|---|
| accumulation | any | 3 | — |
| deload | any | 3 | — |
| intensification | compound | 5 | "OPT" |
| intensification | isolation / noWeight | 3 | — |

The 5th column is rendered with a label of "OPT" (same visual treatment as the Friday "opt" label) to signal it's optional — 4 sets is the minimum, 5 is the ceiling.

`buildCard()` receives `phase` (already passed after Task 8 of the previous plan). No new parameters needed.

The sets grid uses `grid-template-columns: repeat(N, 1fr)` where N is computed per exercise per phase.

### Existing logged data
The Sheets sync already sends `set1`, `set2`, `set3`. When logging a 4th or 5th set, the params extend to `set4` and `set5`. The Apps Script `doGet()` should be reviewed to confirm it accepts extra set params without erroring — if it ignores unknown params it's fine as-is.

---

## 4. Intensification Weight Suggestion (in Tip Panel)

### Where it appears
Only inside the expanded exercise detail panel (the collapsible section opened by the info button). Never on the card surface. Only shown when `phase === 'intensification'`.

### How it's computed
From the `prevWeight` already fetched and displayed on the card (the most recent logged max set for that exercise):

```
compound:  round(prevMax * 1.13 / 5) * 5   → nearest 5 lbs
isolation: round(prevMax * 1.07 / 5) * 5   → nearest 5 lbs
```

If no prev weight exists (new exercise), suggestion is suppressed — no placeholder shown.

### Where it renders
A new block inside `.exercise-detail`, above the tip text, when in intensification:

```
INTENSIFICATION TARGET
~125 lbs — based on your recent lifts
```

Styled with `DM Mono`, muted color, small label above the value. Does not replace the tip — it prepends it.

### tipByPhase (optional enhancement)
If tip content meaningfully differs by phase (e.g., Barbell RDL has different setup notes than DB RDL), a `tipByPhase` field can be added to individual exercises. Format mirrors `nameByPhase`:
```js
tipByPhase: { accumulation: "...", intensification: "...", deload: "..." }
```
`getExerciseName()` pattern is followed: fall back to `tip` if phase key missing.

Only the d3 RDL anchor exercise needs this in the initial implementation (DB setup notes vs barbell setup notes differ meaningfully).

---

## 5. Wrap Block Date Fix

### Problem
`saveWorkout()` stamps the entry with `new Date()` (today). If you're browsing a past week's workout or logging after midnight, the Sheets entry gets the wrong date.

### Solution
`saveWorkout(dayId)` receives a second parameter `dateOverride`. Call sites pass the date of the currently viewed panel (derived from `viewedDate` + the panel's day-of-week offset). If `dateOverride` is present, use it for `dateStr`; otherwise fall back to `new Date()`.

`buildPanels()` passes the correct date when constructing the "Save Workout" button's onclick.

---

## 6. "Next Workout" Navigation Fix

### Problem
`showNextWorkout()` always jumps to next Monday, even when the next training day is a weekday in the current week.

### Solution
Replace the Monday-jump logic with a forward scan:

```
Start from tomorrow (or next day after today).
For each day forward (up to 14 days):
  - Skip weekends
  - Skip EXCEPTION_DATES rest days
  - If a valid training day: navigate to it and stop.
If nothing found in 14 days: fall back to next Monday.
```

The scan respects `EXCEPTION_DATES` and weekends, so it correctly handles mid-week rest exceptions.

---

## 7. Auto-Fill Set Bubbles on Save

### Problem
The individual set check circles (`.set-check-btn`) are independent of saving weights. After saving 3 sets of weights, the bubbles stay empty.

### Solution
In `saveSets(exId, dayId)`, after a successful save, call `autoFillSetChecks(exId, numSets)` which programmatically triggers `toggleSetCheck(exId, i)` for each set index up to `numSets`, but only if that check is not already marked done (idempotent).

`numSets` is determined from how many set inputs had a non-empty value at save time.

---

## 8. PR Badge on Prev-Weight Hint

### When it shows
After saving weights, if the max of (set1, set2, set3, set4, set5) exceeds the all-time best for that exercise fetched from Sheets history, a "PR" badge appears adjacent to the prev-weight hint on the card.

### Implementation
- `loadDayHistory()` already fetches recent exercise history from Sheets. The history response includes per-session set weights.
- Compute all-time max from the history rows when history loads. Store in a `_prMap` object keyed by exercise name.
- In `saveSets()`, after save, compare new max against `_prMap[exName]`. If greater, inject a PR badge element into the card's `.exercise-meta` row.
- Badge: small red pill, `font-family: DM Mono`, text "PR", styled like `.exercise-sets` but with a green background.
- Badge persists for the session (not stored to localStorage — it's derived data).

---

## 9. Always Open Today's Workout on Load

### Change
In the init IIFE, remove the branch that restores non-workout tabs (`activity`, `stats`, `macros`, `recovery`) from `pgymplan_lastday`. Always resolve to today's workout (or rest screen if today is a rest day).

```js
// Remove this branch:
} else if(lastDay && ['activity','stats','macros','recovery'].indexOf(lastDay)!==-1){
    showDay(lastDay);
}
```

`pgymplan_lastday` is still written on tab navigation (for potential future use), but never read for non-workout tabs on init.

---

## Preserved Unchanged
- `pgymplan_v5` localStorage key and all exercise history
- All Sheets sync (`SHEETS_URL`), pending queue
- Streak counter, all charts, heatmap, PR table in Stats panel
- Activity panel, Macros panel, Recovery panel
- Progressive overload nudge logic
- Phase schedule, `getProgramState()`, week nav pills, deload/week banners
- Cardio finisher logging (type pills, duration, history)

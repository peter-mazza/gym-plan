# Workout Tracker Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix data integrity bugs (missed Sheets syncs, stale checkmarks), UI consistency issues (warm-up checkmark, cardio done button, wrap-up logged state, tips clarity), and stats readability (day labels, week dates, heatmap legend).

**Architecture:** Single-file HTML app (`gym-plan.html`). All changes are JavaScript/CSS edits within that one file. No build system. Verify each task by opening the file in a browser.

**Tech Stack:** Vanilla JS, localStorage, Google Sheets via Apps Script (no-cors GET), Chart.js 4.4.1

---

## Root cause notes (read first)

- **Missed Sheets syncs:** `saveWeight` uses `fetch` with `mode:"no-cors"`. Responses are opaque — the `catch` only fires on true network error. If the Apps Script is slow or fails internally, the app shows "Saved to Sheets" regardless. No retry or queue exists.
- **Stale checkmarks:** `data.checks` is a flat key/value store with no week scope. It never auto-clears — user must manually reset each day.
- **Cardio done button:** Uses `.cardio-done-btn` (rectangular) instead of `.check-btn` (round circle). Different visual language from exercises.
- **Day type chart:** `buildDayTypeDistribution` groups by `r.day.split(" - ")[0]` which gives "DAY 1", "DAY 2". No human-readable mapping.
- **Consistency chart:** Labels are ISO week keys ("2026-W06") — `weekDateRange()` exists but isn't used here.
- **Heatmap:** Two colors (yellow = gym, orange = activity) with no legend.

---

## File Structure

Only one file changes:
- **Modify:** `gym-plan.html`

Key line references:
- CSS: lines 8-157
- DAYS/EXERCISES data: lines 171-344
- loadData/saveData: lines 348-349
- buildCard: lines 596-778
- buildPanels (warm-up ~412, finisher ~432, wrap-up ~465): lines 382-488
- saveWeight (Sheets sync): lines 982-1074
- saveWorkout: lines 1077-1130
- buildDayTypeDistribution: lines 1398-1416
- buildConsistencyChart: lines 1439-1461
- buildHeatmap: lines 1312-1349
- loadCardioPersist / loadWrapPersist: lines 1797-1841
- Init block: lines 1861-1876

---

## Task 1: Auto-clear checkmarks when a new week starts

**Problem:** `data.checks` and `data.setBChecks` have no week scope. They persist forever.

**Files:**
- Modify: `gym-plan.html` — after saveData definition (~line 349) and init block (~line 1866)

- [ ] **Step 1: Add `clearStaleChecks()` function after `saveData` (after line 349)**

```javascript
function clearStaleChecks(){
  var data = loadData();
  var curWeek = getPacificWeekKey();
  if(data.checksWeekKey && data.checksWeekKey !== curWeek){
    data.checks = {};
    data.setBChecks = {};
    data.warmupChecks = {};
  }
  data.checksWeekKey = curWeek;
  saveData(data);
}
```

NOTE: `getPacificWeekKey` is defined at line 1206. This function must be called from the init block (after all functions are defined), not at script parse time.

- [ ] **Step 2: Call `clearStaleChecks()` as the first line of the init IIFE (~line 1866)**

```javascript
(function(){
  clearStaleChecks(); // ADD THIS FIRST
  try{
    var lastDay = localStorage.getItem("pgymplan_lastday");
    ...
```

- [ ] **Step 3: Verify in browser**

Open DevTools console and run:
```javascript
var d = JSON.parse(localStorage.getItem('pgymplan_v5'));
d.checksWeekKey = '2025-W01';
d.checks = {d1_plank: true};
localStorage.setItem('pgymplan_v5', JSON.stringify(d));
location.reload();
```
Expected: plank checkmark is gone, `checksWeekKey` is the current week.

---

## Task 2: Sheets sync reliability — pending queue

**Problem:** No retry when Sheets sync fails silently or network drops during save.

**Files:**
- Modify: `gym-plan.html` — add queue helpers after saveData (~line 349), update saveWeight (~line 1067), add badge to header HTML (~line 161), call flushPending in init

- [ ] **Step 1: Add pending queue helpers after saveData**

```javascript
var PENDING_KEY = "pgymplan_pending_v1";
function loadPending(){ try{ return JSON.parse(localStorage.getItem(PENDING_KEY))||[]; }catch(e){ return []; } }
function savePending(q){ try{ localStorage.setItem(PENDING_KEY, JSON.stringify(q)); }catch(e){} }
function queuePending(params){
  var q = loadPending();
  q.push({params:params, ts:Date.now()});
  savePending(q);
}
function dequeuePending(params){
  savePending(loadPending().filter(function(item){ return item.params !== params; }));
}
function updatePendingIndicator(){
  var q = loadPending();
  var el = document.getElementById("pending-sync-badge");
  if(el){ el.style.display = q.length > 0 ? "block" : "none"; el.textContent = q.length + " exercise(s) pending sync"; }
}
async function flushPending(){
  var q = loadPending();
  if(q.length === 0) return;
  var remaining = [];
  for(var i=0; i<q.length; i++){
    try{
      await fetch(SHEETS_URL + "?" + q[i].params, {method:"GET", mode:"no-cors"});
    }catch(e){
      remaining.push(q[i]);
    }
  }
  savePending(remaining);
  updatePendingIndicator();
}
```

- [ ] **Step 2: Add pending badge to static HTML, inside `<header>` block (~line 161)**

```html
<header>
  <h1>PETER'S GYM PLAN</h1>
  <p>4-day split · Southrac · 2026</p>
  <div id="pending-sync-badge" style="display:none;background:var(--accent2);color:white;font-size:11px;font-weight:600;padding:3px 0;border-radius:4px;margin-top:4px;text-align:center;"></div>
</header>
```

- [ ] **Step 3: Update the Sheets POST block in `saveWeight` (~lines 1067-1073)**

Replace:
```javascript
// Post to Sheets
try{
  var exName = getExName(exId);
  var params = "type=exercise&...";
  await fetch(SHEETS_URL + "?" + params, {method:"GET", mode:"no-cors"});
  showToast("Saved to Sheets");
}catch(e){ showToast("Saved locally", "var(--accent2)"); }
```

With:
```javascript
// Post to Sheets with queue
var exName = getExName(exId);
var params = "type=exercise&date=" + encodeURIComponent(dateStr) + "&day=" + encodeURIComponent(dayTitle) + "&exercise=" + encodeURIComponent(exName) + "&set1=" + encodeURIComponent(s1) + "&set2=" + encodeURIComponent(s2) + "&set3=" + encodeURIComponent(s3);
queuePending(params);
updatePendingIndicator();
try{
  await fetch(SHEETS_URL + "?" + params, {method:"GET", mode:"no-cors"});
  dequeuePending(params);
  showToast("Saved to Sheets");
}catch(e){
  showToast("Queued — will retry on next load", "var(--accent2)");
}
updatePendingIndicator();
```

- [ ] **Step 4: Call `flushPending()` in init IIFE, after `clearStaleChecks()`**

```javascript
(function(){
  clearStaleChecks();
  flushPending(); // retry any queued syncs from last session
  ...
```

- [ ] **Step 5: Verify**

In DevTools Network tab: save a set → confirm fetch fires. Then set offline mode (DevTools → Network → Offline), save another set → toast says "Queued". Re-enable network → reload → pending badge appears briefly then disappears as flush succeeds.

---

## Task 3: Warm-up checkmark

**Problem:** Warm-up block has no interactivity. User wants to mark it done.

**Files:**
- Modify: `gym-plan.html` — buildPanels warm-up section (~line 412), add toggleWarmup function, add restoreWarmupStates to renderAll

- [ ] **Step 1: Add `toggleWarmup` function (add after `resetDay` ~line 969)**

```javascript
function toggleWarmup(dayId){
  var data = loadData();
  if(!data.warmupChecks) data.warmupChecks = {};
  data.warmupChecks[dayId] = !data.warmupChecks[dayId];
  saveData(data);
  var isDone = data.warmupChecks[dayId];
  var btn = document.getElementById("warmup-check-" + dayId);
  var block = document.getElementById("warmup-block-" + dayId);
  if(btn){
    btn.className = "check-btn" + (isDone ? " done" : "");
    btn.textContent = isDone ? "\u2713" : "";
  }
  if(block){
    block.style.opacity = isDone ? "0.65" : "1";
    block.style.borderColor = isDone ? "var(--green)" : "var(--border)";
  }
}

function restoreWarmupStates(){
  var data = loadData();
  ["d1","d2","d3","d4","d5"].forEach(function(dayId){
    var isDone = !!(data.warmupChecks && data.warmupChecks[dayId]);
    var btn = document.getElementById("warmup-check-" + dayId);
    var block = document.getElementById("warmup-block-" + dayId);
    if(btn){ btn.className = "check-btn" + (isDone ? " done" : ""); btn.textContent = isDone ? "\u2713" : ""; }
    if(block){ block.style.opacity = isDone ? "0.65" : "1"; block.style.borderColor = isDone ? "var(--green)" : "var(--border)"; }
  });
}
```

- [ ] **Step 2: Update warm-up block HTML in `buildPanels` (~line 412-413)**

Replace:
```javascript
html += "<div class='warmup-block'><div class='w-title'>Incline Ramp (or substitute)</div><div class='warmup-item'>" + day.warmup + "</div></div>";
```

With:
```javascript
html += "<div class='warmup-block' id='warmup-block-" + day.id + "' style='display:flex;align-items:flex-start;gap:10px;'>";
html += "<button class='check-btn' id='warmup-check-" + day.id + "' onclick='toggleWarmup(\"" + day.id + "\")'></button>";
html += "<div style='flex:1;'><div class='w-title'>Incline Ramp (or substitute)</div><div class='warmup-item'>" + day.warmup + "</div></div>";
html += "</div>";
```

- [ ] **Step 3: Call `restoreWarmupStates()` at the end of `renderAll()` (~line 594)**

```javascript
function renderAll(){
  ...existing code...
  restoreWarmupStates(); // ADD at end
}
```

- [ ] **Step 4: Verify**

Open Day 1. Warm-up block should show a round circle on the left. Tap it — turns green, block fades. Reload — state persists. Run the week-clear test from Task 1 — warm-up check clears.

---

## Task 4: Cardio finisher done button — match exercise check style

**Problem:** Rectangular "Mark Done" button is visually inconsistent with round exercise checkmarks.

**Files:**
- Modify: `gym-plan.html` — finisher HTML in buildPanels (~line 444-445), toggleFinisherDone (~line 1844), loadCardioPersist (~line 1813)

- [ ] **Step 1: Replace the finisher done button in `buildPanels`**

The current line (~445):
```javascript
html += "<button class='cardio-done-btn' id='finisher-done-" + day.id + "' onclick='toggleFinisherDone(\"" + day.id + "\")'>Mark Done</button>";
```

Replace with:
```javascript
html += "<div style='display:flex;align-items:center;gap:8px;'>";
html += "<button class='check-btn' id='finisher-done-" + day.id + "' onclick='toggleFinisherDone(\"" + day.id + "\")'></button>";
html += "<span style='font-size:12px;color:var(--muted);font-weight:600;'>Mark cardio done</span>";
html += "</div>";
```

Note: the surrounding `<div style='display:flex;gap:8px;...'>` that wraps duration+button may need adjustment. Remove that wrapper div's flex settings if they conflict with the new layout.

- [ ] **Step 2: Update `toggleFinisherDone` (~line 1844)**

Replace:
```javascript
btn.textContent = isDone ? "\u2713 Done" : "Mark Done";
```

With:
```javascript
btn.textContent = isDone ? "\u2713" : "";
```

- [ ] **Step 3: Update `loadCardioPersist` done restoration (~line 1813)**

Replace:
```javascript
if(doneBtn){ doneBtn.classList.add("done"); doneBtn.textContent = "\u2713 Done"; }
```

With:
```javascript
if(doneBtn){ doneBtn.classList.add("done"); doneBtn.textContent = "\u2713"; }
```

- [ ] **Step 4: Verify**

Open any day. Cardio finisher should show a round circle + "Mark cardio done" label. Tap circle — turns green with checkmark. Reload — state persists.

---

## Task 5: Wrap-up "Logged" indicator

**Problem:** No persistent visual confirmation that the wrap-up was saved this week.

**Files:**
- Modify: `gym-plan.html` — wrap-up HTML in buildPanels (~line 467), saveWorkout (~line 1125), loadWrapPersist (~line 1838)

- [ ] **Step 1: Add logged indicator to wrap-up title in `buildPanels`**

Replace:
```javascript
html += "<div class='stats-title'>📊 WRAP UP WORKOUT</div>";
```

With:
```javascript
html += "<div style='display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;'>";
html += "<div class='stats-title' style='margin-bottom:0;'>📊 WRAP UP WORKOUT</div>";
html += "<div id='wrap-logged-" + day.id + "' style='display:none;font-size:11px;font-weight:600;color:var(--green);'>✓ Logged</div>";
html += "</div>";
```

- [ ] **Step 2: Show indicator in `saveWorkout` after success (~line 1125)**

After `markDayComplete(dayId);`, add:
```javascript
var loggedBadge = document.getElementById("wrap-logged-" + dayId);
if(loggedBadge) loggedBadge.style.display = "block";
```

- [ ] **Step 3: Restore indicator in `loadWrapPersist` (~line 1838)**

After restoring field values, add:
```javascript
var loggedBadge = document.getElementById("wrap-logged-" + dayId);
if(loggedBadge) loggedBadge.style.display = "block";
```

- [ ] **Step 4: Verify**

Fill in wrap-up and save. "✓ Logged" appears top-right. Reload — still shows. New week → clears (loadWrapPersist already removes stale data and the badge won't be shown).

---

## Task 6: Tips clarity — differentiate starting weight from progression nudge

**Problem:** "Tip: Start weight: 30-40 lbs" and "↑ Try 45 lbs today" appear contradictory in the same panel.

**Files:**
- Modify: `gym-plan.html` — buildCard tip label (~line 688), fetchLiveHistory nudge text (~line 861)

- [ ] **Step 1: Change tip label in `buildCard` (~line 688)**

```javascript
// OLD:
tipP.textContent = ""; // (set via innerHTML below)
tipP.innerHTML = "<strong>Tip: </strong>" + ex.tip;

// Change label to:
tipP.innerHTML = "<strong>Starting weight: </strong>" + ex.tip;
```

Wait — the current code uses `tipP.innerHTML`. Change the strong text from "Tip: " to "Starting ref: " so it's clear it's a baseline, not a mandate.

- [ ] **Step 2: Update overload nudge in `fetchLiveHistory` (~line 861)**

Replace:
```javascript
nudgeDiv.textContent = "\u2191 Try " + suggested + " lbs today (+" + increment + " from last session)";
```

With:
```javascript
nudgeDiv.textContent = "\uD83C\uDFCB\uFE0F Today's target: " + suggested + " lbs (+" + increment + " progression)";
```

This makes it clear the nudge is a current-session target, not conflicting with the reference weight above.

- [ ] **Step 3: Verify**

Open an exercise with logged history, click info button. Panel shows "Starting ref: Start weight: X lbs" then below history: "🏋️ Today's target: Y lbs (+5 progression)". Two pieces of info clearly serve different purposes.

---

## Task 7: Day Type Distribution — meaningful labels

**Problem:** Pie chart slices labeled "DAY 1", "DAY 2" etc. — not meaningful at a glance.

**Files:**
- Modify: `gym-plan.html` — `buildDayTypeDistribution` function (~line 1398)

- [ ] **Step 1: Replace the function with a version using a readable label map**

```javascript
function buildDayTypeDistribution(rows){
  var canvas = document.getElementById("dayTypeChart");
  if(!canvas) return;
  var dayLabelMap = {
    "DAY 1": "Push (Chest/Shoulders/Triceps)",
    "DAY 2": "Pull (Back/Biceps)",
    "DAY 3": "Legs + Glutes",
    "DAY 4": "Upper + Conditioning",
    "DAY 5": "Arms + Shoulders"
  };
  var counts = {};
  rows.forEach(function(r){
    if(!r.day) return;
    var rawKey = r.day.split(" - ")[0].trim();
    var displayKey = dayLabelMap[rawKey] || rawKey;
    counts[displayKey] = (counts[displayKey]||0) + 1;
  });
  var keys = Object.keys(counts);
  if(keys.length === 0) return;
  if(_dayTypeChart){ _dayTypeChart.destroy(); }
  _dayTypeChart = new Chart(canvas, {
    type:"doughnut",
    data:{
      labels:keys,
      datasets:[{
        data:keys.map(function(k){ return counts[k]; }),
        backgroundColor:["#e8ff47","#ff6b35","#4caf50","#4fc3f7","#ffb74d","#e57373","#81c784"],
        borderColor:"#1a1a1c",
        borderWidth:2
      }]
    },
    options:{
      responsive:true,
      plugins:{legend:{labels:{color:"#888884",font:{size:10},pointStyle:"line",usePointStyle:true}}}
    }
  });
}
```

- [ ] **Step 2: Verify**

Load Stats. Day Type Distribution pie slices show "Push (Chest/Shoulders/Triceps)" etc. Activities stored as "TRAIL RUN" etc. still appear as-is (no matching key = shown raw).

---

## Task 8: Weekly Consistency chart — show actual date ranges

**Problem:** X-axis shows ISO week keys. `weekDateRange()` exists but isn't used.

**Files:**
- Modify: `gym-plan.html` — add `weekStartDate` helper near `weekDateRange` (~line 1210), update `buildConsistencyChart` labels (~line 1452)

- [ ] **Step 1: Add `weekStartDate()` helper near `weekDateRange` (~line 1219)**

```javascript
function weekStartDate(weekKey){
  var parts = weekKey.split("-W");
  var year = parseInt(parts[0]), wn = parseInt(parts[1]);
  var jan4 = new Date(year, 0, 4);
  var monday = new Date(jan4);
  monday.setDate(jan4.getDate() - (jan4.getDay()+6)%7 + (wn-1)*7);
  return monday.toLocaleDateString("en-US",{month:"short",day:"numeric"});
}
```

- [ ] **Step 2: Update `buildConsistencyChart` labels (~line 1456)**

Change:
```javascript
data:{labels:uniqueWeeks, datasets:[...
```

To:
```javascript
data:{labels:uniqueWeeks.map(function(w){ return weekStartDate(w); }), datasets:[...
```

- [ ] **Step 3: Verify**

Load Stats. Consistency chart x-axis shows "Feb 9", "Feb 16", "Mar 9" etc. `maxRotation:45` is already set so labels fit.

---

## Task 9: Heatmap legend

**Problem:** Two colors in heatmap (yellow = gym, orange = activity) with no explanation.

**Files:**
- Modify: `gym-plan.html` — `buildStatsHTML` heatmap section (~line 556)

- [ ] **Step 1: Add legend HTML after the heatmap-labels div in `buildStatsHTML`**

Find (~line 557):
```javascript
+ "<div class='heatmap-labels'><span id='heatmap-start'></span><span>Today</span></div>"
+ "</div>"
```

Replace with:
```javascript
+ "<div class='heatmap-labels'><span id='heatmap-start'></span><span>Today</span></div>"
+ "<div style='display:flex;gap:14px;margin-top:10px;flex-wrap:wrap;'>"
+ "<div style='display:flex;align-items:center;gap:5px;font-size:11px;color:var(--muted);'>"
+   "<div style='width:12px;height:12px;border-radius:3px;background:var(--accent);flex-shrink:0;'></div>"
+   "Gym workout"
+ "</div>"
+ "<div style='display:flex;align-items:center;gap:5px;font-size:11px;color:var(--muted);'>"
+   "<div style='width:12px;height:12px;border-radius:3px;background:var(--accent2);flex-shrink:0;'></div>"
+   "Outdoor activity"
+ "</div>"
+ "<div style='display:flex;align-items:center;gap:5px;font-size:11px;color:var(--muted);'>"
+   "<div style='width:12px;height:12px;border-radius:3px;background:var(--surface2);border:1px solid var(--border);flex-shrink:0;'></div>"
+   "Rest day"
+ "</div>"
+ "</div>"
+ "</div>"
```

- [ ] **Step 2: Verify**

Load Stats, scroll to heatmap. Three legend items appear: yellow square (Gym workout), orange square (Outdoor activity), gray square (Rest day).

---

## Final Verification Checklist

After all tasks, open `gym-plan.html` and confirm:

- [ ] **Week auto-clear:** Fake old week key in localStorage, reload, all checks gone
- [ ] **Pending queue:** Go offline, save a set, see "Queued" toast; go online, reload, item flushes
- [ ] **Warm-up checkmark:** Circle appears left of warm-up block, turns green, persists on reload, clears on new week
- [ ] **Cardio done:** Round circle in finisher section (not rectangle), turns green with checkmark
- [ ] **Wrap-up logged:** "✓ Logged" badge visible after saving, persists on reload
- [ ] **Tips:** "Starting ref:" label for start weight, "Today's target:" for progression nudge
- [ ] **Day type chart:** "Push (Chest/Shoulders/Triceps)" etc. instead of "DAY 1"
- [ ] **Consistency chart:** "Feb 9", "Feb 16" dates on x-axis instead of "2026-W06"
- [ ] **Heatmap legend:** Three color swatches with labels below the heatmap

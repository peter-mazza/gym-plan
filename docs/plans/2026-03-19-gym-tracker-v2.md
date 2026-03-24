# Gym Tracker v2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add editing of completed entries, a full stats dashboard, a non-gym activity log, and miscellaneous UX fixes to gym-plan.html.

**Architecture:** Single-file HTML app — all changes are in gym-plan.html (CSS + JS). Stats graphs use Chart.js (already loaded). A new AppScript endpoint `type=all_exercise_history` is needed for the PR table and strength index from Sheets data.

**Tech Stack:** Vanilla JS, Chart.js 4.4.1, Google Sheets via Apps Script, localStorage key `pgymplan_v5`

---

## Task 1: Small fixes — timezone, Cardio tab, pills

**Files:** Modify `gym-plan.html`

**Step 1: Fix hardcoded Pacific offset**

Replace `getPacificWeekKey`, `isThisWeek`, and `getWeekKeyForDate` with local-time versions:

```js
function _isoWeekKey(d){
  var t = new Date(d); t.setHours(0,0,0,0);
  t.setDate(t.getDate() + 3 - (t.getDay()+6)%7);
  var w1 = new Date(t.getFullYear(),0,4);
  var wn = 1 + Math.round(((t-w1)/86400000 - 3 + (w1.getDay()+6)%7)/7);
  return t.getFullYear() + "-W" + String(wn).padStart(2,"0");
}
function getPacificWeekKey(){ return _isoWeekKey(new Date()); }
function getWeekKeyForDate(ds){ if(!ds) return null; var d=new Date(ds); return isNaN(d)?null:_isoWeekKey(d); }
function isThisWeek(ds){ return getWeekKeyForDate(ds) === getPacificWeekKey(); }
```

**Step 2: Remove Cardio tab**

- Delete `{ id:"cardio", label:"Cardio", title:"CARDIO OPTIONS", cardioRef:true }` from DAYS array
- Delete the `if(day.cardioRef)` branch in buildPanels()
- Delete the entire `buildCardioHTML()` function

**Step 3: Update finisher pills**

Change `["Ramp","Treadmill","Bike","Stairs","Track"]` to `["Ramp","Treadmill","Bike","Stairs","Rower"]`

**Step 4: Commit**
```bash
git add gym-plan.html && git commit -m "fix: timezone bug, remove cardio tab, update finisher pills"
```

---

## Task 2: Stats text — week label + last updated date

**Files:** Modify `gym-plan.html`

**Step 1: Add weekDateRange() helper after _isoWeekKey**

```js
function weekDateRange(weekKey){
  var parts = weekKey.split("-W");
  var year = parseInt(parts[0]), wn = parseInt(parts[1]);
  var jan4 = new Date(year, 0, 4);
  var monday = new Date(jan4);
  monday.setDate(jan4.getDate() - (jan4.getDay()+6)%7 + (wn-1)*7);
  var sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  var opts = {month:"short", day:"numeric"};
  return "Week of " + monday.toLocaleDateString("en-US", opts) + " - " + sunday.toLocaleDateString("en-US", opts);
}
```

**Step 2: Replace weekKey display in loadStats()**

Change:
```js
"<span class='week-val'>" + weekKey + "</span>"
```
To:
```js
"<span class='week-val'>" + weekDateRange(weekKey) + "</span>"
```

**Step 3: Add last-updated line to buildStatsHTML()**

Append at end of return string:
```js
+ "<div style='color:var(--muted);font-size:11px;text-align:center;margin-top:20px;'>Last updated: Mar 19, 2026</div>"
```

**Step 4: Commit**
```bash
git add gym-plan.html && git commit -m "feat: week date range label, last updated on stats"
```

---

## Task 3: Edit completed exercise entries

**Files:** Modify `gym-plan.html`

**Step 1: Add CSS**

```css
.edit-entry-btn{background:none;border:1px solid var(--border);color:var(--muted);font-family:'DM Sans',sans-serif;font-size:11px;padding:3px 9px;border-radius:12px;cursor:pointer;margin-left:6px;}
```

**Step 2: Add Edit button to completed cards in buildCard()**

Before `mainDiv.appendChild(infoBtn)`, add:
```js
if(isDone){
  var editBtn = document.createElement("button");
  editBtn.className = "edit-entry-btn";
  editBtn.textContent = "Edit";
  editBtn.onclick = (function(eid){ return function(e){ e.stopPropagation(); openEditMode(eid); }; })(ex.id);
  mainDiv.appendChild(editBtn);
}
```

**Step 3: Add openEditMode() function**

```js
function openEditMode(exId){
  var card = document.getElementById("card-" + exId);
  if(!card) return;
  var detail = card.querySelector(".exercise-detail");
  var infoBtn = card.querySelector(".info-btn");
  if(detail) detail.classList.add("open");
  if(infoBtn){ infoBtn.classList.add("open"); infoBtn.textContent = "x"; }
  var data = loadData();
  var history = (data.history && data.history[exId]) || [];
  var last = history.length ? history[history.length-1] : null;
  if(last){
    ["s1","s2","s3"].forEach(function(s,i){
      var inp = document.getElementById("input-" + exId + "-" + s);
      if(inp){ inp.value = last[s] || ""; }
    });
  }
  var saveBtn = card.querySelector(".save-btn");
  if(saveBtn) saveBtn.textContent = "Update Sets";
  card.scrollIntoView({behavior:"smooth", block:"nearest"});
}
```

**Step 4: In saveWeight(), collapse duplicate same-day entries**

After pushing to history, add:
```js
var hist = data.history[exId];
if(hist.length >= 2 && hist[hist.length-2].date === dateStr){
  hist.splice(hist.length-2, 1);
}
```

In the auto-collapse setTimeout, reset the save button and remove the edit button:
```js
var saveBtnR = card2.querySelector(".save-btn");
if(saveBtnR) saveBtnR.textContent = "Save Sets";
```

**Step 5: Commit**
```bash
git add gym-plan.html && git commit -m "feat: edit completed exercise entries"
```

---

## Task 4: Edit wrap-up workout

**Files:** Modify `gym-plan.html`

**Step 1: Give save button an id in buildPanels()**

Change save button to:
```js
html += "<button class='stats-save-btn' style='margin-top:10px;' id='wrap-save-btn-" + day.id + "' onclick='saveWorkout(\"" + day.id + "\")'>Save Workout</button>";
html += "<button class='reset-btn' id='wrap-edit-btn-" + day.id + "' style='display:none;margin-top:6px;' onclick='editWrapUp(\"" + day.id + "\")'>Edit last saved</button>";
```

**Step 2: In saveWorkout(), persist values and show edit button**

After clearing fields, add:
```js
try{ localStorage.setItem("pgymplan_lastwrap_" + dayId, JSON.stringify({dur:dur,cal:cal,hr:hr,cardio:cardio,notes:notes})); }catch(e){}
var editBtn = document.getElementById("wrap-edit-btn-" + dayId);
if(editBtn) editBtn.style.display = "block";
var saveBtn2 = document.getElementById("wrap-save-btn-" + dayId);
if(saveBtn2) saveBtn2.textContent = "Save Workout";
```

**Step 3: Add editWrapUp() function**

```js
function editWrapUp(dayId){
  try{
    var saved = JSON.parse(localStorage.getItem("pgymplan_lastwrap_" + dayId));
    if(!saved) return;
    var fields = {dur:"stat-dur-",cal:"stat-cal-",hr:"stat-hr-"};
    Object.keys(fields).forEach(function(k){
      var el = document.getElementById(fields[k] + dayId);
      if(el) el.value = saved[k] || "";
    });
    var cardioEl = document.getElementById("cardio-" + dayId);
    if(cardioEl) cardioEl.value = saved.cardio || "";
    var notesEl = document.getElementById("notes-" + dayId);
    if(notesEl) notesEl.value = saved.notes || "";
    var saveBtn = document.getElementById("wrap-save-btn-" + dayId);
    if(saveBtn) saveBtn.textContent = "Update Workout";
    showToast("Editing last saved workout", "var(--accent2)");
  }catch(e){}
}
```

**Step 4: Show edit button on init if saved data exists**

In the init IIFE, after showDay(), add:
```js
["d1","d2","d3","d4","d5"].forEach(function(did){
  try{
    if(localStorage.getItem("pgymplan_lastwrap_" + did)){
      var btn = document.getElementById("wrap-edit-btn-" + did);
      if(btn) btn.style.display = "block";
    }
  }catch(e){}
});
```

**Step 5: Commit**
```bash
git add gym-plan.html && git commit -m "feat: edit wrap-up workout after saving"
```

---

## Task 5: Non-gym Activity Log tab

**Files:** Modify `gym-plan.html`

**Step 1: Add to DAYS array** (before stats entry)

```js
{ id:"activity", label:"+ Activity", title:"ACTIVITY LOG", activityPanel:true }
```

**Step 2: Add CSS**

```css
.activity-entry{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:11px 14px;margin-bottom:8px;}
.activity-entry-top{display:flex;justify-content:space-between;align-items:center;}
.activity-entry-name{font-weight:600;font-size:14px;}
.activity-entry-date{font-size:11px;color:var(--muted);}
.activity-entry-meta{font-size:12px;color:var(--muted);margin-top:3px;}
```

**Step 3: Add buildActivityHTML() function** (returns HTML string for the panel)

Panel contains:
- Activity type pills: Trail Run, Hike, Bike Ride, Swim, Other
- Text input fallback (id: `activity-type`)
- Stats grid: duration, calories, HR (ids: `activity-dur`, `activity-cal`, `activity-hr`)
- Notes textarea (id: `activity-notes`)
- Date input defaulting to today (id: `activity-date`)
- "Log Activity" button calling `saveActivity()`
- Recent activity history div (id: `activity-history`)

**Step 4: Wire into buildPanels()** — add `if(day.activityPanel)` branch before existing panel-type checks.

**Step 5: Add saveActivity() function**

Saves to Sheets using existing `type=workout` endpoint with `day = activity type in caps`. Also saves to `data.activities[]` in localStorage.

**Step 6: Add loadActivityHistory() function**

Reads `data.activities` from localStorage, renders last 5 as activity-entry cards.

**Step 7: Wire auto-load and date-fill into showDay()**

```js
if(id === "activity"){
  loadActivityHistory();
  var dateEl = document.getElementById("activity-date");
  if(dateEl && !dateEl.value) dateEl.value = new Date().toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});
}
```

**Step 8: Commit**
```bash
git add gym-plan.html && git commit -m "feat: non-gym activity log tab"
```

---

## Task 6: Stats — legend fix + heatmap + cardio donut

**Files:** Modify `gym-plan.html`

**Step 1: Fix all Chart.js legend configs**

In every `new Chart(...)` call, update legend labels to:
```js
labels:{color:"#888884",font:{size:10},pointStyle:'line',usePointStyle:true}
```

**Step 2: Add heatmap CSS**

```css
.heatmap-grid{display:flex;gap:3px;flex-wrap:wrap;margin-top:8px;}
.heatmap-day{width:14px;height:14px;border-radius:3px;background:var(--surface2);}
.heatmap-day.active{background:var(--accent);}
.heatmap-day.activity{background:var(--accent2);}
.heatmap-labels{display:flex;justify-content:space-between;font-size:10px;color:var(--muted);margin-top:4px;}
```

**Step 3: Add heatmap + cardio donut sections to buildStatsHTML()**

Add after streak card:
```js
+ "<div class='section-label'>12-Week Heatmap</div>"
+ "<div class='graph-container' style='padding:12px 14px;'><div id='heatmap-grid'></div><div class='heatmap-labels'><span id='heatmap-start'></span><span>Today</span></div></div>"
+ "<div class='section-label' style='margin-top:20px;'>Cardio Type Breakdown</div>"
+ "<div class='graph-container'><canvas id='cardioDonutChart' height='200'></canvas></div>"
```

**Step 4: Add buildHeatmap(rows) function**

Iterates 84 days ending today. Marks gym days (day starts with "DAY") as `.active`, activity days as `.activity`. Renders into `#heatmap-grid`.

**Step 5: Add buildCardioDonut(rows) function**

Groups rows by `r.cardio`, renders doughnut chart into `#cardioDonutChart`.

**Step 6: Call both at end of loadStats() success block**

**Step 7: Commit**
```bash
git add gym-plan.html && git commit -m "feat: heatmap, cardio donut, legend line style"
```

---

## Task 7: Stats — monthly count + day type distribution + avg duration by day

**Files:** Modify `gym-plan.html`

**Step 1: Add three chart sections to buildStatsHTML()**

```js
+ "<div class='section-label' style='margin-top:20px;'>Monthly Workout Count</div>"
+ "<div class='graph-container'><canvas id='monthlyCountChart' height='180'></canvas></div>"
+ "<div class='section-label' style='margin-top:20px;'>Day Type Distribution</div>"
+ "<div class='graph-container'><canvas id='dayTypeChart' height='200'></canvas></div>"
+ "<div class='section-label' style='margin-top:20px;'>Avg Duration by Day Type</div>"
+ "<div class='graph-container'><canvas id='avgDurChart' height='180'></canvas></div>"
```

**Step 2: Add buildMonthlyCount(rows), buildDayTypeDistribution(rows), buildAvgDurByDay(rows)**

- Monthly count: group by `month+year`, bar chart, last 6 months
- Day type: group by `r.day.split(" - ")[0]`, doughnut
- Avg duration by day: group totals/counts by day type, bar chart

**Step 3: Call all three in loadStats()**

**Step 4: Commit**
```bash
git add gym-plan.html && git commit -m "feat: monthly count, day type distribution, avg duration charts"
```

---

## Task 8: Stats — consistency rate + PR table

**Files:** Modify `gym-plan.html`

**Step 1: Add to buildStatsHTML()**

```js
+ "<div class='section-label' style='margin-top:20px;'>Weekly Consistency (target: 4 sessions)</div>"
+ "<div class='graph-container'><canvas id='consistencyChart' height='160'></canvas></div>"
+ "<div class='section-label' style='margin-top:20px;'>Personal Records</div>"
+ "<div id='pr-table'></div>"
```

**Step 2: Add PR table CSS**

```css
.pr-card{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px 14px;}
.pr-row{display:flex;justify-content:space-between;font-size:13px;padding:7px 0;border-bottom:1px solid var(--border);}
.pr-row:last-child{border-bottom:none;}
.pr-name{color:var(--muted);}
.pr-val{font-weight:700;color:var(--accent);}
```

**Step 3: Add buildConsistencyChart(rows)**

Groups by week, computes `sessions/4 * 100` as pct, bar chart last 12 weeks. Bars are green when >= 100%, yellow otherwise.

**Step 4: Add buildPRTable()**

Reads `data.history` from localStorage. For each exercise, finds max weight across all sets ever logged. Renders sorted list in `.pr-card`.

**Step 5: Call both in loadStats()**

**Step 6: Commit**
```bash
git add gym-plan.html && git commit -m "feat: consistency rate chart, personal records table"
```

---

## Task 9: Stats — strength index + top 3 progressions

**Files:** Modify `gym-plan.html`

**Step 1: Add to buildStatsHTML()**

```js
+ "<div class='section-label' style='margin-top:20px;'>Strength Index Trend</div>"
+ "<div style='color:var(--muted);font-size:12px;margin-bottom:8px;'>Avg of max set per exercise per session (local data)</div>"
+ "<div class='graph-container'><canvas id='strengthIndexChart' height='160'></canvas></div>"
+ "<div class='section-label' style='margin-top:20px;'>Top 3 Progressions</div>"
+ "<div id='top3-progressions'></div>"
```

**Step 2: Add buildStrengthIndex()**

From localStorage history: for each session date, get max set weight per exercise, average them → one point per date. Line chart.

**Step 3: Add buildTop3Progressions()**

Finds 3 exercises with the most logged sessions. For each, renders a small line chart (max set per session over time) in its own `.graph-container` inside `#top3-progressions`.

**Step 4: Call both in loadStats()**

**Step 5: Commit**
```bash
git add gym-plan.html && git commit -m "feat: strength index trend, top 3 exercise progressions"
```

---

## Task 10: Push to GitHub

```bash
cd ~/claude/WorkoutTracker && git push origin main
```

---

## AppScript addition (paste into Google Apps Script editor)

Add this case inside `doGet()` for future Sheets-based PR and strength data:

```js
if(type === "all_exercise_history"){
  var sheet = ss.getSheetByName("Exercises");
  if(!sheet) return ContentService.createTextOutput(JSON.stringify({rows:[]})).setMimeType(ContentService.MimeType.JSON);
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var rows = data.slice(1).map(function(r){
    var obj = {}; headers.forEach(function(h,i){ obj[h]=r[i]; }); return obj;
  });
  return ContentService.createTextOutput(JSON.stringify({rows:rows})).setMimeType(ContentService.MimeType.JSON);
}
```

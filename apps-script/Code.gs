function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var type = e.parameter.type;

  if (type === 'exercise') {
    var sheet = ss.getSheetByName('Exercises') || ss.insertSheet('Exercises');
    var data = sheet.getDataRange().getValues();
    var targetDate = String(e.parameter.date || '').trim();
    var targetExercise = String(e.parameter.exercise || '').trim();
    for (var i = 1; i < data.length; i++) {
      var rowDate = fmt(data[i][0]).trim();
      var rowExercise = String(data[i][2]).trim();
      if (rowDate === targetDate && rowExercise === targetExercise) {
        var row = i + 1;
        sheet.getRange(row, 2).setValue(e.parameter.day || '');
        sheet.getRange(row, 4).setValue(e.parameter.set1 || '');
        sheet.getRange(row, 5).setValue(e.parameter.set2 || '');
        sheet.getRange(row, 6).setValue(e.parameter.set3 || '');
        sheet.getRange(row, 7).setValue(e.parameter.set4 || '');
        sheet.getRange(row, 8).setValue(e.parameter.set5 || '');
        return respondJson({ ok: true, updated: row });
      }
    }
    // No existing row for this (date, exercise) — append as new
    sheet.appendRow([e.parameter.date, e.parameter.day, e.parameter.exercise,
                     e.parameter.set1, e.parameter.set2, e.parameter.set3,
                     e.parameter.set4 || '', e.parameter.set5 || '']);
    return respondJson({ ok: true, appended: true });
  }

  if (type === 'workout') {
    var sheet = ss.getSheetByName('Workouts') || ss.insertSheet('Workouts');
    sheet.appendRow([e.parameter.date, e.parameter.day, e.parameter.cardio,
                     e.parameter.duration, e.parameter.calories,
                     e.parameter.heartRate, e.parameter.notes,
                     e.parameter.cardioMinutes || '']);
    return respond('OK');
  }

  if (type === 'edit_workout') {
    var sheet = ss.getSheetByName('Workouts');
    if (!sheet) return respondJson({ ok: false, error: 'No Workouts sheet' });
    var data = sheet.getDataRange().getValues();
    var origDate = String(e.parameter.originalDate || e.parameter.date || '').trim();
    var origDay  = String(e.parameter.day || '').trim();
    for (var i = 1; i < data.length; i++) {
      var rowDate = fmt(data[i][0]).trim();
      var rowDay  = String(data[i][1]).trim();
      if (rowDate === origDate && rowDay === origDay) {
        var row = i + 1;
        sheet.getRange(row, 3).setValue(e.parameter.cardio       || '');
        sheet.getRange(row, 4).setValue(e.parameter.duration     || '');
        sheet.getRange(row, 5).setValue(e.parameter.calories     || '');
        sheet.getRange(row, 6).setValue(e.parameter.heartRate    || '');
        sheet.getRange(row, 7).setValue(e.parameter.notes        || '');
        sheet.getRange(row, 8).setValue(e.parameter.cardioMinutes || '');
        return respondJson({ ok: true, updated: row });
      }
    }
    // Row not found — append as new instead of failing silently
    sheet.appendRow([e.parameter.date, e.parameter.day, e.parameter.cardio,
                     e.parameter.duration, e.parameter.calories,
                     e.parameter.heartRate, e.parameter.notes,
                     e.parameter.cardioMinutes || '']);
    return respondJson({ ok: true, appended: true });
  }

  if (type === 'history') {
    var sheet = ss.getSheetByName('Exercises');
    if (!sheet) return respondJson({ rows: [] });
    var rows = sheet.getDataRange().getValues();
    var exName = e.parameter.exercise;
    var matched = rows.filter(function(r){ return r[2] === exName; }).map(function(r){
      return { date: fmt(r[0]), day: r[1], exercise: r[2],
               set1: r[3], set2: r[4], set3: r[5],
               set4: r[6] || '', set5: r[7] || '' };
    });
    return respondJson({ rows: matched });
  }

  if (type === 'cardio_history') {
    var sheet = ss.getSheetByName('Workouts');
    if (!sheet) return respondJson({ rows: [] });
    var rows = sheet.getDataRange().getValues().slice(1);
    var dayParam = e.parameter.day;
    var dayId = e.parameter.dayId || '';
    var matched = rows.filter(function(r){
      return matchDay(r[1], dayParam, dayId) && r[2];
    }).slice(-3).map(function(r){
      return { date: fmt(r[0]), day: r[1], cardio: r[2], cardioMinutes: r[7] || '' };
    });
    return respondJson({ rows: matched });
  }

  if (type === 'day_history') {
    var sheet = ss.getSheetByName('Workouts');
    if (!sheet) return respondJson({});
    var rows = sheet.getDataRange().getValues().slice(1);
    var dayParam = e.parameter.day;
    var dayId = e.parameter.dayId || '';
    var matched = rows.filter(function(r){ return matchDay(r[1], dayParam, dayId); });
    if (!matched.length) return respondJson({});
    var last = matched[matched.length - 1];
    return respondJson({
      date: fmt(last[0]), day: last[1], cardio: last[2],
      duration: last[3], calories: last[4], heartRate: last[5],
      notes: last[6], cardioMinutes: last[7] || ''
    });
  }

  if (type === 'stats_workouts') {
    var sheet = ss.getSheetByName('Workouts');
    if (!sheet) return respondJson({ rows: [] });
    var rows = sheet.getDataRange().getValues().slice(1);
    return respondJson({ rows: rows.map(function(r){
      return { date: fmt(r[0]), day: r[1], cardio: r[2], duration: r[3],
               calories: r[4], heartRate: r[5], notes: r[6], cardioMinutes: r[7] || '' };
    })});
  }

  if (type === 'stats_exercises') {
    var sheet = ss.getSheetByName('Exercises');
    if (!sheet) return respondJson({ rows: [] });
    var rows = sheet.getDataRange().getValues().slice(1);
    return respondJson({ rows: rows.map(function(r){
      return { date: fmt(r[0]), day: r[1], exercise: r[2],
               set1: r[3], set2: r[4], set3: r[5],
               set4: r[6] || '', set5: r[7] || '' };
    })});
  }

  return respond('Unknown type');
}

function matchDay(rowDay, dayParam, dayId) {
  if (!rowDay) return false;
  var rowLower = String(rowDay).toLowerCase();
  var paramLower = dayParam.toLowerCase();
  if (rowLower === paramLower) return true;
  if (dayId) {
    var num = dayId.replace('d', '');
    if (rowLower.indexOf('day ' + num) !== -1) return true;
  }
  return false;
}

function fmt(val) {
  if (!val) return '';
  if (val instanceof Date) return val.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return String(val);
}

function respond(text) {
  return ContentService.createTextOutput(text);
}

function respondJson(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

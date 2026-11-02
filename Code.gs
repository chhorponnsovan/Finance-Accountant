// ===== Settings =====
const TOKEN = 'change-me-to-a-long-random-string'; // must match the token typed in the web app
const GEMINI_MODEL = 'gemini-2.5-flash';           // the API key itself lives in Project Settings > Script properties

// ===== Your existing function, unchanged =====
function onEdit(e) {
  var sheet = e.source.getActiveSheet();
  var range = e.range;
  var row = range.getRow();
  var col = range.getColumn();
  
  // Find the column index of "ALL" dynamically in row 1
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var allColIndex = -1;
  
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i]).trim().toUpperCase() === "ALL") {
      allColIndex = i + 1; // Convert to 1-based index
      break;
    }
  }
  
  // Check if the edited cell is in the "ALL" column (below the header row)
  if (allColIndex !== -1 && col === allColIndex && row > 1) {
    var value = range.getValue(); // Get the checkbox state (true or false)
    
    // Columns between Column E and the "ALL" column (Columns F through I)
    var startCol = 6; // Column F
    var endCol = allColIndex - 1;
    
    if (endCol >= startCol) {
      var targetRange = sheet.getRange(row, startCol, 1, (endCol - startCol + 1));
      targetRange.setValue(value);
    }
  }
}

// ===== New: receives a receipt and builds a new tab in the same layout as your trip tabs =====
function doGet() { return out_({ ok: true, msg: 'Receipt endpoint is alive' }); }

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const d = JSON.parse(e.postData.contents);
    if (d.token !== TOKEN) return out_({ ok: false, error: 'Bad token' });
    if (d.action === 'scan') return out_(scan_(d));

    const people = d.people.map(p => String(p).trim().toUpperCase());
    const P = people.length;

    // Single items: one row, ticked people split it evenly (your SUMPRODUCT logic).
    // Multi-packs: one row per person with units x unit price, only that person ticked.
    // This replaces the manual "Milk" side table and keeps your checkbox formulas working.
    const rows = [];
    d.items.forEach(it => {
      if (it.qty > 1) {
        it.take.forEach((n, j) => {
          if (n > 0) rows.push({ name: it.name + ' (' + people[j] + ' ×' + n + ')', amt: n, unit: it.unit, tick: people.map((_, k) => k === j) });
        });
      } else {
        rows.push({ name: it.name, amt: 1, unit: it.unit, tick: it.take.map(n => n > 0) });
      }
    });
    const n = rows.length;
    if (!n) return out_({ ok: false, error: 'No items' });

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let tab = tabName_(d.date), base = tab, i = 2;
    while (ss.getSheetByName(tab)) tab = base + ' (' + (i++) + ')';
    const sh = ss.insertSheet(tab, ss.getNumSheets());   // new tab at the end, like your other trips

    // Layout: A # | B Item | C Amount | D Unit price | E Total | F.. people | ALL
    const W = 5 + P + 1, last = n + 1, tot = n + 2, lastP = col_(5 + P);
    sh.getRange(1, 1, 1, W).setValues([['#', 'Item – English translation', 'Amount', 'Unit price', 'Total'].concat(people, ['ALL'])]).setFontWeight('bold');
    sh.getRange(2, 6, n, P + 1).insertCheckboxes();
    sh.getRange(2, 1, n, W).setValues(rows.map((r, k) =>
      [k + 1, r.name, r.amt, r.unit, '=C' + (k + 2) + '*D' + (k + 2)].concat(r.tick, [r.tick.every(Boolean)])));

    // Summary block, same labels as your sheet. IFs/MAX avoid #DIV/0! on rows nobody ticked.
    const h = tot + 2;
    sh.getRange(tot, 2).setValue('Receipt total');
    sh.getRange(tot, 5).setFormula('=SUM(E2:E' + last + ')');
    sh.getRange(h, 6, 1, P).setValues([people]).setFontWeight('bold');
    sh.getRange(h + 1, 5).setValue('Each in Euro');
    sh.getRange(h + 1, 6, 1, P).setFormulas([people.map((_, j) => {
      const L = col_(6 + j);
      return '=SUMPRODUCT($E$2:$E$' + last + '*' + L + '2:' + L + last +
             '/BYROW($F$2:$' + lastP + '$' + last + ',LAMBDA(r,MAX(1,COUNTIF(r,TRUE)))))';
    })]);
    sh.getRange(h + 2, 5).setValue('Total using name in euro');
    sh.getRange(h + 2, 6).setFormula('=SUM(F' + (h + 1) + ':' + lastP + (h + 1) + ')');
    sh.getRange(h + 3, 5).setValue('Difference vs receipt total (should be 0)');
    sh.getRange(h + 3, 6).setFormula('=ROUND(F' + (h + 2) + '-E' + tot + ',2)');

    sh.getRange(2, 3, n, 3).setNumberFormat('0.00');
    sh.getRange(tot, 5).setNumberFormat('0.00');
    sh.getRange(h + 1, 6, 3, P).setNumberFormat('0.00');
    sh.setFrozenRows(1);
    sh.setColumnWidth(2, 280);
    sh.setColumnWidths(6, P + 1, 90);
    SpreadsheetApp.flush();
    return out_({ ok: true, rows: n, tab: tab, url: ss.getUrl() + '#gid=' + sh.getSheetId() });
  } catch (err) {
    return out_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// "2026-11-01" -> "1/11/2026" (the d/M/yyyy tab naming you already use)
function tabName_(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? (+m[3]) + '/' + (+m[2]) + '/' + m[1] : Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'd/M/yyyy');
}
function col_(c) { let s = ''; for (; c > 0; c = Math.floor((c - 1) / 26)) s = String.fromCharCode(65 + (c - 1) % 26) + s; return s; }
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

// ===== Gemini receipt reader (key never leaves Google's servers) =====
function scan_(d) {
  const key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) return { ok: false, error: 'GEMINI_API_KEY is not set in Script properties' };
  const prompt =
    'This is a photo of a French supermarket receipt. Extract every purchased line item. ' +
    'Translate each item name into short, clear English (keep brand names; expand abbreviations). ' +
    'quantity = number of units charged on that line (for example "2 x 1,45" means 2); pack sizes like "6x1L" belong to the name, not the quantity. ' +
    'lineTotal = the amount charged for that line in euros AFTER any discount that applies to it. ' +
    'Fold discount or coupon lines into the item they apply to; never list them as separate items. ' +
    'Ignore subtotal, VAT, payment, change and loyalty lines. Use numbers with a dot as decimal separator. ' +
    'receiptTotal = the final amount paid. store = store name. date = purchase date as YYYY-MM-DD, or "" if unreadable. ' +
    'If a price is unreadable, use 0 rather than guessing.';
  const body = {
    contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: d.mime || 'image/jpeg', data: d.image } }] }],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          store: { type: 'STRING' }, date: { type: 'STRING' }, receiptTotal: { type: 'NUMBER' },
          items: { type: 'ARRAY', items: { type: 'OBJECT',
            properties: { name: { type: 'STRING' }, quantity: { type: 'NUMBER' }, lineTotal: { type: 'NUMBER' } },
            required: ['name', 'quantity', 'lineTotal'] } }
        },
        required: ['items']
      }
    }
  };
  const res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent', {
    method: 'post', contentType: 'application/json', headers: { 'x-goog-api-key': key },
    payload: JSON.stringify(body), muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) return { ok: false, error: 'Gemini ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 300) };
  const o = JSON.parse(JSON.parse(res.getContentText()).candidates[0].content.parts[0].text);
  return { ok: true, items: o.items, total: o.receiptTotal, store: o.store, date: o.date };
}

// Run this once from the editor (▶) to authorise outside requests and check your key works. See View > Logs.
function testGemini() {
  const key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  const res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent', {
    method: 'post', contentType: 'application/json', headers: { 'x-goog-api-key': key },
    payload: JSON.stringify({ contents: [{ parts: [{ text: 'Reply with the single word OK' }] }] }), muteHttpExceptions: true
  });
  Logger.log(res.getResponseCode() + ' ' + res.getContentText().slice(0, 300));
}

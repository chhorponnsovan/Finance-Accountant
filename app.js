const $ = s => document.querySelector(s);
const LS = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
const num = v => { const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? 0 : n; };
const eur = n => n.toFixed(2);
let people = LS.get('people', ['YANIT', 'LANG', 'OUDOM', 'CHHORPONN']);
let items = [], detectedTotal = null;

const newItem = (name = '', qty = 1, unit = 0) => ({ name, qty, unit, take: {} });
const units = it => people.reduce((s, p) => s + (it.take[p] || 0), 0);
const status = (t, el = '#status') => { $(el).textContent = t; };

// ---------- Settings ----------
$('#url').value = LS.get('url', ''); $('#token').value = LS.get('token', '');
$('#url').onchange = e => LS.set('url', e.target.value.trim());
$('#token').onchange = e => LS.set('token', e.target.value.trim());
$('#date').valueAsDate = new Date();
function renderPeople() {
  $('#people').innerHTML = people.map((p, i) => `<span class="chip">${esc(p)} <a data-rm="${i}">✕</a></span>`).join('');
  $('#people').querySelectorAll('[data-rm]').forEach(a => a.onclick = () => { people.splice(+a.dataset.rm, 1); LS.set('people', people); renderPeople(); render(); });
}
$('#addPerson').onclick = () => {
  const n = $('#newPerson').value.trim();
  if (n && !people.includes(n)) { people.push(n); LS.set('people', people); $('#newPerson').value = ''; renderPeople(); render(); }
};
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- OCR ----------
$('#file').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    status('Preparing image…');
    const img = await prep(f);
    const { data } = await Tesseract.recognize(img, 'fra', {
      logger: m => m.status === 'recognizing text' && status(`Reading receipt… ${Math.round(m.progress * 100)}%`)
    });
    items = parse(data.text); render();
    status(items.length ? `Found ${items.length} items. Please check them.` : 'No items detected, add them manually.');
  } catch (err) { status('OCR failed: ' + err.message); }
};
// Upscale + grayscale + contrast boost: noticeably improves Tesseract on thermal paper
function prep(file) {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onerror = () => rej(new Error('Cannot read image'));
    i.onload = () => {
      const s = Math.min(2, Math.max(1, 1600 / i.width)), c = document.createElement('canvas');
      c.width = i.width * s; c.height = i.height * s;
      const x = c.getContext('2d'); x.drawImage(i, 0, 0, c.width, c.height);
      const d = x.getImageData(0, 0, c.width, c.height), p = d.data;
      for (let k = 0; k < p.length; k += 4) {
        const g = Math.max(0, Math.min(255, (0.3 * p[k] + 0.59 * p[k + 1] + 0.11 * p[k + 2] - 110) * 1.6 + 110));
        p[k] = p[k + 1] = p[k + 2] = g;
      }
      x.putImageData(d, 0, 0); c.toBlob(res);
    };
    i.src = URL.createObjectURL(file);
  });
}
const SKIP = /total|tva|\bcb\b|carte|esp[eè]ce|rendu|monnaie|visa|mastercard|siret|merci|remise|fid[eé]lit|cagnotte|paiement|^\s*$/i;
function parse(text) {
  const out = []; detectedTotal = null;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/[€|]/g, ' ').replace(/\s+/g, ' ').trim();
    const t = line.match(/total[^\d-]*(\d+[.,]\d{2})\s*$/i);
    if (t && !/sous/i.test(line)) detectedTotal = num(t[1]);
    const m = line.match(/^(.*?)\s?(-?\d+[.,]\d{2})(?:\s?[A-Z*])?$/);
    if (!m || SKIP.test(m[1])) continue;
    let name = m[1], total = num(m[2]), qty = 1, unit = total;
    const q = name.match(/^(.*?)\s*(\d+)\s*[xX*]\s*(\d+[.,]\d{2})$/);
    if (q) { name = q[1]; qty = +q[2]; unit = num(q[3]); }
    name = name.trim();
    if (!name && q && out.length) { Object.assign(out[out.length - 1], { qty, unit }); continue; } // "2 x 1,45" on its own line
    if (name.length < 2) continue;
    out.push(newItem(name, qty, unit));
  }
  return out;
}

// ---------- Translation (MyMemory: free, no key) ----------
async function translate(it) {
  try {
    const r = await fetch('https://api.mymemory.translated.net/get?langpair=fr|en&q=' + encodeURIComponent(it.name.toLowerCase()));
    const t = (await r.json()).responseData.translatedText;
    if (t) it.name = t;
  } catch { status('Translation unavailable right now.'); }
}
$('#translateAll').onclick = async () => { status('Translating…'); for (const it of items) await translate(it); render(); status('Translated. Edit anything that looks off.'); };

// ---------- Items UI ----------
$('#addItem').onclick = () => { items.push(newItem()); render(); };
function render() {
  $('#items').innerHTML = items.map((it, i) => {
    const u = units(it), multi = it.qty > 1, left = it.qty - u;
    const who = multi
      ? people.map(p => `<span class="person">${esc(p)}<input type="number" min="0" max="${it.qty}" data-i="${i}" data-p="${esc(p)}" value="${it.take[p] || 0}"></span>`).join('')
      : `<span class="chip ${u === people.length ? 'on' : ''}" data-all="${i}">All</span>` +
        people.map(p => `<span class="chip ${it.take[p] ? 'on' : ''}" data-i="${i}" data-t="${esc(p)}">${esc(p)}</span>`).join('');
    return `<div class="item">
      <div class="row"><input class="name" data-n="${i}" value="${esc(it.name)}" placeholder="Item">
        <button data-tr="${i}" title="Translate">🌐</button><button data-del="${i}" title="Remove">🗑</button></div>
      <div class="row"><label>Qty <input class="num" type="number" min="1" step="1" data-q="${i}" value="${it.qty}"></label>
        <label>Unit € <input class="num" type="text" inputmode="decimal" data-u="${i}" value="${eur(it.unit)}"></label>
        <span class="tot">${eur(it.qty * it.unit)} €</span></div>
      <div class="chips">${who}</div>
      ${multi ? `<div class="${left < 0 ? 'warn' : left ? 'mut' : 'okc'}">${left < 0 ? `Too many assigned (${u}/${it.qty})` : left ? `${left} of ${it.qty} still unassigned` : 'All units assigned ✓'}</div>` : ''}
    </div>`;
  }).join('');
  const L = $('#items');
  L.querySelectorAll('[data-n]').forEach(e => e.oninput = () => items[+e.dataset.n].name = e.value);
  // Changing qty keeps the pack total (8.70 -> 6 x 1.45)
  L.querySelectorAll('[data-q]').forEach(e => e.onchange = () => { const it = items[+e.dataset.q], tot = it.qty * it.unit; it.qty = Math.max(1, Math.round(num(e.value))); it.unit = tot / it.qty; it.take = {}; render(); });
  L.querySelectorAll('[data-u]').forEach(e => e.onchange = () => { items[+e.dataset.u].unit = num(e.value); render(); });
  L.querySelectorAll('[data-t]').forEach(e => e.onclick = () => { const it = items[+e.dataset.i]; it.take[e.dataset.t] = it.take[e.dataset.t] ? 0 : 1; render(); });
  L.querySelectorAll('[data-all]').forEach(e => e.onclick = () => { const it = items[+e.dataset.all], on = units(it) < people.length; people.forEach(p => it.take[p] = on ? 1 : 0); render(); });
  L.querySelectorAll('input[data-p]').forEach(e => e.onchange = () => { items[+e.dataset.i].take[e.dataset.p] = Math.max(0, Math.round(num(e.value))); render(); });
  L.querySelectorAll('[data-del]').forEach(e => e.onclick = () => { items.splice(+e.dataset.del, 1); render(); });
  L.querySelectorAll('[data-tr]').forEach(e => e.onclick = async () => { await translate(items[+e.dataset.tr]); render(); });
  renderSummary();
}

// Per-person share: single items split evenly between ticked people; multi-packs bill unit price x units taken
function renderSummary() {
  const owe = Object.fromEntries(people.map(p => [p, 0]));
  let sum = 0;
  items.forEach(it => {
    sum += it.qty * it.unit;
    const n = units(it);
    if (!n) return;
    people.forEach(p => { const k = it.take[p] || 0; if (k) owe[p] += it.qty > 1 ? k * it.unit : it.unit / n; });
  });
  const diff = detectedTotal != null ? sum - detectedTotal : null;
  $('#summary').innerHTML = `<table>${people.map(p => `<tr><td>${esc(p)}</td><td>${eur(owe[p])} €</td></tr>`).join('')}
    <tr><td><b>Items total</b></td><td><b>${eur(sum)} €</b></td></tr></table>` +
    (diff == null ? '' : Math.abs(diff) < 0.01 ? `<div class="okc">Matches receipt total (${eur(detectedTotal)} €) ✓</div>`
      : `<div class="warn">Receipt total says ${eur(detectedTotal)} €, items differ by ${eur(diff)} €. Check for missed or misread lines.</div>`);
}

// ---------- Submit ----------
$('#submit').onclick = async () => {
  const url = $('#url').value.trim(), token = $('#token').value.trim();
  if (!url) { $('#settings').open = true; return status('Add your Web App URL in Settings first.', '#result'); }
  if (!items.length) return status('No items to send.', '#result');
  const bad = items.findIndex(it => !it.name.trim() || units(it) < 1 || units(it) > it.qty || (it.qty > 1 && units(it) !== it.qty));
  if (bad >= 0) return status(`Item ${bad + 1} needs a name and every unit assigned.`, '#result');
  status('Sending…', '#result'); $('#submit').disabled = true;
  try {
    const r = await fetch(url, { // text/plain avoids a CORS preflight that Apps Script cannot answer
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token, store: $('#store').value, date: $('#date').value, people,
        items: items.map(it => ({ name: it.name.trim(), qty: it.qty, unit: it.unit, take: people.map(p => it.take[p] || 0) })) })
    });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error);
    status(`✅ ${j.rows} rows added in new tab "${j.tab}". `, '#result');
    if (j.url) { const a = document.createElement('a'); a.href = j.url; a.target = '_blank'; a.textContent = 'Open sheet'; $('#result').append(a); }
    items = []; detectedTotal = null; render();
  } catch (err) { status('❌ ' + err.message, '#result'); }
  $('#submit').disabled = false;
};
renderPeople(); render();

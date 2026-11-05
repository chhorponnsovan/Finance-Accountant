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

// ---------- Receipt scan: Gemini, called through your Apps Script so the API key stays secret ----------
const onPick = async e => {
  const f = e.target.files[0]; if (!f) return;
  const url = $('#url').value.trim(), token = $('#token').value.trim();
  if (!url) { $('#settings').open = true; return status('Add your Web App URL and token in Settings first.'); }
  try {
    status('Preparing image…');
    const image = await shrink(f);
    status('Reading receipt with Gemini… (about 10-20 s)');
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'scan', token, image, mime: 'image/jpeg' }) });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error);
    if (!Array.isArray(j.items)) throw new Error('Your Apps Script is still running old code. In Apps Script: Deploy > Manage deployments > pencil > Version: New version > Deploy.');
    items = j.items.map(i => {
      const qty = Math.max(1, Math.round(num(i.quantity) || 1));
      return newItem(i.name, qty, num(i.lineTotal) / qty); // unit derived from the printed line total
    });
    detectedTotal = num(j.total) > 0 ? num(j.total) : null;
    if (j.store) $('#store').value = j.store;
    if (/^\d{4}-\d{2}-\d{2}$/.test(j.date || '')) $('#date').value = j.date;
    render();
    status(items.length ? `Found ${items.length} items. Please check them.` : 'No items found, add them manually.');
  } catch (err) { status('Scan failed: ' + err.message); }
  e.target.value = '';
};
$('#file').onchange = $('#cam').onchange = onPick;
// Resize to max 1800px and re-encode as JPEG: keeps the upload small and fast
function shrink(file) {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onerror = () => rej(new Error('Cannot read image'));
    i.onload = () => {
      const s = Math.min(1, 1800 / Math.max(i.width, i.height)), c = document.createElement('canvas');
      c.width = i.width * s; c.height = i.height * s;
      c.getContext('2d').drawImage(i, 0, 0, c.width, c.height);
      res(c.toDataURL('image/jpeg', 0.85).split(',')[1]);
    };
    i.src = URL.createObjectURL(file);
  });
}

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
<button data-del="${i}" title="Remove">🗑</button></div>
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
  const bad = items.findIndex(it => !it.name.trim() || units(it) < 1 || (it.qty > 1 && units(it) !== it.qty));
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

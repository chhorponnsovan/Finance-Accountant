# Receipt Splitter: setup

## A. Google Sheet (do this first)
1. Open your **Daily Spending** sheet → **Extensions → Apps Script**.
2. Select everything in `Code.gs`, delete it, paste in the new `Code.gs` (your `onEdit` is included unchanged).
3. Change `TOKEN` to any long random string and keep a copy (you type it into the app later).
4. **Save**, then **Deploy → New deployment → ⚙ → Web app**
   - Execute as: **Me**; Who has access: **Anyone** → **Deploy**
   - Authorise when asked (Advanced → Go to project → Allow).
5. Copy the **Web app URL** (ends in `/exec`). Opening it in a browser should show `{"ok":true,...}`.
6. If you ever edit the code: **Deploy → Manage deployments → ✏ → New version → Deploy** (URL stays the same).

## B. GitHub (no git commands needed)
1. Open github.com/chhorponnsovan/Finance-Accountant → **Add file → Upload files**.
2. Drag in `index.html`, `app.js`, `styles.css`, `README.md` → **Commit changes**.
3. **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `/(root)` → Save**.
   (Free accounts need the repo to be **public**; your token is not in the repo, so that's fine.)
4. After ~1 minute the app is at `https://chhorponnsovan.github.io/Finance-Accountant/`.

## C. First run
1. Open the app → ⚙ Settings → paste the Web App URL and the token. Names are pre-filled: YANIT, LANG, OUDOM, CHHORPONN.
2. Pick a receipt photo, fix items, translate, assign people, **Send**.
3. A new tab (e.g. `2/11/2026`) appears in your sheet with the same layout and totals.

Multi-pack: set Qty to 6 (the 8.70 total is kept, so unit becomes 1.45), then enter each person's units. The sheet gets one row per person.

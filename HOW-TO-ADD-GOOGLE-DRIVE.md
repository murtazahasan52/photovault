# How to add a photographer's Google Drive to PhotoVault

Each photographer can connect **one or more Google Drives** (for example several Gmail accounts, 15 GB free each).
Photos are never copied to the server; the app only reads the shared folders.

## Step 1: Get a free Google API key (once per photographer)
1. Open https://console.cloud.google.com/ and log in with any Gmail.
2. Top bar → **Select a project → New project** → name it `PhotoVault` → **Create**.
3. Open https://console.cloud.google.com/apis/library/drive.googleapis.com → click **Enable**.
4. Open https://console.cloud.google.com/apis/credentials → **+ Create credentials → API key** → copy the key (starts with `AIza…`).
5. (Recommended) Click the key → **API restrictions → Restrict key → Google Drive API** → **Save**.
6. In PhotoVault: **My Drives → Step 1 → paste the key → Save & test**. No billing or card is needed.

One key works for all of that photographer's Drives. The main admin can also put one shared key in the backend `.env` (`GOOGLE_API_KEY`) for everyone.

## Step 2: Make one main folder in each Google Drive
1. Open https://drive.google.com with the Gmail where the photos are.
2. **+ New → New folder** → e.g. `Studio Events 2026`.
3. Inside it, make one folder per event (e.g. `Rahul Priya Wedding`), with optional sub-folders per function (`Haldi`, `Wedding`, `Reception`). Upload photos and videos as usual.

## Step 3: Share the main folder as "Anyone with the link"
1. Right-click the main folder → **Share → Share**.
2. Under **General access**, change "Restricted" to **Anyone with the link**, role **Viewer**.
3. **Copy link** → **Done**. Everything inside is covered automatically, so you don't need to share each event folder.

## Step 4: Add the Drive in PhotoVault
**My Drives → ＋ Add Drive**
- **Name**: e.g. "Main Gmail" / "Studio Drive 2"
- **Gmail ID**: for your reference
- **Main folder link**: paste the link from Step 3

The app checks the folder straight away and shows **connected**. For each extra Gmail, repeat Steps 2–4.

## Step 5: Create events straight from the Drive
**My Drives → Browse folders** → open the event folder → **＋ Create event** (or **Add to event** to add it as another album).
Inside the event form you can also click **📂 Pick from "<Drive name>"** instead of pasting links.
Then on the event: **Sync from Drive → Face index → Share**.

## Main admin: set up Drives for a photographer
**Photographers → 🗂️ Drives** on the photographer's row → save their API key and add their Drives for them.
The table shows how many Drives each photographer has connected.

## Common problems
| Message | Fix |
|---|---|
| "Folder/file not found — share it as Anyone with the link" | Folder is still "Restricted"; do Step 3 again. |
| "API key not valid" | Copy the key again; check that the Google Drive API is **enabled** (Step 1.3). |
| "This link is a single file" | Paste the **folder** link, not a photo link. |
| New photos not showing | Open the event → **Sync from Drive**, then **Face index → Start**. |

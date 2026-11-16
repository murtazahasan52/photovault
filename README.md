# PhotoVault — Photographer Management System

Photographers link their **Google Drive** folders, share one link per event, and every guest
finds **their own photos with a selfie** (live camera or gallery). Guests can ask the
photographer / event owner for access to the **full gallery**.

Photos & videos are never uploaded to this server — they stay on Google Drive and guests'
browsers load them straight from Google. Face detection also runs in the browser, so the
server only stores small records (events, Drive file IDs, face fingerprints, guests, payments).

## Features

**Admin panel (`/admin`)**
- Main admin (super admin): add/disable photographers, set plan expiry, see everything
- Photographer login — each studio sees only its own data
- Dashboard: events, photos, videos, faces, guests, pending requests, payments due
- **My Drives (photographer-wise Google Drive)**: each photographer connects one or more Drives (e.g. several Gmail accounts), browses folders and creates events from a folder in one click. The main admin can set up Drives for any photographer. Full steps: HOW-TO-ADD-GOOGLE-DRIVE.md
- **Live Booth**: instant stage photo → big QR → guest scans and downloads on the spot; venue TV screen; saves to the photographer's Drive via a Google Apps Script (server fallback); booth shots are face-indexed for selfie search. Guide: LIVE-BOOTH-GUIDE.md
- Events: name, type, dates, venue, client, status, package amount, several Drive links (one per function: Haldi, Wedding, Reception…)
- Sync from Drive: reads folders + sub-folders (sub-folders become albums), picks up new files and removes deleted ones
- Face index: one click, runs in the admin's browser, pause/resume, progress bar
- Share: guest link, QR code (PNG download), WhatsApp share, send to client
- Guest settings per event: selfie search on/off, PIN, ask name+mobile, downloads on/off, public full gallery, expiry date, match strictness, welcome message
- Guests list (who opened, how many photos found) + CSV export + WhatsApp
- Access requests: approve / reject (with WhatsApp message to the guest), or give access directly from the guests list
- Clients (CRM), Payments (package / received / balance, payment history, WhatsApp reminder)
- Settings: studio branding (name, logo, colour, contacts) shown on guest pages, Google API key, password

**Guest page (`/e/<event-link>`)**
- Event cover with studio branding
- Name + mobile (and PIN if set)
- 🤳 Take a selfie (live front camera) or 🖼 upload from gallery → "We found you in N photos"
- Lightbox, download single / selected / all, videos play from Drive
- 🔒 Request access to ALL photos → unlocks automatically when approved (full gallery with albums + Drive folder links)

## Setup

### 1. Google API key (free, one time)
1. https://console.cloud.google.com/apis/library/drive.googleapis.com → **Enable** (create a project if asked)
2. https://console.cloud.google.com/apis/credentials → **Create credentials → API key**
3. Restrict the key to **Google Drive API** (recommended)
4. Paste in **Admin → My Drives → Step 1** (or set `GOOGLE_API_KEY` in backend `.env` for all photographers)

### 2. Drive folders
Share each event folder: **Share → General access → Anyone with the link → Viewer**. Paste the folder link into the event.

### 3. Workflow per event
Create event → paste Drive link(s) → **Sync from Drive** → **Face index → Start** → **Share** the link / QR.
After adding more photos to Drive: Sync again → Face index → Start (only new photos are processed).

## Deploy on Vercel
See **DEPLOY-VERCEL.md**: one Vercel project with two services (`frontend` React at `/`, `backend` FastAPI at `/api/*`) and MongoDB Atlas. `vercel.json` is already set up.

## Run locally

Backend (`backend/`, Python 3.10+, MongoDB):
```
cp .env.example .env      # edit values
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8001
```
Frontend (`frontend/`, Node 18+):
```
cp .env.example .env      # REACT_APP_BACKEND_URL=http://localhost:8001
yarn install   (or npm install)
yarn start
```
Default main admin: `admin@photovault.com` / `admin123` (change via ADMIN_EMAIL / ADMIN_PASSWORD before first start, and change the password after login).

All API routes are under `/api`.

## Backend environment
| Variable | Meaning |
|---|---|
| MONGO_URL, DB_NAME | MongoDB connection |
| JWT_SECRET | long random string |
| ADMIN_EMAIL, ADMIN_PASSWORD | main admin created on first start |
| GOOGLE_API_KEY | optional shared Drive API key |
| ALLOW_SIGNUP | `true` = photographers can self-register |
| CORS_ORIGINS | default `*` |

## Notes
- Face engine: @vladmandic/face-api (SSD MobileNet + 128-d face recognition), loaded from jsDelivr CDN at runtime.
- The guest's selfie is processed on their phone; only a 128-number fingerprint is sent to the server for matching, and it is not stored.
- Thumbnail proxy `/api/media/thumb/...` is used only by the admin during face indexing (browser canvas needs it); guests never go through the server for images.

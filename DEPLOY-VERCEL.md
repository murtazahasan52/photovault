# Deploy PhotoVault on Vercel

One Vercel project serves everything:
- **Website** (React): built from `frontend/` and served as a static site
- **API** (FastAPI): `api/index.py` runs as a Python serverless function for every `/api/*` request
- **Database**: MongoDB Atlas (free M0 cluster is enough to start)

Files that make this work: `vercel.json`, `api/index.py`, `requirements.txt` (root), `.vercelignore`.

---

## 1. Create the MongoDB Atlas database (free)
1. Go to https://cloud.mongodb.com → sign up → **Create** → **M0 Free** → pick a region close to you (Mumbai) → Create.
2. **Database Access** → Add new database user → username + password (save them).
3. **Network Access** → Add IP Address → **Allow access from anywhere** (`0.0.0.0/0`). Vercel has no fixed IP.
4. **Database → Connect → Drivers** → copy the connection string, for example:
   `mongodb+srv://photovault:YOURPASSWORD@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority`

## 2. Put the code on GitHub
Unzip the project, then push it to a new GitHub repository (the root of the repo must contain `vercel.json`).

## 3. Import into Vercel
1. Open https://vercel.com/new → **Import** your GitHub repository.
2. Framework preset: **Other**. Leave Root Directory as the repo root. Build/Output settings come from `vercel.json` automatically.
3. Open **Environment Variables** and add:

| Name | Value |
|---|---|
| `MONGO_URL` | your Atlas connection string from step 1 |
| `DB_NAME` | `photovault` |
| `JWT_SECRET` | any long random text (e.g. 40+ letters/numbers) |
| `ADMIN_EMAIL` | main admin login email |
| `ADMIN_PASSWORD` | main admin first password (change it after login) |
| `GOOGLE_API_KEY` | *(optional)* shared Google Drive API key for all photographers |
| `ALLOW_SIGNUP` | `false` (or `true` to let photographers register themselves) |

Do **not** set `REACT_APP_BACKEND_URL`. The website and API share the same domain.

4. Click **Deploy**. Then open `https://<your-project>.vercel.app/admin` and log in with ADMIN_EMAIL / ADMIN_PASSWORD.
   The main admin account and database indexes are created automatically on the first request.

**Alternative, using the CLI:** `npm i -g vercel` → in the project folder run `vercel` (first time, follow the prompts) → add the env vars in the dashboard → `vercel --prod`.

## 4. Custom domain (optional)
Vercel → Project → **Settings → Domains** → add `photos.yourstudio.com` → add the DNS record Vercel shows. Guest links, QR codes and booth links automatically use the domain the admin panel is opened on.

## Notes and limits
- **Node.js version**: keep Vercel's default (latest). Old versions like 20.x are discontinued on Vercel.
- **Function time**: `maxDuration` is 60 s in `vercel.json`. A Drive sync of a huge folder (thousands of files across many sub-folders) can take long. If it times out, sync the event again: it continues adding what's new. On Vercel Pro you can raise `maxDuration` to 300.
- **Upload size**: Vercel accepts up to 4.5 MB per request. Live Booth photos are resized in the browser to 2048 px (about 1 MB), so they fit. Saving booth shots to Google Drive through the upload script is recommended anyway.
- Photos and videos stay on Google Drive. Vercel and Atlas only store links, face fingerprints, guests, requests and payments, so the free tiers go a long way.
- To update later, push to GitHub and Vercel redeploys automatically.

## Checked locally
`vercel build` (Vercel CLI 65) completes: React build plus Python 3.12 function with `backend/server.py` bundled; `/api/*` is routed to the function and all other paths go to the React app (`/admin`, `/e/...`, `/p/...`, `/live/...`).

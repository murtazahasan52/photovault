# Deploy PhotoVault on Vercel

One Vercel project with **two services** (Vercel Services):
- **frontend** (React, `frontend/`): public at `/` (all paths except `/api/*`), with fallback to `index.html` for `/admin`, `/e/...`, `/p/...`, `/live/...`
- **backend** (FastAPI, `backend/server.py` → `app`): public at `/api/*`. It receives the full path (`/api/...`), which matches its routes.
- **Database**: MongoDB Atlas (free M0 cluster is enough to start)

The browser calls the API on the same domain (`/api/...`), so no service bindings are needed: the backend never calls the frontend, and the static frontend has no server-side code.
Files that make this work: `vercel.json` (services + rewrites), `backend/requirements.txt`, `backend/.python-version` (3.12), `.vercelignore`.

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
2. Leave Root Directory as the repo root. Vercel reads the two services from `vercel.json`, so don't set a framework, build command or output directory in the dashboard.
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

**Alternative, using the CLI:** `npm i -g vercel` → in the project folder run `vercel` (first time, follow the prompts) → add the env vars in the dashboard → `vercel --prod`. Run both services locally with `vercel dev` (after `vercel login`).

## 4. Custom domain (optional)
Vercel → Project → **Settings → Domains** → add `photos.yourstudio.com` → add the DNS record Vercel shows. Guest links, QR codes and booth links automatically use the domain the admin panel is opened on.

## Notes and limits
- **Node.js version**: keep Vercel's default (latest). Old versions like 20.x are discontinued on Vercel.
- **Function time**: the backend runs on Fluid compute with Vercel's default time limit. A Drive sync of a huge folder can take long. If it ever times out, sync the event again: it continues adding what's new.
- **Upload size**: Vercel accepts up to 4.5 MB per request. Live Booth photos are resized in the browser to 2048 px (about 1 MB), so they fit. Saving booth shots to Google Drive through the upload script is recommended anyway.
- Photos and videos stay on Google Drive. Vercel and Atlas only store links, face fingerprints, guests, requests and payments, so the free tiers go a long way.
- To update later, push to GitHub and Vercel redeploys automatically.

## Checked locally
`vercel build` (Vercel CLI 65) completes in services mode: the `frontend` service (create-react-app, static, SPA fallback) and the `backend` service (FastAPI, Python 3.12). Top-level routes send `/api/*` to `backend` with the original path kept, and everything else to `frontend`.

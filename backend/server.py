"""
PhotoVault — Photographer Management System (FastAPI backend)

Photos & videos are NEVER stored on this server. They stay on Google Drive.
The server keeps only: event info, Drive file IDs, face descriptors
(128 numbers per face) and guest / access-request / payment records.
Face detection runs in the browser (admin while indexing, guest for selfie).
"""
import os
import re
import uuid
import secrets
import base64
import string
import logging
import datetime as dt
from pathlib import Path
from typing import List, Optional, Dict, Any

import bcrypt
import jwt
import httpx
import numpy as np
from dotenv import load_dotenv
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header, Query
from fastapi.responses import Response, JSONResponse
from pymongo.errors import PyMongoError, OperationFailure
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("photovault")

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "photovault")
JWT_SECRET = os.environ.get("JWT_SECRET", "photovault-change-this-secret-key-0123456789")
JWT_DAYS = int(os.environ.get("JWT_DAYS", "30"))
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@photovault.com").lower()
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin123")
ENV_GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY", "")
ALLOW_SIGNUP = os.environ.get("ALLOW_SIGNUP", "false").lower() == "true"

class _LazyDB:
    """Mongo handle that (re)connects per event loop.
    Works on a normal server (Emergent / uvicorn) and on serverless hosts like Vercel,
    where each cold start may run on a fresh event loop."""

    def __init__(self):
        self._client = None
        self._loop = None

    def _get(self):
        import asyncio
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None
        if self._client is None or (loop is not None and loop is not self._loop):
            self._client = AsyncIOMotorClient(MONGO_URL, serverSelectionTimeoutMS=8000)
            self._loop = loop
        return self._client[DB_NAME]

    def __getattr__(self, name):
        return getattr(self._get(), name)

    def __getitem__(self, name):
        return self._get()[name]

    def close(self):
        if self._client is not None:
            self._client.close()


db = _LazyDB()

app = FastAPI(title="PhotoVault API")
api = APIRouter(prefix="/api")

DRIVE_API = "https://www.googleapis.com/drive/v3/files"
FOLDER_MIME = "application/vnd.google-apps.folder"


# ───────────────────────── helpers ─────────────────────────
def now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def new_id() -> str:
    return uuid.uuid4().hex


def clean(doc: Optional[dict]) -> Optional[dict]:
    if doc is None:
        return None
    doc = dict(doc)
    doc.pop("_id", None)
    doc.pop("password_hash", None)
    return doc


def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def check_pw(pw: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), h.encode())
    except Exception:
        return False


def make_token(user: dict) -> str:
    payload = {
        "sub": user["id"],
        "role": user["role"],
        "exp": dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=JWT_DAYS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def slugify(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (text or "event").lower()).strip("-")
    return (s[:40] or "event") + "-" + secrets.token_hex(3)


def default_studio(name: str = "") -> dict:
    return {
        "name": name or "My Studio",
        "tagline": "",
        "logo_url": "",
        "phone": "",
        "whatsapp": "",
        "email": "",
        "address": "",
        "instagram": "",
        "website": "",
        "brand_color": "#c8a24a",
    }


async def get_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Please log in")
    token = authorization.split(" ", 1)[1]
    try:
        data = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Session expired, please log in again")
    except Exception:
        raise HTTPException(401, "Invalid session")
    user = await db.users.find_one({"id": data["sub"]})
    if not user or not user.get("active", True):
        raise HTTPException(401, "Account disabled or not found")
    return user


async def get_superadmin(user: dict = Depends(get_user)) -> dict:
    if user["role"] != "superadmin":
        raise HTTPException(403, "Only the main admin can do this")
    return user


def scope(user: dict) -> dict:
    """Superadmin sees everything; a photographer sees only their own data."""
    return {} if user["role"] == "superadmin" else {"owner_id": user["id"]}


async def own_event(event_id: str, user: dict) -> dict:
    ev = await db.events.find_one({"id": event_id, **scope(user)})
    if not ev:
        raise HTTPException(404, "Event not found")
    return ev


async def api_key_for(owner_id: str) -> str:
    owner = await db.users.find_one({"id": owner_id}) or {}
    if owner.get("google_api_key"):
        return owner["google_api_key"]
    if ENV_GOOGLE_API_KEY:
        return ENV_GOOGLE_API_KEY
    sa = await db.users.find_one({"role": "superadmin", "google_api_key": {"$nin": [None, ""]}})
    return (sa or {}).get("google_api_key", "")


def extract_drive_id(url: str) -> Optional[str]:
    url = (url or "").strip()
    for pat in (r"/folders/([A-Za-z0-9_-]{10,})", r"/file/d/([A-Za-z0-9_-]{10,})",
                r"/d/([A-Za-z0-9_-]{10,})", r"[?&]id=([A-Za-z0-9_-]{10,})"):
        m = re.search(pat, url)
        if m:
            return m.group(1)
    if re.fullmatch(r"[A-Za-z0-9_-]{10,}", url):
        return url
    return None


def media_type(mime: str) -> Optional[str]:
    if mime.startswith("image/"):
        return "photo"
    if mime.startswith("video/"):
        return "video"
    return None


def public_media(m: dict) -> dict:
    out = {
        "id": m["id"], "file_id": m["file_id"], "name": m.get("name", ""),
        "type": m["type"], "album": m.get("album", ""),
        "width": m.get("width"), "height": m.get("height"),
    }
    if m.get("storage") == "server":  # Live Booth shot kept on this server (fallback when no Drive script)
        out["url"] = f"/api/booth/file/{m['server_full']}"
        out["thumb_url"] = f"/api/booth/file/{m['server_thumb']}"
    if m.get("source") == "booth":
        out["source"] = "booth"
        out["code"] = m.get("code", "")
    return out


# ───────────────────────── models ─────────────────────────
class LoginIn(BaseModel):
    email: str
    password: str


class SignupIn(BaseModel):
    name: str
    email: str
    password: str
    phone: str = ""
    studio_name: str = ""


class PasswordIn(BaseModel):
    old_password: str
    new_password: str


class PhotographerIn(BaseModel):
    name: str
    email: str
    phone: str = ""
    password: Optional[str] = None
    studio_name: str = ""
    active: bool = True
    plan_expiry: str = ""
    notes: str = ""


class SettingsIn(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    studio: Optional[Dict[str, Any]] = None
    google_api_key: Optional[str] = None


class ClientIn(BaseModel):
    name: str
    phone: str = ""
    email: str = ""
    address: str = ""
    notes: str = ""


class DriveLinkIn(BaseModel):
    id: Optional[str] = None
    label: str = ""
    url: str
    drive_ref: str = ""   # id of the photographer's saved Drive this folder belongs to (optional)


class EventSettings(BaseModel):
    selfie_search: bool = True
    pin: str = ""
    allow_download: bool = True
    public_gallery: bool = False
    require_guest_details: bool = True
    match_threshold: float = 0.5
    expires_on: str = ""
    welcome_message: str = ""
    live_screen: bool = True


class EventIn(BaseModel):
    name: str
    event_type: str = "Wedding"
    date: str = ""
    end_date: str = ""
    venue: str = ""
    description: str = ""
    client_id: str = ""
    cover_url: str = ""
    status: str = "upcoming"
    package_amount: float = 0
    drive_links: List[DriveLinkIn] = []
    settings: EventSettings = Field(default_factory=EventSettings)


class IndexIn(BaseModel):
    faces: List[List[float]] = []
    error: str = ""


class PaymentIn(BaseModel):
    amount: float
    date: str = ""
    mode: str = "Cash"
    note: str = ""


class GuestIn(BaseModel):
    name: str = ""
    phone: str = ""
    email: str = ""
    pin: str = ""


class MatchIn(BaseModel):
    token: str
    descriptor: List[float]


class AccessIn(BaseModel):
    token: str
    message: str = ""


class PinIn(BaseModel):
    pin: str


class DecisionIn(BaseModel):
    note: str = ""


# ───────────────────────── startup ─────────────────────────
_READY = {"done": False}


@app.on_event("startup")
async def startup():
    """First-time setup (indexes + main admin). Never crashes the app:
    if the database is unreachable or the login is wrong, it logs the reason
    and is retried on the next request."""
    if _READY["done"]:
        return
    try:
        await _setup_db()
        _READY["done"] = True
    except Exception as e:
        log.error("Database setup failed (check MONGO_URL user/password and Atlas Network Access): %s", e)


async def _setup_db():
    try:
        await db.users.create_index("id", unique=True)
        await db.users.create_index("email", unique=True)
        await db.events.create_index("id", unique=True)
        await db.events.create_index("slug", unique=True)
        await db.media.create_index([("event_id", 1), ("file_id", 1)])
        await db.faces.create_index("event_id")
        await db.guests.create_index([("event_id", 1), ("phone", 1)])
        await db.guests.create_index("token")
        await db.access_requests.create_index("event_id")
        await db.drives.create_index("owner_id")
        await db.media.create_index("code")
        await db.booth_files.create_index("id")
    except Exception as e:  # mock DBs may not support every index option
        log.warning("index creation skipped: %s", e)

    if not await db.users.find_one({"role": "superadmin"}):
        await db.users.insert_one({
            "id": new_id(), "name": "Main Admin", "email": ADMIN_EMAIL, "phone": "",
            "password_hash": hash_pw(ADMIN_PASSWORD), "role": "superadmin", "active": True,
            "studio": default_studio("PhotoVault"), "google_api_key": "",
            "plan_expiry": "", "created_at": now_iso(),
        })
        log.info("Seeded main admin %s", ADMIN_EMAIL)


@app.exception_handler(PyMongoError)
async def mongo_error(_request, exc):
    msg = str(exc)
    if isinstance(exc, OperationFailure) and ("auth" in msg.lower()):
        detail = "Database login failed — the password in MONGO_URL does not match the database user in MongoDB Atlas."
    else:
        detail = "Database is not reachable — check MONGO_URL and MongoDB Atlas Network Access (allow 0.0.0.0/0)."
    log.error("MongoDB error: %s", msg)
    return JSONResponse(status_code=503, content={"detail": detail})


@api.get("/health")
async def health():
    """Checks the database connection (used after deploying)."""
    try:
        await db.command("ping")
        admin = await db.users.count_documents({"role": "superadmin"})
        return {"ok": True, "database": "connected", "db_name": DB_NAME, "main_admin_exists": bool(admin)}
    except PyMongoError as e:
        m = str(e)
        reason = "authentication failed (wrong user/password in MONGO_URL)" if "auth" in m.lower() else "not reachable"
        return JSONResponse(status_code=503, content={"ok": False, "database": reason, "db_name": DB_NAME})


@api.get("/")
async def root():
    return {"app": "PhotoVault", "ok": True, "signup": ALLOW_SIGNUP}


# ───────────────────────── auth ─────────────────────────
@api.post("/auth/login")
async def login(body: LoginIn):
    user = await db.users.find_one({"email": body.email.strip().lower()})
    if not user or not check_pw(body.password, user["password_hash"]):
        raise HTTPException(401, "Wrong email or password")
    if not user.get("active", True):
        raise HTTPException(403, "Your account is disabled. Contact the admin.")
    exp = user.get("plan_expiry")
    if user["role"] != "superadmin" and exp and exp < dt.date.today().isoformat():
        raise HTTPException(403, "Your plan has expired. Contact the admin to renew.")
    return {"token": make_token(user), "user": clean(user)}


@api.post("/auth/signup")
async def signup(body: SignupIn):
    if not ALLOW_SIGNUP:
        raise HTTPException(403, "Sign-up is closed. Ask the admin to create your account.")
    email = body.email.strip().lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email already registered")
    user = {
        "id": new_id(), "name": body.name, "email": email, "phone": body.phone,
        "password_hash": hash_pw(body.password), "role": "photographer", "active": True,
        "studio": default_studio(body.studio_name or body.name), "google_api_key": "",
        "plan_expiry": "", "notes": "", "created_at": now_iso(),
    }
    await db.users.insert_one(user)
    return {"token": make_token(user), "user": clean(user)}


@api.get("/auth/me")
async def me(user: dict = Depends(get_user)):
    u = clean(user)
    u["has_api_key"] = bool(await api_key_for(user["id"])) or \
        bool(await db.drives.count_documents({"owner_id": user["id"]}))  # Drive connected (script or key)
    return u


@api.post("/auth/change-password")
async def change_password(body: PasswordIn, user: dict = Depends(get_user)):
    if not check_pw(body.old_password, user["password_hash"]):
        raise HTTPException(400, "Old password is wrong")
    if len(body.new_password) < 6:
        raise HTTPException(400, "New password must be at least 6 characters")
    await db.users.update_one({"id": user["id"]}, {"$set": {"password_hash": hash_pw(body.new_password)}})
    return {"ok": True}


# ───────────────────────── settings ─────────────────────────
@api.get("/settings")
async def get_settings(user: dict = Depends(get_user)):
    u = clean(user)
    key = user.get("google_api_key", "")
    u["google_api_key_masked"] = (key[:6] + "…" + key[-4:]) if key else ""
    u.pop("google_api_key", None)
    u["uses_shared_key"] = not key and bool(await api_key_for(user["id"]))
    return u


@api.put("/settings")
async def save_settings(body: SettingsIn, user: dict = Depends(get_user)):
    upd: Dict[str, Any] = {}
    if body.name is not None:
        upd["name"] = body.name
    if body.phone is not None:
        upd["phone"] = body.phone
    if body.studio is not None:
        studio = {**default_studio(), **(user.get("studio") or {}), **body.studio}
        upd["studio"] = studio
    if body.google_api_key is not None:
        upd["google_api_key"] = body.google_api_key.strip()
    if upd:
        await db.users.update_one({"id": user["id"]}, {"$set": upd})
    return await get_settings(await db.users.find_one({"id": user["id"]}))


@api.post("/settings/test-drive")
async def test_drive(body: Dict[str, Any] = None, user: dict = Depends(get_user)):
    """Checks that a Drive link can be read (through the Drive script or the API key)."""
    url = (body or {}).get("url", "")
    async with httpx.AsyncClient(timeout=60) as hc:
        rd = await reader_for(hc, user["id"], (body or {}).get("drive_ref", ""))
        if not url:
            if rd.script:
                d = await rd._call("whoami")
                return {"ok": True, "message": f"Drive script working ✓ ({d.get('email', '')})"}
            r = await hc.get(f"{DRIVE_API}/0000000000000000000000000000000", params={"key": rd.key})
            if r.status_code == 404:
                return {"ok": True, "message": "Google Drive API key is working ✓"}
            raise HTTPException(400, f"Google says: {drive_error(r)}")
        did = extract_drive_id(url)
        if not did:
            raise HTTPException(400, "That is not a Google Drive link")
        meta = await rd.meta(did)
    kind = "folder" if meta["mimeType"] == FOLDER_MIME else "file"
    return {"ok": True, "message": f"Working ✓ — can read {kind} “{meta['name']}”"}



# ───────────────────────── Drive readers: Apps Script (no API key) or Google API key ─────────────────────────
class DriveReader:
    """Reads a photographer's Drive either through their own Google Apps Script web app
    (no Google Cloud / API key needed) or through the Drive API with an API key."""

    def __init__(self, hc: httpx.AsyncClient, key: str = "", script: str = "", secret: str = ""):
        self.hc, self.key, self.script, self.secret = hc, key, script, secret

    async def _call(self, action: str, **params) -> dict:
        try:
            r = await self.hc.get(self.script, params={"action": action, "secret": self.secret, **params},
                                  follow_redirects=True, timeout=120)
        except httpx.HTTPError as e:
            raise HTTPException(400, f"Drive script not reachable: {e}")
        try:
            data = r.json()
        except Exception:
            raise HTTPException(400, "Drive script did not answer correctly — deploy it as a Web app with "
                                     "'Execute as: Me' and 'Who has access: Anyone', and paste the URL ending in /exec")
        if not data.get("ok"):
            err = data.get("error", "error")
            if "Wrong secret" in err:
                raise HTTPException(400, "The secret does not match the SECRET written in the Drive script")
            if "No item with the given ID" in err or "not found" in err.lower() or "Access denied" in err:
                raise HTTPException(400, "Folder not found in this Google account — open the link with the same Gmail as the script")
            raise HTTPException(400, f"Drive script error: {err}")
        return data

    async def meta(self, fid: str) -> dict:
        if self.script:
            return (await self._call("meta", id=fid))["item"]
        return await drive_get(self.hc, fid, self.key)

    async def tree(self, fid: str, album: str) -> List[dict]:
        if self.script:
            files = (await self._call("tree", id=fid, album=album))["files"]
            for f in files:
                f["_album"] = f.pop("album", album)
            return files
        out: List[dict] = []
        await drive_list(self.hc, fid, self.key, album, out)
        return out

    async def children(self, fid: str):
        """(meta, folders, files) of one folder."""
        if self.script:
            d = await self._call("list", id=fid)
            return d["folder"], d.get("folders", []), d.get("files", [])
        meta = await drive_get(self.hc, fid, self.key)
        folders, files, token = [], [], None
        while True:
            params = {"q": f"'{fid}' in parents and trashed=false", "key": self.key, "pageSize": 1000,
                      "supportsAllDrives": "true", "includeItemsFromAllDrives": "true", "orderBy": "folder,name",
                      "fields": "nextPageToken,files(id,name,mimeType,modifiedTime)"}
            if token:
                params["pageToken"] = token
            r = await self.hc.get(DRIVE_API, params=params)
            if r.status_code != 200:
                raise HTTPException(400, drive_error(r))
            data = r.json()
            for f in data.get("files", []):
                (folders if f["mimeType"] == FOLDER_MIME else files).append(f)
            token = data.get("nextPageToken")
            if not token:
                break
        return meta, folders, files

    async def share(self, fid: str) -> bool:
        if not self.script:
            return False
        await self._call("share", id=fid)
        return True


async def reader_for(hc: httpx.AsyncClient, owner_id: str, drive_ref: str = "") -> DriveReader:
    """Pick how to read this photographer's Drive: the linked Drive's script, else API key, else any Drive script."""
    if drive_ref:
        d = await db.drives.find_one({"id": drive_ref, "owner_id": owner_id})
        if d and d.get("upload_script_url"):
            return DriveReader(hc, script=d["upload_script_url"], secret=d.get("upload_secret", ""))
    key = await api_key_for(owner_id)
    if key:
        return DriveReader(hc, key=key)
    d = await db.drives.find_one({"owner_id": owner_id, "upload_script_url": {"$nin": [None, ""]}})
    if d:
        return DriveReader(hc, script=d["upload_script_url"], secret=d.get("upload_secret", ""))
    raise HTTPException(400, "Connect a Google Drive first: open My Drives → Add Drive and paste your Drive script link")

# ───────────────────────── photographer-wise Google Drives ─────────────────────────
class DriveIn(BaseModel):
    label: str
    email: str = ""
    root_url: str
    notes: str = ""
    upload_script_url: str = ""   # the photographer's "PhotoVault Drive script" web-app URL (reads folders + Live Booth uploads)
    upload_secret: str = ""
    auto_share: bool = True       # let the script share the main folder as "anyone with the link can view"


class ScriptCheckIn(BaseModel):
    url: str
    secret: str = ""


class ApiKeyIn(BaseModel):
    google_api_key: str = ""


async def drive_owner(user: dict, uid: str = "") -> dict:
    """A photographer manages their own drives; the main admin can manage anyone's (?uid=)."""
    if uid and uid != user["id"]:
        if user["role"] != "superadmin":
            raise HTTPException(403, "Not allowed")
        target = await db.users.find_one({"id": uid})
        if not target:
            raise HTTPException(404, "Photographer not found")
        return target
    return user


async def drive_view(d: dict) -> dict:
    d = clean(d)
    d["method"] = "script" if d.get("upload_script_url") else "api_key"
    d["event_count"] = await db.events.count_documents({"drive_links.drive_ref": d["id"]})
    return d


@api.get("/drives")
async def list_drives(uid: str = "", user: dict = Depends(get_user)):
    owner = await drive_owner(user, uid)
    items = [await drive_view(d) async for d in db.drives.find({"owner_id": owner["id"]}).sort("created_at", 1)]
    key = owner.get("google_api_key", "")
    return {
        "drives": items,
        "has_own_key": bool(key),
        "key_masked": (key[:6] + "…" + key[-4:]) if key else "",
        "has_any_key": bool(await api_key_for(owner["id"])),
        "has_script": any(x.get("upload_script_url") for x in items),
        "owner": {"id": owner["id"], "name": owner.get("name", ""), "studio": (owner.get("studio") or {}).get("name", "")},
    }


async def check_root(owner_id: str, url: str, script: str = "", secret: str = "", share: bool = False) -> dict:
    did = extract_drive_id(url)
    if not did:
        raise HTTPException(400, "That is not a Google Drive folder link")
    async with httpx.AsyncClient(timeout=60) as hc:
        if script:
            rd = DriveReader(hc, script=script, secret=secret)
        else:
            key = await api_key_for(owner_id)
            if not key:
                raise HTTPException(400, "Paste the Drive script link (see the guide on this page)")
            rd = DriveReader(hc, key=key)
        meta = await rd.meta(did)
        if meta["mimeType"] != FOLDER_MIME:
            raise HTTPException(400, "This link is a single file. Please paste a FOLDER link.")
        if share and script:
            await rd.share(meta["id"])
    return meta


@api.post("/drives")
async def add_drive(body: DriveIn, uid: str = "", user: dict = Depends(get_user)):
    owner = await drive_owner(user, uid)
    meta = await check_root(owner["id"], body.root_url, body.upload_script_url.strip(), body.upload_secret.strip(),
                            share=body.auto_share)
    if await db.drives.find_one({"owner_id": owner["id"], "root_id": meta["id"]}):
        raise HTTPException(400, "This folder is already added")
    d = {"id": new_id(), "owner_id": owner["id"], "label": body.label.strip() or meta["name"],
         "email": body.email.strip(), "notes": body.notes, "root_url": body.root_url.strip(),
         "upload_script_url": body.upload_script_url.strip(), "upload_secret": body.upload_secret.strip(),
         "root_id": meta["id"], "root_name": meta["name"], "last_checked": now_iso(), "created_at": now_iso()}
    await db.drives.insert_one(d)
    return await drive_view(d)


@api.put("/drives/{did}")
async def edit_drive(did: str, body: DriveIn, user: dict = Depends(get_user)):
    d = await db.drives.find_one({"id": did, **scope(user)})
    if not d:
        raise HTTPException(404, "Drive not found")
    upd = {"label": body.label.strip() or d["label"], "email": body.email.strip(), "notes": body.notes,
           "upload_script_url": body.upload_script_url.strip(), "upload_secret": body.upload_secret.strip()}
    script_changed = body.upload_script_url.strip() != (d.get("upload_script_url") or "") or \
        body.upload_secret.strip() != (d.get("upload_secret") or "")
    if (body.root_url.strip() and body.root_url.strip() != d["root_url"]) or script_changed:
        meta = await check_root(d["owner_id"], body.root_url.strip() or d["root_url"], body.upload_script_url.strip(),
                                body.upload_secret.strip(), share=body.auto_share)
        upd.update({"root_url": body.root_url.strip(), "root_id": meta["id"], "root_name": meta["name"]})
    await db.drives.update_one({"id": did}, {"$set": upd})
    return await drive_view(await db.drives.find_one({"id": did}))


@api.delete("/drives/{did}")
async def delete_drive(did: str, user: dict = Depends(get_user)):
    await db.drives.delete_one({"id": did, **scope(user)})
    return {"ok": True}


@api.post("/drives/{did}/test")
async def test_drive_conn(did: str, user: dict = Depends(get_user)):
    d = await db.drives.find_one({"id": did, **scope(user)})
    if not d:
        raise HTTPException(404, "Drive not found")
    meta = await check_root(d["owner_id"], d["root_url"], d.get("upload_script_url", ""), d.get("upload_secret", ""))
    await db.drives.update_one({"id": did}, {"$set": {"last_checked": now_iso(), "root_name": meta["name"]}})
    return {"ok": True, "message": f"Connected ✓ — reading folder “{meta['name']}”"}


@api.get("/drives/{did}/browse")
async def browse_drive(did: str, folder_id: str = "", user: dict = Depends(get_user)):
    """Lists sub-folders + photo/video counts of one folder, so events can be created from a folder."""
    d = await db.drives.find_one({"id": did, **scope(user)})
    if not d:
        raise HTTPException(404, "Drive not found")
    fid = folder_id or d["root_id"]
    folders, photos, videos, sample = [], 0, 0, []
    async with httpx.AsyncClient(timeout=120) as hc:
        rd = await reader_for(hc, d["owner_id"], d["id"])
        meta, fl, files = await rd.children(fid)
    for f in fl:
        folders.append({"id": f["id"], "name": f["name"], "modified": f.get("modifiedTime", "")})
    folders.sort(key=lambda x: x["name"].lower())
    for f in files:
        t = media_type(f.get("mimeType", ""))
        if t == "photo":
            photos += 1
            if len(sample) < 6:
                sample.append(f["id"])
        elif t == "video":
            videos += 1
    used = {}
    async for ev in db.events.find({"owner_id": d["owner_id"]}, {"id": 1, "name": 1, "drive_links": 1}):
        for l in ev.get("drive_links", []):
            used.setdefault(l.get("drive_id"), []).append({"id": ev["id"], "name": ev["name"]})
    for f in folders:
        f["url"] = f"https://drive.google.com/drive/folders/{f['id']}"
        f["events"] = used.get(f["id"], [])
    return {"folder": {"id": meta["id"], "name": meta["name"], "url": f"https://drive.google.com/drive/folders/{meta['id']}",
                       "events": used.get(meta["id"], [])},
            "folders": folders, "photos": photos, "videos": videos, "sample": sample}


@api.post("/drives/check-script")
async def check_script(body: ScriptCheckIn, user: dict = Depends(get_user)):
    """Test a Drive script link + secret before saving it."""
    async with httpx.AsyncClient(timeout=60) as hc:
        data = await DriveReader(hc, script=body.url.strip(), secret=body.secret.strip())._call("whoami")
    return {"ok": True, "message": f"Script working ✓ — connected to {data.get('email') or 'your Google account'}"}


@api.put("/admin/photographers/{uid}/api-key")
async def set_photographer_key(uid: str, body: ApiKeyIn, _: dict = Depends(get_superadmin)):
    r = await db.users.update_one({"id": uid}, {"$set": {"google_api_key": body.google_api_key.strip()}})
    if not r.matched_count:
        raise HTTPException(404, "Photographer not found")
    return {"ok": True}


# ───────────────────────── photographers (superadmin) ─────────────────────────
@api.get("/admin/photographers")
async def list_photographers(_: dict = Depends(get_superadmin)):
    out = []
    async for u in db.users.find({"role": "photographer"}).sort("created_at", -1):
        c = clean(u)
        c["has_api_key"] = bool(c.pop("google_api_key", ""))
        c["event_count"] = await db.events.count_documents({"owner_id": u["id"]})
        c["drive_count"] = await db.drives.count_documents({"owner_id": u["id"]})
        out.append(c)
    return out


@api.post("/admin/photographers")
async def create_photographer(body: PhotographerIn, _: dict = Depends(get_superadmin)):
    email = body.email.strip().lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email already registered")
    if not body.password or len(body.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    user = {
        "id": new_id(), "name": body.name, "email": email, "phone": body.phone,
        "password_hash": hash_pw(body.password), "role": "photographer", "active": body.active,
        "studio": default_studio(body.studio_name or body.name), "google_api_key": "",
        "plan_expiry": body.plan_expiry, "notes": body.notes, "created_at": now_iso(),
    }
    await db.users.insert_one(user)
    return clean(user)


@api.put("/admin/photographers/{uid}")
async def update_photographer(uid: str, body: PhotographerIn, _: dict = Depends(get_superadmin)):
    u = await db.users.find_one({"id": uid, "role": "photographer"})
    if not u:
        raise HTTPException(404, "Photographer not found")
    upd = {"name": body.name, "email": body.email.strip().lower(), "phone": body.phone,
           "active": body.active, "plan_expiry": body.plan_expiry, "notes": body.notes}
    if body.studio_name:
        upd["studio"] = {**default_studio(), **(u.get("studio") or {}), "name": body.studio_name}
    if body.password:
        upd["password_hash"] = hash_pw(body.password)
    await db.users.update_one({"id": uid}, {"$set": upd})
    return clean(await db.users.find_one({"id": uid}))


@api.delete("/admin/photographers/{uid}")
async def delete_photographer(uid: str, _: dict = Depends(get_superadmin)):
    async for ev in db.events.find({"owner_id": uid}):
        await purge_event(ev["id"])
    await db.clients.delete_many({"owner_id": uid})
    await db.drives.delete_many({"owner_id": uid})
    await db.users.delete_one({"id": uid, "role": "photographer"})
    return {"ok": True}


# ───────────────────────── clients ─────────────────────────
@api.get("/clients")
async def list_clients(user: dict = Depends(get_user)):
    out = []
    async for c in db.clients.find(scope(user)).sort("name", 1):
        c = clean(c)
        c["event_count"] = await db.events.count_documents({"client_id": c["id"]})
        out.append(c)
    return out


@api.post("/clients")
async def create_client(body: ClientIn, user: dict = Depends(get_user)):
    c = {"id": new_id(), "owner_id": user["id"], **body.model_dump(), "created_at": now_iso()}
    await db.clients.insert_one(c)
    return clean(c)


@api.put("/clients/{cid}")
async def update_client(cid: str, body: ClientIn, user: dict = Depends(get_user)):
    r = await db.clients.update_one({"id": cid, **scope(user)}, {"$set": body.model_dump()})
    if not r.matched_count:
        raise HTTPException(404, "Client not found")
    return clean(await db.clients.find_one({"id": cid}))


@api.delete("/clients/{cid}")
async def delete_client(cid: str, user: dict = Depends(get_user)):
    await db.clients.delete_one({"id": cid, **scope(user)})
    await db.events.update_many({"client_id": cid}, {"$set": {"client_id": ""}})
    return {"ok": True}


# ───────────────────────── events ─────────────────────────
async def event_summary(ev: dict) -> dict:
    e = clean(ev)
    eid = ev["id"]
    e["photo_count"] = await db.media.count_documents({"event_id": eid, "type": "photo"})
    e["video_count"] = await db.media.count_documents({"event_id": eid, "type": "video"})
    e["indexed_count"] = await db.media.count_documents({"event_id": eid, "type": "photo", "indexed": True})
    e["face_count"] = await db.faces.count_documents({"event_id": eid})
    first = await db.media.find_one({"event_id": eid, "type": "photo", "storage": {"$ne": "server"}}, {"file_id": 1})
    e["cover_file_id"] = first["file_id"] if first else ""
    e["guest_count"] = await db.guests.count_documents({"event_id": eid})
    e["pending_requests"] = await db.access_requests.count_documents({"event_id": eid, "status": "pending"})
    paid = 0.0
    async for p in db.payments.find({"event_id": eid}):
        paid += float(p.get("amount", 0))
    e["paid_amount"] = paid
    e["balance"] = float(ev.get("package_amount") or 0) - paid
    if ev.get("client_id"):
        c = await db.clients.find_one({"id": ev["client_id"]})
        e["client_name"] = c["name"] if c else ""
        e["client_phone"] = c.get("phone", "") if c else ""
    return e


def normalise_links(links: List[DriveLinkIn]) -> List[dict]:
    out = []
    for l in links:
        if not l.url.strip():
            continue
        did = extract_drive_id(l.url)
        if not did:
            raise HTTPException(400, f"Not a Google Drive link: {l.url}")
        out.append({"id": l.id or new_id(), "label": l.label.strip() or "Photos",
                    "url": l.url.strip(), "drive_id": did, "drive_ref": l.drive_ref})
    return out


@api.get("/events")
async def list_events(user: dict = Depends(get_user), status: str = "", q: str = ""):
    filt = scope(user)
    if status:
        filt["status"] = status
    if q:
        filt["name"] = {"$regex": re.escape(q), "$options": "i"}
    out = []
    async for ev in db.events.find(filt).sort("date", -1):
        out.append(await event_summary(ev))
    return out


@api.post("/events")
async def create_event(body: EventIn, user: dict = Depends(get_user)):
    data = body.model_dump()
    data["drive_links"] = normalise_links(body.drive_links)
    ev = {"id": new_id(), "owner_id": user["id"], "slug": slugify(body.name), **data,
          "face_version": 0, "last_synced_at": "", "sync_message": "", "created_at": now_iso()}
    await db.events.insert_one(ev)
    return await event_summary(ev)


@api.get("/events/{eid}")
async def get_event(eid: str, user: dict = Depends(get_user)):
    return await event_summary(await own_event(eid, user))


@api.put("/events/{eid}")
async def update_event(eid: str, body: EventIn, user: dict = Depends(get_user)):
    await own_event(eid, user)
    data = body.model_dump()
    data["drive_links"] = normalise_links(body.drive_links)
    await db.events.update_one({"id": eid}, {"$set": data})
    FACE_CACHE.pop(eid, None)
    return await event_summary(await db.events.find_one({"id": eid}))


async def purge_event(eid: str):
    for coll in (db.media, db.faces, db.guests, db.access_requests, db.payments, db.booth_files):
        await coll.delete_many({"event_id": eid})
    await db.events.delete_one({"id": eid})
    FACE_CACHE.pop(eid, None)


@api.delete("/events/{eid}")
async def delete_event(eid: str, user: dict = Depends(get_user)):
    await own_event(eid, user)
    await purge_event(eid)
    return {"ok": True}


# ───────────────────────── Google Drive sync ─────────────────────────
def drive_error(r: httpx.Response) -> str:
    try:
        msg = r.json().get("error", {}).get("message", r.text[:200])
    except Exception:
        msg = r.text[:200]
    if r.status_code == 404:
        return "Folder/file not found — share it as 'Anyone with the link can view'"
    return msg


async def drive_get(hc: httpx.AsyncClient, file_id: str, key: str) -> dict:
    r = await hc.get(f"{DRIVE_API}/{file_id}", params={
        "key": key, "supportsAllDrives": "true",
        "fields": "id,name,mimeType,size,createdTime,imageMediaMetadata(width,height,time),"
                  "videoMediaMetadata(width,height,durationMillis)"})
    if r.status_code != 200:
        raise HTTPException(400, drive_error(r))
    return r.json()


async def drive_list(hc: httpx.AsyncClient, folder_id: str, key: str, album: str,
                     out: List[dict], depth: int = 0):
    if depth > 6:
        return
    token = None
    subfolders = []
    while True:
        params = {
            "q": f"'{folder_id}' in parents and trashed=false", "key": key, "pageSize": 1000,
            "supportsAllDrives": "true", "includeItemsFromAllDrives": "true", "orderBy": "name",
            "fields": "nextPageToken,files(id,name,mimeType,size,createdTime,imageMediaMetadata(width,height,time),"
                      "videoMediaMetadata(width,height,durationMillis))",
        }
        if token:
            params["pageToken"] = token
        r = await hc.get(DRIVE_API, params=params)
        if r.status_code != 200:
            raise HTTPException(400, drive_error(r))
        data = r.json()
        for f in data.get("files", []):
            if f["mimeType"] == FOLDER_MIME:
                subfolders.append(f)
            elif media_type(f["mimeType"]):
                f["_album"] = album
                out.append(f)
        token = data.get("nextPageToken")
        if not token:
            break
    for sf in subfolders:
        sub_album = f"{album} / {sf['name']}" if album else sf["name"]
        await drive_list(hc, sf["id"], key, sub_album, out, depth + 1)


@api.post("/events/{eid}/sync")
async def sync_event(eid: str, user: dict = Depends(get_user)):
    ev = await own_event(eid, user)
    if not ev.get("drive_links"):
        raise HTTPException(400, "Add at least one Google Drive link to this event")

    found: List[dict] = []
    errors = []
    async with httpx.AsyncClient(timeout=120) as hc:
        for link in ev["drive_links"]:
            try:
                rd = await reader_for(hc, ev["owner_id"], link.get("drive_ref", ""))
                meta = await rd.meta(link["drive_id"])
                if meta["mimeType"] == FOLDER_MIME:
                    found.extend(await rd.tree(meta["id"], link["label"]))
                elif media_type(meta["mimeType"]):
                    meta["_album"] = link["label"]
                    found.append(meta)
            except HTTPException as e:
                errors.append(f"{link['label']}: {e.detail}")

    seen = set()
    added = 0
    for f in found:
        if f["id"] in seen:
            continue
        seen.add(f["id"])
        img = f.get("imageMediaMetadata") or {}
        vid = f.get("videoMediaMetadata") or {}
        fields = {
            "name": f["name"], "mime": f["mimeType"], "type": media_type(f["mimeType"]),
            "album": f.get("_album", ""), "size": int(f.get("size") or 0),
            "width": img.get("width") or vid.get("width"), "height": img.get("height") or vid.get("height"),
            "duration_ms": int(vid.get("durationMillis") or 0), "taken_at": img.get("time") or f.get("createdTime", ""),
        }
        existing = await db.media.find_one({"event_id": eid, "file_id": f["id"]})
        if existing:
            if existing.get("source") == "booth":
                continue
            await db.media.update_one({"id": existing["id"]}, {"$set": fields})
        else:
            await db.media.insert_one({"id": new_id(), "event_id": eid, "file_id": f["id"],
                                       "indexed": False, "face_count": 0, **fields, "created_at": now_iso()})
            added += 1

    removed = 0
    if not errors:  # only clean up when every link was read successfully
        async for m in db.media.find({"event_id": eid, "source": {"$ne": "booth"}}):
            if m["file_id"] not in seen:
                await db.faces.delete_many({"media_id": m["id"]})
                await db.media.delete_one({"id": m["id"]})
                removed += 1

    msg = f"Found {len(seen)} files · {added} new · {removed} removed"
    if errors:
        msg += " · Errors: " + "; ".join(errors)
    await db.events.update_one({"id": eid}, {"$set": {"last_synced_at": now_iso(), "sync_message": msg},
                                             "$inc": {"face_version": 1 if removed else 0}})
    FACE_CACHE.pop(eid, None)
    if errors and not seen:
        raise HTTPException(400, msg)
    return {"ok": True, "message": msg, "total": len(seen), "added": added, "removed": removed, "errors": errors}


@api.get("/events/{eid}/media")
async def event_media(eid: str, user: dict = Depends(get_user), type: str = "", album: str = ""):
    await own_event(eid, user)
    filt: Dict[str, Any] = {"event_id": eid}
    if type:
        filt["type"] = type
    if album:
        filt["album"] = album
    return [{**clean(m), **public_media(m)} async for m in db.media.find(filt).sort([("album", 1), ("name", 1)])]


@api.get("/media/thumb/{file_id}")
async def media_thumb(file_id: str, sz: int = 1024, user: dict = Depends(get_user)):
    """Only used by the admin browser while face-indexing (images need CORS for canvas)."""
    m = await db.media.find_one({"file_id": file_id})
    if not m:
        raise HTTPException(404, "Unknown file")
    ev = await own_event(m["event_id"], user)
    sz = max(200, min(sz, 2000))
    async with httpx.AsyncClient(timeout=40, follow_redirects=True) as hc:
        r = await hc.get(f"https://drive.google.com/thumbnail?id={file_id}&sz=w{sz}")
        if r.status_code != 200 or not r.headers.get("content-type", "").startswith("image/"):
            key = await api_key_for(ev["owner_id"])
            meta = await hc.get(f"{DRIVE_API}/{file_id}", params={"key": key, "fields": "thumbnailLink",
                                                                    "supportsAllDrives": "true"})
            link = (meta.json() or {}).get("thumbnailLink") if meta.status_code == 200 else None
            if not link:
                raise HTTPException(502, "Google did not return a thumbnail for this file")
            r = await hc.get(re.sub(r"=s\d+$", f"=s{sz}", link))
            if r.status_code != 200:
                raise HTTPException(502, "Could not load thumbnail from Google")
    return Response(content=r.content, media_type=r.headers.get("content-type", "image/jpeg"),
                    headers={"Cache-Control": "private, max-age=3600"})


# ───────────────────────── face index ─────────────────────────
FACE_CACHE: Dict[str, Any] = {}


@api.get("/events/{eid}/index/pending")
async def index_pending(eid: str, user: dict = Depends(get_user)):
    await own_event(eid, user)
    items = [{"id": m["id"], "file_id": m["file_id"], "name": m["name"]}
             async for m in db.media.find({"event_id": eid, "type": "photo", "indexed": {"$ne": True}})]
    return {"pending": items}


@api.post("/events/{eid}/index/{mid}")
async def index_media(eid: str, mid: str, body: IndexIn, user: dict = Depends(get_user)):
    await own_event(eid, user)
    m = await db.media.find_one({"id": mid, "event_id": eid})
    if not m:
        raise HTTPException(404, "Photo not found")
    await db.faces.delete_many({"media_id": mid})
    docs = []
    for d in body.faces:
        if len(d) != 128:
            continue
        docs.append({"id": new_id(), "event_id": eid, "media_id": mid, "file_id": m["file_id"],
                     "descriptor": [round(float(x), 6) for x in d]})
    if docs:
        await db.faces.insert_many(docs)
    await db.media.update_one({"id": mid}, {"$set": {"indexed": True, "face_count": len(docs),
                                                     "index_error": body.error, "indexed_at": now_iso()}})
    await db.events.update_one({"id": eid}, {"$inc": {"face_version": 1}})
    FACE_CACHE.pop(eid, None)
    return {"ok": True, "faces": len(docs)}


@api.delete("/events/{eid}/index")
async def reset_index(eid: str, user: dict = Depends(get_user)):
    await own_event(eid, user)
    await db.faces.delete_many({"event_id": eid})
    await db.media.update_many({"event_id": eid}, {"$set": {"indexed": False, "face_count": 0}})
    await db.events.update_one({"id": eid}, {"$inc": {"face_version": 1}})
    FACE_CACHE.pop(eid, None)
    return {"ok": True}


async def face_matrix(ev: dict):
    eid = ev["id"]
    ver = ev.get("face_version", 0)
    cached = FACE_CACHE.get(eid)
    if cached and cached[0] == ver:
        return cached[1], cached[2]
    ids, vecs = [], []
    async for f in db.faces.find({"event_id": eid}, {"media_id": 1, "descriptor": 1}):
        ids.append(f["media_id"])
        vecs.append(f["descriptor"])
    mat = np.array(vecs, dtype=np.float32) if vecs else np.zeros((0, 128), dtype=np.float32)
    FACE_CACHE[eid] = (ver, ids, mat)
    return ids, mat


# ───────────────────────── guests / requests (admin) ─────────────────────────
@api.get("/events/{eid}/guests")
async def event_guests(eid: str, user: dict = Depends(get_user)):
    await own_event(eid, user)
    out = []
    async for g in db.guests.find({"event_id": eid}).sort("created_at", -1):
        g = clean(g)
        g.pop("token", None)
        g["match_count"] = len(g.pop("matched_ids", []) or [])
        out.append(g)
    return out


async def request_view(r: dict) -> dict:
    r = clean(r)
    ev = await db.events.find_one({"id": r["event_id"]}) or {}
    r["event_name"] = ev.get("name", "")
    r["event_slug"] = ev.get("slug", "")
    return r


@api.get("/requests")
async def all_requests(user: dict = Depends(get_user), status: str = "", event_id: str = ""):
    filt = scope(user)
    if status:
        filt["status"] = status
    if event_id:
        filt["event_id"] = event_id
    return [await request_view(r) async for r in db.access_requests.find(filt).sort("created_at", -1)]


async def decide(rid: str, status: str, note: str, user: dict):
    r = await db.access_requests.find_one({"id": rid, **scope(user)})
    if not r:
        raise HTTPException(404, "Request not found")
    await db.access_requests.update_one({"id": rid}, {"$set": {"status": status, "decision_note": note,
                                                               "decided_at": now_iso()}})
    await db.guests.update_one({"id": r["guest_id"]}, {"$set": {"access_status": status}})
    return await request_view(await db.access_requests.find_one({"id": rid}))


@api.post("/requests/{rid}/approve")
async def approve(rid: str, body: DecisionIn, user: dict = Depends(get_user)):
    return await decide(rid, "approved", body.note, user)


@api.post("/requests/{rid}/reject")
async def reject(rid: str, body: DecisionIn, user: dict = Depends(get_user)):
    return await decide(rid, "rejected", body.note, user)


@api.post("/events/{eid}/guests/{gid}/access")
async def set_guest_access(eid: str, gid: str, body: Dict[str, Any], user: dict = Depends(get_user)):
    await own_event(eid, user)
    status = body.get("status", "approved")
    if status not in ("approved", "rejected", "none"):
        raise HTTPException(400, "Bad status")
    await db.guests.update_one({"id": gid, "event_id": eid}, {"$set": {"access_status": status}})
    await db.access_requests.update_many({"guest_id": gid, "status": "pending"},
                                         {"$set": {"status": status if status != "none" else "rejected",
                                                   "decided_at": now_iso()}})
    return {"ok": True}


# ───────────────────────── payments ─────────────────────────
@api.get("/events/{eid}/payments")
async def event_payments(eid: str, user: dict = Depends(get_user)):
    await own_event(eid, user)
    return [clean(p) async for p in db.payments.find({"event_id": eid}).sort("date", -1)]


@api.post("/events/{eid}/payments")
async def add_payment(eid: str, body: PaymentIn, user: dict = Depends(get_user)):
    ev = await own_event(eid, user)
    p = {"id": new_id(), "event_id": eid, "owner_id": ev["owner_id"], **body.model_dump(), "created_at": now_iso()}
    if not p["date"]:
        p["date"] = dt.date.today().isoformat()
    await db.payments.insert_one(p)
    return clean(p)


@api.delete("/payments/{pid}")
async def delete_payment(pid: str, user: dict = Depends(get_user)):
    await db.payments.delete_one({"id": pid, **scope(user)})
    return {"ok": True}


@api.get("/payments")
async def payments_overview(user: dict = Depends(get_user)):
    rows = []
    async for ev in db.events.find(scope(user)).sort("date", -1):
        s = await event_summary(ev)
        rows.append({k: s.get(k) for k in ("id", "name", "date", "client_name", "client_phone",
                                           "package_amount", "paid_amount", "balance", "status")})
    recent = [clean(p) async for p in db.payments.find(scope(user)).sort("created_at", -1).limit(20)]
    names = {r["id"]: r["name"] for r in rows}
    for p in recent:
        p["event_name"] = names.get(p["event_id"], "")
    return {
        "events": rows, "recent": recent,
        "total_package": sum(float(r["package_amount"] or 0) for r in rows),
        "total_paid": sum(r["paid_amount"] for r in rows),
        "total_due": sum(max(r["balance"], 0) for r in rows),
    }


# ───────────────────────── dashboard ─────────────────────────
@api.get("/dashboard")
async def dashboard(user: dict = Depends(get_user)):
    s = scope(user)
    event_ids = [e["id"] async for e in db.events.find(s, {"id": 1})]
    ein = {"event_id": {"$in": event_ids}}
    today = dt.date.today().isoformat()
    upcoming = [await event_summary(e) async for e in
                db.events.find({**s, "date": {"$gte": today}}).sort("date", 1).limit(5)]
    recent_guests = []
    async for g in db.guests.find(ein).sort("created_at", -1).limit(8):
        g = clean(g)
        g.pop("token", None)
        g["match_count"] = len(g.pop("matched_ids", []) or [])
        ev = await db.events.find_one({"id": g["event_id"]}) or {}
        g["event_name"] = ev.get("name", "")
        recent_guests.append(g)
    pay = await payments_overview(user)
    data = {
        "events": len(event_ids),
        "photos": await db.media.count_documents({**ein, "type": "photo"}),
        "videos": await db.media.count_documents({**ein, "type": "video"}),
        "faces": await db.faces.count_documents(ein),
        "guests": await db.guests.count_documents(ein),
        "pending_requests": await db.access_requests.count_documents({**s, "status": "pending"}),
        "clients": await db.clients.count_documents(s),
        "total_due": pay["total_due"], "total_paid": pay["total_paid"],
        "upcoming": upcoming, "recent_guests": recent_guests,
    }
    if user["role"] == "superadmin":
        data["photographers"] = await db.users.count_documents({"role": "photographer"})
    return data



# ───────────────────────── LIVE BOOTH (instant photo → QR → guest downloads) ─────────────────────────
class BoothShotIn(BaseModel):
    name: str = ""
    width: Optional[int] = None
    height: Optional[int] = None
    faces: List[List[float]] = []
    # Option A — already saved in Google Drive by the photographer's Apps Script:
    file_id: str = ""
    drive_ref: str = ""
    # Option B — keep on this server (base64 JPEGs, resized in the browser):
    full_b64: str = ""
    thumb_b64: str = ""


MAX_SERVER_SHOT = 6 * 1024 * 1024


def short_code(n: int = 7) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(n))


def decode_b64(data: str) -> bytes:
    if "," in data[:100]:
        data = data.split(",", 1)[1]
    raw = base64.b64decode(data)
    if len(raw) > MAX_SERVER_SHOT:
        raise HTTPException(413, "Photo too large (max 6 MB after resizing)")
    return raw


@api.post("/events/{eid}/booth/shots")
async def booth_add(eid: str, body: BoothShotIn, user: dict = Depends(get_user)):
    ev = await own_event(eid, user)
    mid = new_id()
    doc = {"id": mid, "event_id": eid, "type": "photo", "mime": "image/jpeg", "album": "Live booth",
           "name": body.name or f"booth_{dt.datetime.now().strftime('%H%M%S')}.jpg",
           "width": body.width, "height": body.height, "source": "booth", "created_at": now_iso(),
           "taken_at": now_iso(), "size": 0, "duration_ms": 0}
    while True:
        code = short_code()
        if not await db.media.find_one({"code": code}):
            break
    doc["code"] = code
    if body.file_id:
        doc.update({"file_id": body.file_id, "storage": "drive", "drive_ref": body.drive_ref})
    elif body.full_b64:
        full_id, thumb_id = new_id(), new_id()
        await db.booth_files.insert_one({"id": full_id, "event_id": eid, "mime": "image/jpeg", "data": decode_b64(body.full_b64)})
        await db.booth_files.insert_one({"id": thumb_id, "event_id": eid, "mime": "image/jpeg",
                                         "data": decode_b64(body.thumb_b64 or body.full_b64)})
        doc.update({"file_id": f"srv_{full_id}", "storage": "server", "server_full": full_id, "server_thumb": thumb_id})
    else:
        raise HTTPException(400, "No photo received")
    faces = [d for d in body.faces if len(d) == 128]
    doc.update({"indexed": True, "face_count": len(faces), "indexed_at": now_iso()})
    await db.media.insert_one(doc)
    if faces:
        await db.faces.insert_many([{"id": new_id(), "event_id": eid, "media_id": mid, "file_id": doc["file_id"],
                                     "descriptor": [round(float(x), 6) for x in f]} for f in faces])
        await db.events.update_one({"id": eid}, {"$inc": {"face_version": 1}})
        FACE_CACHE.pop(eid, None)
    return {**public_media(doc), "created_at": doc["created_at"], "face_count": len(faces)}


@api.get("/events/{eid}/booth/shots")
async def booth_list(eid: str, user: dict = Depends(get_user), limit: int = 60):
    await own_event(eid, user)
    out = []
    async for m in db.media.find({"event_id": eid, "source": "booth"}).sort("created_at", -1).limit(min(limit, 500)):
        out.append({**public_media(m), "created_at": m["created_at"], "face_count": m.get("face_count", 0),
                    "downloads": m.get("downloads", 0)})
    total = await db.media.count_documents({"event_id": eid, "source": "booth"})
    return {"shots": out, "total": total}


@api.delete("/booth/shots/{mid}")
async def booth_delete(mid: str, user: dict = Depends(get_user)):
    m = await db.media.find_one({"id": mid, "source": "booth"})
    if not m:
        raise HTTPException(404, "Shot not found")
    await own_event(m["event_id"], user)
    await db.faces.delete_many({"media_id": mid})
    if m.get("storage") == "server":
        await db.booth_files.delete_many({"id": {"$in": [m.get("server_full"), m.get("server_thumb")]}})
    await db.media.delete_one({"id": mid})
    await db.events.update_one({"id": m["event_id"]}, {"$inc": {"face_version": 1}})
    FACE_CACHE.pop(m["event_id"], None)
    return {"ok": True}


@api.get("/booth/file/{fid}")
async def booth_file(fid: str):
    f = await db.booth_files.find_one({"id": fid})
    if not f:
        raise HTTPException(404, "Photo not found")
    return Response(content=bytes(f["data"]), media_type=f.get("mime", "image/jpeg"),
                    headers={"Cache-Control": "public, max-age=604800, immutable"})


@api.get("/booth/drives")
async def booth_drives(user: dict = Depends(get_user)):
    """Drives of the logged-in photographer that can receive Live Booth uploads."""
    out = []
    async for d in db.drives.find({"owner_id": user["id"], "upload_script_url": {"$nin": [None, ""]}}):
        out.append({"id": d["id"], "label": d["label"], "email": d.get("email", ""),
                    "upload_script_url": d["upload_script_url"], "upload_secret": d.get("upload_secret", "")})
    return out


@api.get("/public/shot/{code}")
async def pub_shot(code: str):
    m = await db.media.find_one({"code": code, "source": "booth"})
    if not m:
        raise HTTPException(404, "This photo link is not valid")
    ev = await db.events.find_one({"id": m["event_id"]}) or {}
    owner = await db.users.find_one({"id": ev.get("owner_id")}) or {}
    exp = (ev.get("settings") or {}).get("expires_on")
    if exp and exp < dt.date.today().isoformat():
        raise HTTPException(410, "This photo has expired. Please contact the photographer.")
    await db.media.update_one({"id": m["id"]}, {"$inc": {"views": 1}})
    st = ev.get("settings") or {}
    return {"photo": public_media(m), "taken_at": m.get("created_at"),
            "event": {"name": ev.get("name", ""), "slug": ev.get("slug", ""), "date": ev.get("date", ""),
                      "selfie_search": st.get("selfie_search", True), "allow_download": st.get("allow_download", True)},
            "studio": {**default_studio(), **(owner.get("studio") or {})}}


@api.post("/public/shot/{code}/downloaded")
async def pub_shot_downloaded(code: str):
    await db.media.update_one({"code": code, "source": "booth"}, {"$inc": {"downloads": 1}})
    return {"ok": True}


@api.get("/public/events/{slug}/live")
async def pub_live(slug: str, limit: int = 30):
    """Feed for the venue TV / projector screen."""
    ev = await public_event(slug)
    if not (ev.get("settings") or {}).get("live_screen", True):
        raise HTTPException(403, "Live screen is turned off for this event")
    shots = [public_media(m) async for m in
             db.media.find({"event_id": ev["id"], "source": "booth"}).sort("created_at", -1).limit(min(limit, 100))]
    owner = ev["_owner"]
    return {"event": {"name": ev["name"], "slug": ev["slug"]}, "shots": shots,
            "total": await db.media.count_documents({"event_id": ev["id"], "source": "booth"}),
            "studio": {**default_studio(), **(owner.get("studio") or {})}}


# ───────────────────────── PUBLIC (guest) ─────────────────────────
async def public_event(slug: str) -> dict:
    ev = await db.events.find_one({"slug": slug})
    if not ev:
        raise HTTPException(404, "This event link is not valid")
    owner = await db.users.find_one({"id": ev["owner_id"]}) or {}
    if not owner.get("active", True):
        raise HTTPException(403, "This gallery is currently unavailable")
    exp = (ev.get("settings") or {}).get("expires_on")
    if exp and exp < dt.date.today().isoformat():
        raise HTTPException(410, "This gallery has expired. Please contact the photographer.")
    ev["_owner"] = owner
    return ev


async def guest_by_token(ev: dict, token: str) -> dict:
    g = await db.guests.find_one({"token": token, "event_id": ev["id"]}) if token else None
    if not g:
        raise HTTPException(401, "Please enter your details again")
    return g


def can_see_all(ev: dict, g: Optional[dict]) -> bool:
    return bool((ev.get("settings") or {}).get("public_gallery")) or bool(g and g.get("access_status") == "approved")


@api.get("/public/events/{slug}")
async def pub_event(slug: str):
    ev = await public_event(slug)
    st = ev.get("settings") or {}
    owner = ev["_owner"]
    cover_file = None
    if not ev.get("cover_url"):
        first = await db.media.find_one({"event_id": ev["id"], "type": "photo", "storage": {"$ne": "server"}})
        cover_file = first["file_id"] if first else None
    return {
        "name": ev["name"], "event_type": ev.get("event_type", ""), "date": ev.get("date", ""),
        "end_date": ev.get("end_date", ""), "venue": ev.get("venue", ""), "description": ev.get("description", ""),
        "cover_url": ev.get("cover_url", ""), "cover_file_id": cover_file,
        "photo_count": await db.media.count_documents({"event_id": ev["id"], "type": "photo"}),
        "video_count": await db.media.count_documents({"event_id": ev["id"], "type": "video"}),
        "indexed_count": await db.media.count_documents({"event_id": ev["id"], "type": "photo", "indexed": True}),
        "settings": {
            "selfie_search": st.get("selfie_search", True), "requires_pin": bool(st.get("pin")),
            "allow_download": st.get("allow_download", True), "public_gallery": st.get("public_gallery", False),
            "require_guest_details": st.get("require_guest_details", True),
            "welcome_message": st.get("welcome_message", ""),
        },
        "studio": {**default_studio(), **(owner.get("studio") or {})},
    }


@api.post("/public/events/{slug}/verify-pin")
async def pub_verify_pin(slug: str, body: PinIn):
    ev = await public_event(slug)
    pin = (ev.get("settings") or {}).get("pin", "")
    if pin and body.pin.strip() != pin:
        raise HTTPException(403, "Wrong PIN")
    return {"ok": True}


@api.post("/public/events/{slug}/guest")
async def pub_guest(slug: str, body: GuestIn):
    ev = await public_event(slug)
    st = ev.get("settings") or {}
    if st.get("pin") and body.pin.strip() != st["pin"]:
        raise HTTPException(403, "Wrong PIN")
    phone = re.sub(r"\D", "", body.phone)[-10:]
    if st.get("require_guest_details", True):
        if not body.name.strip():
            raise HTTPException(400, "Please enter your name")
        if len(phone) < 10:
            raise HTTPException(400, "Please enter a valid 10-digit mobile number")
    g = await db.guests.find_one({"event_id": ev["id"], "phone": phone}) if phone else None
    if g:
        await db.guests.update_one({"id": g["id"]}, {"$set": {"name": body.name.strip() or g.get("name", ""),
                                                             "email": body.email or g.get("email", ""),
                                                             "last_seen": now_iso()}})
        g = await db.guests.find_one({"id": g["id"]})
    else:
        g = {"id": new_id(), "event_id": ev["id"], "owner_id": ev["owner_id"], "name": body.name.strip(),
             "phone": phone, "email": body.email.strip(), "token": secrets.token_urlsafe(24),
             "access_status": "none", "matched_ids": [], "searches": 0,
             "created_at": now_iso(), "last_seen": now_iso()}
        await db.guests.insert_one(g)
    return {"token": g["token"], "name": g["name"], "access_status": g.get("access_status", "none")}


@api.get("/public/events/{slug}/me")
async def pub_me(slug: str, token: str = Query("")):
    ev = await public_event(slug)
    g = await guest_by_token(ev, token)
    req = await db.access_requests.find_one({"guest_id": g["id"]}, sort=[("created_at", -1)])
    return {"name": g["name"], "phone": g.get("phone", ""), "access_status": g.get("access_status", "none"),
            "can_see_all": can_see_all(ev, g), "match_count": len(g.get("matched_ids") or []),
            "last_request": clean(req) if req else None}


@api.post("/public/events/{slug}/match")
async def pub_match(slug: str, body: MatchIn):
    ev = await public_event(slug)
    st = ev.get("settings") or {}
    if not st.get("selfie_search", True):
        raise HTTPException(403, "Selfie search is turned off for this event")
    g = await guest_by_token(ev, body.token)
    if len(body.descriptor) != 128:
        raise HTTPException(400, "Could not read your face, please try another selfie")
    ids, mat = await face_matrix(ev)
    if not len(ids):
        raise HTTPException(400, "Photos are still being prepared. Please try again a little later.")
    q = np.array(body.descriptor, dtype=np.float32)
    dists = np.linalg.norm(mat - q, axis=1)
    thr = float(st.get("match_threshold") or 0.5)
    best: Dict[str, float] = {}
    for mid, d in zip(ids, dists.tolist()):
        if d <= thr and (mid not in best or d < best[mid]):
            best[mid] = d
    order = sorted(best, key=best.get)
    media = {m["id"]: m async for m in db.media.find({"id": {"$in": order}})}
    results = [{**public_media(media[i]), "score": round(1 - best[i], 3)} for i in order if i in media]
    await db.guests.update_one({"id": g["id"]}, {"$set": {"matched_ids": order, "last_seen": now_iso()},
                                                 "$inc": {"searches": 1}})
    return {"count": len(results), "results": results}


@api.get("/public/events/{slug}/my-photos")
async def pub_my_photos(slug: str, token: str = Query("")):
    ev = await public_event(slug)
    g = await guest_by_token(ev, token)
    order = g.get("matched_ids") or []
    media = {m["id"]: m async for m in db.media.find({"id": {"$in": order}})}
    return {"results": [public_media(media[i]) for i in order if i in media]}


@api.post("/public/events/{slug}/request-access")
async def pub_request_access(slug: str, body: AccessIn):
    ev = await public_event(slug)
    g = await guest_by_token(ev, body.token)
    if g.get("access_status") == "approved":
        return {"status": "approved"}
    existing = await db.access_requests.find_one({"guest_id": g["id"], "status": "pending"})
    if existing:
        return {"status": "pending", "request": clean(existing)}
    r = {"id": new_id(), "event_id": ev["id"], "owner_id": ev["owner_id"], "guest_id": g["id"],
         "guest_name": g["name"], "guest_phone": g.get("phone", ""), "message": body.message.strip()[:500],
         "status": "pending", "created_at": now_iso()}
    await db.access_requests.insert_one(r)
    await db.guests.update_one({"id": g["id"]}, {"$set": {"access_status": "pending"}})
    return {"status": "pending", "request": clean(r)}


@api.get("/public/events/{slug}/gallery")
async def pub_gallery(slug: str, token: str = Query("")):
    ev = await public_event(slug)
    g = None
    if token:
        g = await db.guests.find_one({"token": token, "event_id": ev["id"]})
    if not can_see_all(ev, g):
        raise HTTPException(403, "You need the photographer's approval to see all photos")
    items = [public_media(m) async for m in db.media.find({"event_id": ev["id"]}).sort([("album", 1), ("name", 1)])]
    albums = []
    for m in items:
        if m["album"] not in albums:
            albums.append(m["album"])
    folders = [{"label": l.get("label", ""), "url": l.get("url", "")} for l in ev.get("drive_links", [])] \
        if (ev.get("settings") or {}).get("allow_download", True) else []
    return {"albums": albums, "results": items, "folders": folders}


# ───────────────────────── wire up ─────────────────────────
app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def ensure_ready(request, call_next):
    # Serverless hosts (Vercel) may skip the startup event — run it once on the first request.
    if not _READY["done"]:
        try:
            await startup()
        except Exception as e:  # never block a request on seeding/index creation
            _READY["done"] = False
            log.warning("startup on first request failed: %s", e)
    return await call_next(request)


@app.on_event("shutdown")
async def shutdown():
    try:
        db.close()
    except Exception:
        pass

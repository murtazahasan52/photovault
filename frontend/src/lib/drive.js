// Images/videos load straight from Google Drive — nothing passes through our server.
// (Exception: Live Booth shots saved on the server when no Drive upload script is set — they carry `url`.)
const BASE = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");

export const thumb = (id, w = 600) => `https://lh3.googleusercontent.com/d/${id}=w${w}`;
export const thumbFallback = (id, w = 600) => `https://drive.google.com/thumbnail?id=${id}&sz=w${w}`;
export const fullImg = (id) => `https://lh3.googleusercontent.com/d/${id}=w2000`;
export const videoPreview = (id) => `https://drive.google.com/file/d/${id}/preview`;
export const download = (id) => `https://drive.google.com/uc?export=download&id=${id}`;
export const openInDrive = (id) => `https://drive.google.com/file/d/${id}/view`;

const abs = (u) => (u && u.startsWith("/") ? BASE + u : u);

/** Media-object aware helpers (handle Drive files and server-stored booth shots). */
export const mThumb = (m, w = 600) => (m.thumb_url ? abs(w > 700 ? m.url : m.thumb_url) : thumb(m.file_id, w));
export const mFull = (m) => (m.url ? abs(m.url) : fullImg(m.file_id));
export const mDownload = (m) => (m.url ? abs(m.url) : download(m.file_id));
export const mOpen = (m) => (m.url ? abs(m.url) : openInDrive(m.file_id));
export const isServer = (m) => !!m.url;

export function onImgError(e, id, w = 600) {
  const el = e.currentTarget;
  if (!el.dataset.fb && id && !String(id).startsWith("srv_")) {
    el.dataset.fb = "1";
    el.src = thumbFallback(id, w);
  }
}

/** Save a photo to the device. Server-stored shots download directly; Drive files via Google's download link. */
export async function saveToDevice(m, filename) {
  if (m.url) {
    try {
      const r = await fetch(abs(m.url));
      const blob = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename || m.name || "photo.jpg";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
      return;
    } catch (_) { window.open(abs(m.url), "_blank"); return; }
  }
  const f = document.createElement("iframe");
  f.style.display = "none";
  f.src = download(m.file_id);
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 60000);
}

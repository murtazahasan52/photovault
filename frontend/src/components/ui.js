import React, { useEffect, useCallback } from "react";
import { mThumb, mFull, mDownload, mOpen, videoPreview, onImgError } from "../lib/drive";

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? "wide" : ""}`}>
        <div className="modal-head">
          <h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2>
          <button className="x" onClick={onClose}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Pill({ s }) {
  return <span className={`pill ${s || ""}`}>{s || "—"}</span>;
}

export function Loader({ dark = true }) {
  return <div style={{ padding: 40 }}><div className={`spinner ${dark ? "dark" : ""}`} /></div>;
}

export function Lightbox({ items, index, onClose, onIndex, allowDownload = true }) {
  const m = items[index];
  const prev = useCallback(() => onIndex((index - 1 + items.length) % items.length), [index, items.length, onIndex]);
  const next = useCallback(() => onIndex((index + 1) % items.length), [index, items.length, onIndex]);
  useEffect(() => {
    const k = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose, prev, next]);
  if (!m) return null;
  return (
    <div className="lightbox">
      <div className="lb-top">
        <span className="small" style={{ opacity: 0.7 }}>{index + 1} / {items.length} {m.album ? `· ${m.album}` : ""}</span>
        <div className="row">
          {allowDownload && <a className="btn sm" href={mDownload(m)} target="_blank" rel="noreferrer" download>⬇ Download</a>}
          <a className="btn sm" href={mOpen(m)} target="_blank" rel="noreferrer">Open</a>
          <button className="btn sm" onClick={onClose}>✕</button>
        </div>
      </div>
      <div className="lb-body">
        {m.type === "video" ? (
          <iframe title={m.name} src={videoPreview(m.file_id)} allow="autoplay; fullscreen" allowFullScreen />
        ) : (
          <img key={m.file_id} src={mFull(m)} alt={m.name} onError={(e) => onImgError(e, m.file_id, 2000)} />
        )}
        {items.length > 1 && <>
          <button className="lb-nav l" onClick={prev}>‹</button>
          <button className="lb-nav r" onClick={next}>›</button>
        </>}
      </div>
    </div>
  );
}

export function Thumb({ m, w = 400, className }) {
  return (
    <img className={className} loading="lazy" src={mThumb(m, w)} alt={m.name || ""}
      referrerPolicy="no-referrer" onError={(e) => onImgError(e, m.file_id, w)} />
  );
}

export function waLink(phone, text) {
  const p = String(phone || "").replace(/\D/g, "");
  const num = p.length === 10 ? "91" + p : p;
  return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
}

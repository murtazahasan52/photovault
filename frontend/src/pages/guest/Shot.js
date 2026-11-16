import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { pub, errMsg, fmtDate } from "../../lib/api";
import { mFull, onImgError, saveToDevice } from "../../lib/drive";

/** Page a guest opens by scanning the Live Booth QR — one photo, one tap to download. */
export default function Shot() {
  const { code } = useParams();
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => { pub.get(`/shot/${code}`).then((r) => setD(r.data)).catch((e) => setErr(errMsg(e))); }, [code]);

  if (err) return <div className="g"><div className="g-wrap" style={{ paddingTop: 80 }}><div className="g-card center"><div style={{ fontSize: 40 }}>📷</div><h2>{err}</h2></div></div></div>;
  if (!d) return <div className="g" style={{ display: "grid", placeItems: "center" }}><div className="spinner" /></div>;

  const brand = d.studio.brand_color || "#c8a24a";
  const name = `${(d.event.name || "photo").replace(/[^a-z0-9]+/gi, "_")}_${code}.jpg`;
  const download = async () => {
    await saveToDevice(d.photo, name);
    setSaved(true);
    pub.post(`/shot/${code}/downloaded`).catch(() => {});
  };
  const pageUrl = window.location.href;

  return (
    <div className="g" style={{ "--brand": brand }}>
      <div className="g-wrap" style={{ paddingTop: 18, maxWidth: 640 }}>
        <div className="g-studio">
          {d.studio.logo_url && <img src={d.studio.logo_url} alt="" />}
          <span>{d.studio.name}</span>
        </div>
        <div className="small" style={{ letterSpacing: ".12em", textTransform: "uppercase", color: brand, fontWeight: 600 }}>{fmtDate(d.event.date)}</div>
        <h1 className="serif" style={{ fontSize: 28, margin: "4px 0 14px" }}>{d.event.name}</h1>

        <div className="shot-photo">
          <img src={mFull(d.photo)} alt="Your photo" onError={(e) => onImgError(e, d.photo.file_id, 2000)} referrerPolicy="no-referrer" />
        </div>

        {d.event.allow_download && (
          <button className="btn gold block" style={{ padding: 15, fontSize: 17, marginTop: 14 }} onClick={download}>
            ⬇ {saved ? "Download again" : "Download photo"}
          </button>
        )}
        {saved && <p className="small muted center">Saved! On iPhone, if it opens in a new tab, long-press the photo → “Save to Photos”.</p>}
        <div className="row" style={{ marginTop: 10 }}>
          <a className="btn block" style={{ flex: 1, justifyContent: "center" }} href={`https://wa.me/?text=${encodeURIComponent(`My photo from ${d.event.name} 📸 ${pageUrl}`)}`} target="_blank" rel="noreferrer">Share on WhatsApp</a>
        </div>

        {d.event.selfie_search && d.event.slug && (
          <div className="g-card" style={{ marginTop: 16 }}>
            <h3 style={{ fontSize: 17 }}>🤳 Want ALL your photos from this event?</h3>
            <p className="muted small">Take one selfie and we'll find every photo you're in.</p>
            <Link className="btn gold" to={`/e/${d.event.slug}`}>Find my photos →</Link>
          </div>
        )}
      </div>
      <div className="g-foot">
        {d.studio.name}{d.studio.phone ? ` · 📞 ${d.studio.phone}` : ""}{d.studio.instagram ? <> · <a href={d.studio.instagram} target="_blank" rel="noreferrer">Instagram</a></> : null}
      </div>
    </div>
  );
}

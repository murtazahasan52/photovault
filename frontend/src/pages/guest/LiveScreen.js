import React, { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react";
import { pub, errMsg } from "../../lib/api";
import { mFull, mThumb, onImgError } from "../../lib/drive";

/** Full-screen venue TV / projector page: newest booth shot + its QR, rotates through recent shots. */
export default function LiveScreen() {
  const { slug } = useParams();
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const [idx, setIdx] = useState(0);
  const lastTop = useRef("");

  useEffect(() => {
    let alive = true;
    const load = () => pub.get(`/events/${slug}/live`, { params: { limit: 24 } }).then((r) => {
      if (!alive) return;
      setD(r.data);
      const top = r.data.shots[0]?.id || "";
      if (top && top !== lastTop.current) { lastTop.current = top; setIdx(0); } // new shot → show it now
    }).catch((e) => setErr(errMsg(e)));
    load();
    const t = setInterval(load, 4000);
    return () => { alive = false; clearInterval(t); };
  }, [slug]);

  // rotate through recent shots when nothing new arrives
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (d?.shots.length ? (i + 1) % Math.min(d.shots.length, 12) : 0)), 9000);
    return () => clearInterval(t);
  }, [d?.shots.length]);

  const goFull = () => document.documentElement.requestFullscreen?.().catch(() => {});

  if (err) return <div className="tv"><div className="tv-empty"><h1>{err}</h1></div></div>;
  if (!d) return <div className="tv"><div className="spinner" style={{ marginTop: "40vh" }} /></div>;
  const s = d.shots[idx];
  const brand = d.studio.brand_color || "#c8a24a";
  const eventUrl = `${window.location.origin}/e/${slug}`;

  return (
    <div className="tv" style={{ "--brand": brand }} onDoubleClick={goFull}>
      <div className="tv-head">
        <div className="row">{d.studio.logo_url && <img src={d.studio.logo_url} alt="" style={{ height: 40, borderRadius: 6 }} />}<b>{d.studio.name}</b></div>
        <div className="serif tv-title">{d.event.name}</div>
        <div className="small" style={{ opacity: 0.7 }}>{d.total} photos · double-click for full screen</div>
      </div>
      {!s ? (
        <div className="tv-empty"><div style={{ fontSize: 80 }}>📸</div><h1 className="serif">Photos will appear here live</h1></div>
      ) : (
        <div className="tv-body">
          <div className="tv-photo"><img key={s.id} src={mFull(s)} alt="" onError={(e) => onImgError(e, s.file_id, 2000)} referrerPolicy="no-referrer" /></div>
          <div className="tv-side">
            <div className="qr-white"><QRCodeCanvas value={`${window.location.origin}/p/${s.code}`} size={260} level="M" /></div>
            <div className="tv-scan">Scan to download<br />this photo</div>
            <div className="tv-mini">
              <div className="qr-white small-qr"><QRCodeCanvas value={eventUrl} size={96} level="M" /></div>
              <div>Find <b>all</b> your photos<br />with a selfie</div>
            </div>
          </div>
        </div>
      )}
      <div className="tv-strip">
        {d.shots.slice(0, 12).map((x, i) => (
          <img key={x.id} className={i === idx ? "on" : ""} src={mThumb(x, 300)} alt="" onClick={() => setIdx(i)} onError={(e) => onImgError(e, x.file_id, 300)} referrerPolicy="no-referrer" />
        ))}
      </div>
    </div>
  );
}

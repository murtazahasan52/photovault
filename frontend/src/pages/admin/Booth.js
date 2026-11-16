import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react";
import { api, errMsg } from "../../lib/api";
import { mThumb, mFull, onImgError } from "../../lib/drive";
import { loadFace, allDescriptors } from "../../lib/face";
import { uploadViaScript } from "../../lib/boothScript";

const shotUrl = (code) => `${window.location.origin}/p/${code}`;

/** Resize an image file → { full: dataURL(≤2048px), thumb: dataURL(≤480px), canvas, w, h } */
async function prepare(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(async () => {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    await img.decode();
    return img;
  });
  const draw = (max) => {
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    return c;
  };
  const big = draw(2048);
  return { full: big.toDataURL("image/jpeg", 0.9), thumb: draw(480).toDataURL("image/jpeg", 0.8), canvas: draw(1280), w: big.width, h: big.height };
}

export default function Booth() {
  const { id } = useParams();
  const [ev, setEv] = useState(null);
  const [shots, setShots] = useState([]);
  const [total, setTotal] = useState(0);
  const [current, setCurrent] = useState(null);
  const [targets, setTargets] = useState([]);
  const [target, setTarget] = useState(() => localStorage.getItem("pv_booth_target") || "");
  const [faceOn, setFaceOn] = useState(true);
  const [queue, setQueue] = useState([]); // [{name,status,error}]
  const [watch, setWatch] = useState(null); // {name, imported}
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const fileRef = useRef(null);
  const camRef = useRef(null);
  const busyRef = useRef(false);
  const pendingRef = useRef([]);
  const dirRef = useRef(null);
  const seenRef = useRef(new Set());
  const watchTimer = useRef(null);

  const load = useCallback(async () => {
    const [e, s, t] = await Promise.all([api.get(`/events/${id}`), api.get(`/events/${id}/booth/shots`), api.get("/booth/drives")]);
    setEv(e.data); setShots(s.data.shots); setTotal(s.data.total); setTargets(t.data);
    setCurrent((c) => c || s.data.shots[0] || null);
    setTarget((tg) => (tg && (tg === "server" || t.data.some((d) => d.id === tg)) ? tg : (t.data[0]?.id || "server")));
  }, [id]);
  useEffect(() => { load().catch((e) => setErr(errMsg(e))); }, [load]);
  useEffect(() => { if (target) localStorage.setItem("pv_booth_target", target); }, [target]);
  useEffect(() => { if (faceOn) loadFace().catch(() => {}); }, [faceOn]);
  useEffect(() => () => clearInterval(watchTimer.current), []);

  const setQ = (name, patch) => setQueue((q) => q.map((x) => (x.name === name ? { ...x, ...patch } : x)));

  const processOne = async (file) => {
    const name = file.name || `booth_${Date.now()}.jpg`;
    setQ(name, { status: "Preparing…" });
    const p = await prepare(file);
    let faces = [];
    if (faceOn) {
      setQ(name, { status: "Finding faces…" });
      try { faces = await allDescriptors(p.canvas); } catch (_) { faces = []; }
    }
    const body = { name, width: p.w, height: p.h, faces };
    const drive = targets.find((d) => d.id === target);
    if (drive) {
      setQ(name, { status: `Saving to ${drive.label}…` });
      try {
        body.file_id = await uploadViaScript(drive.upload_script_url, drive.upload_secret, { event: ev?.name, name, dataUrl: p.full });
        body.drive_ref = drive.id;
      } catch (e) {
        setMsg(`Drive upload failed (${e.message}) — saved on the server instead.`);
        body.full_b64 = p.full; body.thumb_b64 = p.thumb;
      }
    } else { body.full_b64 = p.full; body.thumb_b64 = p.thumb; }
    setQ(name, { status: "Publishing…" });
    const { data } = await api.post(`/events/${id}/booth/shots`, body);
    setShots((s) => [data, ...s]);
    setTotal((t) => t + 1);
    setCurrent(data);
    setQ(name, { status: "done" });
    setTimeout(() => setQueue((q) => q.filter((x) => x.name !== name)), 2500);
  };

  const pump = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    while (pendingRef.current.length) {
      const f = pendingRef.current.shift();
      try { await processOne(f); } catch (e) { setQ(f.name, { status: "error", error: errMsg(e) }); }
    }
    busyRef.current = false;
  };

  const addFiles = (files) => {
    const list = [...files].filter((f) => /image\/(jpeg|png|webp)/.test(f.type) || /\.(jpe?g|png|webp)$/i.test(f.name));
    if (!list.length) { setMsg("Only JPG / PNG / WEBP photos can be added (set the camera to save JPG)."); return; }
    setQueue((q) => [...q, ...list.map((f) => ({ name: f.name || `photo_${Date.now()}`, status: "Waiting…" }))]);
    pendingRef.current.push(...list);
    pump();
  };

  const startWatch = async (importExisting) => {
    try {
      const dir = await window.showDirectoryPicker({ mode: "read" });
      dirRef.current = dir;
      seenRef.current = new Set();
      const sizes = {};
      const scan = async (first) => {
        const fresh = [];
        for await (const [n, h] of dir.entries()) {
          if (h.kind !== "file" || !/\.(jpe?g|png|webp)$/i.test(n)) continue;
          const f = await h.getFile();
          const key = `${n}|${f.lastModified}`;
          if (seenRef.current.has(key)) continue;
          if (first && !importExisting) { seenRef.current.add(key); continue; }
          // wait until the camera software has finished writing the file (same size twice)
          if (sizes[key] !== f.size) { sizes[key] = f.size; continue; }
          seenRef.current.add(key);
          fresh.push(f);
        }
        if (fresh.length) {
          fresh.sort((a, b) => a.lastModified - b.lastModified);
          setWatch((w) => ({ ...w, imported: (w?.imported || 0) + fresh.length }));
          addFiles(fresh);
        }
      };
      await scan(true);
      setWatch({ name: dir.name, imported: 0 });
      clearInterval(watchTimer.current);
      watchTimer.current = setInterval(() => scan(false).catch((e) => setMsg("Folder watch error: " + e.message)), 1500);
    } catch (e) {
      if (e?.name !== "AbortError") setMsg("Could not open folder: " + e.message);
    }
  };
  const stopWatch = () => { clearInterval(watchTimer.current); setWatch(null); };

  const del = async (s) => {
    if (!window.confirm("Delete this shot? (A copy saved in Google Drive stays there.)")) return;
    await api.delete(`/booth/shots/${s.id}`);
    setShots((x) => x.filter((y) => y.id !== s.id));
    setTotal((t) => t - 1);
    if (current?.id === s.id) setCurrent(shots.find((y) => y.id !== s.id) || null);
  };

  if (err) return <div className="page"><div className="err">{err}</div></div>;
  if (!ev) return <div className="booth"><div className="spinner" style={{ marginTop: 80 }} /></div>;
  const tvUrl = `${window.location.origin}/live/${ev.slug}`;
  const canWatch = typeof window.showDirectoryPicker === "function";

  return (
    <div className="booth">
      <div className="booth-top">
        <Link to={`/admin/events/${id}?tab=booth`} className="btn sm">← Back</Link>
        <div className="booth-title"><b>🔴 Live booth</b> · {ev.name} · <span className="muted">{total} shots</span></div>
        <div className="row">
          <select className="input sm-input" value={target} onChange={(e) => setTarget(e.target.value)} title="Where shots are saved">
            {targets.map((d) => <option key={d.id} value={d.id}>Save to Drive: {d.label}</option>)}
            <option value="server">Save on server (no Drive script)</option>
          </select>
          <label className="switch" style={{ margin: 0 }}><input type="checkbox" checked={faceOn} onChange={(e) => setFaceOn(e.target.checked)} /> Face-index</label>
          <a className="btn sm" href={tvUrl} target="_blank" rel="noreferrer">📺 TV screen</a>
        </div>
      </div>

      <div className="booth-main">
        <div className="booth-stage">
          {current ? <>
            <div className="booth-photo"><img src={mFull(current)} alt="" onError={(e) => onImgError(e, current.file_id, 2000)} referrerPolicy="no-referrer" /></div>
            <div className="booth-qr">
              <div className="qr-white"><QRCodeCanvas value={shotUrl(current.code)} size={230} level="M" /></div>
              <div className="booth-scan">Scan to download<br />your photo</div>
              <div className="small muted" style={{ wordBreak: "break-all" }}>{shotUrl(current.code)}</div>
              {current.face_count > 0 && <div className="small" style={{ color: "#8fd19e" }}>🙂 {current.face_count} face(s) indexed</div>}
            </div>
          </> : (
            <div className="booth-empty">
              <div style={{ fontSize: 54 }}>📸</div>
              <h2>Ready for the first shot</h2>
              <p className="muted">Add a photo below — it appears here with a QR code the guest scans to download it instantly.</p>
            </div>
          )}
        </div>

        <div className="booth-controls">
          <button className="btn gold big" onClick={() => fileRef.current?.click()}>➕ Add photos</button>
          <button className="btn big" onClick={() => camRef.current?.click()}>📷 Phone camera</button>
          {canWatch && (watch
            ? <button className="btn big ok" onClick={stopWatch}>⏹ Stop watching “{watch.name}” ({watch.imported})</button>
            : <button className="btn big" onClick={() => startWatch(false)} title="Laptop: pick the folder where your camera tethering software saves photos">📂 Auto-import from folder</button>)}
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
          <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        </div>
        {msg && <div className="note" style={{ margin: "10px 0 0" }} onClick={() => setMsg("")}>{msg} <span className="small">(tap to hide)</span></div>}
        {targets.length === 0 && <div className="note" style={{ margin: "10px 0 0" }}>Shots are being saved on the server. To save them in your Google Drive instead, add a <b>Live Booth upload script</b> to a Drive in <Link to="/admin/drives">My Drives</Link>.</div>}
        {queue.length > 0 && (
          <div className="booth-queue">
            {queue.map((q) => <div key={q.name} className={q.status === "error" ? "bad" : ""}>{q.status === "done" ? "✅" : q.status === "error" ? "❌" : "⏳"} {q.name} — {q.error || q.status}</div>)}
          </div>
        )}

        <div className="booth-strip">
          {shots.map((s) => (
            <div key={s.id} className={`bs ${current?.id === s.id ? "on" : ""}`} onClick={() => setCurrent(s)}>
              <img src={mThumb(s, 300)} alt="" onError={(e) => onImgError(e, s.file_id, 300)} referrerPolicy="no-referrer" />
              <button className="bs-del" onClick={(e) => { e.stopPropagation(); del(s); }}>✕</button>
              {s.downloads > 0 && <span className="bs-dl">⬇ {s.downloads}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

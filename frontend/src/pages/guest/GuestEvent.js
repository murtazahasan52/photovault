import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { pub, errMsg, fmtDate } from "../../lib/api";
import { thumb } from "../../lib/drive";
import { loadFace, selfieDescriptor, fileToImage } from "../../lib/face";
import SelfieCamera from "./SelfieCamera";
import GuestGallery from "./GuestGallery";

export default function GuestEvent() {
  const { slug } = useParams();
  const KEY = `pv_guest_${slug}`;
  const [ev, setEv] = useState(null);
  const [fatal, setFatal] = useState("");
  const [token, setToken] = useState(() => localStorage.getItem(KEY) || "");
  const [me, setMe] = useState(null);
  const [view, setView] = useState("home"); // home | camera | working | mine | all
  const [working, setWorking] = useState("");
  const [err, setErr] = useState("");
  const [mine, setMine] = useState(null);
  const [all, setAll] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    pub.get(`/events/${slug}`).then((r) => setEv(r.data)).catch((e) => setFatal(errMsg(e)));
  }, [slug]);

  const loadMe = useCallback(async () => {
    if (!token) return;
    try {
      const { data } = await pub.get(`/events/${slug}/me`, { params: { token } });
      setMe(data);
      return data;
    } catch {
      localStorage.removeItem(KEY); setToken(""); setMe(null);
    }
  }, [slug, token, KEY]);

  useEffect(() => { loadMe(); }, [loadMe]);

  // previous matches
  useEffect(() => {
    if (!token || !me || mine !== null) return;
    if (me.match_count > 0) pub.get(`/events/${slug}/my-photos`, { params: { token } }).then((r) => setMine(r.data.results));
  }, [token, me, mine, slug]);

  // auto-join when no details are required
  useEffect(() => {
    if (ev && !token && !ev.settings.require_guest_details && !ev.settings.requires_pin) {
      pub.post(`/events/${slug}/guest`, {}).then((r) => { localStorage.setItem(KEY, r.data.token); setToken(r.data.token); });
    }
  }, [ev, token, slug, KEY]);

  // poll access status while pending
  useEffect(() => {
    if (me?.access_status !== "pending") return;
    const t = setInterval(loadMe, 20000);
    return () => clearInterval(t);
  }, [me?.access_status, loadMe]);

  // preload face engine early
  useEffect(() => { if (token && ev?.settings.selfie_search) loadFace().catch(() => {}); }, [token, ev]);

  const search = async (imgOrCanvas) => {
    setView("working"); setErr("");
    try {
      setWorking("Reading your face…");
      await loadFace();
      const r = await selfieDescriptor(imgOrCanvas);
      if (!r) { setErr("We couldn't find a face in that photo. Try again in good light, facing the camera."); setView("home"); return; }
      setWorking("Searching all event photos…");
      const { data } = await pub.post(`/events/${slug}/match`, { token, descriptor: r.descriptor });
      setMine(data.results);
      setView("mine");
      loadMe();
    } catch (e) {
      setErr(errMsg(e)); setView("home");
    }
  };

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try { search(await fileToImage(f)); } catch { setErr("Could not open that image. Please pick a JPG/PNG photo."); }
  };

  const openAll = async () => {
    setView("all"); setErr("");
    try { const { data } = await pub.get(`/events/${slug}/gallery`, { params: { token } }); setAll(data); }
    catch (e) { setErr(errMsg(e)); setView("home"); }
  };

  const requestAccess = async (message) => {
    try { await pub.post(`/events/${slug}/request-access`, { token, message }); loadMe(); }
    catch (e) { setErr(errMsg(e)); }
  };

  if (fatal) return <div className="g"><div className="g-wrap" style={{ paddingTop: 80 }}><div className="g-card center"><div style={{ fontSize: 40 }}>📷</div><h2>{fatal}</h2></div></div></div>;
  if (!ev) return <div className="g" style={{ display: "grid", placeItems: "center" }}><div className="spinner" /></div>;

  const brand = ev.studio.brand_color || "#c8a24a";
  const cover = ev.cover_url || (ev.cover_file_id ? thumb(ev.cover_file_id, 1600) : "");
  const canAll = me?.can_see_all || ev.settings.public_gallery;

  return (
    <div className="g" style={{ "--brand": brand }}>
      <div className="g-hero" style={cover ? { backgroundImage: `url(${cover})` } : { background: "linear-gradient(135deg,#2b2733,#0f0e12)" }}>
        <div className="g-hero-in">
          <div className="g-studio">
            {ev.studio.logo_url && <img src={ev.studio.logo_url} alt="" />}
            <span>{ev.studio.name}</span>
          </div>
          <div className="small" style={{ letterSpacing: ".12em", textTransform: "uppercase", color: brand, fontWeight: 600 }}>{ev.event_type}</div>
          <h1>{ev.name}</h1>
          <div className="muted">{[fmtDate(ev.date), ev.venue].filter(Boolean).join(" · ")} · {ev.photo_count} photos{ev.video_count ? ` · ${ev.video_count} videos` : ""}</div>
          {ev.settings.welcome_message && <p style={{ maxWidth: 560, opacity: 0.85 }}>{ev.settings.welcome_message}</p>}
        </div>
      </div>

      <div className="g-wrap">
        {err && <div className="err">{err}</div>}

        {!token ? (
          <JoinForm ev={ev} slug={slug} onJoined={(t) => { localStorage.setItem(KEY, t); setToken(t); }} />
        ) : !me ? <div className="spinner" style={{ margin: 40 }} /> : <>
          <div className="chips">
            <button className={`chip ${view !== "all" ? "on" : ""}`} onClick={() => setView(mine?.length ? "mine" : "home")}>🙂 My photos{mine?.length ? ` (${mine.length})` : ""}</button>
            <button className={`chip ${view === "all" ? "on" : ""}`} onClick={() => (canAll ? openAll() : setView("access"))}>🖼 All photos {canAll ? "" : "🔒"}</button>
          </div>

          {view === "camera" && <div className="g-card"><SelfieCamera onCapture={search} onCancel={() => setView("home")} /></div>}

          {view === "working" && (
            <div className="g-card center" style={{ padding: 50 }}>
              <div className="spinner" /><p>{working}</p>
              <p className="small muted">First time can take a few seconds while the face engine loads.</p>
            </div>
          )}

          {(view === "home" || view === "mine") && <>
            {ev.settings.selfie_search && (
              <div className="g-card">
                <h2 className="serif" style={{ fontSize: 24 }}>{mine?.length ? "Search again" : `Hi ${me.name?.split(" ")[0] || "there"}, find your photos`}</h2>
                <p className="muted">Take a selfie or pick a clear photo of your face. We'll show every event photo you're in.</p>
                {ev.indexed_count === 0 && <div className="note">Photos are still being prepared by the photographer. Please check back a little later.</div>}
                <div className="g-choices">
                  <div className="g-choice" onClick={() => setView("camera")}><div className="ic">🤳</div><b>Take a selfie</b><div className="small muted">Use live camera</div></div>
                  <div className="g-choice" onClick={() => fileRef.current?.click()}><div className="ic">🖼️</div><b>Upload photo</b><div className="small muted">From your gallery</div></div>
                </div>
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
                <p className="small muted center" style={{ marginTop: 12 }}>🔒 Your selfie is processed on your phone and is not uploaded or stored.</p>
              </div>
            )}
            {mine !== null && (
              <div style={{ marginTop: 18 }}>
                <h2 className="serif" style={{ fontSize: 22 }}>{mine.length ? `We found you in ${mine.length} photo${mine.length > 1 ? "s" : ""} 🎉` : "No photos found yet"}</h2>
                {mine.length === 0 && <p className="muted">Try another selfie (good light, no sunglasses), or ask for access to the full gallery below.</p>}
                <GuestGallery items={mine} allowDownload={ev.settings.allow_download} emptyText="" />
              </div>
            )}
            {!canAll && <AccessCard me={me} onRequest={requestAccess} />}
          </>}

          {view === "access" && <AccessCard me={me} onRequest={requestAccess} big />}

          {view === "all" && (!all ? <div className="spinner" style={{ margin: 40 }} /> : <>
            {all.folders?.length > 0 && (
              <div className="g-card" style={{ marginBottom: 14 }}>
                <div className="row between"><b>Download the full folders from Google Drive</b>
                  <div className="row">{all.folders.map((f, i) => <a key={i} className="btn sm" href={f.url} target="_blank" rel="noreferrer">📁 {f.label || "Folder"}</a>)}</div></div>
              </div>
            )}
            <GuestGallery items={all.results} albums={all.albums} allowDownload={ev.settings.allow_download} />
          </>)}
        </>}
      </div>

      <div className="g-foot">
        {ev.studio.name}{ev.studio.tagline ? ` — ${ev.studio.tagline}` : ""}<br />
        {[ev.studio.phone && <a key="p" href={`tel:${ev.studio.phone}`}>📞 {ev.studio.phone}</a>,
          ev.studio.whatsapp && <a key="w" href={`https://wa.me/${String(ev.studio.whatsapp).replace(/\D/g, "").replace(/^(\d{10})$/, "91$1")}`} target="_blank" rel="noreferrer">💬 WhatsApp</a>,
          ev.studio.instagram && <a key="i" href={ev.studio.instagram} target="_blank" rel="noreferrer">📷 Instagram</a>,
          ev.studio.website && <a key="s" href={ev.studio.website} target="_blank" rel="noreferrer">🌐 Website</a>]
          .filter(Boolean).reduce((acc, el, i) => (i ? [...acc, " · ", el] : [el]), [])}
      </div>
    </div>
  );
}

function JoinForm({ ev, slug, onJoined }) {
  const [f, setF] = useState({ name: "", phone: "", email: "", pin: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const need = ev.settings.require_guest_details;
  const submit = async (e) => {
    e.preventDefault(); setErr(""); setBusy(true);
    try { const { data } = await pub.post(`/events/${slug}/guest`, f); onJoined(data.token); }
    catch (ex) { setErr(errMsg(ex)); }
    setBusy(false);
  };
  return (
    <form className="g-card" onSubmit={submit} style={{ maxWidth: 460, margin: "0 auto" }}>
      <h2 className="serif" style={{ fontSize: 24 }}>Get your photos</h2>
      <p className="muted">{need ? "Enter your details to continue." : "Enter the event PIN to continue."}</p>
      {err && <div className="err">{err}</div>}
      {need && <>
        <div className="field"><label className="lbl">Your name</label><input className="input" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div className="field"><label className="lbl">Mobile number</label><input className="input" required inputMode="numeric" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="10-digit mobile" /></div>
      </>}
      {ev.settings.requires_pin && <div className="field"><label className="lbl">Event PIN</label><input className="input" required inputMode="numeric" value={f.pin} onChange={(e) => setF({ ...f, pin: e.target.value })} placeholder="Ask the host / photographer" /></div>}
      <button className="btn gold block" disabled={busy}>{busy ? "Please wait…" : "Continue →"}</button>
    </form>
  );
}

function AccessCard({ me, onRequest, big }) {
  const [msg, setMsg] = useState("");
  const st = me?.access_status;
  return (
    <div className="g-card" style={{ marginTop: 18, textAlign: big ? "center" : "left" }}>
      <h3>🔒 Want to see ALL photos of this event?</h3>
      {st === "pending" ? (
        <p className="muted">⏳ Your request has been sent to the photographer. This page will unlock automatically once approved.</p>
      ) : st === "rejected" ? (
        <p className="muted">Your request was not approved. You can still see the photos you're in.</p>
      ) : <>
        <p className="muted">The full gallery is private. Ask the event owner / photographer for access.</p>
        <textarea className="input" rows={2} placeholder="Message (optional) e.g. I'm the bride's cousin" value={msg} onChange={(e) => setMsg(e.target.value)} style={{ marginBottom: 10 }} />
        <button className="btn gold" onClick={() => onRequest(msg)}>Request access to all photos</button>
      </>}
    </div>
  );
}

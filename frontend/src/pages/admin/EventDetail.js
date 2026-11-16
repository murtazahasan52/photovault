import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react";
import { api, errMsg, fmtDate, money } from "../../lib/api";
import { loadFace, allDescriptors, blobToImage } from "../../lib/face";
import { Lightbox, Loader, Pill, Thumb, waLink } from "../../components/ui";
import { useAuth } from "../../App";
import EventForm from "./EventForm";

const TABS = [["share", "Share"], ["booth", "🔴 Live booth"], ["media", "Photos & videos"], ["faces", "Face index"], ["guests", "Guests"], ["requests", "Access requests"], ["payments", "Payments"]];

export default function EventDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "share";
  const [ev, setEv] = useState(null);
  const [edit, setEdit] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(() => api.get(`/events/${id}`).then((r) => setEv(r.data)).catch((e) => setErr(errMsg(e))), [id]);
  useEffect(() => { load(); }, [load]);

  if (err) return <div className="page"><div className="err">{err}</div><Link to="/admin/events">← Back</Link></div>;
  if (!ev) return <div className="page"><Loader /></div>;

  const remove = async () => {
    if (!window.confirm(`Delete "${ev.name}"? Guests, face data and payments for this event will be deleted. Your Google Drive files are NOT touched.`)) return;
    await api.delete(`/events/${id}`);
    nav("/admin/events");
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <Link to="/admin/events" className="small muted">← Events</Link>
          <h1 style={{ marginTop: 6 }}>{ev.name}</h1>
          <div className="muted">{ev.event_type} · {fmtDate(ev.date) || "No date"}{ev.venue ? ` · ${ev.venue}` : ""}{ev.client_name ? ` · ${ev.client_name}` : ""} <Pill s={ev.status} /></div>
        </div>
        <div className="row">
          <button className="btn" onClick={() => setEdit(true)}>✏️ Edit</button>
          <button className="btn danger" onClick={remove}>🗑 Delete</button>
        </div>
      </div>

      <div className="stats">
        <div className="stat"><div className="k">Photos</div><div className="v">{ev.photo_count}</div></div>
        <div className="stat"><div className="k">Videos</div><div className="v">{ev.video_count}</div></div>
        <div className="stat"><div className="k">Face-indexed</div><div className="v">{ev.indexed_count}/{ev.photo_count}</div></div>
        <div className="stat"><div className="k">Guests</div><div className="v">{ev.guest_count}</div></div>
        <div className="stat"><div className="k">Balance</div><div className="v">{money(ev.balance)}</div></div>
      </div>

      <div className="tabs">
        {TABS.map(([k, l]) => (
          <button key={k} className={tab === k ? "on" : ""} onClick={() => setParams({ tab: k })}>
            {l}{k === "requests" && ev.pending_requests > 0 ? ` (${ev.pending_requests})` : ""}
          </button>
        ))}
      </div>

      {tab === "share" && <ShareTab ev={ev} />}
      {tab === "media" && <MediaTab ev={ev} reload={load} />}
      {tab === "faces" && <FacesTab ev={ev} reload={load} />}
      {tab === "guests" && <GuestsTab ev={ev} />}
      {tab === "requests" && <RequestsTab ev={ev} reload={load} />}
      {tab === "payments" && <PaymentsTab ev={ev} reload={load} />}
      {tab === "booth" && <BoothTab ev={ev} />}

      {edit && <EventForm event={ev} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); load(); }} />}
    </div>
  );
}

/* ───────── Live booth ───────── */
function BoothTab({ ev }) {
  const [d, setD] = useState(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => { api.get(`/events/${ev.id}/booth/shots`, { params: { limit: 48 } }).then((r) => setD(r.data)); }, [ev.id]);
  const tvUrl = `${window.location.origin}/live/${ev.slug}`;
  return (
    <div>
      <div className="grid2">
        <div className="card">
          <h3>🔴 Live booth — instant photo + QR</h3>
          <p className="muted small" style={{ lineHeight: 1.6 }}>
            Shoot on stage → the photo appears on your phone / laptop with a big QR code → the guest scans it and downloads the photo
            on the spot. Every shot is also face-indexed, so it shows up in the guest's selfie search too.
          </p>
          <div className="row">
            <Link className="btn gold" to={`/admin/booth/${ev.id}`}>▶ Open booth console</Link>
            <a className="btn" href={tvUrl} target="_blank" rel="noreferrer">📺 Open TV screen</a>
            <button className="btn" onClick={() => { navigator.clipboard.writeText(tvUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? "✓ Copied" : "Copy TV link"}</button>
          </div>
          {ev.settings?.live_screen === false && <div className="note" style={{ marginTop: 12 }}>The TV screen is turned off for this event (Edit → gallery settings).</div>}
        </div>
        <div className="card">
          <h3>How to connect the camera</h3>
          <ol className="small" style={{ lineHeight: 1.7, paddingLeft: 18, margin: 0 }}>
            <li><b>Phone on the camera</b> (like the reel): turn on the camera's auto-transfer to phone (Canon Camera Connect, Sony Creators' App, Nikon SnapBridge, Fujifilm XApp) or connect a USB-C cable — photos land in the phone gallery. In the booth console tap <b>➕ Add photos</b> and pick the new shots.</li>
            <li><b>Laptop tethering</b> (fully automatic): tether the camera with EOS Utility / Imaging Edge / Lightroom / any software that saves to a folder. In Chrome or Edge on the laptop click <b>📂 Auto-import from folder</b> and pick that folder — every new photo is published in ~2 seconds.</li>
            <li>Set the camera to save <b>JPG</b> (or RAW+JPG). Put the TV screen on a projector/TV with the TV link.</li>
          </ol>
        </div>
      </div>
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}><h3 style={{ margin: 0 }}>Booth shots {d ? `(${d.total})` : ""}</h3></div>
        {!d ? <Loader /> : d.shots.length === 0 ? <div className="empty">No booth shots yet.</div> : (
          <div className="media-grid" style={{ marginTop: 12 }}>
            {d.shots.map((s) => (
              <a className="m" key={s.id} href={`/p/${s.code}`} target="_blank" rel="noreferrer">
                <Thumb m={s} w={300} />
                <span className="tag">⬇ {s.downloads || 0} · 🙂 {s.face_count}</span>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ───────── Share ───────── */
function ShareTab({ ev }) {
  const { user } = useAuth();
  const url = `${window.location.origin}/e/${ev.slug}`;
  const [copied, setCopied] = useState(false);
  const qrRef = useRef(null);
  const msg = `📸 Photos from *${ev.name}* are ready!\n\nTake a selfie and instantly get all YOUR photos:\n${url}` +
    (ev.settings?.pin ? `\n\nPIN: ${ev.settings.pin}` : "") + `\n\n— ${user?.studio?.name || ""}`;

  const copy = () => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  const downloadQR = () => {
    const c = qrRef.current?.querySelector("canvas");
    if (!c) return;
    const a = document.createElement("a");
    a.href = c.toDataURL("image/png");
    a.download = `${ev.slug}-qr.png`;
    a.click();
  };

  return (
    <div className="grid2">
      <div className="card">
        <h3>Guest link</h3>
        <p className="muted small">Share this link (or the QR at the venue). Guests take a selfie and see only their own photos.</p>
        <div className="share-url">{url}</div>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn primary" onClick={copy}>{copied ? "✓ Copied" : "Copy link"}</button>
          <a className="btn ok" href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer">Share on WhatsApp</a>
          {ev.client_phone && <a className="btn" href={waLink(ev.client_phone, msg)} target="_blank" rel="noreferrer">Send to client</a>}
          <a className="btn" href={url} target="_blank" rel="noreferrer">Open guest page ↗</a>
        </div>
        {ev.settings?.pin && <div className="note" style={{ marginTop: 14 }}>Guests need PIN <b>{ev.settings.pin}</b> to open this gallery.</div>}
        {ev.photo_count > 0 && ev.indexed_count < ev.photo_count && (
          <div className="note" style={{ marginTop: 14 }}>
            {ev.photo_count - ev.indexed_count} photos are not face-indexed yet — guests won't find themselves in those. Open the <b>Face index</b> tab.
          </div>
        )}
      </div>
      <div className="card center">
        <h3>QR code</h3>
        <div ref={qrRef} style={{ display: "inline-block", padding: 14, background: "#fff", borderRadius: 12, border: "1px solid var(--line)" }}>
          <QRCodeCanvas value={url} size={220} includeMargin={false} level="M" />
        </div>
        <div style={{ marginTop: 12 }}><button className="btn" onClick={downloadQR}>⬇ Download QR (PNG)</button></div>
        <p className="small muted">Print it on a standee / table card at the event.</p>
      </div>
    </div>
  );
}

/* ───────── Media ───────── */
function MediaTab({ ev, reload }) {
  const [items, setItems] = useState(null);
  const [album, setAlbum] = useState("");
  const [type, setType] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(ev.sync_message ? { ok: true, t: ev.sync_message } : null);
  const [lb, setLb] = useState(-1);
  const [limit, setLimit] = useState(120);

  const load = useCallback(() => api.get(`/events/${ev.id}/media`).then((r) => setItems(r.data)), [ev.id]);
  useEffect(() => { load(); }, [load]);

  const sync = async () => {
    setBusy(true); setMsg(null);
    try {
      const { data } = await api.post(`/events/${ev.id}/sync`);
      setMsg({ ok: !data.errors?.length, t: data.message });
      await load(); reload();
    } catch (e) { setMsg({ ok: false, t: errMsg(e) }); }
    setBusy(false);
  };

  const albums = useMemo(() => [...new Set((items || []).map((m) => m.album))], [items]);
  const shown = (items || []).filter((m) => (!album || m.album === album) && (!type || m.type === type));

  return (
    <div className="card">
      <div className="row between" style={{ marginBottom: 14 }}>
        <div>
          <h3 style={{ margin: 0 }}>Files from Google Drive</h3>
          <div className="small muted">
            {ev.drive_links?.length || 0} link(s) · last synced {ev.last_synced_at ? new Date(ev.last_synced_at).toLocaleString("en-IN") : "never"}
          </div>
        </div>
        <button className="btn gold" onClick={sync} disabled={busy}>{busy ? "Reading Drive…" : "🔄 Sync from Drive"}</button>
      </div>
      {msg && <div className={msg.ok ? "okmsg" : "err"}>{msg.t}</div>}
      {!ev.drive_links?.length && <div className="note">No Drive links yet — click <b>Edit</b> above and paste your folder link.</div>}
      <p className="small muted">Added new photos to the Drive folder? Just click Sync again — new files are picked up, deleted ones removed.</p>

      {items === null ? <Loader /> : items.length === 0 ? <div className="empty">No files yet. Click “Sync from Drive”.</div> : <>
        <div className="row" style={{ marginBottom: 12 }}>
          <select className="input" style={{ maxWidth: 220 }} value={album} onChange={(e) => setAlbum(e.target.value)}>
            <option value="">All albums ({items.length})</option>
            {albums.map((a) => <option key={a} value={a}>{a || "(root)"} ({items.filter((m) => m.album === a).length})</option>)}
          </select>
          <select className="input" style={{ maxWidth: 160 }} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Photos + videos</option><option value="photo">Photos</option><option value="video">Videos</option>
          </select>
        </div>
        <div className="media-grid">
          {shown.slice(0, limit).map((m, i) => (
            <div className="m" key={m.id} onClick={() => setLb(i)} style={{ cursor: "pointer" }}>
              <Thumb m={m} w={300} />
              {m.type === "video" && <span className="tag">▶ video</span>}
              {m.type === "photo" && m.indexed && <span className="tag">🙂 {m.face_count}</span>}
            </div>
          ))}
        </div>
        {shown.length > limit && <div className="center" style={{ marginTop: 14 }}><button className="btn" onClick={() => setLimit(limit + 240)}>Show more ({shown.length - limit} left)</button></div>}
      </>}
      {lb >= 0 && <Lightbox items={shown} index={lb} onIndex={setLb} onClose={() => setLb(-1)} />}
    </div>
  );
}

/* ───────── Face index ───────── */
function FacesTab({ ev, reload }) {
  const [state, setState] = useState({ running: false, done: 0, total: 0, faces: 0, failed: 0, status: "" });
  const stopRef = useRef(false);

  useEffect(() => () => { stopRef.current = true; }, []);

  const run = async () => {
    stopRef.current = false;
    setState((s) => ({ ...s, running: true, status: "Loading face engine…", done: 0, failed: 0, faces: 0 }));
    try {
      await loadFace();
      const { data } = await api.get(`/events/${ev.id}/index/pending`);
      const queue = [...data.pending];
      const total = queue.length;
      setState((s) => ({ ...s, total, status: total ? "Indexing… keep this tab open" : "Everything is already indexed ✓" }));
      let done = 0, faces = 0, failed = 0;
      const worker = async () => {
        while (queue.length && !stopRef.current) {
          const item = queue.shift();
          try {
            const r = await api.get(`/media/thumb/${item.file_id}`, { params: { sz: 1280 }, responseType: "blob" });
            const img = await blobToImage(r.data);
            const desc = await allDescriptors(img);
            await api.post(`/events/${ev.id}/index/${item.id}`, { faces: desc });
            faces += desc.length;
          } catch (e) {
            failed += 1;
          }
          done += 1;
          setState((s) => ({ ...s, done, faces, failed }));
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      setState((s) => ({ ...s, running: false, status: stopRef.current ? "Paused. Click Start to continue." :
        failed ? `Finished with ${failed} photo(s) that could not be read — click Start again to retry them.` : "All photos indexed ✓" }));
    } catch (e) {
      setState((s) => ({ ...s, running: false, status: "Error: " + errMsg(e) }));
    }
    reload();
  };

  const reset = async () => {
    if (!window.confirm("Clear all face data for this event? You will need to index again.")) return;
    await api.delete(`/events/${ev.id}/index`);
    reload();
  };

  const pct = state.total ? Math.round((state.done / state.total) * 100) : 0;
  const overall = ev.photo_count ? Math.round((ev.indexed_count / ev.photo_count) * 100) : 0;

  return (
    <div className="card">
      <h3>Face index</h3>
      <p className="muted">
        To let guests find themselves, every photo is scanned once for faces. This runs <b>in your browser</b> (no load on the server,
        photos stay on Drive). Only face fingerprints (numbers) are saved. Run it after every Sync that adds new photos.
      </p>
      <div className="row between small" style={{ marginBottom: 6 }}>
        <span>Overall: <b>{ev.indexed_count}</b> of {ev.photo_count} photos · {ev.face_count} faces found</span><span>{overall}%</span>
      </div>
      <div className="progress" style={{ marginBottom: 18 }}><div style={{ width: `${overall}%` }} /></div>

      {state.total > 0 && <>
        <div className="row between small" style={{ marginBottom: 6 }}>
          <span>This run: {state.done}/{state.total} · {state.faces} faces · {state.failed} failed</span><span>{pct}%</span>
        </div>
        <div className="progress" style={{ marginBottom: 12 }}><div style={{ width: `${pct}%` }} /></div>
      </>}
      {state.status && <div className={state.status.startsWith("Error") ? "err" : "note"}>{state.status}</div>}

      <div className="row">
        {!state.running ? (
          <button className="btn gold" onClick={run} disabled={!ev.photo_count}>▶ Start indexing {ev.photo_count - ev.indexed_count > 0 ? `(${ev.photo_count - ev.indexed_count} new)` : ""}</button>
        ) : (
          <button className="btn" onClick={() => { stopRef.current = true; }}>⏸ Pause</button>
        )}
        <button className="btn danger" onClick={reset} disabled={state.running}>Reset face data</button>
      </div>
      <p className="small muted" style={{ marginTop: 14 }}>
        Tip: a laptop/desktop with Chrome is fastest (about 1–2 photos per second). You can pause and continue any time — finished photos are saved.
      </p>
    </div>
  );
}

/* ───────── Guests ───────── */
function GuestsTab({ ev }) {
  const [list, setList] = useState(null);
  const load = useCallback(() => api.get(`/events/${ev.id}/guests`).then((r) => setList(r.data)), [ev.id]);
  useEffect(() => { load(); }, [load]);
  const setAccess = async (g, status) => { await api.post(`/events/${ev.id}/guests/${g.id}/access`, { status }); load(); };
  const exportCsv = () => {
    const rows = [["Name", "Mobile", "Email", "Photos found", "Searches", "Access", "First visit"],
      ...list.map((g) => [g.name, g.phone, g.email, g.match_count, g.searches, g.access_status, g.created_at])];
    const csv = rows.map((r) => r.map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `${ev.slug}-guests.csv`;
    a.click();
  };
  if (!list) return <Loader />;
  return (
    <div className="card">
      <div className="row between"><h3>Guests who opened the link ({list.length})</h3>
        {list.length > 0 && <button className="btn sm" onClick={exportCsv}>⬇ Export CSV</button>}</div>
      {list.length === 0 ? <div className="empty">No guests yet.</div> : (
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Guest</th><th>Photos found</th><th>Searches</th><th>Full access</th><th>Last seen</th><th></th></tr></thead>
          <tbody>{list.map((g) => (
            <tr key={g.id}>
              <td><b>{g.name || "Guest"}</b><div className="small muted">{g.phone} {g.email}</div></td>
              <td>{g.match_count}</td><td>{g.searches}</td>
              <td><Pill s={g.access_status === "none" ? "" : g.access_status} /></td>
              <td className="small">{new Date(g.last_seen).toLocaleString("en-IN")}</td>
              <td className="row" style={{ flexWrap: "nowrap" }}>
                {g.access_status !== "approved"
                  ? <button className="btn sm" onClick={() => setAccess(g, "approved")}>Give full access</button>
                  : <button className="btn sm danger" onClick={() => setAccess(g, "none")}>Remove access</button>}
                {g.phone && <a className="btn sm" href={waLink(g.phone, `Hi ${g.name}, your photos from ${ev.name}: ${window.location.origin}/e/${ev.slug}`)} target="_blank" rel="noreferrer">WhatsApp</a>}
              </td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  );
}

/* ───────── Requests ───────── */
export function RequestTable({ list, onDone, showEvent }) {
  const act = async (r, kind) => {
    await api.post(`/requests/${r.id}/${kind}`, {});
    if (kind === "approve" && r.guest_phone && window.confirm("Approved ✓  Send the guest a WhatsApp message?")) {
      window.open(waLink(r.guest_phone, `Hi ${r.guest_name}, your request is approved 🎉 You can now see ALL photos of ${r.event_name}: ${window.location.origin}/e/${r.event_slug}`), "_blank");
    }
    onDone();
  };
  if (!list.length) return <div className="empty">No requests.</div>;
  return (
    <div className="tbl-wrap"><table className="tbl">
      <thead><tr><th>Guest</th>{showEvent && <th>Event</th>}<th>Message</th><th>When</th><th>Status</th><th></th></tr></thead>
      <tbody>{list.map((r) => (
        <tr key={r.id}>
          <td><b>{r.guest_name || "Guest"}</b><div className="small muted">{r.guest_phone}</div></td>
          {showEvent && <td>{r.event_name}</td>}
          <td className="small" style={{ maxWidth: 260 }}>{r.message || <span className="muted">—</span>}</td>
          <td className="small">{new Date(r.created_at).toLocaleString("en-IN")}</td>
          <td><Pill s={r.status} /></td>
          <td className="row" style={{ flexWrap: "nowrap" }}>
            {r.status !== "approved" && <button className="btn sm ok" onClick={() => act(r, "approve")}>Approve</button>}
            {r.status !== "rejected" && <button className="btn sm danger" onClick={() => act(r, "reject")}>Reject</button>}
          </td>
        </tr>
      ))}</tbody>
    </table></div>
  );
}

function RequestsTab({ ev, reload }) {
  const [list, setList] = useState(null);
  const load = useCallback(() => api.get("/requests", { params: { event_id: ev.id } }).then((r) => setList(r.data)), [ev.id]);
  useEffect(() => { load(); }, [load]);
  if (!list) return <Loader />;
  return (
    <div className="card">
      <h3>Requests to see all photos</h3>
      <p className="small muted">Guests who want the full gallery (not just their own photos) ask here. Approve to unlock everything for that guest.</p>
      <RequestTable list={list} onDone={() => { load(); reload(); }} />
    </div>
  );
}

/* ───────── Payments ───────── */
function PaymentsTab({ ev, reload }) {
  const [list, setList] = useState(null);
  const [f, setF] = useState({ amount: "", date: new Date().toISOString().slice(0, 10), mode: "Cash", note: "" });
  const [err, setErr] = useState("");
  const load = useCallback(() => api.get(`/events/${ev.id}/payments`).then((r) => setList(r.data)), [ev.id]);
  useEffect(() => { load(); }, [load]);
  const add = async (e) => {
    e.preventDefault(); setErr("");
    try {
      await api.post(`/events/${ev.id}/payments`, { ...f, amount: Number(f.amount) });
      setF({ ...f, amount: "", note: "" }); load(); reload();
    } catch (ex) { setErr(errMsg(ex)); }
  };
  const del = async (p) => { if (window.confirm("Delete this payment?")) { await api.delete(`/payments/${p.id}`); load(); reload(); } };
  const remind = `Hi ${ev.client_name || ""}, gentle reminder for ${ev.name}: package ${money(ev.package_amount)}, received ${money(ev.paid_amount)}, balance ${money(ev.balance)}. Thank you!`;

  return (
    <div className="grid2">
      <div className="card">
        <h3>Package</h3>
        <table className="tbl"><tbody>
          <tr><td>Package amount</td><td><b>{money(ev.package_amount)}</b></td></tr>
          <tr><td>Received</td><td style={{ color: "var(--ok)" }}><b>{money(ev.paid_amount)}</b></td></tr>
          <tr><td>Balance</td><td style={{ color: ev.balance > 0 ? "var(--bad)" : "var(--ok)" }}><b>{money(ev.balance)}</b></td></tr>
        </tbody></table>
        {ev.balance > 0 && ev.client_phone && <a className="btn ok sm" style={{ marginTop: 12 }} href={waLink(ev.client_phone, remind)} target="_blank" rel="noreferrer">Send payment reminder</a>}
        <h3 style={{ marginTop: 22 }}>Add payment</h3>
        {err && <div className="err">{err}</div>}
        <form onSubmit={add}>
          <div className="grid2">
            <div className="field"><label className="lbl">Amount ₹</label><input className="input" type="number" required value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
            <div className="field"><label className="lbl">Date</label><input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
          </div>
          <div className="grid2">
            <div className="field"><label className="lbl">Mode</label>
              <select className="input" value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}>{["Cash", "UPI", "Bank transfer", "Cheque", "Card"].map((m) => <option key={m}>{m}</option>)}</select></div>
            <div className="field"><label className="lbl">Note</label><input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Advance / final…" /></div>
          </div>
          <button className="btn primary">Add payment</button>
        </form>
      </div>
      <div className="card">
        <h3>Payment history</h3>
        {!list ? <Loader /> : list.length === 0 ? <div className="empty">No payments yet</div> : (
          <table className="tbl"><tbody>{list.map((p) => (
            <tr key={p.id}><td><b>{money(p.amount)}</b><div className="small muted">{p.mode} {p.note ? `· ${p.note}` : ""}</div></td>
              <td className="small">{fmtDate(p.date)}</td>
              <td><button className="btn sm danger" onClick={() => del(p)}>✕</button></td></tr>
          ))}</tbody></table>
        )}
      </div>
    </div>
  );
}

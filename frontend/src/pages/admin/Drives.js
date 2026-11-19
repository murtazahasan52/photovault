import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, errMsg, fmtDate } from "../../lib/api";
import { Loader, Modal } from "../../components/ui";
import DriveBrowser from "../../components/DriveBrowser";
import { useAuth } from "../../App";
import { scriptWithSecret, newSecret } from "../../lib/boothScript";

export function HowToAddDrive({ open: initialOpen = true }) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <div className="card" style={{ borderColor: "#ecd9a6", background: "#fffcf3" }}>
      <div className="row" style={{ justifyContent: "space-between", cursor: "pointer" }} onClick={() => setOpen(!open)}>
        <h3 style={{ margin: 0 }}>📘 How to connect your Google Drive (about 5 minutes, once per Gmail)</h3>
        <span className="small muted">{open ? "Hide ▲" : "Show ▼"}</span>
      </div>
      {open && (
        <div className="howto">
          <div className="note" style={{ marginBottom: 6 }}>
            No Google Cloud Console and no API key needed — you only paste a small script into <b>script.google.com</b> with the same Gmail where your photos are.
          </div>
          <div className="step"><span className="num">1</span><div>
            <b>Make one main folder in Google Drive</b>
            <ol>
              <li>Open <a href="https://drive.google.com" target="_blank" rel="noreferrer">drive.google.com</a> with the Gmail where your photos are.</li>
              <li><b>+ New → New folder</b> → e.g. <code>Studio Events 2026</code>. Inside it, one folder per event (sub-folders like <code>Haldi</code>, <code>Wedding</code> become albums).</li>
              <li>Open the main folder and copy its link from the address bar (it looks like <code>drive.google.com/drive/folders/…</code>).</li>
            </ol>
          </div></div>
          <div className="step"><span className="num">2</span><div>
            <b>Click “＋ Add Drive” below</b> — paste the folder link, then click <b>Generate secret</b> and <b>📋 Copy script</b>.
          </div></div>
          <div className="step"><span className="num">3</span><div>
            <b>Create the script</b>
            <ol>
              <li>Open <a href="https://script.google.com/home/projects/create" target="_blank" rel="noreferrer">script.google.com → New project</a> (same Gmail as the photos).</li>
              <li>Delete the sample code, paste the copied script, click 💾 <b>Save</b> and name it “PhotoVault Drive”.</li>
              <li><b>Deploy → New deployment</b> → ⚙️ select type <b>Web app</b> → Execute as: <b>Me</b> → Who has access: <b>Anyone</b> → <b>Deploy</b>.</li>
              <li>Click <b>Authorize access</b> → choose the Gmail → <b>Advanced → Go to PhotoVault Drive (unsafe)</b> → <b>Allow</b>. (Google shows this warning because it is your own script.)</li>
              <li>Copy the <b>Web app URL</b> (ends with <code>/exec</code>).</li>
            </ol>
          </div></div>
          <div className="step"><span className="num">4</span><div>
            <b>Paste the Web app URL</b> in the Add Drive form → <b>Test</b> → <b>Check &amp; add Drive</b>.
            The main folder is shared as “Anyone with the link → Viewer” automatically, so guests can see their photos.
            <div className="small muted" style={{ marginTop: 4 }}>Photos in more than one Gmail? Repeat for every account (each Gmail gets its own script).</div>
          </div></div>
          <div className="step"><span className="num">5</span><div>
            <b>Create events from your Drive</b> — <b>📂 Browse folders</b> → open the event folder → <b>＋ Create event</b>. Then on the event: <b>Sync from Drive → Face index → Share</b>.
            The same script also saves <b>Live Booth</b> photos into this Drive.
          </div></div>
          <div className="note" style={{ marginTop: 10, marginBottom: 0 }}>
            🔒 Photos are never copied to our server. Only people with an event link can find them, and guests only see the photos they are in unless you approve full access.
          </div>
        </div>
      )}
    </div>
  );
}

const blank = { label: "", email: "", root_url: "", notes: "", upload_script_url: "", upload_secret: "", auto_share: true };

/** Manage Drives for the logged-in photographer, or (main admin) for photographer `uid`. */
export function DrivesManager({ uid = "", embedded = false }) {
  const nav = useNavigate();
  const { user, refresh } = useAuth();
  const [d, setD] = useState(null);
  const [key, setKey] = useState("");
  const [keyMsg, setKeyMsg] = useState(null);
  const [showKey, setShowKey] = useState(false);
  const [edit, setEdit] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [browse, setBrowse] = useState(null);
  const [addTo, setAddTo] = useState(null);
  const [testMsg, setTestMsg] = useState({});
  const q = uid ? { params: { uid } } : {};
  const forOther = uid && uid !== user?.id;

  const load = useCallback(() => api.get("/drives", uid ? { params: { uid } } : {}).then((r) => setD(r.data)), [uid]);
  useEffect(() => { load(); }, [load]);

  const saveKey = async () => {
    setKeyMsg(null);
    try {
      if (forOther) await api.put(`/admin/photographers/${uid}/api-key`, { google_api_key: key });
      else await api.put("/settings", { google_api_key: key });
      setKeyMsg({ ok: true, t: "Key saved ✓" }); setKey(""); load(); refresh();
    } catch (e) { setKeyMsg({ ok: false, t: errMsg(e) }); }
  };

  const save = async (e) => {
    e.preventDefault(); setErr("");
    if (!edit.upload_script_url.trim() && !d.has_any_key) { setErr("Paste the Drive script Web app URL (step 3 of the guide)."); return; }
    setBusy(true);
    try {
      if (edit.id) await api.put(`/drives/${edit.id}`, edit);
      else await api.post("/drives", edit, q);
      setEdit(null); load();
    } catch (ex) { setErr(errMsg(ex)); }
    setBusy(false);
  };
  const del = async (dr) => {
    if (!window.confirm(`Remove “${dr.label}” from the app? Your Google Drive files are NOT deleted, and existing events keep working.`)) return;
    await api.delete(`/drives/${dr.id}`); load();
  };
  const test = async (dr) => {
    setTestMsg({ ...testMsg, [dr.id]: "Checking…" });
    try { const { data } = await api.post(`/drives/${dr.id}/test`); setTestMsg((t) => ({ ...t, [dr.id]: "✅ " + data.message })); }
    catch (e) { setTestMsg((t) => ({ ...t, [dr.id]: "❌ " + errMsg(e) })); }
  };
  const createEvent = (f) => {
    sessionStorage.setItem("pv_prefill", JSON.stringify({ name: f.name, drive_links: [{ label: f.name, url: f.url, drive_ref: f.drive_ref }] }));
    nav("/admin/events?new=1");
  };

  if (!d) return <Loader />;

  return (
    <div>
      {!embedded && <HowToAddDrive open={d.drives.length === 0} />}

      <div className="card">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>🗂️ Google Drives {forOther ? `of ${d.owner.name}` : ""} ({d.drives.length})</h3>
          <button className="btn gold" onClick={() => { setErr(""); setEdit({ ...blank, upload_secret: newSecret() }); }}>＋ Add Drive</button>
        </div>
        {d.drives.length === 0 ? (
          <div className="empty">No Drives yet. Click <b>＋ Add Drive</b> and follow the guide above — no Google Cloud account needed.</div>
        ) : (
          <div className="drive-grid">
            {d.drives.map((dr) => (
              <div className="drive-card" key={dr.id}>
                <div className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>🗂️ {dr.label}</div>
                    <div className="small muted">{dr.email || "—"}</div>
                  </div>
                  <span className="pill active">connected</span>
                </div>
                <div className="small" style={{ margin: "10px 0" }}>
                  Main folder: <b>{dr.root_name}</b><br />
                  <span className="muted">{dr.event_count} event link(s) · checked {fmtDate(dr.last_checked)}</span>
                  {dr.notes && <div className="muted">{dr.notes}</div>}
                  <div style={{ marginTop: 4 }}>Connection: {dr.upload_script_url
                    ? <b style={{ color: "var(--ok)" }}>✓ Drive script (reads folders + Live Booth)</b>
                    : <span className="muted">API key only — <a href="#e" onClick={(e) => { e.preventDefault(); setErr(""); setEdit({ ...blank, ...dr, upload_secret: dr.upload_secret || newSecret() }); }}>add the Drive script</a> for Live Booth</span>}</div>
                </div>
                {testMsg[dr.id] && <div className="small" style={{ marginBottom: 8 }}>{testMsg[dr.id]}</div>}
                <div className="row">
                  {!forOther && <button className="btn sm gold" onClick={() => setBrowse(dr)}>📂 Browse folders</button>}
                  <button className="btn sm" onClick={() => test(dr)}>Test</button>
                  <a className="btn sm" href={dr.root_url} target="_blank" rel="noreferrer">Open in Drive ↗</a>
                  <button className="btn sm" onClick={() => { setErr(""); setEdit({ ...blank, ...dr, upload_secret: dr.upload_secret || newSecret() }); }}>Edit</button>
                  <button className="btn sm danger" onClick={() => del(dr)}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: "space-between", cursor: "pointer" }} onClick={() => setShowKey(!showKey)}>
          <b className="small">⚙️ Advanced: Google API key (optional — not needed when you use the Drive script)</b>
          <span className="small muted">{showKey ? "▲" : "▼"}</span>
        </div>
        {showKey && <div style={{ marginTop: 10 }}>
          {d.has_own_key ? <div className="okmsg">✓ Key saved: {d.key_masked}</div>
            : d.has_any_key ? <div className="note">A shared key from the main admin is in use.</div> : <div className="small muted" style={{ marginBottom: 8 }}>No API key — that's fine when the Drive script is set up.</div>}
          <div className="row">
            <input className="input" style={{ maxWidth: 420 }} placeholder="AIza… (from Google Cloud Console)" value={key} onChange={(e) => setKey(e.target.value)} />
            <button className="btn" onClick={saveKey} disabled={!key}>Save key</button>
          </div>
          {keyMsg && <div className={keyMsg.ok ? "okmsg" : "err"} style={{ marginTop: 10, marginBottom: 0 }}>{keyMsg.t}</div>}
        </div>}
      </div>

      {edit && (
        <Modal title={edit.id ? "Edit Drive" : "Add a Google Drive"} onClose={() => setEdit(null)} wide>
          <form onSubmit={save}>
            {err && <div className="err">{err}</div>}
            <div className="grid2">
              <div className="field"><label className="lbl">Name *</label><input className="input" required value={edit.label} onChange={(e) => setEdit({ ...edit, label: e.target.value })} placeholder="Main Gmail / Studio Drive 2" /></div>
              <div className="field"><label className="lbl">Gmail ID (for reference)</label><input className="input" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} placeholder="studio@gmail.com" /></div>
            </div>
            <div className="field"><label className="lbl">Main folder link *</label>
              <input className="input" required value={edit.root_url} onChange={(e) => setEdit({ ...edit, root_url: e.target.value })} placeholder="https://drive.google.com/drive/folders/…" />
            </div>
            <ScriptSetup edit={edit} setEdit={setEdit} />
            <label className="switch"><input type="checkbox" checked={edit.auto_share !== false} onChange={(e) => setEdit({ ...edit, auto_share: e.target.checked })} /> Share the main folder as “Anyone with the link → Viewer” automatically (needed so guests can see photos)</label>
            <div className="field"><label className="lbl">Notes</label><input className="input" value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} placeholder="e.g. 2026 weddings, 2 TB plan" /></div>
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="btn" onClick={() => setEdit(null)}>Cancel</button>
              <button className="btn primary" disabled={busy}>{busy ? "Checking folder…" : edit.id ? "Save" : "Check & add Drive"}</button>
            </div>
          </form>
        </Modal>
      )}

      {browse && <DriveBrowser drive={browse} onClose={() => setBrowse(null)} onCreateEvent={createEvent} onAddToEvent={(f) => setAddTo(f)} />}
      {addTo && <AddToEvent folder={addTo} onClose={() => setAddTo(null)} onDone={(ev) => { setAddTo(null); setBrowse(null); nav(`/admin/events/${ev.id}?tab=media`); }} />}
    </div>
  );
}

/** Secret + copy script + Web app URL + test. Used by My Drives and the Add photographer form. */
export function ScriptSetup({ edit, setEdit, urlKey = "upload_script_url", secretKey = "upload_secret" }) {
  const [copied, setCopied] = useState(false);
  const [ping, setPing] = useState("");
  const [show, setShow] = useState(false);
  const secret = edit[secretKey] || "";
  const url = edit[urlKey] || "";
  const code = scriptWithSecret(secret);
  const copy = () => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1800); };
  const test = async () => {
    setPing("Checking…");
    try { const { data } = await api.post("/drives/check-script", { url, secret }); setPing("✅ " + data.message); }
    catch (e) { setPing("❌ " + errMsg(e)); }
  };
  return (
    <div className="card" style={{ background: "var(--bg)", marginTop: 4 }}>
      <b>🔗 Drive script</b> <span className="small muted">— connects this Gmail's Drive (no Google Cloud / API key)</span>
      <ol className="small" style={{ lineHeight: 1.8, paddingLeft: 18, margin: "8px 0" }}>
        <li>Click <b>📋 Copy script</b>.</li>
        <li>Open <a href="https://script.google.com/home/projects/create" target="_blank" rel="noreferrer">script.google.com → New project</a> with <b>this Drive's Gmail</b>, delete the sample code, paste, 💾 <b>Save</b>.</li>
        <li><b>Deploy → New deployment</b> → type <b>Web app</b> → Execute as <b>Me</b> → Who has access <b>Anyone</b> → <b>Deploy</b> → <b>Authorize</b> (Advanced → Go to … → Allow).</li>
        <li>Copy the <b>Web app URL</b> (ends with <code>/exec</code>), paste it below, click <b>Test</b>.</li>
      </ol>
      <div className="grid2">
        <div className="field"><label className="lbl">Secret (already inside the copied script)</label>
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <input className="input" value={secret} onChange={(e) => setEdit({ ...edit, [secretKey]: e.target.value })} />
            <button type="button" className="btn sm" onClick={() => setEdit({ ...edit, [secretKey]: newSecret() })}>New</button>
          </div></div>
        <div className="field"><label className="lbl">Script</label>
          <div className="row">
            <button type="button" className="btn sm gold" onClick={copy} disabled={!secret}>{copied ? "✓ Copied" : "📋 Copy script"}</button>
            <button type="button" className="btn sm" onClick={() => setShow(!show)}>{show ? "Hide code" : "Show code"}</button>
          </div></div>
      </div>
      {show && <pre className="code">{code}</pre>}
      <div className="field" style={{ marginBottom: 0 }}><label className="lbl">Web app URL</label>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <input className="input" value={url} onChange={(e) => setEdit({ ...edit, [urlKey]: e.target.value })} placeholder="https://script.google.com/macros/s/…/exec" />
          <button type="button" className="btn sm" onClick={test} disabled={!url}>Test</button>
        </div>
        {ping && <div className="small" style={{ marginTop: 4 }}>{ping}</div>}
        <div className="small muted" style={{ marginTop: 4 }}>If you change the secret later, paste the script again and create a new deployment.</div>
      </div>
    </div>
  );
}

function AddToEvent({ folder, onClose, onDone }) {
  const [events, setEvents] = useState(null);
  const [sel, setSel] = useState("");
  const [label, setLabel] = useState(folder.name);
  const [err, setErr] = useState("");
  useEffect(() => { api.get("/events").then((r) => { setEvents(r.data); if (r.data[0]) setSel(r.data[0].id); }); }, []);
  const go = async () => {
    setErr("");
    try {
      const { data: ev } = await api.get(`/events/${sel}`);
      if (ev.drive_links.some((l) => l.drive_id === folder.id)) { setErr("This folder is already in that event"); return; }
      const body = { ...ev, drive_links: [...ev.drive_links, { label, url: folder.url, drive_ref: folder.drive_ref }] };
      const { data } = await api.put(`/events/${sel}`, body);
      onDone(data);
    } catch (e) { setErr(errMsg(e)); }
  };
  return (
    <Modal title={`Add “${folder.name}” to an event`} onClose={onClose}>
      {err && <div className="err">{err}</div>}
      {!events ? <Loader /> : events.length === 0 ? <div className="empty">No events yet — use “Create event” instead.</div> : <>
        <div className="field"><label className="lbl">Event</label>
          <select className="input" value={sel} onChange={(e) => setSel(e.target.value)}>{events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
        <div className="field"><label className="lbl">Album label</label><input className="input" value={label} onChange={(e) => setLabel(e.target.value)} /></div>
        <div className="row" style={{ justifyContent: "flex-end" }}><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={go}>Add folder</button></div>
      </>}
    </Modal>
  );
}

export default function Drives() {
  return (
    <div className="page">
      <div className="page-head">
        <div><h1>My Google Drives</h1><div className="muted">Connect one or more Google Drives (e.g. several Gmail accounts) and create events straight from their folders.</div></div>
      </div>
      <DrivesManager />
    </div>
  );
}

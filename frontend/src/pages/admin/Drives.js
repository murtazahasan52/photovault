import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, errMsg, fmtDate } from "../../lib/api";
import { Loader, Modal } from "../../components/ui";
import DriveBrowser from "../../components/DriveBrowser";
import { useAuth } from "../../App";
import { BOOTH_SCRIPT, pingScript } from "../../lib/boothScript";

export function HowToAddDrive({ open: initialOpen = true }) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <div className="card" style={{ borderColor: "#ecd9a6", background: "#fffcf3" }}>
      <div className="row" style={{ justifyContent: "space-between", cursor: "pointer" }} onClick={() => setOpen(!open)}>
        <h3 style={{ margin: 0 }}>📘 How to add your Google Drive (5 minutes, one time)</h3>
        <span className="small muted">{open ? "Hide ▲" : "Show ▼"}</span>
      </div>
      {open && (
        <div className="howto">
          <div className="step"><span className="num">1</span><div>
            <b>Get a free Google API key</b> (once per photographer — it works for all your Drives)
            <ol>
              <li>Open <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer">console.cloud.google.com</a> and log in with any Gmail.</li>
              <li>Top bar → <b>Select a project → New project</b> → name it “PhotoVault” → <b>Create</b>.</li>
              <li>Open <a href="https://console.cloud.google.com/apis/library/drive.googleapis.com" target="_blank" rel="noreferrer">Google Drive API</a> → click <b>Enable</b>.</li>
              <li>Open <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">Credentials</a> → <b>+ Create credentials → API key</b> → copy the key (starts with <code>AIza…</code>).</li>
              <li>(Recommended) Click the key → <b>API restrictions → Restrict key → Google Drive API</b> → Save.</li>
              <li>Paste it in <b>Step 1</b> below and click <b>Save & test</b>. No billing / card is needed.</li>
            </ol>
          </div></div>
          <div className="step"><span className="num">2</span><div>
            <b>Make one main folder in each Google Drive</b>
            <ol>
              <li>Open <a href="https://drive.google.com" target="_blank" rel="noreferrer">drive.google.com</a> with the Gmail where your photos are.</li>
              <li><b>+ New → New folder</b> → name it e.g. <code>Studio Events 2026</code>.</li>
              <li>Inside it make one folder per event (e.g. <code>Rahul Priya Wedding</code>) and, if you like, sub-folders per function (<code>Haldi</code>, <code>Wedding</code>, <code>Reception</code>). Upload photos & videos there as usual.</li>
            </ol>
          </div></div>
          <div className="step"><span className="num">3</span><div>
            <b>Share the main folder as “Anyone with the link”</b>
            <ol>
              <li>Right-click the main folder → <b>Share</b> → <b>Share</b>.</li>
              <li>Under <b>General access</b> change “Restricted” to <b>Anyone with the link</b>, role <b>Viewer</b>.</li>
              <li>Click <b>Copy link</b> → <b>Done</b>. (Everything inside the folder is covered automatically — no need to share each event.)</li>
            </ol>
          </div></div>
          <div className="step"><span className="num">4</span><div>
            <b>Add the Drive here</b> — click <b>＋ Add Drive</b> below, give it a name (e.g. “Main Gmail”), the Gmail ID (for your reference) and paste the folder link. The app checks it instantly.
            <div className="small muted" style={{ marginTop: 4 }}>Have photos in more than one Gmail (15 GB free each)? Repeat steps 2–4 for every account. One API key is enough.</div>
          </div></div>
          <div className="step"><span className="num">5</span><div>
            <b>Create events straight from your Drive</b> — click <b>Browse folders</b> on a Drive, open the event folder and click <b>＋ Create event</b>.
            Then on the event: <b>Sync from Drive → Face index → Share</b>.
          </div></div>
          <div className="step"><span className="num">6</span><div>
            <b>(Optional) Live Booth — instant photo + QR on stage</b>: to save booth shots straight into this Drive, add the small
            <b> upload script</b> once per Gmail. Click <b>Edit</b> on the Drive → <b>Live Booth upload script</b> and follow the 6 short steps shown there.
            Without it, booth shots are kept on the server instead.
          </div></div>
          <div className="note" style={{ marginTop: 10, marginBottom: 0 }}>
            🔒 Photos are never copied to our server. Only people with an event link can find them, and guests only see the photos they are in unless you approve full access.
          </div>
        </div>
      )}
    </div>
  );
}

const blank = { label: "", email: "", root_url: "", notes: "", upload_script_url: "", upload_secret: "" };

/** Manage Drives for the logged-in photographer, or (main admin) for photographer `uid`. */
export function DrivesManager({ uid = "", embedded = false }) {
  const nav = useNavigate();
  const { user, refresh } = useAuth();
  const [d, setD] = useState(null);
  const [key, setKey] = useState("");
  const [keyMsg, setKeyMsg] = useState(null);
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
      else {
        await api.put("/settings", { google_api_key: key });
        const t = await api.post("/settings/test-drive", {});
        setKeyMsg({ ok: true, t: t.data.message });
      }
      if (forOther) setKeyMsg({ ok: true, t: "Key saved ✓" });
      setKey(""); load(); refresh();
    } catch (e) { setKeyMsg({ ok: false, t: errMsg(e) }); }
  };

  const save = async (e) => {
    e.preventDefault(); setErr(""); setBusy(true);
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
  const noKey = !d.has_any_key;

  return (
    <div>
      {!embedded && <HowToAddDrive open={d.drives.length === 0} />}

      <div className="card">
        <h3><span className="stepnum">1</span> Google API key {forOther ? `for ${d.owner.name}` : ""}</h3>
        {d.has_own_key ? <div className="okmsg">✓ Key saved: {d.key_masked}</div>
          : d.has_any_key ? <div className="note">Using the shared key set by the main admin. You can add your own below (optional).</div>
          : <div className="err">No API key yet — follow step 1 of the guide above.</div>}
        <div className="row">
          <input className="input" style={{ maxWidth: 420 }} placeholder="Paste API key (AIza…)" value={key} onChange={(e) => setKey(e.target.value)} />
          <button className="btn primary" onClick={saveKey} disabled={!key}>Save & test</button>
        </div>
        {keyMsg && <div className={keyMsg.ok ? "okmsg" : "err"} style={{ marginTop: 10, marginBottom: 0 }}>{keyMsg.t}</div>}
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}><span className="stepnum">2</span> Google Drives ({d.drives.length})</h3>
          <button className="btn gold" disabled={noKey} onClick={() => { setErr(""); setEdit({ ...blank }); }}>＋ Add Drive</button>
        </div>
        {noKey && <div className="small muted" style={{ marginBottom: 8 }}>Save the API key first, then add Drives.</div>}
        {d.drives.length === 0 ? (
          <div className="empty">No Drives added yet. Click <b>＋ Add Drive</b> and paste your main folder link.</div>
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
                  <div style={{ marginTop: 4 }}>Live Booth uploads: {dr.upload_script_url
                    ? <b style={{ color: "var(--ok)" }}>✓ script connected</b>
                    : <span className="muted">not set (<a href="#e" onClick={(e) => { e.preventDefault(); setErr(""); setEdit({ ...blank, ...dr }); }}>add script</a>)</span>}</div>
                </div>
                {testMsg[dr.id] && <div className="small" style={{ marginBottom: 8 }}>{testMsg[dr.id]}</div>}
                <div className="row">
                  {!forOther && <button className="btn sm gold" onClick={() => setBrowse(dr)}>📂 Browse folders</button>}
                  <button className="btn sm" onClick={() => test(dr)}>Test</button>
                  <a className="btn sm" href={dr.root_url} target="_blank" rel="noreferrer">Open in Drive ↗</a>
                  <button className="btn sm" onClick={() => { setErr(""); setEdit({ ...blank, ...dr }); }}>Edit</button>
                  <button className="btn sm danger" onClick={() => del(dr)}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {edit && (
        <Modal title={edit.id ? "Edit Drive" : "Add a Google Drive"} onClose={() => setEdit(null)}>
          <form onSubmit={save}>
            {err && <div className="err">{err}</div>}
            <div className="grid2">
              <div className="field"><label className="lbl">Name *</label><input className="input" required value={edit.label} onChange={(e) => setEdit({ ...edit, label: e.target.value })} placeholder="Main Gmail / Studio Drive 2" /></div>
              <div className="field"><label className="lbl">Gmail ID (for reference)</label><input className="input" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} placeholder="studio@gmail.com" /></div>
            </div>
            <div className="field"><label className="lbl">Main folder link *</label>
              <input className="input" required value={edit.root_url} onChange={(e) => setEdit({ ...edit, root_url: e.target.value })} placeholder="https://drive.google.com/drive/folders/…" />
              <div className="small muted" style={{ marginTop: 4 }}>Folder must be shared as <b>Anyone with the link → Viewer</b> (guide step 3).</div>
            </div>
            <div className="field"><label className="lbl">Notes</label><input className="input" value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} placeholder="e.g. 2026 weddings, 2 TB plan" /></div>
            <ScriptSetup edit={edit} setEdit={setEdit} />
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

function ScriptSetup({ edit, setEdit }) {
  const [open, setOpen] = useState(!!edit.upload_script_url);
  const [copied, setCopied] = useState(false);
  const [ping, setPing] = useState("");
  const secret = edit.upload_secret || "";
  const code = BOOTH_SCRIPT.replace("CHANGE-ME-123", secret || "CHANGE-ME-123");
  const genSecret = () => setEdit({ ...edit, upload_secret: "pv-" + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6) });
  const copy = () => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  const test = async () => {
    setPing("Checking…");
    try { await pingScript(edit.upload_script_url); setPing("✅ Script is reachable"); } catch (e) { setPing("❌ " + e.message + " — check the URL ends with /exec and access is “Anyone”."); }
  };
  return (
    <div className="card" style={{ background: "var(--bg)", marginTop: 4 }}>
      <div className="row" style={{ justifyContent: "space-between", cursor: "pointer" }} onClick={() => setOpen(!open)}>
        <b>🔴 Live Booth upload script (optional)</b><span className="small muted">{open ? "▲" : "▼"}</span>
      </div>
      {open && <>
        <p className="small muted">Lets the Live Booth save each stage photo straight into THIS Google Drive (no load on the server). Do it once per Gmail:</p>
        <ol className="small" style={{ lineHeight: 1.8, paddingLeft: 18, marginTop: 0 }}>
          <li>Click <b>Generate secret</b> below, then <b>Copy script</b>.</li>
          <li>Open <a href="https://script.google.com/home/projects/create" target="_blank" rel="noreferrer">script.google.com → New project</a> while logged in with <b>this Drive's Gmail</b>.</li>
          <li>Delete the sample code, paste the script, click 💾 <b>Save</b> (name it “PhotoVault Booth”).</li>
          <li><b>Deploy → New deployment</b> → ⚙️ type <b>Web app</b> → Execute as: <b>Me</b> → Who has access: <b>Anyone</b> → <b>Deploy</b>.</li>
          <li>Click <b>Authorize access</b> → choose the Gmail → <b>Advanced → Go to PhotoVault Booth (unsafe)</b> → <b>Allow</b>. (It's your own script, so Google shows this warning.)</li>
          <li>Copy the <b>Web app URL</b> (ends with <code>/exec</code>), paste it below and click <b>Test</b>.</li>
        </ol>
        <div className="grid2">
          <div className="field"><label className="lbl">Secret</label>
            <div className="row" style={{ flexWrap: "nowrap" }}><input className="input" value={secret} onChange={(e) => setEdit({ ...edit, upload_secret: e.target.value })} placeholder="any password-like text" />
              <button type="button" className="btn sm" onClick={genSecret}>Generate</button></div></div>
          <div className="field"><label className="lbl">Script</label>
            <button type="button" className="btn sm gold" onClick={copy} disabled={!secret}>{copied ? "✓ Copied" : "📋 Copy script"}</button>
            {!secret && <div className="small muted">Generate a secret first</div>}</div>
        </div>
        <div className="field"><label className="lbl">Web app URL</label>
          <div className="row" style={{ flexWrap: "nowrap" }}><input className="input" value={edit.upload_script_url || ""} onChange={(e) => setEdit({ ...edit, upload_script_url: e.target.value })} placeholder="https://script.google.com/macros/s/…/exec" />
            <button type="button" className="btn sm" onClick={test} disabled={!edit.upload_script_url}>Test</button></div>
          {ping && <div className="small" style={{ marginTop: 4 }}>{ping}</div>}
        </div>
        <details className="small"><summary>Show script code</summary><pre className="code">{code}</pre></details>
      </>}
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

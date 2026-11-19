import React, { useEffect, useState } from "react";
import { api, errMsg } from "../../lib/api";
import { Modal } from "../../components/ui";
import DriveBrowser from "../../components/DriveBrowser";

const TYPES = ["Wedding", "Engagement", "Pre-wedding", "Birthday", "Corporate", "Religious / Majlis", "Concert", "School / College", "Expo", "Other"];
const STATUSES = ["upcoming", "shooting", "editing", "delivered", "completed"];

const blank = {
  name: "", event_type: "Wedding", date: "", end_date: "", venue: "", description: "", client_id: "",
  cover_url: "", status: "upcoming", package_amount: 0,
  drive_links: [{ label: "Photos", url: "" }],
  settings: { selfie_search: true, pin: "", allow_download: true, public_gallery: false,
    require_guest_details: true, match_threshold: 0.5, expires_on: "", welcome_message: "", live_screen: true },
};

export default function EventForm({ event, onClose, onSaved }) {
  const [f, setF] = useState(() => {
    if (event) return { ...blank, ...event, settings: { ...blank.settings, ...(event.settings || {}) },
      drive_links: event.drive_links?.length ? event.drive_links : blank.drive_links };
    try {
      const pre = JSON.parse(sessionStorage.getItem("pv_prefill") || "null");
      sessionStorage.removeItem("pv_prefill");
      if (pre) return { ...blank, ...pre };
    } catch (_) { /* ignore */ }
    return blank;
  });
  const [drives, setDrives] = useState([]);
  const [picker, setPicker] = useState(null); // { drive, index }
  const [clients, setClients] = useState([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [newClient, setNewClient] = useState(null);
  const [testMsg, setTestMsg] = useState({});

  useEffect(() => {
    api.get("/clients").then((r) => setClients(r.data));
    api.get("/drives").then((r) => setDrives(r.data.drives)).catch(() => {});
  }, []);
  const pickFolder = (folder) => {
    const i = picker.index;
    const links = [...f.drive_links];
    const item = { label: links[i]?.label && links[i].label !== "Photos" ? links[i].label : folder.name, url: folder.url, drive_ref: folder.drive_ref };
    if (i >= links.length) links.push(item); else links[i] = { ...links[i], ...item };
    setF({ ...f, name: f.name || folder.name, drive_links: links });
    setPicker(null);
  };

  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "number" ? Number(e.target.value) : e.target.value });
  const setS = (k, v) => setF({ ...f, settings: { ...f.settings, [k]: v } });
  const setLink = (i, k, v) => setF({ ...f, drive_links: f.drive_links.map((l, j) => (j === i ? { ...l, [k]: v } : l)) });

  const testLink = async (i) => {
    const url = f.drive_links[i].url;
    setTestMsg({ ...testMsg, [i]: "Checking…" });
    try {
      const { data } = await api.post("/settings/test-drive", { url, drive_ref: f.drive_links[i].drive_ref || "" });
      setTestMsg((t) => ({ ...t, [i]: "✅ " + data.message }));
    } catch (e) { setTestMsg((t) => ({ ...t, [i]: "❌ " + errMsg(e) })); }
  };

  const save = async (e) => {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      let client_id = f.client_id;
      if (newClient && newClient.name) {
        const { data } = await api.post("/clients", newClient);
        client_id = data.id;
      }
      const body = { ...f, client_id, drive_links: f.drive_links.filter((l) => l.url.trim()) };
      const { data } = event ? await api.put(`/events/${event.id}`, body) : await api.post("/events", body);
      onSaved(data);
    } catch (ex) { setErr(errMsg(ex)); }
    setBusy(false);
  };

  return (
    <Modal title={event ? "Edit event" : "New event"} onClose={onClose} wide>
      <form onSubmit={save}>
        {err && <div className="err">{err}</div>}
        <div className="grid2">
          <div className="field"><label className="lbl">Event name *</label><input className="input" value={f.name} onChange={set("name")} required placeholder="Rahul & Priya Wedding" /></div>
          <div className="field"><label className="lbl">Type</label>
            <select className="input" value={f.event_type} onChange={set("event_type")}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
        </div>
        <div className="grid3">
          <div className="field"><label className="lbl">Date</label><input type="date" className="input" value={f.date} onChange={set("date")} /></div>
          <div className="field"><label className="lbl">End date</label><input type="date" className="input" value={f.end_date} onChange={set("end_date")} /></div>
          <div className="field"><label className="lbl">Status</label>
            <select className="input" value={f.status} onChange={set("status")}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></div>
        </div>
        <div className="grid2">
          <div className="field"><label className="lbl">Venue</label><input className="input" value={f.venue} onChange={set("venue")} /></div>
          <div className="field"><label className="lbl">Client</label>
            {newClient ? (
              <div className="row" style={{ flexWrap: "nowrap" }}>
                <input className="input" placeholder="Client name" value={newClient.name} onChange={(e) => setNewClient({ ...newClient, name: e.target.value })} />
                <input className="input" placeholder="Mobile" value={newClient.phone} onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })} />
                <button type="button" className="btn sm" onClick={() => setNewClient(null)}>✕</button>
              </div>
            ) : (
              <div className="row" style={{ flexWrap: "nowrap" }}>
                <select className="input" value={f.client_id} onChange={set("client_id")}>
                  <option value="">— none —</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name} {c.phone ? `(${c.phone})` : ""}</option>)}
                </select>
                <button type="button" className="btn sm" onClick={() => setNewClient({ name: "", phone: "" })}>＋ New</button>
              </div>
            )}
          </div>
        </div>
        <div className="grid2">
          <div className="field"><label className="lbl">Package amount (₹)</label><input type="number" className="input" value={f.package_amount} onChange={set("package_amount")} /></div>
          <div className="field"><label className="lbl">Cover image URL (optional)</label><input className="input" value={f.cover_url} onChange={set("cover_url")} placeholder="Leave empty = first photo" /></div>
        </div>

        <h3 style={{ marginTop: 8 }}>Google Drive links</h3>
        <p className="small muted" style={{ marginTop: 0 }}>
          Paste folder (or single file) links. Share each folder as <b>“Anyone with the link → Viewer”</b>. Sub-folders become albums.
        </p>
        {f.drive_links.map((l, i) => (
          <div key={l.id || i}>
            <div className="link-row">
              <input className="input" placeholder="Label e.g. Haldi" value={l.label} onChange={(e) => setLink(i, "label", e.target.value)} />
              <input className="input" placeholder="https://drive.google.com/drive/folders/…" value={l.url} onChange={(e) => setLink(i, "url", e.target.value)} />
              <div className="row" style={{ flexWrap: "nowrap" }}>
                <button type="button" className="btn sm" onClick={() => testLink(i)} disabled={!l.url}>Test</button>
                <button type="button" className="btn sm danger" onClick={() => setF({ ...f, drive_links: f.drive_links.filter((_, j) => j !== i) })}>✕</button>
              </div>
            </div>
            {testMsg[i] && <div className="small" style={{ margin: "-4px 0 8px" }}>{testMsg[i]}</div>}
          </div>
        ))}
        <div className="row">
          <button type="button" className="btn sm" onClick={() => setF({ ...f, drive_links: [...f.drive_links, { label: "", url: "" }] })}>＋ Add another link</button>
          {drives.length > 0 ? drives.map((d) => (
            <button type="button" key={d.id} className="btn sm gold"
              onClick={() => setPicker({ drive: d, index: f.drive_links.findIndex((l) => !l.url.trim()) >= 0 ? f.drive_links.findIndex((l) => !l.url.trim()) : f.drive_links.length })}>
              📂 Pick from “{d.label}”
            </button>
          )) : <span className="small muted">Tip: add your Drives in <b>My Drives</b> to pick folders instead of pasting links.</span>}
        </div>
        {picker && <DriveBrowser drive={picker.drive} onClose={() => setPicker(null)} onPick={pickFolder} />}

        <h3 style={{ marginTop: 22 }}>Guest gallery settings</h3>
        <div className="grid2">
          <div>
            <label className="switch"><input type="checkbox" checked={f.settings.selfie_search} onChange={(e) => setS("selfie_search", e.target.checked)} /> Guests can find photos with a selfie</label>
            <label className="switch"><input type="checkbox" checked={f.settings.require_guest_details} onChange={(e) => setS("require_guest_details", e.target.checked)} /> Ask guest name & mobile first</label>
            <label className="switch"><input type="checkbox" checked={f.settings.allow_download} onChange={(e) => setS("allow_download", e.target.checked)} /> Allow downloads</label>
            <label className="switch"><input type="checkbox" checked={f.settings.public_gallery} onChange={(e) => setS("public_gallery", e.target.checked)} /> Everyone can see ALL photos (no approval)</label>
            <label className="switch"><input type="checkbox" checked={f.settings.live_screen !== false} onChange={(e) => setS("live_screen", e.target.checked)} /> Live booth TV screen on</label>
          </div>
          <div>
            <div className="field"><label className="lbl">Event PIN (optional)</label><input className="input" value={f.settings.pin} onChange={(e) => setS("pin", e.target.value)} placeholder="e.g. 2580" /></div>
            <div className="field"><label className="lbl">Gallery expires on (optional)</label><input type="date" className="input" value={f.settings.expires_on} onChange={(e) => setS("expires_on", e.target.value)} /></div>
            <div className="field">
              <label className="lbl">Face match strictness: {f.settings.match_threshold}</label>
              <input type="range" min="0.35" max="0.6" step="0.01" value={f.settings.match_threshold} onChange={(e) => setS("match_threshold", Number(e.target.value))} style={{ width: "100%" }} />
              <div className="row between small muted"><span>Strict (fewer, exact)</span><span>Loose (more photos)</span></div>
            </div>
          </div>
        </div>
        <div className="field"><label className="lbl">Welcome message for guests</label>
          <textarea className="input" rows={2} value={f.settings.welcome_message} onChange={(e) => setS("welcome_message", e.target.value)} placeholder="Thank you for being part of our special day!" /></div>
        <div className="field"><label className="lbl">Internal notes</label><textarea className="input" rows={2} value={f.description} onChange={set("description")} /></div>

        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy}>{busy ? "Saving…" : "Save event"}</button>
        </div>
      </form>
    </Modal>
  );
}

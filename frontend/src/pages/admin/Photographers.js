import React, { useEffect, useState } from "react";
import { api, errMsg, fmtDate } from "../../lib/api";
import { Loader, Modal, Pill } from "../../components/ui";
import { DrivesManager, HowToAddDrive, ScriptSetup } from "./Drives";
import { newSecret } from "../../lib/boothScript";

const blank = { name: "", email: "", phone: "", password: "", studio_name: "", active: true, plan_expiry: "", notes: "",
  drive_label: "Main Drive", drive_email: "", drive_url: "", drive_script: "", drive_secret: "" };

export default function Photographers() {
  const [list, setList] = useState(null);
  const [edit, setEdit] = useState(null);
  const [err, setErr] = useState("");
  const [drivesFor, setDrivesFor] = useState(null);
  const load = () => api.get("/admin/photographers").then((r) => setList(r.data));
  useEffect(() => { load(); }, []);

  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault(); setErr(""); setBusy(true);
    let uid = edit.id;
    try {
      if (edit.id) await api.put(`/admin/photographers/${edit.id}`, edit);
      else uid = (await api.post("/admin/photographers", edit)).data.id;
    } catch (ex) { setErr(errMsg(ex)); setBusy(false); return; }
    // optional: connect the photographer's Google Drive right away
    try {
      if (edit.drive_url.trim()) {
        await api.post("/drives", {
          label: edit.drive_label || "Main Drive", email: edit.drive_email, root_url: edit.drive_url.trim(), notes: "",
          upload_script_url: edit.drive_script.trim(), upload_secret: edit.drive_secret.trim(), auto_share: true,
        }, { params: { uid } });
      }
    } catch (ex) {
      setErr(`Photographer saved, but the Drive could not be connected: ${errMsg(ex)}. Fix it with the 🗂️ Drives button on their row.`);
      setEdit({ ...edit, id: uid, password: "" }); setBusy(false); load(); return;
    }
    setBusy(false); setEdit(null); load();
  };
  const del = async (p) => {
    if (!window.confirm(`Delete ${p.name} and ALL their events, guests and payments? (Their Drive files are not touched.)`)) return;
    await api.delete(`/admin/photographers/${p.id}`); load();
  };

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Photographers</h1><div className="muted">Studios using this system. Each sees only their own events.</div></div>
        <button className="btn gold" onClick={() => setEdit({ ...blank, drive_secret: newSecret() })}>＋ Add photographer</button>
      </div>
      <div className="card">
        {!list ? <Loader /> : list.length === 0 ? <div className="empty">No photographers yet.</div> : (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Photographer</th><th>Studio</th><th>Events</th><th>Google Drive</th><th>Plan expiry</th><th>Status</th><th></th></tr></thead>
            <tbody>{list.map((p) => (
              <tr key={p.id}>
                <td><b>{p.name}</b><div className="small muted">{p.email} {p.phone}</div></td>
                <td>{p.studio?.name}</td><td>{p.event_count}</td>
                <td className="small">{p.drive_count > 0 ? <span style={{ color: "var(--ok)" }}>✓ {p.drive_count} drive(s)</span> : <span className="muted">not added</span>}</td>
                <td className="small">{p.plan_expiry ? fmtDate(p.plan_expiry) : "No expiry"}</td>
                <td><Pill s={p.active ? "active" : "inactive"} /></td>
                <td className="row" style={{ flexWrap: "nowrap" }}>
                  <button className="btn sm gold" onClick={() => setDrivesFor(p)}>🗂️ Drives</button>
                  <button className="btn sm" onClick={() => setEdit({ ...blank, ...p, studio_name: p.studio?.name || "", password: "", drive_secret: newSecret() })}>Edit</button>
                  <button className="btn sm danger" onClick={() => del(p)}>✕</button>
                </td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
      {drivesFor && (
        <Modal title={`Google Drives — ${drivesFor.name}`} onClose={() => { setDrivesFor(null); load(); }} wide>
          <p className="small muted" style={{ marginTop: 0 }}>Set up the photographer's API key and Drives for them. They can also do it themselves from <b>My Drives</b>.</p>
          <HowToAddDrive open={false} />
          <DrivesManager uid={drivesFor.id} embedded />
        </Modal>
      )}
      {edit && (
        <Modal title={edit.id ? "Edit photographer" : "Add photographer"} onClose={() => setEdit(null)}>
          <form onSubmit={save}>
            {err && <div className="err">{err}</div>}
            <div className="grid2">
              <div className="field"><label className="lbl">Name *</label><input className="input" required value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
              <div className="field"><label className="lbl">Studio name</label><input className="input" value={edit.studio_name} onChange={(e) => setEdit({ ...edit, studio_name: e.target.value })} /></div>
            </div>
            <div className="grid2">
              <div className="field"><label className="lbl">Email (login) *</label><input className="input" type="email" required value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></div>
              <div className="field"><label className="lbl">Mobile</label><input className="input" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></div>
            </div>
            <div className="grid2">
              <div className="field"><label className="lbl">{edit.id ? "New password (leave blank to keep)" : "Password *"}</label><input className="input" value={edit.password} onChange={(e) => setEdit({ ...edit, password: e.target.value })} required={!edit.id} /></div>
              <div className="field"><label className="lbl">Plan expiry</label><input type="date" className="input" value={edit.plan_expiry} onChange={(e) => setEdit({ ...edit, plan_expiry: e.target.value })} /></div>
            </div>
            <label className="switch"><input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Account active</label>
            <div className="card" style={{ background: "var(--bg)", padding: 14 }}>
              <b>🗂️ Google Drive (optional)</b>
              <div className="small muted" style={{ margin: "4px 0 10px" }}>
                Connect the photographer's Drive now, or leave it empty — they can add Drives themselves from <b>My Drives</b> after logging in.
                Paste the main folder link, then set up the Drive script (no Google Cloud needed) — the folder is shared for guests automatically.
              </div>
              <div className="grid2">
                <div className="field"><label className="lbl">Drive name</label><input className="input" value={edit.drive_label} onChange={(e) => setEdit({ ...edit, drive_label: e.target.value })} /></div>
                <div className="field"><label className="lbl">Gmail ID</label><input className="input" value={edit.drive_email} onChange={(e) => setEdit({ ...edit, drive_email: e.target.value })} placeholder="studio@gmail.com" /></div>
              </div>
              <div className="field" style={{ marginBottom: 0 }}><label className="lbl">Main Drive folder link</label>
                <input className="input" value={edit.drive_url} onChange={(e) => setEdit({ ...edit, drive_url: e.target.value })} placeholder="https://drive.google.com/drive/folders/…" /></div>
              {edit.drive_url.trim() && <ScriptSetup edit={edit} setEdit={setEdit} urlKey="drive_script" secretKey="drive_secret" />}
            </div>
            <div className="field"><label className="lbl">Notes</label><textarea className="input" rows={2} value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></div>
            <div className="row" style={{ justifyContent: "flex-end" }}><button type="button" className="btn" onClick={() => setEdit(null)}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button></div>
          </form>
        </Modal>
      )}
    </div>
  );
}

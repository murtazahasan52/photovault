import React, { useEffect, useState } from "react";
import { api, errMsg, fmtDate } from "../../lib/api";
import { Loader, Modal, Pill } from "../../components/ui";
import { DrivesManager, HowToAddDrive } from "./Drives";

const blank = { name: "", email: "", phone: "", password: "", studio_name: "", active: true, plan_expiry: "", notes: "" };

export default function Photographers() {
  const [list, setList] = useState(null);
  const [edit, setEdit] = useState(null);
  const [err, setErr] = useState("");
  const [drivesFor, setDrivesFor] = useState(null);
  const load = () => api.get("/admin/photographers").then((r) => setList(r.data));
  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault(); setErr("");
    try {
      if (edit.id) await api.put(`/admin/photographers/${edit.id}`, edit);
      else await api.post("/admin/photographers", edit);
      setEdit(null); load();
    } catch (ex) { setErr(errMsg(ex)); }
  };
  const del = async (p) => {
    if (!window.confirm(`Delete ${p.name} and ALL their events, guests and payments? (Their Drive files are not touched.)`)) return;
    await api.delete(`/admin/photographers/${p.id}`); load();
  };

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Photographers</h1><div className="muted">Studios using this system. Each sees only their own events.</div></div>
        <button className="btn gold" onClick={() => setEdit({ ...blank })}>＋ Add photographer</button>
      </div>
      <div className="card">
        {!list ? <Loader /> : list.length === 0 ? <div className="empty">No photographers yet.</div> : (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Photographer</th><th>Studio</th><th>Events</th><th>Google Drive</th><th>Plan expiry</th><th>Status</th><th></th></tr></thead>
            <tbody>{list.map((p) => (
              <tr key={p.id}>
                <td><b>{p.name}</b><div className="small muted">{p.email} {p.phone}</div></td>
                <td>{p.studio?.name}</td><td>{p.event_count}</td>
                <td className="small">{p.drive_count > 0 ? <span style={{ color: "var(--ok)" }}>✓ {p.drive_count} drive(s)</span> : <span className="muted">not added</span>}
                  {!p.has_api_key && <div className="muted">no own API key</div>}</td>
                <td className="small">{p.plan_expiry ? fmtDate(p.plan_expiry) : "No expiry"}</td>
                <td><Pill s={p.active ? "active" : "inactive"} /></td>
                <td className="row" style={{ flexWrap: "nowrap" }}>
                  <button className="btn sm gold" onClick={() => setDrivesFor(p)}>🗂️ Drives</button>
                  <button className="btn sm" onClick={() => setEdit({ ...blank, ...p, studio_name: p.studio?.name || "", password: "" })}>Edit</button>
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
            <div className="field"><label className="lbl">Notes</label><textarea className="input" rows={2} value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></div>
            <div className="row" style={{ justifyContent: "flex-end" }}><button type="button" className="btn" onClick={() => setEdit(null)}>Cancel</button><button className="btn primary">Save</button></div>
          </form>
        </Modal>
      )}
    </div>
  );
}

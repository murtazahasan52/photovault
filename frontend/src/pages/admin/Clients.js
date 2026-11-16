import React, { useEffect, useState } from "react";
import { api, errMsg } from "../../lib/api";
import { Loader, Modal, waLink } from "../../components/ui";

const blank = { name: "", phone: "", email: "", address: "", notes: "" };

export default function Clients() {
  const [list, setList] = useState(null);
  const [edit, setEdit] = useState(null);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const load = () => api.get("/clients").then((r) => setList(r.data));
  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault(); setErr("");
    try {
      if (edit.id) await api.put(`/clients/${edit.id}`, edit); else await api.post("/clients", edit);
      setEdit(null); load();
    } catch (ex) { setErr(errMsg(ex)); }
  };
  const del = async (c) => { if (window.confirm(`Delete client ${c.name}?`)) { await api.delete(`/clients/${c.id}`); load(); } };
  const shown = (list || []).filter((c) => !q || `${c.name} ${c.phone} ${c.email}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Clients</h1><div className="muted">People who book you.</div></div>
        <button className="btn gold" onClick={() => setEdit({ ...blank })}>＋ Add client</button>
      </div>
      <input className="input" style={{ maxWidth: 320, marginBottom: 14 }} placeholder="Search name / mobile…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="card">
        {!list ? <Loader /> : shown.length === 0 ? <div className="empty">No clients yet.</div> : (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Name</th><th>Mobile</th><th>Email</th><th>Events</th><th></th></tr></thead>
            <tbody>{shown.map((c) => (
              <tr key={c.id}>
                <td><b>{c.name}</b><div className="small muted">{c.address}</div></td>
                <td>{c.phone}</td><td>{c.email}</td><td>{c.event_count}</td>
                <td className="row" style={{ flexWrap: "nowrap" }}>
                  {c.phone && <a className="btn sm" href={waLink(c.phone, `Hi ${c.name}, `)} target="_blank" rel="noreferrer">WhatsApp</a>}
                  <button className="btn sm" onClick={() => setEdit(c)}>Edit</button>
                  <button className="btn sm danger" onClick={() => del(c)}>✕</button>
                </td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
      {edit && (
        <Modal title={edit.id ? "Edit client" : "Add client"} onClose={() => setEdit(null)}>
          <form onSubmit={save}>
            {err && <div className="err">{err}</div>}
            <div className="grid2">
              <div className="field"><label className="lbl">Name *</label><input className="input" required value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
              <div className="field"><label className="lbl">Mobile</label><input className="input" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></div>
            </div>
            <div className="field"><label className="lbl">Email</label><input className="input" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></div>
            <div className="field"><label className="lbl">Address</label><input className="input" value={edit.address} onChange={(e) => setEdit({ ...edit, address: e.target.value })} /></div>
            <div className="field"><label className="lbl">Notes</label><textarea className="input" rows={3} value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></div>
            <div className="row" style={{ justifyContent: "flex-end" }}><button type="button" className="btn" onClick={() => setEdit(null)}>Cancel</button><button className="btn primary">Save</button></div>
          </form>
        </Modal>
      )}
    </div>
  );
}

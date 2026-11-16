import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, errMsg } from "../../lib/api";
import { Loader } from "../../components/ui";
import { useAuth } from "../../App";

export default function Settings() {
  const { refresh } = useAuth();
  const [s, setS] = useState(null);
  const [msg, setMsg] = useState(null);
  const [pw, setPw] = useState({ old_password: "", new_password: "" });
  const [pwMsg, setPwMsg] = useState(null);

  useEffect(() => { api.get("/settings").then((r) => setS(r.data)); }, []);
  if (!s) return <div className="page"><Loader /></div>;
  const st = s.studio || {};
  const setStudio = (k) => (e) => setS({ ...s, studio: { ...st, [k]: e.target.value } });

  const save = async (e) => {
    e.preventDefault(); setMsg(null);
    try {
      const { data } = await api.put("/settings", { name: s.name, phone: s.phone, studio: s.studio });
      setS(data); setMsg({ ok: true, t: "Saved ✓" }); refresh();
    } catch (ex) { setMsg({ ok: false, t: errMsg(ex) }); }
  };
  const changePw = async (e) => {
    e.preventDefault(); setPwMsg(null);
    try { await api.post("/auth/change-password", pw); setPw({ old_password: "", new_password: "" }); setPwMsg({ ok: true, t: "Password changed ✓" }); }
    catch (ex) { setPwMsg({ ok: false, t: errMsg(ex) }); }
  };

  return (
    <div className="page">
      <div className="page-head"><div><h1>Settings</h1><div className="muted">Studio branding shown on guest pages, and your Google Drive connection.</div></div></div>

      <div className="card">
        <h3>Google Drive connection</h3>
        <p className="small muted">Your API key and all your Google Drives are managed on the <b>My Drives</b> page (with a step-by-step guide).</p>
        <Link className="btn gold" to="/admin/drives">🗂️ Open My Drives</Link>
      </div>

      <form className="card" onSubmit={save}>
        <h3>Studio profile (shown to guests)</h3>
        {msg && <div className={msg.ok ? "okmsg" : "err"}>{msg.t}</div>}
        <div className="grid2">
          <div className="field"><label className="lbl">Studio name</label><input className="input" value={st.name || ""} onChange={setStudio("name")} /></div>
          <div className="field"><label className="lbl">Tagline</label><input className="input" value={st.tagline || ""} onChange={setStudio("tagline")} placeholder="Capturing moments since 2010" /></div>
        </div>
        <div className="grid2">
          <div className="field"><label className="lbl">Logo URL</label><input className="input" value={st.logo_url || ""} onChange={setStudio("logo_url")} placeholder="https://…/logo.png" /></div>
          <div className="field"><label className="lbl">Brand colour</label>
            <div className="row" style={{ flexWrap: "nowrap" }}><input type="color" value={st.brand_color || "#c8a24a"} onChange={setStudio("brand_color")} style={{ width: 50, height: 40, border: 0, background: "none" }} />
              <input className="input" value={st.brand_color || ""} onChange={setStudio("brand_color")} /></div></div>
        </div>
        <div className="grid3">
          <div className="field"><label className="lbl">Phone</label><input className="input" value={st.phone || ""} onChange={setStudio("phone")} /></div>
          <div className="field"><label className="lbl">WhatsApp</label><input className="input" value={st.whatsapp || ""} onChange={setStudio("whatsapp")} /></div>
          <div className="field"><label className="lbl">Email</label><input className="input" value={st.email || ""} onChange={setStudio("email")} /></div>
        </div>
        <div className="grid3">
          <div className="field"><label className="lbl">Instagram (link)</label><input className="input" value={st.instagram || ""} onChange={setStudio("instagram")} /></div>
          <div className="field"><label className="lbl">Website</label><input className="input" value={st.website || ""} onChange={setStudio("website")} /></div>
          <div className="field"><label className="lbl">Address</label><input className="input" value={st.address || ""} onChange={setStudio("address")} /></div>
        </div>
        <div className="grid2">
          <div className="field"><label className="lbl">Your name</label><input className="input" value={s.name || ""} onChange={(e) => setS({ ...s, name: e.target.value })} /></div>
          <div className="field"><label className="lbl">Your mobile</label><input className="input" value={s.phone || ""} onChange={(e) => setS({ ...s, phone: e.target.value })} /></div>
        </div>
        <button className="btn primary">Save profile</button>
      </form>

      <form className="card" onSubmit={changePw} style={{ maxWidth: 520 }}>
        <h3>Change password</h3>
        {pwMsg && <div className={pwMsg.ok ? "okmsg" : "err"}>{pwMsg.t}</div>}
        <div className="field"><label className="lbl">Current password</label><input type="password" className="input" value={pw.old_password} onChange={(e) => setPw({ ...pw, old_password: e.target.value })} required /></div>
        <div className="field"><label className="lbl">New password</label><input type="password" className="input" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} required /></div>
        <button className="btn primary">Change password</button>
      </form>
    </div>
  );
}

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, errMsg } from "../../lib/api";
import { useAuth } from "../../App";

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState("login");
  const [f, setF] = useState({ email: "", password: "", name: "", phone: "", studio_name: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [signupOpen, setSignupOpen] = useState(false);

  useEffect(() => { if (user) nav("/admin"); }, [user, nav]);
  useEffect(() => { api.get("/").then((r) => setSignupOpen(!!r.data.signup)).catch(() => {}); }, []);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      const { data } = await api.post(mode === "login" ? "/auth/login" : "/auth/signup", f);
      login(data.token, data.user);
      nav("/admin");
    } catch (ex) { setErr(errMsg(ex)); }
    setBusy(false);
  };

  return (
    <div className="auth">
      <div className="auth-art">
        <div style={{ fontSize: 44, marginBottom: 18 }}>📸</div>
        <h1 className="serif">Every guest finds<br />their own photos.</h1>
        <p style={{ opacity: 0.75, maxWidth: 440, lineHeight: 1.6 }}>
          Link your Google Drive, share one event link, and let guests find their pictures with a selfie.
          Your photos never leave your Drive.
        </p>
      </div>
      <div className="auth-form">
        <form onSubmit={submit}>
          <h2 style={{ fontSize: 26 }}>{mode === "login" ? "Photographer login" : "Create your studio"}</h2>
          <p className="muted" style={{ marginBottom: 22 }}>PhotoVault — photographer management system</p>
          {err && <div className="err">{err}</div>}
          {mode === "signup" && <>
            <div className="field"><label className="lbl">Your name</label><input className="input" value={f.name} onChange={set("name")} required /></div>
            <div className="field"><label className="lbl">Studio name</label><input className="input" value={f.studio_name} onChange={set("studio_name")} /></div>
            <div className="field"><label className="lbl">Mobile</label><input className="input" value={f.phone} onChange={set("phone")} /></div>
          </>}
          <div className="field"><label className="lbl">Email</label><input className="input" type="email" value={f.email} onChange={set("email")} required /></div>
          <div className="field"><label className="lbl">Password</label><input className="input" type="password" value={f.password} onChange={set("password")} required /></div>
          <button className="btn primary block" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}</button>
          {signupOpen && (
            <p className="center small muted" style={{ marginTop: 16 }}>
              {mode === "login" ? "New photographer? " : "Already have an account? "}
              <a href="#x" onClick={(e) => { e.preventDefault(); setMode(mode === "login" ? "signup" : "login"); }}>
                {mode === "login" ? "Create an account" : "Log in"}
              </a>
            </p>
          )}
        </form>
      </div>
    </div>
  );
}

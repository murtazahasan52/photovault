import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../App";
import { api } from "../../lib/api";

export default function Layout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(0);
  const loc = useLocation();

  useEffect(() => { setOpen(false); }, [loc.pathname]);
  useEffect(() => {
    const load = () => api.get("/requests", { params: { status: "pending" } })
      .then((r) => setPending(r.data.length)).catch(() => {});
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [loc.pathname]);

  const studio = user?.studio?.name || "PhotoVault";
  return (
    <div className="shell">
      <aside className={`side ${open ? "open" : ""}`}>
        <div className="brand"><div className="dot">📸</div><span>PhotoVault</span></div>
        <nav className="nav">
          <NavLink end to="/admin">🏠 Dashboard</NavLink>
          <NavLink to="/admin/events">🎞️ Events</NavLink>
          <NavLink to="/admin/drives">🗂️ My Drives</NavLink>
          <NavLink to="/admin/requests">🔐 Access requests {pending > 0 && <span className="badge">{pending}</span>}</NavLink>
          <NavLink to="/admin/clients">👥 Clients</NavLink>
          <NavLink to="/admin/payments">💰 Payments</NavLink>
          {user?.role === "superadmin" && <NavLink to="/admin/photographers">🧑‍💼 Photographers</NavLink>}
          <NavLink to="/admin/settings">⚙️ Settings</NavLink>
        </nav>
        <div className="foot">
          <div style={{ fontWeight: 600 }}>{studio}</div>
          <div style={{ opacity: 0.7, marginBottom: 8 }}>{user?.email}{user?.role === "superadmin" ? " · Main admin" : ""}</div>
          <button className="btn sm" onClick={logout}>Log out</button>
        </div>
      </aside>
      <div className="main">
        <div className="topbar">
          <button onClick={() => setOpen(true)}>☰</button>
          <b>PhotoVault</b>
        </div>
        <Outlet />
      </div>
    </div>
  );
}

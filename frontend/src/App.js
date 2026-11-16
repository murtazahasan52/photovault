import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { api } from "./lib/api";
import Login from "./pages/admin/Login";
import Layout from "./pages/admin/Layout";
import Dashboard from "./pages/admin/Dashboard";
import Events from "./pages/admin/Events";
import EventDetail from "./pages/admin/EventDetail";
import Clients from "./pages/admin/Clients";
import Requests from "./pages/admin/Requests";
import Payments from "./pages/admin/Payments";
import Settings from "./pages/admin/Settings";
import Photographers from "./pages/admin/Photographers";
import Drives from "./pages/admin/Drives";
import GuestEvent from "./pages/guest/GuestEvent";
import Shot from "./pages/guest/Shot";
import LiveScreen from "./pages/guest/LiveScreen";
import Booth from "./pages/admin/Booth";

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    if (!localStorage.getItem("pv_token")) { setUser(null); setReady(true); return; }
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch {
      localStorage.removeItem("pv_token");
      setUser(null);
    }
    setReady(true);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = (token, u) => { localStorage.setItem("pv_token", token); setUser(u); refresh(); };
  const logout = () => { localStorage.removeItem("pv_token"); setUser(null); };

  return <AuthCtx.Provider value={{ user, ready, login, logout, refresh }}>{children}</AuthCtx.Provider>;
}

function Protected({ children, superOnly }) {
  const { user, ready } = useAuth();
  if (!ready) return <div style={{ padding: 60 }}><div className="spinner dark" /></div>;
  if (!user) return <Navigate to="/admin/login" replace />;
  if (superOnly && user.role !== "superadmin") return <Navigate to="/admin" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Navigate to="/admin" replace />} />
        <Route path="/e/:slug" element={<GuestEvent />} />
        <Route path="/p/:code" element={<Shot />} />
        <Route path="/live/:slug" element={<LiveScreen />} />
        <Route path="/admin/booth/:id" element={<Protected><Booth /></Protected>} />
        <Route path="/admin/login" element={<Login />} />
        <Route path="/admin" element={<Protected><Layout /></Protected>}>
          <Route index element={<Dashboard />} />
          <Route path="events" element={<Events />} />
          <Route path="events/:id" element={<EventDetail />} />
          <Route path="clients" element={<Clients />} />
          <Route path="requests" element={<Requests />} />
          <Route path="payments" element={<Payments />} />
          <Route path="drives" element={<Drives />} />
          <Route path="settings" element={<Settings />} />
          <Route path="photographers" element={<Protected superOnly><Photographers /></Protected>} />
        </Route>
        <Route path="*" element={<div className="empty"><h2>Page not found</h2></div>} />
      </Routes>
    </AuthProvider>
  );
}

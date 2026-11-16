import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, fmtDate } from "../../lib/api";
import { thumb } from "../../lib/drive";
import { Loader, Pill } from "../../components/ui";
import EventForm from "./EventForm";

export default function Events() {
  const [list, setList] = useState(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [params, setParams] = useSearchParams();
  const [showForm, setShowForm] = useState(params.get("new") === "1");
  const nav = useNavigate();

  const load = () => api.get("/events", { params: { q, status } }).then((r) => setList(r.data));
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); /* eslint-disable-next-line */ }, [q, status]);

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Events</h1><div className="muted">Each event gets its own guest link.</div></div>
        <button className="btn gold" onClick={() => setShowForm(true)}>＋ New event</button>
      </div>
      <div className="row" style={{ marginBottom: 16 }}>
        <input className="input" style={{ maxWidth: 300 }} placeholder="Search events…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" style={{ maxWidth: 180 }} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {["upcoming", "shooting", "editing", "delivered", "completed"].map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>
      {!list ? <Loader /> : list.length === 0 ? (
        <div className="card empty">
          <div style={{ fontSize: 40 }}>🎞️</div>
          <h3>No events yet</h3>
          <p>Create your first event and paste your Google Drive folder link.</p>
          <button className="btn gold" onClick={() => setShowForm(true)}>＋ Create event</button>
        </div>
      ) : (
        <div className="ev-grid">
          {list.map((e) => {
            const cover = e.cover_url || null;
            return (
              <Link key={e.id} to={`/admin/events/${e.id}`} className="ev-card">
                <div className="ev-cover" style={cover ? { backgroundImage: `url(${cover})` } : undefined}>
                  {!cover && e.cover_file_id && <CoverImg fid={e.cover_file_id} />}
                  <Pill s={e.status} />
                </div>
                <div className="ev-body">
                  <h3>{e.name}</h3>
                  <div className="small muted">{e.event_type} · {fmtDate(e.date) || "No date"}{e.client_name ? ` · ${e.client_name}` : ""}</div>
                  <div className="ev-meta">
                    <span>🖼 {e.photo_count}</span><span>🎬 {e.video_count}</span>
                    <span>🙂 {e.indexed_count}/{e.photo_count} indexed</span><span>👥 {e.guest_count}</span>
                    {e.pending_requests > 0 && <span style={{ color: "#b07c00", fontWeight: 600 }}>🔐 {e.pending_requests} pending</span>}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
      {showForm && (
        <EventForm onClose={() => { setShowForm(false); setParams({}); }}
          onSaved={(ev) => { setShowForm(false); nav(`/admin/events/${ev.id}?tab=media`); }} />
      )}
    </div>
  );
}

function CoverImg({ fid }) {
  return <img src={thumb(fid, 600)} alt="" referrerPolicy="no-referrer"
    style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => (e.currentTarget.style.display = "none")} />;
}

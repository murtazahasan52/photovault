import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, money, fmtDate } from "../../lib/api";
import { useAuth } from "../../App";
import { Loader, Pill } from "../../components/ui";

export default function Dashboard() {
  const { user } = useAuth();
  const [d, setD] = useState(null);
  useEffect(() => { api.get("/dashboard").then((r) => setD(r.data)); }, []);
  if (!d) return <div className="page"><Loader /></div>;

  const stats = [
    ["Events", d.events], ["Photos", d.photos], ["Videos", d.videos], ["Faces indexed", d.faces],
    ["Guests", d.guests], ["Pending requests", d.pending_requests], ["Received", money(d.total_paid)], ["Balance due", money(d.total_due)],
  ];
  if (d.photographers !== undefined) stats.unshift(["Photographers", d.photographers]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Welcome, {user?.name?.split(" ")[0] || "there"} 👋</h1>
          <div className="muted">Here's what's happening at {user?.studio?.name || "your studio"}.</div>
        </div>
        <Link className="btn gold" to="/admin/events?new=1">＋ New event</Link>
      </div>

      {!user?.has_api_key && (
        <div className="note">
          Connect your Google Drive first — open <Link to="/admin/drives">My Drives</Link> and follow the 5-step guide.
        </div>
      )}

      <div className="stats">
        {stats.map(([k, v]) => <div className="stat" key={k}><div className="k">{k}</div><div className="v">{v}</div></div>)}
      </div>

      <div className="grid2">
        <div className="card">
          <div className="row between"><h3>Upcoming events</h3><Link className="small" to="/admin/events">All events →</Link></div>
          {d.upcoming.length === 0 ? <div className="empty">No upcoming events</div> : (
            <table className="tbl"><tbody>
              {d.upcoming.map((e) => (
                <tr key={e.id}>
                  <td><Link to={`/admin/events/${e.id}`}><b>{e.name}</b></Link><div className="small muted">{e.client_name || e.venue}</div></td>
                  <td className="small">{fmtDate(e.date)}</td>
                  <td><Pill s={e.status} /></td>
                </tr>
              ))}
            </tbody></table>
          )}
        </div>
        <div className="card">
          <div className="row between"><h3>Latest guests</h3>
            {d.pending_requests > 0 && <Link className="btn sm gold" to="/admin/requests">{d.pending_requests} pending request(s)</Link>}
          </div>
          {d.recent_guests.length === 0 ? <div className="empty">No guests yet. Share an event link!</div> : (
            <table className="tbl"><tbody>
              {d.recent_guests.map((g) => (
                <tr key={g.id}>
                  <td><b>{g.name || "Guest"}</b><div className="small muted">{g.phone}</div></td>
                  <td className="small">{g.event_name}</td>
                  <td className="small">{g.match_count} photos</td>
                  <td><Pill s={g.access_status === "none" ? "" : g.access_status} /></td>
                </tr>
              ))}
            </tbody></table>
          )}
        </div>
      </div>
    </div>
  );
}

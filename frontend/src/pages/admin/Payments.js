import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, money, fmtDate } from "../../lib/api";
import { Loader, Pill } from "../../components/ui";

export default function Payments() {
  const [d, setD] = useState(null);
  const [onlyDue, setOnlyDue] = useState(false);
  useEffect(() => { api.get("/payments").then((r) => setD(r.data)); }, []);
  if (!d) return <div className="page"><Loader /></div>;
  const rows = d.events.filter((e) => !onlyDue || e.balance > 0);
  return (
    <div className="page">
      <div className="page-head"><div><h1>Payments</h1><div className="muted">Package amount, received and balance per event.</div></div></div>
      <div className="stats">
        <div className="stat"><div className="k">Total packages</div><div className="v">{money(d.total_package)}</div></div>
        <div className="stat"><div className="k">Received</div><div className="v" style={{ color: "var(--ok)" }}>{money(d.total_paid)}</div></div>
        <div className="stat"><div className="k">Balance due</div><div className="v" style={{ color: "var(--bad)" }}>{money(d.total_due)}</div></div>
      </div>
      <div className="card">
        <div className="row between"><h3>By event</h3>
          <label className="switch" style={{ margin: 0 }}><input type="checkbox" checked={onlyDue} onChange={(e) => setOnlyDue(e.target.checked)} /> Only with balance</label></div>
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Event</th><th>Date</th><th>Client</th><th>Package</th><th>Received</th><th>Balance</th><th>Status</th></tr></thead>
          <tbody>{rows.map((e) => (
            <tr key={e.id}>
              <td><Link to={`/admin/events/${e.id}?tab=payments`}><b>{e.name}</b></Link></td>
              <td className="small">{fmtDate(e.date)}</td><td>{e.client_name}</td>
              <td>{money(e.package_amount)}</td><td>{money(e.paid_amount)}</td>
              <td style={{ color: e.balance > 0 ? "var(--bad)" : "inherit", fontWeight: 600 }}>{money(e.balance)}</td>
              <td><Pill s={e.status} /></td>
            </tr>
          ))}</tbody>
        </table></div>
      </div>
      <div className="card">
        <h3>Recent payments</h3>
        {d.recent.length === 0 ? <div className="empty">No payments yet</div> : (
          <table className="tbl"><tbody>{d.recent.map((p) => (
            <tr key={p.id}><td><b>{money(p.amount)}</b> <span className="small muted">{p.mode}</span></td><td>{p.event_name}</td><td className="small">{fmtDate(p.date)}</td><td className="small muted">{p.note}</td></tr>
          ))}</tbody></table>
        )}
      </div>
    </div>
  );
}

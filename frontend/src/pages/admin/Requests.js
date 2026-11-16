import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { Loader } from "../../components/ui";
import { RequestTable } from "./EventDetail";

export default function Requests() {
  const [status, setStatus] = useState("pending");
  const [list, setList] = useState(null);
  const load = () => api.get("/requests", { params: { status } }).then((r) => setList(r.data));
  useEffect(() => { setList(null); load(); /* eslint-disable-next-line */ }, [status]);
  return (
    <div className="page">
      <div className="page-head"><div><h1>Access requests</h1><div className="muted">Guests asking to see ALL photos of an event.</div></div></div>
      <div className="tabs">
        {["pending", "approved", "rejected", ""].map((s) => (
          <button key={s} className={status === s ? "on" : ""} onClick={() => setStatus(s)}>{s || "all"}</button>
        ))}
      </div>
      <div className="card">{!list ? <Loader /> : <RequestTable list={list} onDone={load} showEvent />}</div>
    </div>
  );
}

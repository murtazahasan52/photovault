import React, { useCallback, useEffect, useState } from "react";
import { api, errMsg } from "../lib/api";
import { thumb, onImgError } from "../lib/drive";
import { Loader, Modal } from "./ui";

/**
 * Browse the folders of one saved Drive.
 * onPick(folder) — when given, shows a "Use this folder" button (used by the event form).
 * onCreateEvent(folder) / onAddToEvent(folder) — used by the Drives page.
 */
export default function DriveBrowser({ drive, onClose, onPick, onCreateEvent, onAddToEvent }) {
  const [stack, setStack] = useState([{ id: "", name: drive.root_name || drive.label }]);
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const cur = stack[stack.length - 1];

  const load = useCallback(async () => {
    setData(null); setErr("");
    try {
      const { data } = await api.get(`/drives/${drive.id}/browse`, { params: { folder_id: cur.id } });
      setData(data);
    } catch (e) { setErr(errMsg(e)); }
  }, [drive.id, cur.id]);
  useEffect(() => { load(); }, [load]);

  const folderObj = (f) => ({ id: f.id, name: f.name, url: f.url, drive_ref: drive.id });

  const actions = (f) => (
    <div className="row" style={{ flexWrap: "nowrap" }}>
      {onPick && <button className="btn sm gold" onClick={() => onPick(folderObj(f))}>Use this folder</button>}
      {onCreateEvent && <button className="btn sm gold" onClick={() => onCreateEvent(folderObj(f))}>＋ Create event</button>}
      {onAddToEvent && <button className="btn sm" onClick={() => onAddToEvent(folderObj(f))}>Add to event</button>}
    </div>
  );

  return (
    <Modal title={`📁 ${drive.label}${drive.email ? ` · ${drive.email}` : ""}`} onClose={onClose} wide>
      <div className="row small" style={{ marginBottom: 12 }}>
        {stack.map((s, i) => (
          <span key={i}>
            {i > 0 && " / "}
            <a href="#b" onClick={(e) => { e.preventDefault(); setStack(stack.slice(0, i + 1)); }}
              style={{ fontWeight: i === stack.length - 1 ? 700 : 400 }}>{s.name}</a>
          </span>
        ))}
      </div>
      {err && <div className="err">{err}</div>}
      {!data && !err ? <Loader /> : data && <>
        <div className="card" style={{ background: "var(--bg)" }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div>
              <b>{data.folder.name}</b>
              <div className="small muted">This folder: {data.photos} photos · {data.videos} videos · {data.folders.length} sub-folders
                {data.folder.events.length > 0 && <> · used in <b>{data.folder.events.map((e) => e.name).join(", ")}</b></>}</div>
            </div>
            {actions(data.folder)}
          </div>
          {data.sample.length > 0 && (
            <div className="row" style={{ marginTop: 10, flexWrap: "nowrap", overflow: "hidden" }}>
              {data.sample.map((id) => (
                <img key={id} src={thumb(id, 160)} onError={(e) => onImgError(e, id, 160)} referrerPolicy="no-referrer" alt=""
                  style={{ width: 70, height: 70, objectFit: "cover", borderRadius: 8 }} />
              ))}
            </div>
          )}
          <div className="small muted" style={{ marginTop: 8 }}>Tip: pick the event's main folder — its sub-folders (Haldi, Wedding…) become albums automatically.</div>
        </div>
        {data.folders.length === 0 ? <div className="empty">No sub-folders here.</div> : (
          <table className="tbl"><tbody>
            {data.folders.map((f) => (
              <tr key={f.id}>
                <td style={{ cursor: "pointer" }} onClick={() => setStack([...stack, { id: f.id, name: f.name }])}>
                  📁 <b>{f.name}</b>
                  {f.events.length > 0 && <div className="small" style={{ color: "var(--ok)" }}>✓ in event: {f.events.map((e) => e.name).join(", ")}</div>}
                </td>
                <td style={{ width: 1 }}>
                  <div className="row" style={{ flexWrap: "nowrap" }}>
                    <button className="btn sm" onClick={() => setStack([...stack, { id: f.id, name: f.name }])}>Open ›</button>
                    {actions(f)}
                  </div>
                </td>
              </tr>
            ))}
          </tbody></table>
        )}
      </>}
    </Modal>
  );
}

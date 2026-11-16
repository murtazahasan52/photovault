import React, { useMemo, useState } from "react";
import { Lightbox, Thumb } from "../../components/ui";
import { openInDrive, saveToDevice } from "../../lib/drive";


export default function GuestGallery({ items, albums, allowDownload, emptyText }) {
  const [album, setAlbum] = useState("");
  const [kind, setKind] = useState("");
  const [lb, setLb] = useState(-1);
  const [selecting, setSelecting] = useState(false);
  const [sel, setSel] = useState({});
  const [limit, setLimit] = useState(60);

  const shown = useMemo(() => items.filter((m) => (!album || m.album === album) && (!kind || m.type === kind)), [items, album, kind]);
  const hasVideos = items.some((m) => m.type === "video");
  const selected = shown.filter((m) => sel[m.id]);

  const downloadSelected = async () => {
    const list = selected.length ? selected : shown;
    if (list.length > 30 && !window.confirm(`Download ${list.length} files? Your browser may ask permission for multiple downloads.`)) return;
    for (const m of list) {
      if (m.type === "video") window.open(openInDrive(m.file_id), "_blank");
      else saveToDevice(m);
      await new Promise((r) => setTimeout(r, 700));
    }
  };

  if (!items.length) return <div className="g-card center muted">{emptyText || "No photos yet."}</div>;

  return (
    <div>
      {(albums?.length > 1 || hasVideos) && (
        <div className="chips">
          {albums?.length > 1 && <>
            <button className={`chip ${!album ? "on" : ""}`} onClick={() => setAlbum("")}>All ({items.length})</button>
            {albums.map((a) => <button key={a} className={`chip ${album === a ? "on" : ""}`} onClick={() => setAlbum(a)}>{a || "Other"}</button>)}
          </>}
          {hasVideos && <>
            <button className={`chip ${kind === "photo" ? "on" : ""}`} onClick={() => setKind(kind === "photo" ? "" : "photo")}>🖼 Photos</button>
            <button className={`chip ${kind === "video" ? "on" : ""}`} onClick={() => setKind(kind === "video" ? "" : "video")}>🎬 Videos</button>
          </>}
        </div>
      )}

      <div className="g-gallery">
        {shown.slice(0, limit).map((m, i) => (
          <div key={m.id} className="gi" onClick={() => (selecting ? setSel({ ...sel, [m.id]: !sel[m.id] }) : setLb(i))}>
            <Thumb m={m} w={500} />
            {m.type === "video" && <div className="play">▶</div>}
            {selecting && <div className={`sel ${sel[m.id] ? "on" : ""}`}>{sel[m.id] ? "✓" : ""}</div>}
          </div>
        ))}
      </div>
      {shown.length > limit && <div className="center" style={{ margin: 16 }}><button className="btn" onClick={() => setLimit(limit + 90)}>Load more ({shown.length - limit})</button></div>}

      {allowDownload && (
        <div className="sticky-bar">
          <span className="small">{selecting ? `${selected.length} selected` : `${shown.length} items`}</span>
          <div className="row">
            <button className="btn sm" onClick={() => { setSelecting(!selecting); setSel({}); }}>{selecting ? "Cancel" : "Select"}</button>
            <button className="btn sm gold" onClick={downloadSelected} disabled={selecting && !selected.length}>
              ⬇ Download {selecting ? "selected" : "all"}
            </button>
          </div>
        </div>
      )}
      {lb >= 0 && <Lightbox items={shown} index={lb} onIndex={setLb} onClose={() => setLb(-1)} allowDownload={allowDownload} />}
    </div>
  );
}

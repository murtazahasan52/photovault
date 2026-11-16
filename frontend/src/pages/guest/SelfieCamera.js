import React, { useEffect, useRef, useState } from "react";

/** Live front-camera selfie. Calls onCapture(canvas). */
export default function SelfieCamera({ onCapture, onCancel }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [err, setErr] = useState("");
  const [shot, setShot] = useState(null);
  const [facing, setFacing] = useState("user");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setErr("");
      try {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 960 }, height: { ideal: 1280 } }, audio: false,
        });
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = s;
        if (videoRef.current) { videoRef.current.srcObject = s; await videoRef.current.play().catch(() => {}); }
      } catch (e) {
        setErr(e?.name === "NotAllowedError"
          ? "Camera permission was denied. Allow camera access in your browser settings, or upload a photo from your gallery instead."
          : "Could not open the camera on this device. Please upload a selfie from your gallery instead.");
      }
    })();
    return () => { cancelled = true; };
  }, [facing]);

  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), []);

  const capture = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas");
    const scale = Math.min(1, 1024 / Math.max(v.videoWidth, v.videoHeight));
    c.width = Math.round(v.videoWidth * scale);
    c.height = Math.round(v.videoHeight * scale);
    const ctx = c.getContext("2d");
    if (facing === "user") { ctx.translate(c.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(v, 0, 0, c.width, c.height);
    setShot(c);
  };

  if (err) return (
    <div className="center">
      <div className="err">{err}</div>
      <button className="btn" onClick={onCancel}>← Back</button>
    </div>
  );

  return (
    <div>
      <div className="cam">
        {shot ? <img src={shot.toDataURL("image/jpeg", 0.9)} alt="selfie" /> : <>
          <video ref={videoRef} playsInline muted className={facing === "user" ? "mirror" : ""} />
          <div className="oval" />
        </>}
      </div>
      <p className="center muted small" style={{ margin: "12px 0" }}>
        {shot ? "Is your face clear? Use this photo or retake." : "Keep your face inside the circle, in good light. Remove sunglasses/mask."}
      </p>
      <div className="row" style={{ justifyContent: "center" }}>
        {shot ? <>
          <button className="btn" onClick={() => setShot(null)}>↺ Retake</button>
          <button className="btn gold" onClick={() => { streamRef.current?.getTracks().forEach((t) => t.stop()); onCapture(shot); }}>✓ Find my photos</button>
        </> : <>
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn gold" onClick={capture} style={{ padding: "12px 26px" }}>📸 Capture</button>
          <button className="btn" onClick={() => setFacing(facing === "user" ? "environment" : "user")} title="Switch camera">🔄</button>
        </>}
      </div>
    </div>
  );
}

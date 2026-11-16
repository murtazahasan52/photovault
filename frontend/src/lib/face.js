// Face detection + recognition runs in the browser (face-api by vladmandic, loaded from CDN).
const LIB = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/dist/face-api.js";
const MODELS = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model/";

let loading = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (window.faceapi) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load face engine. Check internet connection."));
    document.head.appendChild(s);
  });
}

export function loadFace() {
  if (!loading) {
    loading = (async () => {
      await loadScript(LIB);
      const fa = window.faceapi;
      try { await fa.tf.setBackend("webgl"); } catch (_) { /* falls back to cpu */ }
      await fa.tf.ready();
      await Promise.all([
        fa.nets.ssdMobilenetv1.loadFromUri(MODELS),
        fa.nets.faceLandmark68Net.loadFromUri(MODELS),
        fa.nets.faceRecognitionNet.loadFromUri(MODELS),
      ]);
      return fa;
    })().catch((e) => { loading = null; throw e; });
  }
  return loading;
}

/** All face descriptors in an image (for indexing event photos). */
export async function allDescriptors(img, minConfidence = 0.45) {
  const fa = await loadFace();
  const opts = new fa.SsdMobilenetv1Options({ minConfidence, maxResults: 60 });
  const res = await fa.detectAllFaces(img, opts).withFaceLandmarks().withFaceDescriptors();
  return res
    .filter((r) => r.detection.box.width >= 24)
    .map((r) => Array.from(r.descriptor));
}

/** The biggest face in a selfie. Returns { descriptor, box } or null. */
export async function selfieDescriptor(img) {
  const fa = await loadFace();
  const opts = new fa.SsdMobilenetv1Options({ minConfidence: 0.4, maxResults: 10 });
  const res = await fa.detectAllFaces(img, opts).withFaceLandmarks().withFaceDescriptors();
  if (!res.length) return null;
  res.sort((a, b) => b.detection.box.area - a.detection.box.area);
  return { descriptor: Array.from(res[0].descriptor), faces: res.length };
}

export function blobToImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { resolve(img); setTimeout(() => URL.revokeObjectURL(url), 1000); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read image")); };
    img.src = url;
  });
}

/** Shrinks big gallery photos (phones give 12MP+) before detection — faster, same accuracy. */
export async function fileToImage(file, max = 1024) {
  const img = await blobToImage(file);
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  if (scale === 1) return img;
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c;
}

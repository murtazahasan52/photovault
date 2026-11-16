import axios from "axios";

const BASE = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");
export const API = `${BASE}/api`;

export const api = axios.create({ baseURL: API });

api.interceptors.request.use((cfg) => {
  const t = localStorage.getItem("pv_token");
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401 && window.location.pathname.startsWith("/admin") &&
        !window.location.pathname.startsWith("/admin/login")) {
      localStorage.removeItem("pv_token");
      window.location.href = "/admin/login";
    }
    return Promise.reject(err);
  }
);

export const pub = axios.create({ baseURL: `${API}/public` });

export function errMsg(e, fallback = "Something went wrong") {
  const d = e?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x.msg).join(", ");
  return e?.message || fallback;
}

export const money = (n) =>
  "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

export const fmtDate = (s) => {
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d)) return s;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

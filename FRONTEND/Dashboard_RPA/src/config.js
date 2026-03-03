const PAGE_HOST = window.location.hostname || "localhost";
const DEFAULT_API_HOST = PAGE_HOST === "localhost" ? "127.0.0.1" : PAGE_HOST;

const API_HOST =
  import.meta.env.VITE_API_HOST || DEFAULT_API_HOST;

const API_PORT =
  import.meta.env.VITE_API_PORT || "8000";

const PAGE_PROTOCOL = window.location.protocol;
const HTTP_PROTOCOL = PAGE_PROTOCOL === "https:" ? "https" : "http";
const WS_PROTOCOL = PAGE_PROTOCOL === "https:" ? "wss" : "ws";

const RAW_API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  `${HTTP_PROTOCOL}://${API_HOST}:${API_PORT}/api`;

const RAW_WS_BASE_URL =
  import.meta.env.VITE_WS_BASE_URL ||
  `${WS_PROTOCOL}://${API_HOST}:${API_PORT}`;

const normalizeLocalhost = (value) =>
  String(value).replace("://localhost", "://127.0.0.1");

export const API_BASE_URL = normalizeLocalhost(RAW_API_BASE_URL);

export const WS_BASE_URL = normalizeLocalhost(RAW_WS_BASE_URL);

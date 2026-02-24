const API_HOST =
  import.meta.env.VITE_API_HOST || window.location.hostname || "localhost";

const API_PORT =
  import.meta.env.VITE_API_PORT || "8000";

const PAGE_PROTOCOL = window.location.protocol;
const HTTP_PROTOCOL = PAGE_PROTOCOL === "https:" ? "https" : "http";
const WS_PROTOCOL = PAGE_PROTOCOL === "https:" ? "wss" : "ws";

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  `${HTTP_PROTOCOL}://${API_HOST}:${API_PORT}/api`;

export const WS_BASE_URL =
  import.meta.env.VITE_WS_BASE_URL ||
  `${WS_PROTOCOL}://${API_HOST}:${API_PORT}`;

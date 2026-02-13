const API_HOST =
  import.meta.env.VITE_API_HOST || window.location.hostname || "localhost";

const API_PORT =
  import.meta.env.VITE_API_PORT || "8000";

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  `http://${API_HOST}:${API_PORT}/api`;

export const WS_BASE_URL =
  import.meta.env.VITE_WS_BASE_URL ||
  `ws://${API_HOST}:${API_PORT}`;

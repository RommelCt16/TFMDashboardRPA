// src/components/Sidebar.jsx
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { getEstadoInfo } from "../domain/statusMap";
import { useInstancesStream } from "../context/InstancesStreamContext";
import "../styles/sidebar.css";

const LAST_TASK_DETAIL_KEY = "lastTaskDetail";
const ALERTS_ENABLED_KEY = "errorAlertsEnabled";
const ALERTS_HISTORY_KEY = "alertsHistory";
const ALERTS_UNREAD_KEY = "alertsUnread";
const MAX_ALERTS_HISTORY = 200;
const FAILURE_CODES = new Set([2, 3, 7]);
const SIDEBAR_DEFAULT_CLASS = "sidebar collapsed";

function getResultCode(task) {
  const code = task?.ResultCode ?? task?.Status ?? null;
  const numericCode = Number(code);
  return Number.isFinite(numericCode) ? numericCode : null;
}

function isFailure(task) {
  const code = getResultCode(task);
  return code != null && FAILURE_CODES.has(code);
}

function formatAlertDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
}

function applyDarkTheme() {
  document.documentElement.classList.add("dark");
  document.documentElement.classList.remove("light");
}

function Sidebar() {
  const { lastUpdate } = useInstancesStream();
  const location = useLocation();
  const navigate = useNavigate();
  const notifiedFailuresRef = useRef(new Set());
  const [lastTaskDetail, setLastTaskDetail] = useState(null);
  const [alertsEnabled, setAlertsEnabled] = useState(
    localStorage.getItem(ALERTS_ENABLED_KEY) !== "false"
  );
  const alertsEnabledRef = useRef(alertsEnabled);
  const alertsOpenRef = useRef(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [alertFilter, setAlertFilter] = useState("pending");
  const [unreadAlerts, setUnreadAlerts] = useState(() => {
    const raw = localStorage.getItem(ALERTS_UNREAD_KEY);
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  });
  const browserNotificationsSupported = typeof window !== "undefined" && "Notification" in window;

  useEffect(() => {
    applyDarkTheme();
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAST_TASK_DETAIL_KEY);
      setLastTaskDetail(raw ? JSON.parse(raw) : null);
    } catch {
      setLastTaskDetail(null);
    }
  }, [location.pathname]);

  useEffect(() => {
    alertsEnabledRef.current = alertsEnabled;
    localStorage.setItem(ALERTS_ENABLED_KEY, String(alertsEnabled));
  }, [alertsEnabled]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(ALERTS_HISTORY_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const normalized = parsed
        .map((a) => ({
          ...a,
          reviewStatus: a?.reviewStatus === "resolved" ? "resolved" : "pending",
        }))
        .filter((a) => a?.id && a?.instanceId);
      setAlerts(normalized.slice(0, MAX_ALERTS_HISTORY));
    } catch {
      setAlerts([]);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(ALERTS_HISTORY_KEY, JSON.stringify(alerts));
  }, [alerts]);

  useEffect(() => {
    localStorage.setItem(ALERTS_UNREAD_KEY, String(unreadAlerts));
  }, [unreadAlerts]);

  const goToDetail = useCallback((task) => {
    if (!task?.ConstructID || !task?.InstanceID) return;
    const path = `/detalle/${task.ConstructID}/${task.InstanceID}`;
    localStorage.setItem(
      LAST_TASK_DETAIL_KEY,
      JSON.stringify({
        constructId: task.ConstructID,
        instanceId: task.InstanceID,
        taskName: task.ConstructName || "",
        path,
      })
    );
    navigate(path);
  }, [navigate]);

  const pushAlert = useCallback((task) => {
    const taskName = task?.ConstructName || "Proceso sin nombre";
    const instanceId = task?.InstanceID || "N/D";
    const estado = getEstadoInfo(getResultCode(task) ?? 0);
    const item = {
      id: `${instanceId}-${Date.now()}`,
      instanceId,
      constructId: task?.ConstructID || "",
      taskName,
      stateLabel: estado.texto,
      timestamp: new Date().toISOString(),
      reviewStatus: "pending",
      payload: task,
    };

    setAlerts((prev) => [item, ...prev].slice(0, MAX_ALERTS_HISTORY));
    if (!alertsOpenRef.current) {
      setUnreadAlerts((n) => n + 1);
    }

    if (!browserNotificationsSupported || Notification.permission !== "granted") {
      return;
    }

    const notification = new Notification("Dashboard RPA - Error detectado", {
      body: `${taskName}`,
      tag: `task-error-${instanceId}`,
      requireInteraction: true,
    });
    notification.onclick = () => {
      window.focus();
      goToDetail(task);
      notification.close();
    };
  }, [browserNotificationsSupported, goToDetail]);

  useEffect(() => {
    if (alertsEnabledRef.current && browserNotificationsSupported && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, [browserNotificationsSupported]);

  useEffect(() => {
    const merged = lastUpdate?.task;
    if (!merged) return;
    if (!alertsEnabledRef.current || !isFailure(merged)) return;

    const instanceKey = String(merged.InstanceID || "");
    if (!instanceKey || notifiedFailuresRef.current.has(instanceKey)) return;

    notifiedFailuresRef.current.add(instanceKey);
    pushAlert(merged);
  }, [lastUpdate, pushAlert]);

  useEffect(() => {
    alertsOpenRef.current = alertsOpen;
    if (alertsOpen) setUnreadAlerts(0);
  }, [alertsOpen]);

  const { pendingCount, resolvedCount, filteredAlerts } = useMemo(() => {
    const pending = alerts.filter((a) => a.reviewStatus !== "resolved");
    const resolved = alerts.filter((a) => a.reviewStatus === "resolved");
    let filtered = alerts;
    if (alertFilter === "pending") filtered = pending;
    if (alertFilter === "resolved") filtered = resolved;
    return {
      pendingCount: pending.length,
      resolvedCount: resolved.length,
      filteredAlerts: filtered,
    };
  }, [alerts, alertFilter]);

  const toggleAlertsEnabled = () => {
    const next = !alertsEnabled;
    setAlertsEnabled(next);
    if (next && browserNotificationsSupported && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  };

  const markAlertStatus = (id, nextStatus) => {
    setAlerts((prev) =>
      prev.map((a) =>
        a.id === id
          ? { ...a, reviewStatus: nextStatus }
          : a
      )
    );
  };

  const clearResolved = () => {
    setAlerts((prev) => prev.filter((a) => a.reviewStatus !== "resolved"));
  };

  return (
    <>
      <aside
        id="sidebar"
        className={SIDEBAR_DEFAULT_CLASS}
      >
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <span className="material-symbols-outlined">smart_toy</span>
          </div>
          <h1 className="sidebar-title">Dashboard RPA</h1>
        </div>

        <nav className="sidebar-nav">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `nav-link ${isActive ? "active" : ""}`
            }
          >
            <span className="material-symbols-outlined">dashboard</span>
            <span className="nav-text">Tareas en Ejecución</span>
          </NavLink>

          <NavLink
            to="/general"
            className={({ isActive }) =>
              `nav-link ${isActive ? "active" : ""}`
            }
          >
            <span className="material-symbols-outlined">bar_chart</span>
            <span className="nav-text">Dashboard de Tareas</span>
          </NavLink>

          {lastTaskDetail?.path ? (
            <NavLink
              to={lastTaskDetail.path}
              className={({ isActive }) =>
                `nav-link nav-link-last-detail ${isActive ? "active" : ""}`
              }
            >
              <span className="material-symbols-outlined">history</span>
              <span className="nav-text">
                {lastTaskDetail.taskName
                  ? `Ultimo detalle: ${lastTaskDetail.taskName}`
                  : "Ultimo detalle"}
              </span>
            </NavLink>
          ) : null}

        </nav>

        <section className="sidebar-alerts">
          <div className="sidebar-alerts-head">
            <button className="alerts-head-btn" type="button" onClick={() => setAlertsOpen((v) => !v)}>
              <span className="material-symbols-outlined">notifications</span>
              <span className="nav-text">Alertas de Fallo</span>
              {unreadAlerts > 0 ? <span className="alerts-badge">{unreadAlerts}</span> : null}
            </button>
            <button className="alerts-toggle-btn" type="button" onClick={toggleAlertsEnabled} aria-label="Toggle alerts">
              <span className="material-symbols-outlined">
                {alertsEnabled ? "notifications_active" : "notifications_off"}
              </span>
            </button>
          </div>

          <div className="alerts-collapsed-metrics" aria-hidden="true">
            <div className="alerts-mini-metric pending">
              <span className="material-symbols-outlined">error</span>
              <span>{pendingCount}</span>
            </div>
            <div className="alerts-mini-metric resolved">
              <span className="material-symbols-outlined">check_circle</span>
              <span>{resolvedCount}</span>
            </div>
          </div>

          {alertsOpen ? (
            <div className="alerts-panel">
              <div className="alerts-summary">
                <span className="alerts-chip alerts-chip-pending">Pendientes: {pendingCount}</span>
                <span className="alerts-chip alerts-chip-resolved">Solventadas: {resolvedCount}</span>
              </div>

              <div className="alerts-filters">
                <button
                  className={`alerts-filter-btn ${alertFilter === "pending" ? "active" : ""}`}
                  type="button"
                  onClick={() => setAlertFilter("pending")}
                >
                  Pendientes
                </button>
                <button
                  className={`alerts-filter-btn ${alertFilter === "resolved" ? "active" : ""}`}
                  type="button"
                  onClick={() => setAlertFilter("resolved")}
                >
                  Solventadas
                </button>
                <button
                  className={`alerts-filter-btn ${alertFilter === "all" ? "active" : ""}`}
                  type="button"
                  onClick={() => setAlertFilter("all")}
                >
                  Todas
                </button>
              </div>

              <div className="alerts-list">
              {filteredAlerts.length === 0 ? (
                <p className="alerts-empty">Sin fallos recientes.</p>
              ) : (
                filteredAlerts.map((a) => (
                  <div key={a.id} className={`alerts-item ${a.reviewStatus === "resolved" ? "resolved" : "pending"}`}>
                    <span className="alerts-item-title">{a.taskName}</span>
                    <span className="alerts-item-meta">
                      {a.stateLabel}
                    </span>
                    <span className="alerts-item-time">{formatAlertDateTime(a.timestamp)}</span>
                    <div className="alerts-item-actions">
                      <button
                        className="alerts-mini-btn"
                        type="button"
                        onClick={() => goToDetail(a.payload)}
                      >
                        Ver
                      </button>
                      {a.reviewStatus === "resolved" ? (
                        <button
                          className="alerts-mini-btn secondary"
                          type="button"
                          onClick={() => markAlertStatus(a.id, "pending")}
                        >
                          Reabrir
                        </button>
                      ) : (
                        <button
                          className="alerts-mini-btn success"
                          type="button"
                          onClick={() => markAlertStatus(a.id, "resolved")}
                        >
                          Solventada
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
              </div>
              <button className="alerts-clear-btn" type="button" onClick={clearResolved}>
                Limpiar solventadas
              </button>
            </div>
          ) : null}
        </section>

        <div className="sidebar-footer" />
      </aside>
    </>
  );
}
 
export default Sidebar;

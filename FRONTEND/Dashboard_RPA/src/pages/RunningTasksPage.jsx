import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getEstadoInfo } from "../domain/statusMap";
import Cabecera from "../components/Cabecera";
import { useInstancesStream } from "../context/InstancesStreamContext";
import "../styles/running-tasks.css";

const PAGE_SIZE = 10;
const LAST_TASK_DETAIL_KEY = "lastTaskDetail";
const DEFAULT_STATUS_FILTER = "12";
const KNOWN_STATUS_CODES = new Set([1, 2, 3, 7, 11, 12]);

function getStartDate(task) {
  return task?.StartDateTime ?? task?.StartDate ?? null;
}

function getLiveDurationSeconds(task, nowTs) {
  const baseDuration = Number(task?.DurationSeconds);
  const safeBaseDuration = Number.isFinite(baseDuration) ? baseDuration : null;
  const statusCode = getTaskStatusCode(task);

  // Solo corre en vivo mientras la tarea sigue en ejecucion.
  if (statusCode !== 12) {
    return safeBaseDuration;
  }

  const startTs = new Date(getStartDate(task) || 0).getTime();
  if (!Number.isFinite(startTs) || startTs <= 0) {
    return safeBaseDuration;
  }

  const elapsed = Math.max(0, Math.floor((nowTs - startTs) / 1000));
  if (safeBaseDuration == null) return elapsed;
  return Math.max(safeBaseDuration, elapsed);
}

function toNumericCode(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function getTaskStatusCode(task) {
  const resultCode = toNumericCode(task?.ResultCode);
  const statusCode = toNumericCode(task?.Status);

  if (resultCode != null && KNOWN_STATUS_CODES.has(resultCode)) {
    return resultCode;
  }
  if (statusCode != null && KNOWN_STATUS_CODES.has(statusCode)) {
    return statusCode;
  }
  return resultCode ?? statusCode;
}

function RunningTasksPage() {
  const { tasks, loading } = useInstancesStream();
  const [divisionFilter, setDivisionFilter] = useState("");
  const [nameFilter, setNameFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState(DEFAULT_STATUS_FILTER);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState({ key: "StartDateTime", direction: "desc" });
  const [nowTs, setNowTs] = useState(() => Date.now());

  const navigate = useNavigate();

  const divisions = useMemo(() => {
    const setDiv = new Set();
    tasks.forEach((t) => {
      if (t.SubCarpeta) setDiv.add(t.SubCarpeta);
    });
    return Array.from(setDiv).sort();
  }, [tasks]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowTs(Date.now());
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  const filteredTasks = useMemo(() => {
    const div = divisionFilter.toLowerCase();
    const text = nameFilter.toLowerCase();
    const statusCodeFilter = statusFilter ? Number(statusFilter) : null;

    let filtered = tasks.filter((t) => {
      const carpeta = (t.SubCarpeta || "").toLowerCase();
      const nombre = (t.ConstructName || "").toLowerCase();
      const instanceId = String(t.InstanceID || "").toLowerCase();
      const agentName = (t.AgentName || "").toLowerCase();
      const taskStatus = getTaskStatusCode(t);

      const byDivision = !div || carpeta === div;
      const byName =
        !text ||
        nombre.includes(text) ||
        instanceId.includes(text) ||
        agentName.includes(text);
      const byStatus =
        statusCodeFilter == null ||
        taskStatus === statusCodeFilter;

      return byDivision && byName && byStatus;
    });

    if (sortConfig.key) {
      filtered = [...filtered].sort((a, b) => {
        let aVal;
        let bVal;

        if (sortConfig.key === "StartDateTime") {
          aVal = new Date(getStartDate(a) || 0).getTime();
          bVal = new Date(getStartDate(b) || 0).getTime();
        } else if (sortConfig.key === "EndDateTime") {
          aVal = new Date(a.EndDateTime || 0).getTime();
          bVal = new Date(b.EndDateTime || 0).getTime();
        } else if (sortConfig.key === "DurationSeconds") {
          aVal = getLiveDurationSeconds(a, nowTs) ?? 0;
          bVal = getLiveDurationSeconds(b, nowTs) ?? 0;
        } else if (sortConfig.key === "ResultCode") {
          aVal = getTaskStatusCode(a) ?? 0;
          bVal = getTaskStatusCode(b) ?? 0;
        } else {
          aVal = String(a[sortConfig.key] || "").toLowerCase();
          bVal = String(b[sortConfig.key] || "").toLowerCase();
        }

        if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }

    return filtered;
  }, [tasks, divisionFilter, nameFilter, statusFilter, sortConfig, nowTs]);

  const totalPages = Math.max(1, Math.ceil(filteredTasks.length / PAGE_SIZE));
  const pageTasks = filteredTasks.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [divisionFilter, nameFilter, statusFilter]);

  const handleSort = (key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  const handleResetFilters = () => {
    setDivisionFilter("");
    setNameFilter("");
    setStatusFilter(DEFAULT_STATUS_FILTER);
    setSortConfig({ key: "StartDateTime", direction: "desc" });
    setCurrentPage(1);
  };

  const handlePrev = () => setCurrentPage((p) => Math.max(1, p - 1));
  const handleNext = () => setCurrentPage((p) => Math.min(totalPages, p + 1));

  const handleVerDetalle = (instanceId, constructId, taskName) => {
    const path = `/detalle/${constructId}/${instanceId}`;
    localStorage.setItem(
      LAST_TASK_DETAIL_KEY,
      JSON.stringify({
        constructId,
        instanceId,
        taskName: taskName || "",
        path,
      })
    );
    navigate(path);
  };

  const formatDate = (value) => {
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString();
  };

  const formatDuration = (seconds) => {
    if (seconds == null) return "-";
    const sec = parseInt(seconds, 10);
    if (isNaN(sec)) return String(seconds);

    const hours = Math.floor(sec / 3600);
    const minutes = Math.floor((sec % 3600) / 60);
    const secs = sec % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  };

  const getSortClass = (key) => {
    if (sortConfig.key !== key) return "sortable";
    return sortConfig.direction === "asc" ? "sorted-asc" : "sorted-desc";
  };

  return (
    <div className="running-tasks-page">
      <Cabecera title="Tareas en Ejecución" subtitle="Monitorea las tareas activas de tus bots en tiempo real" />
      <div className="running-tasks-main">
        <div className="content-wrapper">
          <div className="filters-panel-glass">
            <div className="filter-group">
              <label htmlFor="filtro-nombre">Buscar Tarea</label>
              <div className="search-input-wrapper">
                <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <circle cx="11" cy="11" r="8"></circle>
                  <path d="m21 21-4.35-4.35"></path>
                </svg>
                <input
                  type="text"
                  id="filtro-nombre"
                  className="filter-input"
                  placeholder="Buscar tarea por nombre, ID o bot..."
                  value={nameFilter}
                  onChange={(e) => setNameFilter(e.target.value)}
                />
              </div>
            </div>

            <div className="filter-group">
              <label htmlFor="filtro-carpeta">División</label>
              <div className="select-wrapper">
                <svg className="select-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                </svg>
                <select
                  id="filtro-carpeta"
                  className="filter-input select-input"
                  value={divisionFilter}
                  onChange={(e) => setDivisionFilter(e.target.value)}
                >
                  <option value="">Todas las divisiones</option>
                  {divisions.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                <svg className="select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </div>
            </div>

            <div className="filter-group">
              <label htmlFor="filtro-estado">Estado</label>
              <div className="select-wrapper">
                <svg className="select-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <circle cx="12" cy="12" r="9"></circle>
                  <path d="M9 12l2 2 4-4"></path>
                </svg>
                <select
                  id="filtro-estado"
                  className="filter-input select-input"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="">Todos los estados</option>
                  <option value="12">En ejecución</option>
                  <option value="1">Success</option>
                  <option value="2">Failure</option>
                  <option value="7">Time Out</option>
                  <option value="3">Incompleto</option>
                  <option value="11">En Cola</option>
                </select>
                <svg className="select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </div>
            </div>

            <div className="filter-actions">
              <button className="btn-modern btn-secondary-modern" onClick={handleResetFilters}>
                <svg className="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <polyline points="23 4 23 10 17 10"></polyline>
                  <path d="M20.49 15a9 9 0 1 1-2-8.83"></path>
                </svg>
                Reiniciar
              </button>
            </div>
          </div>

          <div className="table-container-glass">
            <div className="table-scroll">
              <table className="data-table">
                <thead className="table-header">
                  <tr>
                    <th className="th-number">No.</th>
                    <th className={`${getSortClass("ConstructName")}`} onClick={() => handleSort("ConstructName")}>
                      Proceso
                    </th>
                    <th className={`${getSortClass("StartDateTime")}`} onClick={() => handleSort("StartDateTime")}>
                      Hora Inicio
                    </th>
                    <th className={`${getSortClass("EndDateTime")}`} onClick={() => handleSort("EndDateTime")}>
                      Hora Fin
                    </th>
                    <th className={`${getSortClass("DurationSeconds")}`} onClick={() => handleSort("DurationSeconds")}>
                      Duración
                    </th>
                    <th className={`${getSortClass("ResultCode")}`} onClick={() => handleSort("ResultCode")}>
                      Estado
                    </th>
                    <th className="th-actions">Acciones</th>
                  </tr>
                </thead>
                <tbody className="table-body">
                  {loading && (
                    <tr className="loading-row">
                      <td colSpan={7}>
                        <div className="loading-container">
                          <div className="spinner-box">
                            <div className="spinner-border"></div>
                            <svg className="spinner-icon" viewBox="0 0 24 24">
                              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                            </svg>
                          </div>
                          <p className="loading-text">Sincronizando Tareas</p>
                          <p className="loading-subtext">Recuperando datos de ejecucion...</p>
                        </div>
                      </td>
                    </tr>
                  )}

                  {!loading && pageTasks.length === 0 && (
                    <tr>
                      <td colSpan={7} className="empty-state">
                        No hay tareas activas en este momento.
                      </td>
                    </tr>
                  )}

                  {pageTasks.map((t, idx) => {
                    const estado = getEstadoInfo(getTaskStatusCode(t));
                    const rowNumber = (currentPage - 1) * PAGE_SIZE + idx + 1;

                    return (
                      <tr key={`${t.ConstructID}-${t.InstanceID}`}>
                        <td className="td-number">{rowNumber}</td>
                        <td className="td-text" title={t.ConstructName}>{t.ConstructName}</td>
                        <td className="td-text">{formatDate(getStartDate(t))}</td>
                        <td className="td-text">{formatDate(t.EndDateTime)}</td>
                        <td className="td-text">{formatDuration(getLiveDurationSeconds(t, nowTs))}</td>
                        <td className="td-status">
                          <span className={`status-badge status-${estado.clase}`}>{estado.texto}</span>
                        </td>
                        <td className="td-actions">
                          <button
                            className="btn-action"
                            onClick={() =>
                              handleVerDetalle(
                                t.InstanceID,
                                t.ConstructID,
                                t.ConstructName
                              )
                            }
                          >
                            Ver
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {!loading && (
              <div className="table-footer">
                <p className="pagination-info">
                  Mostrando <span className="font-bold">{pageTasks.length}</span> de{" "}
                  <span className="font-bold">{filteredTasks.length}</span> tareas activas
                </p>
                <div className="pagination-controls">
                  <button
                    className="btn-pagination"
                    onClick={handlePrev}
                    disabled={currentPage === 1}
                  >
                    <svg className="btn-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <polyline points="15 18 9 12 15 6"></polyline>
                    </svg>
                    Anterior
                  </button>
                  <button
                    className="btn-pagination"
                    onClick={handleNext}
                    disabled={currentPage === totalPages}
                  >
                    Siguiente
                    <svg className="btn-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default RunningTasksPage;

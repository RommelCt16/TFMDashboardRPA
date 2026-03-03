import { useEffect, useRef, useState } from "react";
import { construirGraficoEjecuciones } from "../d3/generalChart";
import KpiCard from "../components/KpiCard";
import { API_BASE_URL } from "../config";
import "../styles/general-dashboard.css";
import Cabecera from "../components/Cabecera";

function formatPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0%";
  return `${(n * 100).toFixed(1)}%`;
}

function getCurrentDayValue() {
  return new Date().toISOString().split("T")[0];
}

function getCurrentMonthValue() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}`;
}

function getCurrentWeekValue() {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function normalizeWeekValue(value) {
  if (!value) return "";
  const raw = String(value).trim().toUpperCase();
  const match = raw.match(/^(\d{4})-W(\d{1,2})$/);
  if (!match) return raw;
  return `${match[1]}-W${String(Number(match[2])).padStart(2, "0")}`;
}

function GeneralDashboardPage() {
  const [filtroTipo, setFiltroTipo] = useState("dia");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [dia, setDia] = useState("");
  const [semana, setSemana] = useState("");
  const [mes, setMes] = useState("");
  const [datosPeriodo, setDatosPeriodo] = useState([]);
  const [kpi, setKpi] = useState({
    total: 0,
    success: 0,
    error: 0,
    successRate: 0,
    avgDurationSec: 0,
  });
  const [errorCarga, setErrorCarga] = useState("");
  const [detalle, setDetalle] = useState(null);

  const svgRef = useRef(null);

  // Al montar, fijamos filtros por defecto.
  useEffect(() => {
    setDia(getCurrentDayValue());
    setSemana(getCurrentWeekValue());
    setMes(getCurrentMonthValue());
  }, []);

  // Cada vez que cambian los filtros -> llamamos a la API y actualizamos grafico y KPIs.
  useEffect(() => {
    const params = new URLSearchParams();
    if (filtroTipo === "dia") {
      params.set("dia", dia || getCurrentDayValue());
    } else if (filtroTipo === "semana") {
      params.set("semana", semana || getCurrentWeekValue());
    } else {
      params.set("mes", mes || getCurrentMonthValue());
    }
    const url = `${API_BASE_URL}/todas_las_tareas?${params.toString()}`;
    console.log("[GeneralDashboard] fetch URL:", url);

    fetch(url, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) {
          return r.text().then((body) => {
            throw new Error(`Error ${r.status}: ${body || "sin detalle"}`);
          });
        }
        return r.json();
      })
      .then((res) => {
        setErrorCarga("");
        setDatosPeriodo(res);
        const success = res.filter((d) => Number(d?.ResultCode) === 1).length;
        const failure = res.filter((d) => Number(d?.ResultCode) !== 1).length;
        const total = res.length;
        const successRate = total > 0 ? success / total : 0;
        const totalDuration = res.reduce(
          (acc, d) => acc + Number(d.DurationSeconds ?? d.Duration ?? 0),
          0
        );
        const avgDurationSec = total > 0 ? +(totalDuration / total).toFixed(1) : 0;

        setKpi({
          total,
          success,
          error: failure,
          successRate,
          avgDurationSec,
        });

      })
      .catch((err) => {
        console.error("Error al cargar datos de tareas:", err);
        setErrorCarga(`No se pudo cargar datos del dashboard. ${err.message || "Verifica backend/API."}`);
        setDatosPeriodo([]);
        setKpi({
          total: 0,
          success: 0,
          error: 0,
          successRate: 0,
          avgDurationSec: 0,
        });
      });
  }, [filtroTipo, dia, semana, mes]);

  useEffect(() => {
    if (!svgRef.current) return;

    let datosFiltrados = datosPeriodo;
    if (filtroEstado === "ok") {
      datosFiltrados = datosPeriodo.filter((d) => Number(d?.ResultCode ?? d?.Status ?? 0) === 1);
    } else if (filtroEstado === "error") {
      datosFiltrados = datosPeriodo.filter((d) => {
        const code = Number(d?.ResultCode ?? d?.Status ?? 0);
        return code !== 1 && code !== 7 && code !== 12;
      });
    } else if (filtroEstado === "otros") {
      datosFiltrados = datosPeriodo.filter((d) => {
        const code = Number(d?.ResultCode ?? d?.Status ?? 0);
        return code === 7;
      });
    }

    setDetalle(null);
    construirGraficoEjecuciones(svgRef.current, datosFiltrados, filtroTipo, (d) => {
      setDetalle(d);
    });
  }, [datosPeriodo, filtroTipo, filtroEstado]);

  const handleSetHoy = () => {
    setDia(getCurrentDayValue());
    setSemana(getCurrentWeekValue());
    setMes(getCurrentMonthValue());
  };

  const contextValue = filtroTipo === "dia"
    ? dia
    : filtroTipo === "semana"
      ? semana
      : mes;

  const contextLabel = filtroTipo === "dia"
    ? "dia"
    : filtroTipo === "semana"
      ? "semana"
      : "mes";

  const labelFiltro = filtroTipo === "dia"
    ? "Filtrar por dia"
    : filtroTipo === "semana"
      ? "Filtrar por semana"
      : "Filtrar por mes";

  const inputType = filtroTipo === "dia" ? "date" : filtroTipo === "semana" ? "week" : "month";
  const inputId = filtroTipo === "dia" ? "filtro-dia" : filtroTipo === "semana" ? "filtro-semana" : "filtro-mes";
  const inputValue = filtroTipo === "dia" ? dia : filtroTipo === "semana" ? semana : mes;
  const handleInputChange = (e) => {
    const value = e.target.value;
    if (filtroTipo === "dia") setDia(value);
    if (filtroTipo === "semana") setSemana(normalizeWeekValue(value));
    if (filtroTipo === "mes") setMes(value);
  };

  return (
    <div className="running-tasks-page">
      <Cabecera
        title="Dashboard de Tareas"
        subtitle="Consulta el estado, resultados y tiempos de tus procesos"
      />
      <div className="running-tasks-main">
        <div className="exec-container">
          <section className="exec-head">
            <div className="filters-row">
              <div className="filter-group-gd">
                <div className="date-field date-field--type">
                  <label className="floating-label" htmlFor="filtro-tipo">
                    Tipo
                  </label>
                  <span className="material-symbols-outlined date-icon" aria-hidden="true">
                    tune
                  </span>
                  <select
                    id="filtro-tipo"
                    className="date-input"
                    value={filtroTipo}
                    onChange={(e) => setFiltroTipo(e.target.value)}
                  >
                    <option value="dia">Día</option>
                    <option value="semana">Semana</option>
                    <option value="mes">Mes</option>
                  </select>
                </div>

                <div className="date-field">
                  <label className="floating-label" htmlFor={inputId}>
                    {labelFiltro}
                  </label>
                  <span className="material-symbols-outlined date-icon" aria-hidden="true">
                    calendar_today
                  </span>
                  <input
                    key={filtroTipo}
                    id={inputId}
                    className="date-input"
                    type={inputType}
                    value={inputValue}
                    onChange={handleInputChange}
                  />
                </div>

                <button className="today-btn" onClick={handleSetHoy} type="button">
                  <span className="material-symbols-outlined">rotate_90_degrees_ccw</span>
                  <span>Hoy</span>
                </button>
              </div>

              <p className="context-text">
                Resumen del {contextLabel} <span className="context-strong">{contextValue}</span>
              </p>
            </div>
          </section>

          {errorCarga ? (
            <section className="panel">
              <p className="muted">{errorCarga}</p>
            </section>
          ) : null}

          <section className="kpi-grid">
            <KpiCard
              label="Total de procesos"
              value={kpi.total}
              subtitle={kpi.total ? "Total del periodo seleccionado" : "Sin datos para el periodo"}
              variant="info"
              icon="assignment"
            />
            <KpiCard
              label="Procesos exitosos"
              value={kpi.success}
              subtitle={`Porcentaje de éxito: ${formatPct(kpi.successRate)}`}
              variant="success"
              icon="check_circle"
            />
            <KpiCard
              label="Procesos con error"
              value={kpi.error}
              subtitle={`Porcentaje de error: ${kpi.total ? `${formatPct(kpi.error / kpi.total)}` : "0%"}`}
              variant="error"
              icon="error"
            />
            <KpiCard
              label="Tiempo promedio"
              value={`${kpi.avgDurationSec}s`}
              subtitle={kpi.avgDurationSec ? "Promedio por proceso ejecutado" : "No disponible para el periodo"}
              variant="warning"
              icon="timer"
            />
          </section>

          <section className="bento">
            <div className="panel panel-chart">
              <div className="panel-head panel-head--chart">
                <div className="panel-title-wrap">
                  <div className="panel-accent" />
                  <h3>Ejecución de Procesos (Duración vs Fecha) </h3>
                </div>
                <div className="chart-state-filter">
                  <label htmlFor="gd-chart-estado">Estado</label>
                  <select
                    id="gd-chart-estado"
                    value={filtroEstado}
                    onChange={(e) => setFiltroEstado(e.target.value)}
                  >
                    <option value="todos">Todos</option>
                    <option value="ok">Éxito</option>
                    <option value="error">Fallo</option>
                    <option value="otros">Time Out</option>
                  </select>
                </div>
              </div>

              <div className="chart-wrap">
                <svg id="grafico-duracion" ref={svgRef} />
              </div>
            </div>

            <aside className="panel panel-detail">
              <div className="panel-head">
                <div className="icon-badge" aria-hidden="true">
                  <span className="material-symbols-outlined">info</span>
                </div>
                <h3>Detalle del Proceso</h3>
              </div>

              <div className="detail-body">
                {!detalle ? (
                  <p className="muted">Selecciona un punto del gráfico para ver su información.</p>
                ) : (
                  <div className="detail-list">
                    <div className="detail-item">
                      <span className="detail-k">Proceso</span>
                      <span className="detail-v">{detalle.label}</span>
                    </div>

                    <div className="detail-item">
                      <span className="detail-k">Workflow</span>
                      <span className="detail-v">{detalle.workflow || "-"}</span>
                    </div>

                    <div className="detail-item">
                      <span className="detail-k">Robot</span>
                      <span className="detail-v">{detalle.robot || "-"}</span>
                    </div>

                    <div className="detail-item">
                      <span className="detail-k">Duración</span>
                      <span className="detail-v">{detalle.y} segundos</span>
                    </div>

                    <div className="detail-item">
                      <span className="detail-k">Inicio</span>
                      <span className="detail-v">{detalle.x?.toLocaleString?.() ?? "-"}</span>
                    </div>

                    <div className="detail-item">
                      <span className="detail-k">Fin</span>
                      <span className="detail-v">{detalle.fecha_fin ?? "-"}</span>
                    </div>

                    <div className="detail-item">
                      <span className="detail-k">Estado</span>
                      <span className={`detail-v ${detalle.estado === 1 ? "ok" : detalle.estado === 2 ? "bad" : "warn"}`}>
                        {detalle.estado === 1 ? "OK Exito" : detalle.estado === 2 ? "ERROR" : "Timed Out"}
                      </span>
                    </div>

                    <div className="detail-item detail-log">
                      <span className="detail-k">Resultado</span>
                      <pre className="log-box">{detalle.texto}</pre>
                    </div>
                  </div>
                )}
              </div>
            </aside>
          </section>
        </div>
      </div>
    </div>
  );
}

export default GeneralDashboardPage;

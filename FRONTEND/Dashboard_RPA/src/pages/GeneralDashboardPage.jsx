import { useEffect, useRef, useState } from "react";
import { construirGraficoEjecuciones } from "../d3/generalChart";
import KpiCard from "../components/KpiCard";
import { API_BASE_URL } from "../config";
import "../styles/general-dashboard.css";
import "../components/Cabecera";
import Cabecera from "../components/Cabecera";

function formatPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0%";
  return `${(n * 100).toFixed(1)}%`;
}

function GeneralDashboardPage() {
  const [dia, setDia] = useState("");
  const [mes, setMes] = useState("");
  const [kpi, setKpi] = useState({
    total: 0,
    success: 0,
    error: 0,
    successRate: 0,
    avgDurationSec: 0,
  });
  const [detalle, setDetalle] = useState(null);

  const svgRef = useRef(null);

  // Al montar, fijamos el dia de hoy como filtro por defecto.
  useEffect(() => {
    const hoy = new Date().toISOString().split("T")[0];
    setDia(hoy);
  }, []);

  // Cada vez que cambian los filtros -> llamamos a la API y actualizamos grafico y KPIs.
  useEffect(() => {
    let url = `${API_BASE_URL}/todas_las_tareas`;
    const params = [];
    let filtroTipo = "";

    if (dia) {
      params.push(`dia=${dia}`);
      filtroTipo = "dia";
    } else if (!mes) {
      const hoy = new Date().toISOString().split("T")[0];
      params.push(`dia=${hoy}`);
      filtroTipo = "dia";
    }

    if (mes) {
      params.push(`mes=${mes}`);
      filtroTipo = "mes";
    }

    if (params.length > 0) {
      url += "?" + params.join("&");
    }

    fetch(url)
      .then((r) => {
        if (!r.ok) {
          throw new Error(`Error ${r.status}`);
        }
        return r.json();
      })
      .then((res) => {
        const success = res.filter((d) => d.ResultCode === 1).length;
        const failure = res.filter((d) => d.ResultCode === 2).length;
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

        if (svgRef.current) {
          construirGraficoEjecuciones(svgRef.current, res, filtroTipo, (d) => {
            setDetalle(d);
          });
        }
      })
      .catch((err) => {
        console.error("Error al cargar datos de tareas:", err);
        setKpi({
          total: 0,
          success: 0,
          error: 0,
          successRate: 0,
          avgDurationSec: 0,
        });
        if (svgRef.current) {
          construirGraficoEjecuciones(svgRef.current, [], "", null);
        }
      })
      .finally(() => {
      });
  }, [dia, mes]);

  const handleChangeDia = (e) => {
    const value = e.target.value;
    setDia(value);
    if (value) {
      setMes("");
    }
  };

  const handleSetHoy = () => {
    const hoy = new Date().toISOString().split("T")[0];
    setDia(hoy);
    setMes("");
  };

  return (
    <div className="running-tasks-page">
      <Cabecera
        title="Dashboard General de Tareas"
        subtitle="Descripcion general del rendimiento global del Sistema RPA"
      />
      <div className="contenerdor-general">
        <div className="exec-container">
          <section className="exec-head">
            <div className="filters-row">
              <div className="filter-group-gd">
                <div className="date-field">
                  <label className="floating-label" htmlFor="filtro-dia">
                    Filtrar por dia
                  </label>
                  <span className="material-symbols-outlined date-icon" aria-hidden="true">
                    calendar_today
                  </span>
                  <input
                    id="filtro-dia"
                    className="date-input"
                    type="date"
                    value={dia}
                    onChange={handleChangeDia}
                  />
                </div>

                <button className="today-btn" onClick={handleSetHoy} type="button">
                  <span className="material-symbols-outlined">rotate_90_degrees_ccw</span>
                  <span>Hoy</span>
                </button>
              </div>

              <p className="context-text">
                Real-time performance metrics for <span className="context-strong">{dia || mes}</span>
              </p>
            </div>
          </section>

          <section className="kpi-grid">
            <KpiCard
              label="Total de tareas"
              value={kpi.total}
              subtitle={kpi.total ? "Volumen del periodo" : "Sin datos"}
              variant="info"
              icon="assignment"
            />
            <KpiCard
              label="Exitos"
              value={kpi.success}
              subtitle={formatPct(kpi.successRate)}
              variant="success"
              icon="check_circle"
            />
            <KpiCard
              label="Errores"
              value={kpi.error}
              subtitle={kpi.total ? `${formatPct(kpi.error / kpi.total)}` : "0%"}
              variant="error"
              icon="error"
            />
            <KpiCard
              label="Duracion promedio"
              value={`${kpi.avgDurationSec}s`}
              subtitle={kpi.avgDurationSec ? "Promedio estimado" : "No disponible"}
              variant="warning"
              icon="timer"
            />
          </section>

          <section className="bento">
            <div className="panel panel-chart">
              <div className="panel-head">
                <div className="panel-accent" />
                <h3>Execution Trends over Time</h3>
              </div>

              <div className="chart-wrap">
                <svg id="grafico-duracion" ref={svgRef} />
              </div>
              <p className="panel-foot muted">Haz clic en un punto del grafico para cargar el detalle del proceso.</p>
            </div>

            <aside className="panel panel-detail">
              <div className="panel-head">
                <div className="icon-badge" aria-hidden="true">
                  <span className="material-symbols-outlined">info</span>
                </div>
                <h3>Process Detail</h3>
              </div>

              <div className="detail-body">
                {!detalle ? (
                  <p className="muted">Selecciona un punto del grafico para ver los detalles.</p>
                ) : (
                  <div className="detail-list">
                    <div className="detail-item">
                      <span className="detail-k">Proceso</span>
                      <span className="detail-v">{detalle.label}</span>
                    </div>

                    <div className="detail-item">
                      <span className="detail-k">Duracion</span>
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
                        {detalle.estado === 1 ? "OK Exito" : detalle.estado === 2 ? "ERROR" : "WARN Otro"}
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

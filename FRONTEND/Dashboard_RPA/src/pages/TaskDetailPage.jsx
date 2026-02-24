import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { renderLineChart, renderDonutEfectividad } from "../d3/detailCharts";
import { ESTADO_TEXTO, getEstadoInfo } from "../domain/statusMap";
import { API_BASE_URL } from "../config";

import Cabecera from "../components/Cabecera"
import InfoTareaCard from "../components/Pagina Detalle Tarea/InfoTareaCard";
import EficienciaCard from "../components/Pagina Detalle Tarea/EficienciaCard";
import HistorialCard from "../components/Pagina Detalle Tarea/HistorialCard";
import EventoSidebar from "../components/Pagina Detalle Tarea/EventoSidebar";

import "../styles/taskdetailpage.css";

const LAST_TASK_DETAIL_KEY = "lastTaskDetail";

function TaskDetailPage() {
  const { constructId, instanceId } = useParams();
  const navigate = useNavigate();

  const [historial, setHistorial] = useState([]);
  const [estadoTareaActual, setEstadoTareaActual] = useState(null);
  const [detalleEvento, setDetalleEvento] = useState(null);

  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [rightCollapsed, setRightCollapsed] = useState(true);

  const lineContainerRef = useRef(null);
  const gaugeRef = useRef(null);

  // Carga del historial de la tarea
  useEffect(() => {
    if (!constructId) return;

    setLoading(true);
    setError("");

    fetch(`${API_BASE_URL}/historial_construct/${constructId}`)
      .then((r) => {
        if (!r.ok) {
          throw new Error(`Error ${r.status}`);
        }
        return r.json();
      })
      .then((res) => {
        const data = res || [];
        setHistorial(data)

        if (data.length > 0) {
          // Tarea "actual": si viene instanceId, buscamos esa instancia
          if (instanceId) {
            const encontrada = data.find(
              (d) => String(d.InstanceID) === String(instanceId)
            );
            setEstadoTareaActual(encontrada || data[0]);
          } else {
            setEstadoTareaActual(data[0]);
          }
        }
        else {
          setEstadoTareaActual(null);
        }
      })
      .catch((err) => {
        console.error("Error al cargar historial:", err);
        setError("No se pudo cargar el historial de la tarea.");
        setHistorial([]);
        setEstadoTareaActual(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [constructId, instanceId]);


  const historialFiltrado = useMemo(() => {
    if (!historial || historial.length === 0) return [];
    if (!fechaInicio && !fechaFin && !estadoFiltro) return historial;

    const inicioDate = fechaInicio ? new Date(fechaInicio) : null;
    const finDate = fechaFin ? new Date(fechaFin + "T23:59:59") : null;

    return historial.filter((d) => {
      const f = new Date(d.StartDateTime);
      const code = d.Status ?? d.ResultCode;
      const okEstado = !estadoFiltro || code === parseInt(estadoFiltro, 10);
      const okFecha = (!inicioDate || f >= inicioDate) && (!finDate || f <= finDate);
      return okEstado && okFecha;
    });
  }, [historial, fechaInicio, fechaFin, estadoFiltro]);


  // Recalcular graficos cuando cambien datos o filtros
  useEffect(() => {
    if (!historialFiltrado || historialFiltrado.length === 0) return;

    if (lineContainerRef.current) {
      renderLineChart(
        lineContainerRef.current,
        historialFiltrado,
        ESTADO_TEXTO,
        (eventoSeleccionado) => {
          setDetalleEvento(eventoSeleccionado);
          setRightCollapsed(false);
        }
      );
    }

    if (gaugeRef.current) {
      renderDonutEfectividad(gaugeRef.current, historialFiltrado);
    }
  }, [historialFiltrado]);

  const handleVolver = () => {
    navigate(-1);
  };

  const renderEstadoSpan = useCallback((code) => {
    const info = getEstadoInfo(code);
    return <span className={info.clase}>{info.texto}</span>;
  }, []);


  const taskName = estadoTareaActual?.ConstructName || "";

  useEffect(() => {
    if (!constructId || !instanceId) return;
    const path = `/detalle/${constructId}/${instanceId}`;
    localStorage.setItem(
      LAST_TASK_DETAIL_KEY,
      JSON.stringify({
        constructId,
        instanceId,
        taskName,
        path,
      })
    );
  }, [constructId, instanceId, taskName]);

  return (
    <div className="running-tasks-page">
      <Cabecera title="Informacion del Proceso" subtitle="Descripcion general del rendimiento global del Sistema RPA" />

      <main className="tdp-main">
        <div className="tdp-body">
          <div className="tdp-content custom-scrollbar">
            <div className="tdp-page">
              <div className="tdp-titleRow">
                <div className="tdp-title">
                  <span className="material-symbols-outlined tdp-titleIcon">
                    terminal
                  </span>
                  <h2 className="tdp-h2">
                    Detalle de Tarea{taskName ? `: ${taskName}` : ""}
                  </h2>
                </div>
                <button className="tdp-btn" onClick={handleVolver} type="button">
                  <span className="material-symbols-outlined tdp-btnIcon">
                    arrow_back
                  </span>
                  Volver
                </button>
              </div>
              {loading && (
                <div className="tdp-banner glass">
                  <p>Cargando historial...</p>
                </div>
              )}
              {error && (
                <div className="tdp-banner glass tdp-bannerError">
                  <p>{error}</p>
                </div>
              )}

              <div className="tdp-gridTop">
                <InfoTareaCard estadoTareaActual={estadoTareaActual}
                  renderEstadoSpan={renderEstadoSpan} />
                <EficienciaCard gaugeRef={gaugeRef} />
              </div>
              <HistorialCard
                fechaInicio={fechaInicio}
                fechaFin={fechaFin}
                estadoFiltro={estadoFiltro}
                onFechaInicio={setFechaInicio}
                onFechaFin={setFechaFin}
                onEstadoFiltro={setEstadoFiltro}
                lineContainerRef={lineContainerRef}
                hasData={historialFiltrado.length > 0}
              />
            </div>
          </div>
          <EventoSidebar
            collapsed={rightCollapsed}
            onToggle={(force) => {
              if (force === true) return setRightCollapsed(false);
              if (force === false) return setRightCollapsed(true);
              setRightCollapsed((v) => !v);
            }}
            detalleEvento={detalleEvento}
            estadoTexto={ESTADO_TEXTO}
          />
        </div>
      </main>
    </div>
  );
}

export default TaskDetailPage;


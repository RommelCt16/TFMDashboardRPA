import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { renderLineChart, renderDonutEfectividad } from "../d3/detailCharts";
import { ESTADO_TEXTO, getEstadoInfo } from "../domain/statusMap";
import { API_BASE_URL } from "../config";


function TaskDetailPage() {
  const { constructId, instanceId } = useParams();
  const navigate = useNavigate();

  const [historial, setHistorial] = useState([]);
  const [estadoTareaActual, setEstadoTareaActual] = useState(null);
  const [detalleEvento, setDetalleEvento] = useState(null);

  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState("");

  const lineContainerRef = useRef(null);
  const gaugeRef = useRef(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
      })
      .catch((err) => {
        console.error("Error al cargar historial:", err);
        setError("No se pudo cargar el historial de la tarea.");
        setHistorial([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [constructId, instanceId]);

  // Recalcular gráficos cuando cambien datos o filtros
  useEffect(() => {
    if (!historial || historial.length === 0) return;

    let filtrado = historial;

    if (fechaInicio || fechaFin || estadoFiltro) {
      const inicioDate = fechaInicio ? new Date(fechaInicio) : null;
      const finDate = fechaFin
        ? new Date(fechaFin + "T23:59:59")
        : null;

      filtrado = historial.filter((d) => {
        const f = new Date(d.StartDateTime);
        const okEstado =
          !estadoFiltro ||
          (d.Status ?? d.ResultCode) === parseInt(estadoFiltro);
        const okFecha =
          (!inicioDate || f >= inicioDate) &&
          (!finDate || f <= finDate);
        return okEstado && okFecha;
      });
    }

    if (lineContainerRef.current) {
      renderLineChart(
        lineContainerRef.current,
        filtrado,
        ESTADO_TEXTO,
        (eventoSeleccionado) => setDetalleEvento(eventoSeleccionado)
      );
    }

    if (gaugeRef.current) {
      renderDonutEfectividad(
        gaugeRef.current,
        filtrado,
        ESTADO_TEXTO
      );
    }
  }, [historial, fechaInicio, fechaFin, estadoFiltro]);

  const handleVolver = () => {
    navigate(-1);
  };

  const renderEstadoSpan = (code) => {
    const info = getEstadoInfo(code);
    return <span className={info.clase}>{info.texto}</span>;
  };

  return (
    <>
      <nav>
        <h1 id="titulo-tarea" className="titulo">
          📊 Detalle de Tarea{" "}
          {estadoTareaActual
            ? `: ${estadoTareaActual.ConstructName}`
            : ""}
        </h1>
      </nav>

      {loading && (
        <p style={{ marginLeft: "1.5rem" }}>Cargando historial...</p>
      )}

      {error && (
        <p style={{ marginLeft: "1.5rem", color: "#e57373" }}>{error}</p>
      )}


      <button
        onClick={handleVolver}
        style={{ margin: "0 0 1rem 1rem" }}
      >
        ⬅ Volver
      </button>

      <div className="dashboard">
        {/* Estado actual de la tarea */}
        <div className="card" id="estado-actual">
          <h3>📝 Información de la Tarea</h3>
          <div id="estado">
            {!estadoTareaActual && (
              <em>Cargando datos de la tarea...</em>
            )}
            {estadoTareaActual && (
              <table>
                <tbody>
                  <tr>
                    <td>
                      <strong>📌 Estado:</strong>
                    </td>
                    <td>
                      {renderEstadoSpan(
                        estadoTareaActual.Status ??
                          estadoTareaActual.ResultCode
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <strong>📅 Inicio:</strong>
                    </td>
                    <td>
                      {new Date(
                        estadoTareaActual.StartDateTime
                      ).toLocaleString()}
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <strong>🏁 Fin:</strong>
                    </td>
                    <td>
                      {estadoTareaActual.EndDateTime
                        ? new Date(
                            estadoTareaActual.EndDateTime
                          ).toLocaleString()
                        : "—"}
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <strong>⏱️ Duración:</strong>
                    </td>
                    <td>
                      {estadoTareaActual.DurationSeconds ??
                        estadoTareaActual.Duration ??
                        "Desconocido"}{" "}
                      segundos
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <strong>🤖 Agente:</strong>
                    </td>
                    <td>
                      {estadoTareaActual.AgentName ||
                        "No disponible"}
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <strong>Workflow:</strong>
                    </td>
                    <td>
                      {estadoTareaActual.Workflow ||
                        "Desconocido"}
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <strong>Descripción:</strong>
                    </td>
                    <td>
                      {estadoTareaActual.ResultText ||
                        "Sin descripción"}
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Donut de eficiencia */}
        <div className="card" id="eficiencia-card">
          <h3>🎯 Eficiencia</h3>
          <svg id="gauge" ref={gaugeRef} />
        </div>
      </div>

      {/* Historial y detalle del evento seleccionado */}
      <div className="dashboard-wide">
        <div className="card">
          <h3>📈 Historial de Duración</h3>

          <div className="filtros">
            <label htmlFor="fecha-inicio">Desde:</label>
            <input
              type="date"
              id="fecha-inicio"
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
            />

            <label htmlFor="fecha-fin">Hasta:</label>
            <input
              type="date"
              id="fecha-fin"
              value={fechaFin}
              onChange={(e) => setFechaFin(e.target.value)}
            />

            <label htmlFor="estado-filtro">Estado:</label>
            <select
              id="estado-filtro"
              value={estadoFiltro}
              onChange={(e) => setEstadoFiltro(e.target.value)}
            >
              <option value="">Todos</option>
              <option value="1">✅ Success</option>
              <option value="2">❌ Failure</option>
              <option value="3">⚠️ Incompleto</option>
              <option value="7">⛔ Time Out</option>
              <option value="11">⏳ En Cola</option>
              <option value="12">🔄 En ejecución</option>
              <option value="0">❓ Desconocido</option>
            </select>
          </div>

          <div
            id="grafico-linea-tarea"
            className="chart-container"
            ref={lineContainerRef}
          />
        </div>

        <div className="card" id="info-evento-seleccionado">
          <h3>📌 Evento seleccionado</h3>
          <div id="detalle-evento">
            {!detalleEvento && (
              <em>
                Selecciona un punto en la gráfica para ver más
                detalles.
              </em>
            )}
            {detalleEvento && (
              <ul className="info-list">
                <li>
                  <span className="icon">📋</span>
                  <strong>Estado:</strong>
                  <span>
                    {
                      ESTADO_TEXTO[detalleEvento.status]
                        ?.texto
                    }
                  </span>
                </li>
                <li>
                  <span className="icon">🕒</span>
                  <strong>Inicio:</strong>
                  <span>
                    {detalleEvento.time.toLocaleString()}
                  </span>
                </li>
                <li>
                  <span className="icon">🕒</span>
                  <strong>Fin:</strong>
                  <span>
                    {detalleEvento.fin
                      ? detalleEvento.fin.toLocaleString()
                      : "—"}
                  </span>
                </li>
                <li>
                  <span className="icon">⏱️</span>
                  <strong>Duración:</strong>
                  <span>
                    {detalleEvento.duration.toFixed(1)} s
                  </span>
                </li>
                <li>
                  <span className="icon">🤖</span>
                  <strong>Agente:</strong>
                  <span>{detalleEvento.agente}</span>
                </li>
                <li>
                  <span className="icon">🧭</span>
                  <strong>Workflow:</strong>
                  <span>
                    {detalleEvento.workflow ?? "Desconocido"}
                  </span>
                </li>
                <li>
                  <span className="icon">📝</span>
                  <strong>Descripción:</strong>
                  <span>{detalleEvento.text}</span>
                </li>
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default TaskDetailPage;

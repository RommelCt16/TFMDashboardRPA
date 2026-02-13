import { useEffect, useRef, useState } from "react";
import { construirGraficoEjecuciones } from "../d3/generalChart";
import KpiCard from "../components/KpiCard";
import { API_BASE_URL } from "../config";


function GeneralDashboardPage() {
  const [dia, setDia] = useState("");
  const [mes, setMes] = useState("");
  const [datos, setDatos] = useState([]);
  const [kpi, setKpi] = useState({ total: 0, success: 0, error: 0 });
  const [detalle, setDetalle] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");


  const svgRef = useRef(null);

  // Al montar, fijamos el día de hoy como filtro por defecto (como en tu script)
  useEffect(() => {
    const hoy = new Date().toISOString().split("T")[0];
    setDia(hoy);
  }, []);

  // Cada vez que cambian los filtros -> llamamos a la API y actualizamos gráfico y KPIs
  useEffect(() => {
    let url = `${API_BASE_URL}/todas_las_tareas`;
    const params = [];
    let filtroTipo = "";

    if (dia) {
      params.push(`dia=${dia}`);
      filtroTipo = "dia";
    } else if (!mes) {
      // si no hay día ni mes, usamos hoy por defecto (igual que tu JS)
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

    setLoading(true);
    setError("");

    fetch(url)
      .then((r) => {
        if (!r.ok) {
          throw new Error(`Error ${r.status}`);
        }
        return r.json();
      })
      .then((res) => {
        setDatos(res || []);

        const success = res.filter((d) => d.ResultCode === 1).length;
        const failure = res.filter((d) => d.ResultCode === 2).length;

        setKpi({
          total: res.length,
          success,
          error: failure,
        });

        if (svgRef.current) {
          construirGraficoEjecuciones(svgRef.current, res, filtroTipo, (d) => {
            setDetalle(d);
          });
        }
      })
      .catch((err) => {
        console.error("Error al cargar datos de tareas:", err);
        setDatos([]);
        setKpi({ total: 0, success: 0, error: 0 });
        if (svgRef.current) {
          construirGraficoEjecuciones(svgRef.current, [], "", null);
        }
      })
      .finally(() => {
        setLoading(false);
      });
  }, [dia, mes]);

  const handleChangeDia = (e) => {
    const value = e.target.value;
    setDia(value);
    // si el usuario selecciona día, desactivamos mes (imitando desactivarMes)
    if (value) {
      setMes("");
    }
  };

  const handleChangeMes = (e) => {
    const value = e.target.value;
    setMes(value);
    // si el usuario selecciona mes, desactivamos día (imitando desactivarDia)
    if (value) {
      setDia("");
    }
  };

  return (
    <>
      <nav>
        <h1 className="titulo">📊 Dashboard General de Tareas</h1>
      </nav>

      {/* Filtros */}
      <div className="filtro-tareas">
        <label htmlFor="filtro-dia">📅 Día:</label>
        <input
          type="date"
          id="filtro-dia"
          value={dia}
          onChange={handleChangeDia}
        />

        <label htmlFor="filtro-mes" style={{ marginLeft: 20 }}>
          🗓️ Mes:
        </label>
        <input
          type="month"
          id="filtro-mes"
          value={mes}
          onChange={handleChangeMes}
          disabled={!!dia}
        />
      </div>

      {loading && (
        <p style={{ marginLeft: "1.5rem" }}>Cargando datos...</p>
      )}

      {error && (
        <p style={{ marginLeft: "1.5rem", color: "#e57373" }}>{error}</p>
      )}

      {/* Tarjetas KPI + gráfico + detalle, similar a tu general.html */}
      <div className="card card-matriz">
        <div className="grid-matriz">
          <KpiCard
            label="Total de Tareas"
            value={kpi.total}
          />
          <KpiCard
            label="Completadas con Éxito"
            value={kpi.success}
          />
          <KpiCard
            label="Errores"
            value={kpi.error}
          />

          {/* Gráfico D3 */}
          <div className="grafica-area">
            <h3>⏱️ Línea de Tiempo de Ejecuciones</h3>
            <svg id="grafico-duracion" ref={svgRef} />
          </div>

          {/* Detalle de proceso seleccionado */}
          <div className="detalle-area">
            <h3>📋 Detalle del Proceso</h3>
            <div id="detalle-proceso">
              {!detalle && (
                <p>Haz clic en un punto para ver los detalles.</p>
              )}
              {detalle && (
                <>
                  <p>
                    <strong>🧾 Nombre:</strong> {detalle.label}
                  </p>
                  <p>
                    <strong>⏱️ Duración:</strong> {detalle.y} segundos
                  </p>
                  <p>
                    <strong>📅 Fecha Inicio:</strong>{" "}
                    {detalle.x.toLocaleString()}
                  </p>
                  <p>
                    <strong>🏁 Fecha Fin:</strong> {detalle.fecha_fin}</p>
                  <p>
                    <strong>📌 Estado:</strong>{" "}
                    {detalle.estado === 1
                      ? "✅ Éxito"
                      : detalle.estado === 2
                      ? "❌ Error"
                      : "⚠️ Otro"}
                  </p>
                  <p>
                    <strong>📋 Resultado:</strong> {detalle.texto}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default GeneralDashboardPage;

import { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { WS_BASE_URL } from "../config";
import { getEstadoInfo } from "../domain/statusMap";

const PAGE_SIZE = 10;

function RunningTasksPage() {
  const taskMapRef = useRef(new Map());
  const [tasks, setTasks] = useState([]);
  const [divisionFilter, setDivisionFilter] = useState("");
  const [nameFilter, setNameFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [wsReady, setWsReady] = useState(false);


  const navigate = useNavigate();

  // Helper: fecha consistente (snapshot trae StartDateTime; kafka a veces trae StartDate)
  const getStartDate = (t) => t?.StartDateTime ?? t?.StartDate ?? null;

  // Helper: ordena y refresca estado tasks desde el map
  const refreshFromMap = () => {
    const list = Array.from(taskMapRef.current.values()).sort((a, b) => {
      const da = new Date(getStartDate(a) || 0).getTime();
      const db = new Date(getStartDate(b) || 0).getTime();
      return db - da;
    });
    setTasks(list);
  };

  // Construimos lista de divisiones para el select
  const divisions = useMemo(() => {
    const setDiv = new Set();
    tasks.forEach((t) => {
      if (t.SubCarpeta) setDiv.add(t.SubCarpeta);
    });
    return Array.from(setDiv).sort();
  }, [tasks]);

  // WebSocket: snapshot + updates
  useEffect(() => {
    const ws = new WebSocket(`${WS_BASE_URL}/ws/instancias`);

    ws.onopen = () => {console.log("[WS] abierto"); setWsReady(true); };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        // 1) Snapshot inicial
        if (msg?.tipo === "snapshot" && Array.isArray(msg.items)) {
          const map = new Map();
          for (const t of msg.items) {
            if (t?.ConstructID) map.set(t.ConstructID, t);
          }
          taskMapRef.current = map;

          const list = Array.from(map.values()).sort(
            (a, b) =>
              new Date(b.StartDateTime ?? b.StartDate).getTime() -
              new Date(a.StartDateTime ?? a.StartDate).getTime()
          );

          setTasks(list);

          // ✅ Ya llegó el primer snapshot
          setLoading(false);
          return;
        }


        // 2) Updates individuales (Kafka)
        if (msg?.ConstructID) {
          taskMapRef.current.set(msg.ConstructID, msg);

          const list = Array.from(taskMapRef.current.values()).sort(
            (a, b) =>
              new Date(b.StartDateTime ?? b.StartDate).getTime() -
              new Date(a.StartDateTime ?? a.StartDate).getTime()
          );

          setTasks(list);
        }
      } catch (e) {
        console.error("[WS] mensaje inválido:", e);
      }
    };

    ws.onerror = (err) => {
      console.error("[WS] error:", err);
      // Si falla el WS, quitamos loading para que no quede infinito
      setLoading(false);
    };

    ws.onclose = () => {
      console.warn("[WS] cerrado");
      // Si se cerró antes del snapshot, no dejes loading infinito
      setLoading(false);
    };

    return () => ws.close();
  }, []);

  // Aplicar filtros por división y nombre
  const filteredTasks = useMemo(() => {
    const div = divisionFilter.toLowerCase();
    const text = nameFilter.toLowerCase();

    return tasks.filter((t) => {
      const carpeta = (t.SubCarpeta || "").toLowerCase();
      const nombre = (t.ConstructName || "").toLowerCase();

      const byDivision = !div || carpeta === div;
      const byName = !text || nombre.includes(text);

      return byDivision && byName;
    });
  }, [tasks, divisionFilter, nameFilter]);

  // Paginación
  const totalPages = Math.max(1, Math.ceil(filteredTasks.length / PAGE_SIZE));
  const pageTasks = filteredTasks.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  useEffect(() => {
    // Cada vez que cambian los filtros, volvemos a la página 1
    setCurrentPage(1);
  }, [divisionFilter, nameFilter]);

  const handlePrev = () => setCurrentPage((p) => Math.max(1, p - 1));
  const handleNext = () => setCurrentPage((p) => Math.min(totalPages, p + 1));

  const handleVerDetalle = (instanceId, constructId) => {
    navigate(`/detalle/${constructId}/${instanceId}`);
  };

  const formatDate = (value) => {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString();
  };

  return (
    <>
      <nav>
        <h1 className="titulo">Tareas en Ejecución</h1>
      </nav>

      {loading && <div className="spinner" />}

      <div className="filtro-tareas">
        <label htmlFor="filtro-carpeta">🔎 Filtrar por División: </label>
        <select
          id="filtro-carpeta"
          value={divisionFilter}
          onChange={(e) => setDivisionFilter(e.target.value)}
        >
          <option value="">Todas</option>
          {divisions.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>

        <label htmlFor="filtro-nombre" style={{ marginLeft: 20 }}>
          🔎 Buscar Tarea:
        </label>
        <input
          type="text"
          id="filtro-nombre"
          placeholder="Escribe parte del nombre..."
          value={nameFilter}
          onChange={(e) => setNameFilter(e.target.value)}
        />
      </div>

      <main>
        <div className="table-container">
          <table id="tabla-tareas">
            <thead>
              <tr>
                <th>N.</th>
                <th>Proceso</th>
                <th>Inicio Proceso</th>
                <th>Fin Proceso</th>
                <th>Duración</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pageTasks.map((t, idx) => {
                const estado = getEstadoInfo(t.ResultCode);
                const rowNumber = (currentPage - 1) * PAGE_SIZE + idx + 1;

                return (
                  <tr key={`${t.ConstructID}-${t.InstanceID}`}>
                    <td>{rowNumber}</td>
                    <td>{t.ConstructName}</td>
                    <td>{formatDate(getStartDate(t))}</td>
                    <td>{formatDate(t.EndDateTime)}</td>
                    <td>{t.DurationSeconds ?? "—"}</td>
                    <td>
                      <span className={estado.clase}>{estado.texto}</span>
                    </td>
                    <td>
                      <button
                        onClick={() => handleVerDetalle(t.InstanceID, t.ConstructID)}
                      >
                        Ver
                      </button>
                    </td>
                  </tr>
                );
              })}

              {pageTasks.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center" }}>
                    {loading ? "Cargando tareas..." : "No hay tareas para mostrar."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="page" id="paginacion">
          <button onClick={handlePrev} disabled={currentPage === 1}>
            ⏮ Anterior
          </button>
          <span id="pagina-actual">
            Página {currentPage} de {totalPages}
          </span>
          <button onClick={handleNext} disabled={currentPage === totalPages}>
            Siguiente ⏭
          </button>
        </div>
      </main>
    </>
  );
}

export default RunningTasksPage;

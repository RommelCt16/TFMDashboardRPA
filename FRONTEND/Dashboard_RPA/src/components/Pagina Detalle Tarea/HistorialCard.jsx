import "../../styles/historialCard.css";

export default function HistoryCard({
  fechaInicio,
  fechaFin,
  estadoFiltro,
  onFechaInicio,
  onFechaFin,
  onEstadoFiltro,
  lineContainerRef,
  hasData,
}) {
  return (
    <section className="hsc glass">
      <div className="hsc__head">
        <div className="hsc__headLeft">
          <span className="material-symbols-outlined hsc__icon">timeline</span>
          <h3 className="hsc__title">Historial de Duración</h3>
        </div>
        <div className="hsc__hint">Haz clic en un punto para abrir el detalle (panel derecho).</div>
      </div>

      <div className="hsc__filters">
        <div className="hsc__field">
          <label className="hsc__label">Desde</label>
          <input
            type="date"
            className="hsc__input"
            value={fechaInicio}
            onChange={(e) => onFechaInicio(e.target.value)}
          />
        </div>

        <div className="hsc__field">
          <label className="hsc__label">Hasta</label>
          <input
            type="date"
            className="hsc__input"
            value={fechaFin}
            onChange={(e) => onFechaFin(e.target.value)}
          />
        </div>

        <div className="hsc__field hsc__field--wide">
          <label className="hsc__label">Estado</label>
          <select
            className="hsc__input hsc__select"
            value={estadoFiltro}
            onChange={(e) => onEstadoFiltro(e.target.value)}
          >
            <option value="">Todos</option>
            <option value="1">Success</option>
            <option value="2">Failure</option>
            <option value="3">Incompleto</option>
            <option value="7">Time Out</option>
            <option value="11">En Cola</option>
            <option value="12">En ejecución</option>
            <option value="0">Desconocido</option>
          </select>
        </div>
      </div>

      <div className="hsc__chart chart-grid">
        {!hasData ? (
          <p className="hsc__empty">No hay datos para mostrar con los filtros actuales.</p>
        ) : (
          <div ref={lineContainerRef} className="hsc__chartInner" />
        )}
      </div>
    </section>
  );
}

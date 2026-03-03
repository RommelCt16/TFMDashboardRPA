import "../../styles/eventoSidebar.css";

export default function EventoSidebar({ collapsed, onToggle, detalleEvento, estadoTexto }) {
  const icon = collapsed ? "chevron_left" : "chevron_right";
  const estadoLabel =
    detalleEvento ? (estadoTexto[detalleEvento.status]?.texto ?? "Desconocido") : "";

  return (
    <aside className={`res ${collapsed ? "res--collapsed" : ""}`} id="right-sidebar">
      <button className="res__toggle" onClick={() => onToggle?.()} type="button" aria-label="Toggle right sidebar">
        <span className="material-symbols-outlined">{icon}</span>
      </button>

      {collapsed ? (
        <div className="res__collapsed">
          <span className="material-symbols-outlined res__primary">info</span>
          <div className="res__divider" />
          <button className="res__ghost" onClick={() => onToggle?.(true)} type="button" aria-label="Expand">
            <span className="material-symbols-outlined">touch_app</span>
          </button>
        </div>
      ) : (
        <div className="res__content">
          <div className="res__head">
            <div className="res__headLeft">
              <span className="material-symbols-outlined res__primary">analytics</span>
              <h3 className="res__title">Detalle de Evento</h3>
            </div>
            <button className="res__close" onClick={() => onToggle?.(false)} type="button" aria-label="Close">
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>

          <div className="res__body custom-scrollbar">
            {!detalleEvento ? (
              <div className="res__placeholder">
                <div className="res__placeholderIcon">
                  <span className="material-symbols-outlined">touch_app</span>
                </div>
                <p className="res__placeholderTitle">Sin seleccion</p>
                <p className="res__placeholderText">
                  Interactua con los puntos de la grafica para ver informacion especifica de la ejecucion.
                </p>
              </div>
            ) : (
              <div className="res__panel">
                <div className="res__runBox">
                  <div className="res__runLabel">Descripcion</div>
                  <div className="res__runValue">{detalleEvento.text || "Sin descripcion"}</div>
                </div>

                <div className="res__rows">
                  <Row label="Estado Final" value={estadoLabel} />
                  <Row label="Duracion Total" value={`${detalleEvento.duration.toFixed(1)} segundos`} />
                  <Row label="Agente" value={detalleEvento.agente} />
                  <Row label="Inicio" value={detalleEvento.time?.toLocaleString?.() ?? "-"} />
                  <Row label="Fin" value={detalleEvento.fin ? detalleEvento.fin.toLocaleString() : "-"} />
                  <Row label="Workflow" value={detalleEvento.workflow ?? "Desconocido"} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}

function Row({ label, value }) {
  return (
    <div className="res__row">
      <span className="res__rowLabel">{label}</span>
      <span className="res__rowValue">{value}</span>
    </div>
  );
}

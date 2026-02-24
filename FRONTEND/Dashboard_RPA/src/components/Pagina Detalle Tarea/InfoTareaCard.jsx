import "../../styles/infoTareaCard.css";


export default function InfoTareaCard({ estadoTareaActual, renderEstadoSpan }) {
  return (
    <section className="tic glass">
      <div className="tic__head">
        <div className="tic__headLeft">
          <span className="material-symbols-outlined tic__icon">description</span>
          <h3 className="tic__title">Información de la Tarea</h3>
        </div>
      </div>

      {!estadoTareaActual ? (
        <p className="tic__loading">Cargando datos de la tarea…</p>
      ) : (
        <div className="tic__grid">
          <Row icon="push_pin" label="Estado:">
            <span className="tic__status">
              {renderEstadoSpan(estadoTareaActual.Status ?? estadoTareaActual.ResultCode)}
            </span>
          </Row>

          <Row icon="smart_toy" label="Agente:">
            <span className="tic__mono">{estadoTareaActual.AgentName || "No disponible"}</span>
          </Row>

          <Row icon="calendar_today" label="Inicio:">
            <span className="tic__value">
              {new Date(estadoTareaActual.StartDateTime).toLocaleString()}
            </span>
          </Row>

          <Row icon="flag" label="Fin:">
            <span className="tic__value">
              {estadoTareaActual.EndDateTime
                ? new Date(estadoTareaActual.EndDateTime).toLocaleString()
                : "—"}
            </span>
          </Row>

          <Row icon="timer" label="Duración:">
            <span className="tic__value">
              {(estadoTareaActual.DurationSeconds ?? estadoTareaActual.Duration ?? "Desconocido")} segundos
            </span>
          </Row>

          <Row icon="account_tree" label="Workflow:">
            <span className="tic__value">{estadoTareaActual.Workflow || "Desconocido"}</span>
          </Row>

          <Row icon="notes" label="Descripción:">
            <span className="tic__mutedItalic">{estadoTareaActual.ResultText || "Sin descripción"}</span>
          </Row>
        </div>
      )}
    </section>
  );
}

function Row({ icon, label, children }) {
  return (
    <div className="tic__row">
      <div className="tic__rowLeft">
        <span className="material-symbols-outlined tic__rowIcon">{icon}</span>
        <span className="tic__label">{label}</span>
      </div>
      <div className="tic__rowRight">{children}</div>
    </div>
  );
}

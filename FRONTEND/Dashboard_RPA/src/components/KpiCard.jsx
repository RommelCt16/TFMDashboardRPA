import "../styles/kpi-card.css";

function KpiCard({ label, value, subtitle, variant = "info", icon }) {
  return (
    <article className={`kpi-card kpi-${variant}`} role="group" aria-label={label}>
      <div className="kpi-icon" aria-hidden="true">
        {icon ? <span className="material-symbols-outlined">{icon}</span> : null}
      </div>

      <div className="kpi-content">
        <div className="kpi-label">{label}</div>
        <div className="kpi-value">{value}</div>
        {subtitle ? <div className="kpi-subtitle">{subtitle}</div> : null}
      </div>
    </article>
  );
}

export default KpiCard;

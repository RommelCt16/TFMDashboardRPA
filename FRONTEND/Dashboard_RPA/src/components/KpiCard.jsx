function KpiCard({ label, value, subtitle }) {
  return (
    <div className="kpi">
      <div>{label}</div>
      <div className="value">{value}</div>
      {subtitle && <div className="subtitle">{subtitle}</div>}
    </div>
  );
}

export default KpiCard;

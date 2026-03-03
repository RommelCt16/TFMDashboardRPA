import "../../styles/eficienciaCard.css";

function formatMonthOption(monthKey) {
  if (!monthKey) return "";
  const [year, month] = monthKey.split("-");
  const d = new Date(Number(year), Number(month) - 1, 1);
  if (Number.isNaN(d.getTime())) return monthKey;
  return d.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
}

export default function EficienciaCard({
  gaugeRef,
  mode,
  onModeChange,
  counts,
  monthOptions,
  selectedMonth,
  onSelectedMonthChange,
  noteText,
}) {
  return (
    <section className="efc glass">
      <div className="efc__head">
        <div className="efc__headTitle">
          <span className="material-symbols-outlined efc__icon">analytics</span>
          <h3 className="efc__title">Eficiencia</h3>
        </div>
        <div className="efc__toggle" role="tablist" aria-label="Modo de eficiencia">
          <button
            type="button"
            className={`efc__toggleBtn ${mode === "total" ? "active" : ""}`}
            onClick={() => onModeChange?.("total")}
          >
            Total
          </button>
          <button
            type="button"
            className={`efc__toggleBtn ${mode === "mes" ? "active" : ""}`}
            onClick={() => onModeChange?.("mes")}
          >
            Mes
          </button>
        </div>
      </div>

      {mode === "mes" ? (
        <div className="efc__monthRow">
          <label className="efc__monthLabel" htmlFor="efc-month">
            Mes
          </label>
          <select
            id="efc-month"
            className="efc__monthSelect"
            value={selectedMonth || ""}
            onChange={(e) => onSelectedMonthChange?.(e.target.value)}
            disabled={!monthOptions?.length}
          >
            {monthOptions?.length ? (
              monthOptions.map((m) => (
                <option key={m} value={m}>
                  {formatMonthOption(m)}
                </option>
              ))
            ) : (
              <option value="">Sin meses disponibles</option>
            )}
          </select>
        </div>
      ) : null}

      <div className="efc__center">
        <svg id="gauge" ref={gaugeRef} className="efc__svg" />
      </div>

      <div className="efc__counts">
        <span className="efc__chip success">N. {counts?.successCount ?? 0}</span>
        <span className="efc__chip failure">N. {counts?.failureCount ?? 0}</span>
      </div>

      <p className="efc__note">{noteText}</p>
    </section>
  );
}

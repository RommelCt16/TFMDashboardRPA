import "../../styles/eficienciaCard.css"


export default function EficienciaCard({ gaugeRef }) {
  return (
    <section className="efc glass">
      <div className="efc__head">
        <span className="material-symbols-outlined efc__icon">analytics</span>
        <h3 className="efc__title">Eficiencia</h3>
      </div>

      <div className="efc__center">
        <svg id="gauge" ref={gaugeRef} className="efc__svg" />
      </div>

      <p className="efc__note">Éxito (success) vs otros resultados.</p>
    </section>
  );
}

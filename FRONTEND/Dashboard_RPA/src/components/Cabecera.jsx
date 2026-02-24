import React from "react";
import "../styles/Cabecera.css";

export default function Cabecera({title, subtitle, right}) {
  return (
      <header className="cabecera-principal">
          <div className="cabecera-left">
              <div className="cabecera-title-group">
                  <h2>{title}</h2>
                  {subtitle ? <p>{subtitle}</p> : null}
              </div>
          </div>
          {/* Zona derecha opcional (botones, estado WS, usuario, etc.) */}
          {right ? <div className="header-right">{right}</div> : null}
    </header>
  );
}

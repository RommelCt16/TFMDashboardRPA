export const ESTADO_TEXTO = {
  1: { texto: "Success", clase: "success" },
  2: { texto: "Failure", clase: "failure" },
  12: { texto: "En ejecución", clase: "running" },
  0: { texto: "Desconocido", clase: "desconocido" },
  3: { texto: "Incompleto", clase: "incompleto" },
  7: { texto: "Time Out", clase: "timeout" },
  11: { texto: "En Cola", clase: "encola" },
};

export function getEstadoInfo(code) {
  return (
    ESTADO_TEXTO[code] || {
      texto: "Desconocido",
      clase: "desconocido",
    }
  );
}
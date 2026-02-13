// src/d3/generalChart.js
import * as d3 from "d3";

const parseFecha = d3.timeParse("%Y-%m-%dT%H:%M:%S.%L");

/**
 * Construye el gráfico de ejecuciones
 * @param {SVGElement} svgElement - Elemento <svg> donde dibujar
 * @param {Array} rawData - Datos crudos desde la API
 * @param {"dia"|"mes"|""} filtro - Tipo de filtro activo
 * @param {(detalle: any) => void} onPointClick - callback al hacer clic en un punto
 */
export function construirGraficoEjecuciones(
  svgElement,
  rawData,
  filtro,
  onPointClick
) {
  const svg = d3.select(svgElement);
  svg.selectAll("*").remove(); // limpiamos el contenido previo

  if (!rawData || rawData.length === 0) {
    // mensaje simple cuando no hay datos
    const width = 800;
    const height = 350;
    svg.attr("viewBox", `0 0 ${width} ${height}`);
    svg
      .append("text")
      .attr("x", width / 2)
      .attr("y", height / 2)
      .attr("text-anchor", "middle")
      .text("No hay datos para el periodo seleccionado");
    return;
  }

  // Transformar datos
  const dataset = rawData
    .map((d) => {
      const inicioParsed =
        parseFecha(d.StartDateTime) || new Date(d.StartDateTime);
      const finParsed =
        d.EndDateTime && (parseFecha(d.EndDateTime) || new Date(d.EndDateTime));

      if (!inicioParsed || isNaN(inicioParsed)) return null;

      return {
        raw: d,
        x: inicioParsed,
        y: d.DurationSeconds ?? d.Duration ?? 0,
        fecha_fin: finParsed ? finParsed.toLocaleString() : "—",
        estado: d.ResultCode ?? d.Status ?? 0,
        texto: d.ResultText ?? "",
        label: d.ConstructName ?? "Sin nombre",
      };
    })
    .filter(Boolean);

  if (dataset.length === 0) {
    const width = 800;
    const height = 350;
    svg.attr("viewBox", `0 0 ${width} ${height}`);
    svg
      .append("text")
      .attr("x", width / 2)
      .attr("y", height / 2)
      .attr("text-anchor", "middle")
      .text("No hay datos válidos para mostrar");
    return;
  }

  const margin = { top: 40, right: 30, bottom: 50, left: 70 };
  const width = 900 - margin.left - margin.right;
  const height = 400 - margin.top - margin.bottom;

  svg.attr(
    "viewBox",
    `0 0 ${width + margin.left + margin.right} ${
      height + margin.top + margin.bottom
    }`
  );

  const g = svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  // Escala X
  let xScale;
  let xAxisFormat;
  let xAccessor;

  if (filtro === "dia") {
    // eje en horas
    xAccessor = (d) => {
      const h = d.x.getHours();
      const m = d.x.getMinutes();
      return h + m / 60;
    };
    xScale = d3
      .scaleLinear()
      .domain([0, 23])
      .range([0, width])
      .nice();
    xAxisFormat = (d) => `${d}:00`;
  } else {
    // eje en días del mes
    xAccessor = (d) => {
      const day = d.x.getDate();
      const h = d.x.getHours();
      return day + h / 24;
    };
    const dias = dataset.map((d) => d.x.getDate());
    const maxDia = d3.max(dias) || 31;
    xScale = d3
      .scaleLinear()
      .domain([1, maxDia])
      .range([0, width])
      .nice();
    xAxisFormat = (d) => `Día ${d}`;
  }

  // Escala Y (duración en segundos)
  const maxY = d3.max(dataset, (d) => d.y) || 0;
  const yScale = d3
    .scaleLinear()
    .domain([0, maxY * 1.1 || 10])
    .range([height, 0])
    .nice();

  // Ejes
  const xAxis = d3.axisBottom(xScale).ticks(10).tickFormat(xAxisFormat);
  const yAxis = d3.axisLeft(yScale).ticks(6);

  g.append("g")
    .attr("transform", `translate(0,${height})`)
    .call(xAxis)
    .append("text")
    .attr("x", width / 2)
    .attr("y", 40)
    .attr("fill", "currentColor")
    .attr("text-anchor", "middle")
    .text(filtro === "dia" ? "Hora de ejecución" : "Día del mes");

  g.append("g")
    .call(yAxis)
    .append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -height / 2)
    .attr("y", -50)
    .attr("fill", "currentColor")
    .attr("text-anchor", "middle")
    .text("Duración (segundos)");

  // Color por estado
  const color = (estado) => {
    if (estado === 1) return "#2e7d32"; // éxito
    if (estado === 2) return "#c62828"; // error
    return "#f9a825"; // otros
  };

  // Puntos
  const puntos = g
    .selectAll("circle")
    .data(dataset)
    .enter()
    .append("circle")
    .attr("cx", (d) => xScale(xAccessor(d)))
    .attr("cy", (d) => yScale(d.y))
    .attr("r", 5)
    .attr("fill", (d) => color(d.estado))
    .attr("opacity", 0.85);

  // Tooltip simple
  const tooltip = d3
    .select(svgElement.parentNode)
    .append("div")
    .style("position", "absolute")
    .style("pointer-events", "none")
    .style("padding", "6px 10px")
    .style("border-radius", "6px")
    .style("font-size", "12px")
    .style("background", "rgba(0,0,0,0.7)")
    .style("color", "#fff")
    .style("opacity", 0);

  puntos
    .on("mouseenter", function (event, d) {
      tooltip
        .style("opacity", 1)
        .html(
          `
          <strong>${d.label}</strong><br/>
          Duración: ${d.y} s<br/>
          Inicio: ${d.x.toLocaleString()}
        `
        );
    })
    .on("mousemove", function (event) {
      tooltip
        .style("left", event.pageX + 10 + "px")
        .style("top", event.pageY - 28 + "px");
    })
    .on("mouseleave", function () {
      tooltip.style("opacity", 0);
    })
    .on("click", function (_event, d) {
      if (onPointClick) {
        onPointClick({
          ...d,
        });
      }
    });
}

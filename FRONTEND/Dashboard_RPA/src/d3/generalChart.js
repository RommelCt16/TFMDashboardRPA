// src/d3/generalChart.js
import * as d3 from "d3";

const parseFecha = d3.timeParse("%Y-%m-%dT%H:%M:%S.%L");

/**
 * Construye el grafico de ejecuciones
 * @param {SVGElement} svgElement - Elemento <svg> donde dibujar
 * @param {Array} rawData - Datos crudos desde la API
 * @param {"dia"|"semana"|"mes"|""} filtro - Tipo de filtro activo
 * @param {(detalle: any) => void} onPointClick - callback al hacer clic en un punto
 */
export function construirGraficoEjecuciones(
  svgElement,
  rawData,
  filtro,
  onPointClick
) {
  const svg = d3.select(svgElement);
  svg.selectAll("*").remove();

  if (!rawData || rawData.length === 0) {
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

  const dataset = rawData
    .map((d) => {
      const inicioParsed = parseFecha(d.StartDateTime) || new Date(d.StartDateTime);
      const finParsed = d.EndDateTime && (parseFecha(d.EndDateTime) || new Date(d.EndDateTime));

      if (!inicioParsed || Number.isNaN(inicioParsed.getTime())) return null;

      return {
        raw: d,
        x: inicioParsed,
        y: Number(d.DurationSeconds ?? d.Duration ?? 0),
        fecha_fin: finParsed ? finParsed.toLocaleString() : "-",
        estado: Number(d.ResultCode ?? d.Status ?? 0),
        texto: d.ResultText ?? "",
        label: d.ConstructName ?? "Sin nombre",
        workflow: d.Workflow ?? null,
        robot: d.AgentName ?? null,
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
      .text("No hay datos validos para mostrar");
    return;
  }

  const margin = { top: 40, right: 30, bottom: 50, left: 70 };
  const width = 900 - margin.left - margin.right;
  const height = 400 - margin.top - margin.bottom;

  svg.attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`);

  const g = svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  let xScale;
  let xAxisFormat;
  let xAccessor;
  let xAxisLabel;
  let xAxis;

  if (filtro === "dia") {
    xAccessor = (d) => {
      const h = d.x.getHours();
      const m = d.x.getMinutes();
      return h + m / 60;
    };
    xScale = d3.scaleLinear().domain([0, 23]).range([0, width]).nice();
    xAxisFormat = (d) => `${d}:00`;
    xAxisLabel = "Hora de ejecución";
    xAxis = d3.axisBottom(xScale).ticks(10).tickFormat(xAxisFormat);
  } else if (filtro === "semana") {
    const weekLabels = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"];
    const minDate = d3.min(dataset, (d) => d.x) || new Date();
    const minDateCopy = new Date(minDate);
    const isoDay = minDateCopy.getDay() === 0 ? 7 : minDateCopy.getDay();
    const weekStart = new Date(minDateCopy);
    weekStart.setDate(minDateCopy.getDate() - (isoDay - 1));
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    xAccessor = (d) => d.x;
    xScale = d3.scaleTime().domain([weekStart, weekEnd]).range([0, width]);
    xAxisFormat = (d) => weekLabels[(d.getDay() === 0 ? 7 : d.getDay()) - 1];
    xAxisLabel = "Dia de la semana";
    xAxis = d3.axisBottom(xScale).ticks(d3.timeDay.every(1)).tickFormat(xAxisFormat);
  } else {
    const baseDate = dataset[0].x;
    const monthStart = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1, 0, 0, 0, 0);
    const monthEnd = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 1, 0, 0, 0, 0);
    xAccessor = (d) => d.x;
    xScale = d3.scaleTime().domain([monthStart, monthEnd]).range([0, width]);
    xAxisFormat = (d) => `Dia ${d.getDate()}`;
    xAxisLabel = "Dia del mes";
    xAxis = d3.axisBottom(xScale).ticks(d3.timeDay.every(2)).tickFormat(xAxisFormat);
  }

  const maxY = d3.max(dataset, (d) => Number(d.y) || 0) || 0;
  const yScale = d3.scaleLinear().domain([0, maxY * 1.1 || 10]).range([height, 0]).nice();

  const yAxis = d3.axisLeft(yScale).ticks(6);

  const xAxisG = g
    .append("g")
    .attr("transform", `translate(0,${height})`)
    .call(xAxis);

  const yAxisG = g.append("g").call(yAxis);

  g
    .append("text")
    .attr("x", width / 2)
    .attr("y", height + 40)
    .attr("fill", "currentColor")
    .attr("text-anchor", "middle")
    .text(xAxisLabel);

  g
    .append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -height / 2)
    .attr("y", -50)
    .attr("fill", "currentColor")
    .attr("text-anchor", "middle")
    .text("Duración (segundos)");

  const color = (estado) => {
    if (estado === 1) return "#2e7d32";
    if (estado === 2) return "#c62828";
    return "#f9a825";
  };

  const clipId = `general-chart-clip-${Date.now()}`;
  g
    .append("defs")
    .append("clipPath")
    .attr("id", clipId)
    .append("rect")
    .attr("width", width)
    .attr("height", height);

  const plotLayer = g
    .append("g")
    .attr("clip-path", `url(#${clipId})`);

  const puntos = plotLayer
    .selectAll("circle")
    .data(dataset)
    .enter()
    .append("circle")
    .attr("cx", (d) => xScale(xAccessor(d)))
    .attr("cy", (d) => yScale(d.y))
    .attr("r", 5)
    .attr("fill", (d) => color(d.estado))
    .attr("opacity", 0.85);

  const chartContainer = d3.select(svgElement.parentNode);
  chartContainer.style("position", "relative");
  chartContainer.selectAll(".general-chart-tooltip").remove();

  const tooltip = chartContainer
    .append("div")
    .attr("class", "general-chart-tooltip")
    .style("position", "absolute")
    .style("pointer-events", "none")
    .style("padding", "6px 10px")
    .style("border-radius", "6px")
    .style("font-size", "12px")
    .style("background", "rgba(0,0,0,0.7)")
    .style("color", "#fff")
    .style("opacity", 0);

  puntos
    .on("mouseenter", function (_event, d) {
      tooltip
        .style("opacity", 1)
        .html(
          `<strong>${d.label}</strong><br/>Duración: ${d.y} s<br/>Inicio: ${d.x.toLocaleString()}`
        );
    })
    .on("mousemove", function (event) {
      const [x, y] = d3.pointer(event, chartContainer.node());
      tooltip
        .style("left", `${x + 12}px`)
        .style("top", `${y - 18}px`);
    })
    .on("mouseleave", function () {
      tooltip.style("opacity", 0);
    })
    .on("click", function (_event, d) {
      if (onPointClick) {
        onPointClick({ ...d });
      }
    });

  const zoom = d3
    .zoom()
    .scaleExtent([1, 20])
    .extent([[0, 0], [width, height]])
    .translateExtent([[0, 0], [width, height]])
    .on("zoom", (event) => {
      const zx = event.transform.rescaleX(xScale);
      const zy = event.transform.rescaleY(yScale);

      if (filtro === "semana") {
        xAxisG.call(d3.axisBottom(zx).ticks(d3.timeDay.every(1)).tickFormat(xAxisFormat));
      } else if (filtro === "mes") {
        xAxisG.call(d3.axisBottom(zx).ticks(d3.timeDay.every(2)).tickFormat(xAxisFormat));
      } else {
        xAxisG.call(d3.axisBottom(zx).ticks(10).tickFormat(xAxisFormat));
      }
      yAxisG.call(d3.axisLeft(zy).ticks(6));

      puntos
        .attr("cx", (d) => zx(xAccessor(d)))
        .attr("cy", (d) => zy(d.y));
    });

  svg.call(zoom);
}

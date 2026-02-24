// src/d3/detailCharts.js
import * as d3 from "d3";

const parseFecha = d3.timeParse("%Y-%m-%dT%H:%M:%S.%L");

/**
 * Dibuja el gráfico de línea de duración de ejecuciones de una tarea
 * @param {HTMLElement} containerEl - contenedor (div) donde se montará el svg
 * @param {Array} rawData - datos crudos de la API
 * @param {Object} estadoTexto - mapa de códigos de estado a {texto, clase}
 * @param {(evento: any) => void} onPointClick - callback al hacer clic en un punto
 */
export function renderLineChart(
  containerEl,
  rawData,
  estadoTexto,
  onPointClick
) {
  // Limpiamos cualquier gráfico previo
  d3.select(containerEl).selectAll("*").remove();

  if (!rawData || rawData.length === 0) {
    d3.select(containerEl)
      .append("p")
      .text("No hay datos de historial para esta tarea.");
    return;
  }

  const margin = { top: 30, right: 30, bottom: 50, left: 70 };
  const width = 900 - margin.left - margin.right;
  const height = 350 - margin.top - margin.bottom;

  const svg = d3
    .select(containerEl)
    .append("svg")
    .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  // Transformar datos
  const data = rawData
    .map((d) => {
      const inicio =
        parseFecha(d.StartDateTime) || new Date(d.StartDateTime);
      const fin =
        d.EndDateTime && (parseFecha(d.EndDateTime) || new Date(d.EndDateTime));
      if (!inicio || isNaN(inicio)) return null;

      const dur =
        d.DurationSeconds ??
        d.Duration ??
        (fin ? (fin - inicio) / 1000 : 0);

      return {
        raw: d,
        time: inicio,
        fin: fin || null,
        duration: dur,
        status: d.Status ?? d.ResultCode ?? 0,
        text: d.ResultText ?? "",
        agente: d.AgentName ?? "Desconocido",
        workflow: d.Workflow ?? null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.time - b.time);

  if (data.length === 0) {
    d3.select(containerEl)
      .append("p")
      .text("No hay datos válidos para mostrar.");
    return;
  }

  // Escalas
  const xScale = d3
    .scaleTime()
    .domain(d3.extent(data, (d) => d.time))
    .range([0, width])
    .nice();

  const maxY = d3.max(data, (d) => d.duration) || 0;
  const yScale = d3
    .scaleLinear()
    .domain([0, maxY * 1.1 || 10])
    .range([height, 0])
    .nice();

  const xAxis = d3.axisBottom(xScale).ticks(6);
  const yAxis = d3.axisLeft(yScale).ticks(6);

  // Ejes
  svg
    .append("g")
    .attr("transform", `translate(0,${height})`)
    .call(xAxis)
    .append("text")
    .attr("x", width / 2)
    .attr("y", 40)
    .attr("fill", "currentColor")
    .attr("text-anchor", "middle")
    .text("Fecha / Hora de inicio");

  svg
    .append("g")
    .call(yAxis)
    .append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -height / 2)
    .attr("y", -50)
    .attr("fill", "currentColor")
    .attr("text-anchor", "middle")
    .text("Duración (segundos)");

  // Línea
  const line = d3
    .line()
    .x((d) => xScale(d.time))
    .y((d) => yScale(d.duration))
    .curve(d3.curveMonotoneX);

  svg
    .append("path")
    .datum(data)
    .attr("fill", "none")
    .attr("stroke", "#888")
    .attr("stroke-width", 1.5)
    .attr("d", line);

  // Color por estado
  const colorEstado = (estado) => {
    if (estado === 1) return "#2e7d32"; // success
    if (estado === 2) return "#c62828"; // error
    if (estado === 7) return "#f57c00"; // timeout
    if (estado === 3) return "#fbc02d"; // incompleto
    if (estado === 11) return "#1976d2"; // en cola
    if (estado === 12) return "#7b1fa2"; // en ejecución
    return "#757575"; // desconocido
  };

  // Tooltip (como div absoluto dentro del contenedor)
  const tooltip = d3
    .select(containerEl)
    .append("div")
    .style("position", "absolute")
    .style("pointer-events", "none")
    .style("padding", "6px 10px")
    .style("border-radius", "6px")
    .style("font-size", "12px")
    .style("background", "rgba(0,0,0,0.7)")
    .style("color", "#fff")
    .style("opacity", 0);

  // Puntos
  svg
    .selectAll("circle")
    .data(data)
    .enter()
    .append("circle")
    .attr("cx", (d) => xScale(d.time))
    .attr("cy", (d) => yScale(d.duration))
    .attr("r", 4)
    .attr("fill", (d) => colorEstado(d.status))
    .attr("opacity", 0.9)
    .on("mouseenter", function (event, d) {
      const estado =
        estadoTexto[d.status]?.texto ?? "Desconocido";
      tooltip
        .style("opacity", 1)
        .html(
          `
          <strong>${estado}</strong><br/>
          Duración: ${d.duration.toFixed(1)} s<br/>
          Inicio: ${d.time.toLocaleString()}
        `
        );
    })
    .on("mousemove", function (event) {
      const { offsetX, offsetY } = event;
      tooltip
        .style("left", offsetX + 10 + "px")
        .style("top", offsetY - 28 + "px");
    })
    .on("mouseleave", function () {
      tooltip.style("opacity", 0);
    })
    .on("click", function (_event, d) {
      if (onPointClick) {
        onPointClick(d);
      }
    });
}

/**
 * Dibuja el donut de efectividad (success vs otros)
 * @param {SVGElement} svgElement - elemento <svg> para el donut
 * @param {Array} rawData - datos de historial
 */
export function renderDonutEfectividad(svgElement, rawData) {
  const svg = d3.select(svgElement);
  svg.selectAll("*").remove();

  const width = 260;
  const height = 260;
  const radius = Math.min(width, height) / 2;

  svg.attr("viewBox", `0 0 ${width} ${height}`);

  const g = svg
    .append("g")
    .attr("transform", `translate(${width / 2},${height / 2})`);

  if (!rawData || rawData.length === 0) {
    g.append("text")
      .attr("text-anchor", "middle")
      .text("Sin datos");
    return;
  }

  const total = rawData.length;
  const successCount = rawData.filter(
    (d) => (d.Status ?? d.ResultCode) === 1
  ).length;
  const otros = total - successCount;

  const data = [
    { key: "success", value: successCount },
    { key: "otros", value: otros },
  ];

  const color = d3
    .scaleOrdinal()
    .domain(["success", "otros"])
    .range(["#2e7d32", "#c62828"]);

  const pie = d3.pie().value((d) => d.value);
  const arc = d3
    .arc()
    .innerRadius(radius * 0.6)
    .outerRadius(radius - 10);

  const arcs = g.selectAll("arc").data(pie(data)).enter().append("g");

  arcs
    .append("path")
    .attr("d", arc)
    .attr("fill", (d) => color(d.data.key))
    .attr("stroke", "#121212")
    .attr("stroke-width", 1);

  // Texto central (porcentaje éxito)
  const porcentajeSuccess =
    total > 0 ? ((successCount / total) * 100).toFixed(1) : 0;

  g.append("text")
    .attr("text-anchor", "middle")
    .attr("y", -5)
    .style("font-size", "24px")
    .style("font-weight", "bold")
    .text(`${porcentajeSuccess}%`);

  g.append("text")
    .attr("text-anchor", "middle")
    .attr("y", 18)
    .style("font-size", "12px")
    .text("Éxito");

  // Leyenda
  const legend = svg
    .append("g")
    .attr("transform", `translate(${width / 2 - 60}, ${height - 40})`);

  const items = legend
    .selectAll("g")
    .data(data)
    .enter()
    .append("g")
    .attr("transform", (d, i) => `translate(${i * 80}, 0)`);

  items
    .append("rect")
    .attr("width", 12)
    .attr("height", 12)
    .attr("fill", (d) => color(d.key));

  items
    .append("text")
    .attr("x", 18)
    .attr("y", 10)
    .style("font-size", "12px")
    .text((d) =>
      d.key === "success" ? "Success" : "Otros"
    );
}

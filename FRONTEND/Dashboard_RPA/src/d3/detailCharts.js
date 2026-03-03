import * as d3 from "d3";

const parseFecha = d3.timeParse("%Y-%m-%dT%H:%M:%S.%L");

export function renderLineChart(
  containerEl,
  rawData,
  estadoTexto,
  onPointClick
) {
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

  const data = rawData
    .map((d) => {
      const inicio = parseFecha(d.StartDateTime) || new Date(d.StartDateTime);
      const fin = d.EndDateTime && (parseFecha(d.EndDateTime) || new Date(d.EndDateTime));
      if (!inicio || Number.isNaN(inicio.getTime())) return null;

      const durationNum = Number(
        d.DurationSeconds ?? d.Duration ?? (fin ? (fin - inicio) / 1000 : 0)
      );
      const duration = Number.isFinite(durationNum) ? durationNum : 0;

      const statusNum = Number(d.Status ?? d.ResultCode ?? 0);
      const status = Number.isFinite(statusNum) ? statusNum : 0;

      return {
        raw: d,
        time: inicio,
        fin: fin || null,
        duration,
        status,
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
      .text("No hay datos validos para mostrar.");
    return;
  }

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

  const xAxisG = svg
    .append("g")
    .attr("transform", `translate(0,${height})`)
    .call(xAxis);

  xAxisG
    .append("text")
    .attr("x", width / 2)
    .attr("y", 40)
    .attr("fill", "currentColor")
    .attr("text-anchor", "middle")
    .text("Fecha / Hora de inicio");

  const yAxisG = svg
    .append("g")
    .call(yAxis);

  yAxisG
    .append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -height / 2)
    .attr("y", -50)
    .attr("fill", "currentColor")
    .attr("text-anchor", "middle")
    .text("Duracion (segundos)");

  const line = d3
    .line()
    .x((d) => xScale(d.time))
    .y((d) => yScale(d.duration))
    .curve(d3.curveMonotoneX);

  const clipId = `detail-line-clip-${Date.now()}`;
  svg
    .append("defs")
    .append("clipPath")
    .attr("id", clipId)
    .append("rect")
    .attr("width", width)
    .attr("height", height);

  const chartLayer = svg
    .append("g")
    .attr("clip-path", `url(#${clipId})`);

  const linePath = chartLayer
    .append("path")
    .datum(data)
    .attr("fill", "none")
    .attr("stroke", "#888")
    .attr("stroke-width", 1.5)
    .attr("d", line);

  const colorEstado = (estado) => {
    if (estado === 1) return "#2e7d32";
    if (estado === 2) return "#c62828";
    if (estado === 7) return "#f57c00";
    if (estado === 3) return "#fbc02d";
    if (estado === 11) return "#1976d2";
    if (estado === 12) return "#7b1fa2";
    return "#757575";
  };

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

  const points = chartLayer
    .selectAll("circle")
    .data(data)
    .enter()
    .append("circle")
    .attr("cx", (d) => xScale(d.time))
    .attr("cy", (d) => yScale(d.duration))
    .attr("r", 4)
    .attr("fill", (d) => colorEstado(d.status))
    .attr("opacity", 0.9)
    .on("mouseenter", function (_event, d) {
      const estado = estadoTexto[d.status]?.texto ?? "Desconocido";
      tooltip
        .style("opacity", 1)
        .html(
          `
          <strong>${estado}</strong><br/>
          Duracion: ${d.duration.toFixed(1)} s<br/>
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

  const zoom = d3
    .zoom()
    .scaleExtent([1, 20])
    .extent([[0, 0], [width, height]])
    .translateExtent([[0, 0], [width, height]])
    .on("zoom", (event) => {
      const zx = event.transform.rescaleX(xScale);
      const zy = event.transform.rescaleY(yScale);

      xAxisG.call(d3.axisBottom(zx).ticks(6));
      yAxisG.call(d3.axisLeft(zy).ticks(6));

      linePath.attr(
        "d",
        d3
          .line()
          .x((d) => zx(d.time))
          .y((d) => zy(d.duration))
          .curve(d3.curveMonotoneX)
      );

      points
        .attr("cx", (d) => zx(d.time))
        .attr("cy", (d) => zy(d.duration));
    });

  svg.call(zoom);
}

function toNumeric(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function renderDonutEfectividad(svgElement, rawData, options = {}) {
  const { mode = "mes", totals = null } = options;
  const svg = d3.select(svgElement);
  svg.selectAll("*").remove();

  const width = 300;
  const height = 300;
  const radius = Math.min(width, height) / 2;

  svg.attr("viewBox", `0 0 ${width} ${height}`);

  const g = svg
    .append("g")
    .attr("transform", `translate(${width / 2},${height / 2 - 20})`);

  let total = 0;
  let successCount = 0;
  let failureCount = 0;

  if (mode === "total") {
    const success = toNumeric(totals?.successCount) ?? 0;
    const failure = toNumeric(totals?.failureCount) ?? 0;
    successCount = Math.max(0, success);
    failureCount = Math.max(0, failure);
    total = successCount + failureCount;
  } else {
    const safeRaw = Array.isArray(rawData) ? rawData : [];
    successCount = safeRaw.filter((d) => toNumeric(d?.ResultCode) === 1).length;
    failureCount = safeRaw.filter((d) => toNumeric(d?.ResultCode) !== 1).length;
    total = successCount + failureCount;
  }

  if (total === 0) {
    g.append("text")
      .attr("text-anchor", "middle")
      .attr("fill", "#e2e8f0")
      .text("Sin datos");
    return;
  }

  const data = [
    { key: "success", value: successCount },
    { key: "failure", value: failureCount },
  ];

  const color = d3
    .scaleOrdinal()
    .domain(["success", "failure"])
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

  const porcentajeSuccess = ((successCount / total) * 100).toFixed(1);

  g.append("text")
    .attr("text-anchor", "middle")
    .attr("y", -5)
    .attr("fill", "#e2e8f0")
    .style("font-size", "24px")
    .style("font-weight", "bold")
    .text(`${porcentajeSuccess}%`);

  g.append("text")
    .attr("text-anchor", "middle")
    .attr("y", 18)
    .attr("fill", "#cbd5e1")
    .style("font-size", "12px")
    .text("Éxito");

  const legendItemWidth = 90;
  const legend = g.append("g");
  const legendMargin = 30;

  legend.attr(
    "transform",
    `translate(${-(legendItemWidth * data.length - 40) / 2}, ${radius + legendMargin})`
  );

  const items = legend
    .selectAll("g")
    .data(data)
    .enter()
    .append("g")
    .attr("transform", (_d, i) => `translate(${i * legendItemWidth}, 0)`);

  items
    .append("rect")
    .attr("width", 12)
    .attr("height", 12)
    .attr("y", -8)
    .attr("fill", (d) => color(d.key));

  items
    .append("text")
    .attr("x", 18)
    .attr("y", -2)
    .attr("dominant-baseline", "middle")
    .attr("fill", "#cbd5e1")
    .style("font-size", "12px")
    .text((d) => (d.key === "success" ? "Exito" : "Fallo"));
}

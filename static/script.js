// === Variables globales ===
let nivel = "anio";
let plagaSeleccionada = null;
let choicesPlaga = null;

// === Tooltip para treemap ===
const tooltip = d3.select("body")
  .append("div")
  .attr("class", "treemap-tooltip")
  .style("position", "absolute")
  .style("background", "#fff")
  .style("border", "1px solid #999")
  .style("padding", "6px 10px")
  .style("border-radius", "5px")
  .style("box-shadow", "0 2px 5px rgba(0,0,0,0.2)")
  .style("pointer-events", "none")
  .style("font-size", "16px")
  .style("visibility", "hidden");

// === Función para cargar tendencias ===
function cargarTendencias(nivelActual, plaga = null, hospedante = null) {
  let url = `/api/tendencias/${nivelActual}`;
  const params = [];
  if (plaga) params.push(`plaga=${encodeURIComponent(plaga)}`);
  if (hospedante) params.push(`hospedante=${encodeURIComponent(hospedante)}`);
  if (params.length) url += `?${params.join("&")}`;

  d3.json(url).then(data => {
    const svg = d3.select('#trend');
    svg.selectAll("*").remove();

    const margin = { top: 20, right: 30, bottom: 30, left: 40 },
      width = svg.node().clientWidth - margin.left - margin.right,
      height = 300 - margin.top - margin.bottom;

    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const parse = {
      anio: d3.timeParse("%Y"),
      mes: d3.timeParse("%Y-%m"),
      dia: d3.timeParse("%Y-%m-%d")
    };

    data.forEach(d => d.periodo = parse[nivelActual](d.periodo));

    const x = d3.scaleTime().domain(d3.extent(data, d => d.periodo)).range([0, width]);
    const y = d3.scaleLinear().domain([0, d3.max(data, d => d.total)]).nice().range([height, 0]);

    g.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x));
    g.append("g").call(d3.axisLeft(y));

    const line = d3.line().x(d => x(d.periodo)).y(d => y(d.total)).curve(d3.curveMonotoneX);

    g.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", "#007acc")
      .attr("stroke-width", 2.5)
      .attr("d", line);

    g.selectAll("circle")
      .data(data)
      .enter().append("circle")
      .attr("cx", d => x(d.periodo))
      .attr("cy", d => y(d.total))
      .attr("r", 5)
      .attr("fill", "#007acc")
      .attr("stroke", "white")
      .attr("stroke-width", 1.5)
      .on("mouseover", function (event, d) {
        tooltip.style("visibility", "visible").html(`<strong>${formatearFecha(d.periodo, nivelActual)}</strong><br/>Total: ${d.total}`);
      })
      .on("mousemove", function (event) {
        tooltip.style("top", (event.pageY + 10) + "px").style("left", (event.pageX + 10) + "px");
      })
      .on("mouseout", function () {
        tooltip.style("visibility", "hidden");
      });

    g.selectAll("text.point-label")
      .data(data)
      .enter().append("text")
      .attr("x", d => x(d.periodo))
      .attr("y", d => y(d.total) - 10)
      .attr("text-anchor", "middle")
      .style("fill", "#333")
      .style("font-size", "12px")
      .text(d => d.total);

    svg.on("click", () => {
      nivel = nivel === "anio" ? "mes" : nivel === "mes" ? "dia" : "anio";
      cargarTendencias(nivel, plaga, hospedante);
    });
  });
}

function formatearFecha(fecha, nivel) {
  const format = {
    anio: d3.timeFormat("%Y"),
    mes: d3.timeFormat("%B %Y"),
    dia: d3.timeFormat("%d/%m/%Y")
  };
  return format[nivel](fecha);
}

function cargarTreemap(hospedante = null) {
  let url = '/api/top-plagas';
  if (hospedante) url += `?hospedante=${encodeURIComponent(hospedante)}`;

  d3.json(url).then(data => {
    const svg = d3.select('#treemap');
    const total = d3.sum(data, d => d.total); // <-- calcula el total general
    svg.selectAll("*").remove();

    const width = svg.node().clientWidth;
    const height = 300;

    const root = d3.hierarchy({ children: data }).sum(d => d.total);
    d3.treemap().size([width, height]).padding(1)(root);

    const color = d3.scaleOrdinal().range([
      "#004590", "#359AB8", "#F5EA73", "#A52B2A", "#DEC1BD",
      "#FDA17C", "#ADD9E6", "#006506", "#98FE98", "#E8E8CF"
    ]);

    const node = svg.selectAll("g")
      .data(root.leaves())
      .enter().append("g")
      .attr("transform", d => `translate(${d.x0},${d.y0})`);

    // Guardamos referencia a los nodos para actualización
    const rects = node.append("rect")
      .attr("width", d => d.x1 - d.x0)
      .attr("height", d => d.y1 - d.y0)
      .attr("fill", d => color(d.data.nombre))
      .attr("class", "treemap-rect")
      .attr("opacity", 1)
      .each(function (d) {
        d.rectEl = this;
      })
      .on("click", function(event, d) {
        const yaSeleccionada = plagaSeleccionada === d.data.nombre;
        plagaSeleccionada = yaSeleccionada ? null : d.data.nombre;

        // Aplicar opacidad
        d3.selectAll(".treemap-rect")
          .each(function () {
            const datum = d3.select(this).datum();
            const targetOpacity = !plagaSeleccionada || datum.data.nombre === plagaSeleccionada ? 1 : 0.3;
            d3.select(this)
              .transition()
              .duration(300)
              .attr("opacity", targetOpacity)
              .attr("stroke", datum.data.nombre === plagaSeleccionada ? "#000" : "none")
              .attr("stroke-width", datum.data.nombre === plagaSeleccionada ? 2 : 0);
          });

        if (choicesPlaga) {
          if (plagaSeleccionada) {
            choicesPlaga.setChoiceByValue(plagaSeleccionada);
          } else {
            choicesPlaga.setChoiceByValue("todas");
          }
        }          

        aplicarFiltros(); // Filtro general
      })
      .on("mouseover", (event, d) => {
        const porcentaje = ((d.data.total / total) * 100).toFixed(1);
        tooltip
          .style("visibility", "visible")
          //.html(`<strong>${d.data.nombre}</strong><br/>Total: ${d.data.total}`);
          .html(`<strong>${d.data.nombre}</strong><br/>
              Total: ${d.data.total}<br/>
              (${porcentaje}% del top 10)`);
      })
      .on("mousemove", event => {
        tooltip
          .style("top", (event.pageY + 10) + "px")
          .style("left", (event.pageX + 10) + "px");
      })
      .on("mouseout", () => tooltip.style("visibility", "hidden"));

    node.append("text")
      .attr("x", 4)
      .attr("y", 14)
      .text(d => d.data.nombre.substring(0, 20));
  });
}

function cargarHospedantes(plaga = null) {
  if (!plaga) return;
  d3.json(`/api/hosts/${encodeURIComponent(plaga)}`).then(actualizarHospedantes);
}

function actualizarHospedantes(data) {
  const container = d3.select('#hosts');
  container.selectAll("*").remove();

  const width = container.node().clientWidth;
  const height = 400;

  if (data.length === 0) {
    container.append("text")
      .attr("x", 20)
      .attr("y", 20)
      .text("No hay hospedantes registrados")
      .style("font-size", "20px")
      .style("fill", "#999");
    return;
  }

  const margin = { top: 20, right: 60, bottom: 50, left: 350 };
  const svg = container.append("svg")
    .attr("width", width)
    .attr("height", height)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const y = d3.scaleBand().domain(data.map(d => d.nombre)).range([0, innerHeight]).padding(0.1);
  const x = d3.scaleLinear().domain([0, d3.max(data, d => d.total)]).range([0, innerWidth]);

  svg.append("g").call(d3.axisLeft(y).tickSize(0)).selectAll("text").style("font-size", "18px");
  svg.append("g").attr("transform", `translate(0,${innerHeight})`).call(d3.axisBottom(x).ticks(5)).selectAll("text").style("font-size", "20px");

  svg.selectAll("rect")
    .data(data)
    .enter().append("rect")
    .attr("y", d => y(d.nombre))
    .attr("x", 0)
    .attr("height", y.bandwidth())
    .attr("width", d => x(d.total))
    .attr("fill", "#4682b4");

  svg.selectAll("text.bar-label")
    .data(data)
    .enter().append("text")
    .attr("x", d => x(d.total) - 5)
    .attr("y", d => y(d.nombre) + y.bandwidth() / 2 + 4)
    .text(d => d.total)
    .style("fill", "white")
    .style("font-size", "18px")
    .style("text-anchor", "end");
}

/*function cargarMapa(plaga = null) {
  d3.json(plaga ? `/api/paises?plaga=${encodeURIComponent(plaga)}` : '/api/paises')
    .then(data => {
      map.eachLayer(layer => {
        if (layer instanceof L.Circle) map.removeLayer(layer);
      });

      data.forEach(d => {
        if (d.lat && d.lng) {
          L.circle([d.lat, d.lng], {
            color: 'red',
            fillColor: '#f03',
            fillOpacity: 0.5,
            radius: d.total * 10000
          }).addTo(map).bindPopup(`${d.nombre}: ${d.total}`);
        }
      });
    });
}*/

/*function cargarMapa(plaga = null) {
  const url = plaga ? `/api/paises?plaga=${encodeURIComponent(plaga)}` : '/api/paises';

  d3.json(url).then(data => {
    // Limpiar capas anteriores
    if (window.heatLayer) {
      map.removeLayer(window.heatLayer);
    }

    // Crear lista de puntos con lat, lng, y peso (intensidad)
    const puntos = data.map(d => [d.lat, d.lng, d.total]);

    // Crear la capa de calor
    window.heatLayer = L.heatLayer(puntos, {
      radius: 25,       // radio del "foco" de calor
      blur: 15,         // qué tan suave se ve
      maxZoom: 10,      // a qué zoom desaparece
      gradient: {
        0.2: '#00f',    // azul
        0.4: '#0f0',    // verde
        0.6: '#ff0',    // amarillo
        0.8: '#f80',    // naranja
        1.0: '#f00'     // rojo
      }
    }).addTo(map);
  });
}*/

function cargarMapa(plaga = null) {
  const url = plaga ? `/api/paises?plaga=${encodeURIComponent(plaga)}` : '/api/paises';

  d3.json(url).then(data => {
    if (window.heatLayer) map.removeLayer(window.heatLayer);
    if (window.infoLayerGroup) {
      window.infoLayerGroup.clearLayers();
    } else {
      window.infoLayerGroup = L.layerGroup().addTo(map);
    }

    const total = d3.sum(data, d => d.total);
    const puntos = data.map(d => [d.lat, d.lng, d.total]);

    window.heatLayer = L.heatLayer(puntos, {
      radius: 25,
      blur: 15,
      maxZoom: 10,
      gradient: {
        0.2: '#00f',
        0.4: '#0f0',
        0.6: '#ff0',
        0.8: '#f80',
        1.0: '#f00'
      }
    }).addTo(map);

    // Agregamos círculos transparentes con tooltip
    data.forEach(d => {
      const porcentaje = ((d.total / total) * 100).toFixed(1);
      const popupContent = `<strong>${d.nombre}</strong><br/>
                            Reportes: ${d.total}<br/>
                            (${porcentaje}%)`;
      const marcador = L.circleMarker([d.lat, d.lng], {
        radius: 10,
        opacity: 0,
        fillOpacity: 0
      }).bindTooltip(popupContent, { permanent: false });
      window.infoLayerGroup.addLayer(marcador);
    });
  });
}

function cargarContadores(plaga = null) {
  const url = plaga ? `/api/contadores?plaga=${encodeURIComponent(plaga)}` : '/api/contadores';
  d3.json(url).then(data => {
    d3.select("#total-reportes").text(data.reportes.toLocaleString());
    d3.select("#total-plagas").text(data.plagas.toLocaleString());
  });
}

function cargarFiltros() {
  d3.json('/api/plagas').then(data => {
    const select = document.getElementById("filtro-plaga");
    data.forEach(nombre => {
      const option = document.createElement("option");
      option.value = nombre;
      option.textContent = nombre;
      select.appendChild(option);
    });
    //new Choices(select, { searchEnabled: true, itemSelectText: "", shouldSort: false });
    choicesPlaga = new Choices(select, {
      searchEnabled: true,
      itemSelectText: "",
      shouldSort: false
    });    
  });

  d3.json('/api/hospedantes').then(data => {
    const select = document.getElementById("filtro-hospedante");
    data.forEach(nombre => {
      const option = document.createElement("option");
      option.value = nombre;
      option.textContent = nombre;
      select.appendChild(option);
    });
    new Choices(select, { searchEnabled: true, itemSelectText: "", shouldSort: false });
  });
}

function aplicarFiltros() {
  const selectPlaga = d3.select("#filtro-plaga").node().value;
  const selectHospedante = d3.select("#filtro-hospedante").node().value;

  const plaga = plagaSeleccionada ?? (selectPlaga !== "todas" ? selectPlaga : null);
  const hospedante = selectHospedante !== "todos" ? selectHospedante : null;

  cargarTendencias(nivel, plaga, hospedante);
  cargarHospedantes(plaga);
  cargarMapa(plaga);
  cargarContadores(plaga);

  //Solo recargar treemap si cambió el hospedante manualmente
  if (!plagaSeleccionada) {
    cargarTreemap(hospedante);
  }
}

d3.select("#filtro-plaga").on("change", aplicarFiltros);
d3.select("#filtro-hospedante").on("change", aplicarFiltros);

const map = L.map('map').setView([0, 0], 2);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map);

// === Inicialización ===
cargarFiltros();
cargarContadores();
cargarMapa();
cargarTendencias(nivel);
cargarTreemap();
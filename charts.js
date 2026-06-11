/* ==========================================================================
   Gráficos (Chart.js) - Dashboard de Pendências - Sistema GGE
   ========================================================================== */

let chartOrigem = null;
let chartModulo = null;
let chartFrente = null;

/** Cria os gráficos Chart.js vazios. Deve ser chamado uma única vez. */
function initCharts() {
  const ctxOrigem = document.getElementById("chart-origem").getContext("2d");
  const ctxModulo = document.getElementById("chart-modulo").getContext("2d");
  const ctxFrente = document.getElementById("chart-frente").getContext("2d");

  chartOrigem = new Chart(ctxOrigem, {
    type: "doughnut",
    data: {
      labels: [],
      datasets: [
        {
          data: [],
          backgroundColor: COLORS.palette,
          borderWidth: 1,
          borderColor: "#ffffff"
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "right", labels: { boxWidth: 14, font: { size: 11 } } },
        title: { display: false }
      }
    }
  });

  chartModulo = new Chart(ctxModulo, {
    type: "doughnut",
    data: {
      labels: [],
      datasets: [
        {
          label: "Solicitações",
          data: [],
          backgroundColor: COLORS.palette,
          borderWidth: 1,
          borderColor: "#ffffff"
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "60%",
      plugins: {
        legend: { position: "right", labels: { boxWidth: 14, font: { size: 11 } } }
      }
    }
  });

  chartFrente = new Chart(ctxFrente, {
    type: "bar",
    data: {
      labels: [],
      datasets: [
        {
          label: "Erros",
          data: [],
          backgroundColor: COLORS.blue,
          borderRadius: 4,
          maxBarThickness: 18
        }
      ]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: { left: 8 }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => items[0].dataset.fullLabels[items[0].dataIndex]
          }
        }
      },
      scales: {
        x: { beginAtZero: true, ticks: { precision: 0 } },
        y: {
          afterFit: (scale) => {
            scale.width = 130;
          },
          ticks: {
            autoSkip: false,
            font: { size: 9 },
            callback: function (value) {
              const label = this.getLabelForValue(value);
              return label.length > 24 ? label.slice(0, 24) + "…" : label;
            }
          }
        }
      }
    }
  });
}

/**
 * Atualiza os gráficos Chart.js e o ranking de escolas a partir do conjunto
 * de linhas filtradas (canônicas). `validRows` = linhas em que o
 * solicitante está preenchido.
 */
function updateCharts(validRows) {
  updateChartOrigem(validRows);
  updateChartModulo(validRows);
  updateChartFrente(validRows);
  updateSchoolRanking(validRows);
}

/** Gráfico 1: Origem dos Erros (agrupado por origem_erro). */
function updateChartOrigem(validRows) {
  const grouped = countByGroup(validRows, (row) => row.origem_erro);
  grouped.sort((a, b) => b.value - a.value);

  chartOrigem.data.labels = grouped.map((g) => g.label);
  chartOrigem.data.datasets[0].data = grouped.map((g) => g.value);
  chartOrigem.data.datasets[0].backgroundColor = grouped.map(
    (_, i) => COLORS.palette[i % COLORS.palette.length]
  );
  chartOrigem.update();
}

/** Gráfico 2: Erro por Módulo (agrupado por modulo). */
function updateChartModulo(validRows) {
  const grouped = countByGroup(validRows, (row) => row.modulo);
  grouped.sort((a, b) => b.value - a.value);

  chartModulo.data.labels = grouped.map((g) => g.label);
  chartModulo.data.datasets[0].data = grouped.map((g) => g.value);
  chartModulo.data.datasets[0].backgroundColor = grouped.map(
    (_, i) => COLORS.palette[i % COLORS.palette.length]
  );
  chartModulo.update();
}

/** Gráfico 3: Quantidade de Erros por Frente (agrupado por ano + frente, barras horizontais). */
function updateChartFrente(validRows) {
  const grouped = countByGroup(validRows, (row) => {
    const ano = isFilled(row.ano) ? row.ano : "S/ ano";
    const frente = isFilled(row.frente) ? row.frente : "S/ frente";
    return `${ano} - ${frente}`;
  });
  grouped.sort((a, b) => b.value - a.value);

  // Altura dinâmica do contêiner do canvas, proporcional à quantidade de
  // barras, permitindo rolagem vertical dentro do card (altura fixa).
  const inner = document.getElementById("chart-frente-inner");
  const height = Math.max(320, grouped.length * 24);
  inner.style.height = `${height}px`;

  chartFrente.data.labels = grouped.map((g) => g.label);
  chartFrente.data.datasets[0].data = grouped.map((g) => g.value);
  chartFrente.data.datasets[0].fullLabels = grouped.map((g) => g.label);
  chartFrente.resize();
  chartFrente.update();
}

/**
 * Bloco 4: Escolas por Volume de Solicitações.
 * Ranking em HTML/CSS (sem Chart.js), agrupado por escola, contando apenas
 * solicitações válidas (solicitante preenchido), ordenado do maior para o
 * menor volume, com a logo/imagem da escola (campo escola_imagem).
 */
function updateSchoolRanking(validRows) {
  const container = document.getElementById("school-ranking");
  if (!container) return;

  // Agrupa contagem e mantém a primeira imagem encontrada para cada escola.
  const counts = new Map();
  const images = new Map();

  validRows.forEach((row) => {
    const escola = isFilled(row.escola) ? normalizeText(row.escola) : "Não informado";
    counts.set(escola, (counts.get(escola) || 0) + 1);
    if (!images.has(escola) && isFilled(row.escola_imagem)) {
      images.set(escola, normalizeText(row.escola_imagem));
    }
  });

  const ranking = Array.from(counts.entries())
    .map(([escola, total]) => ({ escola, total, imagem: images.get(escola) || "" }))
    .sort((a, b) => b.total - a.total);

  container.innerHTML = "";

  if (ranking.length === 0) {
    container.innerHTML = `<div class="school-ranking-empty">Nenhum dado encontrado para os filtros selecionados.</div>`;
    return;
  }

  const maxTotal = ranking[0].total;
  const fragment = document.createDocumentFragment();

  ranking.forEach(({ escola, total, imagem }) => {
    const row = document.createElement("div");
    row.className = "school-row";

    const widthPercent = maxTotal > 0 ? Math.max((total / maxTotal) * 100, 8) : 0;
    const initials = getInitials(escola);

    row.innerHTML = `
      <div class="school-info">
        ${
          imagem
            ? `<img class="school-logo" src="${escapeHtml(imagem)}" alt="Logo de ${escapeHtml(escola)}" onerror="this.replaceWith(createSchoolPlaceholder('${escapeHtml(initials)}'))">`
            : `<div class="school-logo school-logo-placeholder">${escapeHtml(initials)}</div>`
        }
        <span class="school-name" title="${escapeHtml(escola)}">${escapeHtml(escola)}</span>
      </div>
      <div class="school-bar-area">
        <div class="school-bar" style="width: ${widthPercent}%">
          <span class="school-value">${total}</span>
        </div>
      </div>
    `;

    fragment.appendChild(row);
  });

  container.appendChild(fragment);
}

/** Gera as iniciais (até 2 letras) a partir do nome da escola. */
function getInitials(name) {
  const words = normalizeText(name).split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** Cria o elemento placeholder usado quando uma imagem de escola falha ao carregar. */
function createSchoolPlaceholder(initials) {
  const div = document.createElement("div");
  div.className = "school-logo school-logo-placeholder";
  div.textContent = initials;
  return div;
}

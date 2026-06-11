/* ==========================================================================
   Lógica principal - Dashboard de Pendências - Sistema GGE
   ========================================================================== */

let allRows = []; // todas as linhas, já em formato canônico

document.addEventListener("DOMContentLoaded", () => {
  initCharts();
  bindFilterEvents();
  loadData();
});

/* --------------------------------------------------------------------- */
/* Carregamento dos dados                                                  */
/* --------------------------------------------------------------------- */

async function loadData() {
  showLoading(true);
  hideMessage();

  try {
    const response = await fetch(API_URL);

    if (!response.ok) {
      throw new Error(`Falha na requisição (HTTP ${response.status}).`);
    }

    const text = await response.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch (e) {
      throw new Error("A API retornou uma resposta que não é um JSON válido.");
    }

    let rawRows;
    if (Array.isArray(payload)) {
      rawRows = payload;
    } else if (payload && typeof payload === "object") {
      if (payload.ok === false) {
        throw new Error(payload.message || payload.error || "A API retornou um erro.");
      }
      rawRows =
        payload.dados ||
        payload.data ||
        payload.rows ||
        payload.result ||
        payload.tarefas ||
        payload.items ||
        [];
    } else {
      rawRows = [];
    }

    if (!Array.isArray(rawRows)) {
      throw new Error("Formato de dados inesperado retornado pela API.");
    }

    allRows = rawRows.map(toCanonicalRow);

    if (allRows.length === 0) {
      showMessage("A base de dados está vazia. Nenhuma pendência foi encontrada.", "warning");
    }

    populateFilters(allRows);
    applyFilters();
  } catch (err) {
    console.error(err);
    showMessage(
      `Não foi possível carregar os dados do SGGE. Detalhes: ${err.message}`,
      "error"
    );
    clearDashboard();
  } finally {
    showLoading(false);
  }
}

/* --------------------------------------------------------------------- */
/* Filtros                                                                 */
/* --------------------------------------------------------------------- */

function populateFilters(rows) {
  FILTER_FIELDS.forEach(({ id, field }) => {
    const select = document.getElementById(id);
    if (!select) return;

    const previousValue = select.value;
    const values = uniqueSorted(rows.map((row) => row[field]));

    select.innerHTML = "";
    const optionAll = document.createElement("option");
    optionAll.value = "";
    optionAll.textContent = "Todos";
    select.appendChild(optionAll);

    values.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });

    if (values.includes(previousValue)) {
      select.value = previousValue;
    } else {
      select.value = "";
    }
  });
}

function bindFilterEvents() {
  FILTER_FIELDS.forEach(({ id }) => {
    const select = document.getElementById(id);
    if (select) select.addEventListener("change", applyFilters);
  });

  const situacaoSelect = document.getElementById("filter-situacao");
  if (situacaoSelect) situacaoSelect.addEventListener("change", applyFilters);

  const clearBtn = document.getElementById("btn-clear-filters");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      FILTER_FIELDS.forEach(({ id }) => {
        const select = document.getElementById(id);
        if (select) select.value = "";
      });
      if (situacaoSelect) situacaoSelect.value = "";
      applyFilters();
    });
  }
}

function getActiveFilters() {
  const filters = {};
  FILTER_FIELDS.forEach(({ id, field }) => {
    const select = document.getElementById(id);
    const value = select ? select.value : "";
    if (isFilled(value)) filters[field] = value;
  });
  return filters;
}

function applyFilters() {
  const filters = getActiveFilters();

  const situacaoSelect = document.getElementById("filter-situacao");
  const situacao = situacaoSelect ? situacaoSelect.value : "";

  const filteredRows = allRows.filter((row) => {
    const matchesFields = Object.entries(filters).every(([field, value]) => {
      return normalizeText(row[field]) === value;
    });
    if (!matchesFields) return false;

    if (situacao === "pendentes") {
      return PENDING_STATUSES.includes(normalizeStatus(row.status));
    }
    if (situacao === "resolvidas") {
      return normalizeStatus(row.status) === RESOLVED_STATUS;
    }
    return true;
  });

  updateDashboard(filteredRows);
}

/* --------------------------------------------------------------------- */
/* Atualização do dashboard (cards, gráficos e tabela)                    */
/* --------------------------------------------------------------------- */

function isValidRow(row) {
  return isFilled(row.solicitante);
}

function updateDashboard(rows) {
  const validRows = rows.filter(isValidRow);

  updateCards(rows, validRows);
  updateCharts(validRows);
  updateTable(rows);
}

function updateCards(rows, validRows) {
  // 1. Total de Erros Reportados: solicitante preenchido
  document.getElementById("card-total-erros").textContent = validRows.length;

  // 2. Tarefas Pendentes: status "NO PRAZO" ou "ATRASADO"
  const pendentes = rows.filter((row) =>
    PENDING_STATUSES.includes(normalizeStatus(row.status))
  ).length;
  document.getElementById("card-pendentes").textContent = pendentes;

  // 3. Tempo Médio de Resolução: média de dias entre data_inicio e data_termino
  const durations = [];
  rows.forEach((row) => {
    if (!isFilled(row.data_inicio) || !isFilled(row.data_termino)) return;
    const start = parseBRDate(row.data_inicio);
    const end = parseBRDate(row.data_termino);
    if (!start || !end) return;
    durations.push(diffInDays(start, end));
  });

  const cardTempo = document.getElementById("card-tempo-medio");
  if (durations.length === 0) {
    cardTempo.textContent = "-";
  } else {
    const avg = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    cardTempo.textContent = formatDays(avg);
  }

  // 4. Tarefas Resolvidas: status "RESOLVIDO"
  const resolvidas = rows.filter(
    (row) => normalizeStatus(row.status) === RESOLVED_STATUS
  ).length;
  document.getElementById("card-resolvidas").textContent = resolvidas;
}

/* --------------------------------------------------------------------- */
/* Tabela detalhada                                                        */
/* --------------------------------------------------------------------- */

function updateTable(rows) {
  const tbody = document.getElementById("table-body");
  const countLabel = document.getElementById("table-count");
  tbody.innerHTML = "";

  if (rows.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="12" class="table-empty">Nenhum registro encontrado para os filtros selecionados.</td>`;
    tbody.appendChild(tr);
    countLabel.textContent = "0 registros";
    return;
  }

  const fragment = document.createDocumentFragment();

  rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(row.codigo)}</td>
      <td>${escapeHtml(row.escola)}</td>
      <td>${escapeHtml(row.colecao)}</td>
      <td>${escapeHtml(row.modulo)}</td>
      <td>${escapeHtml(row.ano)}</td>
      <td>${escapeHtml(row.frente)}</td>
      <td>${escapeHtml(row.categoria)}</td>
      <td>${escapeHtml(row.prioridade)}</td>
      <td>${escapeHtml(row.responsavel)}</td>
      <td>${escapeHtml(row.prazo)}</td>
      <td><span class="${statusBadgeClass(row.status)}">${escapeHtml(row.status || "-")}</span></td>
      <td>${escapeHtml(row.descricao)}</td>
    `;
    fragment.appendChild(tr);
  });

  tbody.appendChild(fragment);
  countLabel.textContent = `${rows.length} registro${rows.length === 1 ? "" : "s"}`;
}

/* --------------------------------------------------------------------- */
/* Mensagens de estado / erro                                              */
/* --------------------------------------------------------------------- */

function showLoading(isLoading) {
  const el = document.getElementById("loading-indicator");
  if (el) el.style.display = isLoading ? "flex" : "none";
}

function showMessage(text, type) {
  const el = document.getElementById("status-message");
  if (!el) return;
  el.textContent = text;
  el.className = `status-message status-${type}`;
  el.style.display = "block";
}

function hideMessage() {
  const el = document.getElementById("status-message");
  if (!el) return;
  el.style.display = "none";
  el.textContent = "";
  el.className = "status-message";
}

function clearDashboard() {
  ["card-total-erros", "card-pendentes", "card-tempo-medio", "card-resolvidas"].forEach(
    (id) => {
      document.getElementById(id).textContent = "-";
    }
  );
  updateCharts([]);
  updateTable([]);
}

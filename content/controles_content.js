// controles_content.js  v9.2
"use strict";

(function () {

  function parseBR(str) {
    if (!str || str.trim() === '') return null;
    // Remove pontos de milhar, troca vírgula decimal por ponto
    const v = parseFloat(str.trim().replace(/\./g, '').replace(',', '.'));
    return isNaN(v) ? null : v;
  }

  function fmtBR(val, dec) {
    if (val === null || val === undefined) return null;
    if (dec === undefined) dec = Number.isInteger(val) ? 0 : 1;
    return val.toFixed(dec).replace('.', ',');
  }

  /** Extrai mL de texto livre ou numérico; null para Sim/Não/vazio/ml=0. */
  function parseVolumeMl(raw) {
    if (raw === null || raw === undefined) return null;
    const t = String(raw).trim();
    if (!t) return null;
    const lower = norm(t);
    if (/^(sim|n[aã]o|nao|s|n|positivo|negativo|presente|ausente)$/i.test(lower)) return null;
    if (/^[\d.,]+$/.test(t)) {
      const v = parseBR(t);
      return v !== null && v > 0 ? v : null;
    }
    const m = t.match(/^([\d.,]+)/);
    if (m) {
      const v = parseBR(m[1]);
      return v !== null && v > 0 ? v : null;
    }
    return null;
  }

  function txd(doc, id) {
    const el = doc.getElementById(id);
    return el ? el.textContent.trim() : '';
  }

  function cellExtractApi() {
    return typeof AghuControlesCellExtract !== 'undefined'
      ? AghuControlesCellExtract
      : null;
  }

  function bhColumnsApi() {
    return typeof AghuControlesBhColumns !== 'undefined'
      ? AghuControlesBhColumns
      : null;
  }

  function bhRowsApi() {
    return typeof AghuControlesBhRows !== 'undefined'
      ? AghuControlesBhRows
      : null;
  }

  function bhPassometroMapApi() {
    return typeof AghuControlesBhPassometroMap !== 'undefined'
      ? AghuControlesBhPassometroMap
      : null;
  }

  function isColunaUrinariaVolumeBH(label, title) {
    const api = bhColumnsApi();
    if (api) return api.isColunaUrinariaVolumeBH(label, title);
    const lbl = norm(label || '').replace(/\s/g, '');
    if (/^urinou$/i.test(lbl)) return false;
    return isColunaUrinariaBH(label, title);
  }

  function resolveTipoColunaBH(detected, label, title) {
    const api = bhColumnsApi();
    if (api) return api.resolveTipoColunaBH(detected, label, title);
    if (detected && detected !== 'desconhecido') return detected;
    return 'desconhecido';
  }

  function extractResponseApi() {
    return typeof AghuControlesExtractResponse !== 'undefined'
      ? AghuControlesExtractResponse
      : null;
  }

  function controlesTextoPlaceholder() {
    const api = extractResponseApi();
    return api
      ? api.CONTROLES_TEXTO_PLACEHOLDER
      : '[Registros encontrados mas sem valores numéricos legíveis — verifique se a aba Monitorização está carregada completamente]';
  }

  // Extrai valor de uma célula de coluna dinâmica do AGHU (delega a lib/controles-cell-extract.js).
  function getCelula(doc, table, row, ri, colIdx) {
    const api = cellExtractApi();
    if (api) return api.extrairTextoCelulaMonitor(doc, table, row, ri, colIdx);
    if (colIdx === null || colIdx === undefined) return '';
    return '';
  }

  // ─── Encontra o documento que contém a tabela ─────────────────────────────
  function encontrarDocControles() {
    if (document.getElementById('tabelaVisualizacaoRegistrosM_data')) return document;
    for (const iframe of document.querySelectorAll('iframe')) {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        if (doc && doc.getElementById('tabelaVisualizacaoRegistrosM_data')) return doc;
      } catch (e) {}
    }
    return null;
  }

  // ─── Mapa de colunas ──────────────────────────────────────────────────────
  // Normaliza: lowercase + colapsa qualquer espaço/nbsp em espaço simples
  function norm(s) {
    return (s || '').toLowerCase().replace(/[\s\xa0]+/g, ' ').trim();
  }

  function lerMapaColunas(doc) {
    const mapa = {};
    doc.querySelectorAll('th[id*=":_colunaM:"]').forEach(th => {
      const idBase = th.id.replace('_clone', '');
      const m = idBase.match(/:_colunaM:(\d+)$/);
      if (!m) return;
      const idx = parseInt(m[1], 10);
      if (idx in mapa) return;
      const sp = th.querySelector('span[style*="font-weight"]')
               || th.querySelector('span.ui-column-title span');
      const label = norm(sp ? sp.textContent : th.textContent);
      if (label) mapa[label] = idx;
    });
    return Object.keys(mapa).length > 0 ? mapa : null;
  }

  const BH_TABLE_ID = 'tabelaVisualizacaoRegistrosBH';

  function parseCelulaBH(doc, row, ri, colIdx) {
    const api = cellExtractApi();
    let texto = '';
    let rawForMl = '';

    if (api) {
      rawForMl = api.extrairTextoCelulaBH(doc, BH_TABLE_ID, row, ri, colIdx);
      texto = rawForMl;
    } else {
      const base = `${BH_TABLE_ID}:${ri}:_colunaBH:${colIdx}`;
      const span291 = doc.getElementById(`${base}:j_idt291`);
      if (span291) {
        const inner = span291.querySelector('span[title]') || span291.querySelector('span') || span291;
        rawForMl = inner.getAttribute('title') || inner.textContent || '';
        texto = rawForMl.trim();
      }
      if (!texto) {
        const span293 = doc.getElementById(`${base}:j_idt293`);
        if (span293) {
          texto = span293.textContent.trim();
          if (!rawForMl) rawForMl = texto;
        }
      }
      if (!texto) {
        const panel = doc.getElementById(`${base}:panelLimiteBh`);
        if (panel) {
          texto = panel.textContent.trim();
          rawForMl = rawForMl || texto;
        }
      }
    }

    const ml = parseVolumeMl(rawForMl || texto);
    return { texto, ml };
  }

  function detectarTipoColunaBH(doc, colIdx, headerTitle) {
    const titleText = norm(headerTitle || '');
    if (/grupo\s*eliminados/i.test(titleText)) return 'eliminado';
    if (/grupo\s*administrados/i.test(titleText)) return 'administrado';

    if (!headerTitle) {
      const root = doc.getElementById(BH_TABLE_ID) || doc;
      const th = root.querySelector(`th[id*=":_colunaBH:${colIdx}"]`);
      if (th) {
        const titleEl = th.querySelector('span[title]') || th.querySelector('span.ui-column-title span') || th;
        const fallbackTitle = norm(
          (titleEl.getAttribute && titleEl.getAttribute('title')) || titleEl.textContent || ''
        );
        if (/grupo\s*eliminados/i.test(fallbackTitle)) return 'eliminado';
        if (/grupo\s*administrados/i.test(fallbackTitle)) return 'administrado';
      }
    }

    let foundGreen = false;
    let foundBlue = false;
    for (const tbodyId of [BH_TABLE_ID + '_scrollableTbody', BH_TABLE_ID + '_data']) {
      const tbody = doc.getElementById(tbodyId);
      if (!tbody) continue;
      tbody.querySelectorAll('tr[data-ri]').forEach(row => {
        const ri = row.getAttribute('data-ri');
        const base = `${BH_TABLE_ID}:${ri}:_colunaBH:${colIdx}`;
        const panel = doc.getElementById(`${base}:panelLimiteBh`);
        if (!panel) return;
        if (panel.querySelector('.scrollTable_selected_vivid_green')) foundGreen = true;
        if (panel.querySelector('.scrollTable_selected_sky_blue')) foundBlue = true;
      });
    }
    if (foundGreen && !foundBlue) return 'eliminado';
    if (foundBlue && !foundGreen) return 'administrado';
    return 'desconhecido';
  }

  function isColunaUrinariaBH(label, title) {
    const api = bhColumnsApi();
    if (api) return api.isColunaUrinariaBH(label, title);
    const n = norm((label || '') + ' ' + (title || ''));
    return /urina|urinou|sonda\s*vesical|cateter\s*vesical|elimin[aç][aã]o\s*urin|di[uú]rese|mic[cç][aã]o|bexiga|urostom|nefrostom|cistostom/i.test(n);
  }

  function isColunaOutrosBH(label, title) {
    const api = bhColumnsApi();
    if (api) return api.isColunaOutrosBH(label, title);
    const lbl = norm(label || '').replace(/\s/g, '');
    const n = norm((label || '') + ' ' + (title || ''));
    if (/^outros\.?$/.test(lbl)) return true;
    if (/^outrosd\d+$/.test(lbl)) return true;
    return /outros\s*drenos?/i.test(n);
  }

  function classificarColunaEliminacaoBH(label, title) {
    const api = bhColumnsApi();
    if (api && api.classificarColunaEliminacaoBH) {
      return api.classificarColunaEliminacaoBH(label, title);
    }
    if (isColunaUrinariaBH(label, title)) return 'urinario';
    return 'outro';
  }

  /** @returns {Array<{ idx, label, title, tipo, categoria?, urinaria }>} */
  function lerMapaColunasBH(doc) {
    const cols = [];
    const seen = new Set();
    const root = doc.getElementById(BH_TABLE_ID) || doc;
    root.querySelectorAll('th[id*=":_colunaBH:"]').forEach(th => {
      const idBase = th.id.replace('_clone', '');
      const m = idBase.match(/:_colunaBH:(\d+)$/);
      if (!m) return;
      const idx = parseInt(m[1], 10);
      if (seen.has(idx)) return;
      seen.add(idx);
      const sp = th.querySelector('span[style*="font-weight"]')
               || th.querySelector('span.ui-column-title span')
               || th.querySelector('span[title]');
      const label = (sp ? sp.textContent : th.textContent || '').replace(/[\s\xa0]+/g, ' ').trim();
      const titleEl = th.querySelector('span[title]') || sp;
      const title = titleEl && titleEl.getAttribute('title')
        ? titleEl.getAttribute('title').trim()
        : '';
      const tipo = resolveTipoColunaBH(detectarTipoColunaBH(doc, idx, title), label, title);
      const urinaria = tipo === 'eliminado' && isColunaUrinariaVolumeBH(label, title);
      const col = { idx, label, title, tipo, urinaria };
      if (tipo === 'eliminado') col.categoria = classificarColunaEliminacaoBH(label, title);
      cols.push(col);
    });
    cols.sort((a, b) => a.idx - b.idx);
    return cols;
  }

  function rotuloColunaBH(col) {
    let r = (col.label || '').trim();
    if (!r || /^[.\s]+$/.test(r)) r = (col.title || '').trim();
    return r || 'Coluna';
  }

  function lerRodapeBH(doc) {
    const bhTableEl = doc.getElementById(BH_TABLE_ID);
    if (!bhTableEl) return null;
    const container = bhTableEl.querySelector('.ui-datatable-scrollable-container');
    if (container) {
      const tr = container.querySelector('tfoot tr');
      if (tr) return tr;
    }
    const tfoots = bhTableEl.querySelectorAll('tfoot tr');
    for (let i = tfoots.length - 1; i >= 0; i--) {
      const spans = tfoots[i].querySelectorAll('span[title]');
      for (const sp of spans) {
        if (parseVolumeMl(sp.getAttribute('title') || sp.textContent)) return tfoots[i];
      }
    }
    return null;
  }

  function valorRodapeColunaBH(doc, colIdx, rodapeRow) {
    const row = rodapeRow !== undefined ? rodapeRow : lerRodapeBH(doc);
    if (!row) return null;

    const byId =
      row.querySelector(`[id*=":_colunaBH:${colIdx}:"] span[title]`) ||
      row.querySelector(`[id*=":_colunaBH:${colIdx}:"]`);
    if (byId) {
      const raw = byId.getAttribute('title') || byId.textContent || '';
      const ml = parseVolumeMl(raw.trim());
      if (ml !== null) return ml;
      const v = parseBR(raw.trim());
      if (v !== null && v > 0) return v;
    }

    const tds = row.querySelectorAll('td');
    const td = tds[colIdx];
    if (!td) return null;
    const span = td.querySelector('span[title]') || td.querySelector('span');
    const raw = span
      ? (span.getAttribute('title') || span.textContent || '')
      : (td.textContent || '');
    const ml = parseVolumeMl(raw.trim());
    if (ml !== null) return ml;
    const v = parseBR(raw.trim());
    return v !== null && v > 0 ? v : null;
  }


  function extrairHorarioFallbackRow(row) {
    if (!row) return '';
    const api = bhRowsApi();
    if (api) {
      const colIdx = null;
      return api.extrairHorarioTextoFromRow(row, colIdx);
    }
    for (const el of row.querySelectorAll('td, span')) {
      const t = (el.textContent || '').trim();
      if (pareceHorario(t)) return t;
    }
    return '';
  }

  function extrairHorarioRowBH(doc, row, ri, colHorarioIdx) {
    const rowsApi = bhRowsApi();
    if (rowsApi) {
      const h = rowsApi.extrairHorarioBh(doc, ri, colHorarioIdx, row, BH_TABLE_ID);
      if (h) return h;
    }
    const h = extrairHorarioLinha(doc, BH_TABLE_ID, row, ri, colHorarioIdx);
    if (h && pareceHorario(h)) return h;
    return extrairHorarioFallbackRow(row);
  }

  /** @param {{ windowStartMs?: number|null, windowApi?: object, colHorarioIdx?: number|null, tableId?: string }} [filter] */
  function linhaBhPassesFilter(doc, row, ri, filter) {
    const rowsApi = bhRowsApi();
    if (rowsApi && filter) {
      const f = { ...filter, tableId: filter.tableId || BH_TABLE_ID };
      return rowsApi.linhaBhPassesWindowFilter(doc, row, ri, f);
    }
    if (!filter || !filter.windowApi || !filter.windowApi.filterRegsInClinicalWindow) return true;
    const colHorarioIdx = filter.colHorarioIdx != null
      ? filter.colHorarioIdx
      : lerIndiceColunaHorarioBH(doc);
    const horario = extrairHorarioRowBH(doc, row, ri, colHorarioIdx);
    const matched = filter.windowApi.filterRegsInClinicalWindow(
      [{ ri: parseInt(ri, 10), horario }],
      filter.windowStartMs,
    );
    return matched.length > 0;
  }

  function lerIndiceColunaHorarioBH(doc) {
    const rowsApi = bhRowsApi();
    if (rowsApi) return rowsApi.lerIndiceColunaHorarioBH(doc, BH_TABLE_ID);
    return lerIndiceColunaHorario(doc, BH_TABLE_ID);
  }

  function somarTbodyColunaBH(doc, colIdx, filter) {
    for (const tbodyId of [BH_TABLE_ID + '_scrollableTbody', BH_TABLE_ID + '_data']) {
      const tbody = doc.getElementById(tbodyId);
      if (!tbody) continue;
      let soma = 0;
      let count = 0;
      tbody.querySelectorAll('tr[data-ri]').forEach(row => {
        const ri = row.getAttribute('data-ri');
        if (!linhaBhPassesFilter(doc, row, ri, filter)) return;
        const cell = parseCelulaBH(doc, row, ri, colIdx);
        if (cell.ml !== null && cell.ml > 0) { soma += cell.ml; count++; }
      });
      if (count > 0) return soma;
    }
    return null;
  }

  function valorColunaBH(doc, colIdx, filter) {
    if (!filter) {
      const rodape = valorRodapeColunaBH(doc, colIdx);
      if (rodape !== null) return rodape;
    }
    return somarTbodyColunaBH(doc, colIdx, filter);
  }

  function celulaBooleanPositiva(texto) {
    if (!texto) return false;
    return /^(sim|s|positivo|presente)$/i.test(String(texto).trim());
  }

  /** Texto de célula eliminada com conteúdo clínico (ex. "0 folley roxa"); ignora vazio/Sim/Não/só número. */
  function textoSignificativoBH(texto) {
    if (!texto) return false;
    const t = String(texto).trim();
    if (!t) return false;
    if (celulaBooleanPositiva(t)) return false;
    const lower = norm(t);
    if (/^(sim|n[aã]o|nao|s|n|positivo|negativo|presente|ausente)$/i.test(lower)) return false;
    if (/^[\d.,]+$/.test(t)) return false;
    return true;
  }

  function textoColunaEliminacaoBH(doc, colIdx, filter) {
    if (!filter) {
      const rodapeRow = lerRodapeBH(doc);
      if (rodapeRow) {
        const byId =
          rodapeRow.querySelector(`[id*=":_colunaBH:${colIdx}:"] span[title]`) ||
          rodapeRow.querySelector(`[id*=":_colunaBH:${colIdx}:"]`);
        if (byId) {
          const raw = (byId.getAttribute('title') || byId.textContent || '').trim();
          if (textoSignificativoBH(raw)) return raw;
        }
      }
    }

    const textos = [];
    for (const tbodyId of [BH_TABLE_ID + '_scrollableTbody', BH_TABLE_ID + '_data']) {
      const tbody = doc.getElementById(tbodyId);
      if (!tbody) continue;
      tbody.querySelectorAll('tr[data-ri]').forEach(row => {
        const ri = row.getAttribute('data-ri');
        if (!linhaBhPassesFilter(doc, row, ri, filter)) return;
        const cell = parseCelulaBH(doc, row, ri, colIdx);
        if (textoSignificativoBH(cell.texto)) textos.push(cell.texto.trim());
      });
      if (textos.length) break;
    }
    const uniq = [...new Set(textos)];
    return uniq.length ? uniq.join('; ') : '';
  }

  function extrairEliminacoesDetalhe(doc, colunasBH, filter) {
    if (!colunasBH || !colunasBH.length) return [];
    const itens = [];
    for (const col of colunasBH) {
      if (col.tipo !== 'eliminado') continue;
      if (col.urinaria || isColunaUrinariaVolumeBH(col.label, col.title)) continue;
      const ml = valorColunaBH(doc, col.idx, filter);
      const texto = textoColunaEliminacaoBH(doc, col.idx, filter);
      if (ml !== null && ml > 0) {
        itens.push({
          idx: col.idx,
          label: col.label,
          title: col.title,
          categoria: col.categoria || classificarColunaEliminacaoBH(col.label, col.title),
          ml,
          texto: texto || null,
        });
      } else if (textoSignificativoBH(texto)) {
        itens.push({
          idx: col.idx,
          label: col.label,
          title: col.title,
          categoria: col.categoria || classificarColunaEliminacaoBH(col.label, col.title),
          ml: 0,
          texto,
        });
      }
    }
    return itens.sort((a, b) => a.idx - b.idx);
  }

  function extrairDUFromBH(doc, colunasBH, filter) {
    const colunasUrinarias = (colunasBH || []).filter(
      c => isColunaUrinariaVolumeBH(c.label, c.title) ||
        (c.tipo === 'eliminado' && c.urinaria)
    );

    let duMl = null;
    let soma = 0;
    let temMl = false;
    for (const col of colunasUrinarias) {
      const ml = valorColunaBH(doc, col.idx, filter);
      if (ml !== null && ml > 0) { soma += ml; temMl = true; }
    }
    if (temMl) duMl = soma;

    let duPresente = false;
    if (!temMl) {
      outer:
      for (const col of colunasUrinarias) {
        for (const tbodyId of [BH_TABLE_ID + '_scrollableTbody', BH_TABLE_ID + '_data']) {
          const tbody = doc.getElementById(tbodyId);
          if (!tbody) continue;
          for (const row of tbody.querySelectorAll('tr[data-ri]')) {
            const ri = row.getAttribute('data-ri');
            if (!linhaBhPassesFilter(doc, row, ri, filter)) continue;
            const cell = parseCelulaBH(doc, row, ri, col.idx);
            if (celulaBooleanPositiva(cell.texto)) { duPresente = true; break outer; }
          }
        }
      }
    }

    return {
      ml: duMl,
      presente: duPresente,
      colunas: colunasUrinarias,
      temColunaUrinaria: colunasUrinarias.length > 0,
    };
  }

  /** Texto parece data/hora de registro (não confundir com valor numérico de sinal). */
  function pareceHorario(text) {
    if (!text) return false;
    const t = String(text).trim();
    if (!t || t.length > 48) return false;
    if (/^\d{1,3}([.,]\d+)?$/.test(t)) return false;
    if (/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(t) && /\d{1,2}:\d{2}/.test(t)) return true;
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(t)) return true;
    if (/\d{1,2}:\d{2}/.test(t) && !/mg\/dl|mmhg|irpm|bpm|ml\/h/i.test(t)) return true;
    return false;
  }

  /** Índice da coluna "Hora" no thead (fora do padrão _colunaM). */
  function lerIndiceColunaHorario(doc, table) {
    const tableEl = doc.getElementById(table);
    if (!tableEl) return null;
    const headerRow =
      tableEl.querySelector('thead tr') ||
      tableEl.querySelector('.ui-datatable-header tr');
    if (!headerRow) return null;
    const cells = headerRow.querySelectorAll('th, td');
    for (let i = 0; i < cells.length; i++) {
      const label = norm(cells[i].textContent);
      if (/^hora$|^hor[aá]rio$|^hor[aá]rios$|data\s*\/\s*hora|data\s*e\s*hora|registro/i.test(label))
        return i;
    }
    return null;
  }

  /**
   * Horário do registro na monitorização. O AGHU muda IDs JSF (ex.: j_idt240);
   * cascata de seletores + coluna "Hora" do cabeçalho + padrão no texto da linha.
   */
  function extrairHorarioLinha(doc, table, row, ri, colHorarioIdx) {
    const legacy =
      row.querySelector('[id$=":j_idt240"] span') ||
      row.querySelector('[id*=":j_idt240"]');
    if (legacy) {
      const t = (legacy.textContent || '').trim();
      if (pareceHorario(t)) return t;
    }

    const byId = doc.getElementById(`${table}:${ri}:j_idt240`);
    if (byId) {
      const t = (byId.textContent || '').trim();
      if (pareceHorario(t)) return t;
    }

    for (const el of row.querySelectorAll('[id*="hora" i], [id*="Horario" i], [id*="dataHora" i]')) {
      const t = (el.textContent || '').trim();
      if (pareceHorario(t)) return t;
    }

    if (colHorarioIdx != null) {
      const tds = row.querySelectorAll('td');
      const td = tds[colHorarioIdx];
      if (td) {
        const t = (td.textContent || '').trim();
        if (pareceHorario(t)) return t;
      }
    }

    const firstTd = row.querySelector('td');
    if (firstTd) {
      const t = (firstTd.textContent || '').trim();
      if (pareceHorario(t)) return t;
    }

    for (const sp of row.querySelectorAll('span')) {
      const t = (sp.textContent || '').trim();
      if (pareceHorario(t)) return t;
    }

    return '';
  }

  // ─── A. MONITORIZAÇÃO ─────────────────────────────────────────────────────

  function monitorColsApi() {
    return typeof AghuControlesMonitorColumns !== 'undefined'
      ? AghuControlesMonitorColumns
      : null;
  }

  function mergeTextoColunas(get, indices) {
    const api = monitorColsApi();
    const texts = api
      ? api.collectTextFromColumns(get, indices)
      : (indices && indices.length ? [get(indices[0])].filter(t => t && String(t).trim()) : []);
    if (!texts.length) return '';
    if (texts.some(t => celulaBooleanPositiva(t))) return 'sim';
    return texts[0];
  }

  function extrairMonitorizacao(doc) {
    const TABLE = 'tabelaVisualizacaoRegistrosM';
    const tbody = doc.getElementById(TABLE + '_data');
    if (!tbody) return null;
    const rows = tbody.querySelectorAll('tr[data-ri]');
    if (!rows.length) return null;

    const api = monitorColsApi();
    const mapa = lerMapaColunas(doc);
    const colHorarioIdx = lerIndiceColunaHorario(doc, TABLE);
    const IDX = api
      ? api.resolveMonitorColumnIndexes(mapa)
      : {
          fr: [1], spo2: [2], tax: [4], pas: [5], pad: [6], fc: [7],
          hgt: [11], noradren: [], fezes: [9], urina: [10], paCombined: [], pam: [],
        };

    const noradrenMapped = !!(mapa && IDX.noradren && IDX.noradren.length);

    const registros = [];
    rows.forEach(row => {
      const ri = row.getAttribute('data-ri');
      const get = (idx) => getCelula(doc, TABLE, row, ri, idx);

      const numField = (indices, parseFn, field) => {
        const parse = parseFn || parseBR;
        if (!api) {
          const raw = parse(get(indices && indices[0]));
          const sanitize =
            typeof AghuControlesVitalSanitize !== 'undefined'
              ? AghuControlesVitalSanitize
              : null;
          if (field && sanitize && sanitize.sanitizeMonitorVital) {
            return sanitize.sanitizeMonitorVital(field, raw);
          }
          return raw;
        }
        return api.normalizeScalarOrArray(
          api.collectNumericFromColumns(get, indices, parse, field)
        );
      };

      const pa = api
        ? api.mergePasPadFromRow(get, IDX, parseBR)
        : (() => {
            const sanitize =
              typeof AghuControlesVitalSanitize !== 'undefined'
                ? AghuControlesVitalSanitize
                : null;
            const fix = (f, v) =>
              sanitize && sanitize.sanitizeMonitorVital
                ? sanitize.sanitizeMonitorVital(f, v)
                : v;
            return {
              pas: fix('pas', parseBR(get(IDX.pas && IDX.pas[0]))),
              pad: fix('pad', parseBR(get(IDX.pad && IDX.pad[0]))),
            };
          })();

      registros.push({
        ri:       parseInt(ri, 10),
        horario:  extrairHorarioLinha(doc, TABLE, row, ri, colHorarioIdx),
        fr:       numField(IDX.fr, undefined, 'fr'),
        spo2:     numField(IDX.spo2, undefined, 'spo2'),
        tax:      numField(IDX.tax, undefined, 'tax'),
        pas:      pa.pas,
        pad:      pa.pad,
        pam:      numField(IDX.pam, undefined, 'pam'),
        fc:       numField(IDX.fc, undefined, 'fc'),
        hgt:      numField(IDX.hgt, undefined, 'hgt'),
        noradren: numField(IDX.noradren, api && api.parseNoradrenMl),
        pesoPre:  numField(IDX.pesoPre, api && api.parsePesoKg),
        pesoPos:  numField(IDX.pesoPos, api && api.parsePesoKg),
        uf:       numField(IDX.uf, api && api.parseUfMl),
        fezes:    mergeTextoColunas(get, IDX.fezes),
        urina:    mergeTextoColunas(get, IDX.urina),
      });
    });
    registros.sort((a, b) => a.ri - b.ri);
    return { registros, noradrenMapped };
  }

  /** Linhas da tabela BH com ri + horário (frozenTbody para horário, scrollable para volumes). */
  function extrairRegistrosBH(doc) {
    const colHorarioIdx = lerIndiceColunaHorarioBH(doc);
    const rowsApi = bhRowsApi();
    if (rowsApi) {
      return rowsApi.listBhDataRows(doc, BH_TABLE_ID).map((item) => ({
        ri: item.ri,
        horario: rowsApi.extrairHorarioBh(
          doc, item.ri, colHorarioIdx, item.row, BH_TABLE_ID,
        ),
      }));
    }

    const registros = [];
    const seenRi = new Set();
    for (const tbodyId of [BH_TABLE_ID + '_scrollableTbody', BH_TABLE_ID + '_data']) {
      const tbody = doc.getElementById(tbodyId);
      if (!tbody) continue;
      tbody.querySelectorAll('tr[data-ri]').forEach(row => {
        const ri = row.getAttribute('data-ri');
        if (!ri || seenRi.has(ri)) return;
        seenRi.add(ri);
        registros.push({
          ri: parseInt(ri, 10),
          horario: extrairHorarioRowBH(doc, row, ri, colHorarioIdx),
        });
      });
      if (registros.length) break;
    }
    registros.sort((a, b) => a.ri - b.ri);
    return registros;
  }

  /** Saldo BH da janela: administrado − eliminado (convenção do painel AGHU). */
  function calcularBhSaldoJanela(doc, colunasBH, filter) {
    if (!colunasBH || !colunasBH.length) return null;
    let somaAdmin = 0;
    let somaElim = 0;
    let temAdmin = false;
    let temElim = false;
    for (const col of colunasBH) {
      const ml = valorColunaBH(doc, col.idx, filter);
      if (ml === null || ml <= 0) continue;
      if (col.tipo === 'administrado') {
        somaAdmin += ml;
        temAdmin = true;
      } else if (col.tipo === 'eliminado') {
        somaElim += ml;
        temElim = true;
      }
    }
    if (!temAdmin && !temElim) return null;
    return somaAdmin - somaElim;
  }

  // ─── B. BALANÇO HÍDRICO ───────────────────────────────────────────────────
  // Lê diretamente do painel de texto de resumo (não depende de IDs instáveis)
  // Texto padrão: "Volume total administrado.: 0,00   Volume total eliminado.: 1.950,00   Resultado balanco Hídrico: -1.950,00"

  function extrairBH(doc) {
    let painelTexto = '';

    for (const el of doc.querySelectorAll('.ui-panel-content, [class*="panel-content"], div[id$="_content"]')) {
      if (/balanco/i.test(el.textContent)) {
        painelTexto = el.textContent;
        break;
      }
    }

    if (!painelTexto) {
      for (const el of doc.querySelectorAll('div')) {
        if (/Volume total eliminado/i.test(el.textContent) && /Resultado balanco/i.test(el.textContent)) {
          painelTexto = el.textContent;
          break;
        }
      }
    }

    let bhTotal = null;
    let elimTotalPainel = null;

    if (painelTexto) {
      const mBH = painelTexto.match(/Resultado balanco Hídrico[^-\d]*([-\d.,]+)/i);
      if (mBH) bhTotal = parseBR(mBH[1]);

      const mElim = painelTexto.match(/Volume total eliminado\.?\s*[.:]?\s*([\d.,]+)/i);
      if (mElim) elimTotalPainel = parseBR(mElim[1]);
    }

    const colunasBH = lerMapaColunasBH(doc);
    const du = extrairDUFromBH(doc, colunasBH);
    const eliminacoesDetalhe = extrairEliminacoesDetalhe(doc, colunasBH);

    if (elimTotalPainel !== null && eliminacoesDetalhe.length) {
      let somaDetalhe = eliminacoesDetalhe.reduce((s, e) => s + e.ml, 0);
      if (du.ml !== null && du.ml > 0) somaDetalhe += du.ml;
      if (Math.abs(somaDetalhe - elimTotalPainel) > 0.5) {
        // divergência soma colunas vs painel — não usar painel como DU
      }
    }

    return {
      eliminacoesDetalhe,
      du,
      elimTotalPainel,
      bh: bhTotal,
      colunasBH,
    };
  }

  function extrairBHForRiSet(doc, colunasBH, filter, usePainel) {
    let bhTotal = null;
    let elimTotalPainel = null;

    if (usePainel) {
      let painelTexto = '';
      for (const el of doc.querySelectorAll('.ui-panel-content, [class*="panel-content"], div[id$="_content"]')) {
        if (/balanco/i.test(el.textContent)) {
          painelTexto = el.textContent;
          break;
        }
      }
      if (!painelTexto) {
        for (const el of doc.querySelectorAll('div')) {
          if (/Volume total eliminado/i.test(el.textContent) && /Resultado balanco/i.test(el.textContent)) {
            painelTexto = el.textContent;
            break;
          }
        }
      }
      if (painelTexto) {
        const mBH = painelTexto.match(/Resultado balanco Hídrico[^-\d]*([-\d.,]+)/i);
        if (mBH) bhTotal = parseBR(mBH[1]);
        const mElim = painelTexto.match(/Volume total eliminado\.?\s*[.:]?\s*([\d.,]+)/i);
        if (mElim) elimTotalPainel = parseBR(mElim[1]);
      }
    }

    const cols = colunasBH || lerMapaColunasBH(doc);
    const du = extrairDUFromBH(doc, cols, filter);
    const eliminacoesDetalhe = extrairEliminacoesDetalhe(doc, cols, filter);

    if (filter && !usePainel) {
      bhTotal = calcularBhSaldoJanela(doc, cols, filter);
    }

    return {
      eliminacoesDetalhe,
      du,
      elimTotalPainel,
      bh: bhTotal,
      colunasBH: cols,
    };
  }

  function fmtMlResumo(val) {
    if (val === null || val === undefined) return null;
    return val >= 1000
      ? val.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
      : String(val);
  }

  // ─── C. FORMATAÇÃO CLÍNICA ────────────────────────────────────────────────

  function minMax(arr) {
    if (!arr.length) return null;
    return { min: Math.min(...arr), max: Math.max(...arr) };
  }

  function hhmm(h) {
    if (!h) return '';
    const m = String(h).match(/(\d{1,2}:\d{2})/);
    if (!m) return '';
    const parts = m[1].split(':');
    const hh = parts[0].padStart(2, '0');
    return `${hh}:${parts[1]}`;
  }

  function fmtValorComHorario(val, h, unidade) {
    const u = unidade ? ` ${unidade}` : '';
    return h ? `${val} (${h})${u}` : `${val}${u}`;
  }

  function formatarItemEliminacaoBH(item) {
    const rotulo = rotuloColunaBH(item);
    const isOutros = isColunaOutrosBH(item.label, item.title);

    if (isOutros) {
      const texto = item.texto ? String(item.texto).trim() : '';
      if (textoSignificativoBH(texto)) return `${rotulo} ${texto}`;
      if (item.ml !== null && item.ml > 0) return `${rotulo} ${fmtMlResumo(item.ml)} mL`;
      if (texto) return `${rotulo} ${texto}`;
      return null;
    }

    if (item.ml !== null && item.ml > 0) return `${rotulo} ${fmtMlResumo(item.ml)} mL`;
    if (item.texto) return `${rotulo} ${item.texto}`;
    return null;
  }

  function flattenCampoNumerico(regs, field) {
    const api = monitorColsApi();
    if (api) return api.flattenNumericField(regs, field);
    return regs.map(r => r[field]).filter(v => v !== null && v !== undefined);
  }

  function expandPaPtsLocal(regs) {
    const api = monitorColsApi();
    if (api) return api.expandPaPts(regs);
    return regs
      .map(r => ({ pas: r.pas, pad: r.pad }))
      .filter(p => p.pas !== null && p.pas !== undefined);
  }

  function expandTimedPaPtsLocal(regs) {
    const api = monitorColsApi();
    if (api && api.expandTimedPaPts) return api.expandTimedPaPts(regs, hhmm);
    return regs
      .map(r => ({ pas: r.pas, pad: r.pad, h: hhmm(r.horario) }))
      .filter(p => p.pas !== null && p.pas !== undefined);
  }

  function expandTimedPtsLocal(regs, field) {
    const api = monitorColsApi();
    if (api) return api.expandTimedPts(regs, field, hhmm);
    return regs
      .map(r => ({ val: r[field], h: hhmm(r.horario) }))
      .filter(p => p.val !== null && p.val !== undefined);
  }

  function formatarSaida(regs, bh, opts) {
    const partes = [];
    const noradrenMapped = opts && opts.noradrenMapped;

    const fcMM = minMax(flattenCampoNumerico(regs, 'fc'));
    if (fcMM) partes.push(fcMM.min === fcMM.max
      ? `FC ${fcMM.min} bpm` : `FC ${fcMM.min}-${fcMM.max} bpm`);

    const frMM = minMax(flattenCampoNumerico(regs, 'fr'));
    if (frMM) partes.push(frMM.min === frMM.max
      ? `FR ${frMM.min} irpm` : `FR ${frMM.min}-${frMM.max} irpm`);

    const spo2MM = minMax(flattenCampoNumerico(regs, 'spo2'));
    if (spo2MM) partes.push(spo2MM.min === spo2MM.max
      ? `SpO₂ ${spo2MM.min}%` : `SpO₂ ${spo2MM.min}-${spo2MM.max}%`);

    const taxPts = expandTimedPtsLocal(regs, 'tax');
    if (taxPts.length) {
      const tMin = Math.min(...taxPts.map(p => p.val));
      const tMax = Math.max(...taxPts.map(p => p.val));
      let s = tMin === tMax
        ? `TAX ${fmtBR(tMin,1)} ºC`
        : `TAX ${fmtBR(tMin,1)}-${fmtBR(tMax,1)} ºC`;
      const feb = taxPts.filter(p => p.val > 37.5);
      if (feb.length) s += ` [febre: ${feb.map(p => `${fmtBR(p.val,1)} ºC (${p.h})`).join(', ')}]`;
      partes.push(s);
    }

    const paPts = expandPaPtsLocal(regs);
    if (paPts.length) {
      const fmtPA = p => `${p.pas}${p.pad !== null && p.pad !== undefined ? '/'+p.pad : ''}`;
      // FEAT-304: extração persiste sempre sequência; minmax é só vista.
      const timed = expandTimedPaPtsLocal(regs);
      const temHorarios = timed.some(p => p.h);
      if (temHorarios) {
        partes.push(
          `PA ${timed.map(p => fmtValorComHorario(fmtPA(p), p.h)).join(', ')} mmHg`
        );
      } else {
        partes.push(`PA ${timed.map(p => fmtPA(p)).join(', ')} mmHg`);
      }
    }

    const pamMM = minMax(flattenCampoNumerico(regs, 'pam'));
    if (pamMM) partes.push(pamMM.min === pamMM.max
      ? `PAM ${pamMM.min} mmHg` : `PAM ${pamMM.min}-${pamMM.max} mmHg`);

    const apiCols = monitorColsApi();
    const pesoSeg = apiCols && apiCols.formatPesoSegment(regs);
    if (pesoSeg) partes.push(pesoSeg);

    const ufSeg = apiCols && apiCols.formatUfSegment(regs);
    if (ufSeg) partes.push(ufSeg);

    const hgtPts = expandTimedPtsLocal(regs, 'hgt');
    if (hgtPts.length) {
      // Havendo horário, lista-se a janela inteira — abaixo ou acima de 180.
      // O filtro `> 180` apagava hipoglicemia quando a mesma janela tinha um alto.
      const temHorarios = hgtPts.some(p => p.h);
      if (temHorarios) {
        partes.push(
          `HGT ${hgtPts.map(p => fmtValorComHorario(p.val, p.h)).join(', ')} mg/dL`
        );
      } else {
        const mm = minMax(hgtPts.map(p => p.val));
        if (mm) {
          partes.push(mm.min === mm.max ? `HGT ${mm.min} mg/dL` : `HGT ${mm.min}-${mm.max} mg/dL`);
        }
      }
    }

    const noraPts = expandTimedPtsLocal(regs, 'noradren');
    if (noradrenMapped && noraPts.length) {
      const ini = noraPts[0], fim = noraPts[noraPts.length - 1];
      partes.push(ini.val === fim.val
        ? `NORA ${fmtBR(ini.val,1)} mL/h`
        : `NORA ${fmtBR(ini.val,1)}->${fmtBR(fim.val,1)} mL/h`);
    }

    // Eliminações BH — DU só de colunas urinárias eliminadas; demais por rótulo AGHU
    const du = bh.du || { ml: null, presente: false, temColunaUrinaria: false };

    if (du.ml !== null && du.ml > 0) {
      partes.push(`DU ${fmtMlResumo(du.ml)} mL`);
    } else if (du.presente) {
      partes.push('DU presente');
    } else if (
      !du.temColunaUrinaria &&
      regs.map(r => r.urina).filter(v => v !== '').some(v => v.toLowerCase() === 'sim')
    ) {
      partes.push('DU presente');
    }

    if (bh.eliminacoesDetalhe && bh.eliminacoesDetalhe.length) {
      bh.eliminacoesDetalhe.forEach((item) => {
        const linha = formatarItemEliminacaoBH(item);
        if (linha) partes.push(linha);
      });
    }

    // Agregar só para decidir Evacuações — texto de cópia fica só com rótulos AGHU avulsos
    const pmApi = bhPassometroMapApi();
    let fezesAgregado = '';
    if (pmApi && bh.eliminacoesDetalhe && bh.eliminacoesDetalhe.length) {
      const agregado = pmApi.agregarEliminacoesPassometro(bh.eliminacoesDetalhe);
      fezesAgregado = agregado.fezes || '';
    }

    const fezesVals = regs.map(r => r.fezes).filter(v => v !== '');
    if (!fezesAgregado && fezesVals.length) {
      partes.push(`Evacuações ${fezesVals.some(v => v.toLowerCase() === 'sim') ? 'presente' : 'ausente'}`);
    }

    if (bh.bh !== null) {
      const bhFmt = Math.abs(bh.bh) >= 1000
        ? Math.round(bh.bh).toLocaleString('pt-BR')
        : String(Math.round(bh.bh));
      partes.push(`BH ${bh.bh > 0 ? '+' : ''}${bhFmt} mL`);
    }

    if (
      (!bh.eliminacoesDetalhe || !bh.eliminacoesDetalhe.length) &&
      bh.elimTotalPainel !== null &&
      bh.elimTotalPainel > 0
    ) {
      partes.push(`Eliminação total ${fmtMlResumo(bh.elimTotalPainel)} mL`);
    }

    if (!partes.length)
      return controlesTextoPlaceholder();

    return partes.join(' | ');
  }

  // ─── Paciente: lib/patient-dom-extract.js + fallback POL ───

  function normalizeProntuarioDigits(raw) {
    if (raw == null || raw === '') return '';
    const d = String(raw).replace(/\D/g, '');
    return d.replace(/^0+/, '') || d;
  }

  function primeiroNomeFromFull(fullName) {
    if (!fullName || String(fullName).trim() === '') return '';
    const parts = String(fullName).trim().split(/\s+/).filter(Boolean);
    return parts[0] || '';
  }

  function slugPrimeiroNome(s) {
    if (!s) return 'unknown';
    try {
      return String(s)
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '') || 'unknown';
    } catch (e) {
      return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'unknown';
    }
  }

  /** POL na casca: "22994453 - NOME" ou "22994453-NOME" (#pacientePol). */
  function parsePolProntuarioNomeLine(raw) {
    if (!raw) return null;
    const t = String(raw).replace(/\s+/g, ' ').trim();
    const m = t.match(/^(\d{5,})\s*[-–—]\s*(.+)$/);
    if (!m) return null;
    const nomeCompleto = m[2].trim().replace(/\s{2,}/g, ' ');
    if (nomeCompleto.length < 2 || !/[A-Za-zÀ-ÿ]/.test(nomeCompleto)) return null;
    return {
      prontuario: normalizeProntuarioDigits(m[1]),
      nomeCompleto,
    };
  }

  function extractPolPatientFromCascaDom() {
    if (
      typeof AghuPatientDomExtract !== "undefined" &&
      AghuPatientDomExtract.extractPolPatientFromCascaDom
    ) {
      return AghuPatientDomExtract.extractPolPatientFromCascaDom(document);
    }
    const polDlg = document.querySelector('#pacientePol .ui-dialog-content');
    if (polDlg) {
      const rawDlg = (polDlg.textContent || polDlg.innerText || '').trim();
      const parsed = parsePolProntuarioNomeLine(rawDlg);
      if (parsed && parsed.prontuario && parsed.nomeCompleto) return parsed;
    }
    const h3 =
      document.querySelector('h3.accordion-tab-pol.ui-state-active') ||
      (document.querySelectorAll('h3.accordion-tab-pol').length === 1
        ? document.querySelector('h3.accordion-tab-pol')
        : null);
    if (h3) {
      const txt = (h3.textContent || h3.innerText || '').replace(/\s+/g, ' ').trim();
      let parsed = parsePolProntuarioNomeLine(txt);
      if (!parsed) {
        const title = (h3.getAttribute('title') || '').trim();
        const numMatch = txt.match(/(\d{5,})/);
        if (title && numMatch && /[A-Za-zÀ-ÿ]/.test(title)) {
          parsed = {
            prontuario: normalizeProntuarioDigits(numMatch[1]),
            nomeCompleto: title.replace(/\s{2,}/g, ' '),
          };
        }
      }
      if (parsed && parsed.prontuario && parsed.nomeCompleto) return parsed;
    }
    return null;
  }

  function isPolPatientHeaderVisible() {
    const h3 =
      (typeof AghuPatientDomExtract !== "undefined" &&
      AghuPatientDomExtract.getActivePolAccordionH3
        ? AghuPatientDomExtract.getActivePolAccordionH3(document)
        : null) ||
      document.querySelector('h3.accordion-tab-pol.ui-state-active') ||
      document.querySelector('h3.accordion-tab-pol');
    if (!h3) return false;
    const s = window.getComputedStyle(h3);
    if (s.display === 'none' || s.visibility === 'hidden') return false;
    const r = h3.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function parsePolPatientLooseFromBlob(blob) {
    const m = String(blob).match(/\b(\d{5,})\s*[-–—]\s*([A-Za-zÀ-ÿ][^\n\r]{1,240})/);
    if (!m) return null;
    const nomeCompleto = m[2].trim().replace(/\s{2,}/g, ' ');
    if (nomeCompleto.length < 2) return null;
    return {
      prontuario: normalizeProntuarioDigits(m[1]),
      nomeCompleto,
    };
  }

  function mergePatientFromPolAccordion(blob, nomeCompleto, prontRaw) {
    const dom = extractPolPatientFromCascaDom();
    if (dom && dom.prontuario && dom.nomeCompleto && isPolPatientHeaderVisible()) {
      return { nomeCompleto: dom.nomeCompleto, prontRaw: dom.prontuario };
    }
    let nome = nomeCompleto || '';
    let pront = prontRaw || '';
    if (dom) {
      if (!nome) nome = dom.nomeCompleto;
      if (!pront) pront = dom.prontuario;
    }
    if (!nome || !pront) {
      for (const line of String(blob).split(/\n/)) {
        const parsed = parsePolProntuarioNomeLine(line);
        if (!parsed || !parsed.prontuario || !parsed.nomeCompleto) continue;
        if (!nome) nome = parsed.nomeCompleto;
        if (!pront) pront = parsed.prontuario;
        if (nome && pront) break;
      }
    }
    if (!nome || !pront) {
      const loose = parsePolPatientLooseFromBlob(blob);
      if (loose) {
        if (!nome) nome = loose.nomeCompleto;
        if (!pront) pront = loose.prontuario;
      }
    }
    return { nomeCompleto: nome, prontRaw: pront };
  }

  function extractPatientFromPage() {
    const domApi =
      typeof AghuPatientDomExtract !== "undefined" ? AghuPatientDomExtract : null;
    const docControles = encontrarDocControles();
    const rootDoc = docControles || document;
    const domHints = domApi
      ? domApi.aggregateDomPatientHints(rootDoc)
      : { nomeCompleto: "", prontRaw: "", leito: "" };
    const blob = domApi
      ? domApi.buildPatientInnerTextBlob(rootDoc)
      : (rootDoc.body
          ? rootDoc.body.innerText || rootDoc.body.textContent || ""
          : "");

    let nomeCompleto = "";
    let prontRaw = "";
    let leito = domHints.leito || "";
    if (domApi) {
      const parsed = domApi.parsePatientLabelsFromBlob(blob, domHints);
      nomeCompleto = parsed.nomeCompleto;
      prontRaw = parsed.prontRaw;
      if (!leito) leito = domApi.parseLeitoFromBlob(blob);
    } else if (blob) {
      const mPac = blob.match(/Paciente\s*:\s*([^\n\r]+)/i);
      const mNome = blob.match(/Nome\s*(?:do\s*paciente)?\s*:\s*([^\n\r]+)/i);
      if (mPac) nomeCompleto = mPac[1].trim();
      else if (mNome) nomeCompleto = mNome[1].trim();
      const mPr =
        blob.match(/Prontu[aá]rio\s*:?\s*([\d.\/\-\s]+)/i) ||
        blob.match(/N[º°]\s*(?:do\s*)?(?:Prontu[aá]rio|Pront\.)\s*:?\s*([\d.\/\-\s]+)/i);
      if (mPr) prontRaw = mPr[1];
    }

    const polMerged = mergePatientFromPolAccordion(blob, nomeCompleto, prontRaw);
    nomeCompleto = polMerged.nomeCompleto || nomeCompleto;
    prontRaw = polMerged.prontRaw || prontRaw;

    nomeCompleto = (nomeCompleto || '').replace(/\s{2,}/g, ' ');
    nomeCompleto = nomeCompleto.replace(/^\d+\s*[-–—]\s*/, '');

    const prontuario = normalizeProntuarioDigits(prontRaw);
    const primeiroNome = primeiroNomeFromFull(nomeCompleto);
    const missing = [];
    if (!nomeCompleto) missing.push('nome do paciente');
    if (!prontuario) missing.push('prontuário');

    const patientKey =
      prontuario && typeof AghuPatientIdentity !== "undefined"
        ? AghuPatientIdentity.buildPatientKey(prontuario)
        : prontuario || null;

    return {
      ok: missing.length === 0,
      missing,
      nomeCompleto,
      primeiroNome,
      prontuario,
      patientKey,
      ...(leito ? { leito } : {}),
    };
  }

  // ─── D. Ponto de entrada ──────────────────────────────────────────────────

  function applyExtracaoQualityGate(result) {
    if (!result || !result.ok || !Array.isArray(result.entries) || !result.entries.length) {
      return result;
    }
    const respApi = extractResponseApi();
    if (!respApi || !respApi.classifyControlesEntries) return result;

    const quality = respApi.classifyControlesEntries(result.entries);
    if (quality.allPlaceholder) {
      return {
        ok: false,
        erro:
          'Registros encontrados na tabela, mas nenhum valor numérico foi lido. ' +
          'Confirme que a sub-aba Monitorização está visível e recarregue a extensão.',
        patient: result.patient || null,
        entries: result.entries,
        degraded: true,
      };
    }

    const warnings = Array.isArray(result.warnings) ? result.warnings.slice() : [];
    if (quality.somePlaceholder) {
      warnings.push(
        `${quality.placeholderCount} janela(s) sem valores legíveis — verifique scroll/carga da Monitorização.`,
      );
    }
    return warnings.length ? { ...result, warnings } : result;
  }

  function executar(msg) {
    const patient = extractPatientFromPage();
    const doc = encontrarDocControles();
    if (!doc) return {
      ok: false,
      erro: 'Tabela de monitorização não encontrada. Certifique-se de estar na página de Controles do Paciente com a aba "Monitorização" visível.',
      patient,
    };

    const extracted = extrairMonitorizacao(doc);
    if (!extracted || !extracted.registros || !extracted.registros.length) return {
      ok: false,
      erro: 'Nenhum registro encontrado na tabela de monitorização.',
      patient,
    };

    const regs = extracted.registros;
    const fmtOpts = { noradrenMapped: extracted.noradrenMapped };
    const windowApi =
      typeof AghuControlesWindow !== 'undefined' ? AghuControlesWindow : null;

    if (!windowApi || !windowApi.groupRegistrosByClinicalWindow) {
      const bh = extrairBH(doc);
      const horarios = regs.map(r => r.horario).filter(Boolean);
      const periodo = horarios.length >= 2
        ? `${horarios[0]} → ${horarios[horarios.length - 1]}`
        : horarios[0] || '—';
      return applyExtracaoQualityGate({
        ok: true,
        entries: [{
          texto: formatarSaida(regs, bh, fmtOpts),
          periodo,
          n: regs.length,
        }],
        texto: formatarSaida(regs, bh, fmtOpts),
        n: regs.length,
        periodo,
        windowCount: 1,
        patient,
      });
    }

    const colunasBH = lerMapaColunasBH(doc);
    const colHorarioIdxBH = lerIndiceColunaHorarioBH(doc);
    const groups = windowApi.groupRegistrosByClinicalWindow(regs);
    const multiWindow = groups.length > 1;
    const warnings = [];

    if (multiWindow && !colunasBH.length) {
      warnings.push(
        'Tabela de balanço hídrico não encontrada no DOM — abra a aba Balanço Hídrico antes de extrair.',
      );
    }

    const entries = groups.map((g) => {
      const bhFilter = multiWindow
        ? {
            windowStartMs: g.windowStartMs,
            windowApi,
            colHorarioIdx: colHorarioIdxBH,
            tableId: BH_TABLE_ID,
          }
        : null;
      const bh = multiWindow
        ? extrairBHForRiSet(doc, colunasBH, bhFilter, false)
        : extrairBH(doc);
      return {
        periodo: g.periodo,
        n: g.registros.length,
        texto: formatarSaida(g.registros, bh, fmtOpts),
      };
    });

    if (groups.some((g) => g.periodo === windowApi.PERIODO_SEM_HORARIO)) {
      warnings.push('Alguns registros sem horário parseável foram agrupados à parte.');
    }

    const texto = multiWindow
      ? entries.map((e) => `${e.periodo}\n${e.texto}`).join('\n\n---\n\n')
      : entries[0].texto;
    const periodo = entries.length === 1
      ? entries[0].periodo
      : `${entries.length} janelas (07h)`;

    return applyExtracaoQualityGate({
      ok: true,
      entries,
      texto,
      n: regs.length,
      periodo,
      windowCount: entries.length,
      patient,
      ...(warnings.length ? { warnings } : {}),
    });
  }

  // ─── Listener ─────────────────────────────────────────────────────────────
  browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action !== 'extrairControles') return false;
    const safe =
      typeof AghuControlesExtractResponse !== 'undefined'
        ? AghuControlesExtractResponse.safeExtrairControlesResult
        : function (fn) {
            try {
              return fn();
            } catch (_e) {
              return { ok: false, erro: 'Erro interno na extração.', patient: null };
            }
          };
    sendResponse(safe(function () { return executar(msg); }));
    return false;
  });

})();

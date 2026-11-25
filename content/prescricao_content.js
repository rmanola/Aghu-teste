// prescricao_content.js
// Extrai prescrição médica AGHU (manterPrescricaoMedica.xhtml | selecionarPrescricaoConsultar.xhtml)
"use strict";

(function () {

  const SECOES = /^(DIETA|MEDICAMENTOS|SOLU[cç][oõ]ES|CUIDADOS|CONSULTORIAS|PROCEDIMENTOS|HEMODERIVADOS|NUTRI[cç][aã]O|MATERIAIS)$/i;
  /** Dietas típicas na grelha consultar (sem ícone icon-dieta).
   * `jejum` não casa após «em » (instrução de fármaco: «administrar em jejum»). */
  const RE_DIETA_CONSULTAR =
    /(?:^|\b)(?:oral\s*zero|dieta\b|(?<!em\s)jejum|enteral|parenteral|laxant[ea]|branda|pastosa|l[ií]quida|hiposs[oó]dica|hipoproteica|diab[eé]tica|livre|normal(?!\s+\d)|zero\s+oral)(?:\b|$)/i;

  /** Linha parece medicamento (antes de classificar como dieta no Consultar). */
  const RE_MARCA_MEDICAMENTO =
    /\badministrar\b|\bc[aá]psulas?\b|\bcomprimidos?\b|\bampolas?\b|(?:\bvo\b|\bev\b).{0,40}\d|\d\s*mg\b/i;

  function nomePrincipalParaCatalogo(descricao) {
    let t = (descricao || '').trim();
    t = t.replace(/^\d+\s*[-–—]\s*/, '');
    const idx = t.search(/\badministrar\b/i);
    if (idx >= 0) t = t.slice(0, idx);
    t = t.replace(/\bdiluir\s+em\b.*$/i, '').trim();
    const primeiro = t.split(/\s*-\s*/)[0].trim();
    return primeiro || t;
  }

  function pareceMedicamentoConsultar(descricao) {
    const raw = descricao || '';
    if (RE_MARCA_MEDICAMENTO.test(raw)) return true;
    const catalog =
      typeof AghuReceitaMedicationCatalog !== 'undefined'
        ? AghuReceitaMedicationCatalog
        : null;
    if (catalog && typeof catalog.resolveClassForDrugName === 'function') {
      const resolved = catalog.resolveClassForDrugName(
        nomePrincipalParaCatalogo(raw)
      );
      if (resolved && resolved.catalogKey) return true;
    }
    return false;
  }

  function norm(s) {
    return (s || '').toLowerCase().replace(/[\s\xa0]+/g, ' ').trim();
  }

  function situacaoEcfAtiva(texto) {
    const t = (texto || '').trim().toLowerCase();
    return t === 'prescrito';
  }

  function isSuspenso(texto) {
    return (texto || '').trim().toLowerCase() === 'suspenso';
  }

  // ─── Documento da prescrição ───────────────────────────────────────────────

  function hasTabelaManter(doc) {
    if (!doc) return false;
    if (doc.getElementById('tabelaPrescricoes')) return true;
    if (doc.querySelector('tbody[id$="tabelaPrescricoes:resultList_data"]')) return true;
    return false;
  }

  function hasListaConsultar(doc) {
    if (!doc) return false;
    if (doc.querySelector('tbody[id*="listaItensPrescricaoMedica"][id$="_data"]')) return true;
    if (doc.querySelector('[id*="listaItensPrescricaoMedica"] tbody')) return true;
    if (doc.querySelector('tbody[id*="listaPrescricoesMedicas"][id$="_data"]')) return true;
    return false;
  }

  /** @returns {{ doc: Document, mode: 'manter'|'consultar' } | null} */
  function encontrarDocPrescricao() {
    function classify(doc) {
      if (!doc) return null;
      if (hasTabelaManter(doc)) return { doc, mode: 'manter' };
      if (hasListaConsultar(doc)) return { doc, mode: 'consultar' };
      return null;
    }
    const local = classify(document);
    if (local) return local;
    for (const iframe of document.querySelectorAll('iframe')) {
      try {
        const idoc = iframe.contentDocument || iframe.contentWindow.document;
        const found = classify(idoc);
        if (found) return found;
      } catch (e) {}
    }
    return null;
  }

  function inputVal(doc, partialId) {
    const el =
      doc.querySelector(`input[id*="${partialId}"][id$="inputId"]`) ||
      doc.querySelector(`input[id*="${partialId}"]`);
    return el && el.value ? String(el.value).trim() : '';
  }

  function lerCabecalho(doc) {
    const validadeInicial = inputVal(doc, 'dataValidadeInicial');
    const validadeFinal = inputVal(doc, 'dataValidadeFinal');
    const prontuario = inputVal(doc, 'prontuarioPaciente');
    const nome = inputVal(doc, 'nomePaciente');
    let data = '';
    if (validadeInicial && validadeFinal) {
      data = `${validadeInicial} → ${validadeFinal}`;
    } else if (validadeInicial) {
      data = validadeInicial;
    } else if (validadeFinal) {
      data = validadeFinal;
    }
    return { validadeInicial, validadeFinal, data, prontuario, nome };
  }

  function getTbodyPrescricao(doc) {
    return (
      doc.querySelector('tbody[id$="tabelaPrescricoes:resultList_data"]') ||
      doc.querySelector('#tabelaPrescricoes\\:resultList_data') ||
      (doc.getElementById('tabelaPrescricoes') &&
        doc.getElementById('tabelaPrescricoes').querySelector('tbody'))
    );
  }

  function detectarColunaEcf(doc) {
    const thead = doc.querySelector('thead[id*="tabelaPrescricoes"]') ||
      doc.querySelector('#tabelaPrescricoes thead') ||
      doc.querySelector('[id*="tabelaPrescricoes"] thead');
    if (thead) {
      const headers = thead.querySelectorAll('th');
      if (headers.length >= 3) return true;
    }
    const tbody = getTbodyPrescricao(doc);
    if (!tbody) return false;
    let maxCells = 0;
    tbody.querySelectorAll('tr[data-ri]').forEach((tr) => {
      const n = tr.cells ? tr.cells.length : 0;
      if (n > maxCells) maxCells = n;
    });
    return maxCells >= 3;
  }

  function limparDescricao(raw) {
    let t = (raw || '').replace(/\s+/g, ' ').trim();
    t = t.replace(/^\d+\s*[-–—]\s*/, '');
    t = t.replace(/^(?:Obs\.?\s*:?\s*)+/i, '');
    return t.trim();
  }

  const RE_MASSA =
    /(\d+(?:[.,]\d+)?)\s*(mg|mcg|µg|ug|g)(?![a-zà-ú])/gi;

  function stripHtml(html) {
    return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function stripRuídoPrescricao(texto) {
    let t = (texto || '').trim();
    t = t.replace(/\s*;\s*(?:Diluir|diluir)\s+em\b[^;]*/gi, '');
    t = t.replace(/\s*;\s*Correr\s+em\b[^;]*/gi, '');
    t = t.replace(/\s+-\s+(?:Diluir|diluir)\s+em\b.*/i, '');
    t = t.replace(/\s*,?\s*Obs\.?\s*:.*$/i, '');
    t = t.replace(/\s+-\s+Obs\.?\s*:.*$/i, '');
    return t.trim();
  }

  function formatDosePtBR(dose) {
    if (!dose) return '';
    const { valor, unidade } = dose;
    const u = unidade === 'g' ? 'g' : 'mg';
    if (Math.abs(valor - Math.round(valor)) < 1e-6) {
      return `${Math.round(valor)} ${u}`;
    }
    const s = valor.toFixed(4).replace(/\.?0+$/, '').replace('.', ',');
    return `${s} ${u}`;
  }

  /** Extrai dose em g ou mg; ignora concentração mg/mL; calcula total em bolsas. */
  function extrairDoseMassa(texto) {
    if (!texto) return null;
    const text = texto;

    const mFA = text.match(/(?:F\/A|FA)\s*(\d+(?:[.,]\d+)?)\s*(g|mg)\b/i);
    if (mFA) {
      const val = parseFloat(String(mFA[1]).replace(',', '.'));
      if (!Number.isNaN(val) && val > 0) {
        return { valor: val, unidade: mFA[2].toLowerCase() };
      }
    }

    const mBolsa = text.match(
      /bolsa\s*(\d+)\s*mL[^]*?(\d+(?:[.,]\d+)?)\s*mg\/mL/i
    );
    if (mBolsa) {
      const vol = parseFloat(mBolsa[1]);
      const conc = parseFloat(String(mBolsa[2]).replace(',', '.'));
      if (!Number.isNaN(vol) && !Number.isNaN(conc) && vol > 0 && conc > 0) {
        const totalMg = vol * conc;
        if (totalMg >= 1000) {
          return { valor: totalMg / 1000, unidade: 'g' };
        }
        return { valor: totalMg, unidade: 'mg' };
      }
    }

    const reDose = /(\d+(?:[.,]\d+)?)\s*(g|mg)\b/gi;
    let m;
    while ((m = reDose.exec(text)) !== null) {
      const before = text[m.index - 1];
      if (before === '/') continue;
      const after = text.slice(m.index + m[0].length);
      if (/^\/\s*mL/i.test(after)) continue;
      const val = parseFloat(String(m[1]).replace(',', '.'));
      if (!Number.isNaN(val) && val > 0) {
        return { valor: val, unidade: m[2].toLowerCase() };
      }
    }
    return null;
  }

  function extrairVolumeApresentacao(texto) {
    if (!texto) return '';
    const m = texto.match(/fr\s*(\d+)\s*mL/i);
    if (m) return `fr ${m[1]}mL`;
    const m2 = texto.match(/\b(\d+)\s*mL\b/i);
    if (m2) return `${m2[1]}mL`;
    return '';
  }

  function normalizarDiaAdm(raw) {
    const t = (raw || '').trim().replace(/[;.\s]+$/, '');
    let m = t.match(/^D?(\d+)\/(\d+)$/i);
    if (m) return `D${m[1]}/${m[2]}`;
    m = t.match(/^D?(\d+)$/i);
    if (m) return `D${m[1]}`;
    return '';
  }

  function extrairDiaAdm(posologia) {
    if (!posologia) return '';
    const mLabel = posologia.match(/Dia de Administra[cç][aã]o:\s*([^;]+)/i);
    if (mLabel) {
      const normDia = normalizarDiaAdm(mLabel[1]);
      if (normDia) return normDia;
    }
    const mInlineD = posologia.match(/\b(D\d+\/\d+)\b/i);
    if (mInlineD) {
      const normDia = normalizarDiaAdm(mInlineD[1]);
      if (normDia) return normDia;
    }
    const mSlash = posologia.match(/\b(\d+\/\d+)(?!\s*(?:horas?|h)\b)/i);
    if (mSlash) {
      const normDia = normalizarDiaAdm(mSlash[1]);
      if (normDia) return normDia;
    }
    const mSolo = posologia.match(/\b(D\d+)\b/i);
    if (mSolo) return mSolo[1].toUpperCase();
    return '';
  }

  function parseCamposAghu(texto) {
    const t = stripRuídoPrescricao(texto);
    if (!t || !/Administrar/i.test(t)) return null;

    let nome = '';
    let apresentacao = '';
    let posologia = '';

    const adminIdx = t.search(/\s+-\s+Administrar/i);
    if (adminIdx >= 0) {
      const antesAdmin = t.slice(0, adminIdx).trim();
      posologia = t.slice(adminIdx).trim();
      const parts = antesAdmin.split(/\s+-\s+/);
      nome = (parts[0] || '').trim();
      if (parts.length > 1) {
        apresentacao = parts.slice(1).join(' - ').trim();
      }
    } else {
      const adminPos = t.search(/Administrar/i);
      if (adminPos < 0) return null;
      const antes = t.slice(0, adminPos).trim();
      posologia = t.slice(adminPos).trim();
      const parts = antes.split(/\s+-\s+/);
      nome = (parts[0] || '').trim();
      if (parts.length > 1) apresentacao = parts.slice(1).join(' - ').trim();
    }

    let qtd = '';
    let qtdUn = '';
    const mQtd = posologia.match(
      /Administrar\s+(\d+)\s*(FRA|FRAS?|FR|BSA|AMP|CP|COMPR?|CAPS?)\b/i
    );
    if (mQtd) {
      qtd = mQtd[1];
      qtdUn = mQtd[2].toUpperCase();
      if (/^FRAS$/i.test(qtdUn) || qtdUn === 'FR') qtdUn = 'FR';
    }

    let via = '';
    const mVia = posologia.match(/\b(EV|IV|IM|VO|SL|SC|INH|TOP|RET)\b/i);
    if (mVia) via = mVia[1].toUpperCase();

    let intervalo = '';
    const mInt = posologia.match(/de\s+(\d+\/\d+\s*horas?)/i);
    if (mInt) {
      intervalo = mInt[1].replace(/\s+/g, ' ').trim();
      if (!/horas?$/i.test(intervalo)) intervalo += ' horas';
    } else {
      const mInt2 = posologia.match(/(\d+\/\d+\s*h(?:oras?)?)/i);
      if (mInt2) intervalo = mInt2[1];
    }

    const diaAdm = extrairDiaAdm(posologia);

    const criterioMedico = /a\s+crit[eé]rio\s+m[eé]dico/i.test(posologia);

    const volume = extrairVolumeApresentacao(apresentacao || nome);
    const dose = extrairDoseMassa(apresentacao);

    return { nome, apresentacao, volume, dose, qtd, qtdUn, via, intervalo, criterioMedico, diaAdm };
  }

  function formatarResumoMed(campos) {
    const partes = [campos.nome];
    if (campos.dose) partes.push(formatDosePtBR(campos.dose));
    let resumo = partes.join(' ');

    const detalhes = [];
    if (campos.qtd && campos.qtdUn) detalhes.push(`${campos.qtd} ${campos.qtdUn}`);
    if (campos.via) detalhes.push(campos.via);
    if (campos.intervalo) detalhes.push(campos.intervalo);
    if (campos.criterioMedico) detalhes.push('a critério médico');

    if (detalhes.length) resumo += ' - ' + detalhes.join(' ');
    if (campos.diaAdm) resumo += `; ${campos.diaAdm};`;
    else if (detalhes.length) resumo += ';';

    return resumo.trim();
  }

  function formatarResumoHv(campos) {
    let nomeComVol = campos.nome;
    if (campos.volume) {
      nomeComVol += ' ' + campos.volume;
    } else if (campos.apresentacao) {
      const vol = extrairVolumeApresentacao(campos.apresentacao);
      if (vol) nomeComVol += ' ' + vol;
    }

    const detalhes = [];
    if (campos.qtd && campos.qtdUn) detalhes.push(`${campos.qtd} ${campos.qtdUn}`);
    if (campos.via) detalhes.push(campos.via);
    if (campos.intervalo) detalhes.push(campos.intervalo);
    if (campos.criterioMedico) detalhes.push('a critério médico');

    let resumo = nomeComVol;
    if (detalhes.length) resumo += ' - ' + detalhes.join(' ');
    return (resumo + ';').trim();
  }

  function nomeEMRestoMedicamento(texto) {
    const rest = texto.trim();
    const match = rest.match(
      /^([A-Za-zÀ-ú][A-Za-zÀ-ú0-9\s\-+/()]+?)(?=\s+\d|\s+(?:EV|IV|IM|VO|SL|SC|INH|TOP|RET)\b)/i
    );
    if (match) {
      return { nome: match[1].trim(), resto: rest.slice(match[0].length).trim() };
    }
    const parts = rest.split(/\s+/);
    const nome = parts[0] || '';
    return { nome, resto: parts.slice(1).join(' ') };
  }

  /** Medicação resumida: parser AGHU ou fallback para formato simples. */
  function resumirMedicamento(descricao, htmlExtra, opts) {
    const isHidratacao = opts && opts.isHidratacao;
    let raw = limparDescricao(descricao);
    if (!raw) return '';
    if (/^diluir\s+em\b/i.test(raw)) return '';

    const t = stripRuídoPrescricao(raw);
    const campos = parseCamposAghu(t);
    if (campos) {
      return isHidratacao ? formatarResumoHv(campos) : formatarResumoMed(campos);
    }

    const dose =
      extrairDoseMassa(t) ||
      extrairDoseMassa(raw) ||
      (htmlExtra ? extrairDoseMassa(stripHtml(htmlExtra)) : null);

    if (dose) {
      const { nome, resto } = nomeEMRestoMedicamento(t);
      if (nome) {
        const doseStr = formatDosePtBR(dose);
        const posologia = resto.replace(RE_MASSA, '').replace(/\s+/g, ' ').trim();
        return posologia ? `${nome} ${doseStr} ${posologia}` : `${nome} ${doseStr}`;
      }
    }

    let resumo = t.trim();
    const diaAdm = extrairDiaAdm(t);
    if (diaAdm) {
      resumo = resumo.replace(/\s*;\s*Dia de Administra[cç][aã]o:\s*[^;]+/gi, '').trim();
      resumo = resumo.replace(/\bDia de Administra[cç][aã]o:\s*[^;]+;?\s*/gi, '').trim();
      resumo += `; ${diaAdm};`;
    }
    return resumo;
  }

  function detectarTipoLinha(tr, descricao) {
    const html = tr.innerHTML || '';
    if (/icon-dieta/i.test(html)) return 'dieta';
    if (/icon-medicamento|icon-solucao/i.test(html)) return 'medicamento';
    const d = norm(descricao);
    if (SECOES.test(d)) return 'secao';
    return 'outro';
  }

  function isSecaoHeader(tr, descricao) {
    const d = norm(descricao);
    if (SECOES.test(d)) return true;
    const bold = tr.querySelector('b, strong, span[style*="font-weight"]');
    if (bold && SECOES.test(norm(bold.textContent))) return true;
    return false;
  }

  function parseLinhasPrescricao(doc, temEcf) {
    const tbody = getTbodyPrescricao(doc);
    if (!tbody) return { linhas: [], stats: { totalLinhas: 0, incluidas: 0, omitidasSuspenso: 0 }, avisoEcf: null };

    const linhas = [];
    let totalLinhas = 0;
    let incluidas = 0;
    let omitidasSuspenso = 0;

    tbody.querySelectorAll('tr[data-ri]').forEach((tr) => {
      const cells = tr.cells;
      if (!cells || cells.length < 2) return;

      const descricaoRaw = (cells[1].textContent || '').trim();
      if (!descricaoRaw) return;
      if (isSecaoHeader(tr, descricaoRaw)) return;

      totalLinhas++;

      let situacaoEcf = '';
      if (temEcf) {
        if (cells.length < 3) return;
        situacaoEcf = (cells[2].textContent || '').trim();
        if (isSuspenso(situacaoEcf)) {
          omitidasSuspenso++;
          return;
        }
        if (!situacaoEcfAtiva(situacaoEcf)) return;
      }

      const descricao = limparDescricao(descricaoRaw);
      if (!descricao) return;

      const tipo = detectarTipoLinha(tr, descricao);
      if (tipo === 'secao' || tipo === 'outro') return;

      incluidas++;
      linhas.push({
        tipo,
        descricao,
        descricaoHtml: cells[1].innerHTML || '',
        situacaoEcf,
      });
    });

    const avisoEcf = temEcf
      ? null
      : 'Coluna SITUAÇÃO ECF não encontrada — todos os itens foram considerados (sem filtro Prescrito/Suspenso).';

    return { linhas, stats: { totalLinhas, incluidas, omitidasSuspenso }, avisoEcf };
  }

  function getTbodyByIdPart(doc, idPart) {
    return (
      doc.querySelector(`tbody[id*="${idPart}"][id$="_data"]`) ||
      doc.querySelector(`tbody[id$="${idPart}:resultList_data"]`)
    );
  }

  function mapColunasPorHeader(doc, idPart) {
    const thead =
      doc.querySelector(`thead[id*="${idPart}"]`) ||
      (getTbodyByIdPart(doc, idPart) &&
        getTbodyByIdPart(doc, idPart).closest('table') &&
        getTbodyByIdPart(doc, idPart).closest('table').querySelector('thead'));
    const map = {};
    if (!thead) return map;
    thead.querySelectorAll('th').forEach((th, i) => {
      const h = norm(th.textContent || '');
      if (!h) return;
      if (/descri[cç][aã]o/.test(h)) map.descricao = i;
      else if (/dt\.?\s*hora\s*in[ií]cio|data\s*in[ií]cio/.test(h)) map.inicio = i;
      else if (/dt\.?\s*hora\s*fim|data\s*fim/.test(h)) map.fim = i;
      else if (/situa[cç][aã]o/.test(h)) map.situacao = i;
      else if (/refer[eê]ncia/.test(h)) map.referencia = i;
    });
    return map;
  }

  function cellText(tr, idx) {
    if (idx == null || idx < 0 || !tr.cells || !tr.cells[idx]) return '';
    return (tr.cells[idx].textContent || '').trim();
  }

  function detectarTipoLinhaConsultar(descricao) {
    const d = norm(descricao);
    if (SECOES.test(d)) return 'secao';
    // Fármacos com obs «em jejum» / dose VO não devem ir para dieta
    if (pareceMedicamentoConsultar(descricao)) return 'medicamento';
    if (RE_DIETA_CONSULTAR.test(d) || /^dieta\b/i.test(descricao || '')) return 'dieta';
    return 'medicamento';
  }

  function lerValidadeConsultar(doc) {
    const tbodyLista = getTbodyByIdPart(doc, 'listaPrescricoesMedicas');
    const cols = mapColunasPorHeader(doc, 'listaPrescricoesMedicas');
    let validadeInicial = '';
    let validadeFinal = '';

    if (tbodyLista) {
      const selected =
        tbodyLista.querySelector('tr.ui-state-highlight[data-ri]') ||
        tbodyLista.querySelector('tr.ui-state-active[data-ri]') ||
        tbodyLista.querySelector('tr[aria-selected="true"][data-ri]') ||
        tbodyLista.querySelector('tr[data-ri]');
      if (selected) {
        validadeInicial = cellText(selected, cols.inicio);
        validadeFinal = cellText(selected, cols.fim);
      }
    }

    if (!validadeInicial || !validadeFinal) {
      const tbodyItens = getTbodyByIdPart(doc, 'listaItensPrescricaoMedica');
      const colsItens = mapColunasPorHeader(doc, 'listaItensPrescricaoMedica');
      if (tbodyItens && (colsItens.inicio != null || colsItens.fim != null)) {
        const inicios = [];
        const fins = [];
        tbodyItens.querySelectorAll('tr[data-ri]').forEach((tr) => {
          const ini = cellText(tr, colsItens.inicio);
          const fim = cellText(tr, colsItens.fim);
          if (ini) inicios.push(ini);
          if (fim) fins.push(fim);
        });
        if (!validadeInicial && inicios.length) validadeInicial = inicios[0];
        if (!validadeFinal && fins.length) validadeFinal = fins[fins.length - 1];
      }
    }

    let data = '';
    if (validadeInicial && validadeFinal) {
      data = `${validadeInicial} → ${validadeFinal}`;
    } else if (validadeInicial) {
      data = validadeInicial;
    } else if (validadeFinal) {
      data = validadeFinal;
    }
    return { validadeInicial, validadeFinal, data };
  }

  function lerIdentidadeConsultar(doc) {
    let prontuario = '';
    let nome = '';
    const prontEl =
      doc.querySelector('input[id*="pesqPaciente"][id*="prontuario"]') ||
      doc.querySelector('input[id*="pesqPaciente"][id$="prontuario"]');
    if (prontEl && prontEl.value) prontuario = String(prontEl.value).trim();

    const nomeEl =
      doc.querySelector('input[id*="inputTextProntuarioNomePaciente"][id$="inputId"]') ||
      doc.querySelector('input[id*="inputTextProntuarioNomePaciente"]') ||
      doc.querySelector('input[id*="nomePaciente"][id$="inputId"]');
    if (nomeEl && nomeEl.value) nome = String(nomeEl.value).trim();

    // Campo combinado "NNNNNN - NOME" às vezes no mesmo input
    if (nome && !prontuario) {
      const m = nome.match(/^(\d[\d.\-\/]*)\s*[-–—]\s*(.+)$/);
      if (m) {
        prontuario = m[1];
        nome = m[2].trim();
      }
    }
    return { prontuario, nome };
  }

  function parseItensConsultar(doc) {
    const tbody = getTbodyByIdPart(doc, 'listaItensPrescricaoMedica');
    if (!tbody) {
      return {
        linhas: [],
        stats: { totalLinhas: 0, incluidas: 0, omitidasSuspenso: 0 },
        avisoEcf: null,
      };
    }

    const cols = mapColunasPorHeader(doc, 'listaItensPrescricaoMedica');
    const idxDesc = cols.descricao != null ? cols.descricao : 0;
    const idxSit = cols.situacao;

    const linhas = [];
    let totalLinhas = 0;
    let incluidas = 0;
    let omitidasSuspenso = 0;

    tbody.querySelectorAll('tr[data-ri]').forEach((tr) => {
      const cells = tr.cells;
      if (!cells || !cells.length) return;

      const descricaoRaw = cellText(tr, idxDesc);
      if (!descricaoRaw) return;
      if (isSecaoHeader(tr, descricaoRaw)) return;

      totalLinhas++;

      const situacao = idxSit != null ? cellText(tr, idxSit) : '';
      if (situacao && isSuspenso(situacao)) {
        omitidasSuspenso++;
        return;
      }

      const descricao = limparDescricao(descricaoRaw);
      if (!descricao) return;

      const tipo = detectarTipoLinhaConsultar(descricao);
      if (tipo === 'secao') return;

      incluidas++;
      linhas.push({
        tipo,
        descricao,
        descricaoHtml: cells[idxDesc] ? cells[idxDesc].innerHTML || '' : '',
        situacaoEcf: situacao,
      });
    });

    return {
      linhas,
      stats: { totalLinhas, incluidas, omitidasSuspenso },
      avisoEcf: null,
    };
  }

  function getClassifyApi() {
    return typeof AghuPrescricaoMedicationClassify !== 'undefined'
      ? AghuPrescricaoMedicationClassify
      : null;
  }

  function classificarMedicamentos(linhasMed) {
    const api = getClassifyApi();
    if (!api || typeof api.classifyPrescricaoMedicamentos !== 'function') {
      console.warn('[AGHU] AghuPrescricaoMedicationClassify indisponível');
      return {
        hidratacao: [],
        analgesia: [],
        antibiotico: [],
        categoriasMedicamento: {},
      };
    }
    return api.classifyPrescricaoMedicamentos(linhasMed, {
      summarize: function (item, ctx) {
        return resumirMedicamento(item.descricao, item.descricaoHtml, ctx);
      },
    });
  }

  function extrairCampos(linhas) {
    const dietas = linhas.filter((l) => l.tipo === 'dieta').map((l) => l.descricao);
    const meds = linhas.filter((l) => l.tipo === 'medicamento');
    const {
      hidratacao,
      analgesia,
      antibiotico,
      categoriasMedicamento,
    } = classificarMedicamentos(meds);

    return {
      dieta: dietas.join('; '),
      hidratacao,
      analgesia,
      antibiotico,
      categoriasMedicamento: categoriasMedicamento || {},
    };
  }

  function fmtCampo(label, valor) {
    if (Array.isArray(valor)) {
      if (!valor.length) return null;
      return `${label}: ${valor.join('; ')}`;
    }
    if (!valor || String(valor).trim() === '') return null;
    return `${label}: ${valor}`;
  }

  function formatarTextoPlantao(payload) {
    const partes = [];
    const dataLine = fmtCampo('DATA', payload.data);
    if (dataLine) partes.push(dataLine);
    const dietaLine = fmtCampo('DIETA', payload.dieta);
    if (dietaLine) partes.push(dietaLine);
    const hidrLine = fmtCampo('HIDRATAÇÃO VENOSA', payload.hidratacao);
    if (hidrLine) partes.push(hidrLine);
    const atbLine = fmtCampo('ANTIBIÓTICO', payload.antibiotico);
    if (atbLine) partes.push(atbLine);
    const analgLine = fmtCampo('ANALGESIA', payload.analgesia);
    if (analgLine) partes.push(analgLine);

    if (!partes.length) return '—';
    return partes.join('\n').toLocaleUpperCase('pt-BR');
  }

  // ─── Paciente (lib/patient-dom-extract.js) ─────────────────────────────────

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

  function fillPatientFromDomHints(domApi, rootDoc, prontRaw, nomeCompleto) {
    if (!domApi || (prontRaw && nomeCompleto)) {
      return { prontRaw: prontRaw || "", nomeCompleto: nomeCompleto || "" };
    }
    const hints = domApi.aggregateDomPatientHints(rootDoc);
    const blob = domApi.buildPatientInnerTextBlob(rootDoc);
    const parsed = domApi.parsePatientLabelsFromBlob(blob, hints);
    return {
      prontRaw: prontRaw || parsed.prontRaw || "",
      nomeCompleto: nomeCompleto || parsed.nomeCompleto || "",
    };
  }

  function extractPatientFromPage(docHint) {
    const searchDoc = docHint || document;
    const domApi =
      typeof AghuPatientDomExtract !== "undefined" ? AghuPatientDomExtract : null;
    const idApi =
      typeof AghuPatientIdentity !== "undefined" ? AghuPatientIdentity : null;

    // 1) Campos Consultar do doc da prescrição (iframe) — prioridade sobre casca
    let nomeCompleto = "";
    let prontRaw = "";
    const idConsultar = lerIdentidadeConsultar(searchDoc);
    if (idConsultar.prontuario) prontRaw = idConsultar.prontuario;
    if (idConsultar.nome) nomeCompleto = idConsultar.nome;

    // 2) Cabeçalho Manter no mesmo doc
    if (!prontRaw || !nomeCompleto) {
      const cab = lerCabecalho(searchDoc);
      if (!prontRaw && cab.prontuario) prontRaw = cab.prontuario;
      if (!nomeCompleto && cab.nome) nomeCompleto = cab.nome;
    }

    // 3) Hints/blob só no docHint (não na casca)
    if (!prontRaw || !nomeCompleto) {
      const scoped = fillPatientFromDomHints(domApi, searchDoc, prontRaw, nomeCompleto);
      prontRaw = scoped.prontRaw;
      nomeCompleto = scoped.nomeCompleto;
    }

    // 4) Último recurso: hints/blob no document global (legado)
    if ((!prontRaw || !nomeCompleto) && searchDoc !== document) {
      const global = fillPatientFromDomHints(domApi, document, prontRaw, nomeCompleto);
      prontRaw = global.prontRaw;
      nomeCompleto = global.nomeCompleto;
    }

    nomeCompleto = (nomeCompleto || '').replace(/\s{2,}/g, ' ');
    nomeCompleto = nomeCompleto.replace(/^\d+\s*[-–—]\s*/, '');

    const prontuario = normalizeProntuarioDigits(prontRaw);
    const primeiroNome = primeiroNomeFromFull(nomeCompleto);
    const nameOk = idApi
      ? idApi.hasPatientDisplayName({ nomeCompleto, primeiroNome })
      : !!(nomeCompleto && nomeCompleto.length >= 2 && /[A-Za-zÀ-ÿ]/.test(nomeCompleto));
    const prontOk = idApi
      ? idApi.isValidProntuarioForIdentity(prontuario)
      : !!prontuario;

    const missing = [];
    if (!nameOk) missing.push('nome do paciente');
    if (!prontOk) missing.push('prontuário');

    const patientKey =
      prontOk && idApi
        ? idApi.buildPatientKey(prontuario)
        : prontOk
          ? prontuario
          : null;

    return {
      ok: missing.length === 0,
      missing,
      nomeCompleto,
      primeiroNome,
      prontuario: prontOk ? prontuario : "",
      patientKey,
    };
  }

  // ─── Entrada ───────────────────────────────────────────────────────────────

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function dateBrApi() {
    return typeof AghuDateBr !== 'undefined' ? AghuDateBr : null;
  }

  /** Parse dd/mm/yy|yyyy [HH:MM] → Date local; fim do dia se só data e endOfDay. */
  function parseAghuDateTime(raw, endOfDay) {
    if (!raw || !String(raw).trim()) return null;
    const s = String(raw).trim();
    const m = s.match(
      /(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/
    );
    if (!m) return null;
    let y = parseInt(m[3], 10);
    if (y < 100) y = y < 50 ? 2000 + y : 1900 + y;
    const mo = parseInt(m[2], 10) - 1;
    const d = parseInt(m[1], 10);
    let hh = m[4] != null ? parseInt(m[4], 10) : endOfDay ? 23 : 0;
    let mm = m[5] != null ? parseInt(m[5], 10) : endOfDay ? 59 : 0;
    if (m[4] == null && endOfDay) {
      hh = 23;
      mm = 59;
    }
    const dt = new Date(y, mo, d, hh, mm, endOfDay && m[4] == null ? 59 : 0, endOfDay && m[4] == null ? 999 : 0);
    if (Number.isNaN(dt.getTime())) return null;
    return dt;
  }

  function rxDateWindowApi() {
    return typeof AghuPrescricaoDateWindow !== 'undefined' ? AghuPrescricaoDateWindow : null;
  }

  /**
   * Dia civil a partir de BR ou ISO (hora descartada — janela clínica 16h).
   * @returns {Date|null}
   */
  function parseFilterDay(raw) {
    if (!raw || !String(raw).trim()) return null;
    const s = String(raw).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const p = s.split('-');
      return new Date(+p[0], +p[1] - 1, +p[2], 0, 0, 0, 0);
    }
    const api = dateBrApi();
    const iso = api ? api.toFilterIso(s) : null;
    if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      const p = iso.split('-');
      return new Date(+p[0], +p[1] - 1, +p[2], 0, 0, 0, 0);
    }
    const dt = parseAghuDateTime(s, false);
    if (!dt) return null;
    return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), 0, 0, 0, 0);
  }

  /**
   * Intervalo do popup: BR ou ISO → janela clínica 16:00→15:59.
   * De=D1 Até=D2 → validadeInicial ∈ [D1−1 16:00, D2 15:59].
   * Vazio → null (todas as linhas).
   * @returns {{ fromMs: number, toInclusiveMs: number } | null | { error: string }}
   */
  function parseFilterRange(dateFrom, dateTo) {
    const win = rxDateWindowApi();
    if (!win || typeof win.prescricaoFilterRangeFromStrings !== 'function') {
      return { error: 'Filtro de datas indisponível (lib prescricao-date-window). Recarregue a extensão.' };
    }
    return win.prescricaoFilterRangeFromStrings(dateFrom, dateTo);
  }

  function validadeFromTr(tr, cols) {
    const validadeInicial = cellText(tr, cols.inicio);
    const validadeFinal = cellText(tr, cols.fim);
    let data = '';
    if (validadeInicial && validadeFinal) {
      data = `${validadeInicial} → ${validadeFinal}`;
    } else if (validadeInicial) {
      data = validadeInicial;
    } else if (validadeFinal) {
      data = validadeFinal;
    }
    return { validadeInicial, validadeFinal, data };
  }

  /**
   * Linhas de listaPrescricoesMedicas cuja validadeInicial cai na janela 16:00→15:59
   * (ou todas se range null). Ordem DOM.
   */
  function listLinhasPrescricaoNoIntervalo(doc, range) {
    const tbodyLista = getTbodyByIdPart(doc, 'listaPrescricoesMedicas');
    if (!tbodyLista) return [];
    const cols = mapColunasPorHeader(doc, 'listaPrescricoesMedicas');
    const win = rxDateWindowApi();
    const rows = [];
    tbodyLista.querySelectorAll('tr[data-ri]').forEach((tr) => {
      const cab = validadeFromTr(tr, cols);
      if (!range) {
        rows.push({ tr, cab, cols });
        return;
      }
      if (
        win &&
        typeof win.prescricaoValidadeMatchesFilter === 'function' &&
        win.prescricaoValidadeMatchesFilter(
          cab.validadeInicial,
          cab.validadeFinal,
          range
        )
      ) {
        rows.push({ tr, cab, cols });
      }
    });
    return rows;
  }

  function digestItensConsultar(doc) {
    const tbody = getTbodyByIdPart(doc, 'listaItensPrescricaoMedica');
    if (!tbody) return '';
    const parts = [];
    tbody.querySelectorAll('tr[data-ri]').forEach((tr) => {
      parts.push((tr.getAttribute('data-ri') || '') + ':' + (tr.textContent || '').replace(/\s+/g, ' ').trim());
    });
    return parts.join('|');
  }

  function getPageWin(doc) {
    let view = null;
    try {
      view = (doc && doc.defaultView) || null;
    } catch (_e) {}
    if (!view) return null;
    try {
      if (view.wrappedJSObject) return view.wrappedJSObject;
    } catch (_e2) {}
    return view;
  }

  function isRowPfHighlighted(tr) {
    if (!tr) return false;
    return (
      tr.classList.contains('ui-state-highlight') ||
      tr.classList.contains('ui-state-active') ||
      tr.getAttribute('aria-selected') === 'true'
    );
  }

  /**
   * Seleção real PrimeFaces: clica o td no page-context (jQuery/$),
   * sem highlight fake — highlightRow antes do click impedia rowSelect no HUCAM.
   */
  function clickPrescricaoRow(tr) {
    if (!tr) return false;
    const doc = tr.ownerDocument;
    const cell = tr.querySelector('td') || tr;
    const pageWin = getPageWin(doc);
    const ri = tr.getAttribute('data-ri');

    try {
      if (pageWin && typeof pageWin.$ === 'function') {
        pageWin.$(cell).trigger('click');
        return true;
      }
    } catch (_eJq) { /* fall through */ }

    const casca =
      typeof AghuCascaNav !== 'undefined' ? AghuCascaNav : null;
    if (casca && typeof casca.runInDocWindow === 'function' && ri != null) {
      try {
        const ok = casca.runInDocWindow(
          doc,
          function (rowRi) {
            var tbody = document.querySelector(
              'tbody[id*="listaPrescricoesMedicas"][id$="_data"]'
            );
            if (!tbody) return false;
            var row = tbody.querySelector('tr[data-ri="' + rowRi + '"]');
            if (!row) return false;
            var c = row.querySelector('td') || row;
            if (typeof this.$ === 'function') {
              this.$(c).trigger('click');
              return true;
            }
            if (typeof c.click === 'function') c.click();
            else {
              c.dispatchEvent(
                new MouseEvent('click', {
                  bubbles: true,
                  cancelable: true,
                  view: this,
                })
              );
            }
            return true;
          },
          [String(ri)]
        );
        if (ok) return true;
      } catch (_eRun) { /* fall through */ }
    }

    try {
      if (typeof cell.click === 'function') {
        cell.click();
        return true;
      }
      const view = (doc && doc.defaultView) || null;
      cell.dispatchEvent(
        new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: view,
        })
      );
      return true;
    } catch (_eClick) {
      try {
        tr.dispatchEvent(new Event('click', { bubbles: true }));
        return true;
      } catch (_e2) {
        return false;
      }
    }
  }

  function digestTimeoutMs(fallback) {
    const testMs =
      typeof globalThis !== 'undefined' &&
      typeof globalThis.AGHU_TEST_DIGEST_TIMEOUT_MS === 'number'
        ? globalThis.AGHU_TEST_DIGEST_TIMEOUT_MS
        : null;
    if (testMs != null && testMs >= 0) return testMs;
    return fallback;
  }

  async function waitForItensDigest(doc, prevDigest, timeoutMs) {
    const deadline = Date.now() + digestTimeoutMs(timeoutMs || 4000);
    while (Date.now() < deadline) {
      const dig = digestItensConsultar(doc);
      if (dig && dig !== prevDigest) return true;
      await sleep(40);
    }
    return digestItensConsultar(doc) !== prevDigest;
  }

  /** Re-resolve live tr by validadeInicial (PrimeFaces may replace tbody). */
  function findTrByValidadeInicial(doc, validadeInicial) {
    const want = String(validadeInicial || '').trim();
    if (!want) return null;
    const tbodyLista = getTbodyByIdPart(doc, 'listaPrescricoesMedicas');
    if (!tbodyLista) return null;
    const cols = mapColunasPorHeader(doc, 'listaPrescricoesMedicas');
    let found = null;
    tbodyLista.querySelectorAll('tr[data-ri]').forEach((tr) => {
      if (found) return;
      const cab = validadeFromTr(tr, cols);
      if (String(cab.validadeInicial || '').trim() === want) found = tr;
    });
    return found;
  }

  function buildEntryFromParsed(cab, parsed) {
    const campos = extrairCampos(parsed.linhas);
    const payload = {
      data: cab.data,
      dieta: campos.dieta,
      hidratacao: campos.hidratacao,
      analgesia: campos.analgesia,
      antibiotico: campos.antibiotico,
    };
    const texto = formatarTextoPlantao(payload);
    return {
      data: cab.data,
      dieta: campos.dieta,
      hidratacao: campos.hidratacao,
      analgesia: campos.analgesia,
      antibiotico: campos.antibiotico,
      categoriasMedicamento: campos.categoriasMedicamento || {},
      texto,
      validadeInicial: cab.validadeInicial,
      validadeFinal: cab.validadeFinal,
      stats: parsed.stats,
      meta: {
        mode: 'consultar',
        validadeInicial: cab.validadeInicial,
        validadeFinal: cab.validadeFinal,
        avisoEcf: parsed.avisoEcf,
      },
    };
  }

  function pickMostRecentEntry(entries) {
    if (!entries || !entries.length) return null;
    let best = entries[0];
    let bestTs = parseAghuDateTime(best.validadeInicial, false);
    for (let i = 1; i < entries.length; i++) {
      const ts = parseAghuDateTime(entries[i].validadeInicial, false);
      if (ts && (!bestTs || ts.getTime() > bestTs.getTime())) {
        best = entries[i];
        bestTs = ts;
      }
    }
    return best;
  }

  function aggregateStats(entries, skipped) {
    let totalLinhas = 0;
    let incluidas = 0;
    let omitidasSuspenso = 0;
    for (const e of entries) {
      if (!e.stats) continue;
      totalLinhas += e.stats.totalLinhas || 0;
      incluidas += e.stats.incluidas || 0;
      omitidasSuspenso += e.stats.omitidasSuspenso || 0;
    }
    return { totalLinhas, incluidas, omitidasSuspenso, skipped: skipped || 0 };
  }

  async function executarConsultar(doc, patient, dateFrom, dateTo) {
    const rangeOrErr = parseFilterRange(dateFrom, dateTo);
    if (rangeOrErr && rangeOrErr.error) {
      return { ok: false, erro: rangeOrErr.error, patient };
    }
    const range =
      rangeOrErr && typeof rangeOrErr.fromMs === 'number' ? rangeOrErr : null;

    const candidatos = listLinhasPrescricaoNoIntervalo(doc, range);
    if (!candidatos.length) {
      return {
        ok: false,
        erro: range
          ? 'Nenhuma prescrição no intervalo informado na página atual da lista. Ajuste De/Até ou carregue mais linhas no AGHU.'
          : 'Nenhuma linha em listaPrescricoesMedicas. Pesquise o paciente e aguarde a lista de validades.',
        patient,
      };
    }

    const entries = [];
    let skipped = 0;
    const displayFrom = dateFrom != null && String(dateFrom).trim() ? String(dateFrom).trim() : null;
    const displayTo = dateTo != null && String(dateTo).trim() ? String(dateTo).trim() : null;

    for (let i = 0; i < candidatos.length; i++) {
      const { cab: cabRow } = candidatos[i];
      let tr =
        findTrByValidadeInicial(doc, cabRow.validadeInicial) || candidatos[i].tr;
      if (!tr || !tr.parentElement) {
        skipped++;
        continue;
      }
      const prevDigest = digestItensConsultar(doc);
      const alreadySelected = isRowPfHighlighted(tr);

      clickPrescricaoRow(tr);

      let changed =
        alreadySelected && prevDigest && i === 0
          ? true
          : await waitForItensDigest(doc, prevDigest, 4000);
      if (!changed) {
        tr =
          findTrByValidadeInicial(doc, cabRow.validadeInicial) || tr;
        clickPrescricaoRow(tr);
        changed = await waitForItensDigest(doc, prevDigest, 8000);
        if (!changed) {
          // Digest inalterado: não reutilizar itens da validade anterior.
          skipped++;
          continue;
        }
      }

      tr =
        findTrByValidadeInicial(doc, cabRow.validadeInicial) || tr;
      // i>0: exige highlight PF real na linha alvo (sem highlight fake nosso).
      if (i > 0 && tr && !isRowPfHighlighted(tr)) {
        skipped++;
        continue;
      }
      const cab = validadeFromTr(tr, mapColunasPorHeader(doc, 'listaPrescricoesMedicas'));
      const cabFinal = cab.validadeInicial || cab.validadeFinal ? cab : cabRow;
      const parsed = parseItensConsultar(doc);
      if (!parsed.linhas.length) {
        skipped++;
        continue;
      }
      entries.push(buildEntryFromParsed(cabFinal, parsed));
    }

    // Belt-and-suspenders: re-filtra entries pela janela clínica 16:00→15:59.
    let filteredEntries = entries;
    const matchedStarts = [];
    let inclusiveDays = null;
    if (range) {
      const win = rxDateWindowApi();
      if (win && win.filterEntriesByClinicalRange) {
        filteredEntries = win.filterEntriesByClinicalRange(entries, range);
      } else if (win && win.prescricaoValidadeMatchesFilter) {
        filteredEntries = entries.filter((e) =>
          win.prescricaoValidadeMatchesFilter(
            e.validadeInicial,
            e.validadeFinal,
            range
          )
        );
      }
      if (win && win.inclusiveCivilDaysFromStrings) {
        inclusiveDays = win.inclusiveCivilDaysFromStrings(displayFrom, displayTo);
      }
      for (let si = 0; si < filteredEntries.length; si++) {
        matchedStarts.push(
          String(filteredEntries[si].validadeInicial || '').trim() || '(sem início)'
        );
      }
      if (
        inclusiveDays != null &&
        inclusiveDays >= 1 &&
        filteredEntries.length > inclusiveDays
      ) {
        return {
          ok: false,
          erro:
            'Filtro clínico retornou ' +
            filteredEntries.length +
            ' validades para ' +
            inclusiveDays +
            ' dia(s) (16:00→15:59). Recarregue a extensão e confirme De/Até.',
          patient,
          stats: aggregateStats(filteredEntries, skipped),
          meta: {
            mode: 'consultar',
            batch: true,
            dateFrom: displayFrom,
            dateTo: displayTo,
            filterFromMs: range.fromMs,
            filterToInclusiveMs: range.toInclusiveMs,
            matchedStarts: matchedStarts,
            inclusiveDays: inclusiveDays,
            skipped,
          },
        };
      }
    }

    if (!filteredEntries.length) {
      return {
        ok: false,
        erro:
          'Nenhum item de prescrição extraído após percorrer as validades do intervalo (lista de itens vazia ou só suspensos).',
        patient,
        stats: { totalLinhas: 0, incluidas: 0, omitidasSuspenso: 0, skipped },
        meta: {
          mode: 'consultar',
          batch: true,
          dateFrom: displayFrom,
          dateTo: displayTo,
          filterFromMs: range ? range.fromMs : null,
          filterToInclusiveMs: range ? range.toInclusiveMs : null,
          matchedStarts: [],
          inclusiveDays: inclusiveDays,
        },
      };
    }

    const latest = pickMostRecentEntry(filteredEntries);
    const stats = aggregateStats(filteredEntries, skipped);

    return {
      ok: true,
      data: latest.data,
      dieta: latest.dieta,
      hidratacao: latest.hidratacao,
      analgesia: latest.analgesia,
      antibiotico: latest.antibiotico,
      categoriasMedicamento: latest.categoriasMedicamento || {},
      texto: latest.texto,
      entries: filteredEntries.map((e) => ({
        data: e.data,
        dieta: e.dieta,
        hidratacao: e.hidratacao,
        analgesia: e.analgesia,
        antibiotico: e.antibiotico,
        categoriasMedicamento: e.categoriasMedicamento || {},
        texto: e.texto,
        validadeInicial: e.validadeInicial,
        validadeFinal: e.validadeFinal,
      })),
      entryCount: filteredEntries.length,
      patient,
      stats,
      meta: {
        mode: 'consultar',
        batch: filteredEntries.length > 1 || !!range,
        dateFrom: displayFrom,
        dateTo: displayTo,
        validadeInicial: latest.validadeInicial,
        validadeFinal: latest.validadeFinal,
        avisoEcf: null,
        skipped,
        filterFromMs: range ? range.fromMs : null,
        filterToInclusiveMs: range ? range.toInclusiveMs : null,
        matchedStarts: matchedStarts,
        inclusiveDays: inclusiveDays,
      },
    };
  }

  function executarManter(doc, patient) {
    const cab = lerCabecalho(doc);
    const temEcf = detectarColunaEcf(doc);
    const parsed = parseLinhasPrescricao(doc, temEcf);
    const campos = extrairCampos(parsed.linhas);
    const payload = {
      data: cab.data,
      dieta: campos.dieta,
      hidratacao: campos.hidratacao,
      analgesia: campos.analgesia,
      antibiotico: campos.antibiotico,
    };
    const texto = formatarTextoPlantao(payload);
    return {
      ok: true,
      data: cab.data,
      dieta: campos.dieta,
      hidratacao: campos.hidratacao,
      analgesia: campos.analgesia,
      antibiotico: campos.antibiotico,
      categoriasMedicamento: campos.categoriasMedicamento || {},
      texto,
      patient,
      stats: parsed.stats,
      meta: {
        mode: 'manter',
        validadeInicial: cab.validadeInicial,
        validadeFinal: cab.validadeFinal,
        avisoEcf: parsed.avisoEcf,
      },
    };
  }

  async function executar(msg) {
    const found = encontrarDocPrescricao();

    if (!found) {
      const patient = extractPatientFromPage();
      return {
        ok: false,
        erro:
          'Tabela de prescrições não encontrada. Abra Consultar Prescrição Médica (paciente pesquisado e itens visíveis) ou Manter Prescrição Médica no AGHU antes de extrair.',
        patient,
      };
    }

    const { doc, mode } = found;
    const patient = extractPatientFromPage(doc);

    if (mode === 'manter') {
      return executarManter(doc, patient);
    }

    const dateFrom = msg && msg.dateFrom != null ? msg.dateFrom : null;
    const dateTo = msg && msg.dateTo != null ? msg.dateTo : null;
    return executarConsultar(doc, patient, dateFrom, dateTo);
  }

  if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.onMessage) {
    browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (!msg || msg.action !== 'extrairPrescricao') return false;
      Promise.resolve()
        .then(() => executar(msg))
        .then(sendResponse)
        .catch((e) => {
          sendResponse({
            ok: false,
            erro: (e && e.message) || 'Erro na extração de prescrição.',
          });
        });
      return true;
    });
  }

})();

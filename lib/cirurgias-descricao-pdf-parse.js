/**
 * Parse do texto PDF «Descrição Cirúrgica» (POL AGHU) → campos do passômetro.
 * Sem PHI de IDENTIFICAÇÃO. Testável em Node.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuCirurgiasDescricaoPdfParse = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function str(v) {
    return v == null ? "" : String(v);
  }

  function fold(s) {
    return str(s)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
  }

  /**
   * Cabeçalho de seção por prefixo (rótulo sozinho ou colapsado com corpo).
   * @param {string} line
   * @returns {{ kind: "equipe"|"achados"|"descricao"|"cirurgias"|"identificacao", remainder: string }|null}
   */
  function matchSectionHeader(line) {
    var raw = str(line);
    var n = fold(raw);
    if (!n) return null;
    // Título do documento (ex. "DESCRICAO CIRURGICA") — não é seção de corpo.
    if (/^DESCRICAO\s+CIRURG/.test(n) || n === "DESCRICAO CIRURGICA") {
      return null;
    }

    var patterns = [
      {
        kind: "identificacao",
        re: /^(\d+\.?\s*)?IDENTIFICA[CÇ][AÃ]O\s*:?\s*/i,
      },
      { kind: "equipe", re: /^(\d+\.?\s*)?EQUIPE\s*:?\s*/i },
      {
        kind: "achados",
        // \S* cobre OPERATÓRIOS / OPERATORIOS (accents — \w não cobre Ó).
        re: /^(\d+\.?\s*)?ACHADOS\s+OPERAT\S*\s*:?\s*/i,
      },
      {
        kind: "cirurgias",
        re: /^(\d+\.?\s*)?CIRURGIAS?\s+REALIZAD\S*\s*:?\s*/i,
      },
      { kind: "descricao", re: /^(\d+\.?\s*)?DESCRI[CÇ][AÃ]O\s*:?\s*/i },
    ];

    for (var i = 0; i < patterns.length; i++) {
      var m = raw.match(patterns[i].re);
      if (!m) continue;
      return {
        kind: patterns[i].kind,
        remainder: raw.slice(m[0].length).trim(),
      };
    }
    return null;
  }

  /**
   * @param {string} line
   * @returns {"equipe"|"achados"|"descricao"|"cirurgias"|"identificacao"|null}
   */
  function classifySectionHeader(line) {
    var matched = matchSectionHeader(line);
    return matched ? matched.kind : null;
  }

  /**
   * PDF.js sem hasEOL junta o laudo numa linha. Insere quebra só antes de
   * cabeçalhos numerados (1. EQUIPE) para não partir "DRA EQUIPE A".
   * @param {string} text
   * @returns {string}
   */
  function insertInlineSectionBreaks(text) {
    var t = str(text);
    t = t.replace(/[>—]\s*(?=DESCRI[CÇ][AÃ]O(?!\s+CIRURG))/gi, "\n");
    t = t.replace(
      /\s+(?=(\d+\.\s*)(IDENTIFICA[CÇ][AÃ]O|EQUIPE|ACHADOS\s+OPERAT\S*|CIRURGIAS?\s+REALIZAD\S*|DESCRI[CÇ][AÃ]O(?!\s+CIRURG)))/gi,
      "\n"
    );
    return t;
  }

  /**
   * @param {string} text
   * @returns {Record<string, string>}
   */
  function splitSections(text) {
    var lines = insertInlineSectionBreaks(text).split(/\r?\n/);
    var sections = {
      equipe: [],
      achados: [],
      descricao: [],
      cirurgias: [],
    };
    var current = null;
    for (var i = 0; i < lines.length; i++) {
      var raw = lines[i];
      var matched = matchSectionHeader(raw);
      if (matched && matched.kind === "identificacao") {
        current = null;
        continue;
      }
      if (matched) {
        current = matched.kind;
        if (matched.remainder && sections[current]) {
          sections[current].push(matched.remainder);
        }
        continue;
      }
      if (current && sections[current]) {
        sections[current].push(raw);
      }
    }
    var out = {};
    Object.keys(sections).forEach(function (k) {
      out[k] = sections[k].join("\n").trim();
    });
    return out;
  }

  /**
   * Extrai data dd/mm/aaaa do bloco CIRURGIAS REALIZADAS (Início).
   * @param {string} block
   * @returns {string}
   */
  function extractDataFromCirurgiasBlock(block) {
    var t = str(block);
    var mInicio = t.match(
      /In[ií]cio\s*[:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i
    );
    if (mInicio) return mInicio[1];
    var mAny = t.match(/(\d{2}\/\d{2}\/\d{4})/);
    return mAny ? mAny[1] : "";
  }

  function isTableHeaderLine(folded) {
    return (
      /\bPRINCIPAL\b/.test(folded) &&
      /\b(LADO|CID|QUANTIDADE)\b/.test(folded)
    );
  }

  function looksLikeTableHeaderNome(folded) {
    return (
      /\bPRINCIPAL\b/.test(folded) ||
      /\bQUANTIDADE\b/.test(folded) ||
      /POTENCIAL\s+DE\s+CONTAMIN/.test(folded)
    );
  }

  /**
   * Meta real da seção (para a coleta do nome) — não inclui linha só de contaminação.
   * @param {string} folded
   * @param {string} rawLine
   * @returns {boolean}
   */
  function isProcedureMetaLine(folded, rawLine) {
    if (
      /^(TECNICA|TÉCNICA|OBSERVACAO|OBSERVAÇÃO|CARATER|CARÁTER|INICIO|INÍCIO|FIM)\b/.test(
        folded
      )
    ) {
      return true;
    }
    if (/^(SIM|NAO|NÃO)\b/.test(folded) && /\bI[A-Z0-9]/.test(folded)) {
      return true;
    }
    if (/^\d+\s*$/.test(str(rawLine).trim())) return true;
    return false;
  }

  /**
   * Linha só com potencial de contaminação (HUCAM quebra em 1–2 linhas).
   * Skip — não interrompe coleta do nome.
   * @param {string} folded
   * @returns {boolean}
   */
  function isContaminationOnlyLine(folded) {
    return /^(POTENCIALMENTE(\s+CONTAMINADO)?|CONTAMINADO|INFECTADO|LIMPO|LIMPA)$/.test(
      folded
    );
  }

  var CONTAMINACAO_PREFIX =
    /^(INFECTADO|LIMPO|LIMPA|POTENCIALMENTE\s+CONTAMINADO|CONTAMINADO)\s+/i;

  /**
   * Remove colunas da tabela coladas no fim: SIM|NÃO + CID + quantidade.
   * Ex.: "ONCOLOGIA SIM C24.8 1" → "ONCOLOGIA"
   * @param {string} line
   * @returns {string}
   */
  function stripTableColumnSuffix(line) {
    return str(line)
      .replace(/\s+(SIM|N[AÃ]O)\s+[A-Z]\d{1,2}(?:\.\d+)?\s+\d+\s*$/i, "")
      .trim();
  }

  function cleanProcedureNome(nome) {
    return str(nome).replace(CONTAMINACAO_PREFIX, "").replace(/\s+/g, " ").trim();
  }

  /**
   * Remove tokens soltos de contaminação / flag / CID / quantidade em qualquer
   * posição (PDF HUCAM com colunas embaralhadas). CIR-EXT-16.
   * @param {string} nome
   * @returns {string}
   */
  function sanitizeProcedureNomeTokens(nome) {
    var t = str(nome).replace(/\s+/g, " ").trim();
    if (!t) return "";
    // Frases de contaminação → tokens isolados → SIM/NÃO → CID → dígitos isolados.
    t = t.replace(/\bPOTENCIALMENTE\s+CONTAMINADO\b/gi, " ");
    t = t.replace(
      /\b(POTENCIALMENTE|CONTAMINADO|INFECTADO|LIMPO|LIMPA)\b/gi,
      " "
    );
    t = t.replace(/\b(SIM|NAO|NÃO)\b/gi, " ");
    t = t.replace(/\b[A-Za-z]\d{2}(?:\.\d+)?\b/g, " ");
    t = t.replace(/\b\d+\b/g, " ");
    return t.replace(/\s+/g, " ").trim();
  }

  function isSkippableNomeLine(folded) {
    if (isTableHeaderLine(folded)) return true;
    if (isContaminationOnlyLine(folded)) return true;
    if (
      /^(PROCEDIMENTOS?|POTENCIAL\s+DE\s+CONTAMIN|TECNICA|TÉCNICA|CARATER|CARÁTER|INICIO|INÍCIO|FIM|URGENCIA|URGÊNCIA|ELETIV)/.test(
        folded
      )
    ) {
      return true;
    }
    return false;
  }

  /**
   * Índice do início do bloco de achados deslocados na seção CIRURGIAS
   * (pós-Observação ou linha POI / inventário longo).
   * @param {string[]} lines
   * @returns {number} índice ou -1
   */
  function findDisplacedAchadosStart(lines) {
    var i;
    for (i = 0; i < lines.length; i++) {
      var f = fold(lines[i]);
      if (/^OBSERVAC[AÃ]O\s*:?\s*$/.test(f) || /^OBSERVAC[AÃ]O\s*:/.test(f)) {
        // Inclui a linha Observação: e o que vem depois.
        return i;
      }
      if (/^POI\b/.test(f)) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Separa tabela/procedimento do bloco clínico deslocado (POI / pós-Observação).
   * @param {string} block
   * @returns {{ procedureBlock: string, displacedAchados: string }}
   */
  function splitCirurgiasProcedureAndDisplacedAchados(block) {
    var lines = str(block).split(/\r?\n/);
    var start = findDisplacedAchadosStart(lines);
    if (start < 0) {
      return { procedureBlock: str(block).trim(), displacedAchados: "" };
    }
    var procedureLines = lines.slice(0, start);
    var displacedLines = lines.slice(start);
    return {
      procedureBlock: procedureLines.join("\n").trim(),
      displacedAchados: displacedLines.join("\n").trim(),
    };
  }

  /**
   * Extrai nome do procedimento do bloco CIRURGIAS REALIZADAS.
   * Ignora bloco POI / pós-Observação (achados deslocados).
   * @param {string} block
   * @returns {string}
   */
  function extractNomeFromCirurgiasBlock(block) {
    var split = splitCirurgiasProcedureAndDisplacedAchados(block);
    var lines = str(split.procedureBlock)
      .split(/\r?\n/)
      .map(function (l) {
        return l.trim();
      })
      .filter(Boolean);

    var rawNome = "";

    // 1) Após header de tabela Principal / Lado / CID…
    for (var i = 0; i < lines.length; i++) {
      var fi = fold(lines[i]);
      if (!isTableHeaderLine(fi)) continue;
      var parts = [];
      for (var k = i + 1; k < lines.length; k++) {
        var fk = fold(lines[k]);
        if (isTableHeaderLine(fk)) break;
        if (isContaminationOnlyLine(fk)) continue;
        if (isProcedureMetaLine(fk, lines[k])) break;
        var piece = stripTableColumnSuffix(lines[k]);
        if (!piece) continue;
        if (isContaminationOnlyLine(fold(piece))) continue;
        parts.push(piece);
      }
      var fromTable = cleanProcedureNome(parts.join(" "));
      if (fromTable && !looksLikeTableHeaderNome(fold(fromTable))) {
        rawNome = fromTable;
      }
      break;
    }

    // 2) Após "Procedimentos:"
    if (!rawNome) {
      var afterProc = false;
      for (var p = 0; p < lines.length; p++) {
        var fp = fold(lines[p]);
        if (/^PROCEDIMENTOS?\b/.test(fp)) {
          afterProc = true;
          var rest = stripTableColumnSuffix(
            lines[p].replace(/^Procedimentos?\s*[:\-]?\s*/i, "").trim()
          );
          if (
            rest &&
            !isTableHeaderLine(fold(rest)) &&
            !isContaminationOnlyLine(fold(rest))
          ) {
            var cleanedRest = cleanProcedureNome(rest);
            if (cleanedRest && !looksLikeTableHeaderNome(fold(cleanedRest))) {
              rawNome = cleanedRest;
              break;
            }
          }
          continue;
        }
        if (!afterProc) continue;
        if (isContaminationOnlyLine(fp)) continue;
        if (isSkippableNomeLine(fp) || isProcedureMetaLine(fp, lines[p])) {
          if (isTableHeaderLine(fp)) {
            // deixa o loop 1 cuidar se ainda não passou; aqui pula header
            continue;
          }
          if (
            /^(TECNICA|TÉCNICA|OBSERVACAO|OBSERVAÇÃO|CARATER|CARÁTER|INICIO|INÍCIO|FIM)\b/.test(
              fp
            )
          ) {
            break;
          }
          continue;
        }
        var cleaned = cleanProcedureNome(stripTableColumnSuffix(lines[p]));
        if (cleaned && !looksLikeTableHeaderNome(fold(cleaned))) {
          rawNome = cleaned;
          break;
        }
      }
    }

    // 3) Fallback: primeira linha longa útil
    if (!rawNome) {
      for (var j = 0; j < lines.length; j++) {
        var fj = fold(lines[j]);
        if (isSkippableNomeLine(fj) || isProcedureMetaLine(fj, lines[j])) continue;
        if (/^\d{2}\/\d{2}\/\d{4}/.test(lines[j])) continue;
        if (/^POI\b/.test(fj)) continue;
        if (lines[j].length > 8) {
          var fallback = cleanProcedureNome(lines[j]);
          if (fallback && !looksLikeTableHeaderNome(fold(fallback))) {
            rawNome = fallback;
            break;
          }
        }
      }
    }

    return sanitizeProcedureNomeTokens(rawNome);
  }

  /**
   * Normaliza EQUIPE colapsada: CRM colado no nome e papéis colados.
   * @param {string} text
   * @returns {string}
   */
  function normalizeEquipeBlock(text) {
    var t = str(text).trim();
    if (!t) return "";

    // CRM: 6993GUSTAVO → CRM: 6993 GUSTAVO
    t = t.replace(/(CRM\s*:\s*\d+)(?=[A-Za-zÀ-ÿ])/gi, "$1 ");

    // Papel colado no nome: …MIGUELEquipe: → …MIGUEL\nEquipe:
    t = t.replace(
      /([A-Za-zÀ-ÿ0-9.)])\s*(Equipe|Supervisor|Auxiliar|Cirurgi[aã]o)\s*:/gi,
      "$1\n$2:"
    );

    // Uma entrada por CRM (quando vários na mesma linha)
    t = t.replace(/\s+(?=CRM\s*:)/gi, "\n");

    var lines = t.split(/\r?\n/).map(function (l) {
      return l.replace(/\s+/g, " ").trim();
    }).filter(Boolean);

    // Formatar "CRM: NOME Equipe:" → "CRM: NOME — Equipe:"
    // e "Role: Nome CRM N" / "Nome CRM N" → forma canónica.
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var roleOnly = line.match(
        /^(Equipe|Supervisor|Auxiliar|Cirurgi[aã]o)\s*:?\s*$/i
      );
      if (roleOnly && out.length) {
        var prev = out[out.length - 1];
        if (!/\s[—\-]\s*(Equipe|Supervisor|Auxiliar|Cirurgi)/i.test(prev)) {
          out[out.length - 1] =
            prev + " — " + roleOnly[1].replace(/^./, function (c) {
              return c.toUpperCase();
            }) +
            ":";
          continue;
        }
      }

      // Role: Nome CRM N → CRM: N Nome — Role:
      var roleCrm = line.match(
        /^(Equipe|Supervisor|Auxiliar|Cirurgi[aã]o)\s*:\s*(.+?)\s+CRM\s+(\d+)\s*$/i,
      );
      if (roleCrm) {
        out.push(
          "CRM: " +
            roleCrm[3] +
            " " +
            roleCrm[2].trim() +
            " — " +
            roleCrm[1].replace(/^./, function (c) {
              return c.toUpperCase();
            }) +
            ":",
        );
        continue;
      }

      // Role: Nome (sem CRM)
      var roleName = line.match(
        /^(Equipe|Supervisor|Auxiliar|Cirurgi[aã]o)\s*:\s*(.+)$/i,
      );
      if (roleName && !/^CRM\s*:/i.test(line)) {
        out.push(
          roleName[2].trim() +
            " — " +
            roleName[1].replace(/^./, function (c) {
              return c.toUpperCase();
            }) +
            ":",
        );
        continue;
      }

      // Nome CRM N (resto após strip do header "Equipe:") → CRM: N Nome — Equipe:
      var nameCrm = line.match(/^(.+?)\s+CRM\s+(\d+)\s*$/i);
      if (nameCrm && !/^CRM\s*:/i.test(line)) {
        out.push(
          "CRM: " + nameCrm[2] + " " + nameCrm[1].trim() + " — Equipe:",
        );
        continue;
      }

      line = line.replace(
        /\s+(Equipe|Supervisor|Auxiliar|Cirurgi[aã]o)\s*:?\s*$/i,
        function (_m, role) {
          return " — " + role + ":";
        }
      );
      out.push(line);
    }
    return out.join("\n").trim();
  }

  /**
   * Remove rodapés/assinaturas/títulos repetidos entre páginas da descrição.
   * @param {string} text
   * @returns {string}
   */
  function stripDescricaoPageArtifacts(text) {
    var lines = str(text).split(/\r?\n/);
    var kept = [];
    for (var i = 0; i < lines.length; i++) {
      var raw = lines[i];
      var trimmed = raw.trim();
      if (!trimmed) {
        kept.push(raw);
        continue;
      }
      var f = fold(trimmed);
      // Assinatura de página HUCAM: "Dr. NOME CRM 1234" / "Drª. NOME" / "Dra. NOME".
      // Não usar /^DRA\b/ no fold — apaga nomes tipo "DRA EQUIPE A" na seção EQUIPE.
      // Equipe normalizada começa com "CRM:" — não conflita.
      if (
        trimmed.length <= 120 &&
        (/^Dr\.\s+/i.test(trimmed) ||
          /^Drª\.?\s+/i.test(trimmed) ||
          /^Dra\.\s+/i.test(trimmed))
      ) {
        continue;
      }
      if (/^FOLHA\s+\d+\s*\/\s*\d+/.test(f)) continue;
      if (/MBCR_DESCR_CIRURGICA/i.test(trimmed)) continue;
      if (/^\d{2}\/\d{2}\/\d{4}\s+\d{1,2}:\d{2}/.test(trimmed) && trimmed.length < 40) {
        continue;
      }
      if (/^DESCRICAO\s+CIRURG/.test(f) || f === "DESCRICAO CIRURGICA") continue;
      // Número de relatório curto isolado (ex. 12345678)
      if (/^\d{4,12}$/.test(trimmed)) continue;
      kept.push(raw);
    }
    return kept
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  /**
   * Concatena achados deslocados (seção 3) + corpo da seção 4.
   * @param {string} displaced
   * @param {string} sectionAchados
   * @returns {string}
   */
  function mergeAchadosOperatorios(displaced, sectionAchados) {
    var parts = [];
    var d = str(displaced).trim();
    var a = str(sectionAchados).trim();
    if (d) parts.push(d);
    if (a) parts.push(a);
    return parts.join("\n").trim();
  }

  /**
   * @param {string|null|undefined} text
   * @param {{ data?: string, nome?: string }|null|undefined} listMeta
   * @returns {{ data: string, nome: string, equipe: string, achadosOperatorios: string, descricao: string }|null}
   */
  function parseDescricaoCirurgiaPdfText(text, listMeta) {
    var raw = str(text).trim();
    if (!raw) return null;
    var sections = splitSections(raw);
    var meta = listMeta && typeof listMeta === "object" ? listMeta : {};
    // CIR-EXT-13: data/listIndex da linha POL; CIR-EXT-15: nome do PDF (lista truncada = fallback).
    var listData = str(meta.data).trim();
    var listNome = str(meta.nome).trim();

    var cirSplit = splitCirurgiasProcedureAndDisplacedAchados(sections.cirurgias);
    var procedureBlock = cirSplit.procedureBlock;
    var displacedAchados = cirSplit.displacedAchados;

    var pdfData = extractDataFromCirurgiasBlock(procedureBlock);
    var pdfNome = extractNomeFromCirurgiasBlock(procedureBlock);
    if (pdfNome && looksLikeTableHeaderNome(fold(pdfNome))) {
      pdfNome = "";
    }
    var data = listData || pdfData || "";
    var nome = pdfNome || listNome || "";

    var equipe = stripDescricaoPageArtifacts(
      normalizeEquipeBlock(sections.equipe || "")
    );
    var achadosOperatorios = stripDescricaoPageArtifacts(
      mergeAchadosOperatorios(displacedAchados, sections.achados || "")
    );
    var descricao = stripDescricaoPageArtifacts(sections.descricao || "");

    var hasBody = !!(equipe || achadosOperatorios || descricao);
    if (!hasBody) return null;

    return {
      data: data,
      nome: nome,
      equipe: equipe,
      achadosOperatorios: achadosOperatorios,
      descricao: descricao,
    };
  }

  /**
   * True se o parse tem pelo menos uma seção de corpo (não só data/nome).
   * @param {object|null|undefined} parsed
   * @returns {boolean}
   */
  function hasCirurgiaPdfBody(parsed) {
    if (!parsed || typeof parsed !== "object") return false;
    return !!(
      str(parsed.equipe).trim() ||
      str(parsed.achadosOperatorios).trim() ||
      str(parsed.descricao).trim()
    );
  }

  return {
    fold: fold,
    classifySectionHeader: classifySectionHeader,
    matchSectionHeader: matchSectionHeader,
    splitSections: splitSections,
    extractDataFromCirurgiasBlock: extractDataFromCirurgiasBlock,
    extractNomeFromCirurgiasBlock: extractNomeFromCirurgiasBlock,
    sanitizeProcedureNomeTokens: sanitizeProcedureNomeTokens,
    splitCirurgiasProcedureAndDisplacedAchados:
      splitCirurgiasProcedureAndDisplacedAchados,
    normalizeEquipeBlock: normalizeEquipeBlock,
    stripDescricaoPageArtifacts: stripDescricaoPageArtifacts,
    parseDescricaoCirurgiaPdfText: parseDescricaoCirurgiaPdfText,
    hasCirurgiaPdfBody: hasCirurgiaPdfBody,
    insertInlineSectionBreaks: insertInlineSectionBreaks,
  };
});

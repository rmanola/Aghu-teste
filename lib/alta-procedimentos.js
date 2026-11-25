/**
 * Procedimentos/cirurgias no kit de alta — normalização, formatação e retrocompat.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuAltaProcedimentos = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function getDateBr() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./date-br.js");
      } catch (_e) {}
    }
    return globalThis.AghuDateBr;
  }

  function getAltaPrint() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./alta-print.js");
      } catch (_e) {}
    }
    return globalThis.AghuAltaPrint;
  }

  function getEquipeParseApi() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./cirurgias-equipe-parse.js");
      } catch (_e) {}
    }
    return globalThis.AghuCirurgiasEquipeParse || null;
  }

  function formatBrDate(input) {
    var api = getAltaPrint();
    if (api && typeof api.formatBrDate === "function") {
      return api.formatBrDate(input);
    }
    var db = getDateBr();
    if (db && typeof db.isoToBr === "function" && input) {
      return db.isoToBr(String(input));
    }
    return String(input || "");
  }

  function isoToBr(iso) {
    var db = getDateBr();
    if (db && typeof db.isoToBr === "function") {
      return db.isoToBr(iso);
    }
    return formatBrDate(iso);
  }

  function brToIso(br) {
    var db = getDateBr();
    if (db && typeof db.brToIso === "function") {
      return db.brToIso(br) || "";
    }
    return "";
  }

  function str(v) {
    return v == null ? "" : String(v);
  }

  function normalizeIsoDate(value) {
    var raw = str(value).trim();
    if (!raw) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    var iso = brToIso(raw);
    return iso || raw;
  }

  function normalizeProcedimentoItem(src) {
    if (!src || typeof src !== "object") return null;
    // Sem trim na descrição (ALTA-AC-97) — preserva espaço durante digitação.
    var descricao = str(src.descricao);
    var data = normalizeIsoDate(src.data);
    if (!descricao && !data) return null;
    return { descricao: descricao, data: data };
  }

  function sortProcedimentosByDate(list) {
    return list.slice().sort(function (a, b) {
      var da = str(a.data);
      var db = str(b.data);
      if (da && db && da !== db) return da < db ? -1 : 1;
      if (da && !db) return -1;
      if (!da && db) return 1;
      return 0;
    });
  }

  /**
   * @param {Array<{descricao?: string, data?: string}> | null | undefined} rawList
   * @param {{ procedimento?: string, dataProcedimento?: string } | null | undefined} legacy
   */
  function normalizeProcedimentos(rawList, legacy) {
    var list = [];
    if (Array.isArray(rawList)) {
      for (var i = 0; i < rawList.length; i++) {
        var item = normalizeProcedimentoItem(rawList[i]);
        if (item) list.push(item);
      }
    }
    if (!list.length && legacy && typeof legacy === "object") {
      // Sem trim no valor armazenado (ALTA-AC-97); trim só para decidir se há conteúdo.
      var legDesc = str(legacy.procedimento);
      var legDate = normalizeIsoDate(legacy.dataProcedimento);
      if (legDesc.trim() || legDate) {
        list.push({ descricao: legDesc, data: legDate });
      }
    }
    return sortProcedimentosByDate(list);
  }

  function resolveProcedimentosFromLaudo(laudo) {
    laudo = laudo || {};
    return normalizeProcedimentos(laudo.procedimentos, {
      procedimento: laudo.procedimento,
      dataProcedimento: laudo.dataProcedimento,
    });
  }

  /** Join para armazenamento (sem upper) — upper fica na impressão. */
  function joinProcedimentosForStorage(procedimentos) {
    var parts = [];
    var list = Array.isArray(procedimentos) ? procedimentos : [];
    for (var i = 0; i < list.length; i++) {
      var d = str(list[i].descricao);
      if (d.trim()) parts.push(d);
    }
    if (!parts.length) return "";
    if (parts.length === 1) return parts[0];
    return parts.slice(0, -1).join(", ") + " E " + parts[parts.length - 1];
  }

  function formatAtestadoProcedimentos(procedimentos) {
    var parts = [];
    var list = Array.isArray(procedimentos) ? procedimentos : [];
    for (var i = 0; i < list.length; i++) {
      var d = str(list[i].descricao).trim();
      if (d) parts.push(d.toUpperCase());
    }
    if (!parts.length) return "";
    if (parts.length === 1) return parts[0];
    return parts.slice(0, -1).join(", ") + " E " + parts[parts.length - 1];
  }

  function formatProcedureClause(item) {
    var desc = str(item.descricao).trim().toUpperCase();
    var data = item.data ? formatBrDate(item.data) : "";
    if (!desc) return "";
    if (data) return desc + " EM " + data;
    return desc;
  }

  function formatLaudoProcedimentosNarrative(procedimentos, semIntercorrencias) {
    var list = Array.isArray(procedimentos) ? procedimentos : [];
    var clauses = [];
    for (var i = 0; i < list.length; i++) {
      var clause = formatProcedureClause(list[i]);
      if (clause) clauses.push(clause);
    }
    if (!clauses.length) return "";
    var body = "FOI SUBMETIDO(A) A " + clauses.join(" E ");
    if (semIntercorrencias !== false) {
      body += ", SEM INTERCORRÊNCIAS.";
    } else {
      body += ".";
    }
    return body;
  }

  function formatRetornoMultiline(procedimentos) {
    var list = Array.isArray(procedimentos) ? procedimentos : [];
    var descLines = [];
    var dateLines = [];
    for (var i = 0; i < list.length; i++) {
      var desc = str(list[i].descricao).trim();
      var data = list[i].data ? formatBrDate(list[i].data) : "";
      descLines.push(desc ? desc.toUpperCase() : "");
      dateLines.push(data);
    }
    return {
      descricaoAto: descLines.join("\n"),
      dataCirurgia: dateLines.join("\n"),
    };
  }

  function parseRetornoMultiline(descricaoAto, dataCirurgia) {
    var descLines = str(descricaoAto)
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map(function (line) {
        return line.trim();
      });
    var dateLines = str(dataCirurgia)
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map(function (line) {
        return line.trim();
      });
    while (descLines.length && !descLines[descLines.length - 1]) descLines.pop();
    while (dateLines.length && !dateLines[dateLines.length - 1]) dateLines.pop();
    if (!descLines.length && !dateLines.length) return [];
    if (descLines.length !== dateLines.length) return null;
    var out = [];
    for (var i = 0; i < descLines.length; i++) {
      var desc = descLines[i];
      var data = normalizeIsoDate(dateLines[i]);
      if (!desc && !data) continue;
      out.push({ descricao: desc, data: data });
    }
    return sortProcedimentosByDate(out);
  }

  function mirrorLaudoLegacyFields(laudo) {
    laudo = laudo || {};
    var procedimentos = normalizeProcedimentos(laudo.procedimentos, {
      procedimento: laudo.procedimento,
      dataProcedimento: laudo.dataProcedimento,
    });
    laudo.procedimentos = procedimentos;
    if (procedimentos.length) {
      var lastIdx = procedimentos.length - 1;
      var legDate = normalizeIsoDate(laudo.dataProcedimento);
      if (legDate && !procedimentos[lastIdx].data) {
        procedimentos[lastIdx] = {
          descricao: procedimentos[lastIdx].descricao,
          data: legDate,
        };
        laudo.procedimentos = procedimentos;
      }
    }
    laudo.procedimento = joinProcedimentosForStorage(procedimentos);
    if (procedimentos.length) {
      laudo.dataProcedimento = str(procedimentos[procedimentos.length - 1].data);
    } else {
      laudo.dataProcedimento = laudo.dataProcedimento
        ? normalizeIsoDate(laudo.dataProcedimento)
        : "";
    }
    return laudo;
  }

  function procedimentoIdentityKey(item) {
    var desc = str(item.descricao).trim().toUpperCase();
    var data = normalizeIsoDate(item.data);
    return desc + "|" + data;
  }

  function procedimentosListsEqual(a, b) {
    var left = Array.isArray(a) ? a : [];
    var right = Array.isArray(b) ? b : [];
    if (left.length !== right.length) return false;
    for (var i = 0; i < left.length; i++) {
      if (procedimentoIdentityKey(left[i]) !== procedimentoIdentityKey(right[i])) {
        return false;
      }
    }
    return true;
  }

  function buildSeedProcedimentosLookup(fromSeed) {
    var seedKeys = {};
    var seedDateKeys = {};
    var list = normalizeProcedimentos(fromSeed, null);
    for (var i = 0; i < list.length; i++) {
      seedKeys[procedimentoIdentityKey(list[i])] = true;
      var date = normalizeIsoDate(list[i].data);
      if (date) seedDateKeys[date] = true;
    }
    return { seedKeys: seedKeys, seedDateKeys: seedDateKeys, list: list };
  }

  function procedimentoMatchesSeedItem(item, lookup) {
    if (lookup.seedKeys[procedimentoIdentityKey(item)]) return true;
    if (!str(item.descricao).trim()) {
      var date = normalizeIsoDate(item.data);
      if (date && lookup.seedDateKeys[date]) return true;
    }
    return false;
  }

  function hasDegenerateProcedimentos(list) {
    var arr = Array.isArray(list) ? list : [];
    for (var i = 0; i < arr.length; i++) {
      var item = arr[i];
      if (!item || typeof item !== "object") continue;
      if (str(item.data).trim() && !str(item.descricao).trim()) return true;
    }
    return false;
  }

  /** Itens actuais existem todos no seed do passômetro (ainda não editados manualmente). */
  function procedimentosArePassometroSubset(current, seed) {
    var cur = normalizeProcedimentos(current, null);
    var lookup = buildSeedProcedimentosLookup(seed);
    if (!lookup.list.length) return false;
    if (!cur.length) return true;
    for (var j = 0; j < cur.length; j++) {
      if (!procedimentoMatchesSeedItem(cur[j], lookup)) return false;
    }
    return true;
  }

  function procedimentosSameDatesOrdered(a, b) {
    var left = normalizeProcedimentos(a, null);
    var right = normalizeProcedimentos(b, null);
    if (left.length !== right.length) return false;
    for (var i = 0; i < left.length; i++) {
      if (normalizeIsoDate(left[i].data) !== normalizeIsoDate(right[i].data)) return false;
    }
    return true;
  }

  /**
   * Sincronizar procedimentos do passômetro quando vazio, incompleto (sem descrição),
   * subconjunto válido ou expansão (passômetro ganhou cirurgias).
   */
  function shouldSyncProcedimentosFromPassometro(laudo, seedProcedimentos, fillEmptyOnly) {
    if (!Array.isArray(seedProcedimentos) || !seedProcedimentos.length) return false;
    if (!fillEmptyOnly) return true;
    var current = resolveProcedimentosFromLaudo(laudo);
    var seed = normalizeProcedimentos(seedProcedimentos, null);
    if (!current.length) return true;
    if (hasDegenerateProcedimentos(current)) return true;
    if (!procedimentosArePassometroSubset(current, seed)) {
      // Corrige alta já poluída (descricao técnica no lugar do nome) quando datas ainda batem.
      if (
        procedimentosSameDatesOrdered(current, seed) &&
        !procedimentosListsEqual(current, seed)
      ) {
        return true;
      }
      return false;
    }
    return !procedimentosListsEqual(current, seed);
  }

  function procedimentosFromPassometroCirurgias(cirurgias, brDateToIso) {
    var list = [];
    var convert = typeof brDateToIso === "function" ? brDateToIso : normalizeIsoDate;
    if (!Array.isArray(cirurgias)) return list;
    for (var i = 0; i < cirurgias.length; i++) {
      var c = cirurgias[i];
      if (!c || typeof c !== "object") continue;
      // Titulo curto do procedimento vem de cirurgias[].nome (passometro).
      // Nao usar cirurgias[].descricao — e texto tecnico longo (aba Cirurgia).
      // Legacy descricao-only e promovido a nome em passometro-schema.normalizeCirurgiaItem.
      var nome = str(c.nome).trim();
      if (!nome) continue;
      var rawDate = str(c.data).trim();
      var data = rawDate ? convert(rawDate) : "";
      list.push({ descricao: nome, data: data });
    }
    return sortProcedimentosByDate(list);
  }

  function countMultilineLines(text) {
    var lines = str(text)
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map(function (line) {
        return line.trim();
      });
    while (lines.length && !lines[lines.length - 1]) lines.pop();
    return lines.length;
  }

  function formatAuxiliarLabel(index) {
    return String(index + 1) + "º AUXILIAR:";
  }

  function emptyEquipe() {
    return { staff: "", auxiliares: [] };
  }

  function normalizeAuxiliaresList(raw) {
    if (!raw || typeof raw !== "object") return [];
    if (Array.isArray(raw.auxiliares)) {
      var fromArray = [];
      for (var i = 0; i < raw.auxiliares.length; i++) {
        // Sem trim (ALTA-AC-97) — preserva espaço durante digitação.
        fromArray.push(String(raw.auxiliares[i] != null ? raw.auxiliares[i] : ""));
      }
      return fromArray;
    }
    var legacy = [];
    if (raw.auxiliar1 != null && String(raw.auxiliar1) !== "") {
      legacy.push(String(raw.auxiliar1));
    }
    if (raw.auxiliar2 != null && String(raw.auxiliar2) !== "") {
      legacy.push(String(raw.auxiliar2));
    }
    return legacy;
  }

  function trimTrailingEmptyAuxiliares(auxiliares) {
    var list = Array.isArray(auxiliares) ? auxiliares.slice() : [];
    // Cauda vazia: só "" (não trimar valores digitados com espaço).
    while (list.length && !list[list.length - 1]) list.pop();
    return list;
  }

  function equipeHasAuxiliarContent(auxiliares) {
    var list = Array.isArray(auxiliares) ? auxiliares : [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && String(list[i]).trim()) return true;
    }
    return false;
  }

  function normalizeEquipeItem(raw) {
    if (!raw || typeof raw !== "object") return emptyEquipe();
    return {
      // Sem trim (ALTA-AC-97) — preserva espaço durante digitação.
      staff: raw.staff != null ? String(raw.staff) : "",
      auxiliares: trimTrailingEmptyAuxiliares(normalizeAuxiliaresList(raw)),
    };
  }

  function setEquipeAuxiliarAt(equipe, index, value) {
    var eq = normalizeEquipeItem(equipe);
    var aux = eq.auxiliares.slice();
    while (aux.length <= index) aux.push("");
    aux[index] = value != null ? String(value) : "";
    eq.auxiliares = aux;
    return eq;
  }

  function mergeAuxiliaresLists(current, patch) {
    var left = Array.isArray(current) ? current : [];
    var right = Array.isArray(patch) ? patch : [];
    var maxLen = Math.max(left.length, right.length);
    var out = [];
    for (var i = 0; i < maxLen; i++) {
      var p = right[i] != null ? String(right[i]).trim() : "";
      var c = left[i] != null ? String(left[i]).trim() : "";
      out.push(p || c);
    }
    return trimTrailingEmptyAuxiliares(out);
  }

  function splitMultilineScalar(value, count) {
    var lines = str(value)
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map(function (line) {
        return line.trim();
      });
    while (lines.length && !lines[lines.length - 1]) lines.pop();
    if (!lines.length) return [];
    if (lines.length === 1 && count > 1) {
      var repeated = [];
      for (var i = 0; i < count; i++) repeated.push(lines[0]);
      return repeated;
    }
    return lines;
  }

  /**
   * @param {Array<{staff?: string, auxiliar1?: string, auxiliar2?: string}> | null | undefined} rawEquipes
   * @param {number} atoCount
   * @param {{ staff?: string, auxiliar1?: string, auxiliar2?: string } | null | undefined} legacyScalars
   */
  function normalizeEquipes(rawEquipes, atoCount, legacyScalars) {
    var equipes = [];
    if (Array.isArray(rawEquipes)) {
      for (var i = 0; i < rawEquipes.length; i++) {
        equipes.push(normalizeEquipeItem(rawEquipes[i]));
      }
    }
    legacyScalars = legacyScalars && typeof legacyScalars === "object" ? legacyScalars : {};
    var legacyStaff = legacyScalars.staff ? String(legacyScalars.staff).trim() : "";
    var legacyAux1 = legacyScalars.auxiliar1 ? String(legacyScalars.auxiliar1).trim() : "";
    var legacyAux2 = legacyScalars.auxiliar2 ? String(legacyScalars.auxiliar2).trim() : "";
    var hasLegacy = !!(legacyStaff || legacyAux1 || legacyAux2);
    var targetCount =
      typeof atoCount === "number" && atoCount >= 0
        ? atoCount
        : Math.max(equipes.length, hasLegacy ? 1 : 0);

    if (!equipes.length && hasLegacy && targetCount > 0) {
      var staffLines = splitMultilineScalar(legacyStaff, targetCount);
      var aux1Lines = splitMultilineScalar(legacyAux1, targetCount);
      var aux2Lines = splitMultilineScalar(legacyAux2, targetCount);
      for (var j = 0; j < targetCount; j++) {
        var auxA = aux1Lines[j] != null ? aux1Lines[j] : aux1Lines[0] || "";
        var auxB = aux2Lines[j] != null ? aux2Lines[j] : aux2Lines[0] || "";
        var auxiliares = [];
        if (auxA) auxiliares.push(auxA);
        if (auxB) auxiliares.push(auxB);
        equipes.push({
          staff: staffLines[j] != null ? staffLines[j] : staffLines[0] || "",
          auxiliares: auxiliares,
        });
      }
    } else if (!equipes.length && hasLegacy) {
      var legacyAuxiliares = [];
      if (legacyAux1) legacyAuxiliares.push(legacyAux1);
      if (legacyAux2) legacyAuxiliares.push(legacyAux2);
      equipes.push({
        staff: legacyStaff,
        auxiliares: legacyAuxiliares,
      });
    }

    if (targetCount > 0) {
      while (equipes.length < targetCount) equipes.push(emptyEquipe());
      if (equipes.length > targetCount) equipes = equipes.slice(0, targetCount);
    }

    return equipes;
  }

  /**
   * Auxiliares do cartão = Cirurgião (se ≠ chefe) + Auxiliar.
   * Supervisor fica de fora. Dedup por memberKey (CRM ou nome).
   * @param {{ members?: object[], chefe?: object|null }|null|undefined} parsed
   * @param {{ memberKey?: Function }|null|undefined} parseApi
   * @returns {string[]}
   */
  function auxiliaresFromParsedEquipe(parsed, parseApi) {
    if (!parsed || !Array.isArray(parsed.members) || !parsed.members.length) {
      return [];
    }
    var chefeKey = "";
    if (parsed.chefe && parseApi && typeof parseApi.memberKey === "function") {
      chefeKey = parseApi.memberKey(parsed.chefe);
    }
    var out = [];
    var seen = Object.create(null);
    if (chefeKey) seen[chefeKey] = true;
    for (var i = 0; i < parsed.members.length; i++) {
      var m = parsed.members[i];
      if (!m) continue;
      var role = m.role;
      if (role !== "cirurgiao" && role !== "auxiliar") continue;
      var name = str(m.name).trim();
      if (!name) continue;
      var key =
        parseApi && typeof parseApi.memberKey === "function"
          ? parseApi.memberKey(m)
          : name.toLowerCase();
      if (key && seen[key]) continue;
      if (key) seen[key] = true;
      out.push(name);
    }
    return out;
  }

  /**
   * Staff do retorno = chefe de cada cirurgias[].equipe.
   * Auxiliares = Cirurgião (≠ chefe) + Auxiliar; Supervisor fora.
   * Nunca reutiliza header.staff (chefe da internação).
   * Mesmo filtro/ordem que procedimentosFromPassometroCirurgias.
   * @param {object[]|null|undefined} cirurgias
   * @param {(br: string) => string} [brDateToIso]
   * @returns {{ staff: string, auxiliares: string[] }[]}
   */
  function equipesFromPassometroCirurgias(cirurgias, brDateToIso) {
    var convert = typeof brDateToIso === "function" ? brDateToIso : normalizeIsoDate;
    var rows = [];
    if (!Array.isArray(cirurgias)) return [];
    for (var i = 0; i < cirurgias.length; i++) {
      var c = cirurgias[i];
      if (!c || typeof c !== "object") continue;
      var nome = str(c.nome).trim();
      if (!nome) continue;
      var rawDate = str(c.data).trim();
      rows.push({
        data: rawDate ? convert(rawDate) : "",
        equipe: c.equipe,
      });
    }
    rows = sortProcedimentosByDate(rows);
    var parseApi = getEquipeParseApi();
    var out = [];
    for (var j = 0; j < rows.length; j++) {
      var staff = "";
      var auxiliares = [];
      if (parseApi && typeof parseApi.parseCirurgiaEquipe === "function") {
        var parsed = parseApi.parseCirurgiaEquipe({ equipe: rows[j].equipe });
        if (parsed && parsed.chefe && parsed.chefe.name) {
          staff = str(parsed.chefe.name).trim();
        }
        auxiliares = auxiliaresFromParsedEquipe(parsed, parseApi);
      }
      out.push({ staff: staff, auxiliares: auxiliares });
    }
    return out;
  }

  /**
   * @deprecated Prefer equipesFromPassometroCirurgias — não usar header.staff no retorno.
   * Mantido só para callers legados de teste; não semeia alta.
   */
  function equipesFromPassometroStaff(procedimentos, headerStaff) {
    var list = Array.isArray(procedimentos) ? procedimentos : [];
    var staff = headerStaff ? String(headerStaff).trim() : "";
    var out = [];
    for (var i = 0; i < list.length; i++) {
      out.push({ staff: staff, auxiliares: [] });
    }
    if (!list.length && staff) {
      out.push({ staff: staff, auxiliares: [] });
    }
    return out;
  }

  function equipesToDisplayLines(equipes) {
    var list = Array.isArray(equipes) ? equipes : [];
    var staffLines = [];
    var aux1Lines = [];
    var aux2Lines = [];
    for (var i = 0; i < list.length; i++) {
      var eq = normalizeEquipeItem(list[i]);
      staffLines.push(eq.staff);
      aux1Lines.push(eq.auxiliares[0] || "");
      aux2Lines.push(eq.auxiliares[1] || "");
    }
    return {
      staff: staffLines.join("\n"),
      auxiliar1: aux1Lines.join("\n"),
      auxiliar2: aux2Lines.join("\n"),
    };
  }

  function equipeIdentityKey(item) {
    var eq = normalizeEquipeItem(item);
    return eq.staff + "|" + eq.auxiliares.join("|");
  }

  function equipesListsEqual(a, b) {
    var left = Array.isArray(a) ? a : [];
    var right = Array.isArray(b) ? b : [];
    if (left.length !== right.length) return false;
    for (var i = 0; i < left.length; i++) {
      if (equipeIdentityKey(left[i]) !== equipeIdentityKey(right[i])) return false;
    }
    return true;
  }

  function equipesHasContent(equipes) {
    var list = Array.isArray(equipes) ? equipes : [];
    for (var i = 0; i < list.length; i++) {
      var eq = normalizeEquipeItem(list[i]);
      if (eq.staff || equipeHasAuxiliarContent(eq.auxiliares)) return true;
    }
    return false;
  }

  function mergeEquipesPatch(current, patch, atoCount) {
    var base = normalizeEquipes(current, atoCount, null);
    var next = normalizeEquipes(patch, atoCount, null);
    var out = [];
    for (var i = 0; i < atoCount; i++) {
      var cur = base[i] || emptyEquipe();
      var p = next[i] || emptyEquipe();
      out.push({
        staff: p.staff || cur.staff,
        auxiliares: mergeAuxiliaresLists(cur.auxiliares, p.auxiliares),
      });
    }
    return out;
  }

  function parseMultilineToEquipeField(multilineText, existingEquipes, field) {
    var lines = str(multilineText)
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map(function (line) {
        return line.trim();
      });
    while (lines.length && !lines[lines.length - 1]) lines.pop();
    var equipes = Array.isArray(existingEquipes) ? existingEquipes.slice() : [];
    var count = Math.max(equipes.length, lines.length);
    var auxIndex = field === "auxiliar2" ? 1 : field === "auxiliar1" ? 0 : -1;
    for (var i = 0; i < count; i++) {
      if (!equipes[i]) equipes[i] = emptyEquipe();
      if (field === "staff") {
        equipes[i] = normalizeEquipeItem(equipes[i]);
        if (i < lines.length) equipes[i].staff = lines[i];
      } else if (auxIndex >= 0 && i < lines.length) {
        equipes[i] = setEquipeAuxiliarAt(equipes[i], auxIndex, lines[i]);
      } else {
        equipes[i] = normalizeEquipeItem(equipes[i]);
      }
    }
    return equipes;
  }

  function applyMultilineEquipeScalarsToEquipes(equipes, scalars, atoCount) {
    var out = normalizeEquipes(equipes, atoCount, null);
    scalars = scalars && typeof scalars === "object" ? scalars : {};
    if (scalars.staff != null) {
      out = parseMultilineToEquipeField(scalars.staff, out, "staff");
    }
    if (scalars.auxiliar1 != null) {
      out = parseMultilineToEquipeField(scalars.auxiliar1, out, "auxiliar1");
    }
    if (scalars.auxiliar2 != null) {
      out = parseMultilineToEquipeField(scalars.auxiliar2, out, "auxiliar2");
    }
    return normalizeEquipes(out, atoCount, null);
  }

  /** Sincronizar equipes do passômetro quando vazias, incompletas ou ainda alinhadas ao seed. */
  function splitMultilineLines(text) {
    var lines = str(text)
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map(function (line) {
        return line.trim();
      });
    while (lines.length && !lines[lines.length - 1]) lines.pop();
    return lines;
  }

  function resolveRetornoAtoSlotCount(retorno) {
    retorno = retorno || {};
    var descCount = countMultilineLines(retorno.descricaoAto);
    var dateCount = countMultilineLines(retorno.dataCirurgia);
    var eqCount = Array.isArray(retorno.equipes) ? retorno.equipes.length : 0;
    var legacy =
      (retorno.staff && String(retorno.staff).trim()) ||
      (retorno.auxiliar1 && String(retorno.auxiliar1).trim()) ||
      (retorno.auxiliar2 && String(retorno.auxiliar2).trim());
    if (legacy && eqCount === 0) eqCount = 1;
    return Math.max(descCount, dateCount, eqCount);
  }

  function resolveRetornoAtos(retorno) {
    retorno = retorno || {};
    var descLines = splitMultilineLines(retorno.descricaoAto);
    var dateLines = splitMultilineLines(retorno.dataCirurgia);
    var equipes = Array.isArray(retorno.equipes) ? retorno.equipes.slice() : [];
    if (
      !equipes.length &&
      (retorno.staff != null || retorno.auxiliar1 != null || retorno.auxiliar2 != null)
    ) {
      var legacyCount = Math.max(descLines.length, dateLines.length, 1);
      equipes = normalizeEquipes(null, legacyCount, {
        staff: retorno.staff,
        auxiliar1: retorno.auxiliar1,
        auxiliar2: retorno.auxiliar2,
      });
    }
    var count = Math.max(descLines.length, dateLines.length, equipes.length);
    if (!count) return [];
    var out = [];
    for (var i = 0; i < count; i++) {
      var eq = normalizeEquipeItem(equipes[i]);
      out.push({
        descricao: descLines[i] != null ? descLines[i] : "",
        data: dateLines[i] != null ? dateLines[i] : "",
        staff: eq.staff,
        auxiliares: eq.auxiliares.slice(),
      });
    }
    return out;
  }

  function atosToRetornoFields(atos) {
    var list = Array.isArray(atos) ? atos : [];
    var descLines = [];
    var dateLines = [];
    var equipes = [];
    for (var i = 0; i < list.length; i++) {
      var a = list[i] && typeof list[i] === "object" ? list[i] : {};
      var desc = str(a.descricao).trim();
      var dataRaw = str(a.data).trim();
      var dataIso = dataRaw ? normalizeIsoDate(dataRaw) : "";
      descLines.push(desc ? desc.toUpperCase() : "");
      dateLines.push(dataIso || dataRaw);
      equipes.push(
        normalizeEquipeItem({
          staff: a.staff,
          auxiliares: a.auxiliares,
          auxiliar1: a.auxiliar1,
          auxiliar2: a.auxiliar2,
        }),
      );
    }
    while (descLines.length && !descLines[descLines.length - 1]) descLines.pop();
    while (dateLines.length && !dateLines[dateLines.length - 1]) dateLines.pop();
    while (equipes.length) {
      var lastEq = equipes[equipes.length - 1];
      if (lastEq.staff || equipeHasAuxiliarContent(lastEq.auxiliares)) break;
      equipes.pop();
    }
    return {
      descricaoAto: descLines.join("\n"),
      dataCirurgia: dateLines.join("\n"),
      equipes: equipes,
    };
  }

  function shouldSyncEquipesFromPassometro(retorno, seedEquipes, fillEmptyOnly) {
    if (!Array.isArray(seedEquipes) || !seedEquipes.length) return false;
    if (!fillEmptyOnly) return true;
    var current = Array.isArray(retorno.equipes) ? retorno.equipes : [];
    if (!current.length || !equipesHasContent(current)) return true;
    if (current.length !== seedEquipes.length) return true;
    for (var i = 0; i < seedEquipes.length; i++) {
      var cur = normalizeEquipeItem(current[i]);
      var seed = normalizeEquipeItem(seedEquipes[i]);
      if (equipeHasAuxiliarContent(cur.auxiliares)) return false;
      if (cur.staff && cur.staff !== seed.staff) return false;
    }
    return !equipesListsEqual(current, seedEquipes);
  }

  return {
    normalizeProcedimentoItem: normalizeProcedimentoItem,
    normalizeProcedimentos: normalizeProcedimentos,
    sortProcedimentosByDate: sortProcedimentosByDate,
    resolveProcedimentosFromLaudo: resolveProcedimentosFromLaudo,
    mirrorLaudoLegacyFields: mirrorLaudoLegacyFields,
    formatLaudoProcedimentosNarrative: formatLaudoProcedimentosNarrative,
    formatAtestadoProcedimentos: formatAtestadoProcedimentos,
    formatRetornoMultiline: formatRetornoMultiline,
    parseRetornoMultiline: parseRetornoMultiline,
    splitMultilineLines: splitMultilineLines,
    resolveRetornoAtoSlotCount: resolveRetornoAtoSlotCount,
    resolveRetornoAtos: resolveRetornoAtos,
    atosToRetornoFields: atosToRetornoFields,
    procedimentoIdentityKey: procedimentoIdentityKey,
    procedimentosListsEqual: procedimentosListsEqual,
    hasDegenerateProcedimentos: hasDegenerateProcedimentos,
    procedimentosArePassometroSubset: procedimentosArePassometroSubset,
    shouldSyncProcedimentosFromPassometro: shouldSyncProcedimentosFromPassometro,
    procedimentosFromPassometroCirurgias: procedimentosFromPassometroCirurgias,
    countMultilineLines: countMultilineLines,
    formatAuxiliarLabel: formatAuxiliarLabel,
    emptyEquipe: emptyEquipe,
    normalizeEquipeItem: normalizeEquipeItem,
    normalizeEquipes: normalizeEquipes,
    equipesFromPassometroCirurgias: equipesFromPassometroCirurgias,
    equipesFromPassometroStaff: equipesFromPassometroStaff,
    equipesToDisplayLines: equipesToDisplayLines,
    equipesListsEqual: equipesListsEqual,
    equipesHasContent: equipesHasContent,
    mergeEquipesPatch: mergeEquipesPatch,
    parseMultilineToEquipeField: parseMultilineToEquipeField,
    applyMultilineEquipeScalarsToEquipes: applyMultilineEquipeScalarsToEquipes,
    shouldSyncEquipesFromPassometro: shouldSyncEquipesFromPassometro,
  };
});

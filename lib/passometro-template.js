/**
 * Template partilhado do Passômetro (campos, layout, impressão).
 * Fonte única para editor web/popup e impressão PDF.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuPassometroTemplate = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var MAX_CUSTOM_FIELDS = 30;
  var TEMPLATE_VERSION = 1;

  function getLayout() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./passometro-layout.js");
      } catch (_e) {
        return null;
      }
    }
    if (typeof globalThis !== "undefined" && globalThis.AghuPassometroLayout) {
      return globalThis.AghuPassometroLayout;
    }
    return null;
  }

  function getSchema() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./passometro-schema.js");
      } catch (_e) {
        return null;
      }
    }
    if (typeof globalThis !== "undefined" && globalThis.AghuPassometroSchema) {
      return globalThis.AghuPassometroSchema;
    }
    return null;
  }

  function newFieldId(prefix) {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return prefix + "_" + crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    }
    return (
      prefix +
      "_" +
      Math.random().toString(36).slice(2, 10) +
      Date.now().toString(36)
    );
  }

  function str(v) {
    return v == null ? "" : String(v);
  }

  function cloneJson(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  var BUILTIN_HEADER = {
    nome: { label: "Nome", widget: "text", wide: false },
    idade: { label: "Idade", widget: "text", wide: false },
    prontuario: { label: "Prontuário", widget: "text", wide: false },
    peso: { label: "Peso", widget: "text", wide: false },
    staff: { label: "Staff", widget: "text", wide: false },
    dih: { label: "DIH", widget: "date", wide: false },
    diagnosticos: { label: "Diagnósticos", widget: "diagnosticos", wide: true },
    cirurgias: { label: "Cirurgias", widget: "cirurgias", wide: true },
    hdaHpp: { label: "HDA / HPP", widget: "textarea", wide: true },
  };

  var BUILTIN_ENTRY = {
    data: { label: "Data", widget: "date" },
    po: { label: "PO", widget: "text" },
    atb: { label: "ATB", widget: "text" },
    dieta: { label: "Dieta", widget: "text" },
    cd: { label: "CD", widget: "textarea", span: 7 },
    pendencias: { label: "Pendências", widget: "textarea", span: 7 },
    exames: { label: "Exames", widget: "text" },
    hv: { label: "HV", widget: "text" },
    sng: { label: "SNG", widget: "text" },
    analgesia: { label: "Analgesia", widget: "text" },
    fc: { label: "FC", widget: "text" },
    fr: { label: "FR", widget: "text" },
    sato2: { label: "SATO2", widget: "text" },
    pa: { label: "PA", widget: "text" },
    diurese: { label: "Diurese", widget: "text" },
    bh: { label: "BH", widget: "text" },
    drenos: { label: "Drenos", widget: "text" },
    drenoTl: { label: "TL", widget: "text" },
    drenoJp: { label: "JP", widget: "text" },
    drenoPig: { label: "PIG", widget: "text" },
    hgt: { label: "HGT", widget: "text" },
    vomitos: { label: "Vômitos", widget: "text" },
    tax: { label: "TAX", widget: "text" },
    fezes: { label: "Fezes", widget: "text" },
    fistulas: { label: "Fístulas", widget: "text" },
  };

  function builtinFieldDef(key, meta, section) {
    return {
      key: key,
      label: meta.label,
      section: section,
      kind: "builtin",
      widget: meta.widget || "text",
      wide: !!meta.wide,
      span: meta.span,
      visible: true,
    };
  }

  function buildDefaultFields() {
    var fields = [];
    var hk = Object.keys(BUILTIN_HEADER);
    for (var i = 0; i < hk.length; i++) {
      fields.push(builtinFieldDef(hk[i], BUILTIN_HEADER[hk[i]], "header"));
    }
    var ek = Object.keys(BUILTIN_ENTRY);
    for (var j = 0; j < ek.length; j++) {
      fields.push(builtinFieldDef(ek[j], BUILTIN_ENTRY[ek[j]], "entry"));
    }
    return fields;
  }

  function rowsFromLayout(section) {
    var layout = getLayout();
    if (!layout) return section === "header" ? [] : [];
    var raw =
      section === "header" ? layout.HEADER_ROWS : layout.GRID_ROWS;
    var out = [];
    for (var ri = 0; ri < raw.length; ri++) {
      var row = raw[ri];
      var cells = [];
      for (var ci = 0; ci < row.length; ci++) {
        var cell = row[ci];
        if (!cell) {
          cells.push(null);
          continue;
        }
        cells.push({
          key: cell[0],
          label: cell[1],
          wide: cell[2] === true,
          span: typeof cell[2] === "number" ? cell[2] : undefined,
        });
      }
      out.push(cells);
    }
    return out;
  }

  function defaultPrintOptions() {
    return {
      daysPerPage: 8,
      showInstitutionHeader: true,
      branding: "hucam",
      compactDayStrip: true,
    };
  }

  var DEFAULT_TEMPLATE = {
    version: TEMPLATE_VERSION,
    fields: buildDefaultFields(),
    headerRows: rowsFromLayout("header"),
    entryRows: rowsFromLayout("entry"),
    print: defaultPrintOptions(),
  };

  function fieldMapFromTemplate(tpl) {
    var map = Object.create(null);
    var fields = tpl && Array.isArray(tpl.fields) ? tpl.fields : [];
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      if (f && f.key) map[f.key] = f;
    }
    return map;
  }

  function countCustomLike(fields) {
    var n = 0;
    for (var i = 0; i < fields.length; i++) {
      var k = fields[i] && fields[i].kind;
      if (k === "custom" || k === "score") n++;
    }
    return n;
  }

  function sanitizeFieldDef(raw) {
    if (!raw || typeof raw !== "object" || !raw.key) return null;
    var key = str(raw.key).trim();
    if (!key) return null;
    var section = raw.section === "header" ? "header" : "entry";
    var kind = raw.kind;
    if (kind !== "builtin" && kind !== "custom" && kind !== "score") {
      kind = key.indexOf("custom_") === 0
        ? "custom"
        : key.indexOf("score_") === 0
          ? "score"
          : "builtin";
    }
    var out = {
      key: key,
      label: str(raw.label).trim() || key,
      section: section,
      kind: kind,
      widget: str(raw.widget).trim() || "text",
      visible: raw.visible !== false,
    };
    if (raw.wide) out.wide = true;
    if (typeof raw.span === "number" && raw.span > 1) out.span = raw.span;
    if (kind === "score") {
      out.scoreId = str(raw.scoreId).trim();
      out.scoreParams =
        raw.scoreParams && typeof raw.scoreParams === "object"
          ? cloneJson(raw.scoreParams)
          : {};
    }
    return out;
  }

  function sanitizeRows(rawRows, fieldMap, section) {
    if (!Array.isArray(rawRows)) return [];
    var out = [];
    for (var ri = 0; ri < rawRows.length; ri++) {
      var row = rawRows[ri];
      if (!Array.isArray(row)) continue;
      var cells = [];
      for (var ci = 0; ci < row.length; ci++) {
        var cell = row[ci];
        if (cell == null) {
          cells.push(null);
          continue;
        }
        var key =
          typeof cell === "string"
            ? cell
            : cell && cell.key
              ? str(cell.key)
              : "";
        if (!key) {
          cells.push(null);
          continue;
        }
        var def = fieldMap[key];
        if (!def || def.section !== section || def.visible === false) {
          cells.push(null);
          continue;
        }
        cells.push({
          key: key,
          label: str(cell.label).trim() || def.label,
          wide: !!(cell.wide || def.wide),
          span:
            typeof cell.span === "number"
              ? cell.span
              : typeof def.span === "number"
                ? def.span
                : undefined,
        });
      }
      if (cells.some(function (c) {
        return c != null;
      })) {
        out.push(cells);
      }
    }
    return out;
  }

  function fieldKeyInRows(rows, key) {
    for (var i = 0; i < rows.length; i++) {
      for (var j = 0; j < rows[i].length; j++) {
        if (rows[i][j] && rows[i][j].key === key) return true;
      }
    }
    return false;
  }

  function fixScoreFieldSections(fields) {
    var registry = getScoreRegistry();
    if (!registry || !registry.resolveScoreSection || !registry.catalogById) {
      return fields;
    }
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      if (f.kind !== "score" || !f.scoreId) continue;
      var meta = registry.catalogById(f.scoreId);
      var want = registry.resolveScoreSection(meta, {});
      if (f.section !== want) {
        f.section = want;
      }
      if (f.section === "entry" && typeof f.span === "number" && f.span >= 7) {
        delete f.span;
      }
    }
    return fields;
  }

  function ensureCustomScoreFieldsInRows(tpl) {
    for (var i = 0; i < tpl.fields.length; i++) {
      var f = tpl.fields[i];
      if (f.visible === false) continue;
      if (f.kind !== "custom" && f.kind !== "score") continue;
      var rows = f.section === "header" ? tpl.headerRows : tpl.entryRows;
      if (!fieldKeyInRows(rows, f.key)) {
        appendFieldToRows(tpl, f);
      }
    }
  }

  function upgradeLegacyFistulasSlot(entryRows) {
    for (var ri = 0; ri < entryRows.length; ri++) {
      var row = entryRows[ri];
      for (var ci = 0; ci < row.length; ci++) {
        if (row[ci] != null) continue;
        var prev = ci > 0 ? row[ci - 1] : null;
        var next = ci + 1 < row.length ? row[ci + 1] : null;
        if (prev && prev.key === "fezes" && next && next.key === "vomitos") {
          row[ci] = { key: "fistulas", label: "Fístulas" };
        }
      }
    }
    return entryRows;
  }

  function upgradeLegacyDiagnosticoField(fields, headerRows) {
    var outFields = [];
    var hasDiagnosticos = false;
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      if (!f || !f.key) continue;
      if (f.key === "diagnosticos") {
        hasDiagnosticos = true;
        outFields.push(
          Object.assign({}, f, {
            widget: "diagnosticos",
            wide: true,
            label: f.label || "Diagnósticos",
          }),
        );
        continue;
      }
      if (f.key === "diagnostico") {
        hasDiagnosticos = true;
        outFields.push(
          builtinFieldDef("diagnosticos", BUILTIN_HEADER.diagnosticos, "header"),
        );
        continue;
      }
      outFields.push(f);
    }
    if (!hasDiagnosticos && BUILTIN_HEADER.diagnosticos) {
      outFields.push(
        builtinFieldDef("diagnosticos", BUILTIN_HEADER.diagnosticos, "header"),
      );
    }

    var outRows = [];
    for (var ri = 0; ri < headerRows.length; ri++) {
      var row = headerRows[ri];
      if (!Array.isArray(row)) continue;
      var cells = [];
      var rowHasDiagnosticos = false;
      for (var ci = 0; ci < row.length; ci++) {
        var cell = row[ci];
        if (!cell) {
          cells.push(null);
          continue;
        }
        if (cell.key === "diagnostico" || cell.key === "diagnosticos") {
          if (!rowHasDiagnosticos) {
            cells.push({
              key: "diagnosticos",
              label: cell.label === "Diagnóstico" ? "Diagnósticos" : cell.label,
              wide: true,
            });
            rowHasDiagnosticos = true;
          }
          continue;
        }
        cells.push(cell);
      }
      if (
        cells.some(function (c) {
          return c != null;
        })
      ) {
        outRows.push(cells);
      }
    }
    return { fields: outFields, headerRows: outRows };
  }

  function sanitizeTemplate(raw) {
    if (!raw || typeof raw !== "object") return cloneJson(DEFAULT_TEMPLATE);
    var fields = [];
    var seen = Object.create(null);
    var rawFields = Array.isArray(raw.fields) ? raw.fields : [];
    for (var i = 0; i < rawFields.length; i++) {
      var f = sanitizeFieldDef(rawFields[i]);
      if (!f || seen[f.key]) continue;
      seen[f.key] = true;
      fields.push(f);
    }
    if (!fields.length) fields = cloneJson(DEFAULT_TEMPLATE.fields);

    fields = fixScoreFieldSections(fields);

    if (!seen.fistulas && BUILTIN_ENTRY.fistulas) {
      fields.push(builtinFieldDef("fistulas", BUILTIN_ENTRY.fistulas, "entry"));
      seen.fistulas = true;
    }

    if (countCustomLike(fields) > MAX_CUSTOM_FIELDS) {
      throw new Error("passometro_template_too_many_custom_fields");
    }

    var fieldMap = fieldMapFromTemplate({ fields: fields });
    var headerRows = sanitizeRows(raw.headerRows, fieldMap, "header");
    var entryRows = sanitizeRows(raw.entryRows, fieldMap, "entry");
    if (!headerRows.length) headerRows = cloneJson(DEFAULT_TEMPLATE.headerRows);
    if (!entryRows.length) entryRows = cloneJson(DEFAULT_TEMPLATE.entryRows);
    var upgraded = upgradeLegacyDiagnosticoField(fields, headerRows);
    fields = upgraded.fields;
    headerRows = upgraded.headerRows;
    entryRows = upgradeLegacyFistulasSlot(entryRows);
    entryRows = normalizeEntryCustomRows(entryRows, fieldMap);
    entryRows = compactScoreEntryRows(entryRows, fieldMap);
    entryRows = reorderCustomEntryRowsBeforeCd(entryRows, fieldMap);

    var print = defaultPrintOptions();
    if (raw.print && typeof raw.print === "object") {
      if (
        typeof raw.print.daysPerPage === "number" &&
        raw.print.daysPerPage >= 1 &&
        raw.print.daysPerPage <= 20
      ) {
        print.daysPerPage = Math.floor(raw.print.daysPerPage);
      }
      if (typeof raw.print.showInstitutionHeader === "boolean") {
        print.showInstitutionHeader = raw.print.showInstitutionHeader;
      }
      if (raw.print.branding) print.branding = str(raw.print.branding);
      if (typeof raw.print.compactDayStrip === "boolean") {
        print.compactDayStrip = raw.print.compactDayStrip;
      }
    }

    var tplDraft = {
      version: TEMPLATE_VERSION,
      fields: fields,
      headerRows: headerRows,
      entryRows: entryRows,
      print: print,
    };
    ensureCustomScoreFieldsInRows(tplDraft);
    headerRows = tplDraft.headerRows;
    entryRows = tplDraft.entryRows;
    entryRows = compactScoreEntryRows(entryRows, fieldMap);
    entryRows = alignEntryRowsForPrint(entryRows, fields);

    return {
      version: TEMPLATE_VERSION,
      fields: fields,
      headerRows: headerRows,
      entryRows: entryRows,
      print: print,
    };
  }

  /**
   * @param {object|null|undefined} userTemplate
   * @param {object|null|undefined} patientLayout
   */
  function resolveEffectiveTemplate(userTemplate, patientLayout) {
    if (patientLayout && typeof patientLayout === "object") {
      return sanitizeTemplate(patientLayout);
    }
    if (userTemplate && typeof userTemplate === "object") {
      return sanitizeTemplate(userTemplate);
    }
    return cloneJson(DEFAULT_TEMPLATE);
  }

  function templateToHeaderRows(tpl) {
    var t = sanitizeTemplate(tpl);
    return t.headerRows;
  }

  function templateToGridRows(tpl) {
    var t = sanitizeTemplate(tpl);
    return t.entryRows.map(function (row) {
      return row.map(function (cell) {
        if (!cell) return null;
        return [cell.key, cell.label, cell.span || (cell.wide ? true : undefined)];
      });
    });
  }

  function findFieldDef(tpl, key) {
    var map = fieldMapFromTemplate(sanitizeTemplate(tpl));
    return map[key] || null;
  }

  function isCustomKey(key) {
    return str(key).indexOf("custom_") === 0;
  }

  /** custom_* (template) + plantao_* (overlay plantão FEAT-114). */
  function normalizeCustomBag(src) {
    var out = {};
    if (!src || typeof src !== "object") return out;
    var keys = Object.keys(src);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (k.indexOf("custom_") !== 0 && k.indexOf("plantao_") !== 0) continue;
      out[k] = str(src[k]);
    }
    return out;
  }

  function getFieldValue(snap, fieldDef) {
    if (!fieldDef || !snap) return "";
    var section = fieldDef.section === "header" ? "header" : "entry";
    var container =
      section === "header"
        ? snap.header
        : snap.entry || snap;
    if (!container || typeof container !== "object") return "";
    if (fieldDef.kind === "custom" || isCustomKey(fieldDef.key)) {
      var custom = normalizeCustomBag(container.custom);
      return custom[fieldDef.key] || "";
    }
    if (fieldDef.kind === "score") return "";
    if (fieldDef.key === "cirurgias") {
      var poMod = getPoModule();
      if (poMod && poMod.formatCirurgiasDisplay) {
        return poMod.formatCirurgiasDisplay(container);
      }
      return "";
    }
    if (fieldDef.key === "diagnosticos") {
      var schemaMod = getSchema();
      if (schemaMod && schemaMod.formatDiagnosticosDisplay) {
        return schemaMod.formatDiagnosticosDisplay(container);
      }
      return "";
    }
    return str(container[fieldDef.key]);
  }

  function getPoModule() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./passometro-po.js");
      } catch (_e) {
        return null;
      }
    }
    if (typeof globalThis !== "undefined" && globalThis.AghuPassometroPo) {
      return globalThis.AghuPassometroPo;
    }
    return null;
  }

  function getFieldLimits() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./passometro-field-limits.js");
      } catch (_e) {
        return null;
      }
    }
    if (typeof globalThis !== "undefined" && globalThis.AghuPassometroFieldLimits) {
      return globalThis.AghuPassometroFieldLimits;
    }
    return null;
  }

  function clampValueForField(fieldDef, value) {
    var limits = getFieldLimits();
    if (!limits || typeof limits.clampFieldValue !== "function") {
      return str(value);
    }
    return limits.clampFieldValue(fieldDef, value);
  }

  function setFieldValue(snap, fieldDef, value) {
    if (!fieldDef || !snap) return snap;
    if (fieldDef.kind === "score") return snap;
    var section = fieldDef.section === "header" ? "header" : "entry";
    var limits = getFieldLimits();
    var key = fieldDef.key;
    var next = cloneJson(snap);
    if (section === "header") {
      if (!next.header || typeof next.header !== "object") next.header = {};
      if (
        key === "hdaHpp" &&
        limits &&
        typeof limits.clampHeaderNarrative === "function"
      ) {
        next.header.hdaHpp = value == null ? "" : String(value);
        next.header = limits.clampHeaderNarrative(
          next.header,
          "hdaHpp",
          null,
        );
      } else if (fieldDef.kind === "custom" || isCustomKey(fieldDef.key)) {
        var clampedH = clampValueForField(fieldDef, value);
        next.header.custom = normalizeCustomBag(next.header.custom);
        next.header.custom[fieldDef.key] = clampedH;
      } else {
        next.header[fieldDef.key] = clampValueForField(fieldDef, value);
      }
    } else {
      if (!next.entry || typeof next.entry !== "object") next.entry = {};
      if (
        (key === "cd" || key === "pendencias") &&
        limits &&
        typeof limits.clampCdPendenciasPair === "function"
      ) {
        var curCd =
          key === "cd" ? value : next.entry.cd != null ? next.entry.cd : "";
        var curPend =
          key === "pendencias"
            ? value
            : next.entry.pendencias != null
              ? next.entry.pendencias
              : "";
        var pair = limits.clampCdPendenciasPair(curCd, curPend, key);
        next.entry.cd = pair.cd;
        next.entry.pendencias = pair.pendencias;
      } else if (fieldDef.kind === "custom" || isCustomKey(fieldDef.key)) {
        next.entry.custom = normalizeCustomBag(next.entry.custom);
        next.entry.custom[fieldDef.key] = clampValueForField(fieldDef, value);
      } else {
        next.entry[fieldDef.key] = clampValueForField(fieldDef, value);
      }
    }
    return next;
  }

  function addCustomField(tpl, opts) {
    opts = opts || {};
    var t = sanitizeTemplate(tpl);
    if (countCustomLike(t.fields) >= MAX_CUSTOM_FIELDS) {
      throw new Error("passometro_template_too_many_custom_fields");
    }
    var section = opts.section === "header" ? "header" : "entry";
    var widget = opts.widget === "textarea" ? "textarea" : "text";
    var key = newFieldId("custom");
    var field = {
      key: key,
      label: str(opts.label).trim() || "Campo",
      section: section,
      kind: "custom",
      widget: widget,
      visible: true,
    };
    if (opts.wide) field.wide = true;
    if (typeof opts.span === "number") field.span = opts.span;
    else if (section === "entry") field.span = 7;
    t.fields.push(field);
    appendFieldToRows(t, field);
    return sanitizeTemplate(t);
  }

  function addScoreField(tpl, opts) {
    opts = opts || {};
    var t = sanitizeTemplate(tpl);
    if (countCustomLike(t.fields) >= MAX_CUSTOM_FIELDS) {
      throw new Error("passometro_template_too_many_custom_fields");
    }
    var scoreId = str(opts.scoreId).trim();
    if (!scoreId) throw new Error("passometro_score_id_required");
    var registry = getScoreRegistry();
    var meta =
      registry && registry.catalogById ? registry.catalogById(scoreId) : null;
    var section =
      registry && registry.resolveScoreSection
        ? registry.resolveScoreSection(meta, opts)
        : opts.section === "header"
          ? "header"
          : "entry";
    var key = newFieldId("score");
    var field = {
      key: key,
      label: str(opts.label).trim() || scoreId.toUpperCase(),
      section: section,
      kind: "score",
      scoreId: scoreId,
      scoreParams:
        opts.scoreParams && typeof opts.scoreParams === "object"
          ? cloneJson(opts.scoreParams)
          : {},
      widget: "score",
      visible: true,
    };
    t.fields.push(field);
    appendFieldToRows(t, field);
    return sanitizeTemplate(t);
  }

  function findInsertIndexBeforeCd(entryRows) {
    for (var i = 0; i < entryRows.length; i++) {
      var row = entryRows[i];
      for (var j = 0; j < row.length; j++) {
        if (row[j] && row[j].key === "cd") return i;
      }
    }
    for (var k = 0; k < entryRows.length; k++) {
      var r = entryRows[k];
      for (var l = 0; l < r.length; l++) {
        if (r[l] && r[l].key === "pendencias") return k;
      }
    }
    return entryRows.length;
  }

  function insertEntryRow(tpl, newRow) {
    var idx = findInsertIndexBeforeCd(tpl.entryRows);
    tpl.entryRows.splice(idx, 0, newRow);
  }

  var GRID_COLUMN_COUNT = 7;

  function defaultEntrySpanForField(field) {
    if (field.section !== "entry") return 1;
    if (field.kind === "custom") {
      return typeof field.span === "number" && field.span > 0 ? field.span : 7;
    }
    if (field.kind === "score") {
      return typeof field.span === "number" && field.span > 0 ? field.span : 1;
    }
    return field.span || 1;
  }

  function isBuiltinEntryKey(key) {
    return Object.prototype.hasOwnProperty.call(BUILTIN_ENTRY, key);
  }

  function isCanonicalEntryRow(row, fieldMap) {
    var filled = rowFilledCells(row);
    for (var i = 0; i < filled.length; i++) {
      var def = fieldMap[filled[i].key];
      if (!def || def.visible === false) continue;
      if (def.kind === "builtin" || isBuiltinEntryKey(filled[i].key)) return true;
    }
    return false;
  }

  function isScoreOnlyRow(row, fieldMap) {
    var filled = rowFilledCells(row);
    if (!filled.length) return false;
    for (var i = 0; i < filled.length; i++) {
      var def = fieldMap[filled[i].key];
      if (!def || def.kind !== "score") return false;
    }
    return true;
  }

  function isCustomFullRow(row, fieldMap) {
    var filled = rowFilledCells(row);
    if (filled.length !== 1) return false;
    var def = fieldMap[filled[0].key];
    return !!(def && def.section === "entry" && def.kind === "custom");
  }

  function padScoreRow(cells) {
    var row = cells.slice();
    while (row.length < GRID_COLUMN_COUNT) row.push(null);
    return row.slice(0, GRID_COLUMN_COUNT);
  }

  function buildPackedScoreRows(cells) {
    var rows = [];
    for (var i = 0; i < cells.length; i += GRID_COLUMN_COUNT) {
      rows.push(
        padScoreRow(
          cells.slice(i, i + GRID_COLUMN_COUNT).map(function (cell) {
            return { key: cell.key, label: cell.label, span: 1 };
          }),
        ),
      );
    }
    return rows;
  }

  function findScorePackSlot(entryRows, fieldMap, beforeIdx) {
    for (var i = beforeIdx - 1; i >= 0; i--) {
      var row = entryRows[i];
      if (!isScoreOnlyRow(row, fieldMap)) continue;
      for (var j = 0; j < row.length; j++) {
        if (row[j] == null) return { rowIdx: i, colIdx: j };
      }
    }
    return null;
  }

  function compactScoreEntryRows(entryRows, fieldMap) {
    var cdIdx = findInsertIndexBeforeCd(entryRows);
    var beforeCd = entryRows.slice(0, cdIdx);
    var afterCd = entryRows.slice(cdIdx);
    var kept = [];
    var scoreCells = [];
    var customRows = [];

    for (var ri = 0; ri < beforeCd.length; ri++) {
      var row = beforeCd[ri];
      if (isCanonicalEntryRow(row, fieldMap)) {
        kept.push(row);
        continue;
      }
      if (isCustomFullRow(row, fieldMap)) {
        customRows.push(row);
        continue;
      }
      if (isScoreOnlyRow(row, fieldMap)) {
        var filled = rowFilledCells(row);
        for (var fi = 0; fi < filled.length; fi++) {
          scoreCells.push(filled[fi]);
        }
        continue;
      }
      kept.push(row);
    }

    return kept.concat(buildPackedScoreRows(scoreCells), customRows, afterCd);
  }

  function appendFieldToRows(tpl, field) {
    if (field.section === "header") {
      if (field.wide) {
        tpl.headerRows.push([{ key: field.key, label: field.label, wide: true }]);
      } else {
        var last = tpl.headerRows[tpl.headerRows.length - 1];
        if (last && last.length === 1 && !last[0].wide) {
          last.push({ key: field.key, label: field.label });
        } else {
          tpl.headerRows.push([{ key: field.key, label: field.label }]);
        }
      }
      return;
    }
    var span = defaultEntrySpanForField(field);
    if (span >= 7) {
      insertEntryRow(tpl, [{ key: field.key, label: field.label, span: span }]);
      return;
    }
    if (field.kind === "score") {
      var fieldMap = fieldMapFromTemplate(tpl);
      var beforeIdx = findInsertIndexBeforeCd(tpl.entryRows);
      var slot = findScorePackSlot(tpl.entryRows, fieldMap, beforeIdx);
      var cell = { key: field.key, label: field.label, span: 1 };
      if (slot) {
        tpl.entryRows[slot.rowIdx][slot.colIdx] = cell;
        return;
      }
      insertEntryRow(tpl, padScoreRow([cell]));
      return;
    }
    insertEntryRow(tpl, [
      { key: field.key, label: field.label, span: span },
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
  }

  function normalizeEntryCustomRows(entryRows, fieldMap) {
    var out = [];
    for (var ri = 0; ri < entryRows.length; ri++) {
      var row = entryRows[ri];
      var filled = row.filter(function (c) {
        return c != null;
      });
      if (filled.length === 1) {
        var def = fieldMap[filled[0].key];
        if (
          def &&
          def.section === "entry" &&
          def.kind === "custom"
        ) {
          out.push([
            {
              key: filled[0].key,
              label: filled[0].label,
              span: 7,
            },
          ]);
          continue;
        }
      }
      out.push(row);
    }
    return out;
  }

  function reorderCustomEntryRowsBeforeCd(entryRows, fieldMap) {
    var customRows = [];
    var other = [];
    for (var i = 0; i < entryRows.length; i++) {
      var row = entryRows[i];
      if (isCustomFullRow(row, fieldMap)) {
        customRows.push(row);
      } else {
        other.push(row);
      }
    }
    if (!customRows.length) return entryRows;
    var cdIdx = other.findIndex(function (r) {
      return r.some(function (c) {
        return c && c.key === "cd";
      });
    });
    if (cdIdx < 0) cdIdx = other.length;
    return other.slice(0, cdIdx).concat(customRows, other.slice(cdIdx));
  }

  function rowFilledCells(row) {
    return (row || []).filter(function (c) {
      return c != null;
    });
  }

  function rowKeysSet(row) {
    var set = Object.create(null);
    var filled = rowFilledCells(row);
    for (var i = 0; i < filled.length; i++) {
      if (filled[i].key) set[filled[i].key] = true;
    }
    return set;
  }

  /**
   * @param {object[]} row
   * @param {object[][]} canonicalRows
   * @returns {number}
   */
  function findCanonicalRowIndex(row, canonicalRows) {
    var keys = rowKeysSet(row);
    var bestIdx = -1;
    var bestScore = 0;
    for (var ri = 0; ri < canonicalRows.length; ri++) {
      var cr = canonicalRows[ri];
      var filledCanon = rowFilledCells(cr);
      if (
        filledCanon.length === 1 &&
        (filledCanon[0].span >= 7 ||
          filledCanon[0].key === "cd" ||
          filledCanon[0].key === "pendencias")
      ) {
        continue;
      }
      var score = 0;
      for (var ci = 0; ci < cr.length; ci++) {
        if (cr[ci] && keys[cr[ci].key]) score++;
      }
      if (score > bestScore) {
        bestScore = score;
        bestIdx = ri;
      }
    }
    return bestScore > 0 ? bestIdx : -1;
  }

  /**
   * @param {object[]} row
   * @param {object[]} gridSlotRow
   * @param {object} fieldMap
   * @returns {object[]}
   */
  function mergeRowToGridSlots(row, gridSlotRow, fieldMap) {
    var byKey = Object.create(null);
    var filled = rowFilledCells(row);
    for (var i = 0; i < filled.length; i++) {
      if (filled[i].key) byKey[filled[i].key] = filled[i];
    }
    var out = [];
    for (var ci = 0; ci < gridSlotRow.length; ci++) {
      var slot = gridSlotRow[ci];
      if (!slot) {
        out.push(null);
        continue;
      }
      var def = fieldMap[slot.key];
      if (!def || def.visible === false) {
        out.push(null);
        continue;
      }
      var fromRow = byKey[slot.key];
      out.push(
        fromRow
          ? {
              key: fromRow.key,
              label: fromRow.label || slot.label,
              span: fromRow.span || slot.span,
              wide: fromRow.wide || slot.wide,
            }
          : {
              key: slot.key,
              label: slot.label,
              span: slot.span,
              wide: slot.wide,
            },
      );
    }
    return out;
  }

  /**
   * @param {object[]} row
   * @param {number} columns
   * @returns {object[]}
   */
  function padRowToGridColumns(row, columns) {
    var out = row.slice();
    while (out.length < columns) {
      out.push(null);
    }
    return out;
  }

  /**
   * @param {object[]} row
   * @param {object} fieldMap
   * @returns {boolean}
   */
  function isFullWidthPrintRow(row, fieldMap) {
    var filled = rowFilledCells(row);
    if (filled.length !== 1) return false;
    var cell = filled[0];
    if (cell.span >= 7 || cell.wide) return true;
    if (cell.key === "cd" || cell.key === "pendencias") return true;
    var def = fieldMap[cell.key];
    return !!(def && def.kind === "custom");
  }

  /**
   * Alinha entryRows persistidas (por vezes comprimidas) à grelha canónica de 7 colunas na impressão.
   * @param {object[][]} entryRows
   * @param {object[]} fields
   * @returns {object[][]}
   */
  function alignEntryRowsForPrint(entryRows, fields) {
    var fieldMap = fieldMapFromTemplate({ fields: fields || [] });
    var canonical = DEFAULT_TEMPLATE.entryRows;
    var out = [];

    for (var i = 0; i < entryRows.length; i++) {
      var row = entryRows[i];
      if (!Array.isArray(row)) continue;

      if (isFullWidthPrintRow(row, fieldMap)) {
        var filled = rowFilledCells(row);
        var cell = filled[0];
        out.push([
          {
            key: cell.key,
            label: cell.label,
            span: cell.span >= 7 ? cell.span : 7,
            wide: cell.wide,
          },
        ]);
        continue;
      }

      var canonIdx = findCanonicalRowIndex(row, canonical);
      if (canonIdx >= 0) {
        out.push(mergeRowToGridSlots(row, canonical[canonIdx], fieldMap));
        continue;
      }

      out.push(padRowToGridColumns(row, GRID_COLUMN_COUNT));
    }

    return out.length ? out : cloneJson(canonical);
  }

  function removeTemplateField(tpl, key) {
    var t = sanitizeTemplate(tpl);
    var field = null;
    for (var i = 0; i < t.fields.length; i++) {
      if (t.fields[i].key === key) {
        field = t.fields[i];
        break;
      }
    }
    if (!field || (field.kind !== "custom" && field.kind !== "score")) {
      return t;
    }
    var fields = t.fields.filter(function (f) {
      return f.key !== key;
    });
    function stripRows(rows) {
      return rows
        .map(function (row) {
          return row.filter(function (cell) {
            return cell && cell.key !== key;
          });
        })
        .filter(function (row) {
          return row.some(Boolean);
        });
    }
    return sanitizeTemplate({
      version: t.version,
      fields: fields,
      headerRows: stripRows(t.headerRows),
      entryRows: stripRows(t.entryRows),
      print: t.print,
    });
  }

  function setFieldVisible(tpl, key, visible) {
    var t = sanitizeTemplate(tpl);
    for (var i = 0; i < t.fields.length; i++) {
      if (t.fields[i].key === key) {
        t.fields[i].visible = !!visible;
        break;
      }
    }
    return sanitizeTemplate(t);
  }

  /**
   * Atualiza scoreParams de um campo score no template (flags clínicas).
   * @param {object} tpl
   * @param {string} fieldKey
   * @param {object} partial
   */
  function updateScoreFieldParams(tpl, fieldKey, partial) {
    var t = sanitizeTemplate(tpl);
    partial = partial || {};
    for (var i = 0; i < t.fields.length; i++) {
      if (t.fields[i].key === fieldKey && t.fields[i].kind === "score") {
        var prev = t.fields[i].scoreParams || {};
        t.fields[i].scoreParams = Object.assign({}, prev, partial);
        break;
      }
    }
    return sanitizeTemplate(t);
  }

  function getScoreRegistry() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./passometro-score-registry.js");
      } catch (_e) {
        return null;
      }
    }
    if (
      typeof globalThis !== "undefined" &&
      globalThis.AghuPassometroScoreRegistry
    ) {
      return globalThis.AghuPassometroScoreRegistry;
    }
    return null;
  }

  /**
   * @param {object} snap
   * @param {object} fieldDef
   * @param {object} context
   */
  function resolveFieldDisplay(snap, fieldDef, context) {
    context = context || {};
    if (!fieldDef) {
      return { status: "missing", display: "—" };
    }
    if (fieldDef.kind !== "score") {
      return { status: "ok", display: getFieldValue(snap, fieldDef) };
    }
    var registry = getScoreRegistry();
    if (!registry || !registry.evaluateScoreField) {
      return { status: "missing", display: "—", detail: "Score indisponível" };
    }
    return registry.evaluateScoreField(fieldDef, snap, context);
  }

  return {
    TEMPLATE_VERSION: TEMPLATE_VERSION,
    MAX_CUSTOM_FIELDS: MAX_CUSTOM_FIELDS,
    DEFAULT_TEMPLATE: DEFAULT_TEMPLATE,
    BUILTIN_HEADER: BUILTIN_HEADER,
    BUILTIN_ENTRY: BUILTIN_ENTRY,
    sanitizeTemplate: sanitizeTemplate,
    alignEntryRowsForPrint: alignEntryRowsForPrint,
    resolveEffectiveTemplate: resolveEffectiveTemplate,
    templateToHeaderRows: templateToHeaderRows,
    templateToGridRows: templateToGridRows,
    findFieldDef: findFieldDef,
    getFieldValue: getFieldValue,
    setFieldValue: setFieldValue,
    addCustomField: addCustomField,
    addScoreField: addScoreField,
    removeTemplateField: removeTemplateField,
    setFieldVisible: setFieldVisible,
    updateScoreFieldParams: updateScoreFieldParams,
    normalizeCustomBag: normalizeCustomBag,
    isCustomKey: isCustomKey,
    resolveFieldDisplay: resolveFieldDisplay,
    newFieldId: newFieldId,
  };
});

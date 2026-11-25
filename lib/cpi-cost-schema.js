/**
 * FEAT-150 — Schemas de captura de custo por episódio (motor da FEAT-143).
 * schemaId: "cost", captureKind: "episode". Sem I/O. Sem tabela externa de reembolso.
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuCpiCostSchema = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  function load(name, globalName) {
    if (typeof require === "function") {
      try {
        var mod = require("./" + name);
        if (mod && typeof mod === "object" && Object.keys(mod).length > 0) {
          return mod;
        }
      } catch (_e) {
        /* fall through */
      }
    }
    return (
      (root && root[globalName]) ||
      (typeof globalThis !== "undefined" && globalThis[globalName]) ||
      null
    );
  }

  var schemaApi = load("cpi-capture-schema.js", "AghuCpiCaptureSchema");

  var SCHEMA_ID = "cost";
  var CAPTURE_KIND = "episode";
  var WRITE_PERMISSION = "write_cost_capture";

  var COST_FIELD_KEYS = Object.freeze([
    "custoDiaria",
    "custoBlocoSala",
    "custoFarmacia",
    "custoExames",
  ]);

  var COST_FIELD_LABELS = {
    custoDiaria: "Custo de diária/leito",
    custoBlocoSala: "Custo de bloco/sala cirúrgica",
    custoFarmacia: "Custo de farmácia",
    custoExames: "Custo de exames complementares",
  };

  var VAL02_BY_LINE = Object.freeze({
    cg_abdome_agudo_obstrucao: "CG-obs-VAL-02",
    cad_esofagogastrica: "CAD-eso-VAL-02",
    sep_sepse_choque: "SEP-VAL-02",
    uti_admissao_nao_planeada: "UTI-VAL-02",
  });

  var CARE_LINE_IDS = Object.freeze(Object.keys(VAL02_BY_LINE));

  function str(v) {
    return v == null ? "" : String(v).trim();
  }

  function asArray(v) {
    return Array.isArray(v) ? v : [];
  }

  function costFieldsForLine(careLineId, fieldOverrides) {
    var val02 = VAL02_BY_LINE[careLineId];
    var over = fieldOverrides && typeof fieldOverrides === "object" ? fieldOverrides : {};
    var feeds = asArray(over.feedsIndicators);
    if (!feeds.length) feeds = val02 ? [val02] : [];
    return COST_FIELD_KEYS.map(function (key) {
      var field = {
        key: key,
        label: COST_FIELD_LABELS[key],
        type: over.type != null ? over.type : "number",
        unit: over.unit != null ? over.unit : "brl_cents",
        required: true,
        feedsIndicators: feeds.slice(),
      };
      if (!over.omitMin) {
        field.min = over.min != null ? over.min : 0;
      }
      return field;
    });
  }

  function schemaDefForLine(careLineId, fieldOverrides) {
    return {
      schemaId: SCHEMA_ID,
      careLineId: careLineId,
      captureKind: CAPTURE_KIND,
      captureVersion: 1,
      requiredPermission: WRITE_PERMISSION,
      fields: costFieldsForLine(careLineId, fieldOverrides),
    };
  }

  function validateCostSchema(def) {
    var errors = [];
    if (!def || typeof def !== "object") {
      return { ok: false, errors: ["schema de custo em falta"] };
    }
    var careLineId = str(def.careLineId);
    var val02 = VAL02_BY_LINE[careLineId];
    if (!val02) {
      errors.push("careLineId de custo não suportado");
    }
    if (str(def.schemaId) !== SCHEMA_ID) {
      errors.push("schemaId de custo deve ser 'cost'");
    }
    if (str(def.requiredPermission) !== WRITE_PERMISSION) {
      errors.push("requiredPermission deve ser write_cost_capture");
    }
    var fields = asArray(def.fields);
    if (!fields.length) errors.push("fields não pode ser vazio");
    for (var i = 0; i < fields.length; i++) {
      var field = fields[i] || {};
      var key = str(field.key);
      if (str(field.type) !== "number") {
        errors.push("campo '" + key + "' exige type number");
      }
      if (str(field.unit) !== "brl_cents") {
        errors.push("campo '" + key + "' exige unit brl_cents");
      }
      if (field.min == null || Number(field.min) !== 0) {
        errors.push("campo '" + key + "' exige min 0");
      }
      var feeds = asArray(field.feedsIndicators).map(str).filter(Boolean);
      if (!val02) continue;
      if (!feeds.length) {
        errors.push("campo '" + key + "' exige feedsIndicators para " + val02);
      } else {
        for (var f = 0; f < feeds.length; f++) {
          if (feeds[f] !== val02) {
            errors.push(
              "campo '" +
                key +
                "' feedsIndicators deve resolver para " +
                val02,
            );
          }
        }
      }
    }
    if (errors.length) return { ok: false, errors: errors };
    if (!schemaApi || typeof schemaApi.validateCaptureSchema !== "function") {
      return { ok: false, errors: ["motor de schema em falta"] };
    }
    return schemaApi.validateCaptureSchema(def);
  }

  function registerCostSchemas() {
    if (!schemaApi || typeof schemaApi.registerCaptureSchema !== "function") {
      return { ok: false, errors: ["motor de schema em falta"], schemas: [] };
    }
    var schemas = [];
    var errors = [];
    for (var i = 0; i < CARE_LINE_IDS.length; i++) {
      var def = schemaDefForLine(CARE_LINE_IDS[i]);
      var costCheck = validateCostSchema(def);
      if (!costCheck.ok) {
        errors = errors.concat(costCheck.errors || ["validação de custo falhou"]);
        continue;
      }
      var result = schemaApi.registerCaptureSchema(def);
      if (!result.ok) {
        errors = errors.concat(result.errors || ["registo falhou"]);
      } else if (result.schema) {
        schemas.push(result.schema);
      }
    }
    return { ok: errors.length === 0, errors: errors, schemas: schemas };
  }

  function isCostCents(n) {
    return typeof n === "number" && Number.isInteger(n) && n >= 0;
  }

  function sumCostComponents(values, unanswered) {
    if (asArray(unanswered).length) return null;
    if (!values || typeof values !== "object") return null;
    var sum = 0;
    for (var i = 0; i < COST_FIELD_KEYS.length; i++) {
      var key = COST_FIELD_KEYS[i];
      if (!Object.prototype.hasOwnProperty.call(values, key)) return null;
      var n = values[key];
      if (!isCostCents(n)) return null;
      sum += n;
    }
    return sum;
  }

  /** CPIVAL2-AC-14 — recusa explícita de tabela externa de reembolso. */
  function inferEpisodeCostFromExternal(_input) {
    return {
      episodeCost: null,
      icuEpisodeCost: null,
      refused: true,
      reason: "no_external_fee_schedule",
    };
  }

  function isCostRow(row) {
    if (!row || typeof row !== "object") return false;
    return str(row.schemaId || row.schema_id) === SCHEMA_ID;
  }

  registerCostSchemas();

  return {
    SCHEMA_ID: SCHEMA_ID,
    CAPTURE_KIND: CAPTURE_KIND,
    WRITE_PERMISSION: WRITE_PERMISSION,
    COST_FIELD_KEYS: COST_FIELD_KEYS,
    VAL02_BY_LINE: VAL02_BY_LINE,
    CARE_LINE_IDS: CARE_LINE_IDS,
    schemaDefForLine: schemaDefForLine,
    validateCostSchema: validateCostSchema,
    registerCostSchemas: registerCostSchemas,
    sumCostComponents: sumCostComponents,
    inferEpisodeCostFromExternal: inferEpisodeCostFromExternal,
    isCostRow: isCostRow,
  };
});

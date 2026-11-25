/**
 * FEAT-143 — Schema declarativo de captura clínica built-in.
 * Registo em memória (formulários concretos entram nas FEAT-147/148/149).
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuCpiCaptureSchema = api;
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

  var indicatorApi = load("cpi-indicator-library.js", "AghuCpiIndicatorLibrary");

  var CAPTURE_KINDS = Object.freeze(["episode", "longitudinal"]);
  var FIELD_TYPES = Object.freeze(["enum", "number", "boolean", "date", "text"]);

  /** 19 chaves de topo de extractPatientFacts — ver SPEC-DRIFT no plan.md. */
  var EXTRACTED_FACT_KEYS = Object.freeze([
    "recordClientId",
    "record_client_id",
    "hasPassometro",
    "hasPatientEpisodes",
    "dxInPeriod",
    "dxUndated",
    "dxUndatedItems",
    "cirInPeriod",
    "hasDxPeriod",
    "hasCirPeriod",
    "hasEquipePeriod",
    "hasAnyEvent",
    "compEvents",
    "hospEpisodes",
    "hospStartedInPeriod",
    "hospWithIcuEventInPeriod",
    "icuAdmissions",
    "deathEvents",
    "hasDeathInPeriod",
  ]);

  var EXTRACTED_FACT_ALIASES = Object.freeze(["losDays", "complications"]);

  var reservedKeys = {};
  EXTRACTED_FACT_KEYS.forEach(function (k) {
    reservedKeys[k] = true;
  });
  EXTRACTED_FACT_ALIASES.forEach(function (k) {
    reservedKeys[k] = true;
  });

  var registry = [];

  function str(v) {
    return v == null ? "" : String(v).trim();
  }

  function asArray(v) {
    return Array.isArray(v) ? v : [];
  }

  function indicatorExists(id) {
    var want = str(id);
    if (!want) return false;
    var list = [];
    if (indicatorApi && typeof indicatorApi.listIndicators === "function") {
      list = asArray(indicatorApi.listIndicators());
    } else if (indicatorApi && Array.isArray(indicatorApi.INDICATORS)) {
      list = indicatorApi.INDICATORS;
    }
    for (var i = 0; i < list.length; i++) {
      if (list[i] && str(list[i].id) === want) return true;
    }
    return false;
  }

  function cloneMilestones(raw) {
    if (!raw || typeof raw !== "object") return undefined;
    return {
      key: str(raw.key),
      anchor: str(raw.anchor),
      windowsDays: asArray(raw.windowsDays)
        .map(function (d) {
          return Number(d);
        })
        .filter(function (n) {
          return Number.isFinite(n) && n > 0;
        }),
      graceDays: Number(raw.graceDays),
    };
  }

  function cloneSchema(def) {
    var out = {
      schemaId: str(def.schemaId),
      careLineId: str(def.careLineId),
      captureKind: str(def.captureKind),
      captureVersion: Number(def.captureVersion),
      fields: asArray(def.fields).map(function (f) {
        return {
          key: str(f && f.key),
          label: str(f && f.label),
          type: str(f && f.type),
          values: asArray(f && f.values).slice(),
          unit: f && f.unit != null ? str(f.unit) : undefined,
          required: !!(f && f.required),
          feedsIndicators: asArray(f && f.feedsIndicators).map(str),
        };
      }),
    };
    var ms = cloneMilestones(def.milestones);
    if (ms) out.milestones = ms;
    return out;
  }

  function conflictingSchemaId(careLineId, key, exceptSchemaId) {
    for (var i = 0; i < registry.length; i++) {
      var s = registry[i];
      if (!s || s.careLineId !== careLineId) continue;
      if (s.schemaId === exceptSchemaId) continue;
      for (var f = 0; f < s.fields.length; f++) {
        if (s.fields[f].key === key) return s.schemaId;
      }
    }
    return null;
  }

  function validateCaptureSchema(def) {
    var errors = [];
    if (!def || typeof def !== "object") {
      return { ok: false, errors: ["schema em falta"] };
    }
    var schemaId = str(def.schemaId);
    var careLineId = str(def.careLineId);
    var captureKind = str(def.captureKind);
    var captureVersion = Number(def.captureVersion);
    if (!schemaId) errors.push("schemaId é obrigatório");
    if (!careLineId) errors.push("careLineId é obrigatório");
    if (CAPTURE_KINDS.indexOf(captureKind) === -1) {
      errors.push("captureKind deve ser episode ou longitudinal");
    }
    if (!Number.isFinite(captureVersion) || captureVersion < 1) {
      errors.push("captureVersion inválido");
    }
    var fields = asArray(def.fields);
    if (!fields.length) errors.push("fields não pode ser vazio");

    var seenInSchema = {};
    for (var i = 0; i < fields.length; i++) {
      var field = fields[i] || {};
      var key = str(field.key);
      if (!key) {
        errors.push("campo sem key");
        continue;
      }
      if (reservedKeys[key]) {
        errors.push(
          "campo '" + key + "' duplica facto que extractPatientFacts já devolve",
        );
      }
      if (seenInSchema[key]) {
        errors.push("key '" + key + "' repetida neste schema");
      }
      seenInSchema[key] = true;
      if (FIELD_TYPES.indexOf(str(field.type)) === -1) {
        errors.push("campo '" + key + "' tem type inválido");
      }
      if (str(field.type) === "enum" && !asArray(field.values).length) {
        errors.push("campo '" + key + "' enum exige values");
      }
      var feeds = asArray(field.feedsIndicators).map(str).filter(Boolean);
      if (!feeds.length) {
        errors.push("campo '" + key + "' exige feedsIndicators não vazio");
      } else {
        for (var fi = 0; fi < feeds.length; fi++) {
          if (!indicatorExists(feeds[fi])) {
            errors.push(
              "indicador '" + feeds[fi] + "' não existe na biblioteca",
            );
          }
        }
      }
      var clash = conflictingSchemaId(careLineId, key, schemaId);
      if (clash) {
        errors.push(
          "key '" + key + "' já declarada no schemaId '" + clash + "'",
        );
      }
    }

    // CPINEF2-AC-06: longitudinal exige milestones completos
    if (captureKind === "longitudinal") {
      var ms = def.milestones;
      if (!ms || typeof ms !== "object") {
        errors.push("milestones é obrigatório quando captureKind é longitudinal");
      } else {
        if (!str(ms.key)) errors.push("milestones.key é obrigatório");
        if (!str(ms.anchor)) errors.push("milestones.anchor é obrigatório");
        var windows = asArray(ms.windowsDays);
        if (!windows.length) {
          errors.push("milestones.windowsDays é obrigatório");
        }
        if (
          ms.graceDays == null ||
          !Number.isFinite(Number(ms.graceDays)) ||
          Number(ms.graceDays) < 0
        ) {
          errors.push("milestones.graceDays é obrigatório");
        }
      }
    }

    if (errors.length) return { ok: false, errors: errors };
    return { ok: true, errors: [], schema: cloneSchema(def) };
  }

  function registerCaptureSchema(def) {
    var validated = validateCaptureSchema(def);
    if (!validated.ok) return validated;

    var stored = validated.schema;
    var replaced = false;
    for (var r = 0; r < registry.length; r++) {
      if (
        registry[r].schemaId === stored.schemaId &&
        registry[r].careLineId === stored.careLineId &&
        registry[r].captureVersion === stored.captureVersion
      ) {
        registry[r] = stored;
        replaced = true;
        break;
      }
    }
    if (!replaced) registry.push(stored);
    return { ok: true, schema: stored, errors: [] };
  }

  function getCaptureSchema(schemaId, version, careLineId) {
    var id = str(schemaId);
    var line = careLineId != null ? str(careLineId) : "";
    var found = null;
    for (var i = 0; i < registry.length; i++) {
      if (registry[i].schemaId !== id) continue;
      if (line && registry[i].careLineId !== line) continue;
      if (version != null && Number(version) === registry[i].captureVersion) {
        return registry[i];
      }
      if (
        version == null &&
        (!found || registry[i].captureVersion > found.captureVersion)
      ) {
        found = registry[i];
      }
    }
    return found;
  }

  function listCaptureSchemas(careLineId) {
    var line = careLineId != null ? str(careLineId) : "";
    if (!line) return registry.slice();
    return registry.filter(function (s) {
      return s.careLineId === line;
    });
  }

  function listFieldsFeedingIndicator(indicatorId) {
    var want = str(indicatorId);
    var out = [];
    var seen = {};
    for (var i = 0; i < registry.length; i++) {
      var fields = registry[i].fields;
      for (var f = 0; f < fields.length; f++) {
        if (fields[f].feedsIndicators.indexOf(want) === -1) continue;
        if (seen[fields[f].key]) continue;
        seen[fields[f].key] = true;
        out.push(fields[f]);
      }
    }
    return out;
  }

  function resetCaptureSchemas() {
    registry.length = 0;
  }

  return {
    EXTRACTED_FACT_KEYS: EXTRACTED_FACT_KEYS,
    EXTRACTED_FACT_ALIASES: EXTRACTED_FACT_ALIASES,
    CAPTURE_KINDS: CAPTURE_KINDS,
    validateCaptureSchema: validateCaptureSchema,
    registerCaptureSchema: registerCaptureSchema,
    getCaptureSchema: getCaptureSchema,
    listCaptureSchemas: listCaptureSchemas,
    listFieldsFeedingIndicator: listFieldsFeedingIndicator,
    resetCaptureSchemas: resetCaptureSchemas,
  };
});

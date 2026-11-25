/**
 * Resolução de valores AGHU para critérios de elegibilidade (hub root).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuProtocolFieldResolve = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var pathsApi = null;
  var examApi = null;
  var enrichmentApi = null;
  var researchResolveApi = null;
  var catalogApi = null;
  var patientEpisodesApi = null;
  var ageFromDobApi = null;
  var prescricoesApi = null;

  try {
    if (typeof require === "function") {
      pathsApi = require("./aghu-protocol-field-paths.js");
      examApi = require("./exam-latest-value.js");
      enrichmentApi = require("./hpb-research-enrichment.js");
      researchResolveApi = require("./research-aghu-field-resolve.js");
      catalogApi = require("./aghu-research-variable-catalog.js");
      patientEpisodesApi = require("./patient-episodes-schema.js");
      ageFromDobApi = require("./age-from-dob.js");
      prescricoesApi = require("./prescricoes-normalize.js");
    }
  } catch (_e) {}

  function str(v) {
    return v == null ? "" : String(v).trim();
  }

  function getNested(obj, pathParts) {
    var cur = obj;
    for (var i = 0; i < pathParts.length; i++) {
      if (cur == null || typeof cur !== "object") return undefined;
      cur = cur[pathParts[i]];
    }
    return cur;
  }

  function resolveAnchorISO(anchorPath, ctx) {
    if (!anchorPath) return null;
    var parts = anchorPath.split(".");
    if (parts[0] === "episode" && ctx.episode) {
      return str(getNested(ctx.episode, parts.slice(1)));
    }
    if (parts[0] === "surgery" && ctx.surgery) {
      return str(getNested(ctx.surgery, parts.slice(1)));
    }
    if (ctx.entity && ctx.entity.values) {
      var formId = parts[0];
      var fieldKey = parts.slice(1).join(".");
      if (parts.length === 2 && ctx.entity.formId === formId) {
        return str(ctx.entity.values[fieldKey]);
      }
    }
    return null;
  }

  function numericFromHit(hit) {
    if (!hit) return undefined;
    if (hit.value != null && examApi && examApi.parseNumericValue) {
      var n = examApi.parseNumericValue(hit.value);
      if (Number.isFinite(n)) return n;
    }
    if (typeof hit === "number") return hit;
    if (typeof hit === "string") {
      var parsed = Number(hit.replace(",", "."));
      if (Number.isFinite(parsed)) return parsed;
    }
    return hit.value != null ? hit.value : hit;
  }

  /**
   * rowContext default para auto-enroll: último episódio activo + surgeryIndex 0.
   */
  function defaultHubRowContext(patientDomains, anchorCtx) {
    if (
      anchorCtx &&
      (str(anchorCtx.patientEpisodeId) ||
        (anchorCtx.surgeryIndex != null && anchorCtx.surgeryIndex !== ""))
    ) {
      return {
        grain: str(anchorCtx.grain) || "surgery",
        patientEpisodeId: str(anchorCtx.patientEpisodeId) || undefined,
        surgeryIndex:
          anchorCtx.surgeryIndex != null && anchorCtx.surgeryIndex !== ""
            ? Number(anchorCtx.surgeryIndex)
            : 0,
      };
    }
    var episodeId = "";
    if (patientEpisodesApi) {
      var snap = patientEpisodesApi.normalizeSnapshot(
        (patientDomains && patientDomains.patient_episodes) ||
          patientEpisodesApi.emptySnapshot(),
      );
      var active = patientEpisodesApi.filterActiveEntries(snap);
      if (active.length) episodeId = str(active[active.length - 1].id);
    }
    return {
      grain: "surgery",
      patientEpisodeId: episodeId || undefined,
      surgeryIndex: 0,
    };
  }

  function resolveHubCatalogValue(patientDomains, parsed, anchorCtx) {
    if (!researchResolveApi || !catalogApi || !parsed.catalogKey) {
      return undefined;
    }
    var entry = catalogApi.findCatalogEntry(parsed.catalogKey);
    if (!entry || !entry.resolution) return undefined;
    var rowCtx = defaultHubRowContext(patientDomains, anchorCtx);
    if (parsed.domain === "clinical_episode") {
      var cl = researchResolveApi.resolveClinicalEpisodeValue(
        patientDomains || {},
        entry.resolution,
        rowCtx,
      );
      var clVal = cl && cl.value != null ? str(cl.value) : "";
      return clVal !== "" ? clVal : undefined;
    }
    if (parsed.domain === "passometro_surgery") {
      var pm = researchResolveApi.resolvePassometroSurgeryValue(
        patientDomains || {},
        entry.resolution,
        rowCtx,
      );
      var pmVal = pm && pm.value != null ? str(pm.value) : "";
      return pmVal !== "" ? pmVal : undefined;
    }
    return undefined;
  }

  function formatRxField(entry, rxKey) {
    if (!entry || !rxKey) return undefined;
    var raw = entry[rxKey];
    if (Array.isArray(raw)) {
      var parts = [];
      for (var i = 0; i < raw.length; i++) {
        var s = str(raw[i]);
        if (s) parts.push(s);
      }
      return parts.length ? parts.join("; ") : undefined;
    }
    var text = str(raw);
    return text !== "" ? text : undefined;
  }

  function resolvePiiValue(patientDomains, parsed, anchorCtx) {
    var pii = patientDomains && patientDomains.pii;
    if (!pii || typeof pii !== "object") return undefined;
    if (parsed.piiKey === "sexo") {
      var sex = str(pii.sexo || pii.sex);
      return sex !== "" ? sex : undefined;
    }
    if (parsed.piiKey === "idade") {
      if (!ageFromDobApi) return undefined;
      var anchorISO = "";
      if (anchorCtx) {
        if (str(anchorCtx.referenceDateISO)) {
          anchorISO = str(anchorCtx.referenceDateISO);
        } else if (anchorCtx.surgery && anchorCtx.surgery.core) {
          anchorISO = str(anchorCtx.surgery.core.date);
        }
      }
      var age = null;
      if (ageFromDobApi.resolveAgeYears) {
        age = ageFromDobApi.resolveAgeYears({
          pii: pii,
          referenceDateISO: anchorISO || null,
        });
      } else if (ageFromDobApi.computeAgeYearsFromIso) {
        age = ageFromDobApi.computeAgeYearsFromIso(
          pii.dataNascimento || pii.dataNascimentoISO,
          anchorISO || null,
        );
      }
      return age != null && Number.isFinite(age) ? age : undefined;
    }
    return undefined;
  }

  function resolvePrescricoesValue(patientDomains, parsed) {
    if (!prescricoesApi || !prescricoesApi.getLatestPrescricaoEntry) {
      return undefined;
    }
    var entry = prescricoesApi.getLatestPrescricaoEntry(
      patientDomains && patientDomains.prescricoes,
    );
    return formatRxField(entry, parsed.rxKey);
  }

  function resolveAghuFieldValue(patientDomains, criterion, anchorCtx) {
    if (!pathsApi || !criterion) return undefined;
    var parsed = pathsApi.parseAghuFieldPath(criterion.field);
    if (!parsed) return undefined;

    if (
      parsed.domain === "clinical_episode" ||
      parsed.domain === "passometro_surgery"
    ) {
      return resolveHubCatalogValue(patientDomains, parsed, anchorCtx);
    }

    if (parsed.domain === "pii") {
      return resolvePiiValue(patientDomains, parsed, anchorCtx);
    }

    if (parsed.domain === "prescricoes") {
      return resolvePrescricoesValue(patientDomains, parsed);
    }

    var context = pathsApi.normalizeCriterionContext(criterion.context) || {
      anchor: "surgery.core.date",
      fromDays: null,
      toDays: null,
      serumOnly: false,
      preferTargetDay: null,
    };
    var anchorISO = resolveAnchorISO(context.anchor, anchorCtx || {});
    var exams = (patientDomains && patientDomains.exams) || null;
    var controles = (patientDomains && patientDomains.controles) || null;

    if (parsed.domain === "exam" && examApi) {
      if (!exams) return undefined;
      if (anchorISO && (context.fromDays != null || context.toDays != null)) {
        var hit = examApi.getAnalyteInWindow(exams, parsed.sigla, anchorISO, {
          fromDays: context.fromDays != null ? context.fromDays : -3650,
          toDays: context.toDays != null ? context.toDays : 0,
          serumOnly: context.serumOnly,
          preferTargetDay: context.preferTargetDay,
        });
        return numericFromHit(hit);
      }
      var latest = context.serumOnly
        ? examApi.getLatestSerumAnalyteValue(exams, parsed.sigla)
        : examApi.getLatestAnalyteValue(exams, parsed.sigla);
      return numericFromHit(latest);
    }

    if (parsed.domain === "controles" && enrichmentApi && enrichmentApi.getVitalsInWindow) {
      if (!controles) return undefined;
      if (anchorISO) {
        var vitalHit = enrichmentApi.getVitalsInWindow(controles, anchorISO, {
          fromDays: context.fromDays != null ? context.fromDays : 0,
          toDays: context.toDays != null ? context.toDays : 1,
          vitalField: parsed.vital,
          preferTargetDay: context.preferTargetDay,
        });
        if (vitalHit && vitalHit.vitals && parsed.vital != null) {
          var vitalVal = vitalHit.vitals[parsed.vital];
          if (vitalVal != null) return vitalVal;
        }
        return undefined;
      }
      return undefined;
    }

    return undefined;
  }

  return {
    resolveAnchorISO: resolveAnchorISO,
    resolveAghuFieldValue: resolveAghuFieldValue,
    numericFromHit: numericFromHit,
    defaultHubRowContext: defaultHubRowContext,
  };
});

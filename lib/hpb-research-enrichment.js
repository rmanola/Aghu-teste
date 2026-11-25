/**
 * Enriquecimento read-only HPB × domínios AGHU (exames, controles, prescrições, PII).
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuHpbResearchEnrichment = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  function loadMod(lib, global) {
    if (root[global]) return root[global];
    if (typeof require === "function") {
      try {
        return require("./" + lib);
      } catch (_e) {}
    }
    return null;
  }

  var catalog = loadMod("hpb-enrichment-catalog.js", "AghuHpbEnrichmentCatalog");
  var provenanceApi = loadMod(
    "hpb-enrichment-provenance.js",
    "AghuHpbEnrichmentProvenance",
  );
  var examLv = loadMod("exam-latest-value.js", "AghuExamLatestValue");
  var computed = loadMod("hpb-computed.js", "AghuHpbComputed");
  var schema = loadMod("hpb-registry-schema.js", "AghuHpbRegistrySchema");
  var controlesResolve = loadMod(
    "controles-vitals-resolve.js",
    "AghuControlesVitalsResolve",
  );
  var prescricoes = loadMod("prescricoes-normalize.js", "AghuPrescricoesNormalize");
  var ageFromDob = loadMod("age-from-dob.js", "AghuAgeFromDob");
  var dateBr = loadMod("date-br.js", "AghuDateBr");
  var entryVitals = loadMod("controles-entry-vitals.js", "AghuControlesEntryVitals");

  var getVariables =
    catalog && catalog.getEnrichmentVariables
      ? catalog.getEnrichmentVariables
      : function () {
          return [];
        };

  var getRegistryFieldRules =
    catalog && catalog.getRegistryFieldRules
      ? catalog.getRegistryFieldRules
      : function () {
          return [];
        };

  function getNestedValue(obj, path) {
    if (!obj || !path) return undefined;
    var parts = String(path).split(".");
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (!cur || typeof cur !== "object") return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  function setNestedValue(obj, path, value) {
    var parts = String(path).split(".");
    if (!parts.length) return obj;
    var cur = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      var key = parts[i];
      if (!cur[key] || typeof cur[key] !== "object") {
        cur[key] = {};
      }
      cur = cur[key];
    }
    cur[parts[parts.length - 1]] = value;
    return obj;
  }

  function registryValueFromSuggestion(rawValue, fieldPath) {
    var s = String(rawValue || "").trim();
    if (!s) return "";
    if (fieldPath.indexOf("preop.") === 0 || fieldPath.indexOf("pancreatectomy.") === 0 || fieldPath.indexOf("biliary.") === 0) {
      var m = s.match(/^[-+]?\d[\d.,]*/);
      if (m) return m[0].replace(",", ".");
    }
    return s;
  }

  function provenanceSourceFromRow(prov) {
    if (!prov || !prov.source) return "aghu_exams";
    if (prov.source === "exams") return "aghu_exams";
    if (prov.source === "prescricoes") return "aghu_prescricoes";
    if (prov.source === "controles") return "aghu_controles";
    if (prov.source === "pii") return "aghu_pii";
    return "aghu_" + String(prov.source);
  }

  function computeSurgeryEnrichment(surgery, domains, opts) {
    opts = opts || {};
    var row = enrichSurgeryRow({
      surgery: surgery,
      episode: opts.episode || {},
      exams: domains && domains.exams,
      controles: domains && domains.controles,
      prescricoes: domains && domains.prescricoes,
      pii: domains && domains.pii,
      recordClientId: opts.recordClientId || "",
      prontuario: opts.prontuario || "",
    });
    var suggestions = {};
    var fills = [];
    var cohortColumns = Object.assign({}, row.values);
    var rules = getRegistryFieldRules();

    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i];
      var col = rule.exportColumn;
      var fieldPath = rule.registryField;
      var raw = row.values[col] || "";
      var regVal = registryValueFromSuggestion(raw, fieldPath);
      suggestions[fieldPath] = regVal;
      if (regVal) {
        fills.push({
          fieldPath: fieldPath,
          value: regVal,
          catalogKey: rule.key,
          provenance: row.provenance[col] || null,
        });
      }
    }

    return {
      suggestions: suggestions,
      fills: fills,
      cohortColumns: cohortColumns,
      row: row,
    };
  }

  function findSurgeryInRegistry(reg, surgeryId) {
    var episodes = reg && reg.episodes ? reg.episodes : [];
    for (var ei = 0; ei < episodes.length; ei++) {
      var surgs = episodes[ei].surgeries || [];
      for (var si = 0; si < surgs.length; si++) {
        if (surgs[si] && surgs[si].id === surgeryId) return surgs[si];
      }
    }
    return null;
  }

  function applyEnrichmentToRegistry(registry, domains, opts) {
    opts = opts || {};
    var onlyEmpty = opts.onlyEmpty !== false;
    var userId = opts.userId ? String(opts.userId) : "";
    var prevRegistry = opts.prevRegistry || null;
    var base =
      schema && schema.normalizeRegistry
        ? schema.normalizeRegistry(registry || {})
        : registry || { episodes: [], fieldProvenance: {} };
    var next = JSON.parse(JSON.stringify(base));
    var fieldProvenance = Object.assign({}, next.fieldProvenance || {});
    var auditEntries = [];
    var isEmpty =
      provenanceApi && provenanceApi.isFieldEmpty
        ? provenanceApi.isFieldEmpty
        : function (v) {
            return v == null || String(v).trim() === "";
          };
    var shouldAuto =
      provenanceApi && provenanceApi.shouldAutoFill
        ? provenanceApi.shouldAutoFill
        : function () {
            return true;
          };
    var buildKey =
      provenanceApi && provenanceApi.buildProvenanceKey
        ? provenanceApi.buildProvenanceKey
        : function (a, b, c) {
            return a + "::" + b + "::" + c;
          };
    var markAuto =
      provenanceApi && provenanceApi.markAuto
        ? provenanceApi.markAuto
        : function (p, k) {
            return p;
          };
    var markManual =
      provenanceApi && provenanceApi.markManual
        ? provenanceApi.markManual
        : function (p, k) {
            return p;
          };
    var auditSource =
      provenanceApi && provenanceApi.provenanceAuditSource
        ? provenanceApi.provenanceAuditSource
        : function (s) {
            return String(s || "").replace(/^aghu_/, "");
          };

    var episodes = Array.isArray(next.episodes) ? next.episodes : [];
    for (var ei = 0; ei < episodes.length; ei++) {
      var ep = episodes[ei];
      if (schema && schema.isDeleted && schema.isDeleted(ep)) continue;
      var surgeries = Array.isArray(ep.surgeries) ? ep.surgeries : [];
      for (var si = 0; si < surgeries.length; si++) {
        var surg = surgeries[si];
        if (schema && schema.isDeleted && schema.isDeleted(surg)) continue;

        var rules = getRegistryFieldRules();
        for (var ri = 0; ri < rules.length; ri++) {
          var rule = rules[ri];
          var fieldPath = rule.registryField;
          var provKey = buildKey(ep.id, surg.id, fieldPath);
          var current = getNestedValue(surg, fieldPath);
          var prevSurgery = prevRegistry
            ? findSurgeryInRegistry(prevRegistry, surg.id)
            : null;
          var prevVal = prevSurgery
            ? getNestedValue(prevSurgery, fieldPath)
            : current;
          if (
            prevRegistry &&
            !isEmpty(current) &&
            String(prevVal || "") !== String(current || "") &&
            shouldAuto(fieldProvenance, provKey)
          ) {
            fieldProvenance = markManual(fieldProvenance, provKey, {
              filledBy: userId,
            });
            auditEntries.push({
              path: fieldPath,
              action: "manual",
              source: "manual",
            });
          }
        }

        var enrichment = computeSurgeryEnrichment(surg, domains, {
          episode: ep,
        });

        for (var fi = 0; fi < enrichment.fills.length; fi++) {
          var fill = enrichment.fills[fi];
          var fillPath = fill.fieldPath;
          var fillKey = buildKey(ep.id, surg.id, fillPath);
          var fillCurrent = getNestedValue(surg, fillPath);

          if (onlyEmpty && !isEmpty(fillCurrent)) continue;
          if (!shouldAuto(fieldProvenance, fillKey)) continue;
          if (!fill.value) continue;

          setNestedValue(surg, fillPath, fill.value);
          var src = provenanceSourceFromRow(fill.provenance);
          fieldProvenance = markAuto(fieldProvenance, fillKey, {
            source: src,
            sourceDate: fill.provenance ? fill.provenance.dataISO || "" : "",
            filledBy: userId,
          });
          auditEntries.push({
            path: fillPath,
            action: "auto",
            source: auditSource(src),
          });
        }
      }
    }

    next.fieldProvenance = fieldProvenance;
    return {
      registry: next,
      auditEntries: auditEntries,
      provenanceUpdates: fieldProvenance,
    };
  }

  function buildCohortEnrichmentRow(patient, surgery, episode) {
    return enrichSurgeryRow({
      registry: patient.registry,
      surgery: surgery,
      episode: episode || {},
      exams: patient.exams,
      controles: patient.controles,
      prescricoes: patient.prescricoes,
      pii: patient.pii,
      recordClientId: patient.recordClientId || "",
      prontuario: patient.prontuario || "",
    });
  }

  function daysBetween(a, b) {
    if (computed && computed.daysBetween) return computed.daysBetween(a, b);
    var da = new Date(String(a));
    var db = new Date(String(b));
    if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return null;
    return Math.round((db.getTime() - da.getTime()) / 86400000);
  }

  function toDisplayDate(iso) {
    if (dateBr && dateBr.toDisplayBr) return dateBr.toDisplayBr(iso);
    return iso || "";
  }

  function formatValue(v) {
    if (v == null || v === "") return "";
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
    return String(v).trim();
  }

  function formatExamHit(hit, sigla) {
    if (!hit) return { value: "", provenance: null };
    var label = sigla + " em " + (hit.dataLabel || toDisplayDate(hit.dataISO));
    if (hit.unit) label += " (" + hit.value + " " + hit.unit + ")";
    else label += " (" + hit.value + ")";
    return {
      value: hit.unit ? String(hit.value) + " " + hit.unit : String(hit.value),
      provenance: {
        source: "exams",
        dataISO: hit.dataISO || "",
        label: label,
      },
    };
  }

  function periodoToIso(periodo) {
    if (!controlesResolve || !controlesResolve.brDateToIso) {
      var br = String(periodo || "")
        .trim()
        .split(/\s+/)[0];
      var m = br.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (!m) return null;
      return m[3] + "-" + m[2] + "-" + m[1];
    }
    var datePart = String(periodo || "")
      .trim()
      .split(/\s+/)[0];
    return controlesResolve.brDateToIso(datePart);
  }

  function getVitalsInWindow(controles, anchorISO, opts) {
    opts = opts || {};
    if (!controlesResolve || !controlesResolve.normalizeControles) return null;
    var fromDays = opts.fromDays != null ? opts.fromDays : 0;
    var toDays = opts.toDays != null ? opts.toDays : 1;
    var preferTargetDay = opts.preferTargetDay;
    var vitalField = opts.vitalField || "fcBpm";
    var normalized = controlesResolve.normalizeControles(controles);
    var candidates = [];

    for (var i = 0; i < normalized.entries.length; i++) {
      var entry = normalized.entries[i];
      var entryISO = periodoToIso(entry.periodo);
      if (!entryISO) continue;
      var offset = daysBetween(anchorISO, entryISO);
      if (offset == null || offset < fromDays || offset > toDays) continue;
      var enriched =
        entryVitals && entryVitals.enrichControlesEntry
          ? entryVitals.enrichControlesEntry(entry)
          : entry;
      var vitals =
        entryVitals && entryVitals.vitalsFromControlesEntry
          ? entryVitals.vitalsFromControlesEntry(enriched)
          : controlesResolve.getVitalsFromControles(
              { entries: [entry] },
              null,
              { preferDataISO: entryISO },
            );
      if (!vitals || vitals[vitalField] == null) continue;
      candidates.push({
        vitals: vitals,
        entryISO: entryISO,
        offsetDays: offset,
        periodo: entry.periodo,
      });
    }

    if (!candidates.length) return null;

    candidates.sort(function (a, b) {
      if (preferTargetDay != null) {
        var da = Math.abs(a.offsetDays - preferTargetDay);
        var db = Math.abs(b.offsetDays - preferTargetDay);
        if (da !== db) return da - db;
      } else {
        var aa = Math.abs(a.offsetDays);
        var ab = Math.abs(b.offsetDays);
        if (aa !== ab) return aa - ab;
      }
      return a.entryISO.localeCompare(b.entryISO);
    });

    return candidates[0];
  }

  function parsePrescricaoDate(raw) {
    var s = String(raw || "").trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    var m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) return m[3] + "-" + m[2] + "-" + m[1];
    return null;
  }

  function entryWindowOverlap(entry, anchorISO, fromDays, toDays) {
    var startISO =
      parsePrescricaoDate(entry.validadeInicial) ||
      parsePrescricaoDate(entry.data);
    var endISO =
      parsePrescricaoDate(entry.validadeFinal) ||
      parsePrescricaoDate(entry.validadeInicial) ||
      parsePrescricaoDate(entry.data);
    if (!startISO && !endISO) return false;
    if (!startISO) startISO = endISO;
    if (!endISO) endISO = startISO;
    var windowStartOffset = fromDays;
    var windowEndOffset = toDays;
    var windowStartISO = addDaysIso(anchorISO, windowStartOffset);
    var windowEndISO = addDaysIso(anchorISO, windowEndOffset);
    if (!windowStartISO || !windowEndISO) return false;
    return startISO <= windowEndISO && endISO >= windowStartISO;
  }

  function addDaysIso(iso, days) {
    var d = new Date(String(iso));
    if (Number.isNaN(d.getTime())) return null;
    d.setDate(d.getDate() + days);
    return (
      String(d.getFullYear()) +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0")
    );
  }

  function resolvePrescricaoField(prescricoesRaw, anchorISO, def) {
    var archive =
      prescricoes && prescricoes.normalizePrescricoesInput
        ? prescricoes.normalizePrescricoesInput(prescricoesRaw)
        : { entries: [] };
    var entries = archive.entries || [];
    var fromDays = def.fromDays != null ? def.fromDays : 0;
    var toDays = def.toDays != null ? def.toDays : 7;
    var kind = def.prescricaoKind || "";

    if (kind === "antibiotic_flag" || kind === "antibiotic_list") {
      var names = [];
      for (var i = 0; i < entries.length; i++) {
        var e = entries[i];
        if (!entryWindowOverlap(e, anchorISO, fromDays, toDays)) continue;
        var ab = Array.isArray(e.antibiotico) ? e.antibiotico : [];
        for (var j = 0; j < ab.length; j++) {
          var n = String(ab[j] || "").trim();
          if (n) names.push(n);
        }
      }
      if (kind === "antibiotic_flag") {
        return {
          value: names.length ? "Sim" : "Não",
          provenance: names.length
            ? {
                source: "prescricoes",
                dataISO: anchorISO,
                label: "ATB: " + names.slice(0, 3).join("; "),
              }
            : null,
        };
      }
      var list = names.slice(0, 5).join("; ");
      if (names.length > 5) list += "…";
      return {
        value: list,
        provenance: list
          ? { source: "prescricoes", dataISO: anchorISO, label: list }
          : null,
      };
    }

    if (kind === "dieta") {
      var best = null;
      for (var k = 0; k < entries.length; k++) {
        var row = entries[k];
        if (!entryWindowOverlap(row, anchorISO, fromDays, toDays)) continue;
        var dieta = String(row.dieta || "").trim();
        if (!dieta) continue;
        var refISO =
          parsePrescricaoDate(row.validadeFinal) ||
          parsePrescricaoDate(row.data) ||
          parsePrescricaoDate(row.validadeInicial);
        if (!best || (refISO && refISO >= best.refISO)) {
          best = { dieta: dieta, refISO: refISO || "" };
        }
      }
      return {
        value: best ? best.dieta : "",
        provenance: best
          ? {
              source: "prescricoes",
              dataISO: best.refISO,
              label: "Dieta: " + best.dieta,
            }
          : null,
      };
    }

    return { value: "", provenance: null };
  }

  function resolvePiiField(pii, anchorISO, def) {
    if (!pii || typeof pii !== "object") return { value: "", provenance: null };
    if (def.key === "sex") {
      var sex = String(pii.sexo || pii.sex || "").trim();
      return {
        value: sex,
        provenance: sex
          ? { source: "pii", dataISO: anchorISO, label: "Sexo: " + sex }
          : null,
      };
    }
    if (def.key === "age_at_surgery") {
      var age =
        ageFromDob && ageFromDob.computeAgeYearsFromIso
          ? ageFromDob.computeAgeYearsFromIso(
              pii.dataNascimento || pii.dataNascimentoISO,
              anchorISO,
            )
          : null;
      return {
        value: age != null ? String(age) : "",
        provenance:
          age != null
            ? {
                source: "pii",
                dataISO: anchorISO,
                label: "Idade na cirurgia: " + age + " anos",
              }
            : null,
      };
    }
    return { value: "", provenance: null };
  }

  function resolveEnrichmentByKey(key, domains, anchorISO) {
    var def =
      catalog && catalog.findVariable ? catalog.findVariable(key) : null;
    if (!def) return { value: "", provenance: null };
    if (!anchorISO && def.source !== "pii") {
      return { value: "", provenance: null };
    }
    var resolved = { value: "", provenance: null };
    var exams = domains && domains.exams;
    var controles = domains && domains.controles;
    var prescricoesRaw = domains && domains.prescricoes;
    var pii = domains && domains.pii;

    if (def.source === "exam" && examLv && examLv.getAnalyteInWindow) {
      var hit = examLv.getAnalyteInWindow(exams, def.sigla, anchorISO, {
        fromDays: def.fromDays,
        toDays: def.toDays,
        serumOnly: !!def.serumOnly,
        preferTargetDay: def.preferTargetDay,
      });
      resolved = formatExamHit(hit, def.sigla || def.key);
    } else if (def.source === "pii") {
      resolved = resolvePiiField(pii, anchorISO || "", def);
    } else if (def.source === "controles") {
      var vitalHit = getVitalsInWindow(controles, anchorISO, {
        fromDays: def.fromDays,
        toDays: def.toDays,
        preferTargetDay: def.preferTargetDay,
        vitalField: def.vitalField,
      });
      if (vitalHit) {
        var v = vitalHit.vitals[def.vitalField];
        resolved = {
          value: formatValue(v),
          provenance: {
            source: "controles",
            dataISO: vitalHit.entryISO,
            label:
              def.label +
              " em " +
              (vitalHit.periodo || toDisplayDate(vitalHit.entryISO)),
          },
        };
      }
    } else if (def.source === "prescricao") {
      resolved = resolvePrescricaoField(prescricoesRaw, anchorISO, def);
    }
    return resolved;
  }

  function enrichSurgeryRow(input) {
    input = input || {};
    var registry = input.registry || {};
    var surgery = input.surgery || {};
    var episode = input.episode || {};
    var exams = input.exams;
    var controles = input.controles;
    var prescricoesRaw = input.prescricoes;
    var pii = input.pii;
    var recordClientId = input.recordClientId || "";
    var prontuario = input.prontuario || "";

    var core = surgery.core || {};
    var anchorISO = core.date ? String(core.date).trim() : "";
    var values = {};
    var provenance = {};
    var variables = getVariables();

    for (var i = 0; i < variables.length; i++) {
      var def = variables[i];
      var col = def.exportColumn;
      var resolved = { value: "", provenance: null };

      if (!anchorISO) {
        values[col] = "";
        continue;
      }

      if (def.source === "exam" && examLv && examLv.getAnalyteInWindow) {
        var hit = examLv.getAnalyteInWindow(exams, def.sigla, anchorISO, {
          fromDays: def.fromDays,
          toDays: def.toDays,
          serumOnly: !!def.serumOnly,
          preferTargetDay: def.preferTargetDay,
        });
        resolved = formatExamHit(hit, def.sigla || def.key);
      } else if (def.source === "pii") {
        resolved = resolvePiiField(pii, anchorISO, def);
      } else if (def.source === "controles") {
        var vitalHit = getVitalsInWindow(controles, anchorISO, {
          fromDays: def.fromDays,
          toDays: def.toDays,
          preferTargetDay: def.preferTargetDay,
          vitalField: def.vitalField,
        });
        if (vitalHit) {
          var v = vitalHit.vitals[def.vitalField];
          resolved = {
            value: formatValue(v),
            provenance: {
              source: "controles",
              dataISO: vitalHit.entryISO,
              label:
                def.label +
                " em " +
                (vitalHit.periodo || toDisplayDate(vitalHit.entryISO)),
            },
          };
        }
      } else if (def.source === "prescricao") {
        resolved = resolvePrescricaoField(prescricoesRaw, anchorISO, def);
      }

      values[col] = resolved.value;
      if (resolved.provenance) provenance[col] = resolved.provenance;
    }

    return {
      meta: {
        recordClientId: recordClientId,
        prontuario: prontuario,
        episodeId: episode.id || "",
        surgeryId: surgery.id || "",
        surgeryDate: anchorISO,
        episodeLabel: episode.primaryDiagnosis || episode.id || "",
        surgeryLabel: core.mainProcedure || surgery.id || "",
      },
      values: values,
      provenance: provenance,
    };
  }

  function buildCohortEnrichmentRows(patients) {
    var rows = [];
    if (!Array.isArray(patients)) return rows;

    for (var pi = 0; pi < patients.length; pi++) {
      var patient = patients[pi] || {};
      var registry =
        schema && schema.filterRegistryActive
          ? schema.filterRegistryActive(patient.registry || {})
          : patient.registry || { episodes: [] };
      var episodes = Array.isArray(registry.episodes) ? registry.episodes : [];

      for (var ei = 0; ei < episodes.length; ei++) {
        var ep = episodes[ei];
        if (schema && schema.isDeleted && schema.isDeleted(ep)) continue;
        var surgeries = Array.isArray(ep.surgeries) ? ep.surgeries : [];

        for (var si = 0; si < surgeries.length; si++) {
          var surg = surgeries[si];
          if (schema && schema.isDeleted && schema.isDeleted(surg)) continue;
          var surgeryDate = surg.core && surg.core.date ? String(surg.core.date) : "";
          if (!surgeryDate) continue;

          rows.push(
            enrichSurgeryRow({
              registry: registry,
              surgery: surg,
              episode: ep,
              exams: patient.exams,
              controles: patient.controles,
              prescricoes: patient.prescricoes,
              pii: patient.pii,
              recordClientId: patient.recordClientId || "",
              prontuario: patient.prontuario || "",
            }),
          );
        }
      }
    }

    return rows;
  }

  return {
    computeSurgeryEnrichment: computeSurgeryEnrichment,
    applyEnrichmentToRegistry: applyEnrichmentToRegistry,
    buildCohortEnrichmentRow: buildCohortEnrichmentRow,
    enrichSurgeryRow: enrichSurgeryRow,
    buildCohortEnrichmentRows: buildCohortEnrichmentRows,
    getVitalsInWindow: getVitalsInWindow,
    entryWindowOverlap: entryWindowOverlap,
    resolveEnrichmentByKey: resolveEnrichmentByKey,
  };
});

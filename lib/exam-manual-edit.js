/**
 * Edição manual soft de resultados de exame (web) + proteção no merge com extração.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  root.AghuExamManualEdit = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(
  typeof globalThis !== "undefined"
    ? globalThis
    : typeof window !== "undefined"
      ? window
      : this,
  function () {
    "use strict";

    var g =
      typeof globalThis !== "undefined"
        ? globalThis
        : typeof window !== "undefined"
          ? window
          : this;

    var EDITABLE_FIELDS = [
      "result",
      "fetchedResult",
      "detailText",
      "aiOrganized",
    ];

    function isEditableField(field) {
      return EDITABLE_FIELDS.indexOf(String(field || "")) >= 0;
    }

    function pickLonger(a, b) {
      var sa = a == null ? "" : String(a);
      var sb = b == null ? "" : String(b);
      return sb.length > sa.length ? sb : sa;
    }

    function fieldValue(exam, field) {
      if (!exam) return "";
      var v = exam[field];
      return v == null ? "" : String(v);
    }

    function buildExtractedSnapshot(exam) {
      if (!exam || typeof exam !== "object") return {};
      var snap = {};
      for (var i = 0; i < EDITABLE_FIELDS.length; i++) {
        var f = EDITABLE_FIELDS[i];
        snap[f] = fieldValue(exam, f);
      }
      return snap;
    }

    /**
     * Aplica correção manual num campo editável.
     * @returns {object} exame atualizado (mutável)
     */
    function applyManualPatch(exam, field, newValue) {
      if (!exam || typeof exam !== "object") return exam;
      if (!isEditableField(field)) {
        throw new Error("field_not_editable");
      }
      var next = Object.assign({}, exam);
      if (!next.extractedSnapshot) {
        next.extractedSnapshot = buildExtractedSnapshot(exam);
      }
      var before = fieldValue(exam, field);
      next[field] = newValue == null ? "" : String(newValue);
      var locked = Array.isArray(next.manualEdit && next.manualEdit.lockedFields)
        ? next.manualEdit.lockedFields.slice()
        : [];
      if (locked.indexOf(field) < 0) locked.push(field);
      next.manualEdit = {
        at: Date.now(),
        by: "web",
        lockedFields: locked,
      };
      return { exam: next, before: before, after: next[field] };
    }

    /** Restaura campos editáveis a partir de extractedSnapshot. */
    function restoreExtractedSnapshot(exam) {
      if (!exam || typeof exam !== "object" || !exam.extractedSnapshot) {
        return exam;
      }
      var next = Object.assign({}, exam);
      var snap = exam.extractedSnapshot;
      for (var i = 0; i < EDITABLE_FIELDS.length; i++) {
        var f = EDITABLE_FIELDS[i];
        if (snap[f] !== undefined) next[f] = snap[f];
      }
      delete next.manualEdit;
      delete next.extractedSnapshot;
      return next;
    }

    function slimManualEditMeta(exam) {
      if (!exam || typeof exam !== "object") return {};
      var out = {};
      if (exam.manualEdit && typeof exam.manualEdit === "object") {
        out.manualEdit = {
          at:
            typeof exam.manualEdit.at === "number" ? exam.manualEdit.at : Date.now(),
          by: exam.manualEdit.by === "web" ? "web" : "web",
          lockedFields: Array.isArray(exam.manualEdit.lockedFields)
            ? exam.manualEdit.lockedFields.filter(function (f) {
                return isEditableField(f);
              })
            : [],
        };
      }
      if (
        exam.extractedSnapshot &&
        typeof exam.extractedSnapshot === "object"
      ) {
        out.extractedSnapshot = buildExtractedSnapshot(exam.extractedSnapshot);
      }
      return out;
    }

    function mergeResultField(a, b, field, lockedFields) {
      if (lockedFields && lockedFields.indexOf(field) >= 0) {
        return a[field] == null ? "" : String(a[field]);
      }
      return pickLonger(a[field], b[field]);
    }

    /**
     * Funde duas linhas de exame respeitando lockedFields de edição manual.
     * @param {object|null} prev linha existente (prevalece em campos bloqueados)
     * @param {object} next linha nova da extração
     * @param {function} slimExam normalizador de linha
     */
    function mergeExamRows(prev, next, slimExam) {
      if (!prev) return slimExam(next);
      var a = slimExam(prev);
      var b = slimExam(next);
      var sampleKey = g.AghuExamSampleKey;
      if (
        sampleKey &&
        sampleKey.samplesMergeCompatible &&
        !sampleKey.samplesMergeCompatible(a, b)
      ) {
        return slimExam(sampleKey.pickExamRowOnSampleConflict(a, b));
      }
      var merged = Object.assign({}, a, b);
      var locked =
        a.manualEdit &&
        Array.isArray(a.manualEdit.lockedFields) &&
        a.manualEdit.lockedFields.length
          ? a.manualEdit.lockedFields
          : null;

      merged.result = mergeResultField(a, b, "result", locked);
      merged.fetchedResult = mergeResultField(a, b, "fetchedResult", locked);
      merged.detailText = mergeResultField(a, b, "detailText", locked);
      merged.aiOrganized = mergeResultField(a, b, "aiOrganized", locked);

      if (!locked) {
        merged.fetchHint = b.fetchHint || a.fetchHint;
        merged.fetchReason = b.fetchReason || a.fetchReason;
      } else {
        merged.fetchHint = locked.indexOf("fetchHint") >= 0 ? a.fetchHint : b.fetchHint || a.fetchHint;
        merged.fetchReason =
          locked.indexOf("fetchReason") >= 0
            ? a.fetchReason
            : b.fetchReason || a.fetchReason;
      }

      merged.hasAttachment = !!(a.hasAttachment || b.hasAttachment);
      merged.hasDetail = !!(a.hasDetail || b.hasDetail);
      merged.hasCheckbox = !!(a.hasCheckbox || b.hasCheckbox);

      if (a.manualEdit) merged.manualEdit = a.manualEdit;
      if (a.extractedSnapshot) merged.extractedSnapshot = a.extractedSnapshot;
      if (a.manualEntry) merged.manualEntry = a.manualEntry;
      if (a.manualEntry && a.manualEntry.source === "paper") {
        merged.fetchReason = a.fetchReason || "manual_paper";
      }

      var resolve = g.AghuExamResultResolve;
      if (resolve && resolve.clearPartialGridResultForGasometry) {
        resolve.clearPartialGridResultForGasometry(merged);
      }
      return merged;
    }

    /**
     * Substitui linha pela extração atual; prev manualEdit bloqueia campos editáveis.
     * @param {object|null} prev
     * @param {object} next
     * @param {function} slimExam
     */
    function overwriteExamRow(prev, next, slimExam) {
      if (!prev) return slimExam(next);
      var a = slimExam(prev);
      var b = slimExam(next);
      var merged = Object.assign({}, b);
      var locked =
        a.manualEdit &&
        Array.isArray(a.manualEdit.lockedFields) &&
        a.manualEdit.lockedFields.length
          ? a.manualEdit.lockedFields
          : null;

      if (locked) {
        for (var i = 0; i < locked.length; i++) {
          var field = locked[i];
          if (EDITABLE_FIELDS.indexOf(field) >= 0) {
            merged[field] = a[field] == null ? "" : String(a[field]);
          }
        }
        merged.fetchHint =
          locked.indexOf("fetchHint") >= 0 ? a.fetchHint : b.fetchHint || "";
        merged.fetchReason =
          locked.indexOf("fetchReason") >= 0
            ? a.fetchReason
            : b.fetchReason || "";
      }

      if (a.manualEdit) merged.manualEdit = a.manualEdit;
      if (a.extractedSnapshot) merged.extractedSnapshot = a.extractedSnapshot;

      var resolve = g.AghuExamResultResolve;
      if (resolve && resolve.clearPartialGridResultForGasometry) {
        resolve.clearPartialGridResultForGasometry(merged);
      }
      return merged;
    }

    return {
      EDITABLE_FIELDS: EDITABLE_FIELDS,
      isEditableField: isEditableField,
      examMergeKey:
        g.AghuExamMergeKey && g.AghuExamMergeKey.examMergeKey
          ? g.AghuExamMergeKey.examMergeKey
          : function (exam) {
              var iso = (exam && exam.dataColetaISO) || "nodate";
              var sol = String((exam && exam.solicitation) || "").trim();
              var name = String((exam && exam.examName) || "").trim();
              var sampleApi = g.AghuExamSampleKey;
              var sample =
                sampleApi && sampleApi.normalizeSampleKey
                  ? sampleApi.normalizeSampleKey(exam && exam.sample)
                  : String((exam && exam.sample) || "")
                      .trim()
                      .toLowerCase();
              return iso + "|" + sol + "|" + name + "|" + sample;
            },
      buildExtractedSnapshot: buildExtractedSnapshot,
      applyManualPatch: applyManualPatch,
      restoreExtractedSnapshot: restoreExtractedSnapshot,
      slimManualEditMeta: slimManualEditMeta,
      mergeExamRows: mergeExamRows,
      overwriteExamRow: overwriteExamRow,
      fieldValue: fieldValue,
    };
  },
);

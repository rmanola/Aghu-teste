/**
 * Entrada manual em lote — laudos em papel (web).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  root.AghuExamManualEntry = api;
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

    var DEFAULT_PAPER_SAMPLE = "SANGUE";
    var PAPER_SOLICITATION_PREFIX = "papel";
    var MAX_BATCH_ITEMS = 30;
    var MAX_RESULT_LENGTH = 32768;
    var ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
    var LOCKED_FIELDS = [
      "result",
      "fetchedResult",
      "detailText",
      "aiOrganized",
    ];

    var g =
      typeof globalThis !== "undefined"
        ? globalThis
        : typeof window !== "undefined"
          ? window
          : this;

    function newBatchId() {
      if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID();
      }
      return "00000000-0000-4000-8000-000000000000";
    }

    function isoToBrLabel(iso) {
      if (!iso || !ISO_DATE_RE.test(String(iso))) return "";
      var p = String(iso).split("-");
      return p[2] + "/" + p[1] + "/" + p[0];
    }

    function buildPaperSolicitation(batchId) {
      return PAPER_SOLICITATION_PREFIX + "|" + String(batchId || "").trim();
    }

    function normalizeSample(sample) {
      var s = String(sample || "").trim();
      return s || DEFAULT_PAPER_SAMPLE;
    }

    function validateCollectionDate(collectionDate) {
      if (!collectionDate || !ISO_DATE_RE.test(String(collectionDate))) {
        throw new Error("invalid_collection_date");
      }
    }

    function validateItem(item) {
      if (!item || typeof item !== "object") {
        throw new Error("invalid_item");
      }
      var name = String(item.examName || "").trim();
      var result = String(item.result == null ? "" : item.result);
      if (!name) throw new Error("exam_name_required");
      if (!result.trim()) throw new Error("result_required");
      if (result.length > MAX_RESULT_LENGTH) {
        throw new Error("result_too_long");
      }
      return { examName: name, result: result };
    }

    function examMergeKeyForRow(row) {
      var merge =
        g.AghuExamMergeKey && g.AghuExamMergeKey.examMergeKey
          ? g.AghuExamMergeKey.examMergeKey
          : null;
      if (merge) return merge(row);
      var iso = row.dataColetaISO || "nodate";
      var sol = String(row.solicitation || "").trim();
      var name = String(row.examName || "").trim();
      var sampleApi = g.AghuExamSampleKey;
      var sample =
        sampleApi && sampleApi.normalizeSampleKey
          ? sampleApi.normalizeSampleKey(row.sample)
          : String(row.sample || "")
              .trim()
              .toLowerCase();
      return iso + "|" + sol + "|" + name + "|" + sample;
    }

    /**
     * @param {object} opts
     * @returns {object} ExamRow-like
     */
    function buildPaperExamRow(opts) {
      if (!opts || typeof opts !== "object") {
        throw new Error("invalid_options");
      }
      var item = validateItem({
        examName: opts.examName,
        result: opts.result,
      });
      validateCollectionDate(opts.collectionDate);
      var batchId = String(opts.batchId || "").trim() || newBatchId();
      var solicitation =
        opts.solicitation != null
          ? String(opts.solicitation).trim()
          : buildPaperSolicitation(batchId);
      var at =
        typeof opts.at === "number" && opts.at > 0 ? opts.at : Date.now();
      var sample = normalizeSample(opts.sample);
      var lab = opts.lab == null ? "" : String(opts.lab).trim();

      return {
        examName: item.examName,
        sample: sample,
        solicitation: solicitation,
        dataColetaISO: String(opts.collectionDate),
        dataColetaLabel: isoToBrLabel(opts.collectionDate),
        lab: lab,
        fetchedResult: item.result,
        result: "",
        hasAttachment: false,
        hasDetail: false,
        hasCheckbox: false,
        fetchReason: "manual_paper",
        manualEntry: {
          source: "paper",
          batchId: batchId,
          at: at,
          by: "web",
        },
        manualEdit: {
          at: at,
          by: "web",
          lockedFields: LOCKED_FIELDS.slice(),
        },
      };
    }

    /**
     * @param {object} opts
     * @returns {{ rows: object[], batchId: string, solicitation: string, mergeKeys: string[] }}
     */
    function buildPaperExamBatch(opts) {
      if (!opts || typeof opts !== "object") {
        throw new Error("invalid_options");
      }
      validateCollectionDate(opts.collectionDate);
      var items = opts.items;
      if (!Array.isArray(items) || items.length < 1) {
        throw new Error("items_required");
      }
      if (items.length > MAX_BATCH_ITEMS) {
        throw new Error("too_many_items");
      }
      var batchId = String(opts.batchId || "").trim() || newBatchId();
      var solicitation = buildPaperSolicitation(batchId);
      var sample = normalizeSample(opts.sample);
      var lab = opts.lab == null ? "" : String(opts.lab).trim();
      var at =
        typeof opts.at === "number" && opts.at > 0 ? opts.at : Date.now();
      var rows = [];
      var mergeKeys = [];
      var seenKeys = {};

      for (var i = 0; i < items.length; i++) {
        var row = buildPaperExamRow({
          examName: items[i].examName,
          result: items[i].result,
          collectionDate: opts.collectionDate,
          sample: sample,
          lab: lab,
          batchId: batchId,
          solicitation: solicitation,
          at: at,
        });
        var key = examMergeKeyForRow(row);
        if (seenKeys[key]) {
          throw new Error("duplicate_key_in_batch");
        }
        seenKeys[key] = true;
        mergeKeys.push(key);
        rows.push(row);
      }

      return {
        rows: rows,
        batchId: batchId,
        solicitation: solicitation,
        mergeKeys: mergeKeys,
      };
    }

    function findDuplicateKeys(existingExamsByKey, mergeKeys) {
      var dupes = [];
      if (!existingExamsByKey || typeof existingExamsByKey !== "object") {
        return dupes;
      }
      for (var i = 0; i < mergeKeys.length; i++) {
        var k = mergeKeys[i];
        if (existingExamsByKey[k]) dupes.push(k);
      }
      return dupes;
    }

    function slimManualEntryMeta(exam) {
      if (!exam || typeof exam !== "object" || !exam.manualEntry) return {};
      var me = exam.manualEntry;
      if (typeof me !== "object") return {};
      return {
        manualEntry: {
          source: me.source === "paper" ? "paper" : String(me.source || ""),
          batchId: String(me.batchId || ""),
          at: typeof me.at === "number" ? me.at : Date.now(),
          by: me.by === "web" ? "web" : "web",
        },
      };
    }

    return {
      DEFAULT_PAPER_SAMPLE: DEFAULT_PAPER_SAMPLE,
      PAPER_SOLICITATION_PREFIX: PAPER_SOLICITATION_PREFIX,
      MAX_BATCH_ITEMS: MAX_BATCH_ITEMS,
      MAX_RESULT_LENGTH: MAX_RESULT_LENGTH,
      LOCKED_FIELDS: LOCKED_FIELDS,
      newBatchId: newBatchId,
      buildPaperSolicitation: buildPaperSolicitation,
      buildPaperExamRow: buildPaperExamRow,
      buildPaperExamBatch: buildPaperExamBatch,
      findDuplicateKeys: findDuplicateKeys,
      slimManualEntryMeta: slimManualEntryMeta,
      examMergeKeyForRow: examMergeKeyForRow,
    };
  },
);

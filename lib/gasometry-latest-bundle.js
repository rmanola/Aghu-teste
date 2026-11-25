/**
 * Bundle da última gasometria (arterial preferida).
 * @sync web/lib/patient-records/gasometry-latest-bundle.mjs
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuGasometryLatestBundle = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  var GASO_SIGLAS = ["pH", "PaCO2", "PaO2", "HCO3", "BE", "Lact", "AG", "StO2"];

  function latest() {
    return root.AghuExamLatestValue || null;
  }

  function categories() {
    return root.AghuExamCategories || null;
  }

  function labParse() {
    return root.AghuPdfLabParse || null;
  }

  function listExams(examsRaw) {
    var lv = latest();
    if (lv && lv.listExams) return lv.listExams(examsRaw);
    return [];
  }

  function parseExamAnalytes(exam) {
    var lv = latest();
    if (lv && lv.parseExamAnalytes) return lv.parseExamAnalytes(exam);
    return new Map();
  }

  function ensureColetaFields(exam) {
    var row = Object.assign({}, exam);
    if (!row.dataColetaISO && row.dataColetaLabel) {
      var parts = String(row.dataColetaLabel).split("/");
      if (parts.length === 3) {
        row.dataColetaISO =
          parts[2] + "-" + parts[1] + "-" + parts[0];
      }
    }
    return row;
  }

  function isGasometryExam(exam) {
    var lp = labParse();
    if (lp && lp.isGasometryExamName) {
      try {
        return lp.isGasometryExamName(exam.examName);
      } catch (_e) {}
    }
    return /\bGASOS?METRIA\b/i.test(String(exam.examName || ""));
  }

  function inferGasometryChannel(examName, sample, resultText) {
    var cat = categories();
    if (cat && cat.inferGasometryChannel) {
      return cat.inferGasometryChannel(examName, sample) || "venous";
    }
    var t = normalizeForMatch(examName + " " + sample + " " + resultText);
    if (/ARTER/.test(t)) return "arterial";
    if (/VENOS/.test(t)) return "venous";
    return "venous";
  }

  function normalizeForMatch(s) {
    return String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();
  }

  function examDataISO(exam) {
    var row = ensureColetaFields(exam);
    return row.dataColetaISO != null ? String(row.dataColetaISO) : "";
  }

  function channelRank(channel) {
    if (channel === "arterial") return 0;
    if (channel === "venous") return 1;
    return 2;
  }

  function pickBestGasometryExam(exams) {
    var gaso = [];
    for (var i = 0; i < exams.length; i++) {
      var exam = exams[i];
      if (!isGasometryExam(exam)) continue;
      var row = Object.assign({}, exam);
      var sample = String(row.sample || "");
      var text = String(row.fetchedResult || row.result || "");
      var channel = inferGasometryChannel(
        String(row.examName || ""),
        sample,
        text,
      );
      gaso.push({
        exam: row,
        dataISO: examDataISO(row),
        dataLabel:
          row.dataColetaLabel != null ? String(row.dataColetaLabel) : null,
        channel: channel,
      });
    }
    gaso.sort(function (a, b) {
      var dateCmp = b.dataISO.localeCompare(a.dataISO);
      if (dateCmp) return dateCmp;
      return channelRank(a.channel) - channelRank(b.channel);
    });
    return gaso[0] || null;
  }

  function analyteFromMap(map, sigla) {
    var hit = map.get(sigla);
    if (!hit || !Number.isFinite(hit.value)) return null;
    return { value: hit.value, unit: hit.unit };
  }

  function buildBundleFromPicked(picked) {
    if (!picked) return null;
    var map = parseExamAnalytes(picked.exam);
    var analytes = {};
    for (var j = 0; j < GASO_SIGLAS.length; j++) {
      var sigla = GASO_SIGLAS[j];
      analytes[sigla] = analyteFromMap(map, sigla);
    }
    return {
      channel: picked.channel,
      dataISO: picked.dataISO || null,
      dataLabel: picked.dataLabel,
      examName: String(picked.exam.examName || ""),
      analytes: analytes,
    };
  }

  function getGasometryBundleOnDate(examsRaw, dataISO) {
    var iso = String(dataISO || "").trim();
    if (!iso) return null;
    var onDay = listExams(examsRaw).filter(function (exam) {
      return examDataISO(exam) === iso;
    });
    return buildBundleFromPicked(pickBestGasometryExam(onDay));
  }

  function getLatestGasometryBundle(examsRaw) {
    return buildBundleFromPicked(pickBestGasometryExam(listExams(examsRaw)));
  }

  return {
    getGasometryBundleOnDate: getGasometryBundleOnDate,
    getLatestGasometryBundle: getLatestGasometryBundle,
  };
});

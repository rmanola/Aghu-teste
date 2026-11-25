/**
 * ASA Physical Status (I–VI).
 * @sync web/lib/patient-records/asa-ps-score.mjs
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuAsaPsScore = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (/* root */) {
  "use strict";

  var ROMAN = ["I", "II", "III", "IV", "V", "VI"];
  var LABELS = [
    "Paciente saudável",
    "Doença sistémica ligeira",
    "Doença sistémica grave",
    "Doença sistémica ameaçadora da vida",
    "Moribundo — não se espera sobrevivência sem a cirurgia",
    "Morte encefálica — dador de órgãos",
  ];

  var ROMAN_MAP = {
    i: 1,
    ii: 2,
    iii: 3,
    iv: 4,
    v: 5,
    vi: 6,
  };

  /**
   * @returns {{ grade: number|null, emergency: boolean }}
   */
  function parseGradeAndEmergency(raw) {
    if (raw == null || raw === "") return { grade: null, emergency: false };
    if (typeof raw === "number" && Number.isFinite(raw)) {
      var n = Math.floor(raw);
      return { grade: n >= 1 && n <= 6 ? n : null, emergency: false };
    }
    var s = String(raw)
      .trim()
      .toLowerCase()
      .replace(/^asa\s*/i, "")
      .replace(/\s+/g, "");

    var emergency = false;
    if (s.length > 1 && s.charAt(s.length - 1) === "e") {
      var withoutSuffix = s.slice(0, -1);
      if (/^[1-6]$/.test(withoutSuffix) || ROMAN_MAP[withoutSuffix]) {
        emergency = true;
        s = withoutSuffix;
      }
    }

    if (/^[1-6]$/.test(s)) return { grade: Number(s), emergency: emergency };
    if (ROMAN_MAP[s]) return { grade: ROMAN_MAP[s], emergency: emergency };
    return { grade: null, emergency: false };
  }

  function parseGrade(raw) {
    return parseGradeAndEmergency(raw).grade;
  }

  /**
   * @param {{ grade?: unknown, emergency?: boolean }} opts
   */
  function computeAsaPs(opts) {
    opts = opts || {};
    var parsed = parseGradeAndEmergency(opts.grade);
    if (parsed.grade == null) {
      return { grade: null, reason: "not_recorded" };
    }
    var emergency = parsed.emergency || !!opts.emergency;
    var roman = ROMAN[parsed.grade - 1];
    return {
      grade: parsed.grade,
      roman: emergency ? roman + "E" : roman,
      emergency: emergency,
      label: LABELS[parsed.grade - 1],
    };
  }

  return {
    computeAsaPs: computeAsaPs,
    parseAsaGrade: parseGrade,
    ASA_LABELS: LABELS,
    ASA_ROMAN: ROMAN,
  };
});

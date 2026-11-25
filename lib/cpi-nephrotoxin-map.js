/**
 * FEAT-149 — Mapa curado de classes nefrotóxicas.
 * Sugestão a partir de facts.prescriptions — nunca resposta automática.
 * Sem I/O.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuCpiNephrotoxinMap = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /** Classe → padrões de nome genérico / comercial (minúsculas, sem acentos). */
  var CLASS_PATTERNS = Object.freeze({
    aminoglicosideo: [
      "gentamicina",
      "gentamicin",
      "amicacina",
      "amikacin",
      "tobramicina",
      "tobramycin",
      "estreptomicina",
      "streptomycin",
    ],
    aine: [
      "ibuprofeno",
      "ibuprofen",
      "diclofenaco",
      "diclofenac",
      "naproxeno",
      "naproxen",
      "cetoprofeno",
      "ketoprofen",
      "nimesulida",
      "nimesulide",
      "indometacina",
      "indomethacin",
    ],
    ieca_ara2: [
      "enalapril",
      "captopril",
      "losartana",
      "losartan",
      "valsartana",
      "valsartan",
      "ramipril",
      "lisinopril",
      "telmisartana",
      "telmisartan",
      "olmesartana",
      "olmesartan",
    ],
    vancomicina: ["vancomicina", "vancomycin"],
    contraste: ["iohexol", "iodixanol", "iopamidol", "contraste iodado"],
  });

  function str(v) {
    return v == null ? "" : String(v).trim();
  }

  function normalizeDrug(name) {
    return str(name)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function asArray(v) {
    return Array.isArray(v) ? v : [];
  }

  function inWindow(item, fromIso, toIso) {
    var at = str(item && (item.atIso || item.startedAt || item.data || item.date));
    if (!at) return true;
    var day = at.slice(0, 10);
    if (fromIso && day < String(fromIso).slice(0, 10)) return false;
    if (toIso && day > String(toIso).slice(0, 10)) return false;
    return true;
  }

  function matchClass(drugName) {
    var n = normalizeDrug(drugName);
    if (!n) return null;
    var classes = Object.keys(CLASS_PATTERNS);
    for (var c = 0; c < classes.length; c++) {
      var cls = classes[c];
      var pats = CLASS_PATTERNS[cls];
      for (var p = 0; p < pats.length; p++) {
        if (n.indexOf(pats[p]) !== -1) {
          return { suggested: cls, matchedDrug: str(drugName) };
        }
      }
    }
    return null;
  }

  /**
   * @param {object[]} prescriptions
   * @param {{ fromIso?: string, toIso?: string }} [window]
   * @returns {{ suggested: string, matchedDrug: string } | null}
   */
  function suggestNephrotoxinClass(prescriptions, window) {
    var fromIso = window && window.fromIso;
    var toIso = window && window.toIso;
    var list = asArray(prescriptions);
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      if (!item || !inWindow(item, fromIso, toIso)) continue;
      var name =
        item.principioAtivo ||
        item.activeIngredient ||
        item.drug ||
        item.name ||
        item.medicamento ||
        "";
      var hit = matchClass(name);
      if (hit) return hit;
    }
    return null;
  }

  /**
   * Monta metadados de divergência — a sugestão NUNCA entra em values sem confirmação.
   * @returns {{ mapSuggestion: object|null, mapDivergence: boolean, values: object }}
   */
  function buildNephrotoxinCaptureMeta(opts) {
    var o = opts && typeof opts === "object" ? opts : {};
    var suggestion = o.suggestion || null;
    var confirmedClass = o.confirmedClass != null ? str(o.confirmedClass) : "";
    var values =
      o.values && typeof o.values === "object" && !Array.isArray(o.values)
        ? Object.assign({}, o.values)
        : {};
    if (confirmedClass) {
      values.nephrotoxinClass = confirmedClass;
    }
    var divergence = false;
    if (suggestion && confirmedClass && suggestion.suggested !== confirmedClass) {
      divergence = true;
    }
    return {
      mapSuggestion: suggestion
        ? {
            suggested: str(suggestion.suggested),
            matchedDrug: str(suggestion.matchedDrug),
          }
        : null,
      mapDivergence: divergence,
      values: values,
    };
  }

  return {
    CLASS_PATTERNS: CLASS_PATTERNS,
    suggestNephrotoxinClass: suggestNephrotoxinClass,
    buildNephrotoxinCaptureMeta: buildNephrotoxinCaptureMeta,
    matchClass: matchClass,
  };
});

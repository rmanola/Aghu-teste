/**
 * Validação T/N/M e derivação do estádio agrupado (AJCC 8.ª edição).
 * Não estadia a partir de texto livre — só valida e agrupa.
 * @sync web/lib/vendor/tnm-stage.js
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuTnmStage = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (/* root */) {
  "use strict";

  var TNM_EDITION = "AJCC-8";
  var TOPOGRAPHIES = { colorretal: true, esofagogastrica: true };
  var BASES = { clinical: true, pathological: true };

  var CRC_T = {
    Tis: true,
    T1: true,
    T1a: true,
    T1b: true,
    T2: true,
    T3: true,
    T4: true,
    T4a: true,
    T4b: true,
  };
  var CRC_N = {
    N0: true,
    N1: true,
    N1a: true,
    N1b: true,
    N1c: true,
    N2: true,
    N2a: true,
    N2b: true,
  };
  var CRC_M = { M0: true, M1: true, M1a: true, M1b: true, M1c: true };

  var EG_T = {
    Tis: true,
    T1: true,
    T1a: true,
    T1b: true,
    T2: true,
    T3: true,
    T4: true,
    T4a: true,
    T4b: true,
  };
  var EG_N = {
    N0: true,
    N1: true,
    N2: true,
    N3: true,
    N3a: true,
    N3b: true,
  };
  var EG_M = { M0: true, M1: true };

  function fail(msg) {
    throw new Error(msg);
  }

  function normalizeCategory(raw, axis) {
    if (raw == null || raw === "") return "";
    var s = String(raw).trim().toUpperCase().replace(/\s+/g, "");
    s = s.replace(/^(YP|P|C)/, "");
    if (s.charAt(0) !== axis) s = axis + s;
    if (s === "TIS") return "Tis";
    return s.charAt(0) + s.slice(1).toLowerCase().replace(/is$/, "is");
  }

  function tKey(t) {
    if (t === "T1a" || t === "T1b") return "T1";
    return t;
  }

  function nKeyCrc(n) {
    if (n === "N1a" || n === "N1b" || n === "N1c") return "N1";
    return n;
  }

  function nKeyEgClinical(n) {
    if (n === "N3a" || n === "N3b") return "N3";
    return n;
  }

  function lookupCrc(t, n) {
    var tk = tKey(t);
    var nk = nKeyCrc(n);
    if (tk === "T4") {
      fail("tnm: componente t incompleto para agrupamento AJCC-8 (use T4a ou T4b)");
    }
    if (nk === "N2") {
      fail("tnm: componente n incompleto para agrupamento AJCC-8 (use N2a ou N2b)");
    }
    if (tk === "Tis" && nk === "N0") return "0";
    if ((tk === "T1" || tk === "T2") && nk === "N0") return "I";
    if (tk === "T3" && nk === "N0") return "IIA";
    if (tk === "T4a" && nk === "N0") return "IIB";
    if (tk === "T4b" && nk === "N0") return "IIC";
    if ((tk === "T1" || tk === "T2") && nk === "N1") return "IIIA";
    if (tk === "T1" && nk === "N2a") return "IIIA";
    if ((tk === "T3" || tk === "T4a") && nk === "N1") return "IIIB";
    if ((tk === "T2" || tk === "T3") && nk === "N2a") return "IIIB";
    if ((tk === "T1" || tk === "T2") && nk === "N2b") return "IIIB";
    if (tk === "T4a" && nk === "N2a") return "IIIC";
    if ((tk === "T3" || tk === "T4a") && nk === "N2b") return "IIIC";
    if (tk === "T4b" && (nk === "N1" || nk === "N2a" || nk === "N2b")) return "IIIC";
    return null;
  }

  function lookupEgPath(t, n) {
    var tk = tKey(t);
    var nk = n;
    if (tk === "T4") {
      fail("tnm: componente t incompleto para agrupamento AJCC-8 (use T4a ou T4b)");
    }
    if (nk === "N3") {
      fail("tnm: componente n incompleto para agrupamento patológico AJCC-8 (use N3a ou N3b)");
    }
    if (tk === "Tis" && nk === "N0") return "0";
    if (tk === "T1" && nk === "N0") return "IA";
    if (tk === "T1" && nk === "N1") return "IB";
    if (tk === "T2" && nk === "N0") return "IB";
    if (tk === "T1" && nk === "N2") return "IIA";
    if (tk === "T2" && nk === "N1") return "IIA";
    if (tk === "T3" && nk === "N0") return "IIA";
    if (tk === "T1" && nk === "N3a") return "IIB";
    if (tk === "T2" && nk === "N2") return "IIB";
    if (tk === "T3" && nk === "N1") return "IIB";
    if (tk === "T4a" && nk === "N0") return "IIB";
    if (tk === "T2" && nk === "N3a") return "IIIA";
    if (tk === "T3" && nk === "N2") return "IIIA";
    if (tk === "T4a" && (nk === "N1" || nk === "N2")) return "IIIA";
    if (tk === "T4b" && nk === "N0") return "IIIA";
    if ((tk === "T1" || tk === "T2") && nk === "N3b") return "IIIB";
    if ((tk === "T3" || tk === "T4a") && nk === "N3a") return "IIIB";
    if (tk === "T4b" && (nk === "N1" || nk === "N2")) return "IIIB";
    if ((tk === "T3" || tk === "T4a") && nk === "N3b") return "IIIC";
    if (tk === "T4b" && (nk === "N3a" || nk === "N3b")) return "IIIC";
    return null;
  }

  function lookupEgClinical(t, n) {
    var tk = tKey(t);
    var nk = nKeyEgClinical(n);
    if (tk === "T4") {
      fail("tnm: componente t incompleto para agrupamento AJCC-8 (use T4a ou T4b)");
    }
    if (tk === "Tis" && nk === "N0") return "0";
    if ((tk === "T1" || tk === "T2") && nk === "N0") return "I";
    if ((tk === "T1" || tk === "T2") && (nk === "N1" || nk === "N2" || nk === "N3")) {
      return "IIA";
    }
    if ((tk === "T3" || tk === "T4a") && nk === "N0") return "IIB";
    if ((tk === "T3" || tk === "T4a") && (nk === "N1" || nk === "N2" || nk === "N3")) {
      return "III";
    }
    if (tk === "T4b") return "IVA";
    return null;
  }

  /**
   * @param {{ t?: unknown, n?: unknown, m?: unknown, topography?: string, basis?: string, stageGroup?: string }} opts
   */
  function stageTnm(opts) {
    opts = opts || {};
    if (!opts.basis || !BASES[opts.basis]) {
      fail("tnm: basis obrigatório (clinical|pathological)");
    }
    if (!opts.topography || !TOPOGRAPHIES[opts.topography]) {
      fail(
        "tnm: topografia sem tabela carregada: " +
          (opts.topography == null || opts.topography === ""
            ? "(omitida)"
            : String(opts.topography)),
      );
    }

    var t = normalizeCategory(opts.t, "T");
    var n = normalizeCategory(opts.n, "N");
    var m = normalizeCategory(opts.m, "M");
    var domains =
      opts.topography === "colorretal"
        ? { t: CRC_T, n: CRC_N, m: CRC_M }
        : { t: EG_T, n: EG_N, m: EG_M };

    if (!domains.t[t]) {
      fail(
        "tnm: componente t inválido para topografia " +
          opts.topography +
          ": " +
          (opts.t == null ? "(omitido)" : String(opts.t)),
      );
    }
    if (!domains.n[n]) {
      fail(
        "tnm: componente n inválido para topografia " +
          opts.topography +
          ": " +
          (opts.n == null ? "(omitido)" : String(opts.n)),
      );
    }
    if (!domains.m[m]) {
      fail(
        "tnm: componente m inválido para topografia " +
          opts.topography +
          ": " +
          (opts.m == null ? "(omitido)" : String(opts.m)),
      );
    }

    var stageGroup = null;
    if (m === "M1a") stageGroup = "IVA";
    else if (m === "M1b") stageGroup = "IVB";
    else if (m === "M1c") stageGroup = "IVC";
    else if (m === "M1") {
      stageGroup =
        opts.topography === "esofagogastrica" && opts.basis === "clinical"
          ? "IVB"
          : "IV";
    }
    else if (m === "M0") {
      if (opts.topography === "colorretal") stageGroup = lookupCrc(t, n);
      else if (opts.basis === "clinical") stageGroup = lookupEgClinical(t, n);
      else stageGroup = lookupEgPath(t, n);
    }

    if (!stageGroup) {
      fail(
        "tnm: combinação TNM sem estádio agrupado AJCC-8 (" +
          t +
          " " +
          n +
          " " +
          m +
          ", " +
          opts.topography +
          ", " +
          opts.basis +
          ")",
      );
    }

    return {
      stageGroup: stageGroup,
      t: t,
      n: n,
      m: m,
      topography: opts.topography,
      basis: opts.basis,
      edition: TNM_EDITION,
      valid: true,
    };
  }

  return {
    TNM_EDITION: TNM_EDITION,
    stageTnm: stageTnm,
  };
});

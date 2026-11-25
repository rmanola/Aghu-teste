/**
 * Mapeamento de eliminações BH → campos do passômetro.
 * Testável em Node via module.exports; extensão: global AghuControlesBhPassometroMap.
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuControlesBhPassometroMap = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  function loadBhCols() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./controles-bh-columns.js");
      } catch (_e) {
        return null;
      }
    }
    return root.AghuControlesBhColumns || null;
  }

  var bhCols = loadBhCols();

  function norm(s) {
    return (s || "").toLowerCase().replace(/[\s\xa0]+/g, " ").trim();
  }

  function combinedNorm(label, title) {
    return norm((label || "") + " " + (title || ""));
  }

  function rotuloColuna(item) {
    var r = (item.label || "").trim();
    if (!r || /^[.\s]+$/.test(r)) r = (item.title || "").trim();
    return r || "Coluna";
  }

  function fmtMlResumo(val) {
    if (val === null || val === undefined) return null;
    return val >= 1000
      ? val.toLocaleString("pt-BR", { maximumFractionDigits: 0 })
      : String(Math.round(val));
  }

  function fmtItemDetalhe(item, campo) {
    var rotulo = rotuloColuna(item);
    var cols = bhCols;

    if (campo === "fistulas") {
      if (cols && cols.isColunaOutrasFistulasBH(item.label, item.title)) {
        if (item.ml !== null && item.ml > 0) return fmtMlResumo(item.ml);
        if (item.texto && String(item.texto).trim()) return String(item.texto).trim();
        return rotulo;
      }
      if (cols && cols.isFistulaPorTexto(item.texto)) {
        var texto = String(item.texto).trim();
        if (item.ml !== null && item.ml > 0) {
          return texto + " " + fmtMlResumo(item.ml);
        }
        return texto;
      }
    }

    if (item.ml !== null && item.ml > 0) return rotulo + " " + fmtMlResumo(item.ml);
    if (item.texto && String(item.texto).trim()) return rotulo + " " + String(item.texto).trim();
    return rotulo;
  }

  function isDrenoJp(label, title) {
    return /\bjp\b|jackson|blake|penrose|hemovac|redon/i.test(combinedNorm(label, title));
  }

  function isDrenoTl(label, title) {
    return /tor[aá]c|pleural|chest\s*tube|mediastin|\btl\b/i.test(combinedNorm(label, title));
  }

  function isDrenoPig(label, title) {
    return /\bpig\b|portovac/i.test(combinedNorm(label, title));
  }

  /**
   * @param {{ label?: string, title?: string, categoria?: string, ml?: number|null, texto?: string|null }} item
   * @returns {'fezes'|'fistulas'|'vomitos'|'sng'|'drenos'|'drenoJp'|'drenoTl'|'drenoPig'|null}
   */
  function campoPassometroParaEliminacao(item) {
    if (!item) return null;
    var label = item.label || "";
    var title = item.title || "";
    var cols = bhCols;

    if (cols && cols.isColunaOstomiaFezesBH(label, title)) return "fezes";
    if (cols && cols.isColunaVomitoBH(label, title)) return "vomitos";
    if (cols && cols.isColunaSngBH(label, title)) return "sng";
    if (/fezes|evacua[cç][aã]o/i.test(combinedNorm(label, title))) return "fezes";

    if (cols && cols.isColunaOutrasFistulasBH(label, title)) return "fistulas";
    if (cols && cols.isFistulaPorTexto(item.texto)) return "fistulas";

    if (item.categoria === "dreno" || (cols && cols.classificarColunaEliminacaoBH(label, title) === "dreno")) {
      if (isDrenoJp(label, title)) return "drenoJp";
      if (isDrenoTl(label, title)) return "drenoTl";
      if (isDrenoPig(label, title)) return "drenoPig";
      return "drenos";
    }

    if (cols && cols.isColunaOutrosBH && cols.isColunaOutrosBH(label, title)) {
      return "drenos";
    }

    return null;
  }

  function appendDetalhe(bucket, detalhe) {
    if (!detalhe) return;
    if (!bucket.detalhes.length) {
      bucket.detalhes.push(detalhe);
      return;
    }
    bucket.detalhes.push(detalhe);
  }

  function finalizeCampo(bucket, campo) {
    if (!bucket.detalhes.length) return "";
    if (campo === "fistulas" && bucket.mlTotal > 0) {
      return fmtMlResumo(bucket.mlTotal) + " mL";
    }
    var parts = bucket.detalhes;
    if (parts.length === 1) {
      var single = parts[0];
      if (/mL$/i.test(single)) return single;
      if (bucket.mlTotal > 0) return single + " mL";
      return single;
    }
    var last = parts[parts.length - 1];
    var suffix = /mL$/i.test(last) ? "" : bucket.mlTotal > 0 ? " mL" : "";
    return parts.join("; ") + suffix;
  }

  /**
   * @param {Array<{ label?: string, title?: string, categoria?: string, ml?: number|null, texto?: string|null }>} eliminacoesDetalhe
   * @returns {Record<string, string>}
   */
  function agregarEliminacoesPassometro(eliminacoesDetalhe) {
    var out = {
      fezes: "",
      fistulas: "",
      vomitos: "",
      sng: "",
      drenos: "",
      drenoJp: "",
      drenoTl: "",
      drenoPig: "",
    };
    if (!eliminacoesDetalhe || !eliminacoesDetalhe.length) return out;

    var buckets = {};
    function getBucket(campo) {
      if (!buckets[campo]) buckets[campo] = { detalhes: [], mlTotal: 0 };
      return buckets[campo];
    }

    for (var i = 0; i < eliminacoesDetalhe.length; i++) {
      var item = eliminacoesDetalhe[i];
      var campo = campoPassometroParaEliminacao(item);
      if (!campo) continue;
      var bucket = getBucket(campo);
      if (item.ml !== null && item.ml > 0) bucket.mlTotal += item.ml;
      appendDetalhe(bucket, fmtItemDetalhe(item, campo));
    }

    var keys = Object.keys(buckets);
    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];
      out[key] = finalizeCampo(buckets[key], key);
    }
    return out;
  }

  var SEGMENTO_LABELS = {
    fezes: "Fezes",
    fistulas: "Fístulas",
    vomitos: "Vômitos",
    sng: "SNG",
    drenos: "Drenos",
    drenoJp: "Dreno JP",
    drenoTl: "Dreno TL",
    drenoPig: "Dreno PIG",
  };

  /**
   * @param {Record<string, string>} agregado
   * @returns {string[]}
   */
  function formatarSegmentosPassometro(agregado) {
    var segmentos = [];
    if (!agregado || typeof agregado !== "object") return segmentos;
    var ordem = [
      "fezes",
      "fistulas",
      "vomitos",
      "sng",
      "drenos",
      "drenoJp",
      "drenoTl",
      "drenoPig",
    ];
    for (var i = 0; i < ordem.length; i++) {
      var campo = ordem[i];
      var val = agregado[campo];
      if (val && String(val).trim()) {
        segmentos.push(SEGMENTO_LABELS[campo] + " " + String(val).trim());
      }
    }
    return segmentos;
  }

  return {
    campoPassometroParaEliminacao: campoPassometroParaEliminacao,
    agregarEliminacoesPassometro: agregarEliminacoesPassometro,
    formatarSegmentosPassometro: formatarSegmentosPassometro,
    fmtMlResumo: fmtMlResumo,
    rotuloColuna: rotuloColuna,
  };
});

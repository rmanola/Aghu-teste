/**
 * Classificação de colunas da tabela BH (rótulos AGHU quando painéis verde/azul ausentes).
 * Testável em Node via module.exports; extensão: global AghuControlesBhColumns.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuControlesBhColumns = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var RE_OSTOMIA_INTESTINAL =
    /colostom|ileostom|jejunostom|gastrostom|duodenostom|enterostom|sigmoidostom|ostomia\s*intestinal|enterocut[aâ]nea|fistul\w*\s*enter|drenagem\s*enteral|\bpeg\b|\bgtt\b/i;

  var RE_OSTOMIA_EXCLUIDA =
    /traqueostom|cricotireoidostom|traqueotom|urostom|nefrostom|cistostom|colecistostom|coledocostom|hepaticostom/i;

  var RE_VOMITO_SNG =
    /v[oô]mit|emese|\bsng\b|nasog[aá]str/i;

  var RE_DRENO =
    /dreno|hemovac|redon|jackson|\bjp\b|blake|penrose|tor[aá]c|pleural|chest\s*tube|mediastin|peric[aá]rd|abdominal|hep[aá]t|biliar|kehr|t[\s-]?tube|pancre|peritoneal|cavidade|quir[uú]rg|vac(?:uum)?\s*terap|v\.a\.c|portovac|tolumen|gramas|d[eé]bito\s*g\b|lcr|cefalorraqu|ventricular|\bdvp\b|deriv.*liquor|liqu[oó]ric|quilos|bilioma|cole[cç]istostom|aspir.*(ferida|cir[uú]rg|wound)|saco\s*coletor|outros/i;

  function norm(s) {
    return (s || "").toLowerCase().replace(/[\s\xa0]+/g, " ").trim();
  }

  function combinedNorm(label, title) {
    return norm((label || "") + " " + (title || ""));
  }

  function isColunaUrinariaBH(label, title) {
    var n = combinedNorm(label, title);
    return /urina|urinou|sonda\s*vesical\s*de\s*demora|sonda\s*vesical\s*de\s*al[ií]vio|\bsvd\b|\bsva\b|cateter\s*vesical|elimin[aç][aã]o\s*urin|di[uú]rese|mic[cç][aã]o|bexiga|urostom|nefrostom|cistostom/i.test(
      n,
    );
  }

  /** Urinou/Evacuou são flags booleanas — não somar como volume de DU. */
  function isColunaUrinariaVolumeBH(label, title) {
    var lbl = norm(label || "").replace(/\s/g, "");
    if (/^urinou$/i.test(lbl)) return false;
    return isColunaUrinariaBH(label, title);
  }

  /** Vias aéreas, urinárias e biliares — nunca mapear para fezes. */
  function isColunaOstomiaExcluidaBH(label, title) {
    return RE_OSTOMIA_EXCLUIDA.test(combinedNorm(label, title));
  }

  /** Ostomias intestinais e débitos entéricos → cédula Fezes do passômetro. */
  function isColunaOstomiaFezesBH(label, title) {
    var n = combinedNorm(label, title);
    if (!n) return false;
    if (isColunaOstomiaExcluidaBH(label, title)) return false;
    if (isColunaUrinariaBH(label, title)) return false;
    if (RE_VOMITO_SNG.test(n)) return false;
    return RE_OSTOMIA_INTESTINAL.test(n);
  }

  function isColunaVomitoBH(label, title) {
    return /v[oô]mit|emese/i.test(combinedNorm(label, title));
  }

  function isColunaSngBH(label, title) {
    return /\bsng\b|nasog[aá]str/i.test(combinedNorm(label, title));
  }

  var RE_FISTULA_TEXTO =
    /fistul|enterocut[aâ]nea|enteroenter|enterojejun|pancreatic/i;

  function isColunaOutrasFistulasBH(label, title) {
    var lbl = norm(label || "").replace(/\s/g, "");
    if (/^outrasf$/i.test(lbl)) return true;
    return /outras\s*f[ií]stul/i.test(combinedNorm(label, title));
  }

  function isFistulaPorTexto(texto) {
    if (!texto || !String(texto).trim()) return false;
    var t = norm(texto);
    if (RE_OSTOMIA_EXCLUIDA.test(t)) return false;
    return RE_FISTULA_TEXTO.test(t);
  }

  /** Colunas eliminadas genéricas (Outros., OutrosD2, Outros drenos). */
  function isColunaOutrosBH(label, title) {
    var lbl = norm(label || "").replace(/\s/g, "");
    var n = combinedNorm(label, title);
    if (/^outros\.?$/.test(lbl)) return true;
    if (/^outrosd\d+$/.test(lbl)) return true;
    if (/outros\s*drenos?/i.test(n)) return true;
    return false;
  }

  /**
   * @returns {'urinario'|'digestivo'|'dreno'|'outro'}
   */
  function classificarColunaEliminacaoBH(label, title) {
    var n = combinedNorm(label, title);
    if (!n) return "outro";
    if (isColunaUrinariaBH(label, title)) return "urinario";
    if (isColunaVomitoBH(label, title) || isColunaSngBH(label, title)) return "digestivo";
    if (isColunaOutrasFistulasBH(label, title)) return "digestivo";
    if (isColunaOstomiaFezesBH(label, title)) return "digestivo";
    if (/fezes|evacua[cç][aã]o/i.test(n)) return "digestivo";
    if (RE_DRENO.test(n)) return "dreno";
    return "outro";
  }

  /**
   * Fallback quando detectarTipoColunaBH retorna desconhecido (sem painéis verde/azul).
   * @param {string} label
   * @param {string} title
   * @returns {'administrado'|'eliminado'|'desconhecido'}
   */
  function inferirTipoColunaBHPorRotulo(label, title) {
    var lbl = norm(label || "").replace(/\s/g, "");
    var n = combinedNorm(label, title);
    if (!n && !lbl) return "desconhecido";
    if (/^urinou$|^evacuou$/i.test(lbl)) return "desconhecido";
    if (/anota/i.test(n)) return "desconhecido";
    if (isColunaUrinariaVolumeBH(label, title)) return "eliminado";
    if (
      /^vo$|^água|^agua|^medev|\bhv\b|hemoderiv|soro|glic|nacl|ringer|\bsf\b|albumina|plasma|volume\s*admin|infus/i.test(
        n,
      )
    )
      return "administrado";
    if (isColunaOutrasFistulasBH(label, title)) return "eliminado";
    if (isColunaOstomiaFezesBH(label, title)) return "eliminado";
    if (isColunaVomitoBH(label, title) || isColunaSngBH(label, title)) return "eliminado";
    if (/fezes|evacua|vomit|emese|dreno|outros/i.test(n)) return "eliminado";
    if (RE_DRENO.test(n)) return "eliminado";
    return "desconhecido";
  }

  /**
   * @param {'administrado'|'eliminado'|'desconhecido'} detected
   * @param {string} label
   * @param {string} title
   */
  function resolveTipoColunaBH(detected, label, title) {
    if (detected && detected !== "desconhecido") return detected;
    return inferirTipoColunaBHPorRotulo(label, title);
  }

  return {
    norm: norm,
    isColunaUrinariaBH: isColunaUrinariaBH,
    isColunaUrinariaVolumeBH: isColunaUrinariaVolumeBH,
    isColunaOstomiaExcluidaBH: isColunaOstomiaExcluidaBH,
    isColunaOstomiaFezesBH: isColunaOstomiaFezesBH,
    isColunaVomitoBH: isColunaVomitoBH,
    isColunaSngBH: isColunaSngBH,
    isColunaOutrosBH: isColunaOutrosBH,
    isColunaOutrasFistulasBH: isColunaOutrasFistulasBH,
    isFistulaPorTexto: isFistulaPorTexto,
    classificarColunaEliminacaoBH: classificarColunaEliminacaoBH,
    inferirTipoColunaBHPorRotulo: inferirTipoColunaBHPorRotulo,
    resolveTipoColunaBH: resolveTipoColunaBH,
  };
});

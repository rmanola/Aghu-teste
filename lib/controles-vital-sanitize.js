/**
 * Sanitização de vitais da monitorização — corrige vírgula decimal omitida (ex.: 365 → 36,5).
 * Testável em Node; extensão: global AghuControlesVitalSanitize.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuControlesVitalSanitize = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /** @type {Record<string, { min: number, max: number }>} */
  var VITAL_RANGES = {
    tax: { min: 30, max: 45 },
    fc: { min: 20, max: 400 },
    fr: { min: 4, max: 80 },
    spo2: { min: 50, max: 100 },
    hgt: { min: 20, max: 600 },
    pam: { min: 30, max: 200 },
    pas: { min: 40, max: 280 },
    pad: { min: 20, max: 180 },
  };

  var SANITIZED_FIELDS = new Set([
    "tax",
    "fc",
    "fr",
    "spo2",
    "hgt",
    "pam",
    "pas",
    "pad",
  ]);

  /**
   * @param {string} field
   * @param {number|null|undefined} value
   * @returns {number|null}
   */
  function sanitizeMonitorVital(field, value) {
    if (value == null || !Number.isFinite(value)) return value == null ? null : value;
    var range = VITAL_RANGES[field];
    if (!range) return value;
    if (value >= range.min && value <= range.max) return value;

    var scaled = value;
    for (var k = 1; k <= 2; k++) {
      scaled = value / Math.pow(10, k);
      if (scaled >= range.min && scaled <= range.max) return scaled;
    }
    return null;
  }

  function fmtBrNum(val, dec) {
    if (val === null || val === undefined || !Number.isFinite(val)) return "";
    if (dec === undefined) dec = Number.isInteger(val) ? 0 : 1;
    return val.toFixed(dec).replace(".", ",");
  }

  function parseBrToken(raw) {
    var t = String(raw || "").trim();
    if (!t) return null;
    var v = parseFloat(t.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(v) ? v : null;
  }

  /**
   * @param {string} raw
   * @param {string} field
   * @returns {{ min: number|null, max: number|null, mid: number|null }}
   */
  function sanitizeVitalEndpoints(raw, field) {
    var t = String(raw || "").trim();
    if (!t) return { min: null, max: null, mid: null };

    var rangeMatch = t.match(/^([\d.,]+)\s*-\s*([\d.,]+)$/);
    var ends = [];
    if (rangeMatch) {
      var a = sanitizeMonitorVital(field, parseBrToken(rangeMatch[1]));
      var b = sanitizeMonitorVital(field, parseBrToken(rangeMatch[2]));
      if (a != null) ends.push(a);
      if (b != null) ends.push(b);
    } else {
      var n = sanitizeMonitorVital(field, parseBrToken(t));
      if (n != null) ends.push(n);
    }

    if (!ends.length) return { min: null, max: null, mid: null };
    var min = Math.min.apply(null, ends);
    var max = Math.max.apply(null, ends);
    return { min: min, max: max, mid: min === max ? min : (min + max) / 2 };
  }

  function sanitizePaPairString(pasRaw, padRaw) {
    var pas = sanitizeMonitorVital("pas", parseInt(String(pasRaw), 10));
    var pad = sanitizeMonitorVital("pad", parseInt(String(padRaw), 10));
    if (pas == null || pad == null) return null;
    return pas + "/" + pad;
  }

  /**
   * Sanitiza o corpo do segmento PA.
   * FEAT-304: sequência com vírgulas e/ou horários `(HH:MM)` deve ser
   * preservada (só corrige escala dos pares); intervalo clássico `a/b - c/d`
   * continua a colapsar para primeiro–último.
   * @param {string} body
   * @returns {string}
   */
  function sanitizePaSegmentBody(body) {
    var t = String(body || "").trim();
    if (!t) return t;
    var tokens = [];
    var re = /(\d+)\s*[xX/×\-]\s*(\d+)(?:\s*\((\d{1,2}:\d{2})\))?/gi;
    var m;
    while ((m = re.exec(t)) !== null) {
      var pair = sanitizePaPairString(m[1], m[2]);
      if (pair) {
        tokens.push({ pair: pair, time: m[3] || "" });
      }
    }
    if (!tokens.length) return t;
    if (tokens.length === 1) {
      return tokens[0].time
        ? tokens[0].pair + " (" + tokens[0].time + ")"
        : tokens[0].pair;
    }
    var isSequence =
      /,/.test(t) ||
      tokens.some(function (tok) {
        return !!tok.time;
      });
    if (isSequence) {
      return tokens
        .map(function (tok) {
          return tok.time ? tok.pair + " (" + tok.time + ")" : tok.pair;
        })
        .join(", ");
    }
    return tokens[0].pair + " - " + tokens[tokens.length - 1].pair;
  }

  function sanitizeRangeSegment(prefix, body, suffix, field) {
    var ends = sanitizeVitalEndpoints(body, field);
    if (ends.min == null) return null;
    if (ends.min === ends.max) {
      return prefix + String(Math.round(ends.min)) + suffix;
    }
    return (
      prefix +
      String(Math.round(ends.min)) +
      "-" +
      String(Math.round(ends.max)) +
      suffix
    );
  }

  function sanitizeTaxSegment(seg) {
    var m = seg.match(/^(TAX\s+)([\d,]+(?:-[\d,]+)?)(\s*ºC)(.*)$/i);
    if (!m) return seg;
    var taxBody = sanitizeVitalEndpoints(m[2], "tax");
    if (taxBody.min == null) return seg;
    var taxStr =
      taxBody.min === taxBody.max
        ? fmtBrNum(taxBody.min, 1)
        : fmtBrNum(taxBody.min, 1) + "-" + fmtBrNum(taxBody.max, 1);
    var tail = m[4] || "";
    if (tail && /\[febre:/i.test(tail)) {
      tail = tail.replace(
        /\[febre:\s*([\d,]+)\s*ºC\s*\(([^)]+)\)\]/gi,
        function (_all, val, h) {
          var fixed = sanitizeMonitorVital("tax", parseBrToken(val));
          if (fixed == null) return "";
          return "[febre: " + fmtBrNum(fixed, 1) + " ºC (" + h + ")]";
        },
      );
      tail = tail.replace(/\s{2,}/g, " ").trim();
      if (tail) tail = " " + tail;
    }
    return m[1] + taxStr + m[3] + tail;
  }

  /**
   * Reescreve segmentos canônicos do texto de controles com vitais corrigidos.
   * @param {string} texto
   * @returns {string}
   */
  function sanitizeControlesTexto(texto) {
    var digest = String(texto || "").trim();
    if (!digest) return digest;

    var segments = digest.split(" | ");
    var changed = false;
    var out = segments.map(function (seg) {
      var s = seg.trim();
      if (!s) return seg;

      var next = s;
      var m;

      if (/^TAX\s+/i.test(s)) {
        next = sanitizeTaxSegment(s);
      } else if (/^PA\s+/i.test(s)) {
        m = s.match(/^PA\s+(.+?)\s*mmHg$/i);
        if (m) {
          var paBody = sanitizePaSegmentBody(m[1]);
          if (paBody !== m[1]) next = "PA " + paBody + " mmHg";
        }
      } else if (/^PAM\s+/i.test(s)) {
        m = s.match(/^PAM\s+([\d]+(?:-[\d]+)?)\s*mmHg/i);
        if (m) {
          var pamSeg = sanitizeRangeSegment("PAM ", m[1], " mmHg", "pam");
          if (pamSeg) next = pamSeg;
        }
      } else if (/^FC\s+/i.test(s)) {
        m = s.match(/^FC\s+([\d]+(?:-[\d]+)?)\s*bpm/i);
        if (m) {
          var fcSeg = sanitizeRangeSegment("FC ", m[1], " bpm", "fc");
          if (fcSeg) next = fcSeg;
        }
      } else if (/^FR\s+/i.test(s)) {
        m = s.match(/^FR\s+([\d]+(?:-[\d]+)?)\s*irpm/i);
        if (m) {
          var frSeg = sanitizeRangeSegment("FR ", m[1], " irpm", "fr");
          if (frSeg) next = frSeg;
        }
      } else if (/^SpO₂\s+/i.test(s)) {
        m = s.match(/^SpO₂\s+([\d]+(?:-[\d]+)?)%/);
        if (m) {
          var spo2Seg = sanitizeRangeSegment("SpO₂ ", m[1], "%", "spo2");
          if (spo2Seg) next = spo2Seg;
        }
      } else if (/^HGT\s+/i.test(s)) {
        m = s.match(/^HGT\s+(.+?)\s*mg\/dL/i);
        if (m) {
          var hgtBody = m[1];
          var hgtNext = hgtBody.replace(
            /([\d.,]+)(\s*\(\d{1,2}:\d{2}\))?/g,
            function (full, num, time) {
              var fixed = sanitizeMonitorVital("hgt", parseBrToken(num));
              if (fixed == null) return full;
              var asStr = String(Math.round(fixed));
              return asStr + (time || "");
            },
          );
          hgtNext = hgtBody.replace(
            /([\d.,]+)\s*-\s*([\d.,]+)/,
            function (_all, a, b) {
              var ea = sanitizeMonitorVital("hgt", parseBrToken(a));
              var eb = sanitizeMonitorVital("hgt", parseBrToken(b));
              if (ea == null || eb == null) return _all;
              return String(Math.round(ea)) + "-" + String(Math.round(eb));
            },
          );
          if (hgtNext !== hgtBody) next = "HGT " + hgtNext + " mg/dL";
        }
      }

      if (next !== s) changed = true;
      return next;
    });

    return changed ? out.join(" | ") : digest;
  }

  return {
    VITAL_RANGES: VITAL_RANGES,
    SANITIZED_FIELDS: SANITIZED_FIELDS,
    sanitizeMonitorVital: sanitizeMonitorVital,
    sanitizeVitalEndpoints: sanitizeVitalEndpoints,
    sanitizePaPairString: sanitizePaPairString,
    sanitizeControlesTexto: sanitizeControlesTexto,
  };
});

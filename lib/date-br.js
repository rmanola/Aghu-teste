/**
 * Datas no formato brasileiro (dd/mm/aaaa) ↔ ISO (yyyy-mm-dd).
 * Usado no popup e na mensagem de erro do content script.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.AghuDateBr = api;
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this, function () {
  "use strict";

  var BR_DATE_TOKEN_RE = /(\d{1,2}\/\d{1,2}\/\d{2,4})/;

  function expandYear(yy) {
    var n = parseInt(yy, 10);
    if (!Number.isFinite(n)) return yy;
    if (n >= 100) return String(n);
    return String(n < 50 ? 2000 + n : 1900 + n);
  }

  function isoToBr(iso) {
    if (!iso) return "";
    var p = String(iso).trim().split("-");
    if (p.length !== 3) return String(iso);
    var y = p[0];
    var m = p[1];
    var d = p[2];
    if (!y || !m || !d) return String(iso);
    return d.padStart(2, "0") + "/" + m.padStart(2, "0") + "/" + y;
  }

  /** ISO (yyyy-mm-dd) → dd/mm/yy (ano com 2 dígitos). */
  function isoToBrYy(iso) {
    if (!iso) return "";
    var p = String(iso).trim().split("-");
    if (p.length !== 3) return String(iso);
    var y = p[0];
    var m = p[1];
    var d = p[2];
    if (!y || !m || !d) return String(iso);
    var yy = String(y).slice(-2);
    return d.padStart(2, "0") + "/" + m.padStart(2, "0") + "/" + yy;
  }

  /** Primeira data dd/mm/aaaa(aa) em texto composto (ex.: "HCPA 05/06/2026"). */
  function extractBrDateToken(raw) {
    if (!raw || String(raw).trim() === "") return null;
    var m = String(raw).trim().match(BR_DATE_TOKEN_RE);
    return m ? m[1] : null;
  }

  function brTokenToIso(token) {
    if (!token) return null;
    var m = String(token).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (!m) return null;
    var d = parseInt(m[1], 10);
    var mo = parseInt(m[2], 10);
    var y = parseInt(m[3], 10);
    if (y < 100) y = y < 50 ? 2000 + y : 1900 + y;
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return null;
    return (
      String(y).padStart(4, "0") +
      "-" +
      String(mo).padStart(2, "0") +
      "-" +
      String(d).padStart(2, "0")
    );
  }

  function brToIso(br) {
    if (!br) return null;
    var token = extractBrDateToken(br) || String(br).trim().split(/\s+/)[0];
    return brTokenToIso(token);
  }

  /** Alias: dd/mm em texto livre → ISO. */
  function brToIsoFromRaw(raw) {
    return brToIso(raw);
  }

  /** Data de coleta da tabela AGHU → { iso, label }. */
  function parseColetaFromRaw(raw) {
    if (!raw || String(raw).trim() === "") return { iso: null, label: "sem data" };
    var token = extractBrDateToken(raw);
    if (!token) return { iso: null, label: "sem data" };
    var iso = brTokenToIso(token);
    if (!iso) return { iso: null, label: "sem data" };
    var parts = token.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (!parts) return { iso: iso, label: isoToBr(iso) };
    var y = parseInt(parts[3], 10);
    if (y < 100) y = y < 50 ? 2000 + y : 1900 + y;
    var label =
      String(parseInt(parts[1], 10)).padStart(2, "0") +
      "/" +
      String(parseInt(parts[2], 10)).padStart(2, "0") +
      "/" +
      y;
    return { iso: iso, label: label };
  }

  function localTodayBr() {
    var t = new Date();
    return (
      String(t.getDate()).padStart(2, "0") +
      "/" +
      String(t.getMonth() + 1).padStart(2, "0") +
      "/" +
      t.getFullYear()
    );
  }

  function localYesterdayBr() {
    var t = new Date();
    t.setDate(t.getDate() - 1);
    return (
      String(t.getDate()).padStart(2, "0") +
      "/" +
      String(t.getMonth() + 1).padStart(2, "0") +
      "/" +
      t.getFullYear()
    );
  }

  function localTodayIso() {
    return brToIso(localTodayBr());
  }

  /** Aceita dd/mm/aaaa ou yyyy-mm-dd (legado type=date). */
  function toFilterIso(value) {
    if (!value) return null;
    var raw = String(value).trim();
    if (!raw) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    return brToIso(raw);
  }

  /** Valor para exibir no popup (sempre dd/mm/aaaa quando possível). */
  function toDisplayBr(value) {
    if (!value) return "";
    var raw = String(value).trim();
    if (!raw) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return isoToBr(raw);
    return raw;
  }

  /**
   * Valor para exibir em card/copy curto (sempre dd/mm/yy quando possível).
   * Aceita ISO ou dd/mm/aaaa(aa); inválido devolve a string original.
   */
  function toDisplayBrYy(value) {
    if (!value) return "";
    var raw = String(value).trim();
    if (!raw) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return isoToBrYy(raw);
    var iso = brToIso(raw);
    if (iso) return isoToBrYy(iso);
    return raw;
  }

  /**
   * Máscara progressiva dd/mm/aaaa enquanto o utilizador digita (só dígitos).
   * @param {string} value
   * @returns {string}
   */
  function maskBrDateInput(value) {
    var digits = String(value || "").replace(/\D/g, "").slice(0, 8);
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) {
      return digits.slice(0, 2) + "/" + digits.slice(2);
    }
    return (
      digits.slice(0, 2) +
      "/" +
      digits.slice(2, 4) +
      "/" +
      digits.slice(4)
    );
  }

  /**
   * Conta dígitos à esquerda do caret (para restaurar posição após remask).
   * @param {string} value
   * @param {number} caret
   * @returns {number}
   */
  function digitCountBeforeCaret(value, caret) {
    var raw = String(value || "");
    var idx = typeof caret === "number" ? caret : raw.length;
    if (idx < 0) idx = 0;
    if (idx > raw.length) idx = raw.length;
    return raw.slice(0, idx).replace(/\D/g, "").length;
  }

  /**
   * Posição do caret no valor mascarado após N dígitos.
   * @param {string} masked
   * @param {number} digitCount
   * @returns {number}
   */
  function caretIndexForDigitCount(masked, digitCount) {
    var text = String(masked || "");
    var want = typeof digitCount === "number" ? digitCount : 0;
    if (want <= 0) return 0;
    var seen = 0;
    for (var i = 0; i < text.length; i++) {
      if (/\d/.test(text.charAt(i))) {
        seen += 1;
        if (seen >= want) return i + 1;
      }
    }
    return text.length;
  }

  /**
   * Aplica máscara e devolve caret estável (mesmo índice de dígitos).
   * @param {string} rawValue valor após a tecla (ainda sem máscara final)
   * @param {number} caret selectionStart nesse valor
   * @returns {{ value: string, caret: number }}
   */
  function maskBrDateInputWithCaret(rawValue, caret) {
    var digitsBefore = digitCountBeforeCaret(rawValue, caret);
    var masked = maskBrDateInput(rawValue);
    return {
      value: masked,
      caret: caretIndexForDigitCount(masked, digitsBefore),
    };
  }

  /**
   * Normaliza texto compacto (ex. 010626) ou parcial para dd/mm/aaaa.
   * @param {string} value
   * @returns {string}
   */
  function normalizeBrDateDisplay(value) {
    var raw = String(value || "").trim();
    if (!raw) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return isoToBr(raw);

    var digits = raw.replace(/\D/g, "");
    if (digits.length === 6) {
      var dd6 = digits.slice(0, 2);
      var mm6 = digits.slice(2, 4);
      var yy6 = expandYear(digits.slice(4, 6));
      var iso6 = brTokenToIso(dd6 + "/" + mm6 + "/" + yy6);
      return iso6 ? isoToBr(iso6) : maskBrDateInput(digits);
    }
    if (digits.length === 8) {
      var dd8 = digits.slice(0, 2);
      var mm8 = digits.slice(2, 4);
      var yyyy8 = digits.slice(4, 8);
      var iso8 = brTokenToIso(dd8 + "/" + mm8 + "/" + yyyy8);
      return iso8 ? isoToBr(iso8) : maskBrDateInput(digits);
    }

    var token = extractBrDateToken(raw) || raw.split(/\s+/)[0];
    var iso = brTokenToIso(token);
    if (iso) return isoToBr(iso);
    return maskBrDateInput(raw);
  }

  /**
   * Liga máscara (input) e normalização (blur) num campo de data BR.
   * @param {HTMLInputElement|null} inputEl
   * @param {{ onAfter?: () => void }} [options]
   */
  function bindBrDateInput(inputEl, options) {
    if (!inputEl || inputEl.dataset.aghuDateBound) return;
    inputEl.dataset.aghuDateBound = "1";
    inputEl.setAttribute("inputmode", "numeric");
    if (!inputEl.getAttribute("placeholder")) {
      inputEl.setAttribute("placeholder", "dd/mm/aaaa");
    }
    var onAfter = options && options.onAfter ? options.onAfter : null;
    inputEl.addEventListener("input", function () {
      var caret = inputEl.selectionStart || 0;
      var masked = maskBrDateInputWithCaret(inputEl.value, caret);
      inputEl.value = masked.value;
      inputEl.setSelectionRange(masked.caret, masked.caret);
      if (onAfter) onAfter();
    });
    inputEl.addEventListener("blur", function () {
      var normalized = normalizeBrDateDisplay(inputEl.value);
      if (normalized !== inputEl.value) inputEl.value = normalized;
      if (onAfter) onAfter();
    });
  }

  return {
    isoToBr: isoToBr,
    isoToBrYy: isoToBrYy,
    extractBrDateToken: extractBrDateToken,
    brTokenToIso: brTokenToIso,
    brToIso: brToIso,
    brToIsoFromRaw: brToIsoFromRaw,
    parseColetaFromRaw: parseColetaFromRaw,
    localTodayBr: localTodayBr,
    localYesterdayBr: localYesterdayBr,
    localTodayIso: localTodayIso,
    toFilterIso: toFilterIso,
    toDisplayBr: toDisplayBr,
    toDisplayBrYy: toDisplayBrYy,
    maskBrDateInput: maskBrDateInput,
    digitCountBeforeCaret: digitCountBeforeCaret,
    caretIndexForDigitCount: caretIndexForDigitCount,
    maskBrDateInputWithCaret: maskBrDateInputWithCaret,
    normalizeBrDateDisplay: normalizeBrDateDisplay,
    bindBrDateInput: bindBrDateInput,
  };
});

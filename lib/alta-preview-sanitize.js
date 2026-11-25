/**
 * Sanitização mínima do HTML de pré-visualização antes de persistir no snap.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuAltaPreviewSanitize = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var DISALLOWED_TAG_RE =
    /<\/?(?:script|iframe|object|embed|link|meta|style|font)\b[^>]*>/gi;

  /**
   * Uma passagem não chega: remover o interior de `<scr<script>ipt>` deixa
   * `<script>` reconstituído, e o mesmo vale para `javasjavascript:cript:`.
   * O ciclo repete até o resultado estabilizar.
   */
  var MAX_PASSES = 20;

  function sanitizeOnce(input) {
    var s = input;
    s = s.replace(DISALLOWED_TAG_RE, "");
    // A fronteira aceita `/` além de espaço: `<img/onerror=...>` não tem
    // espaço antes do handler e escapava ao padrão anterior.
    s = s.replace(/[\s/]+(on\w+)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, " ");
    s = s.replace(/[\s/]+style\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, " ");
    s = s.replace(/javascript:/gi, "");
    return s;
  }

  function sanitizePreviewHtml(html) {
    if (html == null) return "";
    var s = String(html);
    for (var i = 0; i < MAX_PASSES; i++) {
      var next = sanitizeOnce(s);
      if (next === s) return s;
      s = next;
    }
    // Entrada que não estabiliza em 20 passagens não é um documento: é um
    // ataque a explorar reconstituição. Falha fechado — pré-visualização
    // vazia é visível, HTML possivelmente perigoso não é.
    return "";
  }

  return {
    sanitizePreviewHtml: sanitizePreviewHtml,
  };
});

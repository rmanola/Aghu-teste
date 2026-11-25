/**
 * Domínios onde a extensão injeta content scripts (SEC-A-01).
 * Não inclui localhost — evita interferir no painel web Next.js (:3000).
 */
(function () {
  "use strict";

  var AGHU_HOST_PATTERNS = [
    "*://*.hcpa.edu.br/*",
    "*://*.ebserh.gov.br/*",
    "*://aghu.hucam-ufes.ebserh/*",
  ];

  /**
   * Interceptação PDF (webRequest blocking). Só hospitais AGHU —
   * localhost bloqueava main_frame do painel web em dev.
   */
  var AGHU_PDF_WEBREQUEST_PATTERNS = AGHU_HOST_PATTERNS.slice();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { AGHU_HOST_PATTERNS, AGHU_PDF_WEBREQUEST_PATTERNS };
  } else {
    var root = typeof globalThis !== "undefined" ? globalThis : self;
    root.AghuHostPatterns = {
      AGHU_HOST_PATTERNS: AGHU_HOST_PATTERNS,
      AGHU_PDF_WEBREQUEST_PATTERNS: AGHU_PDF_WEBREQUEST_PATTERNS,
    };
  }
})();

"use strict";

(function () {
  var params = new URLSearchParams(window.location.search);
  var target = params.get("to");
  if (!target) {
    document.body.textContent = "URL do painel inválida.";
    return;
  }
  try {
    var parsed = new URL(target);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      document.body.textContent = "URL do painel inválida.";
      return;
    }
  } catch (_e) {
    document.body.textContent = "URL do painel inválida.";
    return;
  }
  window.location.replace(target);
})();

/**
 * Estado visual dos botões Extrair/Copiar na aba exames (popup).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuPopupActionButtons = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var EXTRACT_LABEL_IDLE = " Extrair";
  var EXTRACT_LABEL_LOADING = " Extraindo...";

  /**
   * @param {boolean} loading
   * @returns {string}
   */
  function extractButtonLabel(loading) {
    return loading ? EXTRACT_LABEL_LOADING : EXTRACT_LABEL_IDLE;
  }

  /**
   * @param {HTMLElement} btnExtract
   * @param {HTMLElement} btnCopy
   */
  function createActionButtons(btnExtract, btnCopy) {
    if (!btnExtract || !btnCopy) {
      return {
        restoreExtractButton: function () {},
        setExtractButtonLoading: function () {},
        restoreCopyButton: function () {},
        showCopyDoneFeedback: function () {},
      };
    }

    var btnExtractDefault = btnExtract.cloneNode(true);
    var btnCopyDefault = btnCopy.cloneNode(true);

    function restoreExtractButton() {
      var n = btnExtractDefault.cloneNode(true);
      btnExtract.replaceChildren.apply(btnExtract, n.childNodes);
    }

    function setExtractButtonLoading(loading) {
      restoreExtractButton();
      var labelEl = btnExtract.querySelector(".btn-extract-label");
      if (labelEl) {
        labelEl.textContent = extractButtonLabel(loading).trim();
        return;
      }
      for (var i = 0; i < btnExtract.childNodes.length; i++) {
        var node = btnExtract.childNodes[i];
        if (node.nodeType === Node.TEXT_NODE) {
          node.textContent = extractButtonLabel(loading);
          return;
        }
      }
    }

    function restoreCopyButton() {
      var n = btnCopyDefault.cloneNode(true);
      btnCopy.replaceChildren.apply(btnCopy, n.childNodes);
    }

    function showCopyDoneFeedback() {
      btnCopy.replaceChildren();
      var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("fill", "none");
      svg.setAttribute("stroke", "#4ade80");
      svg.setAttribute("stroke-width", "2");
      svg.setAttribute("width", "14");
      svg.setAttribute("height", "14");
      var poly = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      poly.setAttribute("points", "20 6 9 17 4 12");
      svg.appendChild(poly);
      btnCopy.appendChild(svg);
      btnCopy.appendChild(document.createTextNode(" Copiado!"));
    }

    return {
      restoreExtractButton: restoreExtractButton,
      setExtractButtonLoading: setExtractButtonLoading,
      restoreCopyButton: restoreCopyButton,
      showCopyDoneFeedback: showCopyDoneFeedback,
    };
  }

  return {
    extractButtonLabel: extractButtonLabel,
    createActionButtons: createActionButtons,
  };
});

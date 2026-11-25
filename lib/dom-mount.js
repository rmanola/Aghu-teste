/**
 * Montagem DOM sem innerHTML (compatível com addons-linter AMO).
 */
(function (root) {
  "use strict";

  function mountEmptyMessage(container, id, text) {
    if (!container) return;
    container.replaceChildren();
    const p = document.createElement("p");
    if (id) p.id = id;
    p.textContent = text;
    container.appendChild(p);
  }

  function mountHtmlFragment(container, html) {
    if (!container) return;
    container.replaceChildren();
    if (!html) return;
    const doc = new DOMParser().parseFromString(html, "text/html");
    const nodes = doc.body.childNodes;
    for (let i = 0; i < nodes.length; i++) {
      container.appendChild(nodes[i].cloneNode(true));
    }
  }

  const api = {
    mountEmptyMessage: mountEmptyMessage,
    mountHtmlFragment: mountHtmlFragment,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuDomMount = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);

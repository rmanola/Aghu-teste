/**
 * Catálogo CID-10 (DATASUS subcategorias) — busca por código ou descrição.
 * Pack: cid10-subcategorias.pack.json (Node) + cid10-subcategorias.pack.js
 * (popup: define __AGHU_CID10_PACK__ antes deste script).
 * Gerado por scripts/build-cid10-catalog.mjs. FEAT-316 / ENC-AC-10.
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuCid10Catalog = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  var WELL_FORMED = /^[A-Z]\d{2}(\.\d{1,2})?$/i;
  var entries = [];
  var packLoaded = false;

  function fold(s) {
    return String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function normalizeCidCode(raw) {
    var s = String(raw || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "");
    if (!s) return "";
    // A000 → A00.0
    if (/^[A-Z]\d{3}$/.test(s)) {
      return s[0] + s.slice(1, 3) + "." + s[3];
    }
    return s;
  }

  function isWellFormedCid(code) {
    return WELL_FORMED.test(String(code || "").trim());
  }

  function setPack(list) {
    entries = Array.isArray(list) ? list.slice() : [];
    packLoaded = true;
    return entries.length;
  }

  function loadPack(list) {
    return setPack(list);
  }

  function getEntries() {
    ensureNodePack();
    return entries;
  }

  function ensureNodePack() {
    if (packLoaded) return;
    if (typeof require === "function") {
      try {
        var pack = require("./cid10-subcategorias.pack.json");
        if (Array.isArray(pack)) {
          setPack(pack);
          return;
        }
      } catch (_e) {}
    }
    if (root && Array.isArray(root.__AGHU_CID10_PACK__)) {
      setPack(root.__AGHU_CID10_PACK__);
    }
  }

  function formatCidLabel(entry) {
    if (!entry || typeof entry !== "object") return "";
    var c = entry.c || entry.code || "";
    var d = entry.d || entry.descricao || entry.description || "";
    if (c && d) return c + " — " + d;
    return String(c || d || "");
  }

  function searchCid10(query, limit) {
    ensureNodePack();
    var q = String(query || "").trim();
    if (q.length < 1) return [];
    var lim =
      typeof limit === "number" && limit > 0 ? Math.floor(limit) : 20;
    var qNorm = normalizeCidCode(q);
    var qFold = fold(q);
    var qCodeFold = fold(qNorm);
    var out = [];
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (!e || !e.c) continue;
      var code = String(e.c);
      var desc = String(e.d || "");
      var codeFold = fold(code);
      var descFold = fold(desc);
      var hit =
        codeFold.indexOf(qCodeFold) === 0 ||
        codeFold.indexOf(qFold) === 0 ||
        descFold.indexOf(qFold) >= 0;
      if (!hit) continue;
      out.push({ c: code, d: desc, label: formatCidLabel({ c: code, d: desc }) });
      if (out.length >= lim) break;
    }
    return out;
  }

  function lookupCid(code) {
    ensureNodePack();
    var want = normalizeCidCode(code);
    if (!want) return null;
    for (var i = 0; i < entries.length; i++) {
      if (entries[i] && String(entries[i].c).toUpperCase() === want) {
        return {
          c: entries[i].c,
          d: entries[i].d || "",
          label: formatCidLabel(entries[i]),
        };
      }
    }
    return null;
  }

  return {
    normalizeCidCode: normalizeCidCode,
    isWellFormedCid: isWellFormedCid,
    setPack: setPack,
    loadPack: loadPack,
    getEntries: getEntries,
    searchCid10: searchCid10,
    lookupCid: lookupCid,
    formatCidLabel: formatCidLabel,
  };
});

/**
 * Painéis qualitativos multi-analito (ex.: C. difficile GDH + Toxina A/B).
 * Testável em Node via module.exports; extensão/web: global AghuQualitativePanels.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  root.AghuQualitativePanels = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /** @type {{ match: RegExp, subitems: string[] }[]} */
  var PANEL_DEFINITIONS = [
    {
      match: /CLOSTRIDIOIDES.*GDH.*TOXINA/i,
      subitems: ["GDH", "TOXINA A", "TOXINA B"],
    },
  ];

  function normalizeForMatch(s) {
    var t = String(s || "").trim();
    try {
      t = t.normalize("NFD").replace(/\p{Diacritic}/gu, "");
    } catch (_e) {
      t = t.replace(/[\u0300-\u036f]/g, "");
    }
    return t.toUpperCase();
  }

  /**
   * @param {string} examName
   * @returns {{ subitems: string[] }|null}
   */
  function resolveQualitativePanel(examName) {
    var norm = normalizeForMatch(examName);
    for (var i = 0; i < PANEL_DEFINITIONS.length; i++) {
      if (PANEL_DEFINITIONS[i].match.test(norm)) {
        return { subitems: PANEL_DEFINITIONS[i].subitems.slice() };
      }
    }
    return null;
  }

  function isGenericResultLabel(label) {
    return /^RESULTADO$/i.test(String(label || "").trim());
  }

  function isQualitativeValue(text) {
    var t = String(text || "").trim();
    if (!t) return false;
    return (
      /\b(positiv[oa]s?|negativ[oa]s?|reagente|n[aã]o\s+reagente|n[aã]o\s+reativ[oa]|reativ[oa]|indeterminad[oa]|detectad[oa]|indetect[aá]vel)\b/i.test(
        t,
      ) || /^[\d,\.]+\s*$/.test(t)
    );
  }

  function parseLineSubitem(line) {
    var t = String(line || "").trim();
    if (!t) return null;
    var colon = t.match(/^([^:]+):\s*(.*)$/);
    if (colon) {
      return { label: colon[1].trim(), value: colon[2].trim() };
    }
    if (isQualitativeValue(t)) {
      return { label: "", value: t };
    }
    return null;
  }

  /**
   * @param {string} raw
   * @param {string} examName
   * @returns {{ label: string, value: string }[]|null}
   */
  function parseQualitativePanelSubitems(raw, examName) {
    var panel = resolveQualitativePanel(examName);
    if (!panel) return null;

    var fixedLabels = panel.subitems;
    var lines = String(raw || "")
      .split(/\r?\n/)
      .map(function (l) {
        return l.trim();
      })
      .filter(Boolean);

    /** @type {{ label: string, value: string }[]} */
    var parsed = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (/^nota\s+\d+$/i.test(line)) continue;
      if (/^foram\s+pesquisados/i.test(line)) continue;
      if (/^\d+\)\s*pesquisa/i.test(line)) continue;
      if (/^aten[cç][aã]o$/i.test(line)) continue;
      var item = parseLineSubitem(line);
      if (!item) continue;
      if (isGenericResultLabel(item.label) && !item.value) continue;
      parsed.push(item);
    }

    /** @type {string[]} */
    var values = [];

    for (var pi = 0; pi < parsed.length; pi++) {
      var p = parsed[pi];
      if (isGenericResultLabel(p.label)) {
        if (p.value) values.push(p.value);
      } else if (p.label && p.value) {
        return fixedLabels.map(function (lbl) {
          var hit = null;
          for (var j = 0; j < parsed.length; j++) {
            if (
              normalizeForMatch(parsed[j].label).indexOf(
                normalizeForMatch(lbl),
              ) >= 0 ||
              normalizeForMatch(lbl).indexOf(
                normalizeForMatch(parsed[j].label),
              ) >= 0
            ) {
              hit = parsed[j].value;
              break;
            }
          }
          return { label: lbl, value: hit || "—" };
        });
      } else if (!p.label && p.value) {
        values.push(p.value);
      }
    }

    if (values.length === 1 && fixedLabels.length > 1) {
      var single = values[0];
      return fixedLabels.map(function (lbl) {
        return { label: lbl, value: single };
      });
    }

    if (values.length >= fixedLabels.length) {
      return fixedLabels.map(function (lbl, idx) {
        return { label: lbl, value: values[idx] || "—" };
      });
    }

    if (values.length > 0) {
      return fixedLabels.map(function (lbl, idx) {
        return { label: lbl, value: values[idx] != null ? values[idx] : "—" };
      });
    }

    return fixedLabels.map(function (lbl) {
      return { label: lbl, value: "—" };
    });
  }

  return {
    PANEL_DEFINITIONS: PANEL_DEFINITIONS,
    resolveQualitativePanel: resolveQualitativePanel,
    isGenericResultLabel: isGenericResultLabel,
    parseQualitativePanelSubitems: parseQualitativePanelSubitems,
  };
});

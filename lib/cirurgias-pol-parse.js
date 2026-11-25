/**
 * Parse da lista de cirurgias do POL (tabela `#tabela_resultados`).
 * Aceita Document/Element ou HTML string (testes).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuCirurgiasPolParse = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function str(v) {
    return v == null ? "" : String(v);
  }

  function cellText(cell) {
    if (!cell) return "";
    return str(cell.textContent).replace(/\s+/g, " ").trim();
  }

  /**
   * @param {Document|Element|null} root
   * @returns {HTMLElement[]}
   */
  function findSelectableRows(root) {
    if (!root || !root.querySelectorAll) return [];
    var data =
      root.querySelector("#tabela_resultados\\:resultList_data") ||
      root.querySelector("[id$='tabela_resultados:resultList_data']") ||
      root.querySelector("#tabela_resultados\\:resultList tbody") ||
      root;
    return Array.prototype.slice.call(
      data.querySelectorAll("tr.ui-datatable-selectable")
    );
  }

  /**
   * @param {HTMLElement} row
   * @param {number} index
   * @returns {{ index: number, data: string, nome: string, especialidade: string, equipe: string }}
   */
  function parseRow(row, index) {
    var cells = row && row.cells ? Array.prototype.slice.call(row.cells) : [];
    var nomeEl =
      row &&
      row.querySelector &&
      row.querySelector("[id$=':descricaoGrid']");
    var espEl =
      row &&
      row.querySelector &&
      row.querySelector("[id$=':especialidadeGrid']");
    var eqEl =
      row && row.querySelector && row.querySelector("[id$=':equipeGrid']");
    return {
      index: index,
      data: cellText(cells[0]),
      nome: nomeEl ? cellText(nomeEl) : cellText(cells[1]),
      especialidade: espEl ? cellText(espEl) : cellText(cells[2]),
      equipe: eqEl ? cellText(eqEl) : cellText(cells[3]),
    };
  }

  /**
   * @param {Document|Element|null} root
   * @returns {{ index: number, data: string, nome: string, especialidade: string, equipe: string }[]}
   */
  function parseCirurgiasListFromDoc(root) {
    var rows = findSelectableRows(root);
    return rows.map(function (row, i) {
      return parseRow(row, i);
    });
  }

  /**
   * @param {string} html
   * @returns {{ index: number, data: string, nome: string, especialidade: string, equipe: string }[]}
   */
  function parseCirurgiasListFromHtml(html) {
    if (typeof html !== "string" || !html.trim()) return [];
    if (typeof DOMParser === "undefined") {
      // Node sem jsdom: fallback regex mínimo para fixtures de teste.
      return parseCirurgiasListFromHtmlFallback(html);
    }
    var doc = new DOMParser().parseFromString(html, "text/html");
    return parseCirurgiasListFromDoc(doc);
  }

  /**
   * Fallback Node: extrai spans descricaoGrid / data em células simples.
   * @param {string} html
   */
  function parseCirurgiasListFromHtmlFallback(html) {
    var rows = [];
    var re =
      /data-ri="(\d+)"[\s\S]*?<td[^>]*>\s*(\d{2}\/\d{2}\/\d{4})\s*<\/td>[\s\S]*?descricaoGrid[^>]*>\s*([^<]*)/gi;
    var m;
    while ((m = re.exec(html))) {
      rows.push({
        index: parseInt(m[1], 10),
        data: m[2].trim(),
        nome: m[3].replace(/\s+/g, " ").trim(),
        especialidade: "",
        equipe: "",
      });
    }
    if (rows.length) return rows;
    // Fixture simplificada: <!-- row --> Data|Nome|Esp|Equipe
    var simple = html.match(
      /<!--\s*cirurgia-row\s*-->\s*([^|\n]+)\|([^|\n]+)\|([^|\n]+)\|([^|\n]+)/gi
    );
    if (simple) {
      return simple.map(function (line, i) {
        var parts = line
          .replace(/<!--\s*cirurgia-row\s*-->/i, "")
          .split("|")
          .map(function (p) {
            return p.trim();
          });
        return {
          index: i,
          data: parts[0] || "",
          nome: parts[1] || "",
          especialidade: parts[2] || "",
          equipe: parts[3] || "",
        };
      });
    }
    return [];
  }

  return {
    findSelectableRows: findSelectableRows,
    parseRow: parseRow,
    parseCirurgiasListFromDoc: parseCirurgiasListFromDoc,
    parseCirurgiasListFromHtml: parseCirurgiasListFromHtml,
  };
});

/**
 * Layout partilhado do Passômetro (cabeçalho + grelha diária).
 * Testável em Node via module.exports; extensão: global AghuPassometroLayout.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuPassometroLayout = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /** @type {[string, string, boolean?][][]} — grelha 2 colunas (wide = linha inteira). */
  var HEADER_ROWS = [
    [
      ["nome", "Nome"],
      ["idade", "Idade"],
    ],
    [
      ["prontuario", "Prontuário"],
      ["peso", "Peso"],
    ],
    [
      ["staff", "Staff"],
      ["dih", "DIH"],
    ],
    [["diagnosticos", "Diagnósticos", true]],
    [["cirurgias", "Cirurgias", true]],
    [["hdaHpp", "HDA / HPP", true]],
  ];

  /** Lista plana derivada de HEADER_ROWS (leitura/escrita por chave). */
  var HEADER_FIELDS = [];
  for (var hi = 0; hi < HEADER_ROWS.length; hi++) {
    for (var hj = 0; hj < HEADER_ROWS[hi].length; hj++) {
      HEADER_FIELDS.push(HEADER_ROWS[hi][hj]);
    }
  }

  /** @type {([string, string, number?] | null)[][]} */
  var GRID_ROWS = [
    [
      ["data", "Data"],
      ["hv", "HV"],
      ["sng", "SNG"],
      ["fc", "FC"],
      ["fr", "FR"],
      ["pa", "PA"],
      ["tax", "TAX"],
    ],
    [
      ["po", "PO"],
      ["analgesia", "Analgesia", 2],
      ["diurese", "Diurese"],
      ["fezes", "Fezes"],
      ["fistulas", "Fístulas"],
      ["vomitos", "Vômitos"],
    ],
    [
      ["atb", "ATB", 3],
      ["drenos", "Drenos"],
      ["drenoTl", "TL"],
      ["drenoJp", "JP"],
      ["drenoPig", "PIG"],
    ],
    [
      ["dieta", "Dieta", 3],
      ["sato2", "SATO2"],
      ["hgt", "HGT", 2],
      ["bh", "BH"],
    ],
    [["cd", "CD", 7]],
    [["pendencias", "Pendências", 7]],
  ];

  return {
    HEADER_FIELDS: HEADER_FIELDS,
    HEADER_ROWS: HEADER_ROWS,
    GRID_ROWS: GRID_ROWS,
  };
});

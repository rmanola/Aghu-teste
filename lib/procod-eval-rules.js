/**
 * FEAT-157 — eval offline de acerto de classe (Fase 5).
 *
 * Portão determinístico, sem LLM: `classificarItem` / `classificarConjunto`
 * contra um banco sintético de ouro. Limiar ≥ 0,95 (plano: acerto de classe).
 *
 * Não usa descrição cirúrgica nem PHI — só códigos + registros AIH.
 */
(function (root, factory) {
  "use strict";
  var api = factory(
    typeof require !== "undefined"
      ? require("./procod-rules.js")
      : root.AghuProcodRules
  );
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuProcodEvalRules = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (rules) {
  "use strict";

  var GATE_THRESHOLD = 0.95;

  /**
   * Banco de ouro sintético (códigos fictícios / alinhados ao fixture SIGTAP).
   * Cada linha: input de classificarItem + classe esperada.
   */
  var GOLDEN_ITEMS = Object.freeze([
    {
      id: "sec-05",
      input: { codigo: "0407020122", registros: ["05"] },
      expected: rules.CLASSE_FATURAVEL_SECUNDARIO,
    },
    {
      id: "sec-03-05",
      input: { codigo: "0407020209", registros: ["03", "05"] },
      expected: rules.CLASSE_FATURAVEL_SECUNDARIO,
    },
    {
      id: "esp-04",
      input: { codigo: "0301040168", registros: ["04"] },
      expected: rules.CLASSE_FATURAVEL_ESPECIAL,
    },
    {
      id: "esp-04-only",
      input: { codigo: "0204050022", registros: ["04"] },
      expected: rules.CLASSE_FATURAVEL_ESPECIAL,
    },
    {
      id: "aih-propria-03",
      input: { codigo: "0407030034", registros: ["03"] },
      expected: rules.CLASSE_EXIGE_AIH_PROPRIA,
    },
    {
      id: "aih-propria-colec-aberta",
      input: { codigo: "0407020114", registros: ["03"] },
      expected: rules.CLASSE_EXIGE_AIH_PROPRIA,
    },
    {
      id: "nao-aih-bpa",
      input: { codigo: "0101010010", registros: ["01", "02"] },
      expected: rules.CLASSE_NAO_FATURAVEL_AIH,
    },
    {
      id: "nao-aih-apac",
      input: { codigo: "0601010010", registros: ["06", "07"] },
      expected: rules.CLASSE_NAO_FATURAVEL_AIH,
    },
    {
      id: "desconhecido-vazio",
      input: { codigo: "0499999999", registros: [] },
      expected: rules.CLASSE_REGISTRO_DESCONHECIDO,
    },
    {
      id: "desconhecido-null",
      input: { codigo: "0499999998" },
      expected: rules.CLASSE_REGISTRO_DESCONHECIDO,
    },
    {
      id: "principal-ok",
      input: { codigo: "0407030034", registros: ["03"], ehPrincipal: true },
      expected: rules.CLASSE_PRINCIPAL,
    },
    {
      id: "principal-ok-com-05",
      input: {
        codigo: "0407040085",
        registros: ["03", "05"],
        ehPrincipal: true,
      },
      expected: rules.CLASSE_PRINCIPAL,
    },
    {
      id: "principal-invalido",
      input: {
        codigo: "0101010010",
        registros: ["01"],
        ehPrincipal: true,
      },
      expected: rules.CLASSE_INVALIDO_COMO_PRINCIPAL,
    },
    {
      id: "principal-invalido-04",
      input: {
        codigo: "0301040168",
        registros: ["04"],
        ehPrincipal: true,
      },
      expected: rules.CLASSE_INVALIDO_COMO_PRINCIPAL,
    },
    {
      id: "hab-nao-muda-classe",
      input: {
        codigo: "0407020122",
        registros: ["05"],
        exigeHabilitacao: true,
      },
      expected: rules.CLASSE_FATURAVEL_SECUNDARIO,
    },
    {
      id: "tp-bruto-ignorado",
      input: {
        codigo: "0407020122",
        registros: ["05"],
        tpCompatibilidade: "2",
      },
      expected: rules.CLASSE_FATURAVEL_SECUNDARIO,
    },
    {
      id: "hernia-principal",
      input: {
        codigo: "0407010193",
        registros: ["03"],
        ehPrincipal: true,
      },
      expected: rules.CLASSE_PRINCIPAL,
    },
    {
      id: "colangio-sec",
      input: { codigo: "0407020122", registros: ["03", "05"] },
      expected: rules.CLASSE_FATURAVEL_SECUNDARIO,
    },
    {
      id: "prefer-05-sobre-04",
      input: { codigo: "9900000001", registros: ["04", "05"] },
      expected: rules.CLASSE_FATURAVEL_SECUNDARIO,
    },
    {
      id: "so-03-nao-faturavel-junto",
      input: { codigo: "0407010193", registros: ["03"] },
      expected: rules.CLASSE_EXIGE_AIH_PROPRIA,
    },
  ]);

  /**
   * Conjuntos: valida papel principal + lista faturáveis (códigos).
   */
  var GOLDEN_CONJUNTOS = Object.freeze([
    {
      id: "conjunto-colec-colangio",
      input: {
        principal: "0407030034",
        itens: [
          { codigo: "0407030034", trecho: "colecistectomia vlp" },
          { codigo: "0407020122", trecho: "colangiografia" },
        ],
        registrosPorCodigo: {
          "0407030034": ["03"],
          "0407020122": ["05"],
        },
        arestasCompatibilidade: [
          {
            codigo_principal: "0407030034",
            codigo_compativel: "0407020122",
            tp_compatibilidade: "1",
          },
        ],
      },
      expectedPrincipalClasse: rules.CLASSE_PRINCIPAL,
      expectedFaturaveis: ["0407020122"],
    },
    {
      id: "conjunto-sem-secundario",
      input: {
        principal: "0407020114",
        itens: [{ codigo: "0407020114", trecho: "colecistectomia aberta" }],
        registrosPorCodigo: { "0407020114": ["03"] },
      },
      expectedPrincipalClasse: rules.CLASSE_PRINCIPAL,
      expectedFaturaveis: [],
    },
  ]);

  function str(v) {
    return v == null ? "" : String(v);
  }

  function evaluateItemCase(row) {
    var got = rules.classificarItem(row.input);
    var ok = str(got.classe) === str(row.expected);
    return {
      id: row.id,
      kind: "item",
      ok: ok,
      expected: row.expected,
      got: got.classe,
    };
  }

  function evaluateConjuntoCase(row) {
    var got = rules.classificarConjunto(row.input);
    var principalOk =
      got.principal &&
      str(got.principal.classe) === str(row.expectedPrincipalClasse);
    var fatCodes = (got.faturaveis || [])
      .map(function (i) {
        return str(i.codigo);
      })
      .sort();
    var expFat = (row.expectedFaturaveis || []).slice().sort();
    var fatOk =
      fatCodes.length === expFat.length &&
      fatCodes.every(function (c, i) {
        return c === expFat[i];
      });
    var ok = principalOk && fatOk;
    return {
      id: row.id,
      kind: "conjunto",
      ok: ok,
      expected: row.expectedPrincipalClasse,
      got: got.principal ? got.principal.classe : null,
      faturaveisOk: fatOk,
    };
  }

  /**
   * @param {{threshold?: number, items?: Array, conjuntos?: Array}} [opts]
   */
  function evaluateRules(opts) {
    opts = opts || {};
    var threshold =
      typeof opts.threshold === "number" ? opts.threshold : GATE_THRESHOLD;
    var items = Array.isArray(opts.items) ? opts.items : GOLDEN_ITEMS;
    var conjuntos = Array.isArray(opts.conjuntos)
      ? opts.conjuntos
      : GOLDEN_CONJUNTOS;

    var details = [];
    var hits = 0;
    var total = 0;

    for (var i = 0; i < items.length; i++) {
      var d = evaluateItemCase(items[i]);
      details.push(d);
      total++;
      if (d.ok) hits++;
    }
    for (var j = 0; j < conjuntos.length; j++) {
      var c = evaluateConjuntoCase(conjuntos[j]);
      details.push(c);
      total++;
      if (c.ok) hits++;
    }

    var accuracy = total ? hits / total : null;
    return {
      tier: "rules",
      mode: "offline-golden",
      threshold: threshold,
      pass: accuracy != null && accuracy >= threshold,
      accuracy: accuracy,
      hits: hits,
      total: total,
      cases: details,
      note:
        "Portão Fase 5 — acerto de classe ≥ " +
        threshold +
        " (PROCOD-AC-30..37 + conjuntos).",
    };
  }

  return {
    GATE_THRESHOLD: GATE_THRESHOLD,
    GOLDEN_ITEMS: GOLDEN_ITEMS,
    GOLDEN_CONJUNTOS: GOLDEN_CONJUNTOS,
    evaluateRules: evaluateRules,
  };
});

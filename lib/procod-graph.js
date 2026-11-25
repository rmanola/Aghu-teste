/**
 * FEAT-157 — grafo do agente codificador (arestas explícitas).
 *
 * Diferente do grafo do Passômetro (quase completo entre skills), este é um
 * pipeline com desvios, e a topologia carrega a garantia de segurança:
 *
 *   `select` tem uma ÚNICA aresta de saída, para `guard_det`.
 *
 * Não existe caminho de `select` até `rules`, `rank` ou `END`. Um código não
 * consegue chegar à proposta sem passar pelos dois guardrails — isso é
 * transição ilegal verificada, não convenção de quem escreve o prompt.
 */
(function (root, factory) {
  "use strict";
  var api = factory(
    typeof require !== "undefined"
      ? require("./procod-error-codes.js")
      : root.AghuProcodErrorCodes
  );
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuProcodGraph = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (codes) {
  "use strict";

  var START = "START";
  var END = "END";
  /** Bump quando a topologia mudar — entra no tuple_id (canary/rollback). */
  var GRAPH_REV = "1";

  /** Adjacência explícita. A ordem de cada lista é significativa nos testes. */
  var EDGES = Object.freeze({
    START: ["extract"],
    extract: ["resolve", "escalate"],
    resolve: ["select", "repair", "escalate"],
    // Invariante central: guard_det é a única saída.
    select: ["guard_det"],
    guard_det: ["guard_verify", "repair", "escalate"],
    guard_verify: ["rules", "escalate"],
    rules: ["rank"],
    rank: [END],
    repair: ["resolve", "select"],
    escalate: [END],
  });

  var PIPELINE = Object.freeze([
    "extract",
    "resolve",
    "select",
    "guard_det",
    "guard_verify",
    "rules",
    "rank",
  ]);
  var ONCE_PER_RUN = Object.freeze(["extract"]);

  function listNodes() {
    var nodes = [];
    for (var from in EDGES) {
      if (!Object.prototype.hasOwnProperty.call(EDGES, from)) continue;
      if (nodes.indexOf(from) === -1) nodes.push(from);
      var tos = EDGES[from];
      for (var i = 0; i < tos.length; i++) {
        if (nodes.indexOf(tos[i]) === -1) nodes.push(tos[i]);
      }
    }
    return nodes;
  }

  function listEdges() {
    var out = [];
    for (var from in EDGES) {
      if (!Object.prototype.hasOwnProperty.call(EDGES, from)) continue;
      for (var i = 0; i < EDGES[from].length; i++) {
        out.push({ from: from, to: EDGES[from][i] });
      }
    }
    return out;
  }

  function isKnownNode(node) {
    return listNodes().indexOf(String(node || "")) !== -1;
  }

  function isLegalTransition(from, to) {
    var tos = EDGES[String(from || "")];
    if (!tos) return false;
    return tos.indexOf(String(to || "")) !== -1;
  }

  /**
   * Valida uma trajetória completa a partir de START.
   * @param {string[]} nodes
   * @returns {{ok: boolean, error?: string, errorCode?: string}}
   */
  function validatePath(nodes) {
    var path = Array.isArray(nodes) ? nodes : [];
    if (!path.length) {
      return {
        ok: false,
        error: "Trajetória vazia.",
        errorCode: codes.ILLEGAL_TRANSITION,
      };
    }

    for (var u = 0; u < path.length; u++) {
      if (!isKnownNode(path[u])) {
        return {
          ok: false,
          error: "Nó desconhecido no grafo: " + path[u] + ".",
          errorCode: codes.ILLEGAL_TRANSITION,
        };
      }
    }

    for (var o = 0; o < ONCE_PER_RUN.length; o++) {
      var node = ONCE_PER_RUN[o];
      var count = 0;
      for (var c = 0; c < path.length; c++) {
        if (path[c] === node) count++;
      }
      if (count > 1) {
        return {
          ok: false,
          error:
            "Nó " +
            node +
            " ocorre " +
            count +
            " vezes; permitido uma vez por run.",
          errorCode: codes.ILLEGAL_TRANSITION,
        };
      }
    }

    var prev = START;
    for (var i = 0; i < path.length; i++) {
      if (!isLegalTransition(prev, path[i])) {
        return {
          ok: false,
          error: "Transição ilegal: " + prev + " → " + path[i] + ".",
          errorCode: codes.ILLEGAL_TRANSITION,
        };
      }
      prev = path[i];
    }
    return { ok: true };
  }

  return {
    START: START,
    END: END,
    GRAPH_REV: GRAPH_REV,
    EDGES: EDGES,
    PIPELINE: PIPELINE,
    ONCE_PER_RUN: ONCE_PER_RUN,
    listNodes: listNodes,
    listEdges: listEdges,
    isKnownNode: isKnownNode,
    isLegalTransition: isLegalTransition,
    validatePath: validatePath,
  };
});

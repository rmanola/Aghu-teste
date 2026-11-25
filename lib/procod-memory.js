/**
 * FEAT-157 — memória de aprendizagem por workspace (Fase 5).
 *
 * Fecha o ciclo do agente: o faturista aceita ou rejeita códigos, e essa
 * decisão volta para a resolução no próximo laudo parecido. Rejeição pesa
 * tanto quanto confirmação — saber que um código NÃO se aplica a uma frase
 * evita repetir a mesma sugestão errada todos os meses.
 *
 * A tabela é derivada de descrição cirúrgica, então `normalizarFrase` é também
 * um guardrail de PHI: sequências numéricas longas (prontuário, matrícula),
 * datas e excesso de texto não sobrevivem. O limite de 200 caracteres é o
 * mesmo CHECK da migration — defesa em profundidade, não redundância.
 *
 * A memória NUNCA estreita o recall: rebaixa candidatos, não os remove. Um
 * código rejeitado uma vez pode ser o certo no laudo seguinte.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuProcodMemory = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var MAX_FRASE = 200;
  var MIN_FRASE = 3;
  var VEREDITOS = ["confirmado", "rejeitado"];

  function str(v) {
    return v == null ? "" : String(v);
  }

  /**
   * Termo técnico normalizado, sem identificadores.
   * @returns {string} "" quando nada de útil sobra.
   */
  function normalizarFrase(texto) {
    var s = str(texto)
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase();

    // Datas primeiro (senão a remoção de números as parte pela metade).
    s = s.replace(/\d{4}-\d{2}-\d{2}/g, " ");
    s = s.replace(/\d{1,2}\/\d{1,2}\/\d{2,4}/g, " ");
    // Identificadores: qualquer corrida de 3+ dígitos.
    s = s.replace(/\d{3,}/g, " ");
    // Sobra pontuação e dígitos soltos; só termos interessam.
    s = s.replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();

    if (s.length > MAX_FRASE) {
      s = s.slice(0, MAX_FRASE).replace(/\s+\S*$/, "").trim();
    }
    if (s.length < MIN_FRASE) return "";
    return s;
  }

  function assertVeredito(v) {
    if (VEREDITOS.indexOf(str(v)) === -1) {
      throw new Error(
        "Veredito de memória inválido: «" +
          str(v) +
          "». Use " +
          VEREDITOS.join(" ou ") +
          "."
      );
    }
    return str(v);
  }

  /**
   * Converte o aprendizado de um commit em linhas de `aghu_procod_memoria`.
   * @param {{competencia: string, aprendizado: Array}} payload
   * @param {string} workspaceId
   */
  function toRows(payload, workspaceId) {
    var ws = str(workspaceId).trim();
    if (!ws) {
      throw new Error(
        "Memória exige workspace_id — memória sem escopo vazaria codificação entre hospitais."
      );
    }
    payload = payload || {};
    var competencia = str(payload.competencia);
    var lista = Array.isArray(payload.aprendizado) ? payload.aprendizado : [];
    var rows = [];
    for (var i = 0; i < lista.length; i++) {
      var item = lista[i] || {};
      var veredito = assertVeredito(item.veredito);
      var frase = normalizarFrase(item.frase);
      // Frase que não sobrevive à sanitização não vira linha: guardar um
      // registro sem termo clínico seria ruído com risco e nenhum ganho.
      if (!frase) continue;
      rows.push({
        workspace_id: ws,
        competencia: competencia,
        frase_norm: frase,
        codigo: str(item.codigo),
        veredito: veredito,
        ocorrencias: 1,
      });
    }
    return rows;
  }

  /** Registros que casam exactamente a frase normalizada. */
  function registrosDaFrase(frase, registros) {
    var alvo = normalizarFrase(frase);
    var out = [];
    if (!alvo) return out;
    var list = Array.isArray(registros) ? registros : [];
    for (var i = 0; i < list.length; i++) {
      if (str(list[i].frase_norm) === alvo) out.push(list[i]);
    }
    return out;
  }

  /**
   * Reordena candidatos: confirmados à frente, rejeitados ao fim.
   * Nunca remove — memória informa prioridade, não permissão.
   */
  function aplicarMemoria(candidatos, opts) {
    opts = opts || {};
    var lista = Array.isArray(candidatos) ? candidatos.slice() : [];
    var hits = registrosDaFrase(opts.frase, opts.registros);
    if (!hits.length) return lista;

    var peso = {};
    for (var i = 0; i < hits.length; i++) {
      var h = hits[i];
      var n = Number(h.ocorrencias) || 1;
      peso[str(h.codigo)] =
        (peso[str(h.codigo)] || 0) + (h.veredito === "confirmado" ? n : -n);
    }

    return lista
      .map(function (codigo, idx) {
        return { codigo: codigo, idx: idx, peso: peso[str(codigo)] || 0 };
      })
      .sort(function (a, b) {
        if (b.peso !== a.peso) return b.peso - a.peso;
        return a.idx - b.idx; // estável: sem memória, ordem original
      })
      .map(function (x) {
        return x.codigo;
      });
  }

  /** Códigos que a memória sugere acrescentar à união de candidatos. */
  function candidatosDaMemoria(opts) {
    opts = opts || {};
    var hits = registrosDaFrase(opts.frase, opts.registros);
    var out = [];
    for (var i = 0; i < hits.length; i++) {
      if (hits[i].veredito !== "confirmado") continue;
      var c = str(hits[i].codigo);
      if (out.indexOf(c) === -1) out.push(c);
    }
    return out;
  }

  return {
    MAX_FRASE: MAX_FRASE,
    MIN_FRASE: MIN_FRASE,
    VEREDITOS: VEREDITOS,
    normalizarFrase: normalizarFrase,
    assertVeredito: assertVeredito,
    toRows: toRows,
    registrosDaFrase: registrosDaFrase,
    aplicarMemoria: aplicarMemoria,
    candidatosDaMemoria: candidatosDaMemoria,
  };
});

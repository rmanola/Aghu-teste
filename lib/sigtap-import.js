/**
 * FEAT-157 — importação da tabela SIGTAP (DATASUS), Fase 0.
 *
 * Os arquivos do DATASUS são texto de largura fixa **sem separador**, e cada
 * tabela vem acompanhada de um `*_layout.txt` com as colunas
 * Nome / Tamanho / Inicio / Fim / Tipo. Este módulo é dirigido por esse layout —
 * nunca por posições hardcoded — para sobreviver a mudanças entre competências.
 *
 * Dado público do DATASUS: sem PHI. Testável em Node, sem dependências.
 *
 * Todos os valores saem como **string**: códigos têm zeros à esquerda
 * significativos e valores monetários vêm em centavos zero-padded — converter
 * para Number perderia os dois.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuSigtapImport = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var CODIGO_LEN = 10;

  function str(v) {
    return v == null ? "" : String(v);
  }

  function isInt(token) {
    return /^\d+$/.test(token);
  }

  /**
   * Uma linha de layout em tokens. O DATASUS distribui variantes com
   * espaçamento, e implementações de referência lêem o layout como CSV
   * (rdsilva/SIGTAP usa read.csv sep=','), então aceitamos ambos.
   * @returns {string[]}
   */
  function splitLayoutLine(line) {
    var trimmed = str(line).trim();
    if (!trimmed) return [];
    var tokens = /[;,\t]/.test(trimmed)
      ? trimmed.split(/[;,\t]/)
      : trimmed.split(/\s+/);
    var out = [];
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i].trim();
      if (t !== "") out.push(t);
    }
    return out;
  }

  /**
   * @param {string} text conteúdo de um `*_layout.txt`
   * @returns {{nome: string, tamanho: number, inicio: number, fim: number, tipo: string}[]}
   */
  function parseLayout(text) {
    var lines = str(text).replace(/\r\n/g, "\n").split("\n");
    var cols = [];
    for (var i = 0; i < lines.length; i++) {
      var t = splitLayoutLine(lines[i]);
      // Cabeçalho, separador e linha em branco não têm 3 inteiros nas posições 1-3.
      if (t.length < 5 || !isInt(t[1]) || !isInt(t[2]) || !isInt(t[3])) continue;
      var nome = t[0];
      var tamanho = parseInt(t[1], 10);
      var inicio = parseInt(t[2], 10);
      var fim = parseInt(t[3], 10);
      if (fim - inicio + 1 !== tamanho) {
        throw new Error(
          "Layout SIGTAP incoerente na coluna " +
            nome +
            ": tamanho " +
            tamanho +
            " não bate com inicio " +
            inicio +
            " e fim " +
            fim +
            " (esperado " +
            (fim - inicio + 1) +
            ")."
        );
      }
      cols.push({
        nome: nome,
        tamanho: tamanho,
        inicio: inicio,
        fim: fim,
        tipo: t[4],
      });
    }
    if (!cols.length) {
      throw new Error(
        "Layout SIGTAP sem colunas reconhecíveis — esperado linhas no formato " +
          "NOME  tamanho  inicio  fim  tipo."
      );
    }
    return cols;
  }

  function maxFim(cols) {
    var max = 0;
    for (var i = 0; i < cols.length; i++) {
      if (cols[i].fim > max) max = cols[i].fim;
    }
    return max;
  }

  /**
   * Fatia o arquivo de dados segundo o layout. `inicio`/`fim` são 1-indexed inclusive.
   * @param {string} text
   * @param {{nome: string, inicio: number, fim: number}[]} cols
   * @returns {Object<string, string>[]}
   */
  function parseFixedWidth(text, cols) {
    if (!Array.isArray(cols) || !cols.length) {
      throw new Error("parseFixedWidth exige o layout (use parseLayout antes).");
    }
    var required = maxFim(cols);
    var lines = str(text).replace(/\r\n/g, "\n").split("\n");
    var rows = [];
    var lineNo = 0;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (!line.trim()) continue; // linha vazia não é registro
      lineNo++;
      if (line.length < required) {
        throw new Error(
          "Registro SIGTAP truncado na linha " +
            lineNo +
            ": " +
            line.length +
            " caracteres, layout exige " +
            required +
            "."
        );
      }
      var row = {};
      for (var c = 0; c < cols.length; c++) {
        row[cols[c].nome] = line.slice(cols[c].inicio - 1, cols[c].fim).trim();
      }
      rows.push(row);
    }
    return rows;
  }

  /** DATASUS publica em ISO-8859-1; UTF-8 ingênuo vira mojibake nos acentos. */
  function decodeSigtapBuffer(buffer) {
    if (buffer == null) return "";
    if (typeof buffer === "string") return buffer;
    if (typeof Buffer !== "undefined" && Buffer.isBuffer(buffer)) {
      return buffer.toString("latin1");
    }
    if (typeof TextDecoder !== "undefined") {
      return new TextDecoder("iso-8859-1").decode(buffer);
    }
    throw new Error("decodeSigtapBuffer: entrada não é Buffer nem string.");
  }

  /** "04.07.02.011-4" ou "0407020114" → "0407020114". */
  function normalizeCodigo(raw) {
    var digits = str(raw).replace(/\D/g, "");
    if (digits.length !== CODIGO_LEN) {
      throw new Error(
        "Código SIGTAP inválido: esperado 10 dígitos, recebido " +
          (digits.length || 0) +
          " em «" +
          str(raw) +
          "»."
      );
    }
    return digits;
  }

  /** "0407020114" → "04.07.02.011-4" (grupos 2.2.2.3-1). */
  function formatCodigo(raw) {
    var d = normalizeCodigo(raw);
    return (
      d.slice(0, 2) +
      "." +
      d.slice(2, 4) +
      "." +
      d.slice(4, 6) +
      "." +
      d.slice(6, 9) +
      "-" +
      d.slice(9, 10)
    );
  }

  /**
   * Competência AAAAMM. Formato escolhido porque ordena lexicograficamente,
   * o que permite comparar vigência sem converter para data.
   */
  function parseCompetencia(value) {
    var raw = str(value).trim();
    if (!/^\d{6}$/.test(raw)) {
      throw new Error(
        "Competência SIGTAP inválida: esperado AAAAMM, recebido «" + raw + "»."
      );
    }
    var mes = parseInt(raw.slice(4, 6), 10);
    if (mes < 1 || mes > 12) {
      throw new Error(
        "Competência SIGTAP inválida: mês " + raw.slice(4, 6) + " fora de 01-12."
      );
    }
    return raw;
  }

  /**
   * Data ISO da cirurgia → competência a usar. A codificação resolve sempre
   * contra a tabela vigente na data do procedimento, nunca na data em que se codifica.
   */
  function resolveCompetenciaParaData(isoDate) {
    var raw = str(isoDate).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      throw new Error(
        "Data inválida para resolver competência: esperado AAAA-MM-DD, recebido «" +
          raw +
          "»."
      );
    }
    return parseCompetencia(raw.slice(0, 4) + raw.slice(5, 7));
  }

  return {
    parseLayout: parseLayout,
    parseFixedWidth: parseFixedWidth,
    decodeSigtapBuffer: decodeSigtapBuffer,
    normalizeCodigo: normalizeCodigo,
    formatCodigo: formatCodigo,
    parseCompetencia: parseCompetencia,
    resolveCompetenciaParaData: resolveCompetenciaParaData,
  };
});

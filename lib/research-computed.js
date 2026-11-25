/**
 * Campos calculados Research custom — fórmulas declarativas seguras (sem eval).
 * FEAT-101: kind expression + kinds legado (daysBetween / monthsBetween / numberDiff).
 * FEAT-103: math/stats/helpers, %, and/or/not, datediff y/h/min, EXPRESSION_FUNCTIONS.
 * FEAT-104: refs de série [var][n] / [var][*] + seriesValues no eval.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuResearchComputed = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var hpbComputed = null;
  try {
    if (typeof require === "function") hpbComputed = require("./hpb-computed.js");
  } catch (_e) {}

  var LEGACY_KINDS = ["daysBetween", "monthsBetween", "numberDiff"];
  var VALID_KINDS = LEGACY_KINDS.concat(["expression"]);

  var FUNCS = {
    datediff: 1,
    round: 1,
    roundup: 1,
    rounddown: 1,
    floor: 1,
    ceil: 1,
    abs: 1,
    sqrt: 1,
    sign: 1,
    pow: 1,
    log: 1,
    exp: 1,
    exponential: 1,
    min: 1,
    max: 1,
    sum: 1,
    mean: 1,
    median: 1,
    stdev: 1,
    count: 1,
    isnull: 1,
    isnumber: 1,
    coalesce: 1,
    if: 1,
  };

  var LOGIC_KEYWORDS = { and: 1, or: 1, not: 1 };

  /** Funções que aceitam `[var][*]` como argumento (FEAT-104). */
  var SERIES_AGGREGATE_FUNCS = {
    sum: 1,
    mean: 1,
    median: 1,
    stdev: 1,
    min: 1,
    max: 1,
    count: 1,
  };

  var EXPRESSION_FUNCTIONS = [
    { name: "datediff", arityMin: 3, arityMax: 3, insertSnippet: "datediff([from],[to],'d')", group: "datas" },
    { name: "round", arityMin: 1, arityMax: 2, insertSnippet: "round([x],0)", group: "aritmetica" },
    { name: "roundup", arityMin: 1, arityMax: 2, insertSnippet: "roundup([x],0)", group: "aritmetica" },
    { name: "rounddown", arityMin: 1, arityMax: 2, insertSnippet: "rounddown([x],0)", group: "aritmetica" },
    { name: "floor", arityMin: 1, arityMax: 1, insertSnippet: "floor([x])", group: "aritmetica" },
    { name: "ceil", arityMin: 1, arityMax: 1, insertSnippet: "ceil([x])", group: "aritmetica" },
    { name: "abs", arityMin: 1, arityMax: 1, insertSnippet: "abs([x])", group: "aritmetica" },
    { name: "sqrt", arityMin: 1, arityMax: 1, insertSnippet: "sqrt([x])", group: "aritmetica" },
    { name: "sign", arityMin: 1, arityMax: 1, insertSnippet: "sign([x])", group: "aritmetica" },
    { name: "pow", arityMin: 2, arityMax: 2, insertSnippet: "pow([a],[b])", group: "aritmetica" },
    { name: "log", arityMin: 1, arityMax: 2, insertSnippet: "log([x])", group: "aritmetica" },
    { name: "exp", arityMin: 1, arityMax: 1, insertSnippet: "exp([x])", group: "aritmetica" },
    { name: "exponential", arityMin: 1, arityMax: 1, insertSnippet: "exponential([x])", group: "aritmetica" },
    { name: "min", arityMin: 1, arityMax: 99, insertSnippet: "min([a],[b])", group: "estatistica" },
    { name: "max", arityMin: 1, arityMax: 99, insertSnippet: "max([a],[b])", group: "estatistica" },
    { name: "sum", arityMin: 0, arityMax: 99, insertSnippet: "sum([a],[b])", group: "estatistica" },
    { name: "mean", arityMin: 1, arityMax: 99, insertSnippet: "mean([a],[b])", group: "estatistica" },
    { name: "median", arityMin: 1, arityMax: 99, insertSnippet: "median([a],[b])", group: "estatistica" },
    { name: "stdev", arityMin: 2, arityMax: 99, insertSnippet: "stdev([a],[b])", group: "estatistica" },
    { name: "count", arityMin: 0, arityMax: 99, insertSnippet: "count([a],[b])", group: "estatistica" },
    { name: "isnull", arityMin: 1, arityMax: 1, insertSnippet: "isnull([a])", group: "helpers" },
    { name: "isnumber", arityMin: 1, arityMax: 1, insertSnippet: "isnumber([a])", group: "helpers" },
    { name: "coalesce", arityMin: 1, arityMax: 99, insertSnippet: "coalesce([a],[b])", group: "helpers" },
    { name: "if", arityMin: 3, arityMax: 3, insertSnippet: "if([a]>0,[a],[b])", group: "condicional" },
  ];

  function str(v) {
    return v == null ? "" : String(v).trim();
  }

  function parseDate(v) {
    if (hpbComputed && hpbComputed.parseDate) return hpbComputed.parseDate(v);
    if (!v) return null;
    var d = new Date(String(v));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function daysBetween(a, b) {
    if (hpbComputed && hpbComputed.daysBetween) return hpbComputed.daysBetween(a, b);
    var da = parseDate(a);
    var db = parseDate(b);
    if (!da || !db) return null;
    return Math.round((db.getTime() - da.getTime()) / 86400000);
  }

  function monthsBetween(a, b) {
    if (hpbComputed && hpbComputed.monthsBetween) return hpbComputed.monthsBetween(a, b);
    var days = daysBetween(a, b);
    if (days == null) return null;
    return Math.round((days / 30.4375) * 10) / 10;
  }

  function msBetween(a, b) {
    var da = parseDate(a);
    var db = parseDate(b);
    if (!da || !db) return null;
    return db.getTime() - da.getTime();
  }

  function isBlank(v) {
    return v == null || str(v) === "";
  }

  function toNum(v) {
    if (isBlank(v)) return null;
    var n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function resultString(n) {
    if (n == null || !Number.isFinite(n)) return "";
    return String(n);
  }

  function collectNumericArgs(args, values, ignoreBlank, seriesValues) {
    var nums = [];
    for (var i = 0; i < args.length; i++) {
      var arg = args[i];
      if (arg && arg.type === "ref" && arg.series) {
        var series = (seriesValues && seriesValues[arg.key]) || [];
        for (var si = 0; si < series.length; si++) {
          var sn = toNum(series[si]);
          if (sn == null) {
            if (ignoreBlank) continue;
            return null;
          }
          nums.push(sn);
        }
        continue;
      }
      var nv = evalAst(arg, values, seriesValues);
      if (nv == null || typeof nv === "string") {
        if (ignoreBlank) continue;
        return null;
      }
      if (typeof nv !== "number" || !Number.isFinite(nv)) {
        if (ignoreBlank) continue;
        return null;
      }
      nums.push(nv);
    }
    return nums;
  }

  function roundToDigits(rv, digits, mode) {
    if (rv == null || typeof rv === "string" || !Number.isFinite(rv)) return null;
    if (digits == null || typeof digits === "string" || !Number.isFinite(digits)) digits = 0;
    var f = Math.pow(10, digits);
    if (mode === "up") return Math.ceil(rv * f) / f;
    if (mode === "down") return Math.floor(rv * f) / f;
    return Math.round(rv * f) / f;
  }

  /* ---------- tokenizer / parser (expression) ---------- */

  function tokenize(src) {
    var s = String(src || "");
    var i = 0;
    var tokens = [];
    function peek() {
      return s[i];
    }
    function advance() {
      return s[i++];
    }
    while (i < s.length) {
      var c = peek();
      if (c === " " || c === "\t" || c === "\n" || c === "\r") {
        advance();
        continue;
      }
      if (c === "[") {
        advance();
        var key = "";
        while (i < s.length && peek() !== "]") {
          key += advance();
        }
        if (peek() !== "]") throw new Error("ref sem ]");
        advance();
        var refTok = { type: "ref", value: key.trim() };
        if (peek() === "[") {
          advance();
          var idxRaw = "";
          while (i < s.length && peek() !== "]") {
            idxRaw += advance();
          }
          if (peek() !== "]") throw new Error("índice de ref sem ]");
          advance();
          idxRaw = idxRaw.trim();
          if (idxRaw === "*") {
            refTok.series = true;
          } else if (/^[0-9]+$/.test(idxRaw)) {
            refTok.lag = Number(idxRaw);
          } else {
            throw new Error("índice de ref inválido");
          }
        }
        tokens.push(refTok);
        continue;
      }
      if (c === "'" || c === '"') {
        var quote = advance();
        var lit = "";
        while (i < s.length && peek() !== quote) {
          lit += advance();
        }
        if (peek() !== quote) throw new Error("string sem fecho");
        advance();
        tokens.push({ type: "string", value: lit });
        continue;
      }
      if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(s[i + 1] || ""))) {
        var num = "";
        while (i < s.length && /[0-9.]/.test(peek())) num += advance();
        var n = Number(num);
        if (!Number.isFinite(n)) throw new Error("número inválido");
        tokens.push({ type: "number", value: n });
        continue;
      }
      if (/[a-zA-Z_]/.test(c)) {
        var ident = "";
        while (i < s.length && /[a-zA-Z0-9_]/.test(peek())) ident += advance();
        var lower = ident.toLowerCase();
        if (LOGIC_KEYWORDS[lower]) {
          tokens.push({ type: "logic", value: lower });
        } else if (FUNCS[lower]) {
          tokens.push({ type: "func", value: lower });
        } else {
          throw new Error("identificador desconhecido: " + ident);
        }
        continue;
      }
      if (c === "!" && s[i + 1] === "=") {
        advance();
        advance();
        tokens.push({ type: "op", value: "!=" });
        continue;
      }
      if (c === "<" || c === ">") {
        var op = advance();
        if (peek() === "=") op += advance();
        tokens.push({ type: "op", value: op });
        continue;
      }
      if (c === "=") {
        advance();
        tokens.push({ type: "op", value: "=" });
        continue;
      }
      if (c === "%") {
        advance();
        tokens.push({ type: "op", value: "%" });
        continue;
      }
      if ("+-*/(),".indexOf(c) !== -1) {
        tokens.push({
          type: c === "," ? "comma" : c === "(" ? "lparen" : c === ")" ? "rparen" : "op",
          value: c === "," ? "," : c,
        });
        advance();
        continue;
      }
      throw new Error("caractere inválido: " + c);
    }
    tokens.push({ type: "eof" });
    return tokens;
  }

  function parseExpression(src) {
    var tokens = tokenize(src);
    var pos = 0;
    function cur() {
      return tokens[pos] || { type: "eof" };
    }
    function eat(type, value) {
      var t = cur();
      if (t.type !== type || (value != null && t.value !== value)) {
        throw new Error("token inesperado");
      }
      pos += 1;
      return t;
    }
    function parseOr() {
      var node = parseAnd();
      while (cur().type === "logic" && cur().value === "or") {
        eat("logic", "or");
        node = { type: "logic", op: "or", left: node, right: parseAnd() };
      }
      return node;
    }
    function parseAnd() {
      var node = parseNot();
      while (cur().type === "logic" && cur().value === "and") {
        eat("logic", "and");
        node = { type: "logic", op: "and", left: node, right: parseNot() };
      }
      return node;
    }
    function parseNot() {
      if (cur().type === "logic" && cur().value === "not") {
        eat("logic", "not");
        return { type: "not", arg: parseNot() };
      }
      return parseComparison();
    }
    function parseComparison() {
      var left = parseAdd();
      var t = cur();
      if (t.type === "op" && ["=", "!=", "<", "<=", ">", ">="].indexOf(t.value) !== -1) {
        var op = eat("op").value;
        var right = parseAdd();
        return { type: "cmp", op: op, left: left, right: right };
      }
      return left;
    }
    function parseAdd() {
      var node = parseMul();
      while (cur().type === "op" && (cur().value === "+" || cur().value === "-")) {
        var op = eat("op").value;
        node = { type: "bin", op: op, left: node, right: parseMul() };
      }
      return node;
    }
    function parseMul() {
      var node = parseUnary();
      while (
        cur().type === "op" &&
        (cur().value === "*" || cur().value === "/" || cur().value === "%")
      ) {
        var op = eat("op").value;
        node = { type: "bin", op: op, left: node, right: parseUnary() };
      }
      return node;
    }
    function parseUnary() {
      if (cur().type === "op" && cur().value === "-") {
        eat("op");
        return { type: "unary", op: "-", arg: parseUnary() };
      }
      if (cur().type === "op" && cur().value === "+") {
        eat("op");
        return parseUnary();
      }
      return parsePrimary();
    }
    function parsePrimary() {
      var t = cur();
      if (t.type === "number") {
        eat("number");
        return { type: "number", value: t.value };
      }
      if (t.type === "string") {
        eat("string");
        return { type: "string", value: t.value };
      }
      if (t.type === "ref") {
        eat("ref");
        var refNode = { type: "ref", key: t.value };
        if (t.series) refNode.series = true;
        if (t.lag != null) refNode.lag = t.lag;
        return refNode;
      }
      if (t.type === "func") {
        var name = eat("func").value;
        eat("lparen");
        var args = [];
        if (cur().type !== "rparen") {
          args.push(parseOr());
          while (cur().type === "comma") {
            eat("comma");
            args.push(parseOr());
          }
        }
        eat("rparen");
        return { type: "call", name: name, args: args };
      }
      if (t.type === "lparen") {
        eat("lparen");
        var inner = parseOr();
        eat("rparen");
        return inner;
      }
      throw new Error("expressão inválida");
    }
    var ast = parseOr();
    if (cur().type !== "eof") throw new Error("lixo após expressão");
    return ast;
  }

  function collectRefsFromAst(ast, out) {
    if (!ast) return;
    if (ast.type === "ref") {
      if (ast.key && out.indexOf(ast.key) === -1) out.push(ast.key);
      return;
    }
    if (ast.type === "bin" || ast.type === "cmp" || ast.type === "logic") {
      collectRefsFromAst(ast.left, out);
      collectRefsFromAst(ast.right, out);
      return;
    }
    if (ast.type === "unary" || ast.type === "not") {
      collectRefsFromAst(ast.arg, out);
      return;
    }
    if (ast.type === "call") {
      for (var i = 0; i < ast.args.length; i++) collectRefsFromAst(ast.args[i], out);
    }
  }

  function listExpressionFieldRefs(expression) {
    var out = [];
    try {
      var ast = parseExpression(expression);
      collectRefsFromAst(ast, out);
    } catch (_e) {
      var re = /\[([a-zA-Z_][a-zA-Z0-9_]*)\](?:\[[0-9]+\]|\[\*\])?/g;
      var m;
      var src = String(expression || "");
      while ((m = re.exec(src))) {
        if (out.indexOf(m[1]) === -1) out.push(m[1]);
      }
    }
    return out;
  }

  function assertSeriesRefsOnlyInAggregates(ast, pathCall) {
    if (!ast) return;
    if (ast.type === "ref" && ast.series) {
      if (!pathCall || !SERIES_AGGREGATE_FUNCS[pathCall]) {
        throw new Error("[*] só permitido em agregados");
      }
      return;
    }
    if (ast.type === "bin" || ast.type === "cmp" || ast.type === "logic") {
      assertSeriesRefsOnlyInAggregates(ast.left, pathCall);
      assertSeriesRefsOnlyInAggregates(ast.right, pathCall);
      return;
    }
    if (ast.type === "unary" || ast.type === "not") {
      assertSeriesRefsOnlyInAggregates(ast.arg, pathCall);
      return;
    }
    if (ast.type === "call") {
      var nextCall = SERIES_AGGREGATE_FUNCS[ast.name] ? ast.name : null;
      for (var i = 0; i < ast.args.length; i++) {
        assertSeriesRefsOnlyInAggregates(ast.args[i], nextCall);
      }
    }
  }

  function validateExpressionSeriesUsage(expression) {
    var ast = parseExpression(expression);
    assertSeriesRefsOnlyInAggregates(ast, null);
    return ast;
  }

  function isTruthy(cond) {
    return (
      cond === true ||
      (typeof cond === "number" && cond !== 0) ||
      (typeof cond === "string" && cond !== "")
    );
  }

  function resolveRefValue(ast, values, seriesValues) {
    var key = ast.key;
    var lag = ast.lag != null ? ast.lag : 0;
    var series = seriesValues && Object.prototype.hasOwnProperty.call(seriesValues, key)
      ? seriesValues[key]
      : null;
    if (ast.series) {
      return null;
    }
    if (Array.isArray(series)) {
      if (lag < 0 || lag >= series.length) return null;
      var rawS = series[lag];
      if (isBlank(rawS)) return null;
      var asNumS = toNum(rawS);
      if (asNumS != null) return asNumS;
      return str(rawS);
    }
    if (lag > 0) return null;
    var raw = values[key];
    if (isBlank(raw)) return null;
    var asNum = toNum(raw);
    if (asNum != null) return asNum;
    return str(raw);
  }

  function evalAst(ast, values, seriesValues) {
    if (!ast) return null;
    if (ast.type === "number") return ast.value;
    if (ast.type === "string") return ast.value;
    if (ast.type === "ref") {
      return resolveRefValue(ast, values || {}, seriesValues || {});
    }
    if (ast.type === "unary") {
      var u = evalAst(ast.arg, values, seriesValues);
      if (u == null || typeof u === "string") return null;
      return -u;
    }
    if (ast.type === "not") {
      return isTruthy(evalAst(ast.arg, values, seriesValues)) ? 0 : 1;
    }
    if (ast.type === "logic") {
      var leftT = isTruthy(evalAst(ast.left, values, seriesValues));
      if (ast.op === "and") {
        if (!leftT) return false;
        return isTruthy(evalAst(ast.right, values, seriesValues));
      }
      if (ast.op === "or") {
        if (leftT) return true;
        return isTruthy(evalAst(ast.right, values, seriesValues));
      }
      return false;
    }
    if (ast.type === "bin") {
      var a = evalAst(ast.left, values, seriesValues);
      var b = evalAst(ast.right, values, seriesValues);
      if (a == null || b == null || typeof a === "string" || typeof b === "string") return null;
      if (ast.op === "+") return a + b;
      if (ast.op === "-") return a - b;
      if (ast.op === "*") return a * b;
      if (ast.op === "/") return b === 0 ? null : a / b;
      if (ast.op === "%") return b === 0 ? null : a % b;
      return null;
    }
    if (ast.type === "cmp") {
      var la = evalAst(ast.left, values, seriesValues);
      var rb = evalAst(ast.right, values, seriesValues);
      if (la == null || rb == null) return false;
      var ln = typeof la === "number" ? la : toNum(la);
      var rn = typeof rb === "number" ? rb : toNum(rb);
      var useNum = ln != null && rn != null;
      var L = useNum ? ln : str(la);
      var R = useNum ? rn : str(rb);
      if (ast.op === "=") return L === R;
      if (ast.op === "!=") return L !== R;
      if (!useNum) return false;
      if (ast.op === "<") return L < R;
      if (ast.op === "<=") return L <= R;
      if (ast.op === ">") return L > R;
      if (ast.op === ">=") return L >= R;
      return false;
    }
    if (ast.type === "call") {
      return evalCall(ast.name, ast.args, values, seriesValues);
    }
    return null;
  }

  function evalCall(name, args, values, seriesValues) {
    seriesValues = seriesValues || {};
    if (name === "datediff") {
      if (args.length !== 3) return null;
      var fromV = evalAst(args[0], values, seriesValues);
      var toV = evalAst(args[1], values, seriesValues);
      var unit = evalAst(args[2], values, seriesValues);
      var fromStr =
        args[0].type === "ref"
          ? !args[0].series &&
            (args[0].lag == null || args[0].lag === 0) &&
            !(seriesValues && Object.prototype.hasOwnProperty.call(seriesValues, args[0].key))
            ? values[args[0].key]
            : resolveRefValue(args[0], values, seriesValues)
          : fromV;
      var toStr =
        args[1].type === "ref"
          ? !args[1].series &&
            (args[1].lag == null || args[1].lag === 0) &&
            !(seriesValues && Object.prototype.hasOwnProperty.call(seriesValues, args[1].key))
            ? values[args[1].key]
            : resolveRefValue(args[1], values, seriesValues)
          : toV;
      var uRaw = str(unit);
      var u = uRaw.toLowerCase();
      if (u === "d") {
        return daysBetween(fromStr, toStr);
      }
      if (u === "m" || uRaw === "M") {
        return monthsBetween(fromStr, toStr);
      }
      if (u === "y") {
        var dY = daysBetween(fromStr, toStr);
        if (dY == null) return null;
        return Math.round((dY / 365.2425) * 10) / 10;
      }
      if (u === "h") {
        var msH = msBetween(fromStr, toStr);
        if (msH == null) return null;
        return Math.round((msH / 3600000) * 1000) / 1000;
      }
      if (u === "min") {
        var msM = msBetween(fromStr, toStr);
        if (msM == null) return null;
        return Math.round((msM / 60000) * 1000) / 1000;
      }
      return null;
    }
    if (name === "round") {
      if (args.length < 1 || args.length > 2) return null;
      var rv = evalAst(args[0], values, seriesValues);
      var digits = args.length === 2 ? evalAst(args[1], values, seriesValues) : 0;
      return roundToDigits(rv, digits, "nearest");
    }
    if (name === "roundup") {
      if (args.length < 1 || args.length > 2) return null;
      return roundToDigits(
        evalAst(args[0], values, seriesValues),
        args.length === 2 ? evalAst(args[1], values, seriesValues) : 0,
        "up",
      );
    }
    if (name === "rounddown") {
      if (args.length < 1 || args.length > 2) return null;
      return roundToDigits(
        evalAst(args[0], values, seriesValues),
        args.length === 2 ? evalAst(args[1], values, seriesValues) : 0,
        "down",
      );
    }
    if (name === "floor") {
      if (args.length !== 1) return null;
      var fv = evalAst(args[0], values, seriesValues);
      if (fv == null || typeof fv === "string") return null;
      return Math.floor(fv);
    }
    if (name === "ceil") {
      if (args.length !== 1) return null;
      var cv = evalAst(args[0], values, seriesValues);
      if (cv == null || typeof cv === "string") return null;
      return Math.ceil(cv);
    }
    if (name === "abs") {
      if (args.length !== 1) return null;
      var av = evalAst(args[0], values, seriesValues);
      if (av == null || typeof av === "string") return null;
      return Math.abs(av);
    }
    if (name === "sqrt") {
      if (args.length !== 1) return null;
      var sv = evalAst(args[0], values, seriesValues);
      if (sv == null || typeof sv === "string" || sv < 0) return null;
      return Math.sqrt(sv);
    }
    if (name === "sign") {
      if (args.length !== 1) return null;
      var sg = evalAst(args[0], values, seriesValues);
      if (sg == null || typeof sg === "string") return null;
      if (sg > 0) return 1;
      if (sg < 0) return -1;
      return 0;
    }
    if (name === "pow") {
      if (args.length !== 2) return null;
      var base = evalAst(args[0], values, seriesValues);
      var expN = evalAst(args[1], values, seriesValues);
      if (base == null || expN == null || typeof base === "string" || typeof expN === "string") return null;
      var p = Math.pow(base, expN);
      return Number.isFinite(p) ? p : null;
    }
    if (name === "log") {
      if (args.length < 1 || args.length > 2) return null;
      var lx = evalAst(args[0], values, seriesValues);
      if (lx == null || typeof lx === "string" || lx <= 0) return null;
      if (args.length === 1) {
        return Math.log(lx);
      }
      var lbase = evalAst(args[1], values, seriesValues);
      if (lbase == null || typeof lbase === "string" || lbase <= 0 || lbase === 1) return null;
      return Math.log(lx) / Math.log(lbase);
    }
    if (name === "exp" || name === "exponential") {
      if (args.length !== 1) return null;
      var ex = evalAst(args[0], values, seriesValues);
      if (ex == null || typeof ex === "string") return null;
      var er = Math.exp(ex);
      return Number.isFinite(er) ? er : null;
    }
    if (name === "min" || name === "max") {
      var mm = collectNumericArgs(args, values, false, seriesValues);
      if (mm == null || mm.length === 0) return null;
      return name === "min" ? Math.min.apply(null, mm) : Math.max.apply(null, mm);
    }
    if (name === "sum") {
      var sn = collectNumericArgs(args, values, true, seriesValues);
      if (sn == null) return null;
      var s = 0;
      for (var j = 0; j < sn.length; j++) s += sn[j];
      return s;
    }
    if (name === "mean") {
      var mn = collectNumericArgs(args, values, true, seriesValues);
      if (mn == null || mn.length === 0) return null;
      var ms = 0;
      for (var mi = 0; mi < mn.length; mi++) ms += mn[mi];
      return ms / mn.length;
    }
    if (name === "median") {
      var md = collectNumericArgs(args, values, true, seriesValues);
      if (md == null || md.length === 0) return null;
      var sorted = md.slice().sort(function (x, y) {
        return x - y;
      });
      var mid = Math.floor(sorted.length / 2);
      if (sorted.length % 2 === 1) return sorted[mid];
      return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    if (name === "stdev") {
      var sd = collectNumericArgs(args, values, true, seriesValues);
      if (sd == null || sd.length < 2) return null;
      var meanS = 0;
      for (var si = 0; si < sd.length; si++) meanS += sd[si];
      meanS /= sd.length;
      var varS = 0;
      for (var sj = 0; sj < sd.length; sj++) {
        var dlt = sd[sj] - meanS;
        varS += dlt * dlt;
      }
      return Math.sqrt(varS / (sd.length - 1));
    }
    if (name === "count") {
      var cn = collectNumericArgs(args, values, true, seriesValues);
      return cn == null ? null : cn.length;
    }
    if (name === "isnull") {
      if (args.length !== 1) return null;
      if (args[0].type === "ref") {
        if (args[0].series) {
          var ser = seriesValues[args[0].key];
          return !ser || !ser.length ? 1 : 0;
        }
        var resolvedNull = resolveRefValue(args[0], values, seriesValues);
        return resolvedNull == null ? 1 : 0;
      }
      var iv = evalAst(args[0], values, seriesValues);
      return iv == null || (typeof iv === "string" && iv === "") ? 1 : 0;
    }
    if (name === "isnumber") {
      if (args.length !== 1) return null;
      if (args[0].type === "ref") {
        var rn = resolveRefValue(args[0], values, seriesValues);
        return typeof rn === "number" && Number.isFinite(rn) ? 1 : 0;
      }
      var nv = evalAst(args[0], values, seriesValues);
      return typeof nv === "number" && Number.isFinite(nv) ? 1 : 0;
    }
    if (name === "coalesce") {
      for (var ci = 0; ci < args.length; ci++) {
        if (args[ci].type === "ref") {
          var rawC = resolveRefValue(args[ci], values, seriesValues);
          if (rawC != null && !(typeof rawC === "string" && rawC === "")) return rawC;
          continue;
        }
        var cv2 = evalAst(args[ci], values, seriesValues);
        if (cv2 != null && !(typeof cv2 === "string" && cv2 === "")) return cv2;
      }
      return null;
    }
    if (name === "if") {
      if (args.length !== 3) return null;
      var cond = evalAst(args[0], values, seriesValues);
      return isTruthy(cond)
        ? evalAst(args[1], values, seriesValues)
        : evalAst(args[2], values, seriesValues);
    }
    return null;
  }

  function evaluateExpression(expression, values, seriesValues) {
    try {
      var ast = parseExpression(expression);
      var v = evalAst(ast, values || {}, seriesValues || {});
      if (v == null) return "";
      if (typeof v === "boolean") return v ? "1" : "0";
      if (typeof v === "number") {
        if (!Number.isFinite(v)) return "";
        return String(
          Math.round(v * 1000) / 1000 === v
            ? Number.isInteger(v)
              ? v
              : Math.round(v * 1000) / 1000
            : v,
        );
      }
      return str(v);
    } catch (_e) {
      return "";
    }
  }

  /* ---------- normalize / deps / validate ---------- */

  function normalizeComputedDef(raw) {
    if (!raw || typeof raw !== "object") return null;
    var kind = str(raw.kind);
    if (VALID_KINDS.indexOf(kind) === -1) return null;
    if (kind === "expression") {
      var expression = str(raw.expression);
      if (!expression) return null;
      try {
        validateExpressionSeriesUsage(expression);
      } catch (_e) {
        return null;
      }
      return { kind: "expression", expression: expression };
    }
    var args = raw.args && typeof raw.args === "object" ? raw.args : {};
    return { kind: kind, args: args };
  }

  function fieldDeps(field) {
    if (!field || field.type !== "computed" || !field.computed) return [];
    var kind = field.computed.kind;
    var args = field.computed.args || {};
    if (kind === "expression") {
      return listExpressionFieldRefs(field.computed.expression);
    }
    if (kind === "daysBetween" || kind === "monthsBetween") {
      return [str(args.from), str(args.to)].filter(Boolean);
    }
    if (kind === "numberDiff") {
      return [str(args.a), str(args.b)].filter(Boolean);
    }
    return [];
  }

  function detectCycles(formFields) {
    var fields = formFields || [];
    var byKey = {};
    for (var i = 0; i < fields.length; i++) byKey[fields[i].key] = fields[i];
    var visiting = {};
    var visited = {};
    function dfs(key) {
      if (visiting[key]) return true;
      if (visited[key]) return false;
      visiting[key] = true;
      var f = byKey[key];
      if (f && f.type === "computed") {
        var deps = fieldDeps(f);
        for (var j = 0; j < deps.length; j++) {
          var d = deps[j];
          if (byKey[d] && byKey[d].type === "computed") {
            if (dfs(d)) return true;
          }
        }
      }
      visiting[key] = false;
      visited[key] = true;
      return false;
    }
    for (var k = 0; k < fields.length; k++) {
      if (fields[k].type === "computed" && dfs(fields[k].key)) return true;
    }
    return false;
  }

  function topoSortComputed(formFields) {
    var fields = (formFields || []).filter(function (f) {
      return f.type === "computed";
    });
    var byKey = {};
    for (var i = 0; i < (formFields || []).length; i++) {
      byKey[formFields[i].key] = formFields[i];
    }
    var indeg = {};
    var edges = {};
    for (var a = 0; a < fields.length; a++) {
      indeg[fields[a].key] = 0;
      edges[fields[a].key] = [];
    }
    for (var b = 0; b < fields.length; b++) {
      var deps = fieldDeps(fields[b]);
      for (var c = 0; c < deps.length; c++) {
        var dep = deps[c];
        if (byKey[dep] && byKey[dep].type === "computed" && indeg[dep] != null) {
          edges[dep].push(fields[b].key);
          indeg[fields[b].key] += 1;
        }
      }
    }
    var q = [];
    for (var key in indeg) {
      if (Object.prototype.hasOwnProperty.call(indeg, key) && indeg[key] === 0) q.push(key);
    }
    var order = [];
    while (q.length) {
      var n = q.shift();
      order.push(n);
      var outs = edges[n] || [];
      for (var o = 0; o < outs.length; o++) {
        indeg[outs[o]] -= 1;
        if (indeg[outs[o]] === 0) q.push(outs[o]);
      }
    }
    if (order.length !== fields.length) return fields;
    return order.map(function (k) {
      return byKey[k];
    });
  }

  function validateComputedField(field, formFields) {
    var errors = [];
    if (!field || field.type !== "computed") return { ok: true, errors: errors };
    var def = normalizeComputedDef(field.computed);
    if (!def) {
      errors.push("computed inválido em " + field.key);
      return { ok: false, errors: errors };
    }
    var byKey = {};
    for (var i = 0; i < (formFields || []).length; i++) {
      byKey[formFields[i].key] = formFields[i];
    }
    if (def.kind === "daysBetween" || def.kind === "monthsBetween") {
      var fromKey = str(def.args.from);
      var toKey = str(def.args.to);
      if (!fromKey || !toKey || !byKey[fromKey] || !byKey[toKey]) {
        errors.push("computed " + field.key + " referencia campos inexistentes");
      } else if (byKey[fromKey].type !== "date" || byKey[toKey].type !== "date") {
        errors.push("computed " + field.key + " exige campos date");
      }
    }
    if (def.kind === "numberDiff") {
      var aKey = str(def.args.a);
      var bKey = str(def.args.b);
      if (!aKey || !bKey || !byKey[aKey] || !byKey[bKey]) {
        errors.push("computed " + field.key + " referencia campos inexistentes");
      } else if (byKey[aKey].type !== "number" || byKey[bKey].type !== "number") {
        errors.push("computed " + field.key + " exige campos number");
      }
    }
    if (def.kind === "expression") {
      var refs = listExpressionFieldRefs(def.expression);
      for (var r = 0; r < refs.length; r++) {
        if (!byKey[refs[r]]) {
          errors.push("computed " + field.key + " referencia campos inexistentes");
          break;
        }
      }
      try {
        validateExpressionSeriesUsage(def.expression);
      } catch (_e) {
        errors.push("computed " + field.key + " expression inválida");
      }
    }
    if (detectCycles(formFields)) {
      errors.push("computed: ciclo de dependências");
    }
    return { ok: errors.length === 0, errors: errors };
  }

  function computeFieldValue(field, values, opts) {
    if (!field || field.type !== "computed" || !field.computed) return null;
    values = values || {};
    opts = opts || {};
    var seriesValues = opts.seriesValues || {};
    var kind = field.computed.kind;
    var args = field.computed.args || {};

    if (kind === "expression") {
      return evaluateExpression(field.computed.expression, values, seriesValues);
    }
    if (kind === "daysBetween") {
      var from = values[str(args.from)];
      var to = values[str(args.to)];
      var days = daysBetween(from, to);
      return days == null ? "" : String(days);
    }
    if (kind === "monthsBetween") {
      var fromM = values[str(args.from)];
      var toM = values[str(args.to)];
      var months = monthsBetween(fromM, toM);
      return months == null ? "" : String(months);
    }
    if (kind === "numberDiff") {
      var a = Number(values[str(args.a)]);
      var b = Number(values[str(args.b)]);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return "";
      return String(Math.round((b - a) * 1000) / 1000);
    }
    return null;
  }

  function computeFieldValues(form, values, opts) {
    var patch = {};
    if (!form || !Array.isArray(form.fields)) return patch;
    opts = opts || {};
    var ordered = topoSortComputed(form.fields);
    var working = Object.assign({}, values || {});
    for (var i = 0; i < ordered.length; i++) {
      var field = ordered[i];
      var computed = computeFieldValue(field, working, opts);
      if (computed != null) {
        patch[field.key] = computed;
        working[field.key] = computed;
      }
    }
    return patch;
  }

  function enrichEntityValues(form, values, opts) {
    var patch = computeFieldValues(form, values, opts);
    var next = Object.assign({}, values || {});
    for (var k in patch) {
      if (!Object.prototype.hasOwnProperty.call(patch, k)) continue;
      next[k] = patch[k];
    }
    return next;
  }

  return {
    VALID_KINDS: VALID_KINDS,
    LEGACY_KINDS: LEGACY_KINDS,
    FUNCS: FUNCS,
    SERIES_AGGREGATE_FUNCS: SERIES_AGGREGATE_FUNCS,
    EXPRESSION_FUNCTIONS: EXPRESSION_FUNCTIONS,
    normalizeComputedDef: normalizeComputedDef,
    computeFieldValue: computeFieldValue,
    computeFieldValues: computeFieldValues,
    enrichEntityValues: enrichEntityValues,
    validateComputedField: validateComputedField,
    listExpressionFieldRefs: listExpressionFieldRefs,
    parseExpression: parseExpression,
    detectCycles: detectCycles,
    fieldDeps: fieldDeps,
  };
});

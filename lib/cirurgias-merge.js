/**
 * Merge de cirurgias extraídas do POL no header do passômetro.
 * Dedupe por data + nome canônico (sanitizado); preserva id / hpbSurgeryId / poNotas.
 */
(function (root, factory) {
  "use strict";
  var api = factory(
    typeof require !== "undefined"
      ? require("./passometro-schema.js")
      : root.AghuPassometroSchema,
    typeof require !== "undefined"
      ? require("./cirurgias-descricao-pdf-parse.js")
      : root.AghuCirurgiasDescricaoPdfParse
  );
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuCirurgiasMerge = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (
  schemaApi,
  pdfParseApi
) {
  "use strict";

  var sanitizeProcedureNomeTokens =
    pdfParseApi && typeof pdfParseApi.sanitizeProcedureNomeTokens === "function"
      ? pdfParseApi.sanitizeProcedureNomeTokens
      : function (nome) {
          return str(nome).replace(/\s+/g, " ").trim();
        };

  function str(v) {
    return v == null ? "" : String(v);
  }

  function foldKey(s) {
    return str(s)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
  }

  function stripTruncation(nome) {
    return str(nome)
      .replace(/(\.\.\.|…)+\s*$/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Nome canônico para match: sanitize tokens de coluna + fold.
   * @param {string} nome
   * @returns {string}
   */
  function canonicalNome(nome) {
    return foldKey(sanitizeProcedureNomeTokens(stripTruncation(nome)));
  }

  /**
   * True se, após remover reticências, ainda sobram tokens de coluna AGHU.
   * @param {string} nome
   * @returns {boolean}
   */
  function nomeAindaSujo(nome) {
    var stripped = stripTruncation(nome);
    if (!stripped) return false;
    return foldKey(stripped) !== foldKey(sanitizeProcedureNomeTokens(stripped));
  }

  function hasListIndex(item) {
    return (
      item &&
      item.listIndex != null &&
      item.listIndex !== "" &&
      !isNaN(Number(item.listIndex))
    );
  }

  function cirurgiaKey(item) {
    if (!item) return "";
    var base =
      foldKey(item.data) + "|" + canonicalNome(item.nome || item.descricao);
    if (hasListIndex(item)) {
      return base + "|#" + Number(item.listIndex);
    }
    return base;
  }

  /** Chave sem listIndex — fallback para itens legados. */
  function cirurgiaKeyLoose(item) {
    if (!item) return "";
    return (
      foldKey(item.data) + "|" + canonicalNome(item.nome || item.descricao)
    );
  }

  /**
   * Nome sem reticências de truncamento da lista POL (fold).
   * @param {string} nome
   * @returns {string}
   */
  function nomeSemTruncamento(nome) {
    return foldKey(stripTruncation(nome));
  }

  /**
   * Mesma cirurgia quando canônicos iguais ou um é prefixo do outro
   * (truncado ↔ completo / limpo ↔ sujo embaralhado).
   * @param {string} a
   * @param {string} b
   * @returns {boolean}
   */
  function nomesMesmaCirurgia(a, b) {
    var na = canonicalNome(a);
    var nb = canonicalNome(b);
    if (!na || !nb) return false;
    if (na === nb) return true;
    return na.indexOf(nb) === 0 || nb.indexOf(na) === 0;
  }

  /**
   * Match por mesmo listIndex + mesma data (reextração com nome limpo).
   * @param {object[]} base
   * @param {object} incoming
   * @returns {number}
   */
  function findByListIndexData(base, incoming) {
    if (!hasListIndex(incoming) || !Array.isArray(base)) return -1;
    var wantData = foldKey(incoming.data);
    var wantIdx = Number(incoming.listIndex);
    for (var i = 0; i < base.length; i++) {
      var prev = base[i];
      if (!hasListIndex(prev)) continue;
      if (Number(prev.listIndex) !== wantIdx) continue;
      if (foldKey(prev.data) !== wantData) continue;
      return i;
    }
    return -1;
  }

  /**
   * Match por mesma data + nome canônico/prefixo (truncado legado ↔ PDF).
   * @param {object[]} base
   * @param {object} incoming
   * @returns {number}
   */
  function findByPrefixNome(base, incoming) {
    if (!Array.isArray(base)) return -1;
    var wantData = foldKey(incoming.data);
    if (!wantData) return -1;
    var inNome = incoming.nome || incoming.descricao;
    for (var i = 0; i < base.length; i++) {
      var prev = base[i];
      if (foldKey(prev.data) !== wantData) continue;
      if (
        hasListIndex(incoming) &&
        hasListIndex(prev) &&
        Number(incoming.listIndex) !== Number(prev.listIndex)
      ) {
        continue;
      }
      if (nomesMesmaCirurgia(inNome, prev.nome || prev.descricao)) {
        return i;
      }
    }
    return -1;
  }

  function findMergeIndex(byKey, incoming, base) {
    // 1) listIndex + data
    var byIdx = findByListIndexData(base, incoming);
    if (byIdx >= 0) return byIdx;

    // 2) chave data|nome|#listIndex
    var key = cirurgiaKey(incoming);
    if (key && key !== "|" && Object.prototype.hasOwnProperty.call(byKey, key)) {
      return byKey[key];
    }

    // 3) loose data|nome (legado sem listIndex)
    var loose = cirurgiaKeyLoose(incoming);
    if (loose && loose !== "|" && Object.prototype.hasOwnProperty.call(byKey, loose)) {
      var idx = byKey[loose];
      var prev = base && base[idx];
      var incomingHasIdx = hasListIndex(incoming);
      var prevHasIdx = hasListIndex(prev);
      // Loose match só para legado sem listIndex — não fundir dois índices POL distintos.
      if (!incomingHasIdx || !prevHasIdx) {
        return idx;
      }
    }

    // 4) mesma data + prefixo truncado ↔ completo / limpo ↔ sujo
    return findByPrefixNome(base, incoming);
  }

  function normalizeIncoming(src, schema) {
    var item = null;
    if (schema && schema.normalizeCirurgiaItem) {
      item = schema.normalizeCirurgiaItem(src);
    }
    if (!item || typeof item !== "object") return null;
    var rawNome = item.nome != null && String(item.nome).trim()
      ? item.nome
      : item.descricao;
    var cleaned = sanitizeProcedureNomeTokens(rawNome);
    if (cleaned && cleaned !== item.nome) {
      item = Object.assign({}, item, { nome: cleaned });
    } else if (cleaned && !item.nome) {
      item = Object.assign({}, item, { nome: cleaned });
    }
    return item;
  }

  function pickNonEmpty(primary, secondary) {
    return primary != null && String(primary).trim() ? primary : secondary;
  }

  /**
   * Preferir nome já limpo (nunca o sujo mais longo); entre limpos, o mais
   * completo sem reticências. CIR-EXT-17.
   * @param {string} nomeA
   * @param {string} nomeB
   * @returns {string}
   */
  function preferNomeLimpo(nomeA, nomeB) {
    var a = str(nomeA);
    var b = str(nomeB);
    var dirtyA = nomeAindaSujo(a);
    var dirtyB = nomeAindaSujo(b);
    if (dirtyA && !dirtyB) return stripTruncation(b) || b;
    if (dirtyB && !dirtyA) return stripTruncation(a) || a;
    var stripA = nomeSemTruncamento(a);
    var stripB = nomeSemTruncamento(b);
    if (stripB.length > stripA.length) return stripTruncation(b) || b;
    if (stripA.length > stripB.length) return stripTruncation(a) || a;
    var aTrunc = /(\.\.\.|…)\s*$/.test(a.trim());
    var bTrunc = /(\.\.\.|…)\s*$/.test(b.trim());
    if (aTrunc && !bTrunc) return b;
    if (bTrunc && !aTrunc) return a;
    return a.length >= b.length ? a : b;
  }

  /**
   * Funde dois itens: preferir nome limpo; preserva id / listIndex.
   * @param {object} a
   * @param {object} b
   * @param {object|null} schema
   * @returns {object|null}
   */
  function mergePairPreferLongerNome(a, b, schema) {
    var longerNome = preferNomeLimpo(
      a.nome || a.descricao,
      b.nome || b.descricao
    );
    return normalizeIncoming(
      {
        id: a.id || b.id,
        data: a.data || b.data,
        nome: longerNome,
        descricao: pickNonEmpty(a.descricao, b.descricao),
        equipe: pickNonEmpty(a.equipe, b.equipe),
        achadosOperatorios: pickNonEmpty(
          a.achadosOperatorios,
          b.achadosOperatorios
        ),
        hpbSurgeryId: a.hpbSurgeryId || b.hpbSurgeryId || "",
        poNotas:
          a.poNotas && a.poNotas.length
            ? a.poNotas
            : b.poNotas,
        listIndex: hasListIndex(a)
          ? a.listIndex
          : hasListIndex(b)
            ? b.listIndex
            : a.listIndex,
      },
      schema
    );
  }

  /**
   * Compactação pós-merge: funde pares mesma data com nome canônico/prefixo.
   * @param {object[]} cirurgias
   * @param {object|null} schema
   * @returns {object[]}
   */
  function compactPrefixPairs(cirurgias, schema) {
    var list = Array.isArray(cirurgias) ? cirurgias.slice() : [];
    var consumed = Object.create(null);
    var out = [];
    for (var i = 0; i < list.length; i++) {
      if (consumed[i]) continue;
      var cur = list[i];
      for (var j = i + 1; j < list.length; j++) {
        if (consumed[j]) continue;
        var other = list[j];
        if (foldKey(cur.data) !== foldKey(other.data)) continue;
        if (
          hasListIndex(cur) &&
          hasListIndex(other) &&
          Number(cur.listIndex) !== Number(other.listIndex)
        ) {
          continue;
        }
        if (
          !nomesMesmaCirurgia(
            cur.nome || cur.descricao,
            other.nome || other.descricao
          )
        ) {
          continue;
        }
        consumed[j] = true;
        cur = mergePairPreferLongerNome(cur, other, schema) || cur;
      }
      out.push(cur);
    }
    return out;
  }

  function indexKeys(byKey, item, idx) {
    var key = cirurgiaKey(item);
    if (key && key !== "|") byKey[key] = idx;
    var loose = cirurgiaKeyLoose(item);
    if (
      loose &&
      loose !== "|" &&
      !Object.prototype.hasOwnProperty.call(byKey, loose)
    ) {
      byKey[loose] = idx;
    }
  }

  /**
   * @param {object[]} existing
   * @param {object[]} extracted
   * @param {object|null} [schema]
   * @returns {{ cirurgias: object[], added: number, updated: number, skipped: number }}
   */
  function mergeCirurgiasIntoList(existing, extracted, schema) {
    var sch = schema || schemaApi || null;
    var base = Array.isArray(existing) ? existing.slice() : [];
    var byKey = Object.create(null);
    for (var i = 0; i < base.length; i++) {
      var norm = normalizeIncoming(base[i], sch) || base[i];
      if (!norm) continue;
      base[i] = norm;
      indexKeys(byKey, norm, i);
    }
    var added = 0;
    var updated = 0;
    var skipped = 0;
    var list = Array.isArray(extracted) ? extracted : [];
    for (var j = 0; j < list.length; j++) {
      var incoming = normalizeIncoming(list[j], sch);
      if (!incoming) {
        skipped += 1;
        continue;
      }
      // Extração/merge exige data; rascunho sem data fica só na UI (CIR-EXT-05).
      if (!String(incoming.data || "").trim()) {
        skipped += 1;
        continue;
      }
      var key = cirurgiaKey(incoming);
      if (!key || key === "|") {
        skipped += 1;
        continue;
      }
      var idx = findMergeIndex(byKey, incoming, base);
      if (idx >= 0) {
        var prev = base[idx];
        var mergedItem = normalizeIncoming(
          {
            id: prev.id,
            data: incoming.data || prev.data,
            nome: preferNomeLimpo(
              prev.nome || prev.descricao,
              incoming.nome || incoming.descricao
            ),
            descricao:
              incoming.descricao != null && String(incoming.descricao).trim()
                ? incoming.descricao
                : prev.descricao,
            equipe:
              incoming.equipe != null && String(incoming.equipe).trim()
                ? incoming.equipe
                : prev.equipe,
            achadosOperatorios:
              incoming.achadosOperatorios != null &&
              String(incoming.achadosOperatorios).trim()
                ? incoming.achadosOperatorios
                : prev.achadosOperatorios,
            hpbSurgeryId: prev.hpbSurgeryId || incoming.hpbSurgeryId || "",
            poNotas: prev.poNotas,
            listIndex:
              incoming.listIndex != null && incoming.listIndex !== ""
                ? incoming.listIndex
                : prev.listIndex,
          },
          sch
        );
        base[idx] = mergedItem;
        indexKeys(byKey, mergedItem || incoming, idx);
        updated += 1;
      } else {
        indexKeys(byKey, incoming, base.length);
        base.push(incoming);
        added += 1;
      }
    }
    base = compactPrefixPairs(base, sch);
    if (sch && sch.normalizeCirurgiasFromHeader) {
      base = sch.normalizeCirurgiasFromHeader({ cirurgias: base });
    }
    return { cirurgias: base, added: added, updated: updated, skipped: skipped };
  }

  /**
   * @param {object} snap
   * @param {object[]} extracted
   * @param {object|null} [schema]
   */
  function mergeCirurgiasIntoSnap(snap, extracted, schema) {
    var sch = schema || schemaApi || null;
    var s = snap && typeof snap === "object" ? snap : { header: {} };
    if (!s.header || typeof s.header !== "object") s.header = {};
    var existing =
      sch && sch.normalizeCirurgiasFromHeader
        ? sch.normalizeCirurgiasFromHeader(s.header)
        : Array.isArray(s.header.cirurgias)
          ? s.header.cirurgias
          : [];
    var merged = mergeCirurgiasIntoList(existing, extracted, sch);
    if (sch && typeof sch.normalizeHeader === "function") {
      s.header = sch.normalizeHeader(
        Object.assign({}, s.header, { cirurgias: merged.cirurgias })
      );
    } else {
      s.header.cirurgias = merged.cirurgias;
    }
    return {
      snap: s,
      added: merged.added,
      updated: merged.updated,
      skipped: merged.skipped,
    };
  }

  return {
    cirurgiaKey: cirurgiaKey,
    cirurgiaKeyLoose: cirurgiaKeyLoose,
    canonicalNome: canonicalNome,
    nomesMesmaCirurgia: nomesMesmaCirurgia,
    mergeCirurgiasIntoList: mergeCirurgiasIntoList,
    mergeCirurgiasIntoSnap: mergeCirurgiasIntoSnap,
  };
});

/**
 * Não deixar extração pobre (só data+nome) apagar equipe/achados/descrição já gravados.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuCirurgiasBodyPreserve = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

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

  function hasBody(c) {
    if (!c || typeof c !== "object") return false;
    return !!(
      str(c.equipe).trim() ||
      str(c.achadosOperatorios).trim() ||
      str(c.descricao).trim()
    );
  }

  function pickNonEmpty(primary, secondary) {
    return str(primary).trim() ? primary : secondary;
  }

  function dnKey(c) {
    if (!c) return "";
    return foldKey(c.data) + "|" + foldKey(c.nome || c.descricao);
  }

  function indexExisting(list) {
    var byId = Object.create(null);
    var byDn = Object.create(null);
    var arr = Array.isArray(list) ? list : [];
    for (var i = 0; i < arr.length; i++) {
      var c = arr[i];
      if (!c || !hasBody(c)) continue;
      var id = str(c.id).trim();
      if (id) byId[id] = c;
      var k = dnKey(c);
      if (k && k !== "|") byDn[k] = c;
    }
    return { byId: byId, byDn: byDn };
  }

  /**
   * Incoming pobre recebe corpo do existente correspondente (id ou data+nome).
   * @param {object[]} existing
   * @param {object[]} incoming
   * @returns {object[]}
   */
  function preserveCirurgiaBodiesInList(existing, incoming) {
    var idx = indexExisting(existing);
    var list = Array.isArray(incoming) ? incoming : [];
    var out = [];
    for (var j = 0; j < list.length; j++) {
      var item = list[j];
      if (!item || typeof item !== "object") {
        out.push(item);
        continue;
      }
      if (hasBody(item)) {
        out.push(item);
        continue;
      }
      var id = str(item.id).trim();
      var prev = (id && idx.byId[id]) || idx.byDn[dnKey(item)];
      if (!prev) {
        out.push(item);
        continue;
      }
      out.push(
        Object.assign({}, item, {
          equipe: pickNonEmpty(item.equipe, prev.equipe),
          achadosOperatorios: pickNonEmpty(
            item.achadosOperatorios,
            prev.achadosOperatorios
          ),
          descricao: pickNonEmpty(item.descricao, prev.descricao),
        })
      );
    }
    return out;
  }

  function preserveInSnap(existingSnap, incomingSnap) {
    var incoming =
      incomingSnap && typeof incomingSnap === "object" ? incomingSnap : {};
    var existing =
      existingSnap && typeof existingSnap === "object" ? existingSnap : {};
    var ih = incoming.header && typeof incoming.header === "object"
      ? incoming.header
      : {};
    var eh = existing.header && typeof existing.header === "object"
      ? existing.header
      : {};
    if (!Array.isArray(ih.cirurgias)) return incoming;
    var next = Object.assign({}, incoming, {
      header: Object.assign({}, ih, {
        cirurgias: preserveCirurgiaBodiesInList(eh.cirurgias, ih.cirurgias),
      }),
    });
    return next;
  }

  /**
   * Domínio passômetro (coleção v2 ou snap legado).
   * @param {object|null|undefined} existingDomain
   * @param {object|null|undefined} incomingDomain
   * @returns {object|null|undefined}
   */
  function preserveCirurgiaBodiesInDomain(existingDomain, incomingDomain) {
    if (!incomingDomain || typeof incomingDomain !== "object") {
      return incomingDomain;
    }
    if (!existingDomain || typeof existingDomain !== "object") {
      return incomingDomain;
    }
    var inRegs = incomingDomain.registros;
    var exRegs = existingDomain.registros;
    if (Array.isArray(inRegs) && Array.isArray(exRegs)) {
      var byEp = Object.create(null);
      for (var i = 0; i < exRegs.length; i++) {
        var er = exRegs[i];
        if (!er || typeof er !== "object") continue;
        var eid = str(er.patientEpisodeId).trim();
        if (eid) byEp[eid] = er;
      }
      var nextRegs = [];
      for (var j = 0; j < inRegs.length; j++) {
        var ir = inRegs[j];
        if (!ir || typeof ir !== "object") {
          nextRegs.push(ir);
          continue;
        }
        var prev = byEp[str(ir.patientEpisodeId).trim()];
        if (!prev || !prev.snap) {
          nextRegs.push(ir);
          continue;
        }
        nextRegs.push(
          Object.assign({}, ir, {
            snap: preserveInSnap(prev.snap, ir.snap),
          })
        );
      }
      return Object.assign({}, incomingDomain, { registros: nextRegs });
    }
    if (incomingDomain.header || existingDomain.header) {
      return preserveInSnap(existingDomain, incomingDomain);
    }
    return incomingDomain;
  }

  return {
    hasCirurgiaBody: hasBody,
    preserveCirurgiaBodiesInList: preserveCirurgiaBodiesInList,
    preserveCirurgiaBodiesInDomain: preserveCirurgiaBodiesInDomain,
  };
});

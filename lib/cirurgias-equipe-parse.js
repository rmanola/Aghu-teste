/**
 * Parse do bloco EQUIPE em cirurgias[].equipe (FEAT-092).
 * Nunca usa header.staff (chefe de internação).
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuCirurgiasEquipeParse = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  function str(v) {
    return v == null ? "" : String(v).trim();
  }

  function getDescricaoParseApi() {
    if (root && root.AghuCirurgiasDescricaoPdfParse) {
      return root.AghuCirurgiasDescricaoPdfParse;
    }
    if (
      typeof globalThis !== "undefined" &&
      globalThis.AghuCirurgiasDescricaoPdfParse
    ) {
      return globalThis.AghuCirurgiasDescricaoPdfParse;
    }
    try {
      var mod = require("./cirurgias-descricao-pdf-parse.js");
      // Deno createRequire: UMD pode devolver Module vazio — preferir global.
      if (mod && typeof mod === "object" && Object.keys(mod).length > 0) {
        return mod;
      }
    } catch (_e) {
      /* fallthrough */
    }
    return null;
  }

  /**
   * @param {string} text
   * @returns {string}
   */
  function normalizeEquipeText(text) {
    var api = getDescricaoParseApi();
    var raw = str(text);
    if (!raw) return "";
    if (api && api.normalizeEquipeBlock) {
      return api.normalizeEquipeBlock(raw);
    }
    return raw;
  }

  /**
   * @param {string} roleRaw
   * @returns {"equipe"|"cirurgiao"|"auxiliar"|"supervisor"|"outro"}
   */
  function normalizeRole(roleRaw) {
    var r = str(roleRaw)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/:$/, "");
    if (r.indexOf("equipe") === 0) return "equipe";
    if (r.indexOf("cirurgia") === 0) return "cirurgiao";
    if (r.indexOf("auxiliar") === 0) return "auxiliar";
    if (r.indexOf("supervisor") === 0) return "supervisor";
    return "outro";
  }

  /**
   * @param {string} name
   * @returns {string}
   */
  function normalizeNameKey(name) {
    return str(name)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Chave de membro: CRM se houver, senão nome normalizado (QUAL-AC-05).
   * @param {{ crm?: string, name?: string }|null|undefined} member
   * @returns {string}
   */
  function memberKey(member) {
    if (!member) return "";
    var crm = str(member.crm).replace(/\D/g, "");
    if (crm) return crm;
    return normalizeNameKey(member.name);
  }

  /**
   * @param {string} text
   * @returns {{ crm: string, name: string, role: string, rawLine: string }[]}
   */
  function parseEquipeMembers(text) {
    var normalized = normalizeEquipeText(text);
    if (!normalized) return [];
    var lines = normalized.split(/\r?\n/).map(str).filter(Boolean);
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var m = line.match(
        /^CRM\s*:\s*(\d+)\s+(.+?)\s*[—\-]\s*(Equipe|Supervisor|Auxiliar|Cirurgi[aã]o)\s*:?\s*$/i,
      );
      if (m) {
        out.push({
          crm: m[1],
          name: str(m[2]),
          role: normalizeRole(m[3]),
          rawLine: line,
        });
        continue;
      }
      var m2 = line.match(/^CRM\s*:\s*(\d+)\s+(.+)$/i);
      if (m2) {
        var rest = str(m2[2]);
        var roleFromRest = rest.match(
          /\s*[—\-]\s*(Equipe|Supervisor|Auxiliar|Cirurgi[aã]o)\s*:?\s*$/i,
        );
        var name = rest;
        var role = "outro";
        if (roleFromRest) {
          name = str(rest.slice(0, roleFromRest.index));
          role = normalizeRole(roleFromRest[1]);
        }
        out.push({
          crm: m2[1],
          name: name,
          role: role,
          rawLine: line,
        });
        continue;
      }
      // Role: Nome CRM N (pós-PDF / sync antigo sem normalizar)
      var mRoleCrm = line.match(
        /^(Equipe|Supervisor|Auxiliar|Cirurgi[aã]o)\s*:\s*(.+?)\s+CRM\s+(\d+)\s*$/i,
      );
      if (mRoleCrm) {
        out.push({
          crm: mRoleCrm[3],
          name: str(mRoleCrm[2]),
          role: normalizeRole(mRoleCrm[1]),
          rawLine: line,
        });
        continue;
      }
      // Role: Nome (sem CRM)
      var mRoleName = line.match(
        /^(Equipe|Supervisor|Auxiliar|Cirurgi[aã]o)\s*:\s*(.+)$/i,
      );
      if (mRoleName) {
        out.push({
          crm: "",
          name: str(mRoleName[2]),
          role: normalizeRole(mRoleName[1]),
          rawLine: line,
        });
        continue;
      }
      // Nome CRM N (resto após strip do header EQUIPE:)
      var mNameCrm = line.match(/^(.+?)\s+CRM\s+(\d+)\s*$/i);
      if (mNameCrm && !/^CRM\s*:/i.test(line)) {
        out.push({
          crm: mNameCrm[2],
          name: str(mNameCrm[1]),
          role: "equipe",
          rawLine: line,
        });
        continue;
      }
      // Nome — Role: (sem CRM, após normalizeEquipeBlock)
      var mNameRole = line.match(
        /^(.+?)\s*[—\-]\s*(Equipe|Supervisor|Auxiliar|Cirurgi[aã]o)\s*:?\s*$/i,
      );
      if (mNameRole && !/^CRM\s*:/i.test(line)) {
        out.push({
          crm: "",
          name: str(mNameRole[1]),
          role: normalizeRole(mNameRole[2]),
          rawLine: line,
        });
        continue;
      }
      if (/^(Equipe|Supervisor|Auxiliar|Cirurgi[aã]o)\s*:?\s*$/i.test(line)) {
        continue;
      }
      if (/^EQUIPE\b/i.test(line) && !/^CRM\s*:/i.test(line)) {
        out.push({
          crm: "",
          name: line,
          role: "equipe",
          rawLine: line,
        });
      }
    }
    return out;
  }

  /**
   * Chefe = role=equipe; senão 1ª linha; senão rótulo POL (opts.equipeLabel).
   * @param {{ crm: string, name: string, role: string, rawLine: string }[]} members
   * @param {{ equipeLabel?: string }|null|undefined} [opts]
   * @returns {{ crm: string, name: string, role: string, rawLine: string }|null}
   */
  function resolveChefe(members, opts) {
    var list = Array.isArray(members) ? members : [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].role === "equipe") return list[i];
    }
    if (list.length) return list[0];
    var label = opts && str(opts.equipeLabel);
    if (label) {
      return {
        crm: "",
        name: label,
        role: "equipe",
        rawLine: label,
      };
    }
    return null;
  }

  /**
   * @param {object|string|null|undefined} cirurgiaOrText
   * @returns {{
   *   members: object[],
   *   chefe: object|null,
   *   hasEquipeText: boolean,
   *   hasParseableMembers: boolean,
   *   hasParseableMember: boolean
   * }}
   */
  function parseCirurgiaEquipe(cirurgiaOrText) {
    var equipeText = "";
    if (typeof cirurgiaOrText === "string") {
      equipeText = cirurgiaOrText;
    } else if (cirurgiaOrText && typeof cirurgiaOrText === "object") {
      equipeText = str(cirurgiaOrText.equipe);
    }
    var members = parseEquipeMembers(equipeText);
    var chefe = resolveChefe(members);
    var hasParseable = members.some(function (m) {
      return !!memberKey(m);
    });
    return {
      members: members,
      chefe: chefe,
      hasEquipeText: !!str(equipeText),
      hasParseableMembers: hasParseable,
      hasParseableMember: hasParseable,
    };
  }

  return {
    normalizeEquipeText: normalizeEquipeText,
    normalizeRole: normalizeRole,
    normalizeNameKey: normalizeNameKey,
    memberKey: memberKey,
    parseEquipeMembers: parseEquipeMembers,
    resolveChefe: resolveChefe,
    parseCirurgiaEquipe: parseCirurgiaEquipe,
  };
});

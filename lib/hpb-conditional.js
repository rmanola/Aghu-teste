/**
 * Submódulos cirúrgicos condicionais por procedimento/via de acesso.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuHpbConditional = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var HEPATECTOMY_PROCEDURES = {
    Hepatectomia: true,
  };
  var PANCREAS_PROCEDURES = {
    Duodenopancreatectomia: true,
    "Duodenopancreatectomia (Whipple)": true,
    "Pancreatectomia distal": true,
    "Pancreatectomia total": true,
    "Pancreatectomia central": true,
  };
  var BILIARY_PROCEDURES = {
    "Cirurgia via biliar": true,
    "Reconstrução biliar": true,
    "Ressecção de via biliar extra-hepática": true,
    Hepaticojejunostomia: true,
    "Reconstrução de lesão de via biliar": true,
    "Ressecção de cisto de colédoco": true,
    "Colecistectomia radical": true,
  };
  var ROBOTIC_ACCESS = {
    Robótica: true,
    "Robótica convertida": true,
  };

  function norm(s) {
    return String(s || "").trim();
  }

  function matchesProcedureGroup(proc, exactMap, includesNeedle) {
    if (exactMap[proc]) return true;
    var lower = proc.toLowerCase();
    return includesNeedle.some(function (n) {
      return lower.indexOf(n.toLowerCase()) !== -1;
    });
  }

  function isTruthyYes(v) {
    var s = norm(v).toLowerCase();
    return s === "sim" || s === "true" || v === true;
  }

  function isTruthyNo(v) {
    var s = norm(v).toLowerCase();
    return s === "não" || s === "nao" || s === "false" || v === false;
  }

  /**
   * MDT «Locorregional» preenchido e diferente de «Não».
   * @param {unknown} value
   */
  function isMdtLocoregionalIndicated(value) {
    var s = norm(value);
    if (!s) return false;
    return !isTruthyNo(value);
  }

  /**
   * Última reunião MDT ativa do episódio (por data; sem data → última da lista).
   * @param {{ mdtMeetings?: Array<{ date?: string, deletedAt?: string, locoregional?: string }> }} episode
   */
  function getLatestMdtMeeting(episode) {
    episode = episode || {};
    var meetings = Array.isArray(episode.mdtMeetings) ? episode.mdtMeetings : [];
    var active = [];
    for (var i = 0; i < meetings.length; i++) {
      if (!meetings[i] || meetings[i].deletedAt) continue;
      active.push(meetings[i]);
    }
    if (!active.length) return null;
    var withDate = active.filter(function (m) {
      return norm(m.date);
    });
    if (!withDate.length) return active[active.length - 1];
    withDate.sort(function (a, b) {
      return String(b.date).localeCompare(String(a.date));
    });
    return withDate[0];
  }

  /**
   * Terapia locorregional (05D) aplicável quando o MDT mais recente indica locorregional.
   * @param {{ mdtMeetings?: Array<object> }} episode
   */
  function isLrtApplicableForEpisode(episode) {
    var latest = getLatestMdtMeeting(episode);
    if (!latest) return false;
    return isMdtLocoregionalIndicated(latest.locoregional);
  }

  /**
   * @param {{ mainProcedure?: string, accessRoute?: string, vascularReconstruction?: string }} core
   * @returns {{ hepatectomy: boolean, pancreatectomy: boolean, biliary: boolean, vascular: boolean, robotic: boolean }}
   */
  function getSurgerySubmodules(core) {
    core = core || {};
    var proc = norm(core.mainProcedure);
    var access = norm(core.accessRoute);
    var out = {
      hepatectomy: matchesProcedureGroup(proc, HEPATECTOMY_PROCEDURES, [
        "hepatectomia",
        "bissegmentectomia",
        "setorectomia",
        "segmentectomia hep",
        "ressecção hepática",
      ]),
      pancreatectomy: matchesProcedureGroup(proc, PANCREAS_PROCEDURES, [
        "pancreatectomia",
        "duodenopancreatectomia",
        "whipple",
        "enucleação pancre",
        "puestow",
        "frey",
        "beger",
      ]),
      biliary: matchesProcedureGroup(proc, BILIARY_PROCEDURES, [
        "via biliar",
        "hepaticojejunostomia",
        "colédoco",
        "colecistectomia radical",
      ]),
      vascular: isTruthyYes(core.vascularReconstruction),
      robotic: !!ROBOTIC_ACCESS[access],
    };
    if (isTruthyYes(core.vascularReconstruction)) out.vascular = true;
    return out;
  }

  return {
    getLatestMdtMeeting: getLatestMdtMeeting,
    getSurgerySubmodules: getSurgerySubmodules,
    isLrtApplicableForEpisode: isLrtApplicableForEpisode,
    isMdtLocoregionalIndicated: isMdtLocoregionalIndicated,
    isTruthyNo: isTruthyNo,
    HEPATECTOMY_PROCEDURES: HEPATECTOMY_PROCEDURES,
    PANCREAS_PROCEDURES: PANCREAS_PROCEDURES,
    BILIARY_PROCEDURES: BILIARY_PROCEDURES,
    ROBOTIC_ACCESS: ROBOTIC_ACCESS,
  };
});

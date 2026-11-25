/**
 * Progresso de completude HPB por episódio — 13 checkpoints (planilha HUCAM).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuHpbRegistryProgress = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var missingApi = null;
  var conditionalApi = null;
  var fieldConditionalApi = null;
  try {
    if (typeof require === "function") {
      missingApi = require("./hpb-missing-field-alerts.js");
      conditionalApi = require("./hpb-conditional.js");
      fieldConditionalApi = require("./hpb-field-conditional.js");
    }
  } catch (_e) {}

  function getMissingApi() {
    if (missingApi) return missingApi;
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    return g.AghuHpbMissingFieldAlerts || null;
  }

  function getConditionalApi() {
    if (conditionalApi) return conditionalApi;
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    return g.AghuHpbConditional || null;
  }

  function getFieldConditionalApi() {
    if (fieldConditionalApi) return fieldConditionalApi;
    var g = typeof globalThis !== "undefined" ? globalThis : {};
    return g.AghuHpbFieldConditional || null;
  }

  function isTruthyYes(v) {
    var s = String(v ?? "").trim().toLowerCase();
    return s === "sim" || s === "true" || v === true;
  }

  function isFieldApplicable(moduleId, fieldKey, data) {
    var api = getFieldConditionalApi();
    if (api && api.isFieldApplicable) {
      return api.isFieldApplicable(moduleId, fieldKey, data);
    }
    data = data && typeof data === "object" ? data : {};
    if (moduleId === "surgery_core" && fieldKey === "conversionReason") {
      return isTruthyYes(data.converted);
    }
    if (moduleId === "robotic" && fieldKey === "conversionReason") {
      return isTruthyYes(data.conversao);
    }
    return true;
  }

  /** Ordem alinhada a web/lib/hpb/sheet-tabs.ts */
  var CHECKPOINT_DEFS = [
    {
      checkpointId: "episodes",
      moduleId: "episode",
      label: "Episódios",
      shortLabel: "Episódio",
      sheetCode: "02",
      route: "episodios",
      grain: "episode",
    },
    {
      checkpointId: "followup",
      moduleId: "followup",
      label: "Seguimento",
      shortLabel: "08",
      sheetCode: "08",
      route: "episodios",
      grain: "followup",
    },
    {
      checkpointId: "mdt",
      moduleId: "mdt",
      label: "MDT",
      shortLabel: "MDT",
      sheetCode: "03",
      route: "diagnostico",
      grain: "mdt",
    },
    {
      checkpointId: "preop",
      moduleId: "preop",
      label: "Pré-operatório",
      shortLabel: "Pré-op",
      sheetCode: "04",
      route: "cirurgia",
      grain: "surgery",
      surgeryKey: "preop",
    },
    {
      checkpointId: "surgery",
      moduleId: "surgery_core",
      label: "Cirurgia",
      shortLabel: "Cirurgia",
      sheetCode: "05",
      route: "cirurgia",
      grain: "surgery",
      surgeryKey: "core",
    },
    {
      checkpointId: "hepatectomy",
      moduleId: "hepatectomy",
      label: "Hepatectomia",
      shortLabel: "05A",
      sheetCode: "05A",
      route: "cirurgia",
      grain: "surgerySubmodule",
      submoduleKey: "hepatectomy",
    },
    {
      checkpointId: "pancreatectomy",
      moduleId: "pancreatectomy",
      label: "Pancreatectomia",
      shortLabel: "05B",
      sheetCode: "05B",
      route: "cirurgia",
      grain: "surgerySubmodule",
      submoduleKey: "pancreatectomy",
    },
    {
      checkpointId: "biliary",
      moduleId: "biliary",
      label: "Via biliar",
      shortLabel: "05C",
      sheetCode: "05C",
      route: "cirurgia",
      grain: "surgerySubmodule",
      submoduleKey: "biliary",
    },
    {
      checkpointId: "pathology",
      moduleId: "pathology",
      label: "Patologia",
      shortLabel: "06",
      sheetCode: "06",
      route: "cirurgia",
      grain: "surgeryAlways",
      surgeryKey: "pathology",
    },
    {
      checkpointId: "postop",
      moduleId: "postop",
      label: "Pós-operatório",
      shortLabel: "07",
      sheetCode: "07",
      route: "cirurgia",
      grain: "surgeryAlways",
      surgeryKey: "postop",
    },
    {
      checkpointId: "vascular",
      moduleId: "vascular",
      label: "Vascular",
      shortLabel: "05E",
      sheetCode: "05E",
      route: "cirurgia",
      grain: "surgerySubmodule",
      submoduleKey: "vascular",
    },
    {
      checkpointId: "robotic",
      moduleId: "robotic",
      label: "Robótica",
      shortLabel: "05F",
      sheetCode: "05F",
      route: "cirurgia",
      grain: "surgerySubmodule",
      submoduleKey: "robotic",
    },
    {
      checkpointId: "lrt",
      moduleId: "lrt",
      label: "Locorregional",
      shortLabel: "05D",
      sheetCode: "05D",
      route: "terapias",
      grain: "lrt",
    },
  ];

  var CONDITIONAL_SUBMODULES = {
    hepatectomy: true,
    pancreatectomy: true,
    biliary: true,
    vascular: true,
    robotic: true,
  };

  function moduleById(id) {
    var missing = getMissingApi();
    if (missing && missing.moduleById) return missing.moduleById(id);
    return null;
  }

  function classifyFieldValue(value) {
    var missing = getMissingApi();
    if (missing && missing.classifyFieldValue) {
      return missing.classifyFieldValue(value);
    }
    if (value == null) return "field_incomplete";
    if (typeof value !== "string") return null;
    var s = String(value).trim();
    if (!s) return "field_incomplete";
    return null;
  }

  function isEmptyValue(value) {
    return classifyFieldValue(value) !== null;
  }

  function hasContent(obj) {
    if (!obj || typeof obj !== "object") return false;
    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (key === "id" || key === "deletedAt" || key === "deletedBy") continue;
      if (!isEmptyValue(obj[key])) return true;
    }
    return false;
  }

  function surgerySubmoduleActive(surgery, moduleId) {
    var obj = surgery ? surgery[moduleId] : null;
    if (hasContent(obj)) return true;
    var conditional = getConditionalApi();
    if (!conditional || !conditional.getSurgerySubmodules) return false;
    var submodules = conditional.getSurgerySubmodules((surgery && surgery.core) || {});
    return !!submodules[moduleId];
  }

  function moduleCompletionForData(moduleId, data) {
    var moduleDef = moduleById(moduleId);
    if (!moduleDef) return { filled: 0, total: 0, percent: 0 };
    data = data && typeof data === "object" ? data : {};
    var filled = 0;
    var total = 0;
    for (var i = 0; i < moduleDef.fields.length; i++) {
      var field = moduleDef.fields[i];
      if (!isFieldApplicable(moduleId, field.key, data)) continue;
      total++;
      if (classifyFieldValue(data[field.key]) === null) filled++;
    }
    var percent = total > 0 ? Math.round((filled / total) * 100) : 0;
    return { filled: filled, total: total, percent: percent };
  }

  function averagePercent(values) {
    if (!values.length) return 0;
    var sum = 0;
    for (var i = 0; i < values.length; i++) sum += values[i];
    return Math.round(sum / values.length);
  }

  function sumCounts(items) {
    var filled = 0;
    var total = 0;
    for (var i = 0; i < items.length; i++) {
      filled += items[i].filled;
      total += items[i].total;
    }
    return { filled: filled, total: total };
  }

  function statusFromPercent(percent, override) {
    if (override === "na") return "na";
    if (percent >= 100) return "complete";
    if (percent > 0) return "partial";
    return "empty";
  }

  function buildCheckpoint(def, result) {
    return {
      checkpointId: def.checkpointId,
      moduleId: def.moduleId,
      label: def.label,
      shortLabel: def.shortLabel,
      sheetCode: def.sheetCode,
      route: def.route,
      percent: result.percent,
      filled: result.filled,
      total: result.total,
      instanceCount: result.instanceCount,
      status: result.status,
    };
  }

  function evaluateCheckpoint(episode, def) {
    var surgeries = Array.isArray(episode.surgeries) ? episode.surgeries : [];
    var grain = def.grain;

    if (grain === "episode") {
      var epStats = moduleCompletionForData(def.moduleId, episode);
      return {
        percent: epStats.percent,
        filled: epStats.filled,
        total: epStats.total,
        instanceCount: 1,
        status: statusFromPercent(epStats.percent),
      };
    }

    if (grain === "mdt") {
      var meetings = Array.isArray(episode.mdtMeetings) ? episode.mdtMeetings : [];
      if (!meetings.length) {
        if (isTruthyYes(episode.mdtRequired)) {
          return {
            percent: 0,
            filled: 0,
            total: 0,
            instanceCount: 0,
            status: "empty",
          };
        }
        return {
          percent: 0,
          filled: 0,
          total: 0,
          instanceCount: 0,
          status: "na",
        };
      }
      var mdtPercents = [];
      var mdtCounts = [];
      for (var mi = 0; mi < meetings.length; mi++) {
        var mdtStats = moduleCompletionForData(def.moduleId, meetings[mi]);
        mdtPercents.push(mdtStats.percent);
        mdtCounts.push(mdtStats);
      }
      var mdtAgg = sumCounts(mdtCounts);
      var mdtPercent = averagePercent(mdtPercents);
      return {
        percent: mdtPercent,
        filled: mdtAgg.filled,
        total: mdtAgg.total,
        instanceCount: meetings.length,
        status: statusFromPercent(mdtPercent),
      };
    }

    if (grain === "surgery" || grain === "surgeryAlways") {
      if (!surgeries.length) {
        return {
          percent: 0,
          filled: 0,
          total: 0,
          instanceCount: 0,
          status: "na",
        };
      }
      var surgPercents = [];
      var surgCounts = [];
      for (var si = 0; si < surgeries.length; si++) {
        var surgery = surgeries[si];
        var data =
          def.surgeryKey === "core"
            ? surgery.core || {}
            : surgery[def.surgeryKey] || {};
        var surgStats = moduleCompletionForData(def.moduleId, data);
        surgPercents.push(surgStats.percent);
        surgCounts.push(surgStats);
      }
      var surgAgg = sumCounts(surgCounts);
      var surgPercent = averagePercent(surgPercents);
      return {
        percent: surgPercent,
        filled: surgAgg.filled,
        total: surgAgg.total,
        instanceCount: surgeries.length,
        status: statusFromPercent(surgPercent),
      };
    }

    if (grain === "surgerySubmodule") {
      var submoduleId = def.submoduleKey || def.moduleId;
      var activePairs = [];
      for (var ssi = 0; ssi < surgeries.length; ssi++) {
        var s = surgeries[ssi];
        if (surgerySubmoduleActive(s, submoduleId)) {
          activePairs.push(moduleCompletionForData(def.moduleId, s[submoduleId] || {}));
        }
      }
      if (!activePairs.length) {
        return {
          percent: 0,
          filled: 0,
          total: 0,
          instanceCount: 0,
          status: "na",
        };
      }
      var subPercents = activePairs.map(function (p) {
        return p.percent;
      });
      var subAgg = sumCounts(activePairs);
      var subPercent = averagePercent(subPercents);
      return {
        percent: subPercent,
        filled: subAgg.filled,
        total: subAgg.total,
        instanceCount: activePairs.length,
        status: statusFromPercent(subPercent),
      };
    }

    if (grain === "lrt") {
      var conditional = getConditionalApi();
      if (
        conditional &&
        conditional.isLrtApplicableForEpisode &&
        !conditional.isLrtApplicableForEpisode(episode)
      ) {
        return {
          percent: 0,
          filled: 0,
          total: 0,
          instanceCount: 0,
          status: "na",
        };
      }
      var lrts = Array.isArray(episode.locoregional) ? episode.locoregional : [];
      if (!lrts.length) {
        return {
          percent: 0,
          filled: 0,
          total: 0,
          instanceCount: 0,
          status: "empty",
        };
      }
      var lrtPercents = [];
      var lrtCounts = [];
      for (var li = 0; li < lrts.length; li++) {
        var lrtStats = moduleCompletionForData(def.moduleId, lrts[li]);
        lrtPercents.push(lrtStats.percent);
        lrtCounts.push(lrtStats);
      }
      var lrtAgg = sumCounts(lrtCounts);
      var lrtPercent = averagePercent(lrtPercents);
      return {
        percent: lrtPercent,
        filled: lrtAgg.filled,
        total: lrtAgg.total,
        instanceCount: lrts.length,
        status: statusFromPercent(lrtPercent),
      };
    }

    if (grain === "followup") {
      var followups = Array.isArray(episode.followups) ? episode.followups : [];
      if (!followups.length) {
        return {
          percent: 0,
          filled: 0,
          total: 0,
          instanceCount: 0,
          status: "empty",
        };
      }
      var fuPercents = [];
      var fuCounts = [];
      for (var fi = 0; fi < followups.length; fi++) {
        var fuStats = moduleCompletionForData(def.moduleId, followups[fi]);
        fuPercents.push(fuStats.percent);
        fuCounts.push(fuStats);
      }
      var fuAgg = sumCounts(fuCounts);
      var fuPercent = averagePercent(fuPercents);
      return {
        percent: fuPercent,
        filled: fuAgg.filled,
        total: fuAgg.total,
        instanceCount: followups.length,
        status: statusFromPercent(fuPercent),
      };
    }

    return {
      percent: 0,
      filled: 0,
      total: 0,
      instanceCount: 0,
      status: "empty",
    };
  }

  /**
   * @param {object|null|undefined} episode
   * @returns {{
   *   overallPercent: number,
   *   completeCount: number,
   *   applicableCount: number,
   *   checkpoints: Array<object>
   * }}
   */
  function computeEpisodeProgress(episode) {
    if (!episode || typeof episode !== "object") {
      return {
        overallPercent: 0,
        completeCount: 0,
        applicableCount: 0,
        checkpoints: CHECKPOINT_DEFS.map(function (def) {
          return buildCheckpoint(def, {
            percent: 0,
            filled: 0,
            total: 0,
            instanceCount: 0,
            status: "empty",
          });
        }),
      };
    }

    var checkpoints = [];
    var applicablePercents = [];
    var completeCount = 0;
    var applicableCount = 0;

    for (var i = 0; i < CHECKPOINT_DEFS.length; i++) {
      var def = CHECKPOINT_DEFS[i];
      var result = evaluateCheckpoint(episode, def);
      var checkpoint = buildCheckpoint(def, result);
      checkpoints.push(checkpoint);
      if (checkpoint.status === "na") continue;
      applicableCount++;
      applicablePercents.push(checkpoint.percent);
      if (checkpoint.status === "complete") completeCount++;
    }

    var overallPercent = averagePercent(applicablePercents);

    return {
      overallPercent: overallPercent,
      completeCount: completeCount,
      applicableCount: applicableCount,
      checkpoints: checkpoints,
    };
  }

  function visibleCheckpoints(progress) {
    return (progress && progress.checkpoints ? progress.checkpoints : []).filter(
      function (cp) {
        return cp.status !== "na";
      },
    );
  }

  return {
    CHECKPOINT_DEFS: CHECKPOINT_DEFS,
    CONDITIONAL_SUBMODULES: CONDITIONAL_SUBMODULES,
    computeEpisodeProgress: computeEpisodeProgress,
    moduleCompletionForData: moduleCompletionForData,
    visibleCheckpoints: visibleCheckpoints,
  };
});

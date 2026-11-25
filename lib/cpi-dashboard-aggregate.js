/**
 * FEAT-120 — Agregação CPI sobre a coorte do painel.
 * Orquestração: delega attributeCareLines + INDICATORS + computeObservedExpected.
 * Não reimplementa regra clínica — se faltar um facto, o indicador nasce `blocked`
 * na biblioteca (Fase 1); esta camada só monta o agregado.
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuCpiDashboardAggregate = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  function load(name, globalName) {
    if (typeof require === "function") {
      try {
        var mod = require("./" + name);
        if (mod && typeof mod === "object" && Object.keys(mod).length > 0) {
          return mod;
        }
      } catch (_e) {
        /* fall through */
      }
    }
    return (
      (root && root[globalName]) ||
      (typeof globalThis !== "undefined" && globalThis[globalName]) ||
      null
    );
  }

  var careLinesApi = load("cpi-care-lines.js", "AghuCpiCareLines");
  var trendApi = load("cpi-trend.js", "AghuCpiTrend");
  var periodRangeApi = load("quality-period-range.js", "AghuQualityPeriodRange");
  var indicatorApi = load("cpi-indicator-library.js", "AghuCpiIndicatorLibrary");
  var riskAdjustApi = load("cpi-risk-adjust.js", "AghuCpiRiskAdjust");
  var dataQualityApi = load("cpi-data-quality.js", "AghuCpiDataQuality");
  var hpbBridgeApi = load("cpi-hpb-bridge.js", "AghuCpiHpbBridge");
  var referenceRegistryApi = load(
    "cpi-reference-registry.js",
    "AghuCpiReferenceRegistry",
  );
  var effectiveConfigApi = load(
    "cpi-effective-config.js",
    "AghuCpiEffectiveConfig",
  );
  // FEAT-131 — opcional; se ausente, o agregado continua a funcionar.
  var modelDriftApi = load("cpi-model-drift.js", "AghuCpiModelDrift");
  var periSchemaApi = load(
    "cpi-capture-schema-perioperative.js",
    "AghuCpiCaptureSchemaPerioperative",
  );
  var oncoSchemaApi = load(
    "cpi-oncology-capture.js",
    "AghuCpiOncologyCapture",
  );
  var periOutcomeApi = load(
    "cpi-perioperative-outcome.js",
    "AghuCpiPerioperativeOutcome",
  );
  var oncoCaptureApi = oncoSchemaApi;
  var followupApi = load(
    "cpi-longitudinal-followup.js",
    "AghuCpiLongitudinalFollowup",
  );
  var nephroCaptureApi = load(
    "cpi-nephrologic-capture.js",
    "AghuCpiNephrologicCapture",
  );

  var DEFAULT_MIN_DENOMINATOR = 11;

  /** FEAT-127 — razão única da degradação por modelo de risco não validado. */
  var RISK_MODEL_NOT_VALIDATED_REASON = "risk_model_not_validated";
  var NOT_VALIDATED = "not_validated";

  var EGFR_STAGE_RANK = Object.freeze({
    G1: 1,
    G2: 2,
    G3a: 3,
    G3b: 4,
    G4: 5,
    G5: 6,
  });

  function asArray(v) {
    return Array.isArray(v) ? v : [];
  }

  function str(v) {
    return v == null ? "" : String(v);
  }

  function num(v) {
    var n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  /**
   * Definição canónica de readmissão 30d, delegada em `cpi-indicator-library`
   * quando disponível; fallback local determinístico caso o carregamento falhe.
   */
  function isReadmissionWithin30Days(indexEpisode, candidateEpisode) {
    if (
      indicatorApi &&
      typeof indicatorApi.isReadmissionWithin30Days === "function"
    ) {
      return indicatorApi.isReadmissionWithin30Days(
        indexEpisode,
        candidateEpisode,
      );
    }
    return false;
  }

  /** @param {object} caseFacts */
  function hasDeathInPeriod(caseFacts) {
    if (!caseFacts) return false;
    if (caseFacts.hasDeathInPeriod) return true;
    return asArray(caseFacts.deathEvents).length > 0;
  }

  /** @param {object} caseFacts */
  function hasUnplannedIcuAdmission(caseFacts) {
    var list = asArray(caseFacts && caseFacts.icuAdmissions);
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].planned === false) return true;
    }
    return false;
  }

  /** @param {object} caseFacts */
  function losCoverage(caseFacts) {
    var list = asArray(caseFacts && caseFacts.hospEpisodes);
    var covered = 0;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].losDays != null) covered += 1;
    }
    return covered;
  }

  /**
   * Agrega observado/denominador de readmissão 30d dentro de um caso
   * (episódios do mesmo doente — candidato tem de ser do mesmo `facts`).
   * @param {object} caseFacts
   */
  function readmissionWithin30Days(caseFacts) {
    var episodes = asArray(caseFacts && caseFacts.hospEpisodes);
    var observed = 0;
    var denominator = 0;
    for (var i = 0; i < episodes.length; i++) {
      var idx = episodes[i];
      if (!idx || !idx.endedAt) continue;
      denominator += 1;
      var readmitted = false;
      for (var j = 0; j < episodes.length; j++) {
        if (j === i) continue;
        if (isReadmissionWithin30Days(idx, episodes[j])) {
          readmitted = true;
          break;
        }
      }
      if (readmitted) observed += 1;
    }
    return { observed: observed, denominator: denominator };
  }

  /**
   * Registo de predicados de numerador conhecidos (Fase 2, seed FEAT-117/118).
   * Predicado sem entrada aqui → indicador incluído, `observed: 0`, nunca lança.
   */
  var CASE_LEVEL_PREDICATES = {
    inPeriod: hasDeathInPeriod,
    within90dOfIndex: hasDeathInPeriod,
    inHospital: hasDeathInPeriod,
    unplanned: hasUnplannedIcuAdmission,
  };

  var EPISODE_LEVEL_PREDICATES = {
    isReadmissionWithin30Days: readmissionWithin30Days,
  };

  var COVERAGE_PREDICATES = {
    calendarLosDays: losCoverage,
    losDays: losCoverage,
  };

  /**
   * @param {object} indicator
   * @param {object[]} lineCases — facts[] atribuídos a esta linha
   * @returns {{ observed: number, denominator: number }}
   */
  function attachCaptureToFacts(factsList, rows) {
    var list = asArray(factsList);
    var byRecord = {};
    var incoming = asArray(rows);
    for (var r = 0; r < incoming.length; r++) {
      var row = incoming[r];
      if (!row) continue;
      var recId = str(row.recordClientId || row.record_client_id);
      if (!recId) continue;
      var epId = str(row.episodeId || row.subjectKey);
      if (!epId) continue;
      if (!byRecord[recId]) {
        byRecord[recId] = {
          provenance: "capture",
          captureVersion: row.captureVersion != null ? Number(row.captureVersion) : null,
          byEpisode: {},
          unansweredByEpisode: {},
        };
      }
      if (row.values && typeof row.values === "object") {
        // CPICAP-AC-17 / FEAT-148: peri + onco na mesma careLine/episódio fundem values.
        byRecord[recId].byEpisode[epId] = Object.assign(
          {},
          byRecord[recId].byEpisode[epId] || {},
          row.values,
        );
      }
      if (asArray(row.unanswered).length || byRecord[recId].unansweredByEpisode[epId]) {
        var mergedVals = byRecord[recId].byEpisode[epId] || {};
        var prevUn = asArray(byRecord[recId].unansweredByEpisode[epId]);
        var nextUn = asArray(row.unanswered);
        var combined = prevUn.concat(nextUn).filter(function (k, idx, arr) {
          return (
            arr.indexOf(k) === idx &&
            !Object.prototype.hasOwnProperty.call(mergedVals, k)
          );
        });
        byRecord[recId].unansweredByEpisode[epId] = combined;
      }
    }
    for (var i = 0; i < list.length; i++) {
      var facts = list[i];
      if (!facts) continue;
      var id = str(facts.recordClientId || facts.record_client_id);
      if (id && byRecord[id]) {
        facts.capture = {
          provenance: "capture",
          captureVersion: byRecord[id].captureVersion,
          byEpisode: byRecord[id].byEpisode,
          unansweredByEpisode: byRecord[id].unansweredByEpisode,
        };
      }
    }
    return list;
  }

  /**
   * FEAT-149 — anexa marcos longitudinais por recordClientId (nunca por episodeId).
   * @param {object[]} factsList
   * @param {object[]} rows — capture rows com captureKind longitudinal
   */
  function attachLongitudinalFollowupToFacts(factsList, rows) {
    var list = asArray(factsList);
    var byRecord = {};
    var incoming = asArray(rows);
    for (var r = 0; r < incoming.length; r++) {
      var row = incoming[r];
      if (!row) continue;
      var kind = str(row.captureKind || row.capture_kind);
      if (kind && kind !== "longitudinal") continue;
      var recId = str(row.recordClientId || row.record_client_id);
      if (!recId) continue;
      if (!byRecord[recId]) byRecord[recId] = [];
      byRecord[recId].push({
        careLineId: str(row.careLineId || row.care_line_id),
        subjectKey: str(row.subjectKey || row.subject_key),
        milestoneKey: str(row.milestoneKey),
        windowDays:
          row.windowDays != null ? Number(row.windowDays) : undefined,
        anchorAtIso: str(row.anchorAtIso),
        dueAtIso: str(row.dueAtIso),
        respondedAtIso: str(row.respondedAtIso),
        graceDays: row.graceDays != null ? Number(row.graceDays) : undefined,
        originEpisodeId: str(row.originEpisodeId),
        values:
          row.values && typeof row.values === "object" ? row.values : {},
        unanswered: asArray(row.unanswered),
      });
    }
    for (var i = 0; i < list.length; i++) {
      var facts = list[i];
      if (!facts) continue;
      var id = str(facts.recordClientId || facts.record_client_id);
      if (id && byRecord[id]) {
        facts.longitudinalFollowup = {
          provenance: "capture",
          milestones: byRecord[id],
        };
      }
    }
    return list;
  }

  function akiOnsetFromFacts(caseFacts) {
    if (!caseFacts) return "";
    if (caseFacts.akiOnsetAtIso) return str(caseFacts.akiOnsetAtIso).slice(0, 10);
    var labs = asArray(caseFacts.labSeries && caseFacts.labSeries.creatinina);
    if (labs.length && labs[0] && labs[0].atIso) {
      return str(labs[0].atIso).slice(0, 10);
    }
    return "";
  }

  function firstCaptureEpisode(caseFacts) {
    var capture = caseFacts && caseFacts.capture;
    var byEp = capture && capture.byEpisode;
    var unansweredMap = capture && capture.unansweredByEpisode;
    if (!byEp || typeof byEp !== "object") {
      return { values: {}, unanswered: [] };
    }
    var hosp = asArray(caseFacts && caseFacts.hospEpisodes);
    var prefer = hosp[0] && hosp[0].id != null ? str(hosp[0].id) : "";
    var key = prefer && byEp[prefer] ? prefer : Object.keys(byEp)[0];
    if (!key) return { values: {}, unanswered: [] };
    return {
      values: byEp[key] && typeof byEp[key] === "object" ? byEp[key] : {},
      unanswered: asArray(unansweredMap && unansweredMap[key]),
    };
  }

  function surgeryDateFromFacts(caseFacts) {
    var cir = asArray(caseFacts && caseFacts.cirInPeriod)[0];
    if (!cir) return "";
    return str(cir.data || cir.startedAt || cir.surgeryDateIso).slice(0, 10);
  }

  function usesClavienWindow(indicator) {
    var id = str(indicator && indicator.id);
    if (
      id === "CG-obs-SAF-02" ||
      id === "CAD-SAF-01" ||
      id === "CAD-eso-SAF-01" ||
      id === "CAD-VAL-02"
    ) {
      return true;
    }
    return /^CG-(ape|col|her)-(SAF-01|VAL-01)$/.test(id);
  }

  function partitionClavienWindow(indicator, lineCases, asOfDate) {
    if (!usesClavienWindow(indicator) || !asOfDate || !periOutcomeApi) {
      return { closed: lineCases, observingCount: 0 };
    }
    var closed = [];
    var observingCount = 0;
    for (var i = 0; i < lineCases.length; i++) {
      var surgery = surgeryDateFromFacts(lineCases[i]);
      if (!surgery) {
        closed.push(lineCases[i]);
        continue;
      }
      var state = periOutcomeApi.computeClavienWindowState({
        surgeryDateIso: surgery,
        asOfDateIso: asOfDate,
      });
      if (state === "closed") closed.push(lineCases[i]);
      else observingCount += 1;
    }
    return { closed: closed, observingCount: observingCount };
  }

  function resolveClavienForCase(caseFacts) {
    if (!periOutcomeApi) return { value: null, source: null };
    var cap = firstCaptureEpisode(caseFacts);
    var unanswered = cap.unanswered.indexOf("clavienMax") !== -1;
    var captureValue = Object.prototype.hasOwnProperty.call(cap.values, "clavienMax")
      ? cap.values.clavienMax
      : null;
    var hpbValue =
      caseFacts && caseFacts.hpbClavienMax != null
        ? caseFacts.hpbClavienMax
        : caseFacts && caseFacts.hpbPostop
          ? caseFacts.hpbPostop.clavienMax
          : null;
    return periOutcomeApi.resolvePerioperativeClavien({
      captureValue: captureValue,
      captureUnanswered: unanswered || captureValue == null,
      hpbCohortValue: hpbValue,
    });
  }

  function resolveMarginForCase(caseFacts) {
    if (!oncoCaptureApi) return { value: null, source: null };
    var cap = firstCaptureEpisode(caseFacts);
    var unanswered = cap.unanswered.indexOf("margemR0") !== -1;
    var captureValue = Object.prototype.hasOwnProperty.call(cap.values, "margemR0")
      ? cap.values.margemR0
      : null;
    var hpbValue =
      caseFacts && caseFacts.hpbMargemR0 != null
        ? caseFacts.hpbMargemR0
        : caseFacts && caseFacts.hpbPostop
          ? caseFacts.hpbPostop.margemR0
          : null;
    return oncoCaptureApi.resolveOncologyMargin({
      captureValue: captureValue,
      captureUnanswered: unanswered || captureValue == null,
      hpbCohortValue: hpbValue,
    });
  }

  function caseHasCaptureClavien(caseFacts) {
    var cap = firstCaptureEpisode(caseFacts);
    return (
      Object.prototype.hasOwnProperty.call(cap.values, "clavienMax") ||
      cap.unanswered.indexOf("clavienMax") !== -1
    );
  }

  function eligibleCasesForIndicator(indicator, lineCases) {
    var id = str(indicator && indicator.id);
    if (
      !id ||
      !dataQualityApi ||
      typeof dataQualityApi.caseUnansweredForIndicator !== "function"
    ) {
      return lineCases;
    }
    var out = [];
    for (var i = 0; i < lineCases.length; i++) {
      if (!dataQualityApi.caseUnansweredForIndicator(lineCases[i], id)) {
        out.push(lineCases[i]);
        continue;
      }
      // CPIPOP-AC-08: unanswered na captura não apaga o CRF HPB de reserva.
      if (usesClavienWindow(indicator)) {
        var resolved = resolveClavienForCase(lineCases[i]);
        if (resolved.value != null && resolved.source === "hpb") {
          out.push(lineCases[i]);
        }
      }
      // CPIONC-AC-13: margem unanswered na captura → HPB reserva
      if (str(indicator.id) === "CAD-VAL-01") {
        var margin = resolveMarginForCase(lineCases[i]);
        if (margin.value != null && margin.source === "hpb") {
          out.push(lineCases[i]);
        }
      }
    }
    return out;
  }

  function computeStrataCounts(indicator, lineCases, asOfDate) {
    var partitioned = partitionClavienWindow(indicator, lineCases, asOfDate);
    var eligible = eligibleCasesForIndicator(indicator, partitioned.closed);
    var observingCount = partitioned.observingCount;
    var numPredicate = str(
      indicator.numerator && indicator.numerator.predicate,
    );
    var denSource = str(indicator.denominator && indicator.denominator.source);

    if (numPredicate === "computeClavienGte3" || numPredicate === "gte3") {
      var clavObserved = 0;
      for (var ci = 0; ci < eligible.length; ci++) {
        var resolved = resolveClavienForCase(eligible[ci]);
        if (
          periOutcomeApi &&
          periOutcomeApi.computeClavienGte3(resolved.value)
        ) {
          clavObserved += 1;
        }
      }
      return {
        observed: clavObserved,
        denominator: eligible.length,
        observingCount: observingCount,
      };
    }

    if (numPredicate === "unplanned" && str(indicator.id) === "CAD-SAF-02") {
      var reopObs = 0;
      var reopDen = 0;
      for (var ri = 0; ri < eligible.length; ri++) {
        var rcap = firstCaptureEpisode(eligible[ri]);
        if (rcap.unanswered.indexOf("unplannedReintervention") !== -1) continue;
        if (
          !Object.prototype.hasOwnProperty.call(
            rcap.values,
            "unplannedReintervention",
          )
        ) {
          continue;
        }
        reopDen += 1;
        if (rcap.values.unplannedReintervention === true) reopObs += 1;
      }
      if (reopDen > 0) {
        return {
          observed: reopObs,
          denominator: reopDen,
          observingCount: observingCount,
        };
      }
    }

    if (numPredicate === "doorToSurgeryHours") {
      var doorSum = 0;
      var doorN = 0;
      for (var di = 0; di < eligible.length; di++) {
        var dcap = firstCaptureEpisode(eligible[di]);
        var cir = asArray(eligible[di].cirInPeriod)[0];
        var surgeryIso = cir && (cir.data || cir.startedAt);
        if (!periOutcomeApi) continue;
        var door = periOutcomeApi.computeDoorToSurgeryHours(
          { doorTimeIso: dcap.values.doorTimeIso },
          surgeryIso,
        );
        if (door.hours != null) {
          doorSum += door.hours;
          doorN += 1;
        }
      }
      return {
        observed: doorN ? doorSum / doorN : 0,
        denominator: doorN,
        observingCount: observingCount,
      };
    }

    if (numPredicate === "textbookOutcome") {
      var tbObs = 0;
      var tbDen = 0;
      for (var ti = 0; ti < eligible.length; ti++) {
        var tcap = firstCaptureEpisode(eligible[ti]);
        var readmit = readmissionWithin30Days(eligible[ti]);
        var tb = periOutcomeApi
          ? periOutcomeApi.computeTextbookOutcomeCapture({
              clavienMax: tcap.values.clavienMax,
              clavienUnanswered: tcap.unanswered.indexOf("clavienMax") !== -1,
              unplannedReintervention: tcap.values.unplannedReintervention,
              reinterventionUnanswered:
                tcap.unanswered.indexOf("unplannedReintervention") !== -1,
              readmission30d: readmit.observed > 0,
              death90d: hasDeathInPeriod(eligible[ti]),
            })
          : null;
        if (!tb) continue;
        tbDen += 1;
        if (tb.textbookOutcome) tbObs += 1;
      }
      return {
        observed: tbObs,
        denominator: tbDen,
        observingCount: observingCount,
      };
    }

    // FEAT-148 — indicadores oncológicos alimentados por facts.capture
    if (numPredicate === "margemR0") {
      var mObs = 0;
      var mDen = 0;
      for (var mi = 0; mi < eligible.length; mi++) {
        var mRes = resolveMarginForCase(eligible[mi]);
        if (mRes.value == null) continue;
        if (mRes.value === "nao_avaliavel") continue;
        mDen += 1;
        if (mRes.value === "r0") mObs += 1;
      }
      return {
        observed: mObs,
        denominator: mDen,
        observingCount: observingCount,
      };
    }

    if (numPredicate === "mdtDiscussed") {
      var mdObs = 0;
      var mdDen = 0;
      for (var mdi = 0; mdi < eligible.length; mdi++) {
        var mdCap = firstCaptureEpisode(eligible[mdi]);
        if (mdCap.unanswered.indexOf("mdtDiscussed") !== -1) continue;
        if (
          !Object.prototype.hasOwnProperty.call(mdCap.values, "mdtDiscussed")
        ) {
          continue;
        }
        mdDen += 1;
        if (mdCap.values.mdtDiscussed === true) mdObs += 1;
      }
      return {
        observed: mdObs,
        denominator: mdDen,
        observingCount: observingCount,
      };
    }

    if (numPredicate === "mdtDecisionFollowed") {
      var folObs = 0;
      var folDen = 0;
      for (var fi = 0; fi < eligible.length; fi++) {
        var fCap = firstCaptureEpisode(eligible[fi]);
        if (fCap.values.mdtDiscussed !== true) continue;
        if (
          !Object.prototype.hasOwnProperty.call(
            fCap.values,
            "mdtDecisionFollowed",
          )
        ) {
          continue;
        }
        folDen += 1;
        if (fCap.values.mdtDecisionFollowed === true) folObs += 1;
      }
      return {
        observed: folObs,
        denominator: folDen,
        observingCount: observingCount,
      };
    }

    if (numPredicate === "documented") {
      var stObs = 0;
      for (var si = 0; si < eligible.length; si++) {
        var sCap = firstCaptureEpisode(eligible[si]);
        if (
          str(sCap.values.stageGroup) ||
          (sCap.values.tStage && sCap.values.nStage && sCap.values.mStage)
        ) {
          stObs += 1;
        }
      }
      return {
        observed: stObs,
        denominator: eligible.length,
        observingCount: observingCount,
      };
    }

    if (numPredicate === "ecogRegistered") {
      var ecObs = 0;
      for (var ei = 0; ei < eligible.length; ei++) {
        var eCap = firstCaptureEpisode(eligible[ei]);
        if (
          Object.prototype.hasOwnProperty.call(eCap.values, "ecogScore") &&
          eCap.unanswered.indexOf("ecogScore") === -1
        ) {
          ecObs += 1;
        }
      }
      return {
        observed: ecObs,
        denominator: eligible.length,
        observingCount: observingCount,
      };
    }

    // FEAT-149 — nefrologia episódica
    if (numPredicate === "nephrotoxinHeld") {
      var nhObs = 0;
      var nhDen = 0;
      for (var nhi = 0; nhi < eligible.length; nhi++) {
        var nhCap = firstCaptureEpisode(eligible[nhi]);
        if (nhCap.unanswered.indexOf("nephrotoxinSuspended") !== -1) continue;
        if (
          !Object.prototype.hasOwnProperty.call(
            nhCap.values,
            "nephrotoxinSuspended",
          )
        ) {
          continue;
        }
        if (str(nhCap.values.nephrotoxinSuspended) === "not_applicable") {
          continue;
        }
        nhDen += 1;
        if (
          followupApi &&
          followupApi.nephrotoxinHeldFromCapture(nhCap.values)
        ) {
          nhObs += 1;
        }
      }
      return {
        observed: nhObs,
        denominator: nhDen,
        observingCount: observingCount,
      };
    }

    if (numPredicate === "contrastAssociatedAki") {
      var caObs = 0;
      var caDen = 0;
      var windowH =
        followupApi && followupApi.CONTRAST_AKI_WINDOW_HOURS
          ? followupApi.CONTRAST_AKI_WINDOW_HOURS
          : 72;
      for (var cai = 0; cai < eligible.length; cai++) {
        var caFacts = eligible[cai];
        var caCap = firstCaptureEpisode(caFacts);
        caDen += 1;
        var contrastAt = str(caCap.values.contrastExamAtIso);
        var akiAt = akiOnsetFromFacts(caFacts);
        if (
          contrastAt &&
          akiAt &&
          followupApi &&
          followupApi.isContrastAssociatedAki({
            contrastExamAtIso: contrastAt,
            akiOnsetAtIso: akiAt,
            windowHours: windowH,
          })
        ) {
          caObs += 1;
        }
      }
      return {
        observed: caObs,
        denominator: caDen,
        observingCount: observingCount,
        referenceId:
          followupApi && followupApi.CONTRAST_AKI_REFERENCE_ID
            ? followupApi.CONTRAST_AKI_REFERENCE_ID
            : "contrast-aki-window-72h",
      };
    }

    // FEAT-149 — seguimento longitudinal (NEF-OUT-03 / CAD-OUT-03)
    if (
      numPredicate === "egfrStageProgressed" ||
      numPredicate === "decompensationFree" ||
      denSource === "facts.longitudinalFollowup"
    ) {
      var milestones = [];
      for (var lmi = 0; lmi < eligible.length; lmi++) {
        var lf =
          eligible[lmi] && eligible[lmi].longitudinalFollowup
            ? eligible[lmi].longitudinalFollowup.milestones
            : null;
        milestones = milestones.concat(asArray(lf));
      }
      var careLineWant = str(indicator && indicator.careLineId);
      milestones = milestones.filter(function (m) {
        return !careLineWant || str(m.careLineId) === careLineWant;
      });
      var cohort =
        followupApi && typeof followupApi.computeMilestoneCohort === "function"
          ? followupApi.computeMilestoneCohort(milestones, {
              nowIso: asOfDate || new Date().toISOString().slice(0, 10),
            })
          : {
              cumprido: 0,
              emAberto: 0,
              perdido: 0,
              denominator: 0,
              lostShare: 0,
              degrade: false,
            };
      var numObs = 0;
      for (var mci = 0; mci < milestones.length; mci++) {
        var mrec = milestones[mci];
        if (!mrec || !str(mrec.respondedAtIso)) continue;
        var vals = mrec.values || {};
        if (numPredicate === "egfrStageProgressed") {
          if (vals.egfrStageProgressed === true) numObs += 1;
          else if (
            vals.baselineEgfrStage &&
            vals.egfrStageAtMilestone &&
            str(vals.baselineEgfrStage) !== str(vals.egfrStageAtMilestone) &&
            EGFR_STAGE_RANK[str(vals.egfrStageAtMilestone)] >
              EGFR_STAGE_RANK[str(vals.baselineEgfrStage)]
          ) {
            numObs += 1;
          }
        } else if (numPredicate === "decompensationFree") {
          if (str(vals.decompensationEvent) === "nenhum") numObs += 1;
        }
      }
      return {
        observed: numObs,
        denominator: cohort.denominator,
        observingCount: cohort.emAberto,
        cumprido: cohort.cumprido,
        emAberto: cohort.emAberto,
        perdido: cohort.perdido,
        lostShare: cohort.lostShare,
        milestoneDegrade: !!cohort.degrade,
      };
    }

    if (EPISODE_LEVEL_PREDICATES[numPredicate]) {
      var fn = EPISODE_LEVEL_PREDICATES[numPredicate];
      var observed = 0;
      var denominator = 0;
      for (var i = 0; i < eligible.length; i++) {
        var r = fn(eligible[i]);
        observed += r.observed;
        denominator += r.denominator;
      }
      return {
        observed: observed,
        denominator: denominator,
        observingCount: observingCount,
      };
    }

    var denominatorAll = eligible.length;

    if (COVERAGE_PREDICATES[numPredicate]) {
      var covFn = COVERAGE_PREDICATES[numPredicate];
      var covObserved = 0;
      for (var c = 0; c < eligible.length; c++) {
        covObserved += covFn(eligible[c]);
      }
      return {
        observed: covObserved,
        denominator: denominatorAll,
        observingCount: observingCount,
      };
    }

    if (CASE_LEVEL_PREDICATES[numPredicate]) {
      var caseFn = CASE_LEVEL_PREDICATES[numPredicate];
      var caseObserved = 0;
      for (var k = 0; k < eligible.length; k++) {
        if (caseFn(eligible[k])) caseObserved += 1;
      }
      return {
        observed: caseObserved,
        denominator: denominatorAll,
        observingCount: observingCount,
      };
    }

    // Predicado ainda não implementado nesta fase — inclui o indicador,
    // sem contagem, nunca lança (determinismo: CPIAGG-AC-01).
    return {
      observed: 0,
      denominator: denSource ? denominatorAll : 0,
      observingCount: observingCount,
    };
  }

  /**
   * @param {object} indicator
   * @param {object[]} lineCases
   * @param {number} minDenominator
   */
  function buildProvenance(indicator, resolved) {
    if (!indicator || indicator.expectedRate == null) {
      return {
        noReference: true,
        referenceId: null,
        referenceSource: null,
        referenceYear: null,
        referencePopulation: null,
        referenceCitation: null,
        referenceRange: null,
        stale: false,
        populationFit: null,
        populationFitReason: null,
      };
    }
    if (!resolved || !resolved.entry) {
      return {
        noReference: true,
        referenceId:
          indicator.expectedRate && indicator.expectedRate.referenceId
            ? str(indicator.expectedRate.referenceId)
            : null,
        referenceSource: null,
        referenceYear: null,
        referencePopulation: null,
        referenceCitation: null,
        referenceRange: null,
        stale: false,
        populationFit: indicator.expectedRate
          ? str(indicator.expectedRate.populationFit || "") || null
          : null,
        populationFitReason: indicator.expectedRate
          ? indicator.expectedRate.populationFitReason || null
          : null,
      };
    }
    var entry = resolved.entry;
    return {
      noReference: false,
      referenceId: resolved.referenceId,
      referenceSource: entry.source != null ? str(entry.source) : null,
      referenceYear: entry.year != null ? Number(entry.year) : null,
      referencePopulation:
        entry.population != null ? str(entry.population) : null,
      referenceCitation: entry.citation != null ? str(entry.citation) : null,
      referenceRange: Array.isArray(resolved.range)
        ? resolved.range.slice()
        : null,
      stale: !!resolved.stale,
      populationFit: resolved.populationFit || null,
      populationFitReason: resolved.populationFitReason || null,
    };
  }

  /**
   * FEAT-129 — fim do período agregado (`asOf`), nunca a data corrente.
   * @param {object} opts
   * @returns {string|null}
   */
  function resolveAsOfFromOptions(opts) {
    if (opts.asOf != null && str(opts.asOf).trim()) {
      var direct = str(opts.asOf).trim().slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) return direct;
    }
    var period = opts.period;
    if (period && typeof period === "object" && period.to != null) {
      var to = str(period.to).trim().slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(to)) return to;
    }
    if (
      periodRangeApi &&
      typeof periodRangeApi.resolvePeriodRange === "function" &&
      (typeof period === "string" || period == null)
    ) {
      try {
        var range = periodRangeApi.resolvePeriodRange(period, opts.clockAsOf);
        if (range && range.to) return str(range.to).slice(0, 10);
      } catch (_e) {
        /* fall through */
      }
    }
    return null;
  }

  function periCaptureFeedsIndicator(ind) {
    var id = str(ind && ind.id);
    if (!id) return false;
    if (
      id === "CG-obs-SAF-02" ||
      id === "CAD-SAF-01" ||
      id === "CAD-eso-SAF-01" ||
      id === "CAD-SAF-02" ||
      id === "CAD-VAL-02" ||
      id === "CG-obs-PRO-01" ||
      id === "CAD-VAL-01" ||
      id === "CAD-PRO-02" ||
      id === "CAD-PRO-03" ||
      id === "CAD-PRO-04" ||
      id === "CAD-PRO-05" ||
      id === "CAD-eso-PRO-01" ||
      id === "NEF-PRO-02" ||
      id === "NEF-SAF-02"
    ) {
      return true;
    }
    return /^CG-(ape|col|her)-(SAF-01|VAL-01)$/.test(id);
  }

  function periCaptureSource(ind, lineCases) {
    if (!periCaptureFeedsIndicator(ind)) return null;
    var list = asArray(lineCases);
    for (var i = 0; i < list.length; i++) {
      if (resolveClavienForCase(list[i]).source === "capture") return "capture";
      var cap = firstCaptureEpisode(list[i]);
      if (
        Object.prototype.hasOwnProperty.call(cap.values, "doorTimeIso") ||
        Object.prototype.hasOwnProperty.call(
          cap.values,
          "unplannedReintervention",
        )
      ) {
        return "capture";
      }
    }
    return null;
  }

  function lineHasCaptureForBlocked(ind, lineCases) {
    var id = str(ind && ind.id);
    var list = asArray(lineCases);
    for (var i = 0; i < list.length; i++) {
      var cap = firstCaptureEpisode(list[i]);
      if (id === "CAD-VAL-02") {
        if (caseHasCaptureClavien(list[i])) return true;
        if (
          Object.prototype.hasOwnProperty.call(
            cap.values,
            "unplannedReintervention",
          ) ||
          cap.unanswered.indexOf("unplannedReintervention") !== -1
        ) {
          return true;
        }
      }
      if (id === "CG-obs-PRO-01" && str(cap.values.doorTimeIso)) return true;
    }
    return false;
  }

  function computePerioperativeBlocked(
    ind,
    lineCases,
    minDenominator,
    asOfDate,
    registry,
    indicatorsAll,
  ) {
    var id = str(ind && ind.id);
    if (id === "CAD-VAL-02" || id === "CG-obs-PRO-01") {
      if (!lineHasCaptureForBlocked(ind, lineCases)) return null;
      var result = computeIndicatorResult(
        ind,
        lineCases,
        minDenominator,
        asOfDate,
        registry,
      );
      var statusOut = "feasible";
      var degradeReasonOut;
      var captureDegrade =
        dataQualityApi &&
        typeof dataQualityApi.degradeByCaptureCoverage === "function"
          ? dataQualityApi.degradeByCaptureCoverage(
              Object.assign({}, ind, { status: "feasible" }),
              lineCases,
            )
          : null;
      if (captureDegrade) {
        statusOut = "partial";
        degradeReasonOut = "capture_coverage";
      }
      return {
        id: id,
        label: str(ind.label),
        dimension: str(ind.dimension),
        status: statusOut,
        direction: str(ind.direction) || "lower_is_better",
        source: "capture",
        observed: result.observed,
        expected: result.expected,
        ratio: result.ratio,
        ci95: result.ci95,
        significant: result.significant,
        suppressed: result.suppressed,
        missingFields: [],
        n: result.denominator,
        denominator: result.denominator,
        observingCount: result.observingCount || 0,
        degradeReason: degradeReasonOut,
        referenceId:
          id === "CAD-VAL-02" ? "textbook-outcome-perioperative-v1" : null,
      };
    }

    if (/^CG-(ape|col|her)-VAL-01$/.test(id) && periOutcomeApi) {
      var safId = id.replace("VAL-01", "SAF-01");
      var safInd = null;
      var list = asArray(indicatorsAll);
      for (var s = 0; s < list.length; s++) {
        if (str(list[s] && list[s].id) === safId) {
          safInd = list[s];
          break;
        }
      }
      if (!safInd) return null;
      var resolved =
        indicatorApi && typeof indicatorApi.resolveExpectedRate === "function"
          ? indicatorApi.resolveExpectedRate(
              safInd,
              asOfDate ? { asOfDate: asOfDate } : {},
            )
          : null;
      var expectedRate =
        resolved &&
        resolved.value != null &&
        Number.isFinite(Number(resolved.value))
          ? Number(resolved.value)
          : null;
      if (expectedRate == null) return null;
      var safCounts = computeStrataCounts(safInd, lineCases, asOfDate);
      if (!safCounts.denominator) return null;
      var losSum = 0;
      for (var c = 0; c < lineCases.length; c++) {
        var eps = asArray(lineCases[c] && lineCases[c].hospEpisodes);
        for (var e = 0; e < eps.length; e++) {
          if (eps[e] && eps[e].losDays != null) {
            losSum += Number(eps[e].losDays) || 0;
          }
        }
      }
      var avoided = periOutcomeApi.computeAvoidedComplicationsPerLosDay({
        expectedRate: expectedRate,
        observedRate: safCounts.observed / safCounts.denominator,
        closedEpisodeCount: safCounts.denominator,
        sumLosDays: losSum,
        saf01Feasible: str(safInd.status) === "feasible",
      });
      if (!avoided || avoided.value == null) return null;
      return {
        id: id,
        label: str(ind.label),
        dimension: str(ind.dimension),
        status: "feasible",
        direction: str(ind.direction) || "higher_is_better",
        source: "capture",
        observed: avoided.value,
        expected: undefined,
        ratio: null,
        ci95: null,
        significant: false,
        suppressed: false,
        missingFields: [],
        observingCount: safCounts.observingCount || 0,
      };
    }

    return null;
  }

  function computeIndicatorResult(
    indicator,
    lineCases,
    minDenominator,
    asOfDate,
    registry,
  ) {
    var counts = computeStrataCounts(indicator, lineCases, asOfDate);
    var milestoneFields = {
      cumprido: counts.cumprido,
      emAberto: counts.emAberto,
      perdido: counts.perdido,
      lostShare: counts.lostShare,
      milestoneDegrade: counts.milestoneDegrade,
    };
    var resolveOpts = {};
    if (asOfDate) resolveOpts.asOfDate = asOfDate;
    if (registry) resolveOpts.registry = registry;
    var resolved =
      indicatorApi && typeof indicatorApi.resolveExpectedRate === "function"
        ? indicatorApi.resolveExpectedRate(indicator, resolveOpts)
        : null;
    var expectedRateValue =
      resolved &&
      resolved.value != null &&
      Number.isFinite(Number(resolved.value))
        ? Number(resolved.value)
        : null;
    var provenance = buildProvenance(indicator, resolved);

    if (counts.denominator < minDenominator) {
      return Object.assign(
        {
          suppressed: true,
          reason: "small_n",
          observed: undefined,
          expected: undefined,
          ratio: null,
          ci95: null,
          significant: false,
          // Denominador NÃO exposto aqui: é o próprio valor suprimido por
          // n pequeno (< minDenominator) — publicá-lo devolveria pela porta
          // dos fundos a contagem exacta que a supressão existe para
          // esconder (mesmo risco de reidentificação que observed/expected).
          denominator: undefined,
          observingCount: counts.observingCount || 0,
        },
        milestoneFields,
        provenance,
      );
    }

    if (expectedRateValue == null || !riskAdjustApi) {
      return Object.assign(
        {
          suppressed: false,
          reason: null,
          observed: counts.observed,
          expected: null,
          ratio: null,
          ci95: null,
          significant: false,
          denominator: counts.denominator,
          observingCount: counts.observingCount || 0,
        },
        milestoneFields,
        provenance,
      );
    }

    var strata = [
      {
        key: "all",
        observed: counts.observed,
        denominator: counts.denominator,
        expectedRate: expectedRateValue,
      },
    ];
    var oe = riskAdjustApi.computeObservedExpected({
      strata: strata,
      minDenominator: minDenominator,
      direction: indicator.direction,
    });

    return Object.assign(
      {
        suppressed: !!oe.suppressed,
        reason: oe.reason || null,
        observed: oe.suppressed ? undefined : oe.observed,
        expected: oe.suppressed ? undefined : oe.expected,
        ratio: oe.ratio,
        ci95: oe.ci95 ? [oe.ci95.lower, oe.ci95.upper] : null,
        significant: !!oe.significant,
        denominator: counts.denominator,
        observingCount: counts.observingCount || 0,
      },
      milestoneFields,
      provenance,
    );
  }

  /**
   * FEAT-127 (CPIVAL-AC-05): estado de validação do modelo de risco de um
   * indicador nesta linha. Procura primeiro a chave `modelo@linha` — a
   * validação é por população, e um modelo validado numa linha não o está
   * noutra; a chave só do modelo é o fallback.
   *
   * @param {Record<string, string|{ status?: string }>|null|undefined} map
   * @param {string} riskModel
   * @param {string} careLineId
   * @returns {string|null}
   */
  function validationStatusFor(map, riskModel, careLineId) {
    if (!map || typeof map !== "object" || !riskModel) return null;
    var scoped = map[riskModel + "@" + careLineId];
    var entry = scoped !== undefined ? scoped : map[riskModel];
    if (entry == null) return null;
    if (typeof entry === "object") {
      return entry.status != null ? str(entry.status) : null;
    }
    return str(entry) || null;
  }

  /**
   * FEAT-127 (CPIVAL-AC-06): cobertura do escore publicável no cartão — só a
   * fracção agregada, nunca contagens de doente (CPIVAL-AC-11).
   * @param {Record<string, unknown>|null|undefined} map
   * @param {string} riskModel
   * @param {string} careLineId
   * @returns {number|null}
   */
  function validationCoverageShareFor(map, riskModel, careLineId) {
    if (!map || typeof map !== "object" || !riskModel) return null;
    var scoped = map[riskModel + "@" + careLineId];
    var entry = scoped !== undefined ? scoped : map[riskModel];
    if (!entry || typeof entry !== "object") return null;
    var coverage = entry.coverage;
    if (!coverage || typeof coverage !== "object") return null;
    return coverage.share != null ? Number(coverage.share) : null;
  }

  /** FEAT-136 — janela do snapshot injectado (CPIMOD-AC-14). */
  function validationWindowFor(map, riskModel, careLineId) {
    if (!map || typeof map !== "object" || !riskModel) return null;
    var scoped = map[riskModel + "@" + careLineId];
    var entry = scoped !== undefined ? scoped : map[riskModel];
    if (!entry || typeof entry !== "object") return null;
    var from = entry.windowFrom != null ? str(entry.windowFrom) : "";
    var to = entry.windowTo != null ? str(entry.windowTo) : "";
    if (!from && !to) return null;
    return { from: from || null, to: to || null };
  }

  /**
   * Resumo publicável da validação — só estado, cobertura e métricas de topo,
   * nunca casos. Alimenta o export (`cpi-export.js`) sem PHI.
   * @param {Record<string, unknown>|null|undefined} map
   */
  function summarizeModelValidation(map) {
    if (!map || typeof map !== "object") return [];
    var keys = Object.keys(map).sort();
    var out = [];
    for (var i = 0; i < keys.length; i++) {
      var entry = map[keys[i]];
      if (entry == null) continue;
      if (typeof entry !== "object") {
        out.push({ key: keys[i], status: str(entry) });
        continue;
      }
      var coverage = entry.coverage || {};
      var calibration = entry.calibration || {};
      var discrimination = entry.discrimination || {};
      out.push({
        key: keys[i],
        model: entry.model != null ? str(entry.model) : null,
        careLineId: entry.careLineId != null ? str(entry.careLineId) : null,
        outcome: entry.outcome != null ? str(entry.outcome) : null,
        status: entry.status != null ? str(entry.status) : null,
        statusReason: entry.statusReason != null ? str(entry.statusReason) : null,
        coverageShare: coverage.share != null ? Number(coverage.share) : null,
        n: entry.n != null ? Number(entry.n) : null,
        events: entry.events != null ? Number(entry.events) : null,
        calibrationSlope:
          calibration.slope != null ? Number(calibration.slope) : null,
        calibrationSlopeCi95: Array.isArray(calibration.slopeCi95)
          ? calibration.slopeCi95.slice()
          : null,
        calibrationIntercept:
          calibration.intercept != null ? Number(calibration.intercept) : null,
        calibrationInterceptCi95: Array.isArray(calibration.interceptCi95)
          ? calibration.interceptCi95.slice()
          : null,
        biasDirection:
          calibration.biasDirection != null
            ? str(calibration.biasDirection)
            : null,
        cStatistic:
          discrimination.cStatistic != null
            ? Number(discrimination.cStatistic)
            : null,
        cCi95: Array.isArray(discrimination.cCi95)
          ? discrimination.cCi95.slice()
          : null,
        chanceLevel: discrimination.chanceLevel === true,
        brier: discrimination.brier != null ? Number(discrimination.brier) : null,
      });
    }
    return out;
  }

  function blockedMissingFields(indicator) {
    var declared = asArray(indicator.missingFields);
    if (declared.length) return declared.slice();
    return asArray(indicator.requiredFacts).slice();
  }

  /**
   * Janela a que um facto pertence (FEAT-126). O caller marca `cpiPeriodLabel`
   * quando já sabe a janela; senão classifica-se pela data-âncora do caso.
   * @param {object} caseFacts
   * @param {Array<{ from: string, to: string, label: string }>} periods
   * @returns {string|null} label da janela, ou null se fora de todas
   */
  function periodLabelForFact(caseFacts, periods) {
    if (!caseFacts) return null;
    var declared = str(caseFacts.cpiPeriodLabel).trim();
    if (declared) {
      for (var d = 0; d < periods.length; d++) {
        if (periods[d].label === declared) return declared;
      }
      return null;
    }
    var anchor =
      caseFacts.anchorDate != null ? caseFacts.anchorDate : caseFacts.cpiAnchorDate;
    if (anchor == null) return null;
    for (var i = 0; i < periods.length; i++) {
      var range = { from: periods[i].from, to: periods[i].to };
      var inRange =
        periodRangeApi && typeof periodRangeApi.isDateInPeriod === "function"
          ? periodRangeApi.isDateInPeriod(anchor, range)
          : str(anchor).slice(0, 10) >= range.from &&
            str(anchor).slice(0, 10) <= range.to;
      if (inRange) return periods[i].label;
    }
    return null;
  }

  /**
   * FEAT-126: agregação por N janelas consecutivas numa passagem sobre
   * `facts[]`. Percorrer a coorte uma vez por período multiplicaria o custo
   * sobre factos que já estão em memória; a continuidade das janelas é
   * validada antes de qualquer contagem (CPITRD-AC-01).
   * @param {object[]} factsList
   * @param {object} opts
   */
  function aggregateByPeriods(factsList, opts) {
    if (!trendApi || typeof trendApi.assertConsecutivePeriods !== "function") {
      throw new Error(
        "cpi-dashboard-aggregate: periods[] exige lib/cpi-trend.js carregado",
      );
    }
    var periods = trendApi.assertConsecutivePeriods(opts.periods);

    var buckets = {};
    for (var p = 0; p < periods.length; p++) buckets[periods[p].label] = [];

    var unclassified = 0;
    for (var i = 0; i < factsList.length; i++) {
      var label = periodLabelForFact(factsList[i], periods);
      if (!label) {
        unclassified += 1;
        continue;
      }
      buckets[label].push(factsList[i]);
    }

    var singleOpts = {};
    for (var k in opts) {
      if (Object.prototype.hasOwnProperty.call(opts, k) && k !== "periods") {
        singleOpts[k] = opts[k];
      }
    }

    var byPeriod = {};
    var classified = 0;
    for (var w = 0; w < periods.length; w++) {
      var period = periods[w];
      var bucket = buckets[period.label];
      classified += bucket.length;
      singleOpts.period = period;
      byPeriod[period.label] = aggregateCpi(bucket, singleOpts);
    }

    return {
      matchVersion:
        careLinesApi && careLinesApi.MATCH_VERSION != null
          ? careLinesApi.MATCH_VERSION
          : null,
      periods: periods,
      byPeriod: byPeriod,
      cohort: {
        nTotal: factsList.length,
        nClassified: classified,
        nUnclassified: unclassified,
      },
    };
  }

  /**
   * @param {object[]|null|undefined} facts — array de `extractPatientFacts`-like
   * @param {{
   *   period?: string|object|null,
   *   periods?: Array<{ from: string, to: string, label: string }>,
   *   careLineIds?: string[],
   *   minDenominator?: number,
   *   riskModelValidation?: Record<string, string|object>,
   *   riskModelDrift?: object|object[],
   *   driftAsOfPeriod?: string,
   *   governanceLog?: ReadonlyArray<object>|null
   * }|null|undefined} options
   * @returns {object}
   */
  function aggregateCpi(facts, options) {
    var opts = options && typeof options === "object" ? options : {};

    // FEAT-126: `periods[]` devolve a série por janela; `period` singular
    // continua a ser o retrato de um período.
    if (Array.isArray(opts.periods) && opts.periods.length > 0) {
      return aggregateByPeriods(asArray(facts), opts);
    }

    // FEAT-131 (CPIDRF-AC-06): fundir deriva no mapa de validação — o caminho
    // de degradação continua a ser o da FEAT-127 (`not_validated` → partial).
    var riskModelValidation = opts.riskModelValidation;
    var driftResults = asArray(opts.riskModelDrift);
    if (
      driftResults.length > 0 &&
      modelDriftApi &&
      typeof modelDriftApi.toValidationMap === "function"
    ) {
      riskModelValidation = Object.assign({}, riskModelValidation || {});
      for (var di = 0; di < driftResults.length; di++) {
        var driftMap = modelDriftApi.toValidationMap(driftResults[di], {
          asOfPeriod: opts.driftAsOfPeriod,
        });
        for (var dk in driftMap) {
          if (Object.prototype.hasOwnProperty.call(driftMap, dk)) {
            riskModelValidation[dk] = driftMap[dk];
          }
        }
      }
    }
    // Shadow opts.riskModelValidation for the rest of this call.
    opts = Object.assign({}, opts, { riskModelValidation: riskModelValidation });

    var minDenominator =
      opts.minDenominator == null
        ? DEFAULT_MIN_DENOMINATOR
        : num(opts.minDenominator);
    var careLineFilter = Array.isArray(opts.careLineIds)
      ? opts.careLineIds.map(str)
      : null;

    var factsList = asArray(facts);
    var asOfDate = resolveAsOfFromOptions(opts);
    if (asArray(opts.captureRows).length) {
      attachCaptureToFacts(factsList, opts.captureRows);
      attachLongitudinalFollowupToFacts(factsList, opts.captureRows);
    }
    if (asArray(opts.longitudinalRows).length) {
      attachLongitudinalFollowupToFacts(factsList, opts.longitudinalRows);
    }
    if (
      periSchemaApi &&
      typeof periSchemaApi.registerPerioperativeSchemas === "function"
    ) {
      periSchemaApi.registerPerioperativeSchemas();
    }
    if (
      oncoSchemaApi &&
      typeof oncoSchemaApi.registerOncologySchemas === "function"
    ) {
      oncoSchemaApi.registerOncologySchemas();
    }
    if (
      nephroCaptureApi &&
      typeof nephroCaptureApi.registerNephrologicSchemas === "function"
    ) {
      nephroCaptureApi.registerNephrologicSchemas();
    }

    // FEAT-129 — configuração vigente no fim do período (CPICFG-AC-01..07).
    // Sem asOf e sem registo: catálogo em memória, applied: false.
    var effective = null;
    var publishedEffective = null;
    if (
      effectiveConfigApi &&
      typeof effectiveConfigApi.resolveEffectiveConfig === "function" &&
      asOfDate
    ) {
      effective = effectiveConfigApi.resolveEffectiveConfig({
        asOf: asOfDate,
        governanceLog: opts.governanceLog,
        careLines:
          opts.careLines != null
            ? opts.careLines
            : careLinesApi && careLinesApi.CARE_LINES,
        indicatorLibrary:
          opts.indicatorLibrary != null
            ? opts.indicatorLibrary
            : indicatorApi && indicatorApi.INDICATORS,
        referenceRegistry:
          opts.referenceRegistry != null
            ? opts.referenceRegistry
            : referenceRegistryApi && referenceRegistryApi.REGISTRY,
      });
      publishedEffective =
        typeof effectiveConfigApi.publishEffectiveConfig === "function"
          ? effectiveConfigApi.publishEffectiveConfig(effective)
          : null;
    }

    var catalog = effective
      ? asArray(effective.careLines)
      : careLinesApi && Array.isArray(careLinesApi.CARE_LINES)
        ? careLinesApi.CARE_LINES
        : asArray(opts.careLines);
    var matchVersion =
      careLinesApi && careLinesApi.MATCH_VERSION != null
        ? careLinesApi.MATCH_VERSION
        : null;
    var indicatorsAll = effective
      ? asArray(effective.indicatorLibrary)
      : indicatorApi && Array.isArray(indicatorApi.INDICATORS)
        ? indicatorApi.INDICATORS
        : asArray(opts.indicatorLibrary);
    var registryForResolve = effective
      ? effective.referenceRegistry
      : opts.referenceRegistry != null
        ? opts.referenceRegistry
        : referenceRegistryApi && referenceRegistryApi.REGISTRY;

    var nTotal = factsList.length;
    var casesByLine = {};
    var unattributedCount = 0;

    for (var i = 0; i < factsList.length; i++) {
      var caseFacts = factsList[i];
      var attribution =
        careLinesApi && typeof careLinesApi.attributeCareLines === "function"
          ? careLinesApi.attributeCareLines(caseFacts)
          : { unattributed: true, careLines: [] };

      if (attribution.unattributed) {
        unattributedCount += 1;
        continue;
      }

      var hits = asArray(attribution.careLines);
      for (var h = 0; h < hits.length; h++) {
        var lineId = str(hits[h] && hits[h].careLineId);
        if (!lineId) continue;
        if (!casesByLine[lineId]) casesByLine[lineId] = [];
        casesByLine[lineId].push(caseFacts);
      }
    }

    var careLinesOut = [];
    for (var l = 0; l < catalog.length; l++) {
      var line = catalog[l];
      if (!line || !line.id) continue;
      var lineIdStr = str(line.id);
      if (careLineFilter && careLineFilter.indexOf(lineIdStr) === -1) continue;
      // FEAT-124 (CPIEXP-AC-02): só lifecycle active publica indicadores.
      // candidate/retired (ou lifecycle explícito ≠ active) ficam de fora do painel.
      // Sem lifecycle (stubs de teste legado) continua a publicar.
      var life = line.lifecycle != null ? str(line.lifecycle) : "";
      if (life && life !== "active") continue;

      var lineCases = casesByLine[lineIdStr] || [];
      if (lineCases.length === 0) continue;

      var lineIndicators =
        indicatorApi && typeof indicatorApi.listIndicators === "function"
          ? indicatorApi.listIndicators(lineIdStr, { indicators: indicatorsAll })
          : [];

      var indicatorsOut = [];
      for (var ix = 0; ix < lineIndicators.length; ix++) {
        var ind = lineIndicators[ix];
        if (!ind || !ind.id) continue;

        if (str(ind.status) === "blocked") {
          var periBlocked = computePerioperativeBlocked(
            ind,
            lineCases,
            minDenominator,
            asOfDate,
            registryForResolve,
            indicatorsAll,
          );
          if (periBlocked) {
            indicatorsOut.push(periBlocked);
            continue;
          }
          // FEAT-123 (CPIDQ-AC-07..09): ponte HPB só promove indicadores com
          // hpbIndicatorKey quando o workspace tem coorte HPB; sem coorte,
          // permanece blocked — nunca soma a coorte HPB à automática.
          var hpbResolved =
            ind.hpbIndicatorKey && hpbBridgeApi
              ? hpbBridgeApi.resolveHpbIndicator(ind, opts.hpbCohort)
              : null;
          if (hpbResolved && hpbResolved.status === "feasible") {
            indicatorsOut.push({
              id: str(ind.id),
              label: str(ind.label),
              dimension: str(ind.dimension),
              status: "feasible",
              direction: str(ind.direction) || "lower_is_better",
              source: "hpb",
              denominatorCohort: "hpb",
              observed: hpbResolved.value,
              expected: undefined,
              ratio: null,
              ci95: null,
              significant: false,
              suppressed: false,
              missingFields: [],
              n: hpbResolved.n,
            });
            continue;
          }

          indicatorsOut.push({
            id: str(ind.id),
            label: str(ind.label),
            dimension: str(ind.dimension),
            status: "blocked",
            direction: str(ind.direction) || "lower_is_better",
            observed: undefined,
            expected: undefined,
            ratio: null,
            ci95: null,
            significant: false,
            suppressed: false,
            missingFields: blockedMissingFields(ind),
          });
          continue;
        }

        var result = computeIndicatorResult(
          ind,
          lineCases,
          minDenominator,
          asOfDate,
          registryForResolve,
        );
        // FEAT-123 (CPIDQ-AC-05): cobertura do modelo de risco < 50% degrada
        // feasible → partial, com degradeReason específico e legível.
        var degrade =
          dataQualityApi && typeof dataQualityApi.degradeByCoverage === "function"
            ? dataQualityApi.degradeByCoverage(
                { riskModel: ind.riskModel, status: ind.status },
                lineCases,
              )
            : null;
        var captureDegrade =
          dataQualityApi &&
          typeof dataQualityApi.degradeByCaptureCoverage === "function"
            ? dataQualityApi.degradeByCaptureCoverage(
                periCaptureFeedsIndicator(ind)
                  ? Object.assign({}, ind, { status: "feasible" })
                  : ind,
                lineCases,
              )
            : null;
        var statusOut = degrade ? degrade.status : str(ind.status) || "feasible";
        var degradeReasons = [];
        if (degrade && degrade.degradeReason) {
          degradeReasons.push(str(degrade.degradeReason));
        }
        var degradedFromOut = degrade ? degrade.degradedFrom : undefined;
        if (captureDegrade) {
          if (statusOut !== "partial") degradedFromOut = statusOut;
          statusOut = captureDegrade.status;
          if (degradeReasons.indexOf("capture_coverage") === -1) {
            degradeReasons.push("capture_coverage");
          }
        }

        function pushDegrade(reason) {
          var r = str(reason).trim();
          if (!r) return;
          if (degradeReasons.indexOf(r) === -1) degradeReasons.push(r);
        }

        // CPIREF-AC-06: populationFit mismatch → partial
        if (
          result.populationFit === "mismatch" &&
          statusOut !== "blocked" &&
          !result.suppressed
        ) {
          if (statusOut !== "partial") {
            degradedFromOut = statusOut;
          }
          statusOut = "partial";
          pushDegrade(
            result.populationFitReason ||
              "população da referência em desajuste com a coorte",
          );
        }
        // CPICFG-AC-04: referência vencida na data do período → partial, com
        // razão que nomeia a referência e o ano. Coexiste com outras razões.
        if (result.stale && statusOut !== "blocked" && !result.suppressed) {
          if (statusOut !== "partial") degradedFromOut = statusOut;
          statusOut = "partial";
          var staleMeta = {
            referenceId: result.referenceId,
            year: result.referenceYear,
            staleAfterYears: null,
          };
          if (
            result.referenceId &&
            registryForResolve &&
            Array.isArray(registryForResolve.entries)
          ) {
            for (var se = 0; se < registryForResolve.entries.length; se++) {
              var sentry = registryForResolve.entries[se];
              if (sentry && str(sentry.id) === str(result.referenceId)) {
                staleMeta.year =
                  sentry.year != null ? Number(sentry.year) : staleMeta.year;
                staleMeta.staleAfterYears =
                  sentry.staleAfterYears != null
                    ? Number(sentry.staleAfterYears)
                    : 7;
                break;
              }
            }
          }
          pushDegrade(
            effectiveConfigApi &&
              typeof effectiveConfigApi.staleDegradeReason === "function"
              ? effectiveConfigApi.staleDegradeReason(staleMeta)
              : "referência " +
                  str(result.referenceId) +
                  " vencida (staleAfterYears)",
          );
        }
        // CPIVAL-AC-05: modelo de risco não validado nesta população degrada o
        // indicador que dele depende para `partial` com a razão nomeada. Não
        // esconde — esconder faria a linha parecer sem cobertura; o que se
        // quer é o número à vista com o denominador por verificar.
        var indRiskModel = str(ind.riskModel);
        var validationStatusOut = indRiskModel
          ? validationStatusFor(opts.riskModelValidation, indRiskModel, lineIdStr)
          : null;
        var riskModelCoverageShare = null;
        var validationWindow = null;
        if (indRiskModel) {
          riskModelCoverageShare = validationCoverageShareFor(
            opts.riskModelValidation,
            indRiskModel,
            lineIdStr,
          );
          validationWindow = validationWindowFor(
            opts.riskModelValidation,
            indRiskModel,
            lineIdStr,
          );
          if (
            riskModelCoverageShare == null &&
            dataQualityApi &&
            typeof dataQualityApi.measureRiskModelCoverage === "function"
          ) {
            riskModelCoverageShare = dataQualityApi.measureRiskModelCoverage(
              lineCases,
              indRiskModel,
            );
          }
        }
        if (
          validationStatusOut === NOT_VALIDATED &&
          statusOut !== "blocked" &&
          !result.suppressed
        ) {
          if (statusOut !== "partial") degradedFromOut = statusOut;
          statusOut = "partial";
          pushDegrade(RISK_MODEL_NOT_VALIDATED_REASON);
        }
        // FEAT-149 CPINEF2-AC-10
        if (
          result.milestoneDegrade &&
          statusOut !== "blocked" &&
          !result.suppressed
        ) {
          if (statusOut !== "partial") degradedFromOut = statusOut;
          statusOut = "partial";
          pushDegrade("milestone_lost_to_followup");
        }
        var degradeReasonOut =
          degradeReasons.length > 0 ? degradeReasons.join("; ") : undefined;
        indicatorsOut.push({
          id: str(ind.id),
          label: str(ind.label),
          dimension: str(ind.dimension),
          status: statusOut,
          direction: str(ind.direction) || "lower_is_better",
          source: periCaptureSource(ind, lineCases) || "auto",
          observed: result.observed,
          observingCount: result.observingCount || 0,
          cumprido: result.cumprido != null ? result.cumprido : undefined,
          emAberto: result.emAberto != null ? result.emAberto : undefined,
          perdido: result.perdido != null ? result.perdido : undefined,
          lostShare: result.lostShare != null ? result.lostShare : undefined,
          expected: result.expected,
          ratio: result.ratio,
          ci95: result.ci95,
          significant: result.significant,
          suppressed: result.suppressed,
          missingFields: [],
          denominator: result.denominator,
          degradedFrom: degradedFromOut,
          degradeReason: degradeReasonOut,
          referenceId: result.referenceId,
          referenceSource: result.referenceSource,
          referenceYear: result.referenceYear,
          referencePopulation: result.referencePopulation,
          referenceCitation: result.referenceCitation,
          referenceRange: result.referenceRange,
          stale: !!result.stale,
          noReference: !!result.noReference,
          populationFit: result.populationFit,
          riskModel: indRiskModel || null,
          validationStatus: validationStatusOut,
          riskModelCoverageShare: riskModelCoverageShare,
          validationWindowFrom: validationWindow ? validationWindow.from : null,
          validationWindowTo: validationWindow ? validationWindow.to : null,
        });
      }

      careLinesOut.push({
        careLineId: lineIdStr,
        label: str(line.label),
        specialty: str(line.specialty),
        n: lineCases.length,
        indicators: indicatorsOut,
      });
    }


    var refIndicatorIds = [];
    for (var ri = 0; ri < careLinesOut.length; ri++) {
      var rinds = asArray(careLinesOut[ri].indicators);
      for (var rj = 0; rj < rinds.length; rj++) {
        if (rinds[rj] && rinds[rj].id) refIndicatorIds.push(str(rinds[rj].id));
      }
    }
    var referencesOut =
      referenceRegistryApi &&
      typeof referenceRegistryApi.exportReferencesInUse === "function"
        ? referenceRegistryApi.exportReferencesInUse(refIndicatorIds)
        : [];

    return {
      matchVersion: matchVersion,
      // Catálogo de referências (CPITRD-AC-09) — independente de decisões de governança.
      registryVersion:
        referenceRegistryApi &&
        referenceRegistryApi.REGISTRY &&
        referenceRegistryApi.REGISTRY.registryVersion != null
          ? Number(referenceRegistryApi.REGISTRY.registryVersion)
          : null,
      // Contagem de decisões aplicadas (CPICFG-AC-10) — causa decision_registry_version.
      decisionRegistryVersion: publishedEffective
        ? publishedEffective.registryVersion
        : 0,
      effectiveConfig: publishedEffective,
      references: referencesOut,
      modelValidation: summarizeModelValidation(opts.riskModelValidation),
      modelDrift: driftResults.length > 0 ? driftResults : undefined,
      period: opts.period || null,
      cohort: {
        nTotal: nTotal,
        nAttributed: nTotal - unattributedCount,
        nUnattributed: unattributedCount,
      },
      careLines: careLinesOut,
      unattributed: {
        total: unattributedCount,
        bySpecialty: unattributedCount > 0 ? { unknown: unattributedCount } : {},
      },
    };
  }

  return {
    DEFAULT_MIN_DENOMINATOR: DEFAULT_MIN_DENOMINATOR,
    RISK_MODEL_NOT_VALIDATED_REASON: RISK_MODEL_NOT_VALIDATED_REASON,
    validationStatusFor: validationStatusFor,
    aggregateCpi: aggregateCpi,
    attachCaptureToFacts: attachCaptureToFacts,
    attachLongitudinalFollowupToFacts: attachLongitudinalFollowupToFacts,
  };
});

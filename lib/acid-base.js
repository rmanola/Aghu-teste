/**
 * Ported from web/lib/patient-records/acid-base.mjs
 * @sync web/lib/patient-records/acid-base.mjs
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.AghuAcidBase = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  function loadMod(r, lib, global) {
    if (r[global]) return r[global];
    if (typeof require === "function") {
      try {
        return require("./" + lib);
      } catch (_e) {}
    }
    return null;
  }

  var _mod_AnionGap = loadMod(root, "anion-gap.js", "AghuAnionGap");
  var computeAnionGap = _mod_AnionGap && _mod_AnionGap.computeAnionGap;



const REF_HCO3 = 24;
const REF_PCO2 = 40;
const REF_AG = 12;
const REF_ALB = 4;

/** Valores de referência gasometria arterial — fonte única para lib e UI. */
const GASOMETRY_REF = {
  ph: { min: 7.35, max: 7.45 },
  pao2MmHg: { min: 80, max: 100 },
  pco2MmHg: { min: 35, max: 45 },
  bicarbonateMEqL: { min: 22, max: 26 },
  sao2Percent: { min: 94, max: 100 },
  baseExcessMEqL: { min: -2, max: 2 },
  anionGapMEqL: { min: 8, max: 12 },
};

/** VR gasometria venosa (faixas do laudo AGHU/HCPA). */
const GASOMETRY_REF_VENOUS = {
  ph: { min: 7.33, max: 7.43 },
  pao2MmHg: { min: 30, max: 50 },
  pco2MmHg: { min: 38, max: 50 },
  bicarbonateMEqL: GASOMETRY_REF.bicarbonateMEqL,
  sao2Percent: { min: 60, max: 85 },
  baseExcessMEqL: GASOMETRY_REF.baseExcessMEqL,
  anionGapMEqL: GASOMETRY_REF.anionGapMEqL,
};

/** @param {"arterial"|"venous"|null|undefined} [channel] */
function getGasometryRef(channel) {
  return channel === "venous" ? GASOMETRY_REF_VENOUS : GASOMETRY_REF;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function computeCorrectedAnionGap(opts) {
  const ag = opts.anionGapMEqL;
  const alb = opts.albuminGDl;
  if (!Number.isFinite(ag) || !Number.isFinite(alb)) {
    throw new Error("invalid_corrected_ag_inputs");
  }
  const corrected = ag + 2.5 * (REF_ALB - alb);
  return {
    anionGapMEqL: ag,
    albuminGDl: alb,
    correctedAnionGapMEqL: round1(corrected),
    albuminCorrection: round1(2.5 * (REF_ALB - alb)),
  };
}

function computeExpectedPco2Winter(bicarbonateMEqL) {
  if (!Number.isFinite(bicarbonateMEqL)) {
    throw new Error("invalid_winter_inputs");
  }
  const expected = 1.5 * bicarbonateMEqL + 8;
  return {
    expectedPco2MmHg: round1(expected),
    rangeLow: round1(expected - 2),
    rangeHigh: round1(expected + 2),
    bicarbonateMEqL,
  };
}

function computeExpectedPco2MetabolicAlkalosis(bicarbonateMEqL) {
  if (!Number.isFinite(bicarbonateMEqL)) {
    throw new Error("invalid_met_alk_inputs");
  }
  const expected = 0.7 * (bicarbonateMEqL - REF_HCO3) + REF_PCO2;
  return {
    expectedPco2MmHg: round1(expected),
    rangeLow: round1(expected - 5),
    rangeHigh: round1(expected + 5),
    bicarbonateMEqL,
  };
}

/** Passos didáticos da regra de Winter para a vista expandida. */
function describeWinterCalculation(winter) {
  if (!winter || !Number.isFinite(winter.bicarbonateMEqL)) {
    return null;
  }
  const hco3MEqL = winter.bicarbonateMEqL;
  return {
    hco3MEqL,
    product: round1(1.5 * hco3MEqL),
    expectedPco2MmHg: winter.expectedPco2MmHg,
    toleranceMmHg: 2,
    rangeLow: winter.rangeLow,
    rangeHigh: winter.rangeHigh,
  };
}

/** Passos didáticos (HCO₃ + 15) para alcalose metabólica compensada. */
function describeMetabolicAlkalosisPco2Calculation(exp) {
  if (!exp || !Number.isFinite(exp.bicarbonateMEqL)) {
    return null;
  }
  return {
    hco3MEqL: exp.bicarbonateMEqL,
    constant: 15,
    expectedPco2MmHg: exp.expectedPco2MmHg,
    toleranceMmHg: 5,
    rangeLow: exp.rangeLow,
    rangeHigh: exp.rangeHigh,
  };
}

function computeExpectedHco3RespAcidosis(pco2MmHg) {
  if (!Number.isFinite(pco2MmHg)) {
    throw new Error("invalid_resp_acid_inputs");
  }
  const delta = pco2MmHg - REF_PCO2;
  const deltaPerTen = delta / 10;
  return {
    acuteMEqL: round1(REF_HCO3 + deltaPerTen),
    chronicMEqL: round1(REF_HCO3 + deltaPerTen * 3.5),
    chronicLowMEqL: round1(REF_HCO3 + deltaPerTen * 3),
    chronicHighMEqL: round1(REF_HCO3 + deltaPerTen * 4),
    pco2MmHg,
  };
}

function computeExpectedHco3RespAlkalosis(pco2MmHg) {
  if (!Number.isFinite(pco2MmHg)) {
    throw new Error("invalid_resp_alk_inputs");
  }
  const delta = REF_PCO2 - pco2MmHg;
  return {
    acuteMEqL: round1(REF_HCO3 - (2 * delta) / 10),
    chronicMEqL: round1(REF_HCO3 - (5 * delta) / 10),
    pco2MmHg,
  };
}

/** Rótulos canônicos Δ/Δ — fonte única para tile, resumo colapsado e vista expandida. */
const DELTA_DELTA_CATEGORY_LABEL = {
  isolatedElevatedAg: "AG aumentado isolada",
  hyperchloremic: "Acidose metabólica hiperclorêmica",
  metabolicAlkalosisOrElevatedBaseline:
    "Alcalose metabólica ou bicarbonato basal previamente elevado",
};

/**
 * Categoria Δ/Δ a partir da razão (limiares: <1, 1–2 inclusive, >2).
 * @param {number | null | undefined} ratio
 * @returns {string | null}
 */
function getDeltaDeltaCategoryLabel(ratio) {
  if (ratio == null || !Number.isFinite(ratio)) {
    return null;
  }
  if (ratio >= 1 && ratio <= 2) {
    return DELTA_DELTA_CATEGORY_LABEL.isolatedElevatedAg;
  }
  if (ratio < 1) {
    return DELTA_DELTA_CATEGORY_LABEL.hyperchloremic;
  }
  if (ratio > 2) {
    return DELTA_DELTA_CATEGORY_LABEL.metabolicAlkalosisOrElevatedBaseline;
  }
  return null;
}

/**
 * Detalhe clínico de uma linha — sem repetir o rótulo categórico nem o headline.
 * @param {number | null | undefined} ratio
 * @returns {string | null}
 */
function getDeltaDeltaInterpretationDetail(ratio) {
  if (ratio == null || !Number.isFinite(ratio)) {
    return null;
  }
  if (ratio >= 1 && ratio <= 2) {
    return "A queda do bicarbonato condiz com o acúmulo de novos ácidos.";
  }
  if (ratio < 1) {
    return "O bicarbonato caiu mais do que o AG subiu — acidose hiperclorêmica associada.";
  }
  if (ratio > 2) {
    return "O bicarbonato caiu menos do que o esperado para aquele AG.";
  }
  return null;
}

function computeDeltaDelta(opts) {
  const ag = opts.anionGapMEqL;
  const hco3 = opts.bicarbonateMEqL;
  if (!Number.isFinite(ag) || !Number.isFinite(hco3)) {
    throw new Error("invalid_delta_delta_inputs");
  }
  const deltaAg = ag - REF_AG;
  const deltaHco3 = REF_HCO3 - hco3;
  let ratio = null;
  let categoryLabel = null;
  let interpretationDetail = null;
  let interpretation = "Indeterminado";
  if (Math.abs(deltaHco3) < 0.5) {
    interpretation = "ΔHCO₃ próximo de zero — interpretar com cautela";
  } else {
    ratio = round1(deltaAg / deltaHco3);
    categoryLabel = getDeltaDeltaCategoryLabel(ratio);
    interpretationDetail = getDeltaDeltaInterpretationDetail(ratio);
    interpretation = categoryLabel ?? "Indeterminado";
  }
  return {
    anionGapMEqL: ag,
    bicarbonateMEqL: hco3,
    deltaAgMEqL: round1(deltaAg),
    deltaHco3MEqL: round1(deltaHco3),
    ratio,
    categoryLabel,
    interpretation,
    interpretationDetail,
  };
}

function within(value, low, high) {
  return value >= low && value <= high;
}

/** Tolerância ± mEq/L para compensação renal (espelha Winter ±2 mmHg). */
const HCO3_COMP_TOLERANCE = 2;

function compensationUiStatus(assessStatus) {
  if (
    assessStatus === "compensated_acute" ||
    assessStatus === "compensated_chronic"
  ) {
    return "adequate";
  }
  if (assessStatus === "partial") return "unknown";
  if (assessStatus === "mixed_or_under") return "low";
  if (assessStatus === "mixed_alkalosis") return "high";
  return "unknown";
}

function balanceFromAssessStatus(assessStatus) {
  if (
    assessStatus === "compensated_acute" ||
    assessStatus === "compensated_chronic"
  ) {
    return "compensated";
  }
  if (assessStatus === "partial") return "partial";
  if (assessStatus === "mixed_or_under" || assessStatus === "mixed_alkalosis") {
    return "mixed";
  }
  return "unclear";
}

function phaseFromAssessStatus(assessStatus) {
  if (assessStatus === "compensated_acute") return "acute";
  if (assessStatus === "compensated_chronic") return "chronic";
  return null;
}

/**
 * @param {number} hco3
 * @param {number} acute
 * @param {number} chronic
 */
function assessHco3AgainstExpected(hco3, acute, chronic) {
  const tol = HCO3_COMP_TOLERANCE;
  const inAcute = within(hco3, acute - tol, acute + tol);
  const inChronic = within(hco3, chronic - tol, chronic + tol);

  if (inAcute && inChronic) {
    const status =
      Math.abs(hco3 - acute) <= Math.abs(hco3 - chronic)
        ? "compensated_acute"
        : "compensated_chronic";
    return { status, acute, chronic };
  }
  if (inAcute) return { status: "compensated_acute", acute, chronic };
  if (inChronic) return { status: "compensated_chronic", acute, chronic };
  if (hco3 < acute - tol) return { status: "mixed_or_under", acute, chronic };
  if (hco3 > chronic + tol) return { status: "mixed_alkalosis", acute, chronic };
  if (acute + tol < hco3 && hco3 < chronic - tol) {
    return { status: "partial", acute, chronic };
  }
  return { status: "partial", acute, chronic };
}

function assessRespAcidosisCompensation(pco2MmHg, bicarbonateMEqL) {
  const exp = computeExpectedHco3RespAcidosis(pco2MmHg);
  const core = assessHco3AgainstExpected(
    bicarbonateMEqL,
    exp.acuteMEqL,
    exp.chronicMEqL,
  );
  const labels = {
    compensated_acute:
      "Compensação renal adequada (padrão agudo) — HCO₃ próximo ao esperado agudo",
    compensated_chronic:
      "Compensação renal adequada (padrão crônico) — HCO₃ próximo ao esperado crônico",
    partial: "Compensação renal parcial — HCO₃ entre os valores agudo e crônico esperados",
    mixed_or_under:
      "HCO₃ abaixo do esperado agudo — compensação insuficiente ou acidose metabólica associada",
    mixed_alkalosis:
      "HCO₃ acima do esperado crônico — alcalose metabólica associada",
  };
  return {
    ...core,
    label: labels[core.status],
    uiStatus: compensationUiStatus(core.status),
  };
}

function assessRespAlkalosisCompensation(pco2MmHg, bicarbonateMEqL) {
  const exp = computeExpectedHco3RespAlkalosis(pco2MmHg);
  const core = assessHco3AgainstExpected(
    bicarbonateMEqL,
    exp.acuteMEqL,
    exp.chronicMEqL,
  );
  const labels = {
    compensated_acute:
      "Compensação renal adequada (padrão agudo) — HCO₃ próximo ao esperado agudo",
    compensated_chronic:
      "Compensação renal adequada (padrão crônico) — HCO₃ próximo ao esperado crônico",
    partial: "Compensação renal parcial — HCO₃ entre os valores agudo e crônico esperados",
    mixed_or_under:
      "HCO₃ abaixo do esperado crônico — acidose metabólica associada ou compensação excessiva",
    mixed_alkalosis:
      "HCO₃ acima do esperado agudo — alcalose metabólica associada ou compensação insuficiente",
  };
  return {
    ...core,
    label: labels[core.status],
    uiStatus: compensationUiStatus(core.status),
  };
}

function assessMetabolicAcidosisCompensation(bicarbonateMEqL, pco2MmHg) {
  const winter = computeExpectedPco2Winter(bicarbonateMEqL);
  let status = "partial";
  let label = "Compensação respiratória indeterminada";
  if (within(pco2MmHg, winter.rangeLow, winter.rangeHigh)) {
    status = "compensated_acute";
    label = "Compensação respiratória adequada (regra de Winter)";
  } else if (pco2MmHg > winter.rangeHigh) {
    status = "mixed_alkalosis";
    label = "PaCO₂ acima do esperado — considerar acidose respiratória associada";
  } else {
    status = "mixed_or_under";
    label = "PaCO₂ abaixo do esperado — considerar alcalose respiratória associada";
  }
  return {
    status,
    label,
    uiStatus: compensationUiStatus(status),
    winter,
  };
}

function assessMetabolicAlkalosisCompensation(bicarbonateMEqL, pco2MmHg) {
  const exp = computeExpectedPco2MetabolicAlkalosis(bicarbonateMEqL);
  let status = "partial";
  let label = "Compensação respiratória indeterminada";
  if (within(pco2MmHg, exp.rangeLow, exp.rangeHigh)) {
    status = "compensated_acute";
    label = "Compensação respiratória adequada (hipoventilação esperada)";
  } else if (pco2MmHg < exp.rangeLow) {
    status = "mixed_or_under";
    label = "PaCO₂ abaixo do esperado — possível alcalose respiratória associada";
  } else {
    status = "mixed_alkalosis";
    label = "PaCO₂ acima do esperado — compensação respiratória incompleta?";
  }
  return {
    status,
    label,
    uiStatus: compensationUiStatus(status),
    expectedPco2: exp,
  };
}

function respAcidosisHeadline(assessStatus, phStatus) {
  if (assessStatus === "compensated_acute") {
    return phStatus === "eunormia"
      ? "Acidose respiratória compensada (padrão agudo)"
      : "Acidose respiratória com compensação renal aguda";
  }
  if (assessStatus === "compensated_chronic") {
    return phStatus === "eunormia"
      ? "Acidose respiratória compensada (padrão crônico)"
      : "Acidose respiratória com compensação renal crônica";
  }
  if (assessStatus === "partial") {
    return "Acidose respiratória com compensação renal parcial";
  }
  if (assessStatus === "mixed_or_under") {
    return "Distúrbio misto — acidose respiratória com compensação insuficiente ou acidose metabólica associada";
  }
  if (assessStatus === "mixed_alkalosis") {
    return "Distúrbio misto — acidose respiratória com alcalose metabólica associada";
  }
  return "Acidose respiratória";
}

function respAlkalosisHeadline(assessStatus, phStatus) {
  if (assessStatus === "compensated_acute") {
    return phStatus === "eunormia"
      ? "Alcalose respiratória compensada (padrão agudo)"
      : "Alcalose respiratória com compensação renal aguda";
  }
  if (assessStatus === "compensated_chronic") {
    return phStatus === "eunormia"
      ? "Alcalose respiratória compensada (padrão crônico)"
      : "Alcalose respiratória com compensação renal crônica";
  }
  if (assessStatus === "partial") {
    return "Alcalose respiratória com compensação renal parcial";
  }
  if (assessStatus === "mixed_or_under") {
    return "Distúrbio misto — alcalose respiratória com acidose metabólica associada";
  }
  if (assessStatus === "mixed_alkalosis") {
    return "Distúrbio misto — alcalose respiratória com alcalose metabólica associada ou compensação insuficiente";
  }
  return "Alcalose respiratória";
}

function applyRespAcidosisClassification(ctx, assess) {
  ctx.primaryDisorder = "respiratory_acidosis";
  ctx.headline = respAcidosisHeadline(assess.status, ctx.phStatus);
  ctx.balanceType = balanceFromAssessStatus(assess.status);
  ctx.compensationPhase = phaseFromAssessStatus(assess.status);
  ctx.compensation = { status: assess.uiStatus, label: assess.label };
  ctx.lines.push("Distúrbio primário provável: acidose respiratória (PaCO₂ elevado).");
  ctx.lines.push(
    `HCO₃ esperado: agudo ${assess.acute} · crônico ${assess.chronic} mEq/L.`,
  );
  ctx.lines.push(assess.label);
}

function applyRespAlkalosisClassification(ctx, assess) {
  ctx.primaryDisorder = "respiratory_alkalosis";
  ctx.headline = respAlkalosisHeadline(assess.status, ctx.phStatus);
  ctx.balanceType = balanceFromAssessStatus(assess.status);
  ctx.compensationPhase = phaseFromAssessStatus(assess.status);
  ctx.compensation = { status: assess.uiStatus, label: assess.label };
  ctx.lines.push("Distúrbio primário provável: alcalose respiratória (PaCO₂ baixo).");
  ctx.lines.push(
    `HCO₃ esperado: agudo ${assess.acute} · crônico ${assess.chronic} mEq/L.`,
  );
  ctx.lines.push(assess.label);
}

/**
 * Heurística v1 — apoio à decisão; correlacionar com quadro clínico.
 * @param {object} opts
 * @param {"arterial"|"venous"|null} [opts.channel]
 */
function classifyAcidBase(opts) {
  const ph = opts.ph;
  const pco2 = opts.pco2MmHg;
  const hco3 = opts.bicarbonateMEqL;
  const ag = opts.anionGapMEqL;
  const channel = opts.channel || "arterial";

  if (![ph, pco2, hco3].every((v) => Number.isFinite(v))) {
    throw new Error("invalid_classify_inputs");
  }

  const lines = [];
  /** @type {"acidemia"|"alkalemia"|"eunormia"} */
  let phStatus = "eunormia";
  let headline = "Sem distúrbio acidobásico primário evidente";
  /** @type {string|null} */
  let primaryDisorder = null;
  /** @type {{ status: "adequate"|"high"|"low"|"unknown", label: string }|null} */
  let compensation = null;
  /** @type {"compensated"|"partial"|"mixed"|"unclear"|null} */
  let balanceType = null;
  /** @type {"acute"|"chronic"|null} */
  let compensationPhase = null;

  const gasoRef = getGasometryRef(channel);
  const { ph: phRef, pco2MmHg: pco2Ref, bicarbonateMEqL: hco3Ref, anionGapMEqL: agRef } =
    gasoRef;

  if (channel === "venous") {
    lines.push(
      "Gasometria venosa — VR venosa; pH e PCO₂ podem diferir da arterial.",
    );
  }

  if (ph < phRef.min) {
    phStatus = "acidemia";
    lines.push(
      `Acidemia (pH < ${round1(phRef.min).toString().replace(".", ",")}).`,
    );
  } else if (ph > phRef.max) {
    phStatus = "alkalemia";
    lines.push(
      `Alcalemia (pH > ${round1(phRef.max).toString().replace(".", ",")}).`,
    );
  } else {
    lines.push(
      `pH dentro da faixa de referência (${round1(phRef.min).toString().replace(".", ",")}–${round1(phRef.max).toString().replace(".", ",")}).`,
    );
  }

  const co2High = pco2 > pco2Ref.max;
  const co2Low = pco2 < pco2Ref.min;
  const hco3Low = hco3 < hco3Ref.min;
  const hco3High = hco3 > hco3Ref.max;

  const ctx = {
    phStatus,
    primaryDisorder,
    headline,
    balanceType,
    compensationPhase,
    compensation,
    lines,
  };

  if (ph < phRef.min) {
    if (hco3Low && (!co2High || hco3 < pco2)) {
      ctx.primaryDisorder = "metabolic_acidosis";
      if (Number.isFinite(ag) && ag > agRef.max) {
        ctx.headline = "Acidose metabólica com anion gap elevado";
        lines.push("Distúrbio primário provável: acidose metabólica.");
        lines.push(
          `AG elevado (${round1(ag)} mEq/L) — ânions não medidos (lactato, cetonas, urémia…).`,
        );
      } else if (Number.isFinite(ag)) {
        ctx.headline = "Acidose metabólica hiperclorêmica (AG normal)";
        lines.push("Distúrbio primário provável: acidose metabólica.");
        lines.push(
          `AG normal (${round1(ag)} mEq/L) — perda de bicarbonato ou excesso de Cl⁻.`,
        );
      } else {
        ctx.headline = "Acidose metabólica";
        lines.push("Distúrbio primário provável: acidose metabólica.");
      }
      const metAssess = assessMetabolicAcidosisCompensation(hco3, pco2);
      ctx.balanceType = balanceFromAssessStatus(metAssess.status);
      ctx.compensationPhase = phaseFromAssessStatus(metAssess.status);
      ctx.compensation = { status: metAssess.uiStatus, label: metAssess.label };
      lines.push(metAssess.label);
    } else if (co2High) {
      applyRespAcidosisClassification(
        ctx,
        assessRespAcidosisCompensation(pco2, hco3),
      );
    }
  } else if (ph > phRef.max) {
    if (hco3High) {
      ctx.primaryDisorder = "metabolic_alkalosis";
      ctx.headline = "Alcalose metabólica";
      lines.push("Distúrbio primário provável: alcalose metabólica.");
      const metAssess = assessMetabolicAlkalosisCompensation(hco3, pco2);
      ctx.balanceType = balanceFromAssessStatus(metAssess.status);
      ctx.compensationPhase = phaseFromAssessStatus(metAssess.status);
      ctx.compensation = { status: metAssess.uiStatus, label: metAssess.label };
      lines.push(metAssess.label);
    } else if (co2Low) {
      applyRespAlkalosisClassification(
        ctx,
        assessRespAlkalosisCompensation(pco2, hco3),
      );
    }
  } else if (phStatus === "eunormia" && (hco3Low || hco3High || co2High || co2Low)) {
    if (co2High && !co2Low) {
      applyRespAcidosisClassification(
        ctx,
        assessRespAcidosisCompensation(pco2, hco3),
      );
    } else if (co2Low && !co2High) {
      applyRespAlkalosisClassification(
        ctx,
        assessRespAlkalosisCompensation(pco2, hco3),
      );
    } else if (hco3Low) {
      ctx.primaryDisorder = "metabolic_acidosis";
      const metAssess = assessMetabolicAcidosisCompensation(hco3, pco2);
      ctx.headline =
        metAssess.status === "compensated_acute"
          ? "Acidose metabólica compensada (pH normal)"
          : metAssess.status === "mixed_alkalosis" ||
              metAssess.status === "mixed_or_under"
            ? "Distúrbio misto — acidose metabólica com pH normal"
            : "Acidose metabólica com compensação parcial (pH normal)";
      ctx.balanceType = balanceFromAssessStatus(metAssess.status);
      ctx.compensationPhase = phaseFromAssessStatus(metAssess.status);
      ctx.compensation = { status: metAssess.uiStatus, label: metAssess.label };
      lines.push("Distúrbio primário provável: acidose metabólica (HCO₃ baixo).");
      lines.push(metAssess.label);
    } else if (hco3High) {
      ctx.primaryDisorder = "metabolic_alkalosis";
      const metAssess = assessMetabolicAlkalosisCompensation(hco3, pco2);
      ctx.headline =
        metAssess.status === "compensated_acute"
          ? "Alcalose metabólica compensada (pH normal)"
          : metAssess.status === "mixed_alkalosis" ||
              metAssess.status === "mixed_or_under"
            ? "Distúrbio misto — alcalose metabólica com pH normal"
            : "Alcalose metabólica com compensação parcial (pH normal)";
      ctx.balanceType = balanceFromAssessStatus(metAssess.status);
      ctx.compensationPhase = phaseFromAssessStatus(metAssess.status);
      ctx.compensation = { status: metAssess.uiStatus, label: metAssess.label };
      lines.push("Distúrbio primário provável: alcalose metabólica (HCO₃ alto).");
      lines.push(metAssess.label);
    }
  }

  return {
    summary: ctx.headline,
    headline: ctx.headline,
    phStatus,
    primaryDisorder: ctx.primaryDisorder,
    compensation: ctx.compensation,
    balanceType: ctx.balanceType,
    compensationPhase: ctx.compensationPhase,
    lines,
  };
}

function computeAcidBasePanel(opts) {
  const ph = opts.ph;
  const pco2 = opts.pco2MmHg;
  const hco3 = opts.bicarbonateMEqL;
  const sodium = opts.sodiumMEqL;
  const chloride = opts.chlorideMEqL;
  const albumin = opts.albuminGDl;
  const channel = opts.channel || null;

  const agResult =
    sodium != null && chloride != null && hco3 != null
      ? computeAnionGap({
          sodiumMEqL: sodium,
          chlorideMEqL: chloride,
          bicarbonateMEqL: hco3,
        })
      : null;

  const ag =
    agResult?.anionGapMEqL ??
    (Number.isFinite(opts.anionGapFromLab) ? opts.anionGapFromLab : null);

  const correctedAg =
    ag != null && albumin != null
      ? computeCorrectedAnionGap({
          anionGapMEqL: ag,
          albuminGDl: albumin,
        })
      : null;

  const gasoRef = getGasometryRef(channel);

  const winter =
    hco3 != null && hco3 < gasoRef.bicarbonateMEqL.min
      ? computeExpectedPco2Winter(hco3)
      : null;

  const metAlkPco2 =
    hco3 != null && hco3 > gasoRef.bicarbonateMEqL.max
      ? computeExpectedPco2MetabolicAlkalosis(hco3)
      : null;

  const respAcidHco3 =
    pco2 != null && pco2 > gasoRef.pco2MmHg.max
      ? computeExpectedHco3RespAcidosis(pco2)
      : null;

  const respAlkHco3 =
    pco2 != null && pco2 < gasoRef.pco2MmHg.min
      ? computeExpectedHco3RespAlkalosis(pco2)
      : null;

  const deltaDelta =
    ag != null && hco3 != null
      ? computeDeltaDelta({
          anionGapMEqL: ag,
          bicarbonateMEqL: hco3,
        })
      : null;

  const classification =
    ph != null && pco2 != null && hco3 != null
      ? classifyAcidBase({
          ph,
          pco2MmHg: pco2,
          bicarbonateMEqL: hco3,
          anionGapMEqL: ((ag) != null && (ag) !== undefined ? (ag) : (undefined)),
          channel,
        })
      : null;

  return {
    channel: channel === "venous" ? "venous" : "arterial",
    ph,
    pco2MmHg: pco2,
    bicarbonateMEqL: hco3,
    anionGap: agResult,
    correctedAnionGap: correctedAg,
    winter,
    metabolicAlkalosisPco2: metAlkPco2,
    respiratoryAcidosisHco3: respAcidHco3,
    respiratoryAlkalosisHco3: respAlkHco3,
    deltaDelta,
    classification,
  };
}


  return {
    REF_HCO3: REF_HCO3,
    REF_PCO2: REF_PCO2,
    REF_AG: REF_AG,
    REF_ALB: REF_ALB,
    GASOMETRY_REF: GASOMETRY_REF,
    GASOMETRY_REF_VENOUS: GASOMETRY_REF_VENOUS,
    getGasometryRef: getGasometryRef,
    computeCorrectedAnionGap: computeCorrectedAnionGap,
    computeExpectedPco2Winter: computeExpectedPco2Winter,
    computeExpectedPco2MetabolicAlkalosis: computeExpectedPco2MetabolicAlkalosis,
    describeWinterCalculation: describeWinterCalculation,
    describeMetabolicAlkalosisPco2Calculation: describeMetabolicAlkalosisPco2Calculation,
    computeExpectedHco3RespAcidosis: computeExpectedHco3RespAcidosis,
    computeExpectedHco3RespAlkalosis: computeExpectedHco3RespAlkalosis,
    DELTA_DELTA_CATEGORY_LABEL: DELTA_DELTA_CATEGORY_LABEL,
    getDeltaDeltaCategoryLabel: getDeltaDeltaCategoryLabel,
    getDeltaDeltaInterpretationDetail: getDeltaDeltaInterpretationDetail,
    computeDeltaDelta: computeDeltaDelta,
    HCO3_COMP_TOLERANCE: HCO3_COMP_TOLERANCE,
    assessRespAcidosisCompensation: assessRespAcidosisCompensation,
    assessRespAlkalosisCompensation: assessRespAlkalosisCompensation,
    assessMetabolicAcidosisCompensation: assessMetabolicAcidosisCompensation,
    assessMetabolicAlkalosisCompensation: assessMetabolicAlkalosisCompensation,
    classifyAcidBase: classifyAcidBase,
    computeAcidBasePanel: computeAcidBasePanel,
    computeAnionGap: computeAnionGap,
  };
});

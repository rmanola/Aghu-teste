/**
 * Definições declarativas das calculadoras (popup extensão).
 * @sync web/components/calculators/calculator-dynamic-registry.tsx
 */
(function (factory) {
  "use strict";
  var root = typeof globalThis !== "undefined" ? globalThis : this;
  var api = factory(root);
  root.AghuCalculatorPopupRegistry = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(function (root) {
  "use strict";

  function shared() {
    return root.AghuCalculatorShared || require("./calculator-shared.js");
  }

  function draftMod() {
    return (
      root.AghuCalculatorManualDraft || require("./calculator-manual-draft.js")
    );
  }

  function ckd() {
    return root.AghuCkdEpiEgfr || require("./ckd-epi-egfr.js");
  }

  function req(name, modulePath) {
    if (root[name]) return root[name];
    try {
      // require() só com string literal — addons-linter UNEXPECTED_GLOBAL_ARG
      switch (modulePath) {
        case "./acid-base-assessment.js":
          return require("./acid-base-assessment.js");
        case "./acid-base.js":
          return require("./acid-base.js");
        case "./asa-ps-assessment.js":
          return require("./asa-ps-assessment.js");
        case "./asa-ps-score.js":
          return require("./asa-ps-score.js");
        case "./caprini-2005-score.js":
          return require("./caprini-2005-score.js");
        case "./caprini-2013-score.js":
          return require("./caprini-2013-score.js");
        case "./chads-vasc-score.js":
          return require("./chads-vasc-score.js");
        case "./charlson-assessment.js":
          return require("./charlson-assessment.js");
        case "./charlson-score.js":
          return require("./charlson-score.js");
        case "./child-pugh-assessment.js":
          return require("./child-pugh-assessment.js");
        case "./child-pugh-score.js":
          return require("./child-pugh-score.js");
        case "./cockcroft-assessment.js":
          return require("./cockcroft-assessment.js");
        case "./cockcroft-gault.js":
          return require("./cockcroft-gault.js");
        case "./corrected-calcium-assessment.js":
          return require("./corrected-calcium-assessment.js");
        case "./corrected-calcium.js":
          return require("./corrected-calcium.js");
        case "./corrected-sodium-assessment.js":
          return require("./corrected-sodium-assessment.js");
        case "./corrected-sodium.js":
          return require("./corrected-sodium.js");
        case "./curb65-assessment.js":
          return require("./curb65-assessment.js");
        case "./curb65-score.js":
          return require("./curb65-score.js");
        case "./egfr-assessment.js":
          return require("./egfr-assessment.js");
        case "./fena-assessment.js":
          return require("./fena-assessment.js");
        case "./fena.js":
          return require("./fena.js");
        case "./free-water-deficit-assessment.js":
          return require("./free-water-deficit-assessment.js");
        case "./free-water-deficit.js":
          return require("./free-water-deficit.js");
        case "./has-bled-score.js":
          return require("./has-bled-score.js");
        case "./kdigo-aki-assessment.js":
          return require("./kdigo-aki-assessment.js");
        case "./kdigo-aki-stage.js":
          return require("./kdigo-aki-stage.js");
        case "./tnm-assessment.js":
          return require("./tnm-assessment.js");
        case "./tnm-stage.js":
          return require("./tnm-stage.js");
        case "./ecog-assessment.js":
          return require("./ecog-assessment.js");
        case "./ecog-status.js":
          return require("./ecog-status.js");
        case "./bisap-assessment.js":
          return require("./bisap-assessment.js");
        case "./bisap-score.js":
          return require("./bisap-score.js");
        case "./tokyo-assessment.js":
          return require("./tokyo-assessment.js");
        case "./tokyo-grade.js":
          return require("./tokyo-grade.js");
        case "./sofa-assessment.js":
          return require("./sofa-assessment.js");
        case "./sofa-score.js":
          return require("./sofa-score.js");
        case "./apache2-assessment.js":
          return require("./apache2-assessment.js");
        case "./apache2-score.js":
          return require("./apache2-score.js");
        case "./nihss-assessment.js":
          return require("./nihss-assessment.js");
        case "./nihss-score.js":
          return require("./nihss-score.js");
        case "./ldl-friedewald-assessment.js":
          return require("./ldl-friedewald-assessment.js");
        case "./ldl-friedewald.js":
          return require("./ldl-friedewald.js");
        case "./meld-assessment.js":
          return require("./meld-assessment.js");
        case "./meld-score.js":
          return require("./meld-score.js");
        case "./news2-assessment.js":
          return require("./news2-assessment.js");
        case "./news2-score.js":
          return require("./news2-score.js");
        case "./padua-score.js":
          return require("./padua-score.js");
        case "./qsofa-assessment.js":
          return require("./qsofa-assessment.js");
        case "./qsofa-score.js":
          return require("./qsofa-score.js");
        case "./urea-creatinine-ratio-assessment.js":
          return require("./urea-creatinine-ratio-assessment.js");
        case "./urea-creatinine-ratio.js":
          return require("./urea-creatinine-ratio.js");
        default:
          return null;
      }
    } catch (_e) {
      return null;
    }
  }

  function fieldDecimal(key, label, suggestedKey, dataLabelKey) {
    return {
      type: "decimal",
      key: key,
      label: label,
      suggestedKey: suggestedKey || key,
      dataLabelKey: dataLabelKey || suggestedKey + "DataLabel",
    };
  }

  function fieldCheckbox(key, label) {
    return { type: "checkbox", key: key, label: label };
  }

  function fieldSelect(key, label, options) {
    return { type: "select", key: key, label: label, options: options };
  }

  var CONSCIOUSNESS_OPTIONS = [
    { value: "alert", label: "Alerta" },
    { value: "voice", label: "Responde à voz" },
    { value: "pain", label: "Responde à dor" },
    { value: "unresponsive", label: "Não responde" },
  ];

  var ASCITES_OPTIONS = [
    { value: "none", label: "Ausente" },
    { value: "mild", label: "Leve / controlada" },
    { value: "severe", label: "Moderada a grave" },
  ];

  var ENCEPH_OPTIONS = [
    { value: "none", label: "Ausente" },
    { value: "grade1-2", label: "Grau I–II" },
    { value: "grade3-4", label: "Grau III–IV" },
  ];

  var CHANNEL_OPTIONS = [
    { value: "arterial", label: "Arterial" },
    { value: "venous", label: "Venosa" },
  ];

  var TNM_T_OPTIONS = [
    { value: "Tis", label: "Tis" },
    { value: "T1", label: "T1" },
    { value: "T1a", label: "T1a" },
    { value: "T1b", label: "T1b" },
    { value: "T2", label: "T2" },
    { value: "T3", label: "T3" },
    { value: "T4a", label: "T4a" },
    { value: "T4b", label: "T4b" },
  ];
  var TNM_N_OPTIONS = [
    { value: "N0", label: "N0" },
    { value: "N1", label: "N1" },
    { value: "N1a", label: "N1a" },
    { value: "N1b", label: "N1b" },
    { value: "N1c", label: "N1c" },
    { value: "N2", label: "N2" },
    { value: "N2a", label: "N2a" },
    { value: "N2b", label: "N2b" },
    { value: "N3", label: "N3" },
    { value: "N3a", label: "N3a" },
    { value: "N3b", label: "N3b" },
  ];
  var TNM_M_OPTIONS = [
    { value: "M0", label: "M0" },
    { value: "M1", label: "M1" },
    { value: "M1a", label: "M1a" },
    { value: "M1b", label: "M1b" },
    { value: "M1c", label: "M1c" },
  ];
  var TNM_TOPO_OPTIONS = [
    { value: "colorretal", label: "Colorretal" },
    { value: "esofagogastrica", label: "Esofagogástrica" },
  ];
  var TNM_BASIS_OPTIONS = [
    { value: "clinical", label: "Clínico (cTNM)" },
    { value: "pathological", label: "Patológico (pTNM)" },
  ];
  var ECOG_OPTIONS = [
    { value: "0", label: "0 — Plenamente activo" },
    { value: "1", label: "1 — Trabalho leve" },
    { value: "2", label: "2 — Ambulatório, sem trabalho" },
    { value: "3", label: "3 — Autocuidado limitado" },
    { value: "4", label: "4 — Acamado" },
  ];
  var TOKYO_CONDITION_OPTIONS = [
    { value: "cholecystitis", label: "Colecistite" },
    { value: "cholangitis", label: "Colangite" },
  ];
  var NIHSS_0_2 = [
    { value: "0", label: "0" },
    { value: "1", label: "1" },
    { value: "2", label: "2" },
  ];
  var NIHSS_0_3 = NIHSS_0_2.concat([{ value: "3", label: "3" }]);
  var NIHSS_0_4 = NIHSS_0_3.concat([{ value: "4", label: "4" }]);
  var APACHE_ADMISSION_OPTIONS = [
    { value: "nonoperative", label: "Não operatório" },
    { value: "emergency_postoperative", label: "Pós-operatório de urgência" },
    { value: "elective_postoperative", label: "Pós-operatório electivo" },
  ];
  var ASA_OPTIONS = [
    { value: "1", label: "I — Saudável" },
    { value: "2", label: "II — Doença ligeira" },
    { value: "3", label: "III — Doença grave" },
    { value: "4", label: "IV — Ameaça à vida" },
    { value: "5", label: "V — Moribundo" },
    { value: "6", label: "VI — Morte encefálica" },
  ];

  var SEX_OPTIONS = [
    { value: "", label: "— Selecionar —" },
    { value: "F", label: "Feminino" },
    { value: "M", label: "Masculino" },
  ];

  function buildContextAssessment(def, ctx) {
    if (!def.buildAssessment) return { status: "missing", suggested: {} };
    try {
      var assessment = def.buildAssessment(ctx);
      if (assessment && typeof assessment === "object") return assessment;
    } catch (_e) {
      /* fail-fast na borda: não derrubar a lista inteira */
    }
    return { status: "missing", suggested: {} };
  }

  var DEFS = [
    {
      id: "tfg",
      title: "TFG estimada (CKD-EPI 2021)",
      hint: "Creatinina (mg/dL), idade e sexo. Valores sugeridos dos exames e passômetro.",
      fields: [
        fieldDecimal("creatinine", "Creatinina sérica (mg/dL)", "creatinineMgDl"),
        { type: "age", key: "age", label: "Idade (anos)", suggestedKey: "ageYears" },
        fieldSelect("sex", "Sexo", SEX_OPTIONS),
      ],
      missingLabels: {
        creatinine: "creatinina",
        age: "idade",
        sex: "sexo",
      },
      buildAssessment: function (ctx) {
        return req("AghuEgfrAssessment", "./egfr-assessment.js").buildEgfrAssessment(
          {
            exams: ctx.exams,
            passometroHeader: ctx.passometroHeader,
            pii: ctx.pii,
          },
        );
      },
      compute: function (values) {
        var c = ckd();
        if (
          values.creatinine == null ||
          values.age == null ||
          !values.sex
        ) {
          return null;
        }
        if (values.age < c.MIN_AGE_YEARS) {
          return { kind: "invalid_age" };
        }
        try {
          return c.computeCkdEpiEgfr({
            creatinineMgDl: values.creatinine,
            ageYears: values.age,
            sex: values.sex,
          });
        } catch (_e) {
          return null;
        }
      },
      formatResult: function (result) {
        if (!result) return { text: "Informe os campos acima.", cls: "muted" };
        if (result.kind === "invalid_age") {
          return {
            text: "CKD-EPI não se aplica a menores de 18 anos.",
            cls: "warn",
          };
        }
        return {
          html:
            '<span class="calc-result-value">' +
            result.egfrMlMin +
            ' <span class="calc-result-unit">mL/min/1,73 m²</span></span>' +
            '<span class="calc-result-detail">Estágio ' +
            result.stageLabel +
            "</span>",
          cls: "ok",
        };
      },
    },
    {
      id: "meld",
      title: "MELD-Na (hepático)",
      hint: "Bilirrubina, INR, creatinina e sódio. Marque diálise se aplicável.",
      fields: [
        fieldCheckbox("onDialysis", "Diálise ≥2×/semana (Cr fixada em 4 mg/dL)"),
        fieldDecimal("bilirubin", "Bilirrubina total (mg/dL)", "bilirubinMgDl", "bilirubinDataLabel"),
        fieldDecimal("inr", "INR", "inr", "inrDataLabel"),
        fieldDecimal("creatinine", "Creatinina (mg/dL)", "creatinineMgDl", "creatinineDataLabel"),
        fieldDecimal("sodium", "Sódio (mEq/L)", "sodiumMEqL", "sodiumDataLabel"),
      ],
      missingLabels: {
        bilirubin: "bilirrubina",
        inr: "INR",
        creatinine: "creatinina",
        sodium: "sódio",
      },
      buildAssessment: function (ctx) {
        return req("AghuMeldAssessment", "./meld-assessment.js").buildMeldAssessment(
          { exams: ctx.exams, onDialysis: false },
        );
      },
      compute: function (values) {
        var meld = req("AghuMeldScore", "./meld-score.js");
        if (
          values.bilirubin == null ||
          values.inr == null ||
          values.creatinine == null
        ) {
          return null;
        }
        try {
          return meld.computeMeldNa({
            bilirubinMgDl: values.bilirubin,
            inr: values.inr,
            creatinineMgDl: values.creatinine,
            sodiumMEqL: values.sodium,
            onDialysis: !!values.onDialysis,
          });
        } catch (_e) {
          return null;
        }
      },
      formatResult: function (result) {
        if (!result) return { text: "Informe os laboratórios.", cls: "muted" };
        var meld = req("AghuMeldScore", "./meld-score.js");
        var risk = meld.classifyMeldRisk(result.meldNa);
        return {
          html:
            '<span class="calc-result-value">MELD-Na ' +
            result.meldNa +
            "</span>" +
            '<span class="calc-result-detail">MELD ' +
            result.meld +
            " · Mortalidade 3m ~" +
            risk.label +
            "</span>",
          cls: "ok",
        };
      },
    },
    {
      id: "child-pugh",
      title: "Child-Pugh (hepático)",
      hint: "Laboratório + ascite e encefalopatia (clínica).",
      fields: [
        fieldDecimal("bilirubin", "Bilirrubina (mg/dL)", "bilirubinMgDl", "bilirubinDataLabel"),
        fieldDecimal("albumin", "Albumina sérica (g/dL)", "albuminGDl", "albuminDataLabel"),
        fieldDecimal("inr", "INR", "inr", "inrDataLabel"),
        fieldSelect("ascites", "Ascite", ASCITES_OPTIONS),
        fieldSelect("encephalopathy", "Encefalopatia", ENCEPH_OPTIONS),
      ],
      missingLabels: {
        bilirubin: "bilirrubina",
        albumin: "albumina",
        inr: "INR",
        ascites: "ascite",
        encephalopathy: "encefalopatia",
      },
      buildAssessment: function (ctx) {
        return req(
          "AghuChildPughAssessment",
          "./child-pugh-assessment.js",
        ).buildChildPughAssessment({ exams: ctx.exams });
      },
      compute: function (values) {
        var cp = req("AghuChildPughScore", "./child-pugh-score.js");
        if (
          !values.ascites ||
          !values.encephalopathy ||
          values.bilirubin == null ||
          values.albumin == null ||
          values.inr == null
        ) {
          return null;
        }
        try {
          return cp.computeChildPugh({
            bilirubinMgDl: values.bilirubin,
            albuminGDl: values.albumin,
            inr: values.inr,
            ascites: values.ascites,
            encephalopathy: values.encephalopathy,
          });
        } catch (_e) {
          return null;
        }
      },
      formatResult: function (result) {
        if (!result) return { text: "Preencha todos os campos.", cls: "muted" };
        return {
          html:
            '<span class="calc-result-value">' +
            result.total +
            " pts · Classe " +
            result.class +
            "</span>" +
            '<span class="calc-result-detail">' +
            result.mortality.detail +
            "</span>",
          cls: "ok",
        };
      },
    },
    {
      id: "acid-base",
      title: "Equilíbrio acidobásico",
      hint: "Gasometria + eletrólitos. Resumo textual; ajuste manual se necessário.",
      fields: [
        fieldSelect("channel", "Amostra", CHANNEL_OPTIONS),
        fieldDecimal("ph", "pH", "ph"),
        fieldDecimal("pco2", "PaCO₂ (mmHg)", "pco2MmHg"),
        fieldDecimal("hco3", "HCO₃⁻ (mEq/L)", "bicarbonateMEqL"),
        fieldDecimal("sodium", "Sódio (mEq/L)", "sodiumMEqL", "sodiumDataLabel"),
        fieldDecimal("chloride", "Cloreto (mEq/L)", "chlorideMEqL", "chlorideDataLabel"),
        fieldDecimal("albumin", "Albumina sérica (g/dL)", "albuminGDl", "albuminDataLabel"),
      ],
      missingLabels: {
        ph: "pH",
        pco2: "PaCO₂",
        hco3: "bicarbonato",
      },
      buildAssessment: function (ctx) {
        return req(
          "AghuAcidBaseAssessment",
          "./acid-base-assessment.js",
        ).buildAcidBaseAssessment({ exams: ctx.exams });
      },
      compute: function (values) {
        var ab = req("AghuAcidBase", "./acid-base.js");
        if (values.ph == null || values.pco2 == null || values.hco3 == null) {
          return null;
        }
        try {
          return ab.computeAcidBasePanel({
            ph: values.ph,
            pco2MmHg: values.pco2,
            bicarbonateMEqL: values.hco3,
            sodiumMEqL: values.sodium,
            chlorideMEqL: values.chloride,
            albuminGDl: values.albumin,
            channel: values.channel === "venous" ? "venous" : "arterial",
          });
        } catch (_e) {
          return null;
        }
      },
      formatResult: function (result, assessment) {
        if (!result || !result.classification) {
          return { text: "Informe pH, PaCO₂ e HCO₃⁻.", cls: "muted" };
        }
        var cls = result.classification;
        var lines = (cls.lines || []).slice(0, 4);
        var html =
          '<span class="calc-result-value">' +
          (cls.headline || cls.summary || "—") +
          "</span>";
        if (lines.length) {
          html +=
            '<ul class="calc-result-lines">' +
            lines
              .map(function (l) {
                return "<li>" + l + "</li>";
              })
              .join("") +
            "</ul>";
        }
        if (assessment && assessment.warnings && assessment.warnings.length) {
          html +=
            '<p class="calc-result-warn">' +
            assessment.warnings.join(" ") +
            "</p>";
        }
        return { html: html, cls: "ok" };
      },
    },
    {
      id: "na-corr",
      title: "Sódio corrigido (hiperglicemia)",
      fields: [
        fieldDecimal("sodium", "Sódio medido (mEq/L)", "sodiumMEqL", "sodiumDataLabel"),
        fieldDecimal("glucose", "Glicemia (mg/dL)", "glucoseMgDl", "glucoseDataLabel"),
      ],
      missingLabels: { sodium: "sódio", glucose: "glicemia" },
      buildAssessment: function (ctx) {
        return req(
          "AghuCorrectedSodiumAssessment",
          "./corrected-sodium-assessment.js",
        ).buildCorrectedSodiumAssessment({ exams: ctx.exams });
      },
      compute: function (values) {
        if (values.sodium == null || values.glucose == null) return null;
        return req(
          "AghuCorrectedSodium",
          "./corrected-sodium.js",
        ).computeCorrectedSodium({
          sodiumMEqL: values.sodium,
          glucoseMgDl: values.glucose,
        });
      },
      formatResult: function (result) {
        if (!result) return { text: "Informe sódio e glicemia.", cls: "muted" };
        var sh = shared();
        return {
          html:
            '<span class="calc-result-value">' +
            sh.formatDecimalPt(result.correctedSodiumMEqL) +
            " mEq/L</span>" +
            '<span class="calc-result-detail">Medido ' +
            sh.formatDecimalPt(result.measuredSodiumMEqL) +
            " mEq/L</span>",
          cls: "ok",
        };
      },
    },
    {
      id: "cockcroft",
      title: "Clearance Cockcroft-Gault",
      fields: [
        fieldDecimal("creatinine", "Creatinina (mg/dL)", "creatinineMgDl", "creatinineDataLabel"),
        { type: "age", key: "age", label: "Idade (anos)", suggestedKey: "ageYears" },
        fieldDecimal("weight", "Peso (kg)", "weightKg"),
        fieldSelect("sex", "Sexo", SEX_OPTIONS),
      ],
      missingLabels: {
        creatinine: "creatinina",
        age: "idade",
        weight: "peso",
        sex: "sexo",
      },
      buildAssessment: function (ctx) {
        return req(
          "AghuCockcroftAssessment",
          "./cockcroft-assessment.js",
        ).buildCockcroftAssessment({
          exams: ctx.exams,
          passometroHeader: ctx.passometroHeader,
          pii: ctx.pii,
        });
      },
      compute: function (values) {
        if (
          values.creatinine == null ||
          values.age == null ||
          values.weight == null ||
          !values.sex
        ) {
          return null;
        }
        return req(
          "AghuCockcroftGault",
          "./cockcroft-gault.js",
        ).computeCockcroftGault({
          creatinineMgDl: values.creatinine,
          ageYears: values.age,
          weightKg: values.weight,
          sex: values.sex,
        });
      },
      formatResult: function (result) {
        if (!result) return { text: "Preencha creatinina, idade, peso e sexo.", cls: "muted" };
        return {
          html:
            '<span class="calc-result-value">' +
            result.creatinineClearanceMlMin +
            " mL/min</span>",
          cls: "ok",
        };
      },
    },
    {
      id: "ldl",
      title: "LDL (Friedewald)",
      fields: [
        fieldDecimal("ct", "Colesterol total (mg/dL)", "totalCholesterolMgDl", "ctDataLabel"),
        fieldDecimal("hdl", "HDL (mg/dL)", "hdlMgDl", "hdlDataLabel"),
        fieldDecimal("tg", "Triglicerídeos (mg/dL)", "triglyceridesMgDl", "tgDataLabel"),
      ],
      missingLabels: { ct: "colesterol total", hdl: "HDL", tg: "triglicerídeos" },
      buildAssessment: function (ctx) {
        return req(
          "AghuLdlFriedewaldAssessment",
          "./ldl-friedewald-assessment.js",
        ).buildLdlFriedewaldAssessment({ exams: ctx.exams });
      },
      compute: function (values) {
        if (values.ct == null || values.hdl == null || values.tg == null) {
          return null;
        }
        return req(
          "AghuLdlFriedewald",
          "./ldl-friedewald.js",
        ).computeLdlFriedewald({
          totalCholesterolMgDl: values.ct,
          hdlMgDl: values.hdl,
          triglyceridesMgDl: values.tg,
        });
      },
      formatResult: function (result) {
        if (!result) return { text: "Informe CT, HDL e TG.", cls: "muted" };
        if (result.kind === "tg_too_high") {
          return {
            text: "TG ≥400 mg/dL — Friedewald não se aplica.",
            cls: "warn",
          };
        }
        return {
          html:
            '<span class="calc-result-value">' +
            result.ldlMgDl +
            " mg/dL</span>",
          cls: "ok",
        };
      },
    },
    {
      id: "ca-corr",
      title: "Cálcio corrigido (albumina)",
      fields: [
        fieldDecimal("calcium", "Cálcio total (mg/dL)", "calciumMgDl", "calciumDataLabel"),
        fieldDecimal("albumin", "Albumina sérica (g/dL)", "albuminGDl", "albuminDataLabel"),
      ],
      missingLabels: { calcium: "cálcio", albumin: "albumina" },
      buildAssessment: function (ctx) {
        return req(
          "AghuCorrectedCalciumAssessment",
          "./corrected-calcium-assessment.js",
        ).buildCorrectedCalciumAssessment({ exams: ctx.exams });
      },
      compute: function (values) {
        if (values.calcium == null || values.albumin == null) return null;
        return req(
          "AghuCorrectedCalcium",
          "./corrected-calcium.js",
        ).computeCorrectedCalcium({
          calciumMgDl: values.calcium,
          albuminGDl: values.albumin,
        });
      },
      formatResult: function (result) {
        if (!result) return { text: "Informe cálcio e albumina.", cls: "muted" };
        return {
          html:
            '<span class="calc-result-value">' +
            result.correctedCalciumMgDl +
            " mg/dL</span>",
          cls: "ok",
        };
      },
    },
    {
      id: "news2",
      title: "NEWS2",
      fields: [
        fieldDecimal("rr", "FR (irpm)", "respiratoryRate"),
        fieldDecimal("spo2", "SpO₂ (%)", "spo2Pct"),
        fieldCheckbox("supplementalO2", "O₂ suplementar"),
        fieldDecimal("pas", "PAS (mmHg)", "systolicBp"),
        fieldDecimal("fc", "FC (bpm)", "heartRate"),
        fieldSelect("consciousness", "Consciência", CONSCIOUSNESS_OPTIONS),
        fieldDecimal("temp", "Temperatura (°C)", "temperatureC"),
      ],
      missingLabels: {
        rr: "FR",
        spo2: "SpO₂",
        pas: "PAS",
        fc: "FC",
        consciousness: "consciência",
        temp: "temperatura",
      },
      buildAssessment: function (ctx) {
        return req(
          "AghuNews2Assessment",
          "./news2-assessment.js",
        ).buildNews2Assessment({
          passometro: ctx.passometro,
          controles: ctx.controles,
        });
      },
      compute: function (values) {
        if (
          values.rr == null ||
          values.spo2 == null ||
          values.pas == null ||
          values.fc == null ||
          values.temp == null ||
          !values.consciousness
        ) {
          return null;
        }
        return req("AghuNews2Score", "./news2-score.js").computeNews2({
          respiratoryRate: values.rr,
          spo2Pct: values.spo2,
          systolicBp: values.pas,
          heartRate: values.fc,
          temperatureC: values.temp,
          consciousness: values.consciousness,
          supplementalO2: !!values.supplementalO2,
        });
      },
      formatResult: function (result) {
        if (!result) return { text: "Preencha os vitais e consciência.", cls: "muted" };
        return {
          html:
            '<span class="calc-result-value">NEWS2 ' +
            result.total +
            "</span>" +
            '<span class="calc-result-detail">' +
            result.risk.label +
            "</span>",
          cls: "ok",
        };
      },
    },
    {
      id: "qsofa",
      title: "qSOFA",
      fields: [
        fieldDecimal("rr", "FR (irpm)", "respiratoryRate"),
        fieldDecimal("pas", "PAS (mmHg)", "systolicBp"),
        fieldCheckbox("alteredMentation", "Alteração mental"),
      ],
      missingLabels: { rr: "FR", pas: "PAS" },
      buildAssessment: function (ctx) {
        return req(
          "AghuQsofaAssessment",
          "./qsofa-assessment.js",
        ).buildQsofaAssessment({
          exams: ctx.exams,
          passometro: ctx.passometro,
          controles: ctx.controles,
        });
      },
      compute: function (values) {
        if (values.rr == null || values.pas == null) return null;
        return req("AghuQsofaScore", "./qsofa-score.js").computeQsofa({
          respiratoryRate: values.rr,
          systolicBp: values.pas,
          alteredMentation: !!values.alteredMentation,
        });
      },
      formatResult: function (result, assessment) {
        if (!result) return { text: "Informe FR e PAS.", cls: "muted" };
        var extra = "";
        var sug =
          assessment && assessment.suggested ? assessment.suggested : {};
        if (sug.lactateValue != null) {
          extra =
            '<span class="calc-result-detail">Lactato sugerido: ' +
            sug.lactateValue +
            " " +
            (sug.lactateUnit || "mmol/L") +
            "</span>";
        }
        return {
          html:
            '<span class="calc-result-value">qSOFA ' +
            result.total +
            (result.highRisk ? " — alto risco" : "") +
            "</span>" +
            extra,
          cls: result.highRisk ? "warn" : "ok",
        };
      },
    },
    {
      id: "fena",
      title: "FENa",
      fields: [
        fieldDecimal("sodiumSerum", "Na sérico (mEq/L)", "sodiumSerumMEqL", "sodiumSerumDataLabel"),
        fieldDecimal("sodiumUrine", "Na urinário (mEq/L)", "sodiumUrineMEqL", "sodiumUrineDataLabel"),
        fieldDecimal("creatinineSerum", "Cr sérica (mg/dL)", "creatinineSerumMgDl", "creatinineSerumDataLabel"),
        fieldDecimal("creatinineUrine", "Cr urinária (mg/dL)", "creatinineUrineMgDl", "creatinineUrineDataLabel"),
      ],
      missingLabels: {
        sodiumSerum: "Na sérico",
        sodiumUrine: "Na urinário",
        creatinineSerum: "creatinina sérica",
        creatinineUrine: "creatinina urinária",
      },
      buildAssessment: function (ctx) {
        return req(
          "AghuFenaAssessment",
          "./fena-assessment.js",
        ).buildFenaAssessment({ exams: ctx.exams });
      },
      compute: function (values) {
        if (
          values.sodiumSerum == null ||
          values.sodiumUrine == null ||
          values.creatinineSerum == null ||
          values.creatinineUrine == null
        ) {
          return null;
        }
        return req("AghuFena", "./fena.js").computeFena({
          sodiumSerumMEqL: values.sodiumSerum,
          sodiumUrineMEqL: values.sodiumUrine,
          creatinineSerumMgDl: values.creatinineSerum,
          creatinineUrineMgDl: values.creatinineUrine,
        });
      },
      formatResult: function (result) {
        if (!result) return { text: "Informe Na e Cr séricos e urinários.", cls: "muted" };
        return {
          html:
            '<span class="calc-result-value">' +
            result.fenaPct +
            "%</span>" +
            '<span class="calc-result-detail">' +
            result.interpretation +
            "</span>",
          cls: "ok",
        };
      },
    },
    {
      id: "free-water",
      title: "Déficit de água livre",
      fields: [
        fieldDecimal("sodium", "Sódio (mEq/L)", "sodiumMEqL", "sodiumDataLabel"),
        fieldDecimal("weight", "Peso (kg)", "weightKg"),
        fieldSelect("sex", "Sexo", SEX_OPTIONS),
      ],
      missingLabels: { sodium: "sódio", weight: "peso", sex: "sexo" },
      buildAssessment: function (ctx) {
        return req(
          "AghuFreeWaterDeficitAssessment",
          "./free-water-deficit-assessment.js",
        ).buildFreeWaterDeficitAssessment({
          exams: ctx.exams,
          passometroHeader: ctx.passometroHeader,
          pii: ctx.pii,
        });
      },
      compute: function (values) {
        if (values.sodium == null || values.weight == null || !values.sex) {
          return null;
        }
        return req(
          "AghuFreeWaterDeficit",
          "./free-water-deficit.js",
        ).computeFreeWaterDeficit({
          sodiumMEqL: values.sodium,
          weightKg: values.weight,
          sex: values.sex,
        });
      },
      formatResult: function (result) {
        if (!result) return { text: "Informe sódio, peso e sexo.", cls: "muted" };
        if (!result.hypernatremia) {
          return {
            text: "Sódio ≤140 — sem déficit estimado para hipernatremia.",
            cls: "muted",
          };
        }
        return {
          html:
            '<span class="calc-result-value">' +
            result.freeWaterDeficitL +
            " L</span>" +
            '<span class="calc-result-detail">TBW ~' +
            result.tbwL +
            " L</span>",
          cls: "ok",
        };
      },
    },
    {
      id: "urea-cr",
      title: "Razão ureia/creatinina",
      fields: [
        fieldDecimal("urea", "Ureia (mg/dL)", "ureaMgDl", "ureaDataLabel"),
        fieldDecimal("creatinine", "Creatinina (mg/dL)", "creatinineMgDl", "creatinineDataLabel"),
      ],
      missingLabels: { urea: "ureia", creatinine: "creatinina" },
      buildAssessment: function (ctx) {
        return req(
          "AghuUreaCreatinineRatioAssessment",
          "./urea-creatinine-ratio-assessment.js",
        ).buildUreaCreatinineRatioAssessment({ exams: ctx.exams });
      },
      compute: function (values) {
        if (values.urea == null || values.creatinine == null) return null;
        return req(
          "AghuUreaCreatinineRatio",
          "./urea-creatinine-ratio.js",
        ).computeUreaCreatinineRatio({
          ureaMgDl: values.urea,
          creatinineMgDl: values.creatinine,
        });
      },
      formatResult: function (result) {
        if (!result) return { text: "Informe ureia e creatinina.", cls: "muted" };
        return {
          html:
            '<span class="calc-result-value">U/Cr ' +
            result.ratio +
            "</span>" +
            '<span class="calc-result-detail">' +
            result.interpretation.label +
            "</span>",
          cls: "ok",
        };
      },
    },
    {
      id: "curb65",
      title: "CURB-65",
      fields: [
        { type: "age", key: "age", label: "Idade (anos)", suggestedKey: "ageYears" },
        fieldDecimal("urea", "Ureia (mg/dL)", "ureaMgDl", "ureaDataLabel"),
        fieldDecimal("rr", "FR (irpm)", "respiratoryRate"),
        fieldDecimal("pas", "PAS (mmHg)", "systolicBp"),
        fieldCheckbox("confusion", "Confusão mental"),
      ],
      missingLabels: {
        age: "idade",
        urea: "ureia",
        rr: "FR",
        pas: "PAS",
      },
      buildAssessment: function (ctx) {
        return req(
          "AghuCurb65Assessment",
          "./curb65-assessment.js",
        ).buildCurb65Assessment({
          exams: ctx.exams,
          passometro: ctx.passometro,
          controles: ctx.controles,
          passometroHeader: ctx.passometroHeader,
          pii: ctx.pii,
        });
      },
      compute: function (values, draft, assessment) {
        if (
          values.age == null ||
          values.rr == null ||
          values.pas == null
        ) {
          return null;
        }
        var ureaElevated =
          assessment &&
          assessment.suggested &&
          assessment.suggested.ureaElevated != null
            ? assessment.suggested.ureaElevated
            : values.urea != null && values.urea >= 50;
        return req("AghuCurb65Score", "./curb65-score.js").computeCurb65({
          confusion: !!values.confusion,
          ureaElevated: ureaElevated,
          respiratoryRate: values.rr,
          systolicBp: values.pas,
          ageYears: values.age,
        });
      },
      formatResult: function (result) {
        if (!result) return { text: "Preencha idade, ureia, FR e PAS.", cls: "muted" };
        return {
          html:
            '<span class="calc-result-value">CURB-65 ' +
            result.total +
            "</span>" +
            '<span class="calc-result-detail">Mortalidade: ' +
            result.mortality +
            "</span>",
          cls: "ok",
        };
      },
    },
    {
      id: "chads",
      title: "CHA₂DS₂-VASc",
      fields: [
        { type: "age", key: "age", label: "Idade (anos)", suggestedKey: "ageYears" },
        fieldSelect("sex", "Sexo", SEX_OPTIONS),
        fieldCheckbox("chf", "Insuficiência cardíaca"),
        fieldCheckbox("hypertension", "Hipertensão"),
        fieldCheckbox("diabetes", "Diabetes"),
        fieldCheckbox("strokeTia", "AVC / AIT prévio"),
        fieldCheckbox("vascularDisease", "Doença vascular"),
      ],
      missingLabels: { age: "idade", sex: "sexo" },
      buildAssessment: function (ctx) {
        var chads = req("AghuChadsVascScore", "./chads-vasc-score.js");
        return {
          status: "partial",
          suggested: chads.buildChadsSuggestedAgeSex(
            ctx.passometroHeader,
            ctx.pii,
          ),
        };
      },
      compute: function (values) {
        if (values.age == null || !values.sex) return null;
        return req(
          "AghuChadsVascScore",
          "./chads-vasc-score.js",
        ).computeChadsVasc({
          ageYears: values.age,
          sex: values.sex,
          chf: !!values.chf,
          hypertension: !!values.hypertension,
          diabetes: !!values.diabetes,
          strokeTia: !!values.strokeTia,
          vascularDisease: !!values.vascularDisease,
        });
      },
      formatResult: function (result) {
        if (!result) return { text: "Informe idade e sexo.", cls: "muted" };
        return {
          html:
            '<span class="calc-result-value">' +
            result.total +
            " pts</span>" +
            '<span class="calc-result-detail">Risco AVC: ' +
            result.strokeRisk +
            "</span>",
          cls: "ok",
        };
      },
    },
    {
      id: "has-bled",
      title: "HAS-BLED",
      fields: [
        { type: "age", key: "age", label: "Idade (anos)", suggestedKey: "ageYears" },
        fieldCheckbox("hypertension", "Hipertensão"),
        fieldCheckbox("renalDisease", "Doença renal"),
        fieldCheckbox("liverDisease", "Doença hepática"),
        fieldCheckbox("stroke", "AVC prévio"),
        fieldCheckbox("bleeding", "Sangramento prévio"),
        fieldCheckbox("labileInr", "INR lábil"),
        fieldCheckbox("drugs", "Fármacos (AAS, AINE)"),
        fieldCheckbox("alcohol", "Álcool excessivo"),
      ],
      missingLabels: { age: "idade" },
      buildAssessment: function (ctx) {
        var hb = req("AghuHasBledScore", "./has-bled-score.js");
        var age = hb.parseHasBledAge(ctx.passometroHeader, ctx.pii);
        return {
          status: age != null ? "partial" : "missing",
          suggested: age != null ? { ageYears: age } : {},
          missing: age == null ? ["age"] : [],
        };
      },
      compute: function (values) {
        if (values.age == null) return null;
        return req("AghuHasBledScore", "./has-bled-score.js").computeHasBled({
          ageYears: values.age,
          hypertension: !!values.hypertension,
          renalDisease: !!values.renalDisease,
          liverDisease: !!values.liverDisease,
          stroke: !!values.stroke,
          bleeding: !!values.bleeding,
          labileInr: !!values.labileInr,
          drugs: !!values.drugs,
          alcohol: !!values.alcohol,
        });
      },
      formatResult: function (result) {
        if (!result) return { text: "Informe idade.", cls: "muted" };
        return {
          html:
            '<span class="calc-result-value">HAS-BLED ' +
            result.total +
            (result.highRisk ? " — alto risco" : "") +
            "</span>",
          cls: result.highRisk ? "warn" : "ok",
        };
      },
    },
    {
      id: "padua",
      title: "Padua (TEV — clínico)",
      fields: [
        { type: "age", key: "age", label: "Idade (anos)", suggestedKey: "ageYears" },
        fieldCheckbox("activeCancer", "Câncer ativo (3 pts)"),
        fieldCheckbox("previousVte", "TEV prévio (3 pts)"),
        fieldCheckbox("reducedMobility", "Mobilidade reduzida (3 pts)"),
        fieldCheckbox("knownThrombophilia", "Trombofilia conhecida (3 pts)"),
        fieldCheckbox("recentTraumaSurgery", "Trauma/cirurgia recente (2 pts)"),
        fieldCheckbox("heartRespFailure", "IC/insuf. respiratória (1 pt)"),
        fieldCheckbox("acuteMiStroke", "IAM/AVC isquêmico (1 pt)"),
        fieldCheckbox("acuteInfectionRheum", "Infecção/reumatológica (1 pt)"),
        fieldCheckbox("obesity", "Obesidade IMC ≥30 (1 pt)"),
        fieldCheckbox("hormonalTherapy", "Terapia hormonal (1 pt)"),
      ],
      missingLabels: { age: "idade" },
      buildAssessment: function (ctx) {
        var padua = req("AghuPaduaScore", "./padua-score.js");
        var suggested = padua.buildPaduaSuggestedAge(ctx.passometroHeader, ctx.pii);
        var age = suggested.ageYears;
        return {
          status: age != null ? "partial" : "missing",
          suggested: suggested,
          missing: age == null ? ["age"] : [],
        };
      },
      compute: function (values) {
        if (values.age == null) return null;
        return req("AghuPaduaScore", "./padua-score.js").computePadua({
          ageYears: values.age,
          activeCancer: !!values.activeCancer,
          previousVte: !!values.previousVte,
          reducedMobility: !!values.reducedMobility,
          knownThrombophilia: !!values.knownThrombophilia,
          recentTraumaSurgery: !!values.recentTraumaSurgery,
          heartRespFailure: !!values.heartRespFailure,
          acuteMiStroke: !!values.acuteMiStroke,
          acuteInfectionRheum: !!values.acuteInfectionRheum,
          obesity: !!values.obesity,
          hormonalTherapy: !!values.hormonalTherapy,
        });
      },
      formatResult: function (result) {
        if (!result) return { text: "Informe idade.", cls: "muted" };
        return {
          html:
            '<span class="calc-result-value">Padua ' +
            result.total +
            (result.highRisk ? " — alto risco" : "") +
            "</span>",
          cls: result.highRisk ? "warn" : "ok",
        };
      },
    },
    {
      id: "caprini-2005",
      title: "Caprini 2005",
      fields: [
        { type: "age", key: "age", label: "Idade (anos)", suggestedKey: "ageYears" },
        fieldCheckbox("minorSurgery", "Cirurgia menor"),
        fieldCheckbox("bmiOver25", "IMC >25"),
        fieldCheckbox("swollenLegs", "Edema MMII"),
        fieldCheckbox("varicoseVeins", "Varizes"),
        fieldCheckbox("pregnancyPostpartum", "Gestação/puerpério"),
        fieldCheckbox("oralContraceptivesHrt", "ACO/TRH"),
        fieldCheckbox("sepsis", "Sepse"),
        fieldCheckbox("seriousLungDisease", "Doença pulmonar grave"),
        fieldCheckbox("abnormalPulmonaryFunction", "DPOC"),
        fieldCheckbox("acuteMi", "IAM"),
        fieldCheckbox("chf", "IC"),
        fieldCheckbox("ibd", "DII"),
        fieldCheckbox("bedRestMedical", "Repouso (clínico)"),
        fieldCheckbox("otherRiskFactors", "Outros fatores"),
        fieldCheckbox("arthroscopicSurgery", "Artroscopia"),
        fieldCheckbox("malignancy", "Neoplasia"),
        fieldCheckbox("laparoscopicSurgery", "Laparoscopia >45min"),
        fieldCheckbox("majorSurgery", "Cirurgia maior"),
        fieldCheckbox("plasterCast", "Gesso"),
        fieldCheckbox("centralVenousAccess", "Acesso venoso central"),
        fieldCheckbox("historyVte", "TVP/TEP prévio"),
        fieldCheckbox("familyHistoryVte", "TEV familiar"),
        fieldCheckbox("factorVLeiden", "Fator V Leiden"),
        fieldCheckbox("prothrombin20210a", "Protrombina 20210A"),
        fieldCheckbox("lupusAnticoagulant", "Anticoagulante lúpico"),
        fieldCheckbox("anticardiolipin", "Anticardiolipina"),
        fieldCheckbox("hit", "HIT"),
        fieldCheckbox("otherThrombophilia", "Outra trombofilia"),
        fieldCheckbox("stroke", "AVC"),
        fieldCheckbox("electiveJointArthroplasty", "Artroplastia"),
        fieldCheckbox("hipPelvisLegFracture", "Fratura quadril/perna"),
        fieldCheckbox("spinalCordInjury", "Lesão medular"),
      ],
      missingLabels: { age: "idade" },
      buildAssessment: function (ctx) {
        var cap = req("AghuCaprini2005Score", "./caprini-2005-score.js");
        var age = cap.parseCapriniAge(ctx.passometroHeader, ctx.pii);
        return {
          status: age != null ? "partial" : "missing",
          suggested: age != null ? { ageYears: age } : {},
          missing: age == null ? ["age"] : [],
        };
      },
      compute: function (values) {
        if (values.age == null) return null;
        var flags = [
          "minorSurgery", "bmiOver25", "swollenLegs", "varicoseVeins",
          "pregnancyPostpartum", "oralContraceptivesHrt", "sepsis",
          "seriousLungDisease", "abnormalPulmonaryFunction", "acuteMi", "chf",
          "ibd", "bedRestMedical", "otherRiskFactors", "arthroscopicSurgery",
          "malignancy", "laparoscopicSurgery", "majorSurgery", "plasterCast",
          "centralVenousAccess", "historyVte", "familyHistoryVte",
          "factorVLeiden", "prothrombin20210a", "lupusAnticoagulant",
          "anticardiolipin", "hit", "otherThrombophilia", "stroke",
          "electiveJointArthroplasty", "hipPelvisLegFracture", "spinalCordInjury",
        ];
        var opts = { ageYears: values.age };
        for (var i = 0; i < flags.length; i++) {
          opts[flags[i]] = !!values[flags[i]];
        }
        return req("AghuCaprini2005Score", "./caprini-2005-score.js").computeCaprini2005(opts);
      },
      formatResult: function (result) {
        if (!result) return { text: "Informe idade.", cls: "muted" };
        return {
          html:
            '<span class="calc-result-value">Caprini ' +
            result.total +
            " — " +
            result.riskLevel +
            "</span>",
          cls: result.highRisk ? "warn" : "ok",
        };
      },
    },
    {
      id: "caprini-2013",
      title: "Caprini 2013",
      fields: [
        { type: "age", key: "age", label: "Idade (anos)", suggestedKey: "ageYears" },
        fieldSelect("sex", "Sexo", SEX_OPTIONS),
        fieldCheckbox("minorSurgery", "Cirurgia menor <45min"),
        fieldCheckbox("majorSurgeryPastMonth", "Cirurgia maior último mês"),
        fieldCheckbox("varicoseVeins", "Varizes"),
        fieldCheckbox("ibd", "DII"),
        fieldCheckbox("swollenLegs", "Edema MMII"),
        fieldCheckbox("bmi25", "IMC ≥25"),
        fieldCheckbox("chf", "IC"),
        fieldCheckbox("seriousInfection", "Infecção grave"),
        fieldCheckbox("lungDisease", "DPOC"),
        fieldCheckbox("bedRestUnder72h", "Repouso <72h"),
        fieldCheckbox("bmiOver40", "IMC >40"),
        fieldCheckbox("insulinDiabetes", "DM insulinodependente"),
        fieldCheckbox("chemotherapy", "Quimioterapia"),
        fieldCheckbox("bloodTransfusion", "Hemotransfusão"),
        fieldCheckbox("surgeryOver2h", "Cirurgia >2h"),
        fieldCheckbox("hormoneUse", "Hormônios (mulher)"),
        fieldCheckbox("pregnancyPostpartum", "Gestação/puerpério"),
        fieldCheckbox("pregnancyLoss", "Abortos/natimorto"),
        fieldCheckbox("malignancy", "Neoplasia"),
        fieldCheckbox("plannedMajorSurgery", "Cirurgia maior planejada"),
        fieldCheckbox("plasterCast", "Gesso"),
        fieldCheckbox("centralVenousAccess", "Acesso venoso central"),
        fieldCheckbox("bedRest72hOrMore", "Repouso ≥72h"),
        fieldCheckbox("historyVte", "TVP/TEP prévio"),
        fieldCheckbox("familyHistoryVte", "TEV familiar"),
        fieldCheckbox("knownThrombophilia", "Trombofilia conhecida"),
        fieldCheckbox("electiveJointArthroplasty", "Artroplastia"),
        fieldCheckbox("hipPelvisLegFracture", "Fratura quadril/perna"),
        fieldCheckbox("seriousTrauma", "Trauma grave"),
        fieldCheckbox("spinalCordInjury", "Lesão medular"),
      ],
      missingLabels: { age: "idade", sex: "sexo" },
      buildAssessment: function (ctx) {
        var cap = req("AghuCaprini2013Score", "./caprini-2013-score.js");
        return {
          status: "partial",
          suggested: cap.buildCaprini2013SuggestedAgeSex(
            ctx.passometroHeader,
            ctx.pii,
          ),
        };
      },
      compute: function (values) {
        if (values.age == null || !values.sex) return null;
        var flags = [
          "minorSurgery", "majorSurgeryPastMonth", "varicoseVeins", "ibd",
          "swollenLegs", "bmi25", "chf", "seriousInfection", "lungDisease",
          "bedRestUnder72h", "bmiOver40", "insulinDiabetes", "chemotherapy",
          "bloodTransfusion", "surgeryOver2h", "hormoneUse", "pregnancyPostpartum",
          "pregnancyLoss", "malignancy", "plannedMajorSurgery", "plasterCast",
          "centralVenousAccess", "bedRest72hOrMore", "historyVte",
          "familyHistoryVte", "knownThrombophilia", "electiveJointArthroplasty",
          "hipPelvisLegFracture", "seriousTrauma", "spinalCordInjury",
        ];
        var opts = { ageYears: values.age, sex: values.sex };
        for (var i = 0; i < flags.length; i++) {
          opts[flags[i]] = !!values[flags[i]];
        }
        return req("AghuCaprini2013Score", "./caprini-2013-score.js").computeCaprini2013(opts);
      },
      formatResult: function (result) {
        if (!result) return { text: "Informe idade e sexo.", cls: "muted" };
        return {
          html:
            '<span class="calc-result-value">Caprini ' +
            result.total +
            " — " +
            result.riskLevel +
            "</span>",
          cls: result.highRisk ? "warn" : "ok",
        };
      },
    },
    {
      id: "charlson",
      title: "Charlson (comorbidades)",
      hint: "Índice de Charlson (pesos Quan). Marque as condições presentes.",
      fields: [
        fieldCheckbox("myocardial_infarction", "Enfarte do miocárdio (1)"),
        fieldCheckbox("congestive_heart_failure", "Insuficiência cardíaca (1)"),
        fieldCheckbox("peripheral_vascular_disease", "Doença vascular periférica (1)"),
        fieldCheckbox("cerebrovascular_disease", "Doença cerebrovascular (1)"),
        fieldCheckbox("dementia", "Demência (1)"),
        fieldCheckbox("chronic_pulmonary_disease", "DPOC / pulmonar crónica (1)"),
        fieldCheckbox("rheumatologic_disease", "Doença reumatológica (1)"),
        fieldCheckbox("peptic_ulcer_disease", "Úlcera péptica (1)"),
        fieldCheckbox("liver_mild", "Doença hepática leve (1)"),
        fieldCheckbox("diabetes_uncomplicated", "Diabetes sem complicações (1)"),
        fieldCheckbox("diabetes_complicated", "Diabetes com complicações (2)"),
        fieldCheckbox("hemiplegia_paraplegia", "Hemiplegia/paraplegia (2)"),
        fieldCheckbox("chronic_kidney_disease", "Doença renal crónica (2)"),
        fieldCheckbox("malignancy", "Neoplasia (2)"),
        fieldCheckbox("liver_severe", "Doença hepática grave (3)"),
        fieldCheckbox("metastatic_solid_tumor", "Tumor sólido metastático (6)"),
        fieldCheckbox("aids_hiv", "SIDA/VIH (6)"),
      ],
      missingLabels: {},
      buildAssessment: function () {
        return { status: "partial", suggested: {}, missing: [] };
      },
      compute: function (values) {
        var keys = [
          "myocardial_infarction",
          "congestive_heart_failure",
          "peripheral_vascular_disease",
          "cerebrovascular_disease",
          "dementia",
          "chronic_pulmonary_disease",
          "rheumatologic_disease",
          "peptic_ulcer_disease",
          "liver_mild",
          "diabetes_uncomplicated",
          "diabetes_complicated",
          "hemiplegia_paraplegia",
          "chronic_kidney_disease",
          "malignancy",
          "liver_severe",
          "metastatic_solid_tumor",
          "aids_hiv",
        ];
        var conditions = [];
        for (var i = 0; i < keys.length; i++) {
          if (values[keys[i]]) conditions.push(keys[i]);
        }
        return req("AghuCharlsonScore", "./charlson-score.js").computeCharlson({
          conditions: conditions,
        });
      },
      formatResult: function (result) {
        if (!result) return { text: "Marque as comorbidades presentes.", cls: "muted" };
        return {
          html:
            '<span class="calc-result-value">Charlson ' +
            result.total +
            " — banda " +
            result.band +
            "</span>",
          cls: result.total >= 5 ? "warn" : "ok",
        };
      },
    },
    {
      id: "asa-ps",
      title: "ASA Physical Status",
      hint: "Classificação pré-anestésica I–VI (atribuição do anestesista).",
      fields: [fieldSelect("grade", "ASA", ASA_OPTIONS)],
      missingLabels: { grade: "ASA" },
      buildAssessment: function () {
        return { status: "missing", suggested: {}, missing: ["grade"] };
      },
      compute: function (values) {
        if (values.grade == null || values.grade === "") return null;
        var r = req("AghuAsaPsScore", "./asa-ps-score.js").computeAsaPs({
          grade: values.grade,
        });
        if (r.grade == null) return null;
        return r;
      },
      formatResult: function (result) {
        if (!result) return { text: "Selecione o grau ASA.", cls: "muted" };
        return {
          html:
            '<span class="calc-result-value">ASA ' +
            result.roman +
            "</span>" +
            '<span class="calc-result-detail">' +
            result.label +
            "</span>",
          cls: result.grade >= 4 ? "warn" : "ok",
        };
      },
    },
    {
      id: "kdigo",
      title: "KDIGO LRA (AKI)",
      hint: "Estádio 1–3 por creatinina (nadir vs pico) ou TRS.",
      fields: [
        fieldDecimal("creatinineBaseline", "Creatinina basal (mg/dL)", "creatinineBaseline"),
        fieldDecimal("creatininePeak", "Creatinina pico (mg/dL)", "creatininePeak"),
        fieldCheckbox("onRrt", "Em terapia renal substitutiva (TRS)"),
      ],
      missingLabels: {
        creatinineBaseline: "Cr basal",
        creatininePeak: "Cr pico",
      },
      buildAssessment: function () {
        return { status: "partial", suggested: {}, missing: [] };
      },
      compute: function (values) {
        if (values.onRrt) {
          return req("AghuKdigoAkiStage", "./kdigo-aki-stage.js").stageKdigoAki({
            onRrt: true,
          });
        }
        if (values.creatinineBaseline == null || values.creatininePeak == null) {
          return null;
        }
        return req("AghuKdigoAkiStage", "./kdigo-aki-stage.js").stageKdigoAki({
          measurements: [
            { value: values.creatinineBaseline, unit: "mg/dL", at: "baseline" },
            { value: values.creatininePeak, unit: "mg/dL", at: "peak" },
          ],
          onRrt: false,
        });
      },
      formatResult: function (result) {
        if (!result) {
          return { text: "Informe Cr basal e pico, ou marque TRS.", cls: "muted" };
        }
        if (result.stage == null) {
          return { text: "Dados insuficientes para estadiar.", cls: "muted" };
        }
        return {
          html:
            '<span class="calc-result-value">KDIGO ' +
            result.stage +
            "</span>" +
            (result.criterion
              ? '<span class="calc-result-detail">critério: ' +
                result.criterion +
                "</span>"
              : ""),
          cls: result.stage >= 2 ? "warn" : "ok",
        };
      },
    },
    {
      id: "tnm",
      title: "TNM (AJCC-8)",
      hint: "Valida T/N/M e deriva o estádio agrupado. Topografias: colorretal e esofagogástrica.",
      fields: [
        fieldSelect("t", "T", TNM_T_OPTIONS),
        fieldSelect("n", "N", TNM_N_OPTIONS),
        fieldSelect("m", "M", TNM_M_OPTIONS),
        fieldSelect("topography", "Topografia", TNM_TOPO_OPTIONS),
        fieldSelect("basis", "Basis", TNM_BASIS_OPTIONS),
      ],
      missingLabels: {
        t: "T",
        n: "N",
        m: "M",
        topography: "topografia",
        basis: "basis",
      },
      buildAssessment: function () {
        return { status: "missing", suggested: {}, missing: ["t", "n", "m", "topography", "basis"] };
      },
      compute: function (values) {
        if (!values.t || !values.n || !values.m || !values.topography || !values.basis) {
          return null;
        }
        try {
          return req("AghuTnmStage", "./tnm-stage.js").stageTnm({
            t: values.t,
            n: values.n,
            m: values.m,
            topography: values.topography,
            basis: values.basis,
          });
        } catch (_e) {
          return null;
        }
      },
      formatResult: function (result) {
        if (!result) {
          return { text: "Informe T, N, M, topografia e basis.", cls: "muted" };
        }
        return {
          html:
            '<span class="calc-result-value">Estádio ' +
            result.stageGroup +
            "</span>" +
            '<span class="calc-result-detail">' +
            result.t +
            result.n +
            result.m +
            " · " +
            result.edition +
            "</span>",
          cls: "ok",
        };
      },
    },
    {
      id: "ecog",
      title: "ECOG Performance Status",
      hint: "Atribuição clínica 0–4 (Oken 1982). 5 (morte) não é estado funcional.",
      fields: [fieldSelect("score", "ECOG", ECOG_OPTIONS)],
      missingLabels: { score: "ECOG" },
      buildAssessment: function () {
        return { status: "missing", suggested: {}, missing: ["score"] };
      },
      compute: function (values) {
        if (values.score == null || values.score === "") return null;
        try {
          return req("AghuEcogStatus", "./ecog-status.js").assignEcog({
            score: values.score,
          });
        } catch (_e) {
          return null;
        }
      },
      formatResult: function (result) {
        if (!result) return { text: "Selecione o ECOG (0–4).", cls: "muted" };
        return {
          html:
            '<span class="calc-result-value">ECOG ' +
            result.score +
            "</span>" +
            '<span class="calc-result-detail">' +
            result.label +
            "</span>",
          cls: result.ambulatory ? "ok" : "warn",
        };
      },
    },
    {
      id: "bisap",
      title: "BISAP (pancreatite)",
      hint: "Cinco critérios (Wu 2008). Critério em falta não conta como zero.",
      fields: [
        fieldDecimal("bunMgDl", "BUN (mg/dL)", "bunMgDl"),
        { type: "age", key: "ageYears", label: "Idade (anos)", suggestedKey: "ageYears" },
        fieldCheckbox("impairedMentalStatus", "Alteração do estado mental"),
        fieldCheckbox("sirs", "SIRS presente"),
        fieldCheckbox("pleuralEffusion", "Derrame pleural"),
      ],
      missingLabels: { bunMgDl: "BUN", ageYears: "idade" },
      buildAssessment: function () {
        return { status: "missing", suggested: {}, missing: ["bunMgDl", "ageYears"] };
      },
      compute: function (values) {
        if (values.bunMgDl == null || values.ageYears == null) return null;
        var r = req("AghuBisapScore", "./bisap-score.js").scoreBisap({
          bunMgDl: values.bunMgDl,
          ageYears: values.ageYears,
          impairedMentalStatus: !!values.impairedMentalStatus,
          sirs: !!values.sirs,
          pleuralEffusion: !!values.pleuralEffusion,
        });
        if (r.status === "missing") return null;
        return r;
      },
      formatResult: function (result) {
        if (!result || result.score == null) {
          return { text: "Informe BUN, idade e os três critérios clínicos.", cls: "muted" };
        }
        return {
          html:
            '<span class="calc-result-value">BISAP ' +
            result.score +
            "</span>" +
            '<span class="calc-result-detail">' +
            result.edition +
            (result.severeRisk ? " · risco elevado" : "") +
            "</span>",
          cls: result.severeRisk ? "warn" : "ok",
        };
      },
    },
    {
      id: "tokyo",
      title: "Tokyo Guidelines (TG18)",
      hint: "Grau por condição. Disfunção orgânica = severo. Critério em falta não infere ligeiro.",
      fields: [
        fieldSelect("condition", "Condição", TOKYO_CONDITION_OPTIONS),
        fieldCheckbox("organDysfunction", "Disfunção orgânica presente"),
        fieldCheckbox("leukocytosis", "Leucocitose (colangite)"),
        fieldCheckbox("feverGte39", "Febre ≥39 °C (colangite)"),
        fieldCheckbox("ageGte75", "Idade ≥75 (colangite)"),
        fieldCheckbox("hyperbilirubinemia", "Hiperbilirrubinemia (colangite)"),
        fieldCheckbox("hypoalbuminemia", "Hipoalbuminemia (colangite)"),
        fieldCheckbox("wbcGt18000", "Leucócitos >18 000 (colecistite)"),
        fieldCheckbox("palpableTenderMass", "Massa palpável dolorosa HD (colecistite)"),
        fieldCheckbox("durationGt72h", "Duração >72 h (colecistite)"),
        fieldCheckbox("markedLocalInflammation", "Inflamação local marcada (colecistite)"),
      ],
      missingLabels: { condition: "condição" },
      buildAssessment: function () {
        return { status: "missing", suggested: {}, missing: ["condition"] };
      },
      compute: function (values) {
        if (!values.condition) return null;
        var moderateCriteria =
          values.condition === "cholangitis"
            ? {
                leukocytosis: !!values.leukocytosis,
                feverGte39: !!values.feverGte39,
                ageGte75: !!values.ageGte75,
                hyperbilirubinemia: !!values.hyperbilirubinemia,
                hypoalbuminemia: !!values.hypoalbuminemia,
              }
            : {
                wbcGt18000: !!values.wbcGt18000,
                palpableTenderMass: !!values.palpableTenderMass,
                durationGt72h: !!values.durationGt72h,
                markedLocalInflammation: !!values.markedLocalInflammation,
              };
        var r = req("AghuTokyoGrade", "./tokyo-grade.js").gradeTokyo({
          condition: values.condition,
          organDysfunction: values.organDysfunction ? ["present"] : [],
          moderateCriteria: moderateCriteria,
        });
        if (r.status === "missing") return null;
        return r;
      },
      formatResult: function (result) {
        if (!result || !result.grade) {
          return { text: "Informe a condição e os critérios TG18.", cls: "muted" };
        }
        return {
          html:
            '<span class="calc-result-value">' +
            result.grade +
            "</span>" +
            '<span class="calc-result-detail">' +
            result.condition +
            " · " +
            result.edition +
            "</span>",
          cls: result.grade === "severe" ? "warn" : "ok",
        };
      },
    },
    {
      id: "sofa",
      title: "SOFA (Vincent 1996)",
      hint: "Seis sistemas 0–4. Sistema em falta não conta como zero.",
      fields: [
        fieldDecimal("pao2FiO2", "PaO₂/FiO₂ (mmHg)"),
        fieldCheckbox("mechanicalVentilation", "Ventilação mecânica / suporte respiratório"),
        fieldDecimal("plateletsX10e3UL", "Plaquetas (×10³/µL)"),
        fieldDecimal("bilirubinMgDl", "Bilirrubina (mg/dL)"),
        fieldDecimal("map", "PAM (mmHg)"),
        fieldCheckbox("noVasopressors", "Sem vasopressor (documentado)"),
        fieldDecimal("dopamine", "Dopamina (µg/kg/min)"),
        fieldDecimal("dobutamine", "Dobutamina (µg/kg/min)"),
        fieldDecimal("epinephrine", "Epinefrina (µg/kg/min)"),
        fieldDecimal("norepinephrine", "Norepinefrina (µg/kg/min)"),
        fieldDecimal("gcs", "GCS (3–15)"),
        fieldDecimal("creatinineMgDl", "Creatinina (mg/dL)"),
        fieldDecimal("urineOutputMlDay", "Débito urinário (mL/dia)"),
      ],
      missingLabels: {
        pao2FiO2: "PaO₂/FiO₂",
        plateletsX10e3UL: "plaquetas",
        bilirubinMgDl: "bilirrubina",
        map: "PAM",
        gcs: "GCS",
      },
      buildAssessment: function () {
        return {
          status: "missing",
          suggested: {},
          missing: ["respiratory", "coagulation", "liver", "cardiovascular", "cns", "renal"],
        };
      },
      compute: function (values) {
        var vasopressors;
        if (values.noVasopressors) {
          vasopressors = false;
        } else if (
          values.dopamine != null ||
          values.dobutamine != null ||
          values.epinephrine != null ||
          values.norepinephrine != null
        ) {
          vasopressors = {
            dopamine: values.dopamine,
            dobutamine: values.dobutamine,
            epinephrine: values.epinephrine,
            norepinephrine: values.norepinephrine,
          };
        }
        var r = req("AghuSofaScore", "./sofa-score.js").computeSofa({
          respiratory:
            values.pao2FiO2 == null
              ? undefined
              : {
                  pao2FiO2: values.pao2FiO2,
                  mechanicalVentilation: !!values.mechanicalVentilation,
                },
          coagulation:
            values.plateletsX10e3UL == null
              ? undefined
              : { plateletsX10e3UL: values.plateletsX10e3UL },
          liver:
            values.bilirubinMgDl == null
              ? undefined
              : { bilirubinMgDl: values.bilirubinMgDl },
          cardiovascular:
            values.map == null && vasopressors === undefined
              ? undefined
              : { map: values.map, vasopressors: vasopressors },
          cns: values.gcs == null ? undefined : { gcs: values.gcs },
          renal:
            values.creatinineMgDl == null && values.urineOutputMlDay == null
              ? undefined
              : {
                  creatinineMgDl: values.creatinineMgDl,
                  urineOutputMlDay: values.urineOutputMlDay,
                },
        });
        if (r.status === "missing") return null;
        return r;
      },
      formatResult: function (result) {
        if (!result || result.total == null) {
          return { text: "Informe os seis sistemas. Ausência não conta como zero.", cls: "muted" };
        }
        return {
          html:
            '<span class="calc-result-value">SOFA ' +
            result.total +
            "</span>" +
            '<span class="calc-result-detail">' +
            result.definition +
            "</span>",
          cls: result.total >= 10 ? "warn" : "ok",
        };
      },
    },
    {
      id: "apache2",
      title: "APACHE II",
      hint: "12 variáveis do APS + idade + estado crónico. Variável em falta não assume normal.",
      fields: [
        fieldDecimal("temperatureC", "Temperatura rectal (°C)"),
        fieldDecimal("map", "PAM (mmHg)"),
        fieldDecimal("heartRate", "FC (bpm)"),
        fieldDecimal("respiratoryRate", "FR (irpm)"),
        fieldDecimal("fio2", "FiO₂ (0–1)"),
        fieldDecimal("paO2MmHg", "PaO₂ (mmHg)"),
        fieldDecimal("paCO2MmHg", "PaCO₂ (mmHg) — se FiO₂ ≥0,5"),
        fieldDecimal("arterialPh", "pH arterial"),
        fieldDecimal("sodiumMEqL", "Sódio (mEq/L)"),
        fieldDecimal("potassiumMEqL", "Potássio (mEq/L)"),
        fieldDecimal("creatinineMgDl", "Creatinina (mg/dL)"),
        fieldCheckbox("acuteRenalFailure", "Falência renal aguda (duplica Cr)"),
        fieldDecimal("hematocritPct", "Hematócrito (%)"),
        fieldDecimal("wbcX10e3UL", "Leucócitos (×10³/mm³)"),
        fieldDecimal("gcs", "GCS (3–15)"),
        { type: "age", key: "ageYears", label: "Idade (anos)", suggestedKey: "ageYears" },
        fieldCheckbox(
          "chronicSevere",
          "Insuficiência orgânica grave ou imunossupressão",
        ),
        fieldSelect("admissionType", "Tipo de admissão", APACHE_ADMISSION_OPTIONS),
      ],
      missingLabels: {
        temperatureC: "temperatura",
        map: "PAM",
        heartRate: "FC",
        respiratoryRate: "FR",
        arterialPh: "pH",
        gcs: "GCS",
        ageYears: "idade",
      },
      buildAssessment: function () {
        return {
          status: "missing",
          suggested: {},
          missing: [
            "temperatureC",
            "map",
            "heartRate",
            "respiratoryRate",
            "oxygenation",
            "arterialPh",
            "ageYears",
            "chronicHealth",
          ],
        };
      },
      compute: function (values) {
        if (
          values.temperatureC == null ||
          values.map == null ||
          values.heartRate == null ||
          values.respiratoryRate == null ||
          values.fio2 == null ||
          values.arterialPh == null ||
          values.sodiumMEqL == null ||
          values.potassiumMEqL == null ||
          values.creatinineMgDl == null ||
          values.hematocritPct == null ||
          values.wbcX10e3UL == null ||
          values.gcs == null ||
          values.ageYears == null
        ) {
          return null;
        }
        try {
          var r = req("AghuApache2Score", "./apache2-score.js").computeApache2({
            temperatureC: values.temperatureC,
            map: values.map,
            heartRate: values.heartRate,
            respiratoryRate: values.respiratoryRate,
            oxygenation: {
              fio2: values.fio2,
              paO2MmHg: values.paO2MmHg,
              paCO2MmHg: values.paCO2MmHg,
            },
            arterialPh: values.arterialPh,
            sodiumMEqL: values.sodiumMEqL,
            potassiumMEqL: values.potassiumMEqL,
            creatinineMgDl: values.creatinineMgDl,
            acuteRenalFailure: !!values.acuteRenalFailure,
            hematocritPct: values.hematocritPct,
            wbcX10e3UL: values.wbcX10e3UL,
            gcs: values.gcs,
            ageYears: values.ageYears,
            chronicHealth: {
              severeOrganInsufficiencyOrImmunocompromised: !!values.chronicSevere,
              admissionType: values.admissionType || "nonoperative",
            },
          });
          if (r.status === "missing") return null;
          return r;
        } catch (_e) {
          return null;
        }
      },
      formatResult: function (result) {
        if (!result || result.total == null) {
          return { text: "Informe as 12 variáveis, idade e estado crónico.", cls: "muted" };
        }
        return {
          html:
            '<span class="calc-result-value">APACHE II ' +
            result.total +
            "</span>" +
            '<span class="calc-result-detail">APS ' +
            result.apsTotal +
            " · idade " +
            result.agePoints +
            " · crónico " +
            result.chronicHealthPoints +
            " · " +
            result.edition +
            "</span>",
          cls: result.total >= 25 ? "warn" : "ok",
        };
      },
    },
    {
      id: "nihss",
      title: "NIHSS",
      hint: "15 subitens (Brott 1989). Subitem em falta não soma como zero. Calculadora à cabeceira — sem indicador CPI.",
      fields: [
        fieldSelect("loc", "1a Nível de consciência", NIHSS_0_3),
        fieldSelect("locQuestions", "1b Perguntas de orientação", NIHSS_0_2),
        fieldSelect("locCommands", "1c Comandos", NIHSS_0_2),
        fieldSelect("gaze", "2 Melhor olhar", NIHSS_0_2),
        fieldSelect("visualFields", "3 Campos visuais", NIHSS_0_3),
        fieldSelect("facialPalsy", "4 Paralisia facial", NIHSS_0_3),
        fieldSelect("motorArmLeft", "5a Motor braço esquerdo", NIHSS_0_4),
        fieldSelect("motorArmRight", "5b Motor braço direito", NIHSS_0_4),
        fieldSelect("motorLegLeft", "6a Motor perna esquerda", NIHSS_0_4),
        fieldSelect("motorLegRight", "6b Motor perna direita", NIHSS_0_4),
        fieldSelect("limbAtaxia", "7 Ataxia de membros", NIHSS_0_2),
        fieldSelect("sensory", "8 Sensibilidade", NIHSS_0_2),
        fieldSelect("language", "9 Melhor linguagem", NIHSS_0_3),
        fieldSelect("dysarthria", "10 Disartria", NIHSS_0_2),
        fieldSelect("extinction", "11 Extinção/inatenção", NIHSS_0_2),
      ],
      missingLabels: { loc: "1a" },
      buildAssessment: function () {
        return {
          status: "missing",
          suggested: {},
          missing: [
            "loc",
            "locQuestions",
            "locCommands",
            "gaze",
            "visualFields",
            "facialPalsy",
            "motorArmLeft",
            "motorArmRight",
            "motorLegLeft",
            "motorLegRight",
            "limbAtaxia",
            "sensory",
            "language",
            "dysarthria",
            "extinction",
          ],
        };
      },
      compute: function (values) {
        try {
          var r = req("AghuNihssScore", "./nihss-score.js").computeNihss({
            items: {
              loc: values.loc,
              locQuestions: values.locQuestions,
              locCommands: values.locCommands,
              gaze: values.gaze,
              visualFields: values.visualFields,
              facialPalsy: values.facialPalsy,
              motorArmLeft: values.motorArmLeft,
              motorArmRight: values.motorArmRight,
              motorLegLeft: values.motorLegLeft,
              motorLegRight: values.motorLegRight,
              limbAtaxia: values.limbAtaxia,
              sensory: values.sensory,
              language: values.language,
              dysarthria: values.dysarthria,
              extinction: values.extinction,
            },
          });
          if (r.status === "missing") return null;
          return r;
        } catch (_e) {
          return null;
        }
      },
      formatResult: function (result) {
        if (!result || result.total == null) {
          return { text: "Informe os 15 subitens. Ausência não conta como zero.", cls: "muted" };
        }
        return {
          html:
            '<span class="calc-result-value">NIHSS ' +
            result.total +
            "</span>" +
            '<span class="calc-result-detail">' +
            result.severity +
            " · " +
            result.edition +
            "</span>",
          cls: result.total >= 16 ? "warn" : "ok",
        };
      },
    },
  ];

  function getDef(id) {
    for (var i = 0; i < DEFS.length; i++) {
      if (DEFS[i].id === id) return DEFS[i];
    }
    return null;
  }

  function allIds() {
    return DEFS.map(function (d) {
      return d.id;
    });
  }

  return {
    DEFS: DEFS,
    getDef: getDef,
    allIds: allIds,
    buildContextAssessment: buildContextAssessment,
  };
});

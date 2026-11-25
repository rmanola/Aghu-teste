/**
 * FEAT-314 — Modelos built-in de receita (kits nativos) — defaults de código;
 * editáveis via user-preferences (domínio `receita_templates`).
 * Merge só na leitura; nunca persistir builtins não sobrescritos.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuReceitaTemplateBuiltin = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var BUILTIN_IDS = {
    sintomaticoParacetamol: "__builtin_rx_sintomatico_paracetamol",
    sintomaticoDipirona: "__builtin_rx_sintomatico_dipirona",
    pielonefriteCef: "__builtin_rx_pielonefrite_cef",
    ituNitro: "__builtin_rx_itu_nitro",
    profilaxiaItuGravida: "__builtin_rx_profilaxia_itu_gravida",
    tramadol: "__builtin_rx_tramadol",
    insulina: "__builtin_rx_insulina",
    benzetacilSifilis: "__builtin_rx_benzetacil_sifilis",
    sulfatoFerroso: "__builtin_rx_sulfato_ferroso",
    promestriene: "__builtin_rx_promestriene",
  };

  var BUILTIN_ID_SET = {};
  Object.keys(BUILTIN_IDS).forEach(function (k) {
    BUILTIN_ID_SET[BUILTIN_IDS[k]] = true;
  });

  function isBuiltinTemplateId(id) {
    if (!id) return false;
    return !!BUILTIN_ID_SET[String(id)];
  }

  function line(opts) {
    opts = opts || {};
    return {
      drugName: String(opts.drugName || "").trim(),
      catalogKey: opts.catalogKey ? String(opts.catalogKey) : null,
      presentation: opts.presentation ? String(opts.presentation) : "",
      dose: opts.dose ? String(opts.dose) : "",
      route: opts.route ? String(opts.route) : "",
      posology: String(opts.posology || "").trim(),
      duration: opts.duration ? String(opts.duration) : "",
      quantity: opts.quantity ? String(opts.quantity) : "",
      prescriptionDocumentClass: opts.cls || "SIMPLE",
      classSource: "MANUAL",
      controlListCode: opts.controlListCode ? String(opts.controlListCode) : null,
      validityDays:
        typeof opts.validityDays === "number" && Number.isFinite(opts.validityDays)
          ? opts.validityDays
          : null,
    };
  }

  function antimicrobial(opts) {
    return line(
      Object.assign({}, opts, {
        cls: "SPECIAL_ANTIMICROBIAL",
        controlListCode: opts.controlListCode || "ANTIMICROBIAL",
        validityDays: opts.validityDays != null ? opts.validityDays : 10,
      }),
    );
  }

  function sintomaticoCommonLines() {
    return [
      line({
        drugName: "SIMETICONA 40 MG",
        presentation: "CP 40 MG",
        dose: "40 MG",
        route: "USO ORAL",
        quantity: "01 CAIXA",
        posology: "TOMAR 02 COMPRIMIDOS AÉ DE 4 EM 4 HORAS EM CASO DE GASES.",
      }),
      line({
        drugName: "ESCOPOLAMINA 10 MG",
        presentation: "CP 10 MG",
        dose: "10 MG",
        route: "USO ORAL",
        quantity: "01 CAIXA",
        posology: "TOMAR 01 COMPRIMIDO DE 08 EM 08 HORAS EM CASO DE DOR ABDOMINAL.",
      }),
      line({
        drugName: "ONDANSETRONA 4 MG",
        presentation: "CP 4 MG",
        dose: "4 MG",
        route: "USO ORAL",
        quantity: "01 CAIXA",
        posology: "TOMAR 02 COMPRIMIDOS DE 08 EM 08 HORAS EM CASO DE NÁUSEAS/VÔMITOS.",
      }),
      line({
        drugName: "ÓLEO MINERAL",
        presentation: "SOL ORAL",
        route: "USO ORAL",
        quantity: "1 FRASCO",
        posology: "TOMAR 10 ML DE 12 EM 12 HORAS EM CASO DE CONSTIPAÇÃO.",
      }),
    ];
  }

  function tpl(id, name, description, tags, lines) {
    return {
      id: id,
      name: name,
      description: description || "",
      tags: tags || [],
      lines: lines,
      createdAt: 0,
      updatedAt: 0,
      isBuiltin: true,
    };
  }

  function builtinTemplates() {
    var common = sintomaticoCommonLines();
    return [
      tpl(
        BUILTIN_IDS.sintomaticoParacetamol,
        "Sintomático Paracetamol",
        "Kit sintomático com paracetamol",
        ["sintomatico"],
        common.concat([
          line({
            drugName: "PARACETAMOL 500MG",
            presentation: "CP 500 MG",
            dose: "500MG",
            route: "USO ORAL",
            quantity: "01 CAIXA",
            posology: "TOMAR 1 COMPRIMIDO DE 6 EM 6 HORAS EM CASO DE DOR.",
          }),
        ]),
      ),
      tpl(
        BUILTIN_IDS.sintomaticoDipirona,
        "Sintomáticos Dipirona",
        "Kit sintomático com dipirona",
        ["sintomatico"],
        common.concat([
          line({
            drugName: "DIPIRONA 500MG",
            presentation: "CP 500 MG",
            dose: "500MG",
            route: "USO ORAL",
            quantity: "01 CAIXA",
            posology: "TOMAR 1 COMPRIMIDO DE 6 EM 6 HORAS EM CASO DE DOR.",
          }),
        ]),
      ),
      tpl(
        BUILTIN_IDS.pielonefriteCef,
        "Pielonefrite CEF",
        "Ceftriaxone EV para pielonefrite",
        ["antibiotico", "itu"],
        [
          antimicrobial({
            drugName: "CEFTRIAXONE 1G",
            catalogKey: "CEFTRIAXONE",
            presentation: "EV 1 G",
            dose: "1G",
            route: "USO IV",
            posology: "APLICAR 2 AMPOLAS, ENDOVENOSA, 1 VEZ AO DIA, POR 5 DIAS.",
          }),
        ],
      ),
      tpl(
        BUILTIN_IDS.ituNitro,
        "ITU Nitro",
        "Nitrofurantoína para ITU",
        ["antibiotico", "itu"],
        [
          antimicrobial({
            drugName: "NITROFURANOÍNA 100 MG",
            presentation: "CP 100 MG",
            dose: "100 MG",
            route: "USO ORAL",
            quantity: "30CP",
            posology: "TOMAR 1 COMPRIMIDO A CADA 6 HORAS POR 7 DIAS.",
          }),
        ],
      ),
      tpl(
        BUILTIN_IDS.profilaxiaItuGravida,
        "Profilaxia ITU Grávida",
        "Cefalexina profilática até o parto",
        ["antibiotico", "itu", "gestacao"],
        [
          antimicrobial({
            drugName: "CEFALEXINA 500MG",
            presentation: "CP 500 MG",
            dose: "500MG",
            route: "USO ORAL",
            posology: "TOMAR 1 COMPRIMIDO A NOITE TODOS OS DIAS ATÉ O PARTO",
          }),
        ],
      ),
      tpl(
        BUILTIN_IDS.tramadol,
        "Tramadol (Receita Especial)",
        "Tramadol 50 mg — Receita de Controle Especial",
        ["analgesico", "especial"],
        [
          line({
            drugName: "TRAMADOL 50 MG",
            catalogKey: "TRAMADOL",
            presentation: "CP 50 MG",
            dose: "50 MG",
            route: "USO ORAL",
            quantity: "10 CPS",
            posology:
              "TOMAR 01 COMPRIMIDO AÉ DE 6 EM 6 HORAS EM CASO DE DOR MUITO INTENSA.",
            cls: "SPECIAL_CONTROL",
            controlListCode: "A2",
            validityDays: 30,
          }),
        ],
      ),
      tpl(
        BUILTIN_IDS.insulina,
        "Insulina",
        "NPH + Regular + materiais e perfil glicêmico",
        ["diabetes", "insulina"],
        [
          line({
            drugName: "INSULINA NPH HUMANA 100 UI/ML",
            presentation: "F/A 100 UI/ML",
            dose: "100 UI/ML",
            route: "USO SUBCUTÂNEO",
            quantity: "USO CONTÍNUO",
            posology:
              "APLICAR, POR VIA SUBCUTÂNEA:\nX UI ÀS 6H\nX UI ÀS 14H\nX UI ÀS 22H",
          }),
          line({
            drugName: "INSULINA REGULAR HUMANA 100 UI/ML",
            presentation: "F/A 100 UI/ML",
            dose: "100 UI/ML",
            route: "USO SUBCUTÂNEO",
            quantity: "USO CONTÍNUO",
            posology:
              "APLICAR, VIA SUBCUTÂNEA,\nX UI 30 MINUTOS ANTES DO CAFÉ DA MANHÃ.\nX UI 30 MINUTOS ANTES DO ALMOÇO.\nX UI 30 MINUTOS ANTES DO JANTAR.",
          }),
          line({
            drugName: "LANCETA DESCARTÁVEL",
            quantity: "420 UNIDADES",
            posology: "USO EXTERNO",
          }),
          line({
            drugName: "SERINGA INSULINA 1 ML COM AGULHA 8MM X 0,3MM",
            quantity: "420 UNIDADES",
            posology: "USO EXTERNO",
          }),
          line({
            drugName: "TIRA TESTE PARA GLICOSÍMETRO",
            quantity: "420 UNIDADES",
            posology: "USO EXTERNO",
          }),
          line({
            drugName: "GLICOSÍMETRO",
            quantity: "01 UNIDADE",
            posology: "USO EXTERNO",
          }),
          line({
            drugName: "PERFIL GLICÊMICO",
            posology:
              "MEDIR GLICEMIA CAPILAR 7 VEZES AO DIA E ANOTAR EM FOLHA DE PERFIL GLICÊMICO:\n- ÀS 6H (EM JEJUM)\n- 1 HORA APÓS O CAFÉ DA MANHÃ\n- ANTES DO ALMOÇO\n- 1 HORA APÓS ALMOÇO\n- ANTES DO JANTAR\n- 1 HORA APÓS O JANTAR\n- ÀS 3H",
          }),
        ],
      ),
      tpl(
        BUILTIN_IDS.benzetacilSifilis,
        "Benzenacil Sífilis",
        "Penicilina benzatina — esquema sífilis (ajustar nº de ampolas/doses)",
        ["antibiotico", "ist"],
        [
          antimicrobial({
            drugName: "PENICILINA BENZATINA 1.200.000 UI",
            presentation: "AMP 1.200.000 UI",
            dose: "1.200.000 UI",
            quantity: "2 OU 4 OU 6 AMPOLAS",
            route: "USO INTRAMUSCULAR",
            posology:
              "PRIMEIRA DOSE: APLICAR 2 AMPOLAS VIA IM, 1 EM CADA GLÚTEO, NO DIA DD/MM/YY\n\nSEGUNDA DOSE: APLICAR 2 AMPOLAS VIA IM, 1 EM CADA GLÚTEO, NO DIA D+7 DA PRIMEIRA DOSE\nTERCEIRA DOSE: APLICAR 2 AMPOLAS VIA IM, 1 EM CADA GLÚTEO, NO DIA D+7 DA SEGUNDA DOSE",
          }),
        ],
      ),
      tpl(
        BUILTIN_IDS.sulfatoFerroso,
        "Sulfato Ferroso",
        "Reposição de ferro 60 dias",
        ["ferro"],
        [
          line({
            drugName: "SULFATO FERROSO 40MG",
            presentation: "CP 40 MG",
            dose: "40MG",
            route: "USO ORAL",
            quantity: "120 CP",
            posology:
              "TOMAR UM COMPRIMIDO 30 MIN ANTES DO ALMOÇO E UM 30 MIN ANTES DO JANTAR, DIARIAMENTE, DURANTE 60 DIAS.",
          }),
        ],
      ),
      tpl(
        BUILTIN_IDS.promestriene,
        "Promestriene",
        "Creme vaginal pós-procedimento",
        ["ginecologia"],
        [
          line({
            drugName: "PROMESTRIENO CREME VAGINAL",
            presentation: "GEL",
            quantity: "01 TUBO",
            route: "USO TÓPICO",
            posology:
              "APLICAR POR VIA VAGINAL 3X/SEMANA, INICIANDO 60 DIAS APÓS PROCEDIMENTO CIRÚRGICO",
          }),
        ],
      ),
    ];
  }

  function mergeStoredWithDefaults(storedTemplates) {
    var stored = Array.isArray(storedTemplates) ? storedTemplates.slice() : [];
    var builtins = builtinTemplates();
    var byId = {};
    for (var i = 0; i < stored.length; i++) {
      var row = stored[i];
      if (row && row.id) byId[String(row.id)] = row;
    }
    var out = stored.slice();
    for (var j = 0; j < builtins.length; j++) {
      var b = builtins[j];
      if (!byId[b.id]) out.push(b);
    }
    return out;
  }

  function stripUnmodifiedBuiltins(templates) {
    var list = Array.isArray(templates) ? templates : [];
    var defaults = {};
    var builtins = builtinTemplates();
    for (var i = 0; i < builtins.length; i++) {
      defaults[builtins[i].id] = builtins[i];
    }
    var out = [];
    for (var j = 0; j < list.length; j++) {
      var t = list[j];
      if (!t || !t.id) continue;
      var id = String(t.id);
      if (!isBuiltinTemplateId(id)) {
        out.push(t);
        continue;
      }
      var def = defaults[id];
      if (!def) {
        out.push(t);
        continue;
      }
      if (JSON.stringify(normalizeCmp(t)) !== JSON.stringify(normalizeCmp(def))) {
        out.push(t);
      }
    }
    return out;
  }

  function normalizeCmp(t) {
    return {
      name: String(t.name || "").trim(),
      description: String(t.description || "").trim(),
      lines: Array.isArray(t.lines)
        ? t.lines.map(function (ln) {
            return {
              drugName: String((ln && ln.drugName) || "").trim(),
              posology: String((ln && ln.posology) || "").trim(),
              quantity: String((ln && ln.quantity) || "").trim(),
              dose: String((ln && ln.dose) || "").trim(),
              prescriptionDocumentClass: String(
                (ln && ln.prescriptionDocumentClass) || "SIMPLE",
              ),
            };
          })
        : [],
    };
  }

  function sortBuiltinsFirst(templates) {
    var list = Array.isArray(templates) ? templates.slice() : [];
    list.sort(function (a, b) {
      var aB = isBuiltinTemplateId(a && a.id);
      var bB = isBuiltinTemplateId(b && b.id);
      if (aB !== bB) return aB ? -1 : 1;
      return String((a && a.name) || "").localeCompare(String((b && b.name) || ""), "pt");
    });
    return list;
  }

  return {
    BUILTIN_IDS: BUILTIN_IDS,
    isBuiltinTemplateId: isBuiltinTemplateId,
    builtinTemplates: builtinTemplates,
    mergeStoredWithDefaults: mergeStoredWithDefaults,
    stripUnmodifiedBuiltins: stripUnmodifiedBuiltins,
    sortBuiltinsFirst: sortBuiltinsFirst,
  };
});

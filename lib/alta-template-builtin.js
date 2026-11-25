/**
 * Modelos built-in de alta (HUCAM + FEAT-315 obstétricas) — defaults de código;
 * editáveis via user-preferences.
 */
(function (root, factory) {
  "use strict";
  var api = factory(
    typeof require !== "undefined"
      ? require("./alta-defaults.js")
      : root.AghuAltaDefaults,
    typeof require !== "undefined"
      ? require("./alta-text-template-schema.js")
      : root.AghuAltaTextTemplateSchema,
  );
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuAltaTemplateBuiltin = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (
  altaDefaults,
  altaTextSchema,
) {
  "use strict";

  if (!altaDefaults) {
    throw new Error("alta-template-builtin: alta-defaults required");
  }
  if (!altaTextSchema) {
    throw new Error("alta-template-builtin: alta-text-template-schema required");
  }

  var BUILTIN_IDS = {
    orientacoes: "__builtin_hucam_orientacoes",
    laudo: "__builtin_hucam_laudo",
    atestado: "__builtin_hucam_atestado",
    retorno: "__builtin_hucam_retorno",
    referenciaPreNatal: "__builtin_referencia_prenatal",
    referenciaCad: "__builtin_referencia_cad",
    orientacoesGestante: "__builtin_orientacoes_gestante",
    orientacoesHisterectomiaAbdominal: "__builtin_orientacoes_histerectomia_abdominal",
    orientacoesCesariaPeDmg: "__builtin_orientacoes_cesaria_pe_dmg",
    orientacoesPartoNormal: "__builtin_orientacoes_parto_normal",
    orientacoesColpoperineoplastia: "__builtin_orientacoes_colpoperineoplastia",
    orientacoesHisterectomiaVaginalColpo:
      "__builtin_orientacoes_histerectomia_vaginal_colpo",
  };

  var BUILTIN_ID_SET = {};
  for (var k in BUILTIN_IDS) {
    if (Object.prototype.hasOwnProperty.call(BUILTIN_IDS, k)) {
      BUILTIN_ID_SET[BUILTIN_IDS[k]] = true;
    }
  }

  function isBuiltinTemplateId(id) {
    if (!id) return false;
    return !!BUILTIN_ID_SET[String(id)];
  }

  function makeOrientacoesBuiltin(id, name, description, items) {
    return {
      id: id,
      name: name,
      description: description,
      kind: altaTextSchema.KIND_ORIENTACOES,
      orientacoesItems: items.slice(),
      createdAt: 0,
      updatedAt: 0,
      isBuiltin: true,
    };
  }

  function builtinTemplates() {
    var now = 0;
    return [
      makeOrientacoesBuiltin(
        BUILTIN_IDS.orientacoes,
        "Padrão HUCAM",
        "Orientações padrão do serviço",
        altaDefaults.DEFAULT_ORIENTACOES_ITEMS,
      ),
      makeOrientacoesBuiltin(
        BUILTIN_IDS.orientacoesGestante,
        "Gestante",
        "Sinais de alarme e pré-natal de alto risco",
        altaDefaults.ORIENTACOES_GESTANTE_ITEMS,
      ),
      makeOrientacoesBuiltin(
        BUILTIN_IDS.orientacoesHisterectomiaAbdominal,
        "Histerectomia abdominal",
        "Cuidados pós-operatórios e retorno HUCAM",
        altaDefaults.ORIENTACOES_HISTERECTOMIA_ABDOMINAL_ITEMS,
      ),
      makeOrientacoesBuiltin(
        BUILTIN_IDS.orientacoesCesariaPeDmg,
        "Cesária PE+DMG",
        "Pós-cesárea com pré-eclâmpsia e/ou DMG",
        altaDefaults.ORIENTACOES_CESARIA_PE_DMG_ITEMS,
      ),
      makeOrientacoesBuiltin(
        BUILTIN_IDS.orientacoesPartoNormal,
        "Parto normal",
        "Puerpério e licença-maternidade (datas no apply)",
        altaDefaults.ORIENTACOES_PARTO_NORMAL_ITEMS,
      ),
      makeOrientacoesBuiltin(
        BUILTIN_IDS.orientacoesColpoperineoplastia,
        "Colpoperineoplastia",
        "Pós-operatório de colpoperineoplastia",
        altaDefaults.ORIENTACOES_COLPOPERINEOPLASTIA_ITEMS,
      ),
      makeOrientacoesBuiltin(
        BUILTIN_IDS.orientacoesHisterectomiaVaginalColpo,
        "Histerectomia vaginal + colpoperineoplastia",
        "Pós-operatório combinado e uroginecologia",
        altaDefaults.ORIENTACOES_HISTERECTOMIA_VAGINAL_COLPO_ITEMS,
      ),
      {
        id: BUILTIN_IDS.laudo,
        name: "Padrão HUCAM",
        description: "Evolução padrão de laudo",
        kind: altaTextSchema.KIND_LAUDO,
        laudo: {
          evolucao: altaDefaults.DEFAULT_LAUDO_EVOLUCAO,
          semIntercorrencias: true,
          cid10: "",
          divulgacaoCidAutorizada: false,
        },
        createdAt: now,
        updatedAt: now,
        isBuiltin: true,
      },
      {
        id: BUILTIN_IDS.atestado,
        name: "Padrão HUCAM",
        description: "Afastamento padrão de 15 dias",
        kind: altaTextSchema.KIND_ATESTADO,
        atestado: {
          diasAfastamento: 15,
          cid10: "",
          divulgacaoCidAutorizada: false,
        },
        createdAt: now,
        updatedAt: now,
        isBuiltin: true,
      },
      {
        id: BUILTIN_IDS.retorno,
        name: "Padrão HUCAM",
        description: "Local padrão de retorno ambulatorial",
        kind: altaTextSchema.KIND_RETORNO,
        retorno: {
          localRetorno: altaDefaults.DEFAULT_RETORNO_LOCAL,
          dataHoraRetorno: "",
          medicoRetorno: "",
          staff: "",
          auxiliar1: "",
          auxiliar2: "",
        },
        createdAt: now,
        updatedAt: now,
        isBuiltin: true,
      },
      {
        id: BUILTIN_IDS.referenciaPreNatal,
        name: "Pré-natal alto risco",
        description: "Encaminhamento ambulatorial sintético (sem PHI)",
        kind: altaTextSchema.KIND_REFERENCIA,
        referencia: {
          especialidadeOrigem: "Cirurgia do Aparelho Digestivo",
          encaminhadoPara: "Ambulatório de Pré-natal de Alto Risco — HUCAM",
          cid10: "O24.4",
          hipoteseDiagnostica: "Diabetes mellitus gestacional",
        },
        createdAt: now,
        updatedAt: now,
        isBuiltin: true,
      },
      {
        id: BUILTIN_IDS.referenciaCad,
        name: "CAD / Cirurgia Digestiva",
        description: "Destino ambulatorial CAD HUCAM (sintético)",
        kind: altaTextSchema.KIND_REFERENCIA,
        referencia: {
          especialidadeOrigem: "Cirurgia do Aparelho Digestivo",
          encaminhadoPara: "Ambulatório CAD — Casa 3, 1º andar",
          cid10: "K81.0",
          hipoteseDiagnostica: "Colecistite aguda",
        },
        createdAt: now,
        updatedAt: now,
        isBuiltin: true,
      },
    ];
  }

  function listBuiltinTemplates(kind) {
    var all = builtinTemplates();
    if (!kind) return all.slice();
    var k = altaTextSchema.normalizeKind(kind);
    return all.filter(function (t) {
      return altaTextSchema.normalizeKind(t.kind) === k;
    });
  }

  /**
   * Junta templates guardados com defaults HUCAM/obstétricos ausentes (por id).
   * Versão guardada com id built-in substitui o default de código.
   */
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

  function resolveTemplatesForKind(storedTemplates, kind) {
    var merged = mergeStoredWithDefaults(storedTemplates);
    if (!kind) return merged;
    var k = altaTextSchema.normalizeKind(kind);
    return merged.filter(function (t) {
      return altaTextSchema.normalizeKind(t.kind) === k;
    });
  }

  return {
    BUILTIN_IDS: BUILTIN_IDS,
    isBuiltinTemplateId: isBuiltinTemplateId,
    builtinTemplates: builtinTemplates,
    listBuiltinTemplates: listBuiltinTemplates,
    mergeStoredWithDefaults: mergeStoredWithDefaults,
    resolveTemplatesForKind: resolveTemplatesForKind,
  };
});

/**
 * FEAT-125 — Registo versionado de referências externas para taxas esperadas.
 * Proveniência do denominador O/E: população, ano, citação, whitelist de hosts.
 * Sem PHI; valores seed mantêm paridade com literais inline pré-migração.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuCpiReferenceRegistry = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /** Domínios permitidos em `url` (CPIREF-AC-03). Suffix match (ex. saude.gov.br). */
  var ALLOWED_SOURCE_HOSTS = [
    "facs.org",
    "sts.org",
    "ncdri.acc.org",
    "erassociety.org",
    "nice.org.uk",
    "who.int",
    "jointcommissioninternational.org",
    "ihi.org",
    "ncbi.nlm.nih.gov",
    "pubmed.ncbi.nlm.nih.gov",
    "gov.br",
    "saude.gov.br",
    "anvisa.gov.br",
  ];

  var REQUIRED_FIELDS = ["population", "source", "year", "citation"];

  /**
   * Valores idênticos aos inline pré-FEAT-125 (teste de paridade).
   * Curadoria clínica: Task especialista-medico — metadados, não o value.
   */
  var SEED_ENTRIES = [
    {
      id: "nsqip-2023-appendectomy-mortality",
      measure: "in_hospital_mortality",
      indicatorIds: ["CG-ape-OUT-01"],
      value: 0.005,
      range: [0.003, 0.008],
      population:
        "Apendicectomia de urgência, adultos, ACS NSQIP (EUA); proxy para mortalidade perioperatória",
      source: "American College of Surgeons NSQIP",
      sourceType: "registry",
      year: 2023,
      citation:
        "ACS NSQIP Semiannual Report, 2023 (síntese CPI § 2.1; alvo <0,5% casos não complicados)",
      url: "https://www.facs.org/quality-programs/data-and-registries/acs-nsqip/",
      staleAfterYears: 7,
      notes:
        "Paridade CPI § 2.1 (0,5%). Janela NSQIP típica = 30 dias; indicador CPI = mortalidade intra-hospitalar — usar como proxy, não como match exacto.",
    },
    {
      id: "nsqip-2023-cholecystectomy-mortality",
      measure: "in_hospital_mortality",
      indicatorIds: ["CG-col-OUT-01"],
      value: 0.01,
      range: [0.005, 0.015],
      population:
        "Colecistectomia adultos ACS NSQIP (EUA); mix urgente/electiva — proxy para linha colecistite aguda",
      source: "American College of Surgeons NSQIP",
      sourceType: "registry",
      year: 2023,
      citation:
        "ACS NSQIP Semiannual Report, 2023 (síntese CPI § 2.2; alvo intra-hospitalar <1%)",
      url: "https://www.facs.org/quality-programs/data-and-registries/acs-nsqip/",
      staleAfterYears: 7,
      notes:
        "Paridade CPI § 2.2 (1%). Linha de cuidado = colecistite aguda; fonte agrega electiva — mortalidade electiva tipicamente inferior à urgente.",
    },
    {
      id: "nsqip-2023-hernia-repair-mortality",
      measure: "in_hospital_mortality",
      indicatorIds: ["CG-her-OUT-01"],
      value: 0.005,
      range: [0.002, 0.01],
      population:
        "Reparação de hérnia da parede abdominal, adultos, ACS NSQIP (EUA); mix electiva/urgente",
      source: "American College of Surgeons NSQIP",
      sourceType: "registry",
      year: 2023,
      citation:
        "ACS NSQIP Semiannual Report, 2023 (síntese CPI § 2.3; alvo intra-hospitalar <1%)",
      url: "https://www.facs.org/quality-programs/data-and-registries/acs-nsqip/",
      staleAfterYears: 7,
      notes:
        "Paridade CPI § 2.3 (0,5%). Hérnia inguinal electiva tem mortalidade muito baixa; 0,5% é proxy para mix incluindo urgência/complexidade — não extrapolar a só electiva.",
    },
    {
      id: "era-whipple-90d-mortality",
      measure: "90_day_mortality",
      indicatorIds: ["CAD-OUT-01"],
      value: 0.05,
      range: [0.03, 0.08],
      population:
        "Duodenopancreatectomia (Whipple), adultos, centros mistos; síntese ERA/ACS (não coorte única)",
      source: "Enhanced Recovery After Surgery Society / ACS literature",
      sourceType: "society",
      year: 2022,
      citation:
        "Síntese CPI § 2.5 — benchmarks de mortalidade pós-pancreatectomia (ERA Society / literatura ACS NSQIP)",
      url: "https://erassociety.org/",
      staleAfterYears: 7,
      notes:
        "Paridade CPI § 2.5 (5%). Indicador = 90 dias; CPI lista alvo intra-hospitalar <5% e 90d <7%. Valor 5% é síntese conservadora — não é endpoint único de um paper ERA.",
    },
    {
      id: "nsqip-2023-colorectal-mortality",
      measure: "in_hospital_mortality",
      indicatorIds: ["CAD-OUT-02"],
      value: 0.02,
      range: [0.01, 0.04],
      population:
        "Ressecção colorrectal oncológica, adultos, ACS NSQIP (EUA)",
      source: "American College of Surgeons NSQIP",
      sourceType: "registry",
      year: 2023,
      citation:
        "ACS NSQIP Semiannual Report, 2023 (síntese CPI § 2.4; alvo mortalidade 30d <3%)",
      url: "https://www.facs.org/quality-programs/data-and-registries/acs-nsqip/",
      staleAfterYears: 7,
      notes:
        "Paridade CPI § 2.4 (2%). Doc CPI fala em mortalidade 30 dias; indicador = intra-hospitalar — proxy aceitável dentro do alvo <3%.",
    },
    {
      id: "kdigo-aki-inhospital-mortality",
      measure: "in_hospital_mortality",
      indicatorIds: ["NEF-OUT-01"],
      value: 0.2,
      range: [0.1, 0.35],
      population:
        "LRA hospitalar em adultos (definições KDIGO); taxa agregada — não estratificada por estádio",
      source: "KDIGO / literature synthesis (NCBI)",
      sourceType: "society",
      year: 2021,
      citation:
        "Contexto de mortalidade em LRA (síntese CPI § 2.8); guideline KDIGO AKI 2012 define estádios, não a taxa esperada de 20%",
      url: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4089595/",
      staleAfterYears: 7,
      notes:
        "Paridade CPI § 2.8 (20%). Alvos CPI por estádio: <15% (KDIGO 1), <25% (2–3). year=2021 = ano da síntese de curadoria (não o ano do guideline 2012). Taxa plana sobestima estádio 1 e subestima estádio 3/TRS.",
    },
    {
      id: "nsqip-clavien-gte3-appendectomy",
      measure: "clavien_gte3_rate",
      indicatorIds: ["CG-ape-SAF-01"],
      population:
        "Apendicectomia adultos ACS NSQIP — taxa esperada de Clavien-Dindo ≥ III; valor numérico por curar (especialista-medico)",
      source: "American College of Surgeons NSQIP",
      sourceType: "registry",
      year: 2023,
      citation:
        "ACS NSQIP Semiannual Report, 2023 — dependência declarada para CG-ape-SAF-01; sem benchmark inventado nesta FEAT",
      url: "https://www.facs.org/quality-programs/data-and-registries/acs-nsqip/",
      staleAfterYears: 7,
      notes:
        "FEAT-147 CPIPOP-AC-12: expectedRate sem value até curadoria. avoidedComplicationsPerLosDay permanece blocked.",
    },
    {
      id: "nsqip-clavien-gte3-cholecystectomy",
      measure: "clavien_gte3_rate",
      indicatorIds: ["CG-col-SAF-01"],
      population:
        "Colecistectomia adultos ACS NSQIP — taxa esperada de Clavien-Dindo ≥ III; valor numérico por curar (especialista-medico)",
      source: "American College of Surgeons NSQIP",
      sourceType: "registry",
      year: 2023,
      citation:
        "ACS NSQIP Semiannual Report, 2023 — dependência declarada para CG-col-SAF-01; sem benchmark inventado nesta FEAT",
      url: "https://www.facs.org/quality-programs/data-and-registries/acs-nsqip/",
      staleAfterYears: 7,
      notes:
        "FEAT-147 CPIPOP-AC-12: expectedRate sem value até curadoria. avoidedComplicationsPerLosDay permanece blocked.",
    },
    {
      id: "nsqip-clavien-gte3-hernia",
      measure: "clavien_gte3_rate",
      indicatorIds: ["CG-her-SAF-01"],
      population:
        "Reparação de hérnia da parede abdominal, adultos, ACS NSQIP — taxa esperada de Clavien-Dindo ≥ III; valor numérico por curar (especialista-medico)",
      source: "American College of Surgeons NSQIP",
      sourceType: "registry",
      year: 2023,
      citation:
        "ACS NSQIP Semiannual Report, 2023 — dependência declarada para CG-her-SAF-01; sem benchmark inventado nesta FEAT",
      url: "https://www.facs.org/quality-programs/data-and-registries/acs-nsqip/",
      staleAfterYears: 7,
      notes:
        "FEAT-147 CPIPOP-AC-12: expectedRate sem value até curadoria. avoidedComplicationsPerLosDay permanece blocked.",
    },
    {
      id: "textbook-outcome-perioperative-v1",
      measure: "composite_definition",
      indicatorIds: ["CAD-VAL-02"],
      population:
        "Adaptação local, quatro critérios (Clavien<IIIa, sem reintervenção não planeada, sem readmissão 30d, sem óbito 90d) — não reproduz os sete critérios originais",
      source: "Conceito de textbook outcome em cirurgia oncológica digestiva",
      sourceType: "literature",
      year: 2017,
      citation:
        "Busweiler LAD et al., 'Textbook outcome as a composite measure in oesophagogastric cancer surgery', Br J Surg 2017;104(6):742-750 — origem do conceito; composição local simplificada face aos critérios do estudo, curada com especialista-medico",
      url: "https://pubmed.ncbi.nlm.nih.gov/28240357/",
      staleAfterYears: null,
      notes:
        "Definição distinta e paralela a computeTextbookOutcome (lib/hpb-computed.js, fórmula v2.5 do CRF HPB). Nunca as duas no mesmo indicador para o mesmo episódio — a precedência captura/HPB escolhe uma fonte por episódio.",
    },
    {
      id: "contrast-aki-window-72h",
      measure: "contrast_aki_window_hours",
      indicatorIds: ["NEF-SAF-02"],
      value: 72,
      range: [48, 72],
      population:
        "Adultos com LRA hospitalar e exposição a contraste iodado intravascular; janela de detecção citável 48–72h",
      source: "KDIGO / literature synthesis (NCBI)",
      sourceType: "society",
      year: 2012,
      citation:
        "KDIGO Clinical Practice Guideline for Acute Kidney Injury (2012) e sínteses de LRA associada a contraste — limite superior 72h adoptado no CPI (FEAT-149 Clarificação 5)",
      url: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4089595/",
      staleAfterYears: 15,
      notes:
        "FEAT-149 CPINEF2-AC-04/05: constante CONTRAST_AKI_WINDOW_HOURS=72 citada por este referenceId; não hardcoded solto no agregado.",
    },
  ];

  var REGISTRY = {
    registryVersion: 1,
    entries: SEED_ENTRIES.slice(),
    superseded: [],
  };

  function asArray(v) {
    return Array.isArray(v) ? v : [];
  }

  function str(v) {
    return v == null ? "" : String(v);
  }

  function hostFromUrl(url) {
    var s = str(url).trim();
    if (!s) return "";
    try {
      var u = new URL(s);
      return (u.hostname || "").toLowerCase().replace(/^www\./, "");
    } catch (_e) {
      return "";
    }
  }

  function hostAllowed(host) {
    if (!host) return false;
    for (var i = 0; i < ALLOWED_SOURCE_HOSTS.length; i++) {
      var allowed = ALLOWED_SOURCE_HOSTS[i].toLowerCase();
      if (host === allowed) return true;
      if (host.length > allowed.length && host.slice(-(allowed.length + 1)) === "." + allowed) {
        return true;
      }
    }
    return false;
  }

  /**
   * @param {object} [registry]
   * @returns {{ ok: boolean, errors: string[] }}
   */
  function validateRegistry(registry) {
    var reg = registry && typeof registry === "object" ? registry : REGISTRY;
    var errors = [];
    var entries = asArray(reg.entries);
    var superseded = asArray(reg.superseded);
    var activeById = {};
    var activeByIndicator = {};

    function checkEntry(entry, label) {
      if (!entry || typeof entry !== "object") {
        errors.push(label + ": not an object");
        return;
      }
      var id = str(entry.id);
      if (!id) errors.push(label + ": missing id");

      for (var f = 0; f < REQUIRED_FIELDS.length; f++) {
        var field = REQUIRED_FIELDS[f];
        var val = entry[field];
        if (val == null || (typeof val === "string" && !String(val).trim())) {
          errors.push(
            (id || label) + ": missing required field `" + field + "`",
          );
        }
      }

      if (entry.year != null && !Number.isFinite(Number(entry.year))) {
        errors.push((id || label) + ": year must be numeric");
      }

      if (
        entry.value != null &&
        !Number.isFinite(Number(entry.value)) &&
        !Array.isArray(entry.range)
      ) {
        errors.push((id || label) + ": value or range required");
      }

      var host = hostFromUrl(entry.url);
      if (!host) {
        errors.push((id || label) + ": url missing or unparseable");
      } else if (!hostAllowed(host)) {
        errors.push(
          (id || label) +
            ": source host not in whitelist: " +
            host,
        );
      }
    }

    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      checkEntry(e, "entries[" + i + "]");
      var eid = str(e && e.id);
      if (eid) {
        if (activeById[eid]) {
          errors.push("duplicate active id: " + eid);
        }
        activeById[eid] = e;
      }
      var inds = asArray(e && e.indicatorIds);
      for (var j = 0; j < inds.length; j++) {
        var indId = str(inds[j]);
        if (!indId) continue;
        if (activeByIndicator[indId]) {
          errors.push(
            "two active references for indicator `" +
              indId +
              "`: `" +
              activeByIndicator[indId] +
              "` and `" +
              eid +
              "` — declare a single choice on the indicator",
          );
        } else {
          activeByIndicator[indId] = eid;
        }
      }
    }

    for (var s = 0; s < superseded.length; s++) {
      checkEntry(superseded[s], "superseded[" + s + "]");
    }

    if (reg.registryVersion == null || !Number.isFinite(Number(reg.registryVersion))) {
      errors.push("registryVersion must be a finite number");
    }

    return { ok: errors.length === 0, errors: errors };
  }

  function findInList(list, id) {
    var want = str(id);
    for (var i = 0; i < list.length; i++) {
      if (list[i] && str(list[i].id) === want) return list[i];
    }
    return null;
  }

  /**
   * Resolve referência activa, ou histórica por asOfVersion / asOfDate.
   * @param {string} id
   * @param {{ asOfVersion?: number, asOfDate?: string|Date, registry?: object }|null} [options]
   */
  function resolveReference(id, options) {
    var opts = options && typeof options === "object" ? options : {};
    var reg = opts.registry && typeof opts.registry === "object" ? opts.registry : REGISTRY;
    var entries = asArray(reg.entries);
    var superseded = asArray(reg.superseded);
    var want = str(id);
    if (!want) return null;

    if (opts.asOfVersion != null && Number.isFinite(Number(opts.asOfVersion))) {
      var asOf = Number(opts.asOfVersion);
      var hist = [];
      for (var s = 0; s < superseded.length; s++) {
        var se = superseded[s];
        if (se && str(se.id) === want && Number(se.registryVersion) === asOf) {
          hist.push(se);
        }
      }
      if (hist.length) return Object.assign({}, hist[0]);
      // activa só se registryVersion actual == asOf (ainda não supersedida nessa versão)
      var active = findInList(entries, want);
      if (active && Number(reg.registryVersion) === asOf) {
        return Object.assign({}, active);
      }
      // activa com registryVersion <= asOf e sem superseded nessa versão
      if (active) {
        var supersededAtOrBefore = false;
        for (var t = 0; t < superseded.length; t++) {
          var old = superseded[t];
          if (
            old &&
            str(old.id) === want &&
            Number(old.registryVersion) <= asOf &&
            Number(reg.registryVersion) > asOf
          ) {
            // busca a entrada supersedida exactamente nessa versão
          }
          if (old && str(old.supersededBy) === want) {
            /* ignore */
          }
        }
        // Preferir entry em superseded com registryVersion === asOf; senão activa se asOf === current
        for (var u = 0; u < superseded.length; u++) {
          if (
            superseded[u] &&
            str(superseded[u].id) === want &&
            Number(superseded[u].registryVersion) === asOf
          ) {
            return Object.assign({}, superseded[u]);
          }
        }
        if (Number(reg.registryVersion) === asOf && active) {
          return Object.assign({}, active);
        }
        void supersededAtOrBefore;
      }
      return null;
    }

    var hit = findInList(entries, want);
    return hit ? Object.assign({}, hit) : null;
  }

  /**
   * CPIREF-AC-04: stale se (asOfYear - entry.year) > staleAfterYears.
   * @param {object} entry
   * @param {string|Date|number} [asOfDate]
   */
  function isStale(entry, asOfDate) {
    if (!entry || entry.year == null) return false;
    var threshold = Number(entry.staleAfterYears);
    if (!Number.isFinite(threshold)) threshold = 7;
    var asOfYear;
    if (asOfDate == null) {
      asOfYear = new Date().getUTCFullYear();
    } else if (typeof asOfDate === "number" && Number.isFinite(asOfDate)) {
      asOfYear = asOfDate < 3000 ? asOfDate : new Date(asOfDate).getUTCFullYear();
    } else {
      var d = new Date(asOfDate);
      asOfYear = Number.isFinite(d.getTime())
        ? d.getUTCFullYear()
        : new Date().getUTCFullYear();
    }
    return asOfYear - Number(entry.year) > threshold;
  }

  /**
   * CPIREF-AC-11: citações das referências em uso — sem contagens de coorte.
   * @param {string[]} indicatorIds
   * @param {{ registry?: object }|null} [options]
   */
  function exportReferencesInUse(indicatorIds, options) {
    var opts = options && typeof options === "object" ? options : {};
    var reg = opts.registry && typeof opts.registry === "object" ? opts.registry : REGISTRY;
    var ids = asArray(indicatorIds);
    var seen = {};
    var out = [];
    for (var i = 0; i < ids.length; i++) {
      var indId = str(ids[i]);
      var entries = asArray(reg.entries);
      for (var j = 0; j < entries.length; j++) {
        var e = entries[j];
        if (!e) continue;
        var linked = asArray(e.indicatorIds);
        var match = linked.indexOf(indId) !== -1;
        if (!match) continue;
        var rid = str(e.id);
        if (seen[rid]) continue;
        seen[rid] = true;
        out.push({
          id: rid,
          measure: e.measure,
          value: e.value,
          range: e.range || null,
          population: e.population,
          source: e.source,
          sourceType: e.sourceType,
          year: e.year,
          citation: e.citation,
          url: e.url,
          indicatorIds: linked.slice(),
          notes: e.notes || null,
        });
      }
    }
    return out;
  }

  /**
   * Incrementa versão e move entrada activa para superseded (CPIREF-AC-09).
   * @param {object} registry
   * @param {string} id
   * @param {object} nextEntry — nova activa (mesmo id ou supersededBy)
   */
  function supersedeEntry(registry, id, nextEntry) {
    var reg = registry && typeof registry === "object" ? registry : REGISTRY;
    var want = str(id);
    var entries = asArray(reg.entries);
    var idx = -1;
    for (var i = 0; i < entries.length; i++) {
      if (entries[i] && str(entries[i].id) === want) {
        idx = i;
        break;
      }
    }
    if (idx < 0) return { ok: false, error: "active entry not found: " + want };

    var prev = Object.assign({}, entries[idx], {
      registryVersion: Number(reg.registryVersion),
      supersededAt: (nextEntry && nextEntry.supersededAt) || new Date().toISOString().slice(0, 10),
      supersededBy: str(nextEntry && (nextEntry.id || nextEntry.supersededBy)) || want,
    });
    var superseded = asArray(reg.superseded).slice();
    superseded.push(prev);

    var next = Object.assign({}, nextEntry);
    delete next.supersededAt;
    delete next.supersededBy;
    if (!next.id) next.id = want;

    var newEntries = entries.slice();
    newEntries[idx] = next;

    return {
      ok: true,
      registry: {
        registryVersion: Number(reg.registryVersion) + 1,
        entries: newEntries,
        superseded: superseded,
      },
    };
  }

  /**
   * FEAT-128 — troca de referência ancorada numa decisão registada. `supersedeEntry`
   * continua a ser o mecanismo; o que esta função acrescenta é a recusa de uma
   * troca sem decisão: sem ela, o denominador do O/E mudava e o registo do
   * comité ficava a dizer que não tinha mudado.
   *
   * Não conhece o formato interno do registo de decisão — verifica só o que a
   * troca exige: `kind`, `rationale`, `from.referenceId` e `to.referenceId`.
   *
   * @param {object} registry
   * @param {{ kind?: string, rationale?: string, id?: string,
   *   from?: { referenceId?: string }, to?: { referenceId?: string } }} decision
   * @param {object} nextEntry — entrada nova (mesma forma de `supersedeEntry`)
   * @returns {{ ok: boolean, registry?: object, error?: string }}
   */
  function applyReferenceChangeDecision(registry, decision, nextEntry) {
    var d = decision && typeof decision === "object" ? decision : null;
    if (!d) {
      return { ok: false, error: "troca de referência exige uma decisão registada" };
    }
    if (str(d.kind) !== "reference_change") {
      return {
        ok: false,
        error: "decisão de kind " + (str(d.kind) || "ausente") + " não autoriza troca de referência",
      };
    }
    if (!str(d.rationale).trim()) {
      return { ok: false, error: "decisão sem `rationale` não autoriza troca de referência" };
    }
    var from = d.from && typeof d.from === "object" ? d.from : {};
    var to = d.to && typeof d.to === "object" ? d.to : {};
    var fromId = str(from.referenceId).trim();
    var toId = str(to.referenceId).trim();
    if (!fromId || !toId) {
      return {
        ok: false,
        error: "decisão de troca exige `from.referenceId` e `to.referenceId`",
      };
    }

    var next = Object.assign({}, nextEntry || {});
    if (!next.id) next.id = toId;
    if (str(next.id) !== toId) {
      return {
        ok: false,
        error: "entrada nova (" + str(next.id) + ") não corresponde a `to.referenceId` (" + toId + ")",
      };
    }

    var result = supersedeEntry(registry, fromId, next);
    if (!result.ok) return result;
    return {
      ok: true,
      registry: result.registry,
      decisionId: str(d.id) || null,
    };
  }

  return {
    ALLOWED_SOURCE_HOSTS: ALLOWED_SOURCE_HOSTS,
    applyReferenceChangeDecision: applyReferenceChangeDecision,
    REGISTRY: REGISTRY,
    validateRegistry: validateRegistry,
    resolveReference: resolveReference,
    isStale: isStale,
    exportReferencesInUse: exportReferencesInUse,
    supersedeEntry: supersedeEntry,
    hostFromUrl: hostFromUrl,
  };
});

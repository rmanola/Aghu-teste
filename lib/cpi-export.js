/**
 * FEAT-123 — Export agregado CSV + JSON do agregado CPI (FEAT-120), sem PHI.
 * Gerado no cliente a partir do agregado já em memória; sem endpoint novo.
 * Supressão preservada — o ficheiro nunca é mais permissivo que o ecrã.
 *
 * FEAT-128 — o pacote mensal do comité é mais um formato deste mesmo export, e
 * não um caminho paralelo: é o artefacto que mais provavelmente sai do produto
 * para fora dele, pelo que herda a supressão daqui e recusa identificadores à
 * saída (CPIGOV-AC-11/12/13).
 *
 * FEAT-133 — relatório periódico (trimestral/anual): consolida JSON já calculado
 * em seis secções; não recalcula indicador, sinal nem validação (CPIPER-AC-08).
 * Advertências viajam junto do respectivo resultado, nunca num rodapé.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuCpiExport = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var CSV_HEADER_ROW =
    "linha,indicador,dimensao,estado,fonte,n,observado,esperado,oe,ic95_inf,ic95_sup";

  function asArray(v) {
    return Array.isArray(v) ? v : [];
  }

  function csvCell(v) {
    if (v == null) return "";
    var s = String(v);
    if (s.indexOf(",") !== -1 || s.indexOf('"') !== -1 || s.indexOf("\n") !== -1) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  /**
   * @param {object} aggregate — saída de aggregateCpi (FEAT-120)
   * @returns {Array<object>} linhas planas, uma por indicador
   */
  function flattenAggregate(aggregate) {
    var rows = [];
    var careLines = asArray(aggregate && aggregate.careLines);
    for (var i = 0; i < careLines.length; i++) {
      var line = careLines[i];
      var indicators = asArray(line && line.indicators);
      for (var j = 0; j < indicators.length; j++) {
        var ind = indicators[j];
        var suppressed = !!ind.suppressed;
        var blocked = ind.status === "blocked";
        rows.push({
          careLineId: line.careLineId,
          indicatorId: ind.id,
          dimension: ind.dimension,
          status: ind.status,
          source: ind.source || (blocked ? "" : "auto"),
          n: suppressed || blocked ? "" : line.n,
          observed: suppressed || blocked ? "" : ind.observed,
          expected: suppressed || blocked ? "" : ind.expected,
          ratio: suppressed || blocked ? "" : ind.ratio,
          ci95Lower:
            suppressed || blocked || !ind.ci95 ? "" : ind.ci95[0],
          ci95Upper:
            suppressed || blocked || !ind.ci95 ? "" : ind.ci95[1],
        });
      }
    }
    return rows;
  }

  /**
   * CPIDQ-AC-11/12/13: sem identificadores, supressão preservada, cabeçalho
   * reproduzível (período + matchVersion + data de geração).
   * @param {object} aggregate
   * @param {{ generatedAt?: string }} [options]
   * @returns {string}
   */
  function exportCpiCsv(aggregate, options) {
    var opts = options && typeof options === "object" ? options : {};
    var generatedAt = opts.generatedAt || "";
    var period = aggregate && aggregate.period;
    var periodLabel =
      period && typeof period === "object"
        ? (period.from || "") + ".." + (period.to || "")
        : String(period || "");
    var matchVersion = aggregate && aggregate.matchVersion;

    var lines = [];
    lines.push(
      "# AGHU CPI — export agregado",
      "# periodo: " +
        periodLabel +
        " | matchVersion: " +
        (matchVersion == null ? "" : matchVersion) +
        " | gerado: " +
        generatedAt,
    );
    lines.push(CSV_HEADER_ROW);

    var rows = flattenAggregate(aggregate);
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      lines.push(
        [
          csvCell(r.careLineId),
          csvCell(r.indicatorId),
          csvCell(r.dimension),
          csvCell(r.status),
          csvCell(r.source),
          csvCell(r.n),
          csvCell(r.observed),
          csvCell(r.expected),
          csvCell(r.ratio),
          csvCell(r.ci95Lower),
          csvCell(r.ci95Upper),
        ].join(","),
      );
    }

    // FEAT-127 — validação do modelo em bloco de comentário, para não alargar
    // o cabeçalho de colunas que já é contrato dos consumidores do CSV.
    var validations = asArray(aggregate && aggregate.modelValidation);
    if (validations.length) {
      lines.push("# validacao de modelos de risco");
      for (var v = 0; v < validations.length; v++) {
        var mv = validations[v];
        lines.push(
          "# " +
            csvCell(mv.key || mv.model) +
            " | estado: " +
            csvCell(mv.status) +
            " | cobertura: " +
            csvCell(mv.coverageShare) +
            " | eventos: " +
            csvCell(mv.events) +
            " | declive: " +
            csvCell(mv.calibrationSlope) +
            " | intercepto: " +
            csvCell(mv.calibrationIntercept) +
            " | c: " +
            csvCell(mv.cStatistic) +
            " | brier: " +
            csvCell(mv.brier),
        );
      }
    }

    var refs = asArray(aggregate && aggregate.references);
    if (refs.length) {
      lines.push("# referencias");
      for (var r = 0; r < refs.length; r++) {
        var ref = refs[r];
        lines.push(
          "# " +
            csvCell(ref.id) +
            " | " +
            csvCell(ref.citation) +
            " | " +
            csvCell(ref.year) +
            " | " +
            csvCell(ref.population) +
            " | " +
            csvCell(ref.url),
        );
      }
    }
    return lines.join("\n") + "\n";
  }

  /**
   * @param {object} aggregate
   * @param {{ generatedAt?: string }} [options]
   * @returns {string}
   */
  function exportCpiJson(aggregate, options) {
    var opts = options && typeof options === "object" ? options : {};
    var generatedAt = opts.generatedAt || "";
    var references = asArray(aggregate && aggregate.references).map(function (ref) {
      return {
        id: ref.id,
        measure: ref.measure,
        value: ref.value,
        range: ref.range || null,
        population: ref.population,
        source: ref.source,
        sourceType: ref.sourceType,
        year: ref.year,
        citation: ref.citation,
        url: ref.url,
        indicatorIds: asArray(ref.indicatorIds).slice(),
        notes: ref.notes || null,
      };
    });
    var payload = {
      period: aggregate && aggregate.period,
      matchVersion: aggregate && aggregate.matchVersion,
      generatedAt: generatedAt,
      rows: flattenAggregate(aggregate),
      references: references,
    };
    // FEAT-127 — só quando existe; um export sem validação não passa a
    // declarar uma chave vazia que se leria como «validação em falta».
    var validations = asArray(aggregate && aggregate.modelValidation);
    if (validations.length) {
      payload.modelValidation = validations.map(function (mv) {
        return {
          key: mv.key,
          model: mv.model != null ? mv.model : null,
          careLineId: mv.careLineId != null ? mv.careLineId : null,
          outcome: mv.outcome != null ? mv.outcome : null,
          status: mv.status,
          statusReason: mv.statusReason != null ? mv.statusReason : null,
          coverageShare: mv.coverageShare != null ? mv.coverageShare : null,
          n: mv.n != null ? mv.n : null,
          events: mv.events != null ? mv.events : null,
          calibrationSlope:
            mv.calibrationSlope != null ? mv.calibrationSlope : null,
          calibrationSlopeCi95: mv.calibrationSlopeCi95 || null,
          calibrationIntercept:
            mv.calibrationIntercept != null ? mv.calibrationIntercept : null,
          calibrationInterceptCi95: mv.calibrationInterceptCi95 || null,
          biasDirection: mv.biasDirection != null ? mv.biasDirection : null,
          cStatistic: mv.cStatistic != null ? mv.cStatistic : null,
          cCi95: mv.cCi95 || null,
          chanceLevel: mv.chanceLevel === true,
          brier: mv.brier != null ? mv.brier : null,
        };
      });
    }
    return JSON.stringify(payload, null, 2);
  }

  // -------------------------------------------------------------------------
  // FEAT-128 — pacote mensal do comité
  // -------------------------------------------------------------------------

  /**
   * As cinco secções, por ordem fixa. São sempre emitidas, mesmo vazias: um
   * pacote com secções em falta é ambíguo entre «nada a assinalar» e «não foi
   * gerado», e é essa ambiguidade que faz um comité perder a cadência
   * (CPIGOV-AC-13).
   */
  var COMMITTEE_SECTIONS = Object.freeze([
    Object.freeze({ id: "signals", title: "Sinais de causa especial do período" }),
    Object.freeze({ id: "model_validation", title: "Estados de validação de modelo alterados" }),
    Object.freeze({ id: "care_line_candidates", title: "Linhas candidatas e prontidão de promoção" }),
    Object.freeze({ id: "references", title: "Referências obsoletas ou em desajuste de população" }),
    Object.freeze({ id: "data_gaps", title: "Lacunas de dados e indicadores bloqueados" }),
  ]);

  /**
   * Chaves que denunciam um identificador de doente ou de profissional. O
   * pacote é verificado contra elas depois de montado — recusar à saída é o
   * único ponto onde a garantia cobre também o que o caller acrescentou
   * (CPIGOV-AC-12).
   */
  var FORBIDDEN_PACKET_KEYS = Object.freeze([
    "patientKey",
    "recordClientId",
    "record_client_id",
    "prontuario",
    "nome",
    "dob",
    "dataNascimento",
    "cpf",
    "email",
    "userId",
    "user_id",
    "professionalId",
    "profissional",
    "chefe",
    "equipe",
    "memberKey",
    "memberLabel",
    "crm",
  ]);

  var LONG_DIGIT_RUN = /\d{6,}/;
  var FORMATTED_CPF = /\d{3}\.\d{3}\.\d{3}-\d{2}/;

  /**
   * Defesa em profundidade: as secções são montadas campo a campo, pelo que
   * nenhuma chave arbitrária do caller lá chega — esta verificação é a segunda
   * barreira, para o caso de uma secção futura passar um objecto inteiro.
   */
  function assertNoIdentifiers(value, path) {
    // Texto livre (o `rationale` de uma decisão) atravessa a verificação de
    // chaves, porque a chave é legítima e só o valor é que não. O registo já
    // recusa isto à escrita; aqui é a barreira para o texto que entrou por
    // outra via.
    if (typeof value === "string") {
      if (LONG_DIGIT_RUN.test(value) || FORMATTED_CPF.test(value)) {
        throw new Error(
          "cpi-export: pacote do comité não pode conter identificador — texto em " +
            path +
            " tem sequência de dígitos com forma de prontuário ou CPF (CPIGOV-AC-12)",
        );
      }
      return;
    }
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i++) {
        assertNoIdentifiers(value[i], path + "[" + i + "]");
      }
      return;
    }
    var keys = Object.keys(value);
    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];
      if (FORBIDDEN_PACKET_KEYS.indexOf(key) !== -1) {
        throw new Error(
          "cpi-export: pacote do comité não pode conter identificador — chave `" +
            key +
            "` em " +
            path +
            " (CPIGOV-AC-12)",
        );
      }
      assertNoIdentifiers(value[key], path + "." + key);
    }
  }

  function str(v) {
    return v == null ? "" : String(v);
  }

  function section(id, title, items, conclusion) {
    return {
      id: id,
      title: title,
      empty: items.length === 0,
      items: items,
      conclusion: conclusion,
    };
  }

  /** Sinais do período — só alertas de âmbito de linha entram no pacote. */
  function signalItems(alerts) {
    var out = [];
    var list = asArray(alerts);
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      if (!a || (a.scope && a.scope !== "care_line")) continue;
      out.push({
        careLineId: a.careLineId,
        careLineLabel: a.careLineLabel || a.careLineId,
        indicatorId: a.indicatorId,
        indicatorLabel: a.indicatorLabel || a.indicatorId,
        rule: a.rule,
        ruleDescription: a.ruleDescription || "",
        periodLabel: a.periodLabel,
        direction: a.direction == null ? null : a.direction,
      });
    }
    return out;
  }

  /** Estados de validação que mudaram desde o pacote anterior. */
  function validationChangeItems(entries) {
    var out = [];
    var list = asArray(entries);
    for (var i = 0; i < list.length; i++) {
      var mv = list[i];
      if (!mv) continue;
      var previous = mv.previousStatus == null ? null : str(mv.previousStatus);
      var current = str(mv.status);
      if (previous !== null && previous === current) continue;
      out.push({
        key: mv.key || mv.model || null,
        model: mv.model == null ? null : mv.model,
        careLineId: mv.careLineId == null ? null : mv.careLineId,
        outcome: mv.outcome == null ? null : mv.outcome,
        previousStatus: previous,
        status: current,
        statusReason: mv.statusReason == null ? null : mv.statusReason,
        coverageShare: mv.coverageShare == null ? null : mv.coverageShare,
      });
    }
    return out;
  }

  /** Candidatas e a distância que falta aos mínimos da FEAT-124. */
  function candidateItems(candidates) {
    var out = [];
    var list = asArray(candidates);
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (!c) continue;
      var lifecycle = str(c.lifecycle) || "candidate";
      if (lifecycle !== "candidate") continue;
      out.push({
        careLineId: c.careLineId,
        label: c.label || c.careLineId,
        lifecycle: lifecycle,
        attributedUnits: c.attributedUnits == null ? null : c.attributedUnits,
        sampledPrecision: c.sampledPrecision == null ? null : c.sampledPrecision,
        sampleSize: c.sampleSize == null ? null : c.sampleSize,
        ready: c.ready === true,
        blockedBy: asArray(c.blockedBy).slice(),
      });
    }
    return out;
  }

  /** Referências `stale` ou com desajuste de população declarado. */
  function referenceItems(references) {
    var out = [];
    var list = asArray(references);
    for (var i = 0; i < list.length; i++) {
      var ref = list[i];
      if (!ref) continue;
      var stale = ref.stale === true;
      var mismatch = ref.populationMismatch === true;
      if (!stale && !mismatch) continue;
      out.push({
        id: ref.id,
        citation: ref.citation || "",
        year: ref.year == null ? null : ref.year,
        population: ref.population || "",
        stale: stale,
        populationMismatch: mismatch,
        indicatorIds: asArray(ref.indicatorIds).slice(),
      });
    }
    return out;
  }

  /**
   * Lacunas: indicador bloqueado por campo em falta e indicador suprimido por
   * denominador pequeno. As linhas vêm de `flattenAggregate`, pelo que a
   * supressão atravessa intacta — a célula pequena continua vazia no pacote.
   */
  function dataGapItems(aggregate) {
    var out = [];
    var rows = flattenAggregate(aggregate);
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var blocked = r.status === "blocked";
      var suppressed = !blocked && r.n === "";
      if (!blocked && !suppressed) continue;
      out.push({
        careLineId: r.careLineId,
        indicatorId: r.indicatorId,
        dimension: r.dimension,
        status: r.status,
        gap: blocked ? "blocked" : "suppressed_small_n",
        n: r.n,
        observed: r.observed,
      });
    }
    return out;
  }

  /**
   * Pacote mensal do comité (CPIGOV-AC-11/12/13).
   *
   * @param {{
   *   month?: string,
   *   alerts?: object[],
   *   modelValidation?: object[],
   *   careLineCandidates?: object[],
   *   references?: object[],
   *   aggregate?: object,
   *   decisions?: object[]
   * }} input
   * @param {{ generatedAt?: string }} [options]
   */
  function buildCommitteePacket(input, options) {
    var src = input && typeof input === "object" ? input : {};
    var opts = options && typeof options === "object" ? options : {};
    var month = str(src.month).trim();
    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw new Error("cpi-export: pacote do comité exige `month` no formato YYYY-MM");
    }

    var signals = signalItems(src.alerts);
    var validations = validationChangeItems(src.modelValidation);
    var candidates = candidateItems(src.careLineCandidates);
    var references = referenceItems(src.references);
    var gaps = dataGapItems(src.aggregate);

    var sections = [
      section(
        COMMITTEE_SECTIONS[0].id,
        COMMITTEE_SECTIONS[0].title,
        signals,
        signals.length
          ? signals.length +
            " sinal(is) de causa especial no período. Descrevem variação, não conduta."
          : "Nenhum sinal de causa especial no período — a variação observada é compatível com ruído amostral.",
      ),
      section(
        COMMITTEE_SECTIONS[1].id,
        COMMITTEE_SECTIONS[1].title,
        validations,
        validations.length
          ? validations.length + " estado(s) de validação alterado(s) desde o pacote anterior."
          : "Nenhum estado de validação de modelo mudou desde o pacote anterior.",
      ),
      section(
        COMMITTEE_SECTIONS[2].id,
        COMMITTEE_SECTIONS[2].title,
        candidates,
        candidates.length
          ? candidates.length + " linha(s) em `candidate` — promoção exige decisão registada com evidência."
          : "Nenhuma linha de cuidado em `candidate` à espera de decisão.",
      ),
      section(
        COMMITTEE_SECTIONS[3].id,
        COMMITTEE_SECTIONS[3].title,
        references,
        references.length
          ? references.length + " referência(s) a rever — troca exige decisão registada."
          : "Nenhuma referência externa obsoleta ou em desajuste de população.",
      ),
      section(
        COMMITTEE_SECTIONS[4].id,
        COMMITTEE_SECTIONS[4].title,
        gaps,
        gaps.length
          ? gaps.length + " indicador(es) sem publicação por lacuna de dados ou denominador pequeno."
          : "Nenhuma lacuna de dados nem indicador bloqueado no período.",
      ),
    ];

    var pending = 0;
    for (var i = 0; i < sections.length; i++) pending += sections[i].items.length;

    var packet = {
      month: month,
      generatedAt: opts.generatedAt || "",
      matchVersion:
        src.aggregate && src.aggregate.matchVersion != null
          ? src.aggregate.matchVersion
          : null,
      // CPIGOV-AC-13: pacote vazio é gerado com a conclusão explícita, nunca omitido.
      conclusion: pending
        ? pending + " item(ns) para revisão do comité em " + month + "."
        : "Sem sinal de causa especial e sem pendência em " +
          month +
          " — o pacote é gerado com esta conclusão para distinguir «nada a assinalar» de «não foi gerado».",
      pendingCount: pending,
      sections: sections,
      decisions: asArray(src.decisions).map(function (d) {
        return {
          id: d && d.id,
          decidedAt: d && d.decidedAt,
          kind: d && d.kind,
          target: d && d.target != null ? d.target : null,
          effectiveFrom: d && d.effectiveFrom != null ? d.effectiveFrom : null,
          rationale: d && d.rationale,
        };
      }),
    };

    assertNoIdentifiers(packet, "packet");
    return packet;
  }

  function mdCell(v) {
    if (v == null || v === "") return "—";
    // Uma quebra de linha dentro de um valor (ex. `rationale` multi-linha de
    // uma decisão de governança) parte a linha física da tabela a meio — o
    // parser Markdown lê a linha seguinte como não começando por `|` e
    // termina a tabela ali, arrastando o resto do pacote para texto solto.
    return String(v)
      .replace(/\r\n|\r|\n/g, " ")
      .replace(/\|/g, "\\|");
  }

  /** @param {object} packet — saída de `buildCommitteePacket` */
  function committeePacketToMarkdown(packet) {
    var p = packet && typeof packet === "object" ? packet : {};
    var lines = [];
    lines.push("# Pacote do comité CPI — " + str(p.month));
    lines.push("");
    lines.push(
      "Gerado: " +
        (p.generatedAt ? str(p.generatedAt) : "—") +
        " · matchVersion: " +
        (p.matchVersion == null ? "—" : str(p.matchVersion)),
    );
    lines.push("");
    lines.push("**Conclusão:** " + str(p.conclusion));
    lines.push("");
    lines.push(
      "Os sinais listados descrevem variação estatística e não constituem juízo sobre a prática clínica.",
    );

    var sections = asArray(p.sections);
    for (var s = 0; s < sections.length; s++) {
      var sec = sections[s];
      lines.push("");
      lines.push("## " + (s + 1) + ". " + str(sec.title));
      lines.push("");
      lines.push(str(sec.conclusion));

      if (!sec.items || !sec.items.length) continue;
      lines.push("");

      if (sec.id === "signals") {
        lines.push("| linha | indicador | período | regra | sentido |");
        lines.push("|---|---|---|---|---|");
        for (var i = 0; i < sec.items.length; i++) {
          var a = sec.items[i];
          lines.push(
            "| " +
              mdCell(a.careLineLabel) +
              " | " +
              mdCell(a.indicatorLabel) +
              " | " +
              mdCell(a.periodLabel) +
              " | " +
              mdCell(a.ruleDescription || a.rule) +
              " | " +
              mdCell(a.direction) +
              " |",
          );
        }
      } else if (sec.id === "model_validation") {
        lines.push("| modelo | linha | estado anterior | estado | razão | cobertura |");
        lines.push("|---|---|---|---|---|---|");
        for (var v = 0; v < sec.items.length; v++) {
          var mv = sec.items[v];
          lines.push(
            "| " +
              mdCell(mv.model) +
              " | " +
              mdCell(mv.careLineId) +
              " | " +
              mdCell(mv.previousStatus) +
              " | " +
              mdCell(mv.status) +
              " | " +
              mdCell(mv.statusReason) +
              " | " +
              mdCell(mv.coverageShare) +
              " |",
          );
        }
      } else if (sec.id === "care_line_candidates") {
        lines.push("| linha | unidades atribuídas | precisão amostrada | amostra | pronta |");
        lines.push("|---|---|---|---|---|");
        for (var c = 0; c < sec.items.length; c++) {
          var cand = sec.items[c];
          lines.push(
            "| " +
              mdCell(cand.label) +
              " | " +
              mdCell(cand.attributedUnits) +
              " | " +
              mdCell(cand.sampledPrecision) +
              " | " +
              mdCell(cand.sampleSize) +
              " | " +
              (cand.ready ? "sim" : "não") +
              " |",
          );
        }
      } else if (sec.id === "references") {
        lines.push("| referência | ano | população | obsoleta | desajuste |");
        lines.push("|---|---|---|---|---|");
        for (var r = 0; r < sec.items.length; r++) {
          var ref = sec.items[r];
          lines.push(
            "| " +
              mdCell(ref.citation || ref.id) +
              " | " +
              mdCell(ref.year) +
              " | " +
              mdCell(ref.population) +
              " | " +
              (ref.stale ? "sim" : "não") +
              " | " +
              (ref.populationMismatch ? "sim" : "não") +
              " |",
          );
        }
      } else {
        lines.push("| linha | indicador | dimensão | lacuna |");
        lines.push("|---|---|---|---|");
        for (var g = 0; g < sec.items.length; g++) {
          var gap = sec.items[g];
          lines.push(
            "| " +
              mdCell(gap.careLineId) +
              " | " +
              mdCell(gap.indicatorId) +
              " | " +
              mdCell(gap.dimension) +
              " | " +
              mdCell(
                gap.gap === "blocked"
                  ? "campo em falta"
                  : "n insuficiente para publicar",
              ) +
              " |",
          );
        }
      }
    }

    var decisions = asArray(p.decisions);
    lines.push("");
    lines.push("## Decisões registadas no período");
    lines.push("");
    if (!decisions.length) {
      lines.push("Nenhuma decisão de governança registada no período.");
    } else {
      lines.push("| id | data | tipo | alvo | vigor | razão |");
      lines.push("|---|---|---|---|---|---|");
      for (var d = 0; d < decisions.length; d++) {
        var dec = decisions[d];
        lines.push(
          "| " +
            mdCell(dec.id) +
            " | " +
            mdCell(dec.decidedAt) +
            " | " +
            mdCell(dec.kind) +
            " | " +
            mdCell(dec.target) +
            " | " +
            mdCell(dec.effectiveFrom) +
            " | " +
            mdCell(dec.rationale) +
            " |",
        );
      }
    }

    return lines.join("\n") + "\n";
  }

  /** @param {object} packet */
  function committeePacketToJson(packet) {
    return JSON.stringify(packet, null, 2);
  }

  /**
   * Seis secções do relatório periódico (CPIPER-AC-01/02). Sempre presentes —
   * vazias saem com conclusão explícita.
   */
  var PERIODIC_SECTIONS = Object.freeze([
    Object.freeze({ id: "desempenho", title: "Desempenho" }),
    Object.freeze({ id: "tendencia_sinais", title: "Tendência e sinais" }),
    Object.freeze({ id: "validacao_deriva", title: "Validação e deriva" }),
    Object.freeze({
      id: "decisoes_retrospectiva",
      title: "Decisões e retrospectiva",
    }),
    Object.freeze({ id: "pendencias", title: "Pendências" }),
    Object.freeze({ id: "versoes", title: "Versões" }),
  ]);

  var PERIODIC_EMPTY = Object.freeze({
    desempenho: "sem indicador publicável no período",
    tendencia_sinais: "nenhum sinal de causa especial",
    validacao_deriva: "nenhum modelo com validação no período",
    decisoes_retrospectiva: "nenhuma decisão registada",
    pendencias: "sem pendências",
  });

  function stableSortBy(arr, keyFn) {
    var copy = arr.slice();
    copy.sort(function (a, b) {
      var ka = keyFn(a);
      var kb = keyFn(b);
      if (ka < kb) return -1;
      if (ka > kb) return 1;
      return 0;
    });
    return copy;
  }

  function periodLabelOf(period) {
    if (!period || typeof period !== "object") return "";
    if (period.label) return str(period.label);
    if (period.from || period.to) {
      return str(period.from || "") + ".." + str(period.to || "");
    }
    return "";
  }

  function candidateIdsFromPeriod(period) {
    var ids = {};
    var list = asArray(period && period.candidates);
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c && c.careLineId && (c.lifecycle === "candidate" || !c.lifecycle)) {
        ids[String(c.careLineId)] = true;
      }
    }
    var lifecycles =
      period && period.careLineLifecycles && typeof period.careLineLifecycles === "object"
        ? period.careLineLifecycles
        : null;
    if (lifecycles) {
      var keys = Object.keys(lifecycles);
      for (var k = 0; k < keys.length; k++) {
        if (lifecycles[keys[k]] === "candidate") ids[keys[k]] = true;
      }
    }
    return ids;
  }

  function breakLabelsFromTrends(trends) {
    var labels = {};
    var list = asArray(trends);
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      var breaks = asArray(t && t.breakBefore);
      for (var b = 0; b < breaks.length; b++) {
        var br = breaks[b];
        var label =
          typeof br === "string"
            ? br
            : br && (br.label || br.period || br.from)
              ? str(br.label || br.period || br.from)
              : "";
        if (label) labels[label] = true;
      }
      if (t && t.definitionBreak) {
        var dl =
          typeof t.definitionBreak === "string"
            ? t.definitionBreak
            : periodLabelOf(t.definitionBreak);
        if (dl) labels[dl] = true;
      }
    }
    return labels;
  }

  function desempenhoItemsFromPeriod(period) {
    var out = [];
    var periodLabel = periodLabelOf(period) || str(period && period.periodLabel);
    var candidates = candidateIdsFromPeriod(period);
    var breakLabels = breakLabelsFromTrends(period && period.trends);

    var pre = asArray(period && period.indicators);
    if (pre.length) {
      for (var i = 0; i < pre.length; i++) {
        var ind = pre[i];
        if (!ind) continue;
        var lineId = str(ind.careLineId);
        if (candidates[lineId]) continue;
        var pLab = str(ind.periodLabel || periodLabel);
        var flagged =
          !!ind.definitionBreak ||
          !!ind.breakBefore ||
          !!(pLab && breakLabels[pLab]);
        out.push({
          periodLabel: pLab,
          careLineId: lineId || null,
          careLineLabel: ind.careLineLabel || lineId || null,
          indicatorId: ind.indicatorId || ind.id || null,
          indicatorLabel: ind.indicatorLabel || ind.indicatorId || ind.id || null,
          status: ind.status != null ? str(ind.status) : null,
          suppressed: !!ind.suppressed,
          observed: ind.suppressed ? null : ind.observed != null ? ind.observed : null,
          expected: ind.suppressed ? null : ind.expected != null ? ind.expected : null,
          ratio: ind.suppressed ? null : ind.ratio != null ? ind.ratio : null,
          degradeReason: ind.degradeReason != null ? str(ind.degradeReason) : null,
          definitionBreak: flagged,
          breakLabel: flagged ? pLab || str(ind.breakBefore) || "quebra de definição" : null,
          caveat: ind.caveat != null ? str(ind.caveat) : ind.degradeReason != null ? str(ind.degradeReason) : null,
        });
      }
      return out;
    }

    var aggregate = period && period.aggregate;
    var careLines = asArray(aggregate && aggregate.careLines);
    for (var c = 0; c < careLines.length; c++) {
      var line = careLines[c];
      if (!line) continue;
      var clId = str(line.careLineId);
      if (candidates[clId] || line.lifecycle === "candidate") continue;
      var indicators = asArray(line.indicators);
      for (var j = 0; j < indicators.length; j++) {
        var row = indicators[j];
        if (!row) continue;
        var flaggedAgg = !!(periodLabel && breakLabels[periodLabel]);
        out.push({
          periodLabel: periodLabel,
          careLineId: clId || null,
          careLineLabel: line.label || clId || null,
          indicatorId: row.id || null,
          indicatorLabel: row.label || row.id || null,
          status: row.status != null ? str(row.status) : null,
          suppressed: !!row.suppressed,
          observed: row.suppressed ? null : row.observed != null ? row.observed : null,
          expected: row.suppressed ? null : row.expected != null ? row.expected : null,
          ratio: row.suppressed ? null : row.ratio != null ? row.ratio : null,
          degradeReason: row.degradeReason != null ? str(row.degradeReason) : null,
          definitionBreak: flaggedAgg,
          breakLabel: flaggedAgg ? periodLabel : null,
          caveat: row.degradeReason != null ? str(row.degradeReason) : null,
        });
      }
    }
    return out;
  }

  function tendenciaItemsFromPeriod(period) {
    var out = [];
    var periodLabel = periodLabelOf(period) || str(period && period.periodLabel);
    var signals = asArray(period && period.signals);
    if (!signals.length) signals = asArray(period && period.alerts);
    for (var i = 0; i < signals.length; i++) {
      var a = signals[i];
      if (!a) continue;
      if (a.scope && a.scope !== "care_line") continue;
      out.push({
        periodLabel: str(a.periodLabel || periodLabel),
        careLineId: a.careLineId || null,
        careLineLabel: a.careLineLabel || a.careLineId || null,
        indicatorId: a.indicatorId || null,
        indicatorLabel: a.indicatorLabel || a.indicatorId || null,
        stability: a.stability != null ? str(a.stability) : null,
        rule: a.rule != null ? str(a.rule) : null,
        ruleDescription: a.ruleDescription != null ? str(a.ruleDescription) : "",
        direction: a.direction == null ? null : a.direction,
        caveat:
          a.caveat != null
            ? str(a.caveat)
            : "Sinais descrevem variação estatística, não conduta clínica.",
      });
    }
    var trends = asArray(period && period.trends);
    for (var t = 0; t < trends.length; t++) {
      var tr = trends[t];
      if (!tr || !tr.stability) continue;
      if (asArray(tr.signals).length) continue;
      out.push({
        periodLabel: periodLabel,
        careLineId: tr.careLineId || null,
        careLineLabel: tr.careLineLabel || tr.careLineId || null,
        indicatorId: tr.indicatorId || null,
        indicatorLabel: tr.indicatorLabel || tr.indicatorId || null,
        stability: str(tr.stability),
        rule: null,
        ruleDescription: "",
        direction: null,
        caveat: null,
      });
    }
    return out;
  }

  function validacaoItemsFromPeriod(period) {
    var out = [];
    var periodLabel = periodLabelOf(period) || str(period && period.periodLabel);
    var validations = asArray(period && period.modelValidation);
    for (var i = 0; i < validations.length; i++) {
      var mv = validations[i];
      if (!mv) continue;
      out.push({
        periodLabel: periodLabel,
        kind: "validation",
        model: mv.model != null ? str(mv.model) : null,
        careLineId: mv.careLineId != null ? str(mv.careLineId) : null,
        status: mv.status != null ? str(mv.status) : null,
        statusReason: mv.statusReason != null ? str(mv.statusReason) : null,
        coverageShare: mv.coverageShare != null ? mv.coverageShare : null,
        caveat: mv.statusReason != null ? str(mv.statusReason) : null,
      });
    }
    var drifts = asArray(period && period.modelDrift);
    for (var d = 0; d < drifts.length; d++) {
      var dr = drifts[d];
      if (!dr) continue;
      out.push({
        periodLabel: periodLabel,
        kind: "drift",
        model: dr.model != null ? str(dr.model) : null,
        careLineId: dr.careLineId != null ? str(dr.careLineId) : null,
        status: dr.status != null ? str(dr.status) : null,
        driftKind: dr.kind != null ? str(dr.kind) : null,
        statusReason: dr.statusReason != null ? str(dr.statusReason) : null,
        caveat:
          dr.caveat != null
            ? str(dr.caveat)
            : dr.statusReason != null
              ? str(dr.statusReason)
              : null,
      });
    }
    return out;
  }

  function decisoesItemsFromPeriod(period) {
    var out = [];
    var periodLabel = periodLabelOf(period) || str(period && period.periodLabel);
    var decisions = asArray(period && period.decisions);
    for (var i = 0; i < decisions.length; i++) {
      var d = decisions[i];
      if (!d) continue;
      out.push({
        periodLabel: periodLabel,
        kind: "decision",
        id: d.id != null ? str(d.id) : null,
        decisionKind: d.kind != null ? str(d.kind) : null,
        target: d.target != null ? str(d.target) : null,
        effectiveFrom: d.effectiveFrom != null ? str(d.effectiveFrom) : null,
        decidedAt: d.decidedAt != null ? str(d.decidedAt) : null,
        rationale: d.rationale != null ? str(d.rationale) : null,
        caveat: null,
      });
    }
    var retros = asArray(period && period.retrospectives);
    for (var r = 0; r < retros.length; r++) {
      var ret = retros[r];
      if (!ret) continue;
      out.push({
        periodLabel: periodLabel,
        kind: "retrospective",
        id: ret.decisionId != null ? str(ret.decisionId) : null,
        decisionKind: ret.kind != null ? str(ret.kind) : null,
        target: ret.target != null ? str(ret.target) : null,
        effectiveFrom: ret.effectiveFrom != null ? str(ret.effectiveFrom) : null,
        status: ret.status != null ? str(ret.status) : null,
        before: ret.before && typeof ret.before === "object" ? ret.before : null,
        after: ret.after && typeof ret.after === "object" ? ret.after : null,
        causalityCaveat:
          ret.causalityCaveat != null
            ? str(ret.causalityCaveat)
            : "antes-depois não estabelece causalidade",
        caveat:
          ret.causalityCaveat != null
            ? str(ret.causalityCaveat)
            : "antes-depois não estabelece causalidade",
      });
    }
    return out;
  }

  function pendenciasItemsFromPeriod(period) {
    var out = [];
    var periodLabel = periodLabelOf(period) || str(period && period.periodLabel);
    var candidates = asArray(period && period.candidates);
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      if (!c) continue;
      if (c.lifecycle && c.lifecycle !== "candidate") continue;
      out.push({
        periodLabel: periodLabel,
        kind: "candidate",
        careLineId: c.careLineId != null ? str(c.careLineId) : null,
        label: c.label != null ? str(c.label) : null,
        sampledPrecision:
          c.sampledPrecision != null ? c.sampledPrecision : null,
        sampleSize: c.sampleSize != null ? c.sampleSize : null,
        ready: !!c.ready,
        lastReviewStatus:
          c.lastReviewStatus != null ? str(c.lastReviewStatus) : null,
        caveat: "Linha candidata — pendência de validação do matcher, não resultado clínico.",
      });
    }
    var refs = asArray(period && period.references);
    if (!refs.length) refs = asArray(period && period.staleReferences);
    for (var r = 0; r < refs.length; r++) {
      var ref = refs[r];
      if (!ref) continue;
      if (!ref.stale && !ref.populationMismatch) continue;
      out.push({
        periodLabel: periodLabel,
        kind: "reference",
        id: ref.id != null ? str(ref.id) : null,
        citation: ref.citation != null ? str(ref.citation) : null,
        year: ref.year != null ? ref.year : null,
        stale: !!ref.stale,
        populationMismatch: !!ref.populationMismatch,
        caveat: ref.stale
          ? "Referência vencida — troca exige decisão registada."
          : "Desajuste de população — rever binding.",
      });
    }
    var gaps = asArray(period && period.dataGaps);
    if (!gaps.length && period && period.aggregate) {
      gaps = dataGapItems(period.aggregate);
    }
    for (var g = 0; g < gaps.length; g++) {
      var gap = gaps[g];
      if (!gap) continue;
      out.push({
        periodLabel: periodLabel,
        kind: "data_gap",
        careLineId: gap.careLineId != null ? str(gap.careLineId) : null,
        indicatorId: gap.indicatorId != null ? str(gap.indicatorId) : null,
        dimension: gap.dimension != null ? str(gap.dimension) : null,
        gap: gap.gap != null ? str(gap.gap) : null,
        caveat: null,
      });
    }
    return out;
  }

  function versionItemFromPeriod(period) {
    var periodLabel = periodLabelOf(period) || str(period && period.periodLabel);
    var versions =
      period && period.versions && typeof period.versions === "object"
        ? period.versions
        : {};
    var aggregate = period && period.aggregate;
    var effective =
      period && period.effectiveConfig && typeof period.effectiveConfig === "object"
        ? period.effectiveConfig
        : {};
    return {
      periodLabel: periodLabel,
      matchVersion:
        versions.matchVersion != null
          ? versions.matchVersion
          : aggregate && aggregate.matchVersion != null
            ? aggregate.matchVersion
            : null,
      referenceRegistryVersion:
        versions.referenceRegistryVersion != null
          ? versions.referenceRegistryVersion
          : versions.registryVersion != null
            ? versions.registryVersion
            : null,
      decisionRegistryVersion:
        versions.decisionRegistryVersion != null
          ? versions.decisionRegistryVersion
          : effective.registryVersion != null
            ? effective.registryVersion
            : null,
      appliedDecisions: asArray(effective.appliedDecisions).map(function (d) {
        return {
          id: d && d.id != null ? str(d.id) : null,
          kind: d && d.kind != null ? str(d.kind) : null,
          effectiveFrom: d && d.effectiveFrom != null ? str(d.effectiveFrom) : null,
        };
      }),
      applied: effective.applied && typeof effective.applied === "object" ? {
        careLineCount: asArray(effective.applied.careLines).length || undefined,
      } : undefined,
    };
  }

  /**
   * Relatório periódico trimestral/anual (CPIPER-AC-01..10).
   * Consolida períodos já calculados — não importa libs de cálculo.
   *
   * @param {{
   *   kind?: string,
   *   period?: { from?: string, to?: string, label?: string },
   *   periods?: object[],
   *   canViewPeerPerformance?: boolean
   * }} input
   * @param {{ generatedAt?: string }} [options]
   */
  function buildPeriodicReport(input, options) {
    var src = input && typeof input === "object" ? input : {};
    var opts = options && typeof options === "object" ? options : {};
    var canView = !!src.canViewPeerPerformance;
    var periods = asArray(src.periods);

    var desempenho = [];
    var tendencia = [];
    var validacao = [];
    var decisoes = [];
    var pendencias = [];
    var versoes = [];

    for (var p = 0; p < periods.length; p++) {
      var period = periods[p] || {};
      desempenho = desempenho.concat(desempenhoItemsFromPeriod(period));
      tendencia = tendencia.concat(tendenciaItemsFromPeriod(period));
      validacao = validacao.concat(validacaoItemsFromPeriod(period));
      decisoes = decisoes.concat(decisoesItemsFromPeriod(period));
      pendencias = pendencias.concat(pendenciasItemsFromPeriod(period));
      versoes.push(versionItemFromPeriod(period));

      // CPIPER-AC-06: estrato por profissional só com view_peer_performance.
      if (canView) {
        var strata = asArray(period.professionalStrata);
        for (var s = 0; s < strata.length; s++) {
          var st = strata[s];
          if (!st) continue;
          // Sem memberKey/memberLabel — só contagens agregadas opacas.
          desempenho.push({
            periodLabel: periodLabelOf(period),
            careLineId: st.careLineId != null ? str(st.careLineId) : null,
            indicatorId: st.indicatorId != null ? str(st.indicatorId) : null,
            stratum: true,
            n: st.suppressed ? null : st.n != null ? st.n : null,
            ratio: st.suppressed ? null : st.ratio != null ? st.ratio : null,
            suppressed: !!st.suppressed,
            caveat: "Estrato agregado — sem identificador de profissional.",
            definitionBreak: false,
            breakLabel: null,
            degradeReason: null,
            status: st.status != null ? str(st.status) : null,
            observed: null,
            expected: null,
            careLineLabel: null,
            indicatorLabel: null,
          });
        }
      }
    }

    desempenho = stableSortBy(desempenho, function (x) {
      return [x.periodLabel, x.careLineId, x.indicatorId].join("|");
    });
    tendencia = stableSortBy(tendencia, function (x) {
      return [x.periodLabel, x.careLineId, x.indicatorId, x.rule].join("|");
    });
    validacao = stableSortBy(validacao, function (x) {
      return [x.periodLabel, x.kind, x.model, x.careLineId].join("|");
    });
    decisoes = stableSortBy(decisoes, function (x) {
      return [x.periodLabel, x.kind, x.id, x.effectiveFrom].join("|");
    });
    pendencias = stableSortBy(pendencias, function (x) {
      return [x.periodLabel, x.kind, x.careLineId || x.id, x.indicatorId].join("|");
    });
    versoes = stableSortBy(versoes, function (x) {
      return str(x.periodLabel);
    });

    function conclude(id, items, filledMsg) {
      if (!items.length) {
        return PERIODIC_EMPTY[id] || "sem conteúdo no período";
      }
      return filledMsg;
    }

    var sections = [
      section(
        PERIODIC_SECTIONS[0].id,
        PERIODIC_SECTIONS[0].title,
        desempenho,
        conclude(
          "desempenho",
          desempenho,
          desempenho.length + " indicador(es) publicável(eis) no período coberto.",
        ),
      ),
      section(
        PERIODIC_SECTIONS[1].id,
        PERIODIC_SECTIONS[1].title,
        tendencia,
        conclude(
          "tendencia_sinais",
          tendencia,
          tendencia.length + " entrada(s) de tendência ou sinal de causa especial.",
        ),
      ),
      section(
        PERIODIC_SECTIONS[2].id,
        PERIODIC_SECTIONS[2].title,
        validacao,
        conclude(
          "validacao_deriva",
          validacao,
          validacao.length + " estado(s) de validação ou deriva.",
        ),
      ),
      section(
        PERIODIC_SECTIONS[3].id,
        PERIODIC_SECTIONS[3].title,
        decisoes,
        conclude(
          "decisoes_retrospectiva",
          decisoes,
          decisoes.length + " decisão(ões) ou retrospectiva(s) no período.",
        ),
      ),
      section(
        PERIODIC_SECTIONS[4].id,
        PERIODIC_SECTIONS[4].title,
        pendencias,
        conclude(
          "pendencias",
          pendencias,
          pendencias.length + " pendência(s) (candidatas, referências, lacunas).",
        ),
      ),
      section(
        PERIODIC_SECTIONS[5].id,
        PERIODIC_SECTIONS[5].title,
        versoes,
        versoes.length
          ? "Versões do catálogo, do registo de referências e do registo de decisão por sub-período."
          : "Versões registadas no relatório (secção nunca omitida).",
      ),
    ];

    // Secção de versões nunca fica conceptualmente vazia: mesmo sem períodos,
    // emitimos um item placeholder com nulls para AC-07 / AC-02.
    if (!versoes.length) {
      sections[5].items = [
        {
          periodLabel: periodLabelOf(src.period) || "",
          matchVersion: null,
          referenceRegistryVersion: null,
          decisionRegistryVersion: null,
          appliedDecisions: [],
        },
      ];
      sections[5].empty = false;
      sections[5].conclusion =
        "Versões registadas no relatório (secção nunca omitida).";
    }

    var report = {
      format: "cpi-periodic-report",
      kind: src.kind === "annual" ? "annual" : "quarterly",
      period: {
        from: src.period && src.period.from != null ? str(src.period.from) : "",
        to: src.period && src.period.to != null ? str(src.period.to) : "",
        label: periodLabelOf(src.period),
      },
      generatedAt: opts.generatedAt || "",
      canViewPeerPerformance: canView,
      sections: sections,
      versions: {
        matchVersions: sections[5].items.map(function (v) {
          return v.matchVersion;
        }),
        referenceRegistryVersions: sections[5].items.map(function (v) {
          return v.referenceRegistryVersion;
        }),
        decisionRegistryVersions: sections[5].items.map(function (v) {
          return v.decisionRegistryVersion;
        }),
      },
    };

    assertNoIdentifiers(report, "periodicReport");
    return report;
  }

  /** @param {object} report — saída de `buildPeriodicReport` */
  function periodicReportToMarkdown(report) {
    var r = report && typeof report === "object" ? report : {};
    var lines = [];
    var kindLabel = r.kind === "annual" ? "anual" : "trimestral";
    lines.push(
      "# Relatório periódico CPI (" +
        kindLabel +
        ") — " +
        (r.period && r.period.label ? str(r.period.label) : "—"),
    );
    lines.push("");
    lines.push(
      "Gerado: " +
        (r.generatedAt ? str(r.generatedAt) : "—") +
        " · período: " +
        (r.period
          ? str(r.period.from || "") + ".." + str(r.period.to || "")
          : "—"),
    );
    lines.push("");
    lines.push(
      "Este relatório **consolida** saídas já calculadas — não recalcula indicadores. " +
        "Advertências aparecem junto de cada resultado, não num rodapé.",
    );

    var sections = asArray(r.sections);
    for (var s = 0; s < sections.length; s++) {
      var sec = sections[s];
      lines.push("");
      lines.push("## " + (s + 1) + ". " + str(sec.title));
      lines.push("");
      lines.push(str(sec.conclusion));

      var items = asArray(sec.items);
      if (!items.length) continue;
      lines.push("");

      if (sec.id === "desempenho") {
        for (var i = 0; i < items.length; i++) {
          var d = items[i];
          lines.push(
            "- **" +
              mdCell(d.careLineLabel || d.careLineId) +
              "** / " +
              mdCell(d.indicatorLabel || d.indicatorId) +
              " (" +
              mdCell(d.periodLabel) +
              "): O/E " +
              (d.suppressed ? "suprimido" : mdCell(d.ratio)) +
              (d.definitionBreak
                ? " — **quebra de definição** em " + mdCell(d.breakLabel)
                : ""),
          );
          if (d.caveat || d.degradeReason) {
            lines.push("  - _" + mdCell(d.caveat || d.degradeReason) + "_");
          }
        }
      } else if (sec.id === "tendencia_sinais") {
        for (var t = 0; t < items.length; t++) {
          var sig = items[t];
          lines.push(
            "- **" +
              mdCell(sig.careLineLabel || sig.careLineId) +
              "** / " +
              mdCell(sig.indicatorLabel || sig.indicatorId) +
              " (" +
              mdCell(sig.periodLabel) +
              "): " +
              (sig.rule
                ? "sinal " + mdCell(sig.ruleDescription || sig.rule)
                : "estabilidade " + mdCell(sig.stability)),
          );
          if (sig.caveat) {
            lines.push("  - _" + mdCell(sig.caveat) + "_");
          }
        }
      } else if (sec.id === "validacao_deriva") {
        for (var v = 0; v < items.length; v++) {
          var mv = items[v];
          lines.push(
            "- **" +
              mdCell(mv.model) +
              "** @ " +
              mdCell(mv.careLineId) +
              " (" +
              mdCell(mv.periodLabel) +
              "): " +
              mdCell(mv.kind) +
              " → " +
              mdCell(mv.status) +
              (mv.driftKind ? " (" + mdCell(mv.driftKind) + ")" : ""),
          );
          if (mv.caveat) {
            lines.push("  - _" + mdCell(mv.caveat) + "_");
          }
        }
      } else if (sec.id === "decisoes_retrospectiva") {
        for (var dec = 0; dec < items.length; dec++) {
          var item = items[dec];
          lines.push(
            "- **" +
              mdCell(item.kind) +
              "** `" +
              mdCell(item.id) +
              "` (" +
              mdCell(item.periodLabel) +
              "): " +
              mdCell(item.decisionKind) +
              " → " +
              mdCell(item.target) +
              " desde " +
              mdCell(item.effectiveFrom),
          );
          // CPIPER-AC-11: causalityCaveat junto do resultado, não no rodapé.
          if (item.causalityCaveat || item.caveat) {
            lines.push(
              "  - _" + mdCell(item.causalityCaveat || item.caveat) + "_",
            );
          }
        }
      } else if (sec.id === "pendencias") {
        for (var p = 0; p < items.length; p++) {
          var pend = items[p];
          lines.push(
            "- **" +
              mdCell(pend.kind) +
              "** " +
              mdCell(pend.label || pend.careLineId || pend.id || pend.indicatorId) +
              " (" +
              mdCell(pend.periodLabel) +
              ")",
          );
          if (pend.caveat) {
            lines.push("  - _" + mdCell(pend.caveat) + "_");
          }
        }
      } else if (sec.id === "versoes") {
        lines.push("| período | MATCH_VERSION | refs | decisões |");
        lines.push("|---|---|---|---|");
        for (var ver = 0; ver < items.length; ver++) {
          var vv = items[ver];
          lines.push(
            "| " +
              mdCell(vv.periodLabel) +
              " | " +
              mdCell(vv.matchVersion) +
              " | " +
              mdCell(vv.referenceRegistryVersion) +
              " | " +
              mdCell(vv.decisionRegistryVersion) +
              " |",
          );
        }
      }
    }

    return lines.join("\n") + "\n";
  }

  /** @param {object} report */
  function periodicReportToJson(report) {
    return JSON.stringify(report, null, 2);
  }

  /**
   * FEAT-130 — export da ficha de revisão (CPIPRM-AC-09).
   * Só unitKey + veredito; precisão agregada sujeita a supressão por n pequeno.
   *
   * @param {{
   *   careLineId?: string,
   *   sampleRunId?: string,
   *   rows?: Array<{ unitKey: string, verdict?: string }>,
   *   consolidation?: { n?: number, precision?: number, ci95?: number[], status?: string }
   * }} sheet
   * @param {{ minDenominator?: number, generatedAt?: string }} [options]
   */
  function exportPromotionReview(sheet, options) {
    var src = sheet && typeof sheet === "object" ? sheet : {};
    var opts = options && typeof options === "object" ? options : {};
    var minDenom =
      opts.minDenominator != null && Number.isFinite(Number(opts.minDenominator))
        ? Number(opts.minDenominator)
        : 11;
    var cons =
      src.consolidation && typeof src.consolidation === "object"
        ? src.consolidation
        : {};
    var n = cons.n != null ? Number(cons.n) : asArray(src.rows).length;
    var suppressed = !(Number.isFinite(n) && n >= minDenom);

    var verdicts = [];
    var rows = asArray(src.rows);
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (!row) continue;
      var verdict = row.verdict != null ? String(row.verdict) : "true_positive";
      verdicts.push({
        unitKey: String(row.unitKey || ""),
        verdict: verdict,
      });
    }

    return {
      careLineId: src.careLineId != null ? String(src.careLineId) : null,
      sampleRunId: src.sampleRunId != null ? String(src.sampleRunId) : null,
      generatedAt: opts.generatedAt || null,
      suppressed: suppressed,
      n: suppressed ? null : n,
      precision: suppressed
        ? null
        : cons.precision != null
          ? cons.precision
          : null,
      ci95: suppressed
        ? null
        : Array.isArray(cons.ci95)
          ? cons.ci95.slice()
          : null,
      status: cons.status != null ? String(cons.status) : null,
      verdicts: verdicts,
    };
  }

  /**
   * FEAT-132 — export da retrospectiva (CPIRET-AC-02).
   * Preserva `causalityCaveat` em cada linha; sem `decidedBy` nem PHI.
   *
   * @param {Array<object>|{ rows?: Array<object> }} retrospective
   * @param {{ generatedAt?: string }} [options]
   */
  function exportDecisionRetrospective(retrospective, options) {
    var opts = options && typeof options === "object" ? options : {};
    var srcRows = Array.isArray(retrospective)
      ? retrospective
      : asArray(retrospective && retrospective.rows);
    var rows = [];
    for (var i = 0; i < srcRows.length; i++) {
      var r = srcRows[i];
      if (!r) continue;
      rows.push({
        decisionId: r.decisionId != null ? String(r.decisionId) : "",
        kind: r.kind != null ? String(r.kind) : "",
        target: r.target != null ? String(r.target) : null,
        effectiveFrom: r.effectiveFrom != null ? String(r.effectiveFrom) : "",
        status: r.status != null ? String(r.status) : "",
        before: r.before && typeof r.before === "object" ? r.before : null,
        after: r.after && typeof r.after === "object" ? r.after : null,
        delta: r.delta && typeof r.delta === "object" ? r.delta : null,
        competingExplanations: asArray(r.competingExplanations).map(function (e) {
          return {
            kind: e && e.kind != null ? String(e.kind) : "",
            period: e && e.period != null ? String(e.period) : "",
            detail: e && e.detail != null ? String(e.detail) : "",
          };
        }),
        crossesBreak: !!r.crossesBreak,
        causalityCaveat:
          r.causalityCaveat != null
            ? String(r.causalityCaveat)
            : "antes-depois não estabelece causalidade",
        missingPeriods:
          r.missingPeriods != null && Number.isFinite(Number(r.missingPeriods))
            ? Number(r.missingPeriods)
            : null,
      });
    }
    var packet = {
      format: "cpi-decision-retrospective",
      generatedAt: opts.generatedAt || null,
      rows: rows,
    };
    assertNoIdentifiers(packet, "retrospective");
    return packet;
  }

  /**
   * FEAT-132 — export da revisão de limiares (CPIRET-AC-05/06/07).
   * Contagens apenas; sem campo de recomendação.
   *
   * @param {Array<object>|{ rows?: Array<object> }} review
   * @param {{ generatedAt?: string }} [options]
   */
  function exportThresholdReview(review, options) {
    var opts = options && typeof options === "object" ? options : {};
    var srcRows = Array.isArray(review)
      ? review
      : asArray(review && review.rows);
    var rows = [];
    for (var i = 0; i < srcRows.length; i++) {
      var r = srcRows[i];
      if (!r) continue;
      rows.push({
        indicatorId: r.indicatorId != null ? String(r.indicatorId) : null,
        careLineId: r.careLineId != null ? String(r.careLineId) : null,
        distribution:
          r.distribution && typeof r.distribution === "object"
            ? r.distribution
            : null,
        crossings:
          r.crossings && typeof r.crossings === "object" ? r.crossings : null,
        signals: r.signals != null ? Number(r.signals) : 0,
        counterfactual: asArray(r.counterfactual).map(function (c) {
          return {
            band: c && c.band && typeof c.band === "object" ? c.band : null,
            wouldSignal: c && c.wouldSignal != null ? Number(c.wouldSignal) : 0,
            wouldCross: c && c.wouldCross != null ? Number(c.wouldCross) : 0,
          };
        }),
      });
    }
    var packet = {
      format: "cpi-threshold-review",
      generatedAt: opts.generatedAt || null,
      rows: rows,
    };
    assertNoIdentifiers(packet, "thresholdReview");
    return packet;
  }

  return {
    CSV_HEADER_ROW: CSV_HEADER_ROW,
    COMMITTEE_SECTIONS: COMMITTEE_SECTIONS,
    PERIODIC_SECTIONS: PERIODIC_SECTIONS,
    PERIODIC_EMPTY: PERIODIC_EMPTY,
    FORBIDDEN_PACKET_KEYS: FORBIDDEN_PACKET_KEYS,
    assertNoPacketIdentifiers: function (value) {
      assertNoIdentifiers(value, "packet");
      return true;
    },
    flattenAggregate: flattenAggregate,
    exportCpiCsv: exportCpiCsv,
    exportCpiJson: exportCpiJson,
    buildCommitteePacket: buildCommitteePacket,
    committeePacketToMarkdown: committeePacketToMarkdown,
    committeePacketToJson: committeePacketToJson,
    buildPeriodicReport: buildPeriodicReport,
    periodicReportToMarkdown: periodicReportToMarkdown,
    periodicReportToJson: periodicReportToJson,
    exportPromotionReview: exportPromotionReview,
    exportDecisionRetrospective: exportDecisionRetrospective,
    exportThresholdReview: exportThresholdReview,
  };
});

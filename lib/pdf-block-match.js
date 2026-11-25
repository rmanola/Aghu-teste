/**
 * Atribuição de blocos PDF (multi-exame por solicitação) ↔ linhas da tabela AGHU.
 * Testável em Node via eval + AghuExamSiglas / AghuExamCategories.
 */
(function (root) {
  "use strict";

  const MIN_SCORE = 8;

  function normalizeSol(s) {
    return String(s || "").replace(/\D/g, "");
  }

  function foldForBlockMatch(s) {
    return String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * @param {string} text
   * @returns {"gaso"|"coag_tp"|"coag_ttpa"|"coag"|"hemo"|"bioquim"|"proteinas_frac"|"rac_urina"|"rptcr_urina"|"urocult"|"eas"|"outros"}
   */
  function detectBlockPanel(text) {
    const t = foldForBlockMatch(text);
    if (!t) return "outros";
    if (
      /\bmaterial\s+urina\b/.test(t) &&
      /\brelacao\s+albumina\s*\/?\s*creatinina\b/.test(t)
    ) {
      return "rac_urina";
    }
    if (
      /\bmaterial\s+urina\b/.test(t) &&
      /\brelacao\s+proteina\s*\/?\s*creatinina\b/.test(t)
    ) {
      return "rptcr_urina";
    }
    if (
      /\bmaterial\s+sangue\b/.test(t) &&
      /\bproteina\s+total\b/.test(t) &&
      /\balbumina\b/.test(t) &&
      /\bglobulin/.test(t)
    ) {
      return "proteinas_frac";
    }
    if (/\burocultura\b/.test(t) || (/\bresultado\s*:/.test(t) && /\bcultura\b/.test(t))) {
      return "urocult";
    }
    if (
      /\bpesquisa de elementos anormais\b/.test(t) ||
      (/\bdensidade\b/.test(t) && (/\bph\b/.test(t) || /\breacao\b/.test(t)))
    ) {
      return "eas";
    }
    if (/\beas\b/.test(t) && /\burina\b/.test(t)) return "eas";
    if (/\bgasos?metria\b/.test(t)) return "gaso";
    if (/\btromboplastina\s+parcial\b/.test(t) || /\btt\s*pa\b/.test(t)) return "coag_ttpa";
    if (/\btempo\s+de\s+protrombina\b/.test(t)) return "coag_tp";
    if (/\bprotrombina\b/.test(t) && /\binr\b/.test(t)) return "coag_tp";
    if (/\bhemograma\b/.test(t)) return "hemo";
    if (/\bbilirrubin\b/.test(t)) return "bioquim";
    if (/\bprotrombina\b/.test(t) || /\btromboplastin\b/.test(t) || /\binr\b/.test(t)) {
      return "coag";
    }
    return "outros";
  }

  /**
   * @param {{ examName?: string, sample?: string }} exam
   * @param {{ classifyExamPanel: function, resolveSigla: function }} deps
   */
  function examPanelId(exam, deps) {
    const examName = exam.examName || "";
    const enFold = foldForBlockMatch(examName);
    if (/\bproteinas totais e frac/.test(enFold)) return "proteinas_frac";
    if (/\brelacao albumina\s*\/?\s*creatinina/.test(enFold)) return "rac_urina";
    if (/\brelacao proteina\s*\/?\s*creatinina/.test(enFold)) return "rptcr_urina";

    const sigla = deps.resolveSigla(examName);
    if (sigla === "RAC") return "rac_urina";
    if (sigla === "RPTCr") return "rptcr_urina";
    if (sigla === "Gaso") return "gaso";
    if (sigla === "Hemograma") return "hemo";
    if (sigla === "Urocult") return "urocult";
    if (sigla === "EAS") return "eas";
    if (sigla === "TTPa") return "coag_ttpa";
    if (sigla === "TP" || sigla === "INR") return "coag_tp";
    const cat = deps.classifyExamPanel(exam.examName || "", exam.sample || "");
    if (cat === "gaso" || cat === "gaso_arterial" || cat === "gaso_venosa") return "gaso";
    if (cat === "hemo" || cat === "hemograma") return "hemo";
    if (cat === "coag" || cat === "coagulacao") return "coag";
    if (
      cat === "bioquimica" ||
      cat === "funcao_renal" ||
      cat === "eletrolitos" ||
      cat === "metabolismo" ||
      cat === "marcadores" ||
      cat === "hormonal" ||
      cat === "perfil_nutri"
    ) {
      return "bioquim";
    }
    return "outros";
  }

  function panelsCompatible(examPanel, blockPanel) {
    if (examPanel === blockPanel) return true;
    if (examPanel === "coag" && (blockPanel === "coag_tp" || blockPanel === "coag_ttpa")) {
      return true;
    }
    if (blockPanel === "coag" && (examPanel === "coag_tp" || examPanel === "coag_ttpa")) {
      return true;
    }
    if (
      examPanel === "urocult" ||
      examPanel === "eas" ||
      examPanel === "proteinas_frac" ||
      examPanel === "rac_urina" ||
      examPanel === "rptcr_urina"
    ) {
      return examPanel === blockPanel;
    }
    return false;
  }

  function isTitleOnlySection(sec) {
    const lines = String(sec || "")
      .trim()
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return true;
    const folded = foldForBlockMatch(sec);
    const hasBody =
      /\bmaterial\b/.test(folded) ||
      /\bresultado\b/.test(folded) ||
      /\bdensidade\b/.test(folded) ||
      /\bcultura\b/.test(folded) ||
      /\bpesquisa de elementos\b/.test(folded) ||
      /\binr\b/.test(folded) ||
      /\btempo de protrombina\b/.test(folded) ||
      /\btromboplastina\b/.test(folded) ||
      /\bnao reativo\b/.test(folded) ||
      /\bvalor\s*:/.test(folded) ||
      /\banti[-\s]/i.test(String(sec || ""));
    if (hasBody) return false;
    if (lines.length === 1) {
      const one = folded.replace(/\s+/g, " ").trim();
      if (/^urocultura$/.test(one)) return true;
      if (/^eas\s/.test(one)) return true;
      if (/^hemograma/.test(one)) return true;
      if (/^gasometria/.test(one)) return true;
      if (/^material\s/.test(one)) return true;
    }
    return !hasBody && lines.length <= 1;
  }

  function scoreSiglaPatterns(blockText, exam, deps) {
    let score = 0;
    const raw = String(blockText || "");
    const examName = exam.examName || "";
    const sigla = deps.resolveSigla(examName);
    const catalog = deps.examSiglas || [];

    function testEntry(entry) {
      if (!entry || !entry.patterns) return;
      for (const re of entry.patterns) {
        if (re.test(raw)) {
          score += 15;
          return;
        }
      }
    }

    if (sigla) {
      const hit = catalog.find((e) => e.sigla === sigla);
      testEntry(hit);
    }
    if (examName) {
      const byName = catalog.find((e) =>
        (e.aliases || []).some(
          (a) => foldForBlockMatch(a) === foldForBlockMatch(examName),
        ),
      );
      if (byName && byName.sigla !== sigla) testEntry(byName);
    }
    return score;
  }

  function isExamVenousMaterial(combined) {
    return /\bvenos[oa]\b/.test(combined);
  }

  function isExamArterialMaterial(combined) {
    return /\barterial\b/.test(combined);
  }

  function isBlockVenousMaterial(blockFolded) {
    return (
      /\bmaterial\s+sangue\s+venoso\b/.test(blockFolded) ||
      /\bsangue\s+venoso\b/.test(blockFolded)
    );
  }

  function isBlockArterialMaterial(blockFolded) {
    return (
      /\bmaterial\s+sangue\s+arterial\b/.test(blockFolded) ||
      /\bsangue\s+arterial\b/.test(blockFolded)
    );
  }

  function isExamUrineSample(combined) {
    return /\burin/.test(combined);
  }

  function isExamBloodSample(combined) {
    return (
      /\bsangue\b/.test(combined) ||
      /\bsoro\b/.test(combined) ||
      /\bplasma\b/.test(combined)
    );
  }

  function blockHasMaterialSangue(blockFolded) {
    return /\bmaterial\s+sangue\b/.test(blockFolded);
  }

  function blockHasMaterialUrina(blockFolded) {
    return /\bmaterial\s+urina\b/.test(blockFolded);
  }

  function scoreSampleMaterial(blockText, exam) {
    const t = foldForBlockMatch(blockText);
    const combined = foldForBlockMatch(
      (exam.examName || "") + " " + (exam.sample || ""),
    );
    const blockSangue = blockHasMaterialSangue(t);
    const blockUrina = blockHasMaterialUrina(t);
    const examUrina = isExamUrineSample(combined);
    const examSangue = isExamBloodSample(combined);

    if (blockSangue && examSangue && !blockUrina) return 10;
    if (blockUrina && examUrina && !blockSangue) return 10;
    if (blockSangue && !blockUrina && examUrina) return -25;
    if (blockUrina && !blockSangue && examSangue && !examUrina) return -25;

    if (!blockSangue && !blockUrina) {
      const sm = foldForBlockMatch(exam.sample || "");
      if (sm.length >= 3 && t.includes(sm)) return 3;
    }
    return 0;
  }

  function scoreVenousMaterial(blockText, exam) {
    const t = foldForBlockMatch(blockText);
    const combined = foldForBlockMatch(
      (exam.examName || "") + " " + (exam.sample || ""),
    );
    const blockVenous = isBlockVenousMaterial(t);
    const blockArterial = isBlockArterialMaterial(t);
    const examVenous = isExamVenousMaterial(combined);
    const examArterial = isExamArterialMaterial(combined);

    if (blockVenous && examVenous) return 10;
    if (blockArterial && examArterial) return 10;
    if (blockVenous && examArterial) return -12;
    if (blockArterial && examVenous) return -12;
    if (blockVenous && !examVenous && !examArterial) return -12;
    if (blockArterial && !examVenous && !examArterial) return 0;
    if (!blockVenous && !blockArterial && examVenous) return -12;
    return 0;
  }

  function scoreAnalyteMarkers(blockText, examPanel) {
    const t = foldForBlockMatch(blockText);
    if (examPanel === "gaso") {
      if (/\bph\b/.test(t) && /\bpo2\b/.test(t)) return 8;
    }
    if (examPanel === "coag_ttpa" && /\btromboplastina\s+parcial\b/.test(t)) return 10;
    if (examPanel === "coag_tp" && /\bprotrombina\b/.test(t) && /\binr\b/.test(t)) {
      return 10;
    }
    if (examPanel === "urocult" && (/\bcultura\b/.test(t) || /\bresultado\s*:/.test(t))) {
      return 10;
    }
    if (
      examPanel === "eas" &&
      /\bdensidade\b/.test(t) &&
      (/\bph\b/.test(t) || /\breacao\b/.test(t))
    ) {
      return 10;
    }
    if (examPanel === "rac_urina" && /\brelacao\s+albumina\s*\/?\s*creatinina\b/.test(t)) {
      return 10;
    }
    if (examPanel === "rptcr_urina" && /\brelacao\s+proteina\s*\/?\s*creatinina\b/.test(t)) {
      return 10;
    }
    if (
      examPanel === "proteinas_frac" &&
      /\bproteina\s+total\b/.test(t) &&
      /\bglobulin/.test(t)
    ) {
      return 10;
    }
    return 0;
  }

  /**
   * @param {string} blockText
   * @param {{ examName?: string, sample?: string }} exam
   * @param {{ classifyExamPanel: function, resolveSigla: function, examSiglas?: object[] }} deps
   */
  function scoreBlockForExam(blockText, exam, deps) {
    const t = foldForBlockMatch(blockText);
    if (!t) return 0;

    let score = 0;
    const en = foldForBlockMatch(exam.examName || "");

    if (en.length >= 4 && t.includes(en)) score += 12;
    else if (en.length >= 6) {
      for (const w of en.split(/\s+/)) {
        if (w.length >= 4 && t.includes(w)) score += 2;
      }
    }
    score += scoreSampleMaterial(blockText, exam);

    const blockPanel = detectBlockPanel(blockText);
    const exPanel = examPanelId(exam, deps);
    if (panelsCompatible(exPanel, blockPanel)) score += 20;
    else if (exPanel !== "outros" && blockPanel !== "outros") score -= 15;

    score += scoreSiglaPatterns(blockText, exam, deps);
    score += scoreVenousMaterial(blockText, exam);
    score += scoreAnalyteMarkers(blockText, exPanel);

    if (exPanel === "urocult") {
      if (/\bdensidade\b/.test(t) && !/\bcultura\b/.test(t)) score -= 20;
      if (/\bpesquisa de elementos anormais\b/.test(t) && !/\burocultura\b/.test(t)) {
        score -= 15;
      }
    }
    if (exPanel === "eas") {
      if (
        /\burocultura\b/.test(t) &&
        !/\bdensidade\b/.test(t) &&
        !/\bpesquisa de elementos\b/.test(t)
      ) {
        score -= 20;
      }
    }

    return score;
  }

  /**
   * @param {{ solicitation?: string, examName?: string, sample?: string }} exam
   * @param {{ sol: string, text: string, g: number }[]} allBlocks
   * @param {Set<number>} usedBlock
   * @param {object} deps
   */
  function isHucamExternalBlock(block) {
    if (block && block.external) return true;
    const lab = root.AghuPdfLabParse;
    return !!(
      lab &&
      lab.looksLikeHucamExternalPdfText &&
      lab.looksLikeHucamExternalPdfText(block && block.text)
    );
  }

  function pickBestScoredBlock(cands, exam, deps) {
    let best = null;
    let bestScore = -Infinity;
    for (const b of cands) {
      const sc = scoreBlockForExam(b.text, exam, deps);
      if (sc > bestScore || (sc === bestScore && best && b.g < best.g)) {
        best = b;
        bestScore = sc;
      }
    }
    if (!best || bestScore < MIN_SCORE) return null;
    return best;
  }

  function countViableCandidates(exam, allBlocks, usedBlock, deps) {
    const sol = normalizeSol(exam.solicitation);
    if (!sol) return 0;
    let n = 0;
    for (const b of allBlocks) {
      if (usedBlock.has(b.g)) continue;
      if (normalizeSol(b.sol) !== sol) continue;
      if (scoreBlockForExam(b.text, exam, deps) >= MIN_SCORE) n++;
    }
    if (n > 0) return n;
    for (const b of allBlocks) {
      if (usedBlock.has(b.g)) continue;
      if (!isHucamExternalBlock(b)) continue;
      if (scoreBlockForExam(b.text, exam, deps) >= MIN_SCORE) n++;
    }
    return n;
  }

  function pickBlockForExam(exam, allBlocks, usedBlock, deps) {
    const sol = normalizeSol(exam.solicitation);
    if (!sol) return null;
    let cands = allBlocks.filter(
      (b) => !usedBlock.has(b.g) && normalizeSol(b.sol) === sol,
    );
    if (cands.length === 0) {
      cands = allBlocks.filter((b) => !usedBlock.has(b.g) && isHucamExternalBlock(b));
      if (cands.length === 0) return null;
      return pickBestScoredBlock(cands, exam, deps);
    }
    if (cands.length === 1) {
      const sc = scoreBlockForExam(cands[0].text, exam, deps);
      return sc >= MIN_SCORE ? cands[0] : null;
    }

    return pickBestScoredBlock(cands, exam, deps);
  }

  /**
   * @param {object[]} exams
   * @param {{ sol: string, text: string, g: number }[]} allBlocks
   * @param {{ parsePdfText: function, splitDetailIntoSolBlocks: function, classifyExamPanel: function, resolveSigla: function, examSiglas?: object[] }} deps
   */
  function parseTextForExam(text, exam, deps) {
    const lab = root.AghuPdfLabParse;
    const sliced = sliceBlockTextForExam(text, exam, deps);
    const normalized =
      lab && lab.normalizeHcpaPdfText
        ? lab.normalizeHcpaPdfText(sliced)
        : String(sliced || "");
    const examName = exam.examName || "";
    const gasometryOnly = foldForBlockMatch(examName).includes("gasometria");
    const siglas =
      root.AghuExamSiglas ||
      (deps.resolveSigla
        ? { resolveSigla: deps.resolveSigla, EXAM_SIGLAS: deps.examSiglas || [] }
        : undefined);
    const parseOpts = {
      gasometryOnly,
      deps: siglas ? { siglas } : undefined,
      externalAttachment: !!(exam && exam.hasAttachment),
    };
    if (deps.parsePdfTextForExam) {
      return deps.parsePdfTextForExam(normalized, examName, parseOpts);
    }
    if (gasometryOnly) {
      return deps.parsePdfText(normalized, parseOpts);
    }
    return deps.parsePdfText(normalized);
  }

  const SECTION_SPLIT_RE =
    /(?=^Material\s+(?:SANGUE|PLASMA|SORO|URINA)\b)|(?=^HEMOGRAMA\b)|(?=^GASOMETRIA\b)|(?=^UROCULTURA\b)|(?=^EAS\s+-)|(?=^PESQUISA DE ELEMENTOS ANORMAIS)|(?=^ANTI-[A-ZÁÀÂÃÉÊÍÓÔÕÚÇÜ])|(?=^TEMPO DE PROTROMBINA\b)|(?=^TROMBOPLASTINA\b)/im;

  /**
   * Particiona bloco grande em sub-seções por Material / painel clínico.
   * @param {string} blockText
   * @returns {string[]}
   */
  function partitionBlockIntoSections(blockText) {
    const text = String(blockText || "").trim();
    if (!text) return [];
    const parts = text
      .split(SECTION_SPLIT_RE)
      .map((s) => s.trim())
      .filter(Boolean);
    return parts.length > 0 ? parts : [text];
  }

  /**
   * Recorta bloco ao painel compatível com o exame (mesma solicitação, vários laudos).
   * @param {string} blockText
   * @param {{ examName?: string, sample?: string }} exam
   * @param {object} deps
   * @returns {string}
   */
  function sliceBlockTextForExam(blockText, exam, deps) {
    const text = String(blockText || "").trim();
    if (!text) return text;

    const sections = partitionBlockIntoSections(text);
    if (sections.length <= 1) return text;

    const exPanel = examPanelId(exam, deps);
    let best = null;
    let bestScore = -Infinity;

    for (const sec of sections) {
      if (isTitleOnlySection(sec)) continue;
      const secPanel = detectBlockPanel(sec);
      if (exPanel !== "outros" && secPanel !== "outros" && !panelsCompatible(exPanel, secPanel)) {
        continue;
      }
      const sc = scoreBlockForExam(sec, exam, deps);
      if (sc > bestScore) {
        bestScore = sc;
        best = sec;
      }
    }

    if (best && bestScore >= MIN_SCORE) {
      const lab = root.AghuPdfLabParse;
      const examName = exam.examName || "";
      if (deps.parsePdfTextForExam) {
        const parsed = deps.parsePdfTextForExam(best, examName, {});
        if (parsed) return best;
      } else if (lab && lab.parsePdfTextForExam) {
        const parsed = lab.parsePdfTextForExam(best, examName, {});
        if (parsed) return best;
      } else {
        return best;
      }
    }

    if (sections.length > 1) {
      const substantive = sections.filter((s) => !isTitleOnlySection(s));
      if (substantive.length === 1) return substantive[0];
    }

    return text;
  }

  function assignBlocksToExams(exams, allBlocks, deps) {
    const usedBlock = new Set();

    function assignExamFromBlock(exam, blk) {
      exam.aiOrganized = "";
      exam.detailText = blk.text;
      exam.fetchedResult = parseTextForExam(blk.text, exam, deps);
      exam.hadPdf = true;
      var resolve = root.AghuExamResultResolve;
      if (resolve && resolve.clearPartialGridResultForGasometry) {
        resolve.clearPartialGridResultForGasometry(exam);
      }
    }

    const ordered = exams
      .map((exam, idx) => ({ exam, idx }))
      .sort((a, b) => {
        const ca = countViableCandidates(a.exam, allBlocks, usedBlock, deps);
        const cb = countViableCandidates(b.exam, allBlocks, usedBlock, deps);
        if (ca !== cb) return ca - cb;
        return a.idx - b.idx;
      })
      .map((x) => x.exam);

    for (const exam of ordered) {
      const chosen = pickBlockForExam(exam, allBlocks, usedBlock, deps);
      if (chosen) {
        usedBlock.add(chosen.g);
        assignExamFromBlock(exam, chosen);
      }
    }

    const leftovers = allBlocks
      .filter((b) => !usedBlock.has(b.g))
      .sort((a, b) => a.g - b.g);

    for (const exam of exams) {
      if (String(exam.detailText || "").trim()) continue;
      const chosen = pickBlockForExam(exam, leftovers, usedBlock, deps);
      if (chosen) {
        usedBlock.add(chosen.g);
        assignExamFromBlock(exam, chosen);
      }
    }

    for (const exam of exams) {
      if (String(exam.detailText || "").trim()) continue;
      let bestSlice = null;
      let bestScore = -Infinity;
      for (const blk of allBlocks) {
        const sections = partitionBlockIntoSections(blk.text);
        if (sections.length <= 1) continue;
        const sliced = sliceBlockTextForExam(blk.text, exam, deps);
        if (!sliced || sliced === blk.text) continue;
        const sc = scoreBlockForExam(sliced, exam, deps);
        if (sc > bestScore) {
          bestScore = sc;
          bestSlice = sliced;
        }
      }
      if (bestSlice && bestScore >= MIN_SCORE) {
        exam.detailText = bestSlice;
        exam.fetchedResult = parseTextForExam(bestSlice, exam, deps);
        exam.hadPdf = true;
        var resolveSlice = root.AghuExamResultResolve;
        if (resolveSlice && resolveSlice.clearPartialGridResultForGasometry) {
          resolveSlice.clearPartialGridResultForGasometry(exam);
        }
      }
    }

    const dupMap = new Map();
    for (const exam of exams) {
      const dt = String(exam.detailText || "").trim();
      if (dt.length < 80) continue;
      if (!dupMap.has(dt)) dupMap.set(dt, []);
      dupMap.get(dt).push(exam);
    }

    let dupFixed = 0;
    for (const group of dupMap.values()) {
      if (group.length < 2) continue;
      const pieces = deps.splitDetailIntoSolBlocks(group[0].detailText);
      if (pieces.length < 2) continue;
      const assignedExams = new Set();
      for (const p of pieces) {
        let bestEx = null;
        let bestScore = -Infinity;
        for (const ex of group) {
          if (assignedExams.has(ex)) continue;
          const sc = scoreBlockForExam(p.text, ex, deps);
          if (sc > bestScore) {
            bestScore = sc;
            bestEx = ex;
          }
        }
        if (!bestEx || bestScore < MIN_SCORE) continue;
        assignedExams.add(bestEx);
        bestEx.detailText = p.text;
        bestEx.fetchedResult = parseTextForExam(p.text, bestEx, deps);
        bestEx.hadPdf = true;
        var resolve = root.AghuExamResultResolve;
        if (resolve && resolve.clearPartialGridResultForGasometry) {
          resolve.clearPartialGridResultForGasometry(bestEx);
        }
        dupFixed++;
      }
    }

    return {
      blockCount: allBlocks.length,
      assignedCount: exams.filter((e) => String(e.detailText || "").trim()).length,
      dupFixed,
    };
  }

  function defaultDeps(overrides) {
    const cats = root.AghuExamCategories || {};
    const siglas = root.AghuExamSiglas || {};
    const lab = root.AghuPdfLabParse || {};
    return Object.assign(
      {
        classifyExamPanel: cats.classifyExamPanel || (() => "outros"),
        resolveSigla: siglas.resolveSigla || ((l) => String(l || "").trim()),
        examSiglas: siglas.EXAM_SIGLAS || [],
        parsePdfText: lab.parsePdfText || ((t) => String(t || "")),
        parsePdfTextForExam:
          lab.parsePdfTextForExam ||
          ((t, name, opts) => lab.parsePdfText && lab.parsePdfText(t, opts)),
        splitDetailIntoSolBlocks:
          lab.splitDetailIntoSolBlocks || (() => []),
      },
      overrides || {},
    );
  }

  root.AghuPdfBlockMatch = {
    MIN_SCORE,
    normalizeSol,
    foldForBlockMatch,
    detectBlockPanel,
    examPanelId,
    partitionBlockIntoSections,
    sliceBlockTextForExam,
    scoreBlockForExam,
    pickBlockForExam,
    assignBlocksToExams,
    defaultDeps,
  };
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this);

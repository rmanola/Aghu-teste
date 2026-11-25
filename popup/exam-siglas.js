/* global window */
"use strict";

/**
 * Fonte única de verdade para siglas (abreviações) de exames/analitos na extensão AGHU.
 *
 * Exporta em globalThis.AghuExamSiglas (mirror window no browser):
 * - resolveSigla(label: string): string
 * - stripLeadingSynonym(resolvedSigla: string, remainder: string): string
 * - normalizeLabel(label: string): string
 * - normalizeSigla(sigla: string): string
 * - validateCatalog(): void
 */
(function () {
  /** Palavras neutras que atrapalham o match (mantém termos clínicos relevantes). */
  const STOPWORDS_RE = /\b(DE|DO|DA|DOS|DAS|S[EÉ]RICO|S[EÉ]RICA|TOTAL|LIVRE)\b/gi;

  /**
   * Catálogo canônico.
   * - sigla: forma canônica (de saída)
   * - patterns: regex (case-insensitive) para match do label original
   * - aliases: variações em texto (serão normalizadas e comparadas por igualdade)
   */
  const EXAM_SIGLAS = [
    // Eletrólitos / metabólico
    {
      sigla: "NaU",
      patterns: [
        /\bS[ÓO]DIO\s+URIN[ÁA]RIO\b/i,
        /\bNA\s+URIN[ÁA]RIO\b/i,
        /\bSODIO\s+URINA\b/i,
      ],
      aliases: ["SODIO URINARIO", "SODIO URINÁRIO", "NA URINARIO"],
    },
    { sigla: "Na", patterns: [/\bS[ÓO]DIO\b/i], aliases: ["SODIO"] },
    { sigla: "K", patterns: [/\bPOT[ÁA]SSIO\b/i], aliases: ["POTASSIO"] },
  { sigla: "Cl", patterns: [/\bCLORO\b/i], aliases: ["CLORETO", "CLORO"] },
  {
    sigla: "CaI",
    patterns: [
      /\bC[ÁA]LCIO\s+I[ÔO]NICO\b/i,
      /\bC[ÁA]LCIO\s+IONIZADO\b/i,
      /\bCA\s*\+\+\b/i,
    ],
    aliases: ["CALCIO IONICO", "CALCIO IONIZADO", "CA++"],
  },
    {
      sigla: "CaT",
      patterns: [/\bC[ÁA]LCIO\s+TOTAL\b/i],
      aliases: ["CATOTAL"],
    },
  { sigla: "Ca", patterns: [/\bC[ÁA]LCIO\b/i], aliases: ["CALCIO"] },
    { sigla: "Mg", patterns: [/\bM[ÁA]GN[ÉE]SIO\b/i], aliases: ["MAGNESIO"] },
    { sigla: "P", patterns: [/\bF[ÓO]SFORO\b/i], aliases: ["FOSFORO"] },
    { sigla: "HCO3", patterns: [/\bBICARBONATO\b/i, /\bHCO3\b/i], aliases: ["BICARBONATO", "HCO3"] },
    { sigla: "Gli", patterns: [/\bGLICOSE\b/i, /\bGLICEMIA\b/i], aliases: ["GLICOSE", "GLICEMIA"] },
    {
      sigla: "CT",
      patterns: [/\bCOLESTEROL\s+TOTAL\b/i, /\bCOL\.?\s*TOTAL\b/i],
      aliases: ["COLESTEROL TOTAL"],
    },
    {
      sigla: "HDL",
      patterns: [/\bHDL\b/i, /\bCOLESTEROL\s+HDL\b/i, /\bHDL\s*-?\s*COLESTEROL\b/i],
      aliases: ["HDL COLESTEROL", "COLESTEROL HDL"],
    },
    {
      sigla: "LDL",
      patterns: [/\bLDL\b/i, /\bCOLESTEROL\s+LDL\b/i, /\bLDL\s*-?\s*COLESTEROL\b/i],
      aliases: ["LDL COLESTEROL", "COLESTEROL LDL"],
    },
    {
      sigla: "TG",
      patterns: [/\bTRIGLIC[ÉE]R[ÍI]DEOS?\b/i, /\bTRIGLICERIDEOS?\b/i],
      aliases: ["TRIGLICERIDES", "TRIGLICERIDEOS"],
    },

    // Função renal
    {
      sigla: "RAC",
      patterns: [
        /\bRELA[ÇC][AÃ]O\s+ALBUMINA\s*\/?\s*CREATININA\b/i,
        /\bRAC\b(?=\s*[:(])/i,
      ],
      aliases: [
        "RELAÇÃO ALBUMINA / CREATININA",
        "RELAÇÃO ALBUMINA / CREATININA (URINA)",
        "RELACAO ALBUMINA / CREATININA",
      ],
    },
    {
      sigla: "RPTCr",
      patterns: [
        /\bRELA[ÇC][AÃ]O\s+PROTE[ÍI]NA\s*\/?\s*CREATININA\b/i,
        /\bRPTCR\b(?=\s*[:(])/i,
      ],
      aliases: [
        "RELAÇÃO PROTEÍNA / CREATININA",
        "RELAÇÃO PROTEÍNA / CREATININA (URINA)",
        "RELACAO PROTEINA / CREATININA",
      ],
    },
    { sigla: "CrU", patterns: [/\bCREATININA\s+URIN[ÁA]RIA\b/i], aliases: ["CREATININA URINARIA"] },
    { sigla: "Cr", patterns: [/\bCREATININA\b/i], aliases: ["CREATININA"] },
    { sigla: "U", patterns: [/\bUREIA\b/i], aliases: ["UREIA", "UR[EÉ]IA"] },
    { sigla: "AU", patterns: [/\b[ÁA]CIDO\s+[ÚU]RICO\b/i], aliases: ["ACIDO URICO"] },

    // Hepático
    {
      sigla: "TGO",
      patterns: [/\bTGO\s*\/\s*AST\b/i, /\bTGO\b/i, /\bAST\b/i],
      aliases: ["TGO", "AST", "TGO / AST"],
    },
    {
      sigla: "TGP",
      patterns: [/\bTGP\s*\/\s*ALT\b/i, /\bTGP\b/i, /\bALT\b/i],
      aliases: ["TGP", "ALT", "TGP / ALT"],
    },
    {
      sigla: "GGT",
      patterns: [
        /\bGAMA\s+GLUTAMIL\s+TRANSFERASE\b/i,
        /\bGAMA\s*GLUTAMILTRANSFERASE\b/i,
        /\bGAMA\s*GT\b/i,
        /\bGGT\b/i,
      ],
      aliases: ["GGT", "GAMA GT", "GAMA GLUTAMIL TRANSFERASE"],
    },
    { sigla: "FA", patterns: [/\bFOSFATASE\s+ALCALINA\b/i], aliases: ["FOSFATASE ALCALINA"] },
    { sigla: "BT", patterns: [/\bBILIRRUBINA\s+TOTAL\b/i], aliases: ["BILIRRUBINA TOTAL"] },
    { sigla: "BD", patterns: [/\bBILIRRUBINA\s+DIRETA\b/i], aliases: ["BILIRRUBINA DIRETA"] },
    { sigla: "BI", patterns: [/\bBILIRRUBINA\s+INDIRETA\b/i], aliases: ["BILIRRUBINA INDIRETA"] },
    { sigla: "Alb", patterns: [/\bALBUMINA\b/i], aliases: ["ALBUMINA"] },
    { sigla: "PT", patterns: [
      /\bPROTE[ÍI]NAS\s+TOTAIS\b/i,
      /\bPROTE[ÍI]NA\s+TOTAL\b/i,
      /\bPROTE[ÍI]NAS\s+TOTAIS\s+E\s+FRA[ÇC][ÕO]ES\b/i,
    ], aliases: ["PROTEINAS TOTAIS", "PROTEINAS TOTAIS E FRACOES"] },
    {
      sigla: "PreAlb",
      patterns: [/\bPRE-?ALBUMINA\b/i],
      aliases: ["PREALBUMINA", "PRE ALBUMINA"],
    },
    { sigla: "Glob", patterns: [/\bGLOBULINAS?\b/i], aliases: ["GLOBULINA", "GLOBULINAS"] },

    // Marcadores / enzimas
    { sigla: "LDH", patterns: [/\bDHL\b/i, /\bLDH\b/i], aliases: ["LDH", "DHL"] },
    { sigla: "Amil", patterns: [/\bAMILASE\b/i], aliases: ["AMILASE"] },
    { sigla: "Lip", patterns: [/\bLIPASE\b/i], aliases: ["LIPASE"] },
    {
      sigla: "TIBC",
      patterns: [
        /\bCAPACIDADE\s+(?:TOTAL\s+)?(?:DE\s+)?LIGA[ÇC][AÃ]O\s+(?:DO\s+|DE\s+)?FERRO\b/i,
        /\bTIBC\b/i,
        /\bCTLF\b/i,
      ],
      aliases: [
        "CAPACIDADE TOTAL DE LIGACAO DE FERRO",
        "CAPACIDADE DE LIGACAO DO FERRO",
        "TIBC",
        "CTLF",
      ],
    },
    {
      sigla: "IST",
      patterns: [
        /\bIST\b/i,
        /\bIND[ÍI]CE\s+DE\s+SATURA[ÇC][AÃ]O\s+(?:DO\s+FERRO|DA\s+TRANSFERRINA|DE\s+TRANSFERRINA)\b/i,
        /\bSATURA[ÇC][AÃ]O\s+(?:DO\s+FERRO|DE\s+TRANSFERRINA|DA\s+TRANSFERRINA)\b/i,
      ],
      aliases: [
        "IST",
        "INDICE DE SATURACAO DO FERRO",
        "INDICE DE SATURACAO DA TRANSFERRINA",
        "SATURACAO DE TRANSFERRINA",
        "SATURACAO DO FERRO",
      ],
    },
    {
      sigla: "Ferr",
      patterns: [/\bFERRITINA\b/i, /\bFERROITINA\b/i, /\bFERRO\s*ITINA\b/i],
      aliases: ["FERRITINA", "FERROITINA"],
    },
    { sigla: "Fe", patterns: [/\bFERRO\b/i], aliases: ["FERRO"] },
    { sigla: "Transferrina", patterns: [/\bTRANSFERRINA\b/i], aliases: ["TRANSFERRINA"] },

    // Hemograma / células
    { sigla: "HbA1c", patterns: [/\bHEMOGLOBINA\s+GLICADA\b/i, /\bHBA1C\b/i], aliases: ["HBA1C", "HEMOGLOBINA GLICADA"] },
    { sigla: "Hb", patterns: [/\bHEMOGLOBINA\b/i], aliases: ["HEMOGLOBINA"] },
    { sigla: "Ht", patterns: [/\bHEMAT[ÓO]CRITO\b/i], aliases: ["HEMATOCRITO"] },
    { sigla: "He", patterns: [/\bERITR[ÓO]CITOS\b/i, /\bHEM[ÁA]CIAS\b/i], aliases: ["ERITROCITOS", "HEMACIAS"] },
    {
      sigla: "Eritro",
      patterns: [/\bERITROBLASTOS(?:\s+EM)?\b/i],
      aliases: ["ERITROBLASTOS", "ERITROBLASTOS EM"],
    },
    { sigla: "VCM", patterns: [/\bVCM\b/i], aliases: ["VCM"] },
    { sigla: "HCM", patterns: [/\bHCM\b/i], aliases: ["HCM"] },
    { sigla: "CHCM", patterns: [/\bCHCM\b/i], aliases: ["CHCM"] },
    { sigla: "RDW", patterns: [/\bRDW\b/i], aliases: ["RDW"] },
    { sigla: "Pqt", patterns: [/\bPLAQUETAS\b/i], aliases: ["PLAQUETAS"] },
    {
      sigla: "Leuco",
      patterns: [/\bLEUC[ÓO]CITOS\s+TOTAIS\b/i, /\bLEUC[ÓO]CITOS\b/i],
      aliases: ["LEUCOCITOS", "LEUCOCITOS TOTAIS"],
    },
    { sigla: "Seg", patterns: [/\bNEUTR[ÓO]FILOS\b/i, /\bSEGMENTADOS\b/i], aliases: ["NEUTROFILOS", "SEGMENTADOS"] },
    { sigla: "Bast", patterns: [/\bBAST[ÕO]ES\b/i], aliases: ["BASTOES"] },
    {
      sigla: "Linf",
      patterns: [/\bLINF[ÓO]CITOS?\b/i, /\bLINF\b(?=\s*[:\d])/i],
      // "LINFOCITOS" omitido: normaliza igual a "LINFÓCITOS" e quebrava validateCatalog().
      aliases: ["LINFÓCITOS", "LINF"],
    },
    { sigla: "Mono", patterns: [/\bMON[ÓO]CITOS\b/i], aliases: ["MONOCITOS"] },
    { sigla: "Eos", patterns: [/\bEOSIN[ÓO]FILOS\b/i], aliases: ["EOSINOFILOS"] },
    { sigla: "Baso", patterns: [/\bBAS[ÓO]FILOS\b/i], aliases: ["BASOFILOS"] },

    // Coagulação / inflamatório
    { sigla: "TP", patterns: [/\bTEMPO\s+DE\s+PROTROMBINA\b/i, /\bTAP\b/i], aliases: ["TEMPO DE PROTROMBINA", "TP", "TAP"] },
    { sigla: "INR", patterns: [/\bRNI\b/i, /\bINR\b/i], aliases: ["INR", "RNI"] },
    { sigla: "TTPa", patterns: [/\bTTPA\b/i, /\bPTTK\b/i, /\bTEMPO\s+DE\s+TROMBOPLASTINA\b/i], aliases: ["TTPA", "PTTK", "TT Pa", "TEMPO DE TROMBOPLASTINA"] },
    { sigla: "Fibr", patterns: [/\bFIBRINOG[ÊE]NIO\b/i], aliases: ["FIBRINOGENIO"] },
    { sigla: "D-Di", patterns: [/\bD-?D[ÍI]MERO\b/i, /\bDDIMERO\b/i], aliases: ["D-DIMERO", "DDIMERO"] },
    { sigla: "PCR", patterns: [/\bPROTE[ÍI]NA\s+C\s+REATIVA\b/i, /\bPCR\b/i], aliases: ["PCR", "PROTEINA C REATIVA"] },
    { sigla: "VHS", patterns: [/\bVHS\b/i], aliases: ["VHS"] },
    { sigla: "PCT", patterns: [/\bPROCALCITONINA\b/i], aliases: ["PROCALCITONINA"] },

    // Tireóide
    { sigla: "TSH", patterns: [/\bTSH\b/i], aliases: ["TSH"] },
    { sigla: "T4L", patterns: [/\bT4\s+LIVRE\b/i], aliases: ["T4 LIVRE", "T4L"] },
    { sigla: "T3L", patterns: [/\bT3\s+LIVRE\b/i], aliases: ["T3 LIVRE", "T3L"] },

    // Cardio / outros
    { sigla: "Trop", patterns: [/\bTROPONINA\b/i], aliases: ["TROPONINA"] },
    { sigla: "CK-MB", patterns: [/\bCK-MB\b/i], aliases: ["CK-MB"] },
    { sigla: "CK", patterns: [/\bCREATINO\s*QUINASE\b/i, /\bCK\b/i], aliases: ["CK", "CREATINO QUINASE"] },
    { sigla: "BNP", patterns: [/\bBNP\b/i], aliases: ["BNP"] },
    { sigla: "proBNP", patterns: [/\bPRO-BNP\b/i, /\bNT-PROBNP\b/i], aliases: ["PRO-BNP", "NT-PROBNP"] },
    {
      sigla: "VitD",
      patterns: [
        /\b25\s*[-\s]?HIDR[ÓO]XI\s+VITAMINA\s+D\b/i,
        /\b25\s*\(\s*OH\s*\)\s*VITAMINA\s+D\b/i,
        /\bVITAMINA\s+D\b/i,
      ],
      aliases: ["VITAMINA D", "25-HIDRÓXI VITAMINA D", "25 HIDROXI VITAMINA D"],
    },
    { sigla: "B12", patterns: [/\bVITAMINA\s+B12\b/i], aliases: ["VITAMINA B12", "B12"] },
    { sigla: "Fol", patterns: [/\b[ÁA]CIDO\s+F[ÓO]LICO\b/i], aliases: ["ACIDO FOLICO"] },
    { sigla: "Cort", patterns: [/\bCORTISOL\b/i], aliases: ["CORTISOL"] },
    { sigla: "PTH", patterns: [/\bPTH\b/i, /\bPARATORM[ÔO]NIO\b/i], aliases: ["PTH", "PARATORMONIO"] },

    // Marcadores tumorais
    { sigla: "CEA", patterns: [/\bCEA\b/i], aliases: ["CEA"] },
    {
      sigla: "AFP",
      patterns: [/\b(ALFAFETOPROTE[ÍI]NA|ALFAFETO)\b/i, /\bAFP\b/i],
      aliases: ["AFP", "ALFAFETOPROTEINA", "ALFAFETO"],
    },
    { sigla: "CA19-9", patterns: [/\bCA\s*19\s*-?\s*9\b/i], aliases: ["CA 19-9", "CA19-9"] },

    // Sorologias
    {
      sigla: "ANTIHIV",
      patterns: [
        /\bANTI\s*-?\s*HIV\b/i,
        /\bANTICORPOS?\s+ANTI\s*-?\s*HIV\b/i,
        /\bHIV\s*(?:1|2|I{1,2})?\b/i,
        /\bSOROLOGIA\s+(?:PARA\s+)?HIV\b/i,
      ],
      aliases: ["ANTI HIV", "ANTIHIV", "HIV", "ANTICORPOS ANTI HIV"],
    },
    {
      sigla: "ANTIHBS",
      patterns: [/\bANTI\s*-?\s*HBS\b/i, /\bANTICORPOS?\s+ANTI\s*-?\s*HBS\b/i],
      aliases: ["ANTI HBS", "ANTIHBS", "ANTICORPOS ANTI HBS"],
    },
    {
      sigla: "ANTIHCV",
      patterns: [/\bANTI\s*-?\s*HCV\b/i, /\bANTICORPOS?\s+ANTI\s*-?\s*HCV\b/i],
      aliases: ["ANTI HCV", "ANTIHCV", "ANTICORPOS ANTI HCV"],
    },
    {
      sigla: "HBSAG",
      patterns: [/\bHBSAG\b/i, /\bHBsAg\b/i, /\bANT[ÍI]GENO\s+HBS\b/i, /\bAGHBs\b/i],
      aliases: ["HBSAG", "ANTIGENO HBS", "AG HBS"],
    },
    {
      sigla: "ANTIHBC",
      patterns: [
        /\bANTI\s*-?\s*HBC\b/i,
        /\bHEPATITE\s+B\b.*\bANTI\s*-?\s*HBC\b/i,
      ],
      aliases: ["ANTI HBC", "ANTI-HBC TOTAL", "ANTIHBC", "HEPATITE B ANTI-HBC"],
    },
    {
      sigla: "antiRNP",
      patterns: [
        /\bANTI\s*[-]?\s*RNP\b/i,
        /\bRNP\s*,\s*AUTO\s+ANTICORPOS/i,
      ],
      aliases: ["ANTI-RNP", "ANTI RNP", "RNP AUTO ANTICORPOS ANTI"],
    },

    // Urina / culturas
    { sigla: "EAS", patterns: [/\bURIN[ÁA]LISE\b/i, /\bEAS\b/i], aliases: ["EAS", "URINALISE"] },
    { sigla: "Urocult", patterns: [/\bUROCULTURA\b/i, /\bCULTURA\s+DE\s+URINA\b/i], aliases: ["UROCULTURA", "CULTURA DE URINA"] },
    { sigla: "Hemocult", patterns: [/\bHEMOCULTURA\b/i], aliases: ["HEMOCULTURA"] },
    { sigla: "ProtU", patterns: [/\bPROTE[ÍI]NA\s+URIN[ÁA]RIA\b/i], aliases: ["PROTEINA URINARIA"] },
    { sigla: "MicroAlb", patterns: [/\bMICROALBUMIN[ÚU]RIA\b/i], aliases: ["MICROALBUMINURIA"] },

    // Gasometria / oximetria / coagulação (laudos PDF)
    { sigla: "pH", patterns: [/\bpH\b/], aliases: ["PH", "pH"] },
    { sigla: "PaO2", patterns: [/\bPAO2\b/i, /\bPO2\b/i], aliases: ["PO2", "PAO2", "PaO2"] },
    { sigla: "PaCO2", patterns: [/\bPACO2\b/i, /\bPCO2\b/i], aliases: ["PCO2", "PACO2", "PaCO2"] },
    {
      sigla: "BE",
      patterns: [/\bBE\s*\(?\s*ecf\s*\)?\b/i, /\bBE\b(?=\s*[:\-])/i, /\bEXCESSO\s+DE\s+BASE\b/i],
      aliases: ["BE", "BE ECF", "BE(ECF)", "BE (ECF)"],
    },
    { sigla: "StO2", patterns: [/\bSATO2\b/i, /\bSTO2\b/i], aliases: ["SATO2", "STO2", "StO2"] },
    { sigla: "O2Hb", patterns: [/\bO2HB\b/i], aliases: ["O2HB", "O2Hb"] },
    { sigla: "COHb", patterns: [/\bCOHB\b/i], aliases: ["COHB", "COHb"] },
    { sigla: "HHb", patterns: [/\bHHB\b/i], aliases: ["HHB", "HHb"] },
    { sigla: "MetHb", patterns: [/\bMETHB\b/i], aliases: ["METHB", "MetHb"] },
    { sigla: "tHb", patterns: [/\bTHB\b/i], aliases: ["THB", "tHb"] },
    { sigla: "ctO2", patterns: [/\bCTO2\b/i], aliases: ["CTO2", "ctO2"] },
    { sigla: "P50", patterns: [/\bP50\b/i], aliases: ["P50"] },
    { sigla: "Osm", patterns: [/\bOSM\b(?=\s*[:\d])/i, /\bOSMOLALIDADE\b/i], aliases: ["OSM", "OSMOLALIDADE"] },
    { sigla: "nBili", patterns: [/\bNBILI\b/i], aliases: ["NBILI", "nBili"] },
    {
      sigla: "AG",
      patterns: [/\bAG\b(?=\s*[:\d])/i, /\bANION\s+GAP\b/i, /\bGAP\s+AN[IÍ]ONICO\b/i],
      aliases: ["AG", "ANION GAP", "GAP ANIONICO"],
    },
    {
      sigla: "RelPC",
      patterns: [/\bRELA[ÇC][AÃ]O\s+PACIENTE\s*\/?\s*CONTROLE\b/i],
      aliases: ["RELACAO PACIENTE/CONTROLE", "RELAÇÃO PACIENTE/CONTROLE"],
    },
    { sigla: "Hct", patterns: [/\bHCT\b(?=\s*[:\d])/i], aliases: ["HCT", "Hct"] },

    // Painéis (nome do exame)
    { sigla: "Hemograma", patterns: [/\bHEMOGRAMA\b/i], aliases: ["HEMOGRAMA"] },
    { sigla: "Gaso", patterns: [/\bGASOSMETRIA\b/i, /\bGASOMETRIA\b/i], aliases: ["GASOMETRIA", "GASOSMETRIA"] },
    { sigla: "Lact", patterns: [/\bLACTATO\b/i, /\bLACTATE\b/i], aliases: ["LACTATO", "LACTATE"] },
    {
      sigla: "PF",
      patterns: [/\bP\s*\/\s*F\b/i, /\bRELA[ÇC][AÃ]O\s+P\s*\/\s*F\b/i],
      aliases: ["P/F", "RELACAO P/F", "RELAÇÃO P/F"],
    },
  ];

  function removeDiacritics(s) {
    try {
      return s.normalize("NFD").replace(/\p{Diacritic}/gu, "");
    } catch (_e) {
      // Fallback (ambientes sem Unicode property escapes)
      return s.normalize ? s.normalize("NFD").replace(/[\u0300-\u036f]/g, "") : s;
    }
  }

  function normalizeLabel(label) {
    const raw = (label || "").trim();
    if (!raw) return "";
    const noAcc = removeDiacritics(raw);
    return noAcc
      .toUpperCase()
      .replace(/[(){}\[\],.;:]/g, " ")
      .replace(/\s+/g, " ")
      .replace(STOPWORDS_RE, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeSigla(sigla) {
    return normalizeLabel(sigla).replace(/[^A-Z0-9]/g, "");
  }

  function validateCatalog() {
    const seen = new Map(); // key -> sigla
    for (const entry of EXAM_SIGLAS) {
      const k = normalizeSigla(entry.sigla);
      if (!k) throw new Error("[AGHU siglas] sigla vazia no catálogo.");
      if (seen.has(k)) {
        throw new Error(
          `[AGHU siglas] colisão de sigla canônica: "${entry.sigla}" conflita com "${seen.get(k)}".`
        );
      }
      seen.set(k, entry.sigla);

      for (const a of entry.aliases || []) {
        const ak = normalizeLabel(a);
        if (!ak) continue;
        const aliasKey = `ALIAS:${ak}`;
        if (seen.has(aliasKey)) {
          const existing = seen.get(aliasKey);
          if (existing === entry.sigla) continue;
          throw new Error(
            `[AGHU siglas] colisão de alias: "${a}" conflita com "${existing}".`
          );
        }
        seen.set(aliasKey, entry.sigla);
      }
    }
  }

  function resolveByAlias(normalizedLabel) {
    if (!normalizedLabel) return null;
    for (const entry of EXAM_SIGLAS) {
      for (const a of entry.aliases || []) {
        if (normalizeLabel(a) === normalizedLabel) return entry.sigla;
      }
    }
    return null;
  }

  /** Normaliza Unicode (NFKC), vírgulas alternativas e espaços invisíveis do PDF. */
  function sanitizeRawLabel(s) {
    let t = String(s || "").trim();
    try {
      t = t.normalize("NFKC");
    } catch (_e) {
      /* ignore */
    }
    return t
      .replace(/\uFEFF/g, "")
      .replace(/[\u00A0\u2007\u202F]/g, " ")
      .replace(/[\u200B-\u200D\u00AD]/g, "")
      .replace(/\uFF0C/g, ",")
      .replace(/\bFERROITINA\b/gi, "FERRITINA")
      .replace(/\s+/g, " ")
      .trim();
  }

  function resolveSigla(label) {
    const raw = sanitizeRawLabel(label);
    if (!raw) return "";

    // 1) Match por regex no label original (mais flexível)
    for (const entry of EXAM_SIGLAS) {
      for (const re of entry.patterns || []) {
        if (re.test(raw)) return entry.sigla;
      }
    }

    // 2) Match exato por alias/nome normalizado
    const norm = normalizeLabel(raw);
    const aliasHit = resolveByAlias(norm);
    if (aliasHit) return aliasHit;

    // 3) Fallback: sem match no catálogo, mantém o nome completo (só normaliza espaços / remove stopwords neutras).
    const cleaned = raw.replace(STOPWORDS_RE, "").replace(/\s+/g, " ").trim();
    if (!cleaned) return raw;
    return cleaned;
  }

  function escapeRe(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * Remove do início de `remainder` uma segunda ocorrência do mesmo analito
   * (sigla canônica ou aliases), ex.: "TTPa: Tempo de tromboplastina 28 s".
   * Tokens curtos (≤5 caracteres sem espaço) usam limite de palavra (\b) para evitar falso positivo.
   */
  function stripLeadingSynonym(resolvedSigla, remainder) {
    let r = String(remainder || "").trim();
    if (!r || !resolvedSigla) return r;
    const entry = EXAM_SIGLAS.find((e) => e.sigla === resolvedSigla);
    if (!entry) return r;

    const variants = [];
    if (entry.sigla) variants.push(entry.sigla);
    for (const a of entry.aliases || []) variants.push(a);
    variants.sort((a, b) => String(b).length - String(a).length);

    function variantPrefixRe(t) {
      const raw = String(t).trim();
      if (!raw) return null;
      const e = escapeRe(raw);
      const compactLen = raw.replace(/\s/g, "").length;
      if (compactLen <= 5 && !/\s/.test(raw)) {
        return new RegExp("^" + e + "\\b\\s*([:\\-–])?\\s*", "i");
      }
      return new RegExp("^" + e + "\\s*([:\\-–])?\\s*", "i");
    }

    let changed = true;
    while (changed) {
      changed = false;
      for (const v of variants) {
        const re = variantPrefixRe(v);
        if (!re) continue;
        const next = r.replace(re, "").trim();
        if (next.length < r.length) {
          r = next;
          changed = true;
          break;
        }
      }
    }
    return r;
  }

  // Valida em load (falha cedo)
  validateCatalog();

  var api = {
    EXAM_SIGLAS: EXAM_SIGLAS,
    normalizeLabel: normalizeLabel,
    normalizeSigla: normalizeSigla,
    sanitizeRawLabel: sanitizeRawLabel,
    resolveSigla: resolveSigla,
    stripLeadingSynonym: stripLeadingSynonym,
    validateCatalog: validateCatalog,
  };

  // SSR-safe / Node: espelho do vendor web — preferir globalThis; mirror window no browser.
  if (typeof globalThis !== "undefined") {
    globalThis.AghuExamSiglas = api;
  }
  if (typeof window !== "undefined") {
    window.AghuExamSiglas = api;
  }
})();


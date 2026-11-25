/**
 * Schema de receituário (ReceitaSnapV1) — partilhado web/extensão.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuReceitaSchema = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var PRESCRIPTION_CLASSES = [
    "SIMPLE",
    "SPECIAL_ANTIMICROBIAL",
    "SPECIAL_CONTROL",
    "SPECIAL_NOTIFICATION",
  ];

  var CLASS_SOURCES = ["CATALOG", "MANUAL", "AGHU_IMPORT", "TEMPLATE"];

  function newId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return "00000000-0000-4000-8000-" + String(Date.now()).slice(-12);
  }

  function emptyReceitaSnap() {
    return { version: 1, receitas: [], atualizadoEm: null };
  }

  function emptyPatientAddress() {
    return {
      street: "",
      number: "",
      neighborhood: "",
      city: "",
      state: "ES",
    };
  }

  function normalizePatientAddress(raw) {
    if (!raw || typeof raw !== "object") return emptyPatientAddress();
    var state = String(raw.state || "ES").trim().toUpperCase();
    return {
      street: String(raw.street || "").trim(),
      number: String(raw.number || "").trim(),
      neighborhood: String(raw.neighborhood || "").trim(),
      city: String(raw.city || "").trim(),
      state: state ? state.slice(0, 2) : "ES",
    };
  }

  function isPatientAddressComplete(raw) {
    var addr = normalizePatientAddress(raw);
    return !!(
      addr.street &&
      addr.number &&
      addr.neighborhood &&
      addr.city &&
      addr.state
    );
  }

  function hasPatientAddressContent(raw) {
    var addr = normalizePatientAddress(raw);
    return !!(
      addr.street ||
      addr.number ||
      addr.neighborhood ||
      addr.city ||
      (addr.state && addr.state !== "ES")
    );
  }

  function addressContentScore(raw) {
    var addr = normalizePatientAddress(raw);
    var score = 0;
    if (addr.street) score += 1;
    if (addr.number) score += 1;
    if (addr.neighborhood) score += 1;
    if (addr.city) score += 1;
    if (addr.state) score += 1;
    return score;
  }

  function resolveBestPatientAddressFromSnap(snap, activeDocId) {
    if (!snap || !Array.isArray(snap.receitas)) return emptyPatientAddress();
    var best = emptyPatientAddress();
    var bestScore = 0;
    for (var i = 0; i < snap.receitas.length; i++) {
      var d = snap.receitas[i];
      if (!d || !d.patientAddress) continue;
      var score = addressContentScore(d.patientAddress);
      if (activeDocId && d.id === activeDocId) score += 10;
      if (score > bestScore) {
        bestScore = score;
        best = normalizePatientAddress(d.patientAddress);
      }
    }
    return best;
  }

  function lineHasMedication(line) {
    return !!(line && String(line.drugName || "").trim());
  }

  function snapHasMedicationLines(snap) {
    if (!snap || !Array.isArray(snap.receitas)) return false;
    for (var i = 0; i < snap.receitas.length; i++) {
      var d = snap.receitas[i];
      if (!d || !Array.isArray(d.lines)) continue;
      for (var j = 0; j < d.lines.length; j++) {
        if (lineHasMedication(d.lines[j])) return true;
      }
    }
    return false;
  }

  function snapHasSaveableContent(snap, _nome) {
    return snapHasMedicationLines(snap);
  }

  function emptyReceitaDoc() {
    var now = Date.now();
    return {
      id: newId(),
      titulo: "",
      createdAt: now,
      updatedAt: now,
      issuedAt: new Date().toISOString().slice(0, 10),
      lines: [],
      notes: "",
      appliedTemplateId: null,
      patientAddress: emptyPatientAddress(),
    };
  }

  function getLineSuffix(line) {
    if (!line || typeof line !== "object") return "";
    var q = String(line.quantity || "").trim();
    var d = String(line.duration || "").trim();
    if (q) return q;
    return d;
  }

  function normalizeLine(raw) {
    if (!raw || typeof raw !== "object") return null;
    var cls = String(raw.prescriptionDocumentClass || "SIMPLE");
    if (PRESCRIPTION_CLASSES.indexOf(cls) < 0) cls = "SIMPLE";
    var src = String(raw.classSource || "MANUAL");
    if (CLASS_SOURCES.indexOf(src) < 0) src = "MANUAL";
    return {
      id: raw.id && String(raw.id) ? String(raw.id) : newId(),
      drugName: String(raw.drugName || "").trim(),
      catalogKey: raw.catalogKey ? String(raw.catalogKey) : null,
      presentation: raw.presentation ? String(raw.presentation) : "",
      dose: raw.dose ? String(raw.dose) : "",
      route: raw.route ? String(raw.route) : "",
      posology: String(raw.posology || "").trim(),
      duration: raw.duration ? String(raw.duration) : "",
      quantity: raw.quantity ? String(raw.quantity) : "",
      prescriptionDocumentClass: cls,
      classSource: src,
      controlListCode: raw.controlListCode ? String(raw.controlListCode) : null,
      validityDays:
        typeof raw.validityDays === "number" && Number.isFinite(raw.validityDays)
          ? raw.validityDays
          : null,
    };
  }

  function normalizeSnap(raw) {
    if (!raw || typeof raw !== "object") return emptyReceitaSnap();
    var receitas = [];
    if (Array.isArray(raw.receitas)) {
      for (var i = 0; i < raw.receitas.length; i++) {
        var d = raw.receitas[i];
        if (!d || typeof d !== "object") continue;
        var lines = [];
        if (Array.isArray(d.lines)) {
          for (var j = 0; j < d.lines.length; j++) {
            var ln = normalizeLine(d.lines[j]);
            if (ln && ln.drugName) lines.push(ln);
          }
        }
        receitas.push({
          id: d.id && String(d.id) ? String(d.id) : newId(),
          titulo: d.titulo ? String(d.titulo) : "",
          createdAt: typeof d.createdAt === "number" ? d.createdAt : Date.now(),
          updatedAt: typeof d.updatedAt === "number" ? d.updatedAt : Date.now(),
          issuedAt: d.issuedAt ? String(d.issuedAt) : "",
          lines: lines,
          notes: d.notes ? String(d.notes) : "",
          appliedTemplateId: d.appliedTemplateId
            ? String(d.appliedTemplateId)
            : null,
          patientAddress: normalizePatientAddress(d.patientAddress),
        });
      }
    }
    return {
      version: 1,
      receitas: receitas,
      atualizadoEm:
        typeof raw.atualizadoEm === "number" ? raw.atualizadoEm : null,
    };
  }

  /** Receita especial ANVISA (controlados / notificação) — layout distinto da simples 2 vias. */
  function isAnvisaSpecialClass(cls) {
    return cls === "SPECIAL_CONTROL" || cls === "SPECIAL_NOTIFICATION";
  }

  /** Receita simples 2 vias HUCAM (comuns + antimicrobianos na alta). */
  function isSimplePrintClass(cls) {
    return cls === "SIMPLE" || cls === "SPECIAL_ANTIMICROBIAL";
  }

  /** @deprecated Use isAnvisaSpecialClass — antimicrobianos imprimem em receita simples. */
  function isSpecialClass(cls) {
    return isAnvisaSpecialClass(cls);
  }

  function groupLinesByPrintType(lines) {
    var simple = [];
    var special = [];
    var list = Array.isArray(lines) ? lines : [];
    for (var i = 0; i < list.length; i++) {
      var ln = list[i];
      if (!ln) continue;
      if (isAnvisaSpecialClass(ln.prescriptionDocumentClass)) special.push(ln);
      else if (isSimplePrintClass(ln.prescriptionDocumentClass)) simple.push(ln);
      else simple.push(ln);
    }
    return { simple: simple, special: special };
  }

  /** Bucket de impressão: simples (2 vias) vs especial (ANVISA). */
  function printBucketFromClass(cls) {
    return isAnvisaSpecialClass(cls) ? "special" : "simple";
  }

  /**
   * Override manual Simples/Especial (UI).
   * simple: mantém SIMPLE|SPECIAL_ANTIMICROBIAL; senão → SIMPLE.
   * special: mantém CONTROL|NOTIFICATION; senão → SPECIAL_CONTROL.
   */
  function applyPrintBucket(line, bucket) {
    if (!line || typeof line !== "object") return line;
    var b = String(bucket || "").toLowerCase() === "special" ? "special" : "simple";
    var current = String(line.prescriptionDocumentClass || "SIMPLE");
    if (PRESCRIPTION_CLASSES.indexOf(current) < 0) current = "SIMPLE";
    var nextCls = current;
    if (b === "special") {
      if (!isAnvisaSpecialClass(current)) nextCls = "SPECIAL_CONTROL";
    } else if (!isSimplePrintClass(current)) {
      nextCls = "SIMPLE";
    }
    return Object.assign({}, line, {
      prescriptionDocumentClass: nextCls,
      classSource: "MANUAL",
    });
  }

  /**
   * Mescla resolução do catálogo preservando override MANUAL (RX-AC-71).
   * @param {object} line linha actual
   * @param {object} resolved { prescriptionDocumentClass, controlListCode?, validityDays?, classSource? }
   */
  function mergeCatalogClass(line, resolved) {
    var res = resolved && typeof resolved === "object" ? resolved : {};
    if (line && String(line.classSource || "") === "MANUAL") {
      return {
        prescriptionDocumentClass: line.prescriptionDocumentClass || "SIMPLE",
        controlListCode: line.controlListCode != null ? line.controlListCode : null,
        validityDays:
          typeof line.validityDays === "number" && Number.isFinite(line.validityDays)
            ? line.validityDays
            : null,
        classSource: "MANUAL",
      };
    }
    var cls = String(res.prescriptionDocumentClass || "SIMPLE");
    if (PRESCRIPTION_CLASSES.indexOf(cls) < 0) cls = "SIMPLE";
    return {
      prescriptionDocumentClass: cls,
      controlListCode: res.controlListCode != null ? res.controlListCode : null,
      validityDays:
        typeof res.validityDays === "number" && Number.isFinite(res.validityDays)
          ? res.validityDays
          : null,
      classSource: res.classSource ? String(res.classSource) : "CATALOG",
    };
  }

  return {
    PRESCRIPTION_CLASSES: PRESCRIPTION_CLASSES,
    CLASS_SOURCES: CLASS_SOURCES,
    newId: newId,
    emptyPatientAddress: emptyPatientAddress,
    normalizePatientAddress: normalizePatientAddress,
    isPatientAddressComplete: isPatientAddressComplete,
    hasPatientAddressContent: hasPatientAddressContent,
    addressContentScore: addressContentScore,
    resolveBestPatientAddressFromSnap: resolveBestPatientAddressFromSnap,
    snapHasSaveableContent: snapHasSaveableContent,
    emptyReceitaSnap: emptyReceitaSnap,
    emptyReceitaDoc: emptyReceitaDoc,
    getLineSuffix: getLineSuffix,
    normalizeLine: normalizeLine,
    normalizeSnap: normalizeSnap,
    isAnvisaSpecialClass: isAnvisaSpecialClass,
    isSimplePrintClass: isSimplePrintClass,
    isSpecialClass: isSpecialClass,
    groupLinesByPrintType: groupLinesByPrintType,
    printBucketFromClass: printBucketFromClass,
    applyPrintBucket: applyPrintBucket,
    mergeCatalogClass: mergeCatalogClass,
  };
});

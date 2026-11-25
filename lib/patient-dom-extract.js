/**
 * patient-dom-extract.js — extração atômica nome+prontuário (sem misturar fontes DOM).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuPatientDomExtract = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function collectDocumentsForPatient(rootDoc) {
    var doc = rootDoc || (typeof document !== "undefined" ? document : null);
    if (!doc) return [];
    var docs = [];
    var seen = new Set();
    function add(d) {
      if (!d || !d.documentElement || seen.has(d)) return;
      seen.add(d);
      docs.push(d);
    }
    add(doc);
    var iframes = doc.querySelectorAll("iframe");
    for (var i = 0; i < iframes.length; i++) {
      try {
        add(iframes[i].contentDocument);
      } catch (e) {}
    }
    return docs;
  }

  function collectDocBodiesForPatient(rootDoc) {
    var bodies = [];
    var docs = collectDocumentsForPatient(rootDoc);
    for (var i = 0; i < docs.length; i++) {
      if (docs[i].body) bodies.push(docs[i].body);
    }
    return bodies;
  }

  function normalizeLeitoValue(raw) {
    var s = String(raw || "").trim();
    if (!s) return "";
    if (/^[-–—]+$/.test(s)) return "";
    if (/^n\/?a$/i.test(s)) return "";
    return s;
  }

  function domHintsLeitoFromDoc(doc) {
    var leito = "";

    var inputs = doc.querySelectorAll(
      'input[id*="leito" i], input[name*="leito" i]'
    );
    for (var i = 0; i < inputs.length; i++) {
      var v = normalizeLeitoValue(inputs[i].value);
      if (v) {
        leito = v;
        break;
      }
    }

    if (!leito) {
      var labels = doc.querySelectorAll("label");
      for (var j = 0; j < labels.length; j++) {
        var lbl = labels[j];
        var txt = (lbl.textContent || "").replace(/\s+/g, " ").trim();
        if (!/^leito\s*:?$/i.test(txt)) continue;
        var forId = lbl.getAttribute("for");
        if (forId) {
          var byFor = doc.getElementById(forId);
          var fromFor = normalizeLeitoValue(byFor && byFor.value);
          if (fromFor) {
            leito = fromFor;
            break;
          }
        }
        var innerInput = lbl.querySelector("input");
        var fromInner = normalizeLeitoValue(innerInput && innerInput.value);
        if (fromInner) {
          leito = fromInner;
          break;
        }
      }
    }

    return { leito: leito };
  }

  function parseLeitoFromBlob(blob) {
    if (!blob) return "";
    var m = String(blob).match(/Leito\s*:?\s*([^\n\r]+)/i);
    if (!m) return "";
    return normalizeLeitoValue(m[1]);
  }

  function aggregateDomLeitoHints(rootDoc) {
    var domLeito = "";
    var docs = collectDocumentsForPatient(rootDoc);
    for (var i = 0; i < docs.length; i++) {
      var h = domHintsLeitoFromDoc(docs[i]);
      if (h.leito) domLeito = h.leito;
    }
    return { leito: domLeito };
  }

  function domHintsPrescricaoFromDoc(doc) {
    var nome = "";
    var pront = "";
    var form =
      doc.getElementById("formPrescricaoCabecalho") ||
      doc.querySelector('[id*="formPrescricaoCabecalho"]');
    var searchRoot = form || doc;

    var nomeInput =
      searchRoot.querySelector('input[id*="nomePaciente"][id$="inputId"]') ||
      searchRoot.querySelector('input[id*="nomePaciente"]');
    if (nomeInput && nomeInput.value) nome = String(nomeInput.value).trim();

    var prontInput =
      searchRoot.querySelector('input[id*="prontuarioPaciente"][id$="inputId"]') ||
      searchRoot.querySelector('input[id*="prontuarioPaciente"]');
    if (prontInput && prontInput.value) pront = String(prontInput.value).trim();

    return { nomeCompleto: nome, prontRaw: pront };
  }

  function cleanPatientName(nomeCompleto) {
    var nome = (nomeCompleto || "").replace(/\s{2,}/g, " ");
    return nome.replace(/^\d+\s*[-–—]\s*/, "");
  }

  /** Rejeita rótulos de episódio/data (alinhado a hasPatientDisplayName). */
  function looksLikeEpisodeLabel(nome) {
    return /^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(String(nome || "").trim());
  }

  function hasAtomicIdentity(nome, pront) {
    if (!nome || !String(nome).trim() || !pront || !String(pront).trim()) return false;
    if (looksLikeEpisodeLabel(nome)) return false;
    return true;
  }

  function parsePacienteDlgPair(doc) {
    var dlg = doc.getElementById("pacienteDlg");
    if (!dlg) return null;
    var box = dlg.querySelector(".ui-dialog-content");
    if (!box) return null;
    var dt = (box.textContent || "").trim();
    var m = dt.match(/^(\d+)\s*[-–—]\s*(.+)$/);
    if (!m) return null;
    var nomeCompleto = cleanPatientName(m[2].trim());
    var prontRaw = String(m[1]).trim();
    if (!hasAtomicIdentity(nomeCompleto, prontRaw)) return null;
    return { nomeCompleto: nomeCompleto, prontRaw: prontRaw };
  }

  /**
   * Hints DOM atômicos: pacienteDlg ou prescrição completa (nome+prontuário).
   * Não combina sgDescricaoLabel com suggestionProntuario (evita nome stale).
   */
  function domHintsPatientFromDoc(doc) {
    var leitoHint = domHintsLeitoFromDoc(doc);
    var leito = leitoHint.leito || "";

    var dlgPair = parsePacienteDlgPair(doc);
    if (dlgPair) {
      return {
        nomeCompleto: dlgPair.nomeCompleto,
        prontRaw: dlgPair.prontRaw,
        leito: leito,
        atomic: true,
      };
    }

    var presc = domHintsPrescricaoFromDoc(doc);
    if (hasAtomicIdentity(presc.nomeCompleto, presc.prontRaw)) {
      return {
        nomeCompleto: presc.nomeCompleto,
        prontRaw: presc.prontRaw,
        leito: leito,
        atomic: true,
      };
    }

    return {
      nomeCompleto: "",
      prontRaw: "",
      leito: leito,
      atomic: false,
    };
  }

  function aggregateDomPatientHints(rootDoc) {
    var domNome = "";
    var domPront = "";
    var domLeito = "";
    var docs = collectDocumentsForPatient(rootDoc);
    for (var i = 0; i < docs.length; i++) {
      var h = domHintsPatientFromDoc(docs[i]);
      if (h.leito) domLeito = h.leito;
      if (h.atomic && hasAtomicIdentity(h.nomeCompleto, h.prontRaw)) {
        domNome = h.nomeCompleto;
        domPront = h.prontRaw;
      }
    }
    return { nomeCompleto: domNome, prontRaw: domPront, leito: domLeito };
  }

  function buildPatientInnerTextBlob(rootDoc) {
    var blob = "";
    var bodies = collectDocBodiesForPatient(rootDoc);
    for (var i = 0; i < bodies.length; i++) {
      blob += "\n" + (bodies[i].innerText || bodies[i].textContent || "");
    }
    return blob;
  }

  function parseAtomicLineFromBlob(blob) {
    var lines = String(blob).split(/\n/);
    for (var i = 0; i < lines.length; i++) {
      var m = lines[i].trim().match(/^(\d{5,})\s*[-–—]\s*(.+)$/);
      if (!m) continue;
      var nomeCompleto = cleanPatientName(m[2].trim());
      var prontRaw = String(m[1]).trim();
      if (hasAtomicIdentity(nomeCompleto, prontRaw)) {
        return { nomeCompleto: nomeCompleto, prontRaw: prontRaw };
      }
    }
    return null;
  }

  function normalizeProntuarioDigits(raw) {
    if (raw == null || raw === "") return "";
    var d = String(raw).replace(/\D/g, "");
    return d.replace(/^0+/, "") || d;
  }

  /**
   * Cabeçalho POL na casca: "22994453 - NOME" / em-dash — / sem espaços.
   * @returns {{ prontuario: string, nomeCompleto: string }|null}
   */
  function parsePolProntuarioNomeLine(raw) {
    if (!raw) return null;
    var t = String(raw).replace(/\s+/g, " ").trim();
    var m = t.match(/^(\d{5,})\s*[-–—]\s*(.+)$/);
    if (!m) return null;
    var nomeCompleto = cleanPatientName(m[2].trim());
    if (nomeCompleto.length < 2 || !/[A-Za-zÀ-ÿ]/.test(nomeCompleto)) return null;
    return {
      prontuario: normalizeProntuarioDigits(m[1]),
      nomeCompleto: nomeCompleto,
    };
  }

  /**
   * Dígitos do prontuário no texto do h3 POL (linha "NNNN - NOME" ou leading digits).
   */
  function h3ProntuarioDigits(h3) {
    if (!h3) return "";
    var txt = (h3.textContent || h3.innerText || "").replace(/\s+/g, " ").trim();
    var parsed = parsePolProntuarioNomeLine(txt);
    if (parsed && parsed.prontuario) return parsed.prontuario;
    var m = txt.match(/(\d{5,})/);
    return m ? normalizeProntuarioDigits(m[1]) : "";
  }

  /**
   * Accordion POL ativo na lista acumulativa.
   * Preferência: expectedProntuario → ui-state-active → único h3.
   * Nunca o primeiro h3 inativo quando há vários.
   * @param {Document} doc
   * @param {string} [expectedProntuario]
   * @returns {Element|null}
   */
  function getActivePolAccordionH3(doc, expectedProntuario) {
    if (!doc || !doc.querySelector) return null;
    var expected = expectedProntuario
      ? normalizeProntuarioDigits(expectedProntuario)
      : "";

    var all = null;
    if (typeof doc.querySelectorAll === "function") {
      all = doc.querySelectorAll("h3.accordion-tab-pol");
    }

    if (expected && all && all.length) {
      for (var i = 0; i < all.length; i++) {
        if (h3ProntuarioDigits(all[i]) === expected) return all[i];
      }
    }

    var active = doc.querySelector("h3.accordion-tab-pol.ui-state-active");
    if (active) return active;

    if (all && all.length === 1) return all[0];

    // Mock/legado sem querySelectorAll: um único via querySelector
    if (!all || !all.length) {
      if (doc.querySelector("h3.accordion-tab-pol.ui-state-active")) {
        return doc.querySelector("h3.accordion-tab-pol.ui-state-active");
      }
      var lone = doc.querySelector("h3.accordion-tab-pol");
      if (lone) return lone;
    }
    return null;
  }

  /**
   * Parse identidade a partir de um h3.accordion-tab-pol (text + title truncado).
   * @returns {{ prontuario: string, nomeCompleto: string }|null}
   */
  function parsePolPatientFromH3(h3) {
    if (!h3) return null;
    var txt = (h3.textContent || h3.innerText || "").replace(/\s+/g, " ").trim();
    var parsed = parsePolProntuarioNomeLine(txt);
    if (!parsed) {
      var title = (h3.getAttribute && h3.getAttribute("title")) || "";
      title = String(title).trim();
      var numMatch = txt.match(/(\d{5,})/);
      if (title && numMatch && /[A-Za-zÀ-ÿ]/.test(title)) {
        parsed = {
          prontuario: normalizeProntuarioDigits(numMatch[1]),
          nomeCompleto: cleanPatientName(title.replace(/\s{2,}/g, " ")),
        };
      }
    }
    if (parsed && parsed.prontuario && parsed.nomeCompleto) return parsed;
    return null;
  }

  /**
   * POL casca: #pacientePol dialog, h3.accordion-tab-pol ativo (+ title se texto truncado).
   * @param {Document} doc
   * @param {string} [expectedProntuario] — se informado, escolhe o h3 com esses dígitos
   * @returns {{ prontuario: string, nomeCompleto: string }|null}
   */
  function extractPolPatientFromCascaDom(doc, expectedProntuario) {
    if (!doc || !doc.querySelector) return null;
    var polDlg = doc.querySelector("#pacientePol .ui-dialog-content");
    if (polDlg) {
      var rawDlg = (polDlg.textContent || polDlg.innerText || "").trim();
      var parsedDlg = parsePolProntuarioNomeLine(rawDlg);
      if (parsedDlg && parsedDlg.prontuario && parsedDlg.nomeCompleto) {
        if (
          !expectedProntuario ||
          parsedDlg.prontuario ===
            normalizeProntuarioDigits(expectedProntuario)
        ) {
          return parsedDlg;
        }
      }
    }
    var h3 = getActivePolAccordionH3(doc, expectedProntuario);
    return parsePolPatientFromH3(h3);
  }

  /**
   * Prefere par completo da casca POL; senão completa lacunas do blob/hints.
   * @param {Document} doc
   * @param {string} blob
   * @param {string} nomeCompleto
   * @param {string} prontRaw
   * @param {string} [expectedProntuario]
   * @returns {{ nomeCompleto: string, prontRaw: string }}
   */
  function mergePatientFromPolCasca(doc, blob, nomeCompleto, prontRaw, expectedProntuario) {
    var nome = (nomeCompleto || "").trim();
    var pront = (prontRaw || "").trim();
    var dom = extractPolPatientFromCascaDom(doc, expectedProntuario);
    if (dom && dom.prontuario && dom.nomeCompleto) {
      return { nomeCompleto: dom.nomeCompleto, prontRaw: dom.prontuario };
    }
    if (!nome || !pront) {
      var lines = String(blob || "").split(/\n/);
      for (var i = 0; i < lines.length; i++) {
        var parsed = parsePolProntuarioNomeLine(lines[i]);
        if (!parsed || !parsed.prontuario || !parsed.nomeCompleto) continue;
        if (!nome) nome = parsed.nomeCompleto;
        if (!pront) pront = parsed.prontuario;
        if (nome && pront) break;
      }
    }
    return { nomeCompleto: nome, prontRaw: pront };
  }

  /**
   * Regex no blob; domHints só quando par atômico (nome+prontuário).
   */
  function parsePatientLabelsFromBlob(blob, domHints) {
    domHints = domHints || { nomeCompleto: "", prontRaw: "" };
    var nomeCompleto = "";
    var prontRaw = "";

    if (hasAtomicIdentity(domHints.nomeCompleto, domHints.prontRaw)) {
      nomeCompleto = String(domHints.nomeCompleto).trim();
      prontRaw = String(domHints.prontRaw);
    } else {
      var atomicLine = parseAtomicLineFromBlob(blob);
      if (atomicLine) {
        nomeCompleto = atomicLine.nomeCompleto;
        prontRaw = atomicLine.prontRaw;
      }
    }

    if (!hasAtomicIdentity(nomeCompleto, prontRaw)) {
      return { nomeCompleto: "", prontRaw: "" };
    }

    return { nomeCompleto: cleanPatientName(nomeCompleto), prontRaw: prontRaw };
  }

  return {
    collectDocumentsForPatient: collectDocumentsForPatient,
    collectDocBodiesForPatient: collectDocBodiesForPatient,
    domHintsPrescricaoFromDoc: domHintsPrescricaoFromDoc,
    domHintsLeitoFromDoc: domHintsLeitoFromDoc,
    aggregateDomLeitoHints: aggregateDomLeitoHints,
    parseLeitoFromBlob: parseLeitoFromBlob,
    normalizeLeitoValue: normalizeLeitoValue,
    domHintsPatientFromDoc: domHintsPatientFromDoc,
    aggregateDomPatientHints: aggregateDomPatientHints,
    buildPatientInnerTextBlob: buildPatientInnerTextBlob,
    parsePatientLabelsFromBlob: parsePatientLabelsFromBlob,
    parseAtomicLineFromBlob: parseAtomicLineFromBlob,
    hasAtomicIdentity: hasAtomicIdentity,
    cleanPatientName: cleanPatientName,
    normalizeProntuarioDigits: normalizeProntuarioDigits,
    parsePolProntuarioNomeLine: parsePolProntuarioNomeLine,
    getActivePolAccordionH3: getActivePolAccordionH3,
    extractPolPatientFromCascaDom: extractPolPatientFromCascaDom,
    mergePatientFromPolCasca: mergePatientFromPolCasca,
  };
});

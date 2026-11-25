/**
 * Demografia do paciente na tela POL (Sexo, Data de Nascimento) — parse por rótulo.
 * Testável em Node via module.exports (documento DOM mock).
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuPatientPolDemographics = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  function loadDateBr() {
    if (root.AghuDateBr) return root.AghuDateBr;
    if (typeof require === "function") {
      try {
        return require("./date-br.js");
      } catch (_e) {}
    }
    return null;
  }

  function loadCkd() {
    if (root.AghuCkdEpiEgfr) return root.AghuCkdEpiEgfr;
    if (typeof require === "function") {
      try {
        return require("./ckd-epi-egfr.js");
      } catch (_e) {}
    }
    return null;
  }

  function loadExamParse() {
    if (root.AghuExamTableParse) return root.AghuExamTableParse;
    if (typeof require === "function") {
      try {
        return require("./exam-table-parse.js");
      } catch (_e) {}
    }
    return null;
  }

  function normalizeLabelText(raw) {
    return String(raw || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase()
      .replace(/:$/, "");
  }

  function readValueFromFieldEl(el) {
    if (!el) return "";
    var tag = String(el.tagName || "").toUpperCase();
    if (el.classList && el.classList.contains("ui-calendar") && el.querySelector) {
      var calIn = el.querySelector("input");
      if (calIn) {
        var vCal = readValueFromFieldEl(calIn);
        if (vCal) return vCal;
      }
    }
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") {
      var v = String(el.value || el.getAttribute("value") || "").trim();
      if (v) return v;
      var aria = el.getAttribute && el.getAttribute("aria-valuenow");
      if (aria) return String(aria).trim();
      return "";
    }
    if (el.classList && el.classList.contains("ui-outputlabel-value")) {
      return String(el.textContent || el.innerText || "").trim();
    }
    if (el.querySelector) {
      var outVal = el.querySelector("span.ui-outputlabel-value");
      if (outVal) {
        var vOut = String(outVal.textContent || outVal.innerText || "").trim();
        if (vOut) return vOut;
      }
      if (el.querySelectorAll) {
        var fields = el.querySelectorAll("input, select, textarea");
        for (var fi = 0; fi < fields.length; fi++) {
          var field = fields[fi];
          if (field === el) continue;
          var typ = field.getAttribute
            ? String(field.getAttribute("type") || "").toLowerCase()
            : "";
          if (typ === "hidden") continue;
          var vAny = readValueFromFieldEl(field);
          if (vAny) return vAny;
        }
      }
    }
    return String(el.textContent || el.innerText || "").trim();
  }

  function compactSlashLabel(raw) {
    return normalizeLabelText(raw).replace(/\s*\/\s*/g, "/");
  }

  function labelMatches(elText, needle) {
    var t = normalizeLabelText(elText);
    var n = normalizeLabelText(needle);
    if (t === n || t === n + ":" || t.indexOf(n + " ") === 0) return true;
    var tSlash = compactSlashLabel(elText);
    var nSlash = compactSlashLabel(needle);
    return (
      tSlash === nSlash ||
      tSlash === nSlash + ":" ||
      tSlash.indexOf(nSlash + " ") === 0
    );
  }

  /**
   * @param {string} raw
   * @returns {string|null}
   */
  function normalizeNomeCompleto(raw) {
    if (!raw) return null;
    var nome = String(raw).replace(/\s+/g, " ").trim();
    nome = nome.replace(/^\d+\s*[-–—]\s*/, "");
    if (nome.length < 2 || !/[A-Za-zÀ-ÿ]/.test(nome)) return null;
    return nome;
  }

  /**
   * @param {Document|object} doc
   * @param {string} labelText ex.: "Sexo", "Data de Nascimento"
   * @returns {string}
   */
  function findValueByLabel(doc, labelText) {
    if (!doc || !labelText) return "";
    var needle = normalizeLabelText(labelText);
    var candidates = doc.querySelectorAll
      ? doc.querySelectorAll(
          "label, span.ui-outputlabel, td, th, div.ui-outputpanel, span",
        )
      : [];

    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      var own = normalizeLabelText(el.textContent || "");
      if (!labelMatches(own, needle)) continue;
      if (own.length > needle.length + 40) continue;

      var forId = el.getAttribute && el.getAttribute("for");
      if (forId && doc.getElementById) {
        var byFor = doc.getElementById(forId);
        var vFor = readValueFromFieldEl(byFor);
        if (vFor) return vFor;
      }

      var parent = el.parentElement;
      if (parent && parent.querySelector) {
        var inParent = parent.querySelector(
          "input, select, textarea, span.ui-outputlabel-value, span[id*='output'], .ui-calendar input",
        );
        if (inParent && inParent !== el) {
          var vParent = readValueFromFieldEl(inParent);
          if (vParent) return vParent;
        }
      }

      if (el.closest) {
        var row = el.closest("tr");
        if (row) {
          var cells = row.querySelectorAll("th, td");
          var labelCellIdx = -1;
          for (var c = 0; c < cells.length; c++) {
            if (cells[c] === el || cells[c].contains(el)) {
              labelCellIdx = c;
              break;
            }
          }
          if (labelCellIdx >= 0 && labelCellIdx + 1 < cells.length) {
            var vCell = readValueFromFieldEl(cells[labelCellIdx + 1]);
            if (vCell) return vCell;
          }
        }
      }

      var sib = el.nextElementSibling;
      if (sib) {
        var vSib = readValueFromFieldEl(sib);
        if (vSib) return vSib;
      }
    }

    if (doc.body) {
      var blob = doc.body.innerText || doc.body.textContent || "";
      var lines = String(blob).split(/\n/);
      for (var li = 0; li < lines.length; li++) {
        var line = lines[li].trim();
        var m = line.match(/^([^:]+):\s*(.+)$/);
        if (!m) continue;
        if (!labelMatches(m[1], needle)) continue;
        return m[2].trim();
      }
    }

    return "";
  }

  function parseSexoRaw(raw, normalizeSex) {
    if (!raw) return null;
    if (normalizeSex) return normalizeSex(raw);
    var t = String(raw).trim().toUpperCase();
    if (t === "M" || t === "MASCULINO") return "M";
    if (t === "F" || t === "FEMININO") return "F";
    return null;
  }

  var DOB_LABELS = [
    "Data de Nascimento",
    "Dt. Nascimento",
    "Data Nasc.",
  ];

  function findInputValueByIdFragment(doc, fragment) {
    if (!doc || !doc.querySelectorAll) return "";
    var frag = String(fragment || "").toLowerCase();
    var inputs = doc.querySelectorAll("input");
    for (var i = 0; i < inputs.length; i++) {
      var idAttr =
        (inputs[i].getAttribute && inputs[i].getAttribute("id")) ||
        inputs[i].id ||
        "";
      var id = String(idAttr).toLowerCase();
      if (id.indexOf(frag) < 0) continue;
      var v = readValueFromFieldEl(inputs[i]);
      if (v) return v;
    }
    return "";
  }

  /**
   * @param {Document|object} doc
   * @returns {string}
   */
  function findDobRaw(doc) {
    if (!doc) return "";
    for (var li = 0; li < DOB_LABELS.length; li++) {
      var byLabel = findValueByLabel(doc, DOB_LABELS[li]);
      if (byLabel) return byLabel;
    }
    var byId =
      findInputValueByIdFragment(doc, "datanasc") ||
      findInputValueByIdFragment(doc, "nascimento");
    if (byId) return byId;
    if (doc.querySelector) {
      var cal = doc.querySelector(".ui-calendar input, input.hasDatepicker");
      if (cal) {
        var vCal = readValueFromFieldEl(cal);
        if (vCal) return vCal;
      }
      var cals = doc.querySelectorAll(".ui-calendar input");
      for (var c = 0; c < cals.length; c++) {
        var vc = readValueFromFieldEl(cals[c]);
        if (vc && /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(vc)) return vc;
      }
    }
    return "";
  }

  function parseDobRaw(raw, dateBr) {
    if (!raw) return null;
    var br = dateBr || loadDateBr();
    var cleaned = String(raw).trim();
    cleaned = cleaned.replace(/\s+\d{1,2}:\d{2}(:\d{2})?(\.\d+)?\s*$/, "");
    if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return cleaned;
    if (br && br.brToIso) return br.brToIso(cleaned);
    return null;
  }

  function hasReadableDob(doc) {
    var raw = findDobRaw(doc);
    if (!raw) return false;
    return !!parseDobRaw(raw, loadDateBr());
  }

  function getDocHref(doc) {
    try {
      return String(doc.location && doc.location.href ? doc.location.href : "");
    } catch (_e) {
      return "";
    }
  }

  function findFieldByIdOrLabel(doc, idFragments, labels) {
    var i;
    if (Array.isArray(idFragments)) {
      for (i = 0; i < idFragments.length; i++) {
        var byId = findInputValueByIdFragment(doc, idFragments[i]);
        if (byId) return byId;
      }
    }
    if (Array.isArray(labels)) {
      for (i = 0; i < labels.length; i++) {
        var byLabel = findValueByLabel(doc, labels[i]);
        if (byLabel) return byLabel;
      }
    }
    return "";
  }

  function trimOrNull(raw) {
    var t = String(raw || "").replace(/\s+/g, " ").trim();
    return t || null;
  }

  function buildPatientAddress(parts) {
    parts = parts || {};
    var street = String(parts.street || "").trim();
    var complement = String(parts.complement || "").trim();
    if (street && complement) street = street + ", " + complement;
    else if (!street && complement) street = complement;
    var addr = {
      street: street,
      number: String(parts.number || "").trim(),
      neighborhood: String(parts.neighborhood || "").trim(),
      city: String(parts.city || "").trim(),
      state: String(parts.state || "").trim().toUpperCase().slice(0, 2),
    };
    if (
      !addr.street &&
      !addr.number &&
      !addr.neighborhood &&
      !addr.city &&
      !addr.state
    ) {
      return null;
    }
    if (!addr.state) addr.state = "ES";
    return addr;
  }

  /**
   * @param {Document|object} doc documento do #frame_pol
   * @returns {{
   *   sexo: 'M'|'F'|null,
   *   dataNascimentoISO: string|null,
   *   nomeCompleto: string|null,
   *   nomeMae: string|null,
   *   cartaoSus: string|null,
   *   patientAddress: object|null,
   *   local: object,
   *   missing: string[],
   *   raw: object,
   * }}
   */
  function extractDemographicsFromDoc(doc) {
    var ckd = loadCkd();
    var dateBr = loadDateBr();
    var normalizeSex = ckd && ckd.normalizeSex ? ckd.normalizeSex : null;

    var sexoRaw = findValueByLabel(doc, "Sexo");
    if (!sexoRaw && doc.querySelector) {
      var sexoInput = doc.querySelector("input[id*='sexo']");
      if (sexoInput) sexoRaw = readValueFromFieldEl(sexoInput);
    }
    var dobRaw = findDobRaw(doc);
    var nomeRaw =
      findValueByLabel(doc, "Nome / Nome Social") ||
      findValueByLabel(doc, "Nome/Nome Social") ||
      findValueByLabel(doc, "Nome");
    if (!nomeRaw && doc.querySelector) {
      var nomeInput = doc.querySelector("input[id*='nome']");
      if (nomeInput) {
        var nomeId = String(nomeInput.getAttribute("id") || "").toLowerCase();
        if (nomeId.indexOf("nome_mae") < 0 && nomeId.indexOf("nomemae") < 0) {
          nomeRaw = readValueFromFieldEl(nomeInput);
        }
      }
    }
    var sexo = parseSexoRaw(sexoRaw, normalizeSex);
    var dataNascimentoISO = parseDobRaw(dobRaw, dateBr);
    var nomeCompleto = normalizeNomeCompleto(nomeRaw);

    var nomeMaeRaw = findFieldByIdOrLabel(
      doc,
      ["nome_mae", "nomemae"],
      ["Nome da Mãe", "Nome da Mae"],
    );
    var cartaoSusRaw = findFieldByIdOrLabel(
      doc,
      ["nrocartaosaude", "cartaosaude", "cartaosus"],
      ["Cartão SUS", "Cartao SUS", "Cartão Nacional de Saúde"],
    );
    var logradouroRaw = findFieldByIdOrLabel(
      doc,
      ["logradouro"],
      ["Logradouro", "Endereço", "Endereco"],
    );
    var numeroRaw = findFieldByIdOrLabel(doc, ["numero"], ["Número", "Numero"]);
    var complementoRaw = findFieldByIdOrLabel(
      doc,
      ["complemento"],
      ["Complemento"],
    );
    var bairroRaw = findFieldByIdOrLabel(doc, ["bairro"], ["Bairro"]);
    var cidadeRaw = findFieldByIdOrLabel(
      doc,
      ["cidade", "municipio"],
      ["Cidade", "Município", "Municipio"],
    );
    var ufRaw = findFieldByIdOrLabel(doc, ["uf", ":estado"], ["UF", "Estado"]);

    var local = {
      nomePai: trimOrNull(
        findFieldByIdOrLabel(doc, ["nome_pai", "nomepai"], ["Nome do Pai"]),
      ),
      cor: trimOrNull(findFieldByIdOrLabel(doc, ["cor"], ["Cor", "Raça", "Raca"])),
      naturalidade: trimOrNull(
        findFieldByIdOrLabel(doc, ["naturalidade"], ["Naturalidade"]),
      ),
      nacionalidade: trimOrNull(
        findFieldByIdOrLabel(doc, ["nacionalidade"], ["Nacionalidade"]),
      ),
      estadoCivil: trimOrNull(
        findFieldByIdOrLabel(doc, ["estadocivil", "estado_civil"], ["Estado Civil"]),
      ),
      profissao: trimOrNull(
        findFieldByIdOrLabel(doc, ["profissao", "ocupacao"], ["Profissão", "Profissao"]),
      ),
      grauInstrucao: trimOrNull(
        findFieldByIdOrLabel(
          doc,
          ["grauinstrucao", "grau_instrucao", "escolaridade"],
          ["Grau de Instrução", "Grau de Instrucao", "Escolaridade"],
        ),
      ),
      telefone: trimOrNull(
        findFieldByIdOrLabel(doc, ["telefone", "foneresidencial"], ["Telefone"]),
      ),
      celular: trimOrNull(
        findFieldByIdOrLabel(doc, ["celular", "fonecelular"], ["Celular"]),
      ),
      cep: trimOrNull(findFieldByIdOrLabel(doc, ["cep"], ["CEP"])),
      complemento: trimOrNull(complementoRaw),
    };

    var patientAddress = buildPatientAddress({
      street: logradouroRaw,
      number: numeroRaw,
      complement: complementoRaw,
      neighborhood: bairroRaw,
      city: cidadeRaw,
      state: ufRaw,
    });

    var missing = [];
    if (!sexo) missing.push("sexo");
    if (!dataNascimentoISO) missing.push("dataNascimento");
    if (!nomeCompleto) missing.push("nomeCompleto");

    return {
      sexo: sexo,
      dataNascimentoISO: dataNascimentoISO,
      nomeCompleto: nomeCompleto,
      nomeMae: trimOrNull(nomeMaeRaw),
      cartaoSus: trimOrNull(cartaoSusRaw),
      patientAddress: patientAddress,
      local: local,
      missing: missing,
      raw: {
        sexo: sexoRaw,
        dataNascimento: dobRaw,
        nomeCompleto: nomeRaw,
        nomeMae: nomeMaeRaw,
        cartaoSus: cartaoSusRaw,
        logradouro: logradouroRaw,
        numero: numeroRaw,
        complemento: complementoRaw,
        bairro: bairroRaw,
        cidade: cidadeRaw,
        uf: ufRaw,
      },
    };
  }

  function frameBodyHasDadosPacienteContent(doc) {
    if (!doc || !doc.body) return false;
    var href = getDocHref(doc);
    var urlOk = /dadosPaciente|dados.*paciente/i.test(href);
    var hasSex =
      !!findValueByLabel(doc, "Sexo") ||
      !!(doc.querySelector && doc.querySelector("input[id*='sexo']"));
    var dobRaw = findDobRaw(doc);
    if (urlOk) {
      return !!(hasSex && dobRaw);
    }
    var blob = doc.body.innerText || doc.body.textContent || "";
    if (/dados\s*pessoais/i.test(blob)) return hasReadableDob(doc) || !!dobRaw;
    if (hasSex) return true;
    return false;
  }

  function frameLooksLikeDadosPaciente(doc) {
    if (!doc || !doc.body) return false;
    var href = "";
    try {
      href = String(doc.location && doc.location.href ? doc.location.href : "");
    } catch (_e) {}
    var urlOk = /dadosPaciente|dados.*paciente/i.test(href);
    var contentOk = frameBodyHasDadosPacienteContent(doc);
    if (urlOk) return contentOk;
    var parsed = extractDemographicsFromDoc(doc);
    return !!(
      parsed.sexo ||
      parsed.dataNascimentoISO ||
      parsed.nomeCompleto ||
      parsed.raw.sexo ||
      parsed.raw.dataNascimento ||
      parsed.raw.nomeCompleto
    );
  }

  function frameHasParseableExamRows(doc) {
    if (!doc) return false;
    var parse = loadExamParse();
    if (parse && parse.findTableBodyInDoc) {
      var tbody = parse.findTableBodyInDoc(doc);
      if (!tbody) return false;
      var rows = tbody.querySelectorAll("tr[data-ri]");
      if (!rows.length) return false;
      var colMap = parse.buildExamColumnMap(doc, tbody);
      var first = parse.parseExamRow(rows[0], colMap, { skipDateFilter: true });
      return !!first;
    }
    var tbodyFallback = doc.querySelector
      ? doc.querySelector("tbody[id$='resultList_data']")
      : null;
    if (!tbodyFallback || !tbodyFallback.querySelector("tr[data-ri]")) {
      return false;
    }
    return true;
  }

  function frameLooksLikeExames(doc) {
    if (!doc) return false;
    var href = "";
    try {
      href = String(doc.location && doc.location.href ? doc.location.href : "");
    } catch (_e) {}
    var urlOk = /consultarExames|examesLiberados/i.test(href);
    var contentOk = frameHasParseableExamRows(doc);
    if (urlOk) return contentOk;
    return contentOk;
  }

  return {
    normalizeLabelText: normalizeLabelText,
    compactSlashLabel: compactSlashLabel,
    normalizeNomeCompleto: normalizeNomeCompleto,
    findValueByLabel: findValueByLabel,
    findDobRaw: findDobRaw,
    parseDobRaw: parseDobRaw,
    hasReadableDob: hasReadableDob,
    readValueFromFieldEl: readValueFromFieldEl,
    extractDemographicsFromDoc: extractDemographicsFromDoc,
    parseDemographicsFromPolDocument: extractDemographicsFromDoc,
    frameBodyHasDadosPacienteContent: frameBodyHasDadosPacienteContent,
    frameLooksLikeDadosPaciente: frameLooksLikeDadosPaciente,
    frameLooksLikeExames: frameLooksLikeExames,
  };
});

/**
 * Boot da janela popup do Documento de alta (FEAT-159 excepção FEAT-230).
 * Query: kind + patientKey opaco — sem nome/prontuário na URL.
 */
(function () {
  "use strict";

  var KIND_LABELS = {
    receituario: "Receituário",
    orientacoes: "Orientações",
    laudo: "Laudo médico",
    laudoPersonalizado: "Laudo personalizado",
    atestado: "Atestado médico",
    acompanhante: "Declaração de acompanhante",
    retorno: "Cartão de retorno",
    referencia: "Guia de Referência",
    contrarreferencia: "Guia de Contrarreferência",
  };

  function qs(name) {
    try {
      return new URLSearchParams(window.location.search).get(name) || "";
    } catch (_e) {
      return "";
    }
  }

  function setStatus(text, isError) {
    var el = document.getElementById("alta-documento-status");
    if (!el) return;
    el.textContent = text || "";
    el.style.color = isError ? "var(--danger, #b91c1c)" : "";
  }

  async function boot() {
    var host = window.AghuAltaPopupHost;
    var archive = window.AghuAltaArchive;
    var schema = window.AghuAltaSchema;
    var mountEl = document.getElementById("alta-documento-mount");
    var titleEl = document.getElementById("alta-documento-title");

    if (!host || !archive || !schema || !mountEl) {
      setStatus("Pré-visualização indisponível.", true);
      return;
    }

    var kind = qs("kind");
    var patientKey = qs("patientKey");
    if (!host.isValidDocumentoKind(kind) || !patientKey) {
      setStatus("Parâmetros inválidos.", true);
      return;
    }

    if (titleEl) {
      titleEl.textContent = KIND_LABELS[kind] || "Documento";
    }

    var snap = null;
    var seedFingerprint = "";
    var recordMeta = null;
    try {
      snap = await archive.loadAltaSnapshot(patientKey);
      seedFingerprint = await archive.loadSeedFingerprint(patientKey);
      if (typeof archive.loadAltaRecordMeta === "function") {
        recordMeta = await archive.loadAltaRecordMeta(patientKey);
      }
    } catch (_e) {
      /* archive opcional */
    }
    if (!snap) snap = schema.emptyAltaSnap();

    var meta = {
      patientKey: patientKey,
      avulso: patientKey === "_receita_avulso",
      nomeCompleto: (recordMeta && recordMeta.nomeCompleto) || "",
      primeiroNome: (recordMeta && recordMeta.primeiroNome) || "",
    };

    host.mountDocumentoWindowPage({
      mountEl: mountEl,
      statusEl: document.getElementById("alta-documento-status"),
      kind: kind,
      patientKey: patientKey,
      snap: snap,
      meta: meta,
      seedFingerprint: seedFingerprint || "",
      avulso: !!meta.avulso,
    });
  }

  void boot();
})();

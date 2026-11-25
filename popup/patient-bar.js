/**
 * Barra de paciente ativo na aba Exames (popup).
 */
(function (root) {
  "use strict";

  /**
   * @param {{ patientBarHint: HTMLElement|null, patientSelect: HTMLSelectElement|null }} els
   */
  function createPatientBar(els) {
    function formatDemoSuffix(patient) {
      if (!patient) return "";
      const parts = [];
      if (patient.sexo === "M") parts.push("Masc");
      else if (patient.sexo === "F") parts.push("Fem");
      else if (patient.sexo) parts.push(String(patient.sexo));
      const dobIso =
        patient.dataNascimentoISO || patient.dataNascimento || "";
      if (dobIso) {
        const ageApi = root.AghuAgeFromDob;
        const age =
          ageApi && ageApi.computeAgeYearsFromIso
            ? ageApi.computeAgeYearsFromIso(dobIso)
            : null;
        if (age != null) {
          parts.push(`${age}a`);
        } else {
          const dateBr = root.AghuDateBr;
          const label =
            dateBr && dateBr.isoToBr ? dateBr.isoToBr(dobIso) : dobIso;
          if (label) parts.push(`nasc. ${label}`);
        }
      }
      return parts.length ? ` · ${parts.join(", ")}` : "";
    }

    function updatePatientBar(patient) {
      const hint = els.patientBarHint;
      if (!hint) return;
      if (patient && patient.ok && patient.prontuario) {
        const displayName = patient.nomeCompleto || patient.primeiroNome || "?";
        hint.textContent = `Ativo: ${displayName} · pront. ${patient.prontuario}${formatDemoSuffix(patient)}`;
        hint.classList.remove("warn");
      } else if (patient && patient.missing && patient.missing.length) {
        hint.textContent = `Texto da página: falta ${patient.missing.join(", ")}`;
        hint.classList.add("warn");
      } else {
        hint.textContent = "";
        hint.classList.remove("warn");
      }
    }

    async function refreshPatientSelect(selectedKey) {
      const activeApi = root.AghuPopupActivePatient;
      if (activeApi && activeApi.refreshSelect) {
        await activeApi.refreshSelect(els.patientSelect, {
          includePage: true,
          selectedKey: selectedKey,
        });
        return;
      }
      const patientSelect = els.patientSelect;
      if (!patientSelect || !root.AghuPatientArchive) return;
      const entries = await root.AghuPatientArchive.listPatientsForSelect();
      patientSelect.replaceChildren();
      const optPage = document.createElement("option");
      optPage.value = "__page__";
      optPage.textContent = "— Página atual (extrair) —";
      patientSelect.appendChild(optPage);
      for (const e of entries) {
        const o = document.createElement("option");
        o.value = e.patientKey;
        o.textContent = `${e.primeiroNome || "?"} · ${e.prontuario || "?"}`;
        patientSelect.appendChild(o);
      }
      const want = selectedKey && entries.some((x) => x.patientKey === selectedKey)
        ? selectedKey
        : "__page__";
      patientSelect.value = want;
    }

    return { updatePatientBar, refreshPatientSelect };
  }

  root.AghuPopupPatientBar = { createPatientBar };
})(typeof globalThis !== "undefined" ? globalThis : window);

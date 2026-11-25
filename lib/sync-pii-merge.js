/**
 * Merge de PII local + cloud para sync (fill-empty; local prevalece quando preenchido).
 * Espelha regras de web/lib/patient-records/merge-duplicates.ts mergePii.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuSyncPiiMerge = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  function prontuarioApi() {
    if (typeof globalThis !== "undefined" && globalThis.AghuPiiProntuarioResolve) {
      return globalThis.AghuPiiProntuarioResolve;
    }
    if (typeof require === "function") {
      try {
        return require("./pii-prontuario-resolve.js");
      } catch (_e) {}
    }
    return null;
  }

  function resolveProntuarioFromRecords(a, b, patientKey) {
    var api = prontuarioApi();
    if (api && api.resolveCanonicalProntuario) {
      return (
        api.resolveCanonicalProntuario(a, "") ||
        api.resolveCanonicalProntuario(b, "") ||
        (api.isPlaceholderProntuario(patientKey) ? "" : str(patientKey))
      );
    }
    return pickNonEmpty(a.prontuario, b.prontuario) || str(patientKey);
  }

  function resolveProntuarioForSync(local, cloud, patientKey) {
    var api = prontuarioApi();
    var merged =
      pickPreferLocal(local.prontuario, cloud.prontuario) ||
      str(cloud.prontuario || local.prontuario);
    if (api && api.resolveCanonicalProntuario) {
      return (
        api.resolveCanonicalProntuario(
          { prontuario: merged, patientKey: local.patientKey || cloud.patientKey },
          "",
        ) || (api.isPlaceholderProntuario(patientKey) ? "" : str(patientKey))
      );
    }
    return merged || str(patientKey);
  }

  function str(v) {
    return v == null ? "" : String(v);
  }

  function pickLonger(a, b) {
    var sa = str(a);
    var sb = str(b);
    return sb.length > sa.length ? sb : sa;
  }

  function pickNonEmpty(a, b) {
    var sa = str(a).trim();
    var sb = str(b).trim();
    if (sa && !sb) return sa;
    if (sb && !sa) return sb;
    if (sa && sb) return sa.length >= sb.length ? sa : sb;
    return "";
  }

  function pickSex(a, b) {
    if (a === "M" || a === "F") return a;
    if (b === "M" || b === "F") return b;
    return "";
  }

  function pickIsoDob(source) {
    if (!source || typeof source !== "object") return "";
    var iso = source.dataNascimentoISO || source.dataNascimento || "";
    iso = str(iso).trim();
    return ISO_DATE_RE.test(iso) ? iso : "";
  }

  function pickPatientAddress(a, b) {
    if (!a && !b) return null;
    if (!a) return b;
    if (!b) return a;
    return {
      street: pickNonEmpty(a.street, b.street),
      number: pickNonEmpty(a.number, b.number),
      neighborhood: pickNonEmpty(a.neighborhood, b.neighborhood),
      city: pickNonEmpty(a.city, b.city),
      state: pickNonEmpty(a.state, b.state) || "ES",
    };
  }

  function pickPreferLocal(localVal, cloudVal) {
    var sl = str(localVal).trim();
    var sc = str(cloudVal).trim();
    if (sl) return sl;
    return sc;
  }

  function pickSexLocalFirst(localSex, cloudSex) {
    if (localSex === "M" || localSex === "F") return localSex;
    if (cloudSex === "M" || cloudSex === "F") return cloudSex;
    return "";
  }

  function pickIsoDobLocalFirst(local, cloud) {
    return pickIsoDob(local) || pickIsoDob(cloud);
  }

  function pickPatientAddressLocalFirst(a, b) {
    if (!a && !b) return null;
    if (!a) return b;
    if (!b) return a;
    return {
      street: pickPreferLocal(a.street, b.street),
      number: pickPreferLocal(a.number, b.number),
      neighborhood: pickPreferLocal(a.neighborhood, b.neighborhood),
      city: pickPreferLocal(a.city, b.city),
      state: pickPreferLocal(a.state, b.state) || "ES",
    };
  }

  function mergePiiForSync(local, cloud, patientKey) {
    local = local && typeof local === "object" ? local : {};
    cloud = cloud && typeof cloud === "object" ? cloud : {};

    var sexo = pickSexLocalFirst(local.sexo, cloud.sexo);
    var dob = pickIsoDobLocalFirst(local, cloud);
    var leito = pickPreferLocal(local.leito, cloud.leito);
    var nomeMae = pickPreferLocal(local.nomeMae, cloud.nomeMae);
    var cartaoSus = pickPreferLocal(local.cartaoSus, cloud.cartaoSus);
    var addr = pickPatientAddressLocalFirst(local.patientAddress, cloud.patientAddress);

    var out = {
      patientKey: patientKey,
      primeiroNome: pickPreferLocal(local.primeiroNome, cloud.primeiroNome),
      nomeCompleto: pickPreferLocal(local.nomeCompleto, cloud.nomeCompleto),
      prontuario: resolveProntuarioForSync(local, cloud, patientKey),
    };

    if (sexo) out.sexo = sexo;
    if (dob) out.dataNascimento = dob;
    if (leito) out.leito = leito;
    if (nomeMae) out.nomeMae = nomeMae;
    if (cartaoSus) out.cartaoSus = cartaoSus;
    if (addr) {
      var hasAddr =
        str(addr.street).trim() ||
        str(addr.number).trim() ||
        str(addr.neighborhood).trim() ||
        str(addr.city).trim();
      if (hasAddr) out.patientAddress = addr;
    }

    return out;
  }

  /**
   * Funde dois registros PII (ex.: duplicatas) — preenche lacunas de ambos.
   */
  function mergePiiRecords(a, b, patientKey) {
    a = a && typeof a === "object" ? a : {};
    b = b && typeof b === "object" ? b : {};

    var sexo = pickSex(a.sexo, b.sexo);
    var dob = pickIsoDob(a) || pickIsoDob(b);
    var leito = pickNonEmpty(a.leito, b.leito);
    var nomeMae = pickNonEmpty(a.nomeMae, b.nomeMae);
    var cartaoSus = pickNonEmpty(a.cartaoSus, b.cartaoSus);
    var addr = pickPatientAddress(a.patientAddress, b.patientAddress);

    var out = {
      patientKey: patientKey,
      primeiroNome: pickLonger(a.primeiroNome, b.primeiroNome),
      nomeCompleto: pickLonger(a.nomeCompleto, b.nomeCompleto),
      prontuario: resolveProntuarioFromRecords(a, b, patientKey),
    };

    if (sexo) out.sexo = sexo;
    if (dob) out.dataNascimento = dob;
    if (leito) out.leito = leito;
    if (nomeMae) out.nomeMae = nomeMae;
    if (cartaoSus) out.cartaoSus = cartaoSus;
    if (addr) {
      var hasAddr =
        str(addr.street).trim() ||
        str(addr.number).trim() ||
        str(addr.neighborhood).trim() ||
        str(addr.city).trim();
      if (hasAddr) out.patientAddress = addr;
    }

    return out;
  }

  return {
    mergePiiForSync: mergePiiForSync,
    mergePiiRecords: mergePiiRecords,
    pickLonger: pickLonger,
    pickNonEmpty: pickNonEmpty,
  };
});

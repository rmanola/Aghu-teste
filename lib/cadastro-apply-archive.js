/**
 * FEAT-109 / FEAT-303 — merge demografia + internações POL no archive local.
 * Usado pela aba Cadastro e pelo domínio Cadastro do passômetro one-click.
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.AghuCadastroApplyArchive = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  /**
   * @param {string} patientKey
   * @param {object} resposta — payload de extractPatientCadastro
   * @param {object} [deps] — injetável em testes (senão lê globals)
   * @returns {Promise<{ episodesCount: number, imported: number }>}
   */
  async function applyCadastroToArchive(patientKey, resposta, deps) {
    deps = deps || {};
    var demo = (resposta && resposta.demographics) || {};
    var archive = deps.archive || root.AghuPatientArchive;
    var importApi = deps.importApi || root.AghuPatientEpisodesPolImport;
    var pe = deps.episodesSchema || root.AghuPatientEpisodesSchema;
    var passArchive = deps.passArchive || root.AghuPassometroArchive;

    var episodesSnap =
      pe && pe.emptySnapshot ? pe.emptySnapshot() : { version: 1, entries: [] };
    var collection = null;
    if (passArchive && passArchive.loadPassometroCollection) {
      collection = await passArchive.loadPassometroCollection(patientKey);
    }
    if (archive && archive.loadPatientRecord) {
      var existing = await archive.loadPatientRecord(patientKey);
      if (existing && existing.patientEpisodes) {
        episodesSnap = existing.patientEpisodes;
      }
    }

    var importResult = null;
    if (importApi && importApi.importPolInternacoes) {
      importResult = importApi.importPolInternacoes({
        episodesSnap: episodesSnap,
        collection: collection,
        rows: (resposta && resposta.internacoes) || [],
      });
      episodesSnap = importResult.episodesSnap;
      collection = importResult.collection;
    }

    if (archive && archive.mergeDemographicsIntoRecord) {
      await archive.mergeDemographicsIntoRecord(patientKey, {
        prontuario: (resposta && resposta.prontuario) || "",
        sexo: demo.sexo || null,
        dataNascimentoISO: demo.dataNascimentoISO || null,
        nomeCompleto:
          demo.nomeCompleto || (resposta && resposta.nomeCompleto) || null,
        nomeMae: demo.nomeMae || null,
        cartaoSus: demo.cartaoSus || null,
        patientAddress: demo.patientAddress || null,
        local: demo.local || null,
        patientEpisodes: episodesSnap,
      });
    }

    if (
      collection &&
      passArchive &&
      passArchive.savePassometroCollection &&
      importResult &&
      importResult.collectionChanged
    ) {
      await passArchive.savePassometroCollection(
        {
          patientKey: patientKey,
          primeiroNome: (resposta && resposta.primeiroNome) || "",
          nomeCompleto:
            demo.nomeCompleto || (resposta && resposta.nomeCompleto) || "",
          prontuario: (resposta && resposta.prontuario) || "",
        },
        collection
      );
    }

    return {
      episodesCount: episodesSnap.entries ? episodesSnap.entries.length : 0,
      imported: importResult ? importResult.imported : 0,
    };
  }

  return {
    applyCadastroToArchive: applyCadastroToArchive,
  };
});

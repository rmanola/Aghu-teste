/**
 * Leitura cloud unificada via get-patient-record-fields (fields[] batch).
 * Testável em Node; browser expõe AghuSyncCloudFetch.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuSyncCloudFetch = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var FIELD_ORDER = [
    "controles",
    "exams",
    "pii",
    "passometro",
    "patient_episodes",
    "prescricoes",
    "hpb_registry",
    "research_registry",
  ];

  /**
   * @param {string[]} fields
   * @returns {string[]}
   */
  function normalizeCloudFields(fields) {
    if (!Array.isArray(fields) || !fields.length) return [];
    var seen = {};
    var out = [];
    for (var i = 0; i < fields.length; i++) {
      var f = String(fields[i] || "").trim();
      if (!f || seen[f]) continue;
      seen[f] = true;
      out.push(f);
    }
    out.sort(function (a, b) {
      var ia = FIELD_ORDER.indexOf(a);
      var ib = FIELD_ORDER.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
    return out;
  }

  /**
   * @param {{
   *   needsControlesMerge?: boolean,
   *   needsExamsMerge?: boolean,
   *   needsPii?: boolean,
   *   needsPassometroMerge?: boolean,
   *   needsPatientEpisodesMerge?: boolean,
   *   needsPrescricoesMerge?: boolean,
   *   needsHpbRegistryMerge?: boolean,
   *   needsResearchRegistryMerge?: boolean,
   * }} flags
   * @returns {string[]}
   */
  function collectBuildPayloadCloudFields(flags) {
    var fields = [];
    if (flags && flags.needsControlesMerge) fields.push("controles");
    if (flags && flags.needsExamsMerge) fields.push("exams");
    if (flags && flags.needsPii) fields.push("pii");
    if (flags && flags.needsPassometroMerge) fields.push("passometro");
    if (flags && flags.needsPatientEpisodesMerge) fields.push("patient_episodes");
    if (flags && flags.needsPrescricoesMerge) fields.push("prescricoes");
    if (flags && flags.needsHpbRegistryMerge) fields.push("hpb_registry");
    if (flags && flags.needsResearchRegistryMerge) fields.push("research_registry");
    return normalizeCloudFields(fields);
  }

  /**
   * @param {typeof fetch} fetchFn
   * @param {string} url
   * @param {string} accessToken
   * @param {{
   *   getAnonKey: () => string,
   *   recordClientId: string,
   *   normalized: string[],
   * }} ctx
   * @returns {Promise<Response>}
   */
  function postRecordFields(fetchFn, url, accessToken, ctx) {
    var headers = {
      Authorization: "Bearer " + accessToken,
      apikey: ctx.getAnonKey(),
      "Content-Type": "application/json",
    };
    if (ctx.workspaceId) {
      headers["X-AGHU-Workspace-Id"] = ctx.workspaceId;
    }
    return fetchFn(url, {
      method: "POST",
      headers: headers,
      body: JSON.stringify({
        record_client_id: ctx.recordClientId,
        fields: ctx.normalized,
      }),
    });
  }

  /**
   * @param {{
   *   getUrl: () => string,
   *   getAnonKey: () => string,
   *   fetchFn?: typeof fetch,
   *   accessToken: string,
   *   recordClientId: string,
   *   fields: string[],
   *   refreshSession?: () => Promise<unknown>,
   *   getAccessToken?: () => Promise<string | null>,
   *   workspaceId?: string | null,
   *   getWorkspaceId?: () => Promise<string | null>,
   * }} deps
   * @returns {Promise<{
   *   status: "skip" | "missing" | "ok" | "error",
   *   httpStatus?: number,
   *   requestedFields: string[],
   *   retried?: boolean,
   *   pii?: object | null,
   *   controles?: object | null,
   *   exams?: object | null,
   * }>}
   */
  async function fetchCloudRecordFields(deps) {
    var normalized = normalizeCloudFields(deps && deps.fields);
    if (
      !deps ||
      !deps.getUrl ||
      !deps.getAnonKey ||
      !deps.accessToken ||
      !deps.recordClientId ||
      !normalized.length
    ) {
      return { status: "skip", requestedFields: normalized };
    }

    var fetchFn = deps.fetchFn || (typeof fetch !== "undefined" ? fetch : null);
    if (!fetchFn) {
      return { status: "error", httpStatus: 0, requestedFields: normalized };
    }

    var url = deps.getUrl() + "/functions/v1/get-patient-record-fields";
    var workspaceId = deps.workspaceId || null;
    if (!workspaceId && typeof deps.getWorkspaceId === "function") {
      try {
        workspaceId = await deps.getWorkspaceId();
      } catch (_wsErr) {
        workspaceId = null;
      }
    }
    var postCtx = {
      getAnonKey: deps.getAnonKey,
      recordClientId: deps.recordClientId,
      normalized: normalized,
      workspaceId: workspaceId,
    };
    var accessToken = deps.accessToken;
    var res;
    var retried = false;

    try {
      res = await postRecordFields(fetchFn, url, accessToken, postCtx);
    } catch (_e) {
      return { status: "error", httpStatus: 0, requestedFields: normalized };
    }

    if (
      res.status === 401 &&
      typeof deps.refreshSession === "function" &&
      typeof deps.getAccessToken === "function"
    ) {
      try {
        await deps.refreshSession();
      } catch (_refreshErr) {
        /* noop */
      }
      var refreshedToken = await deps.getAccessToken();
      if (refreshedToken) {
        accessToken = refreshedToken;
        try {
          res = await postRecordFields(fetchFn, url, accessToken, postCtx);
          retried = true;
        } catch (_retryErr) {
          return { status: "error", httpStatus: 0, requestedFields: normalized, retried: true };
        }
      }
    }

    if (res.status === 404) {
      return { status: "missing", httpStatus: 404, requestedFields: normalized, retried: retried };
    }
    if (!res.ok) {
      return {
        status: "error",
        httpStatus: res.status,
        requestedFields: normalized,
        retried: retried,
      };
    }

    try {
      var body = await res.json();
      var out = {
        status: "ok",
        httpStatus: res.status,
        requestedFields: normalized,
        retried: retried,
      };
      if (normalized.indexOf("pii") !== -1) {
        out.pii = body && body.pii ? body.pii : null;
      }
      if (normalized.indexOf("controles") !== -1) {
        out.controles = body && body.controles ? body.controles : null;
      }
      if (normalized.indexOf("exams") !== -1) {
        out.exams = body && body.exams ? body.exams : null;
      }
      if (normalized.indexOf("passometro") !== -1) {
        out.passometro = body && body.passometro ? body.passometro : null;
      }
      if (normalized.indexOf("patient_episodes") !== -1) {
        out.patient_episodes =
          body && body.patient_episodes ? body.patient_episodes : null;
      }
      if (normalized.indexOf("hpb_registry") !== -1) {
        out.hpb_registry = body && body.hpb_registry ? body.hpb_registry : null;
      }
      if (normalized.indexOf("prescricoes") !== -1) {
        out.prescricoes = body && body.prescricoes ? body.prescricoes : null;
      }
      if (normalized.indexOf("research_registry") !== -1) {
        out.research_registry =
          body && body.research_registry ? body.research_registry : null;
      }
      return out;
    } catch (_e2) {
      return {
        status: "error",
        httpStatus: res.status,
        requestedFields: normalized,
        retried: retried,
      };
    }
  }

  /**
   * @param {{ status: string, httpStatus?: number, exams?: object | null }} batch
   * @returns {{ status: "skip" | "missing" | "ok" | "error", exams?: object | null, httpStatus?: number }}
   */
  function examsResultFromBatch(batch) {
    if (!batch || batch.status === "skip") return { status: "skip" };
    if (batch.status === "missing") return { status: "missing" };
    if (batch.status === "error") {
      return { status: "error", httpStatus: batch.httpStatus || 0 };
    }
    return { status: "ok", exams: batch.exams || null };
  }

  /**
   * Bloqueia sync incremental quando leitura cloud falha para domínios de merge.
   * @param {{ status?: string, httpStatus?: number } | null} cloudBatch
   * @param {string[]} cloudFields
   * @param {{ lastSyncedAt?: number } | null | undefined} syncMeta
   * @returns {boolean}
   */
  function shouldBlockSyncOnCloudBatchError(cloudBatch, cloudFields, syncMeta) {
    if (!cloudBatch || cloudBatch.status !== "error") return false;
    if (!syncMeta || !syncMeta.lastSyncedAt) return false;
    if (!cloudFields || !cloudFields.length) return false;
    var mergeDomains = [
      "controles",
      "exams",
      "prescricoes",
      "passometro",
      "patient_episodes",
      "hpb_registry",
      "research_registry",
    ];
    for (var i = 0; i < cloudFields.length; i++) {
      if (mergeDomains.indexOf(cloudFields[i]) !== -1) return true;
    }
    return false;
  }

  return {
    normalizeCloudFields: normalizeCloudFields,
    collectBuildPayloadCloudFields: collectBuildPayloadCloudFields,
    fetchCloudRecordFields: fetchCloudRecordFields,
    examsResultFromBatch: examsResultFromBatch,
    shouldBlockSyncOnCloudBatchError: shouldBlockSyncOnCloudBatchError,
  };
});

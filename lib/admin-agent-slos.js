/**
 * FEAT-078 R3 — Agent SLOs no painel admin (só metadados; sem PHI).
 * Fonte única para Edge get-admin-dashboard e testes Node.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.AghuAdminAgentSlos = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var KNOWN_AGENTS = ["study_assistant", "passometro"];

  /** Colunas Postgres permitidas na leitura admin (ADMIN-SLO-02). */
  var SAFE_SELECT_COLUMNS =
    "agent, snapshot_date, ok, sample_n, success_rate, error_rate, tokens_p95, alert_codes, created_at";

  /** Chaves proibidas no payload admin (corpo clínico / run content). */
  var PHI_DENY_KEYS = [
    "message",
    "proposal",
    "prompt",
    "completion",
    "prontuario",
    "laudo",
    "pii",
    "ciphertext",
    "patient",
    "nome",
  ];

  var STALE_CRON_HOURS = 36;

  function isAgentSloCronStale(lastSuccessAt, nowMs) {
    if (!lastSuccessAt) return true;
    var ts = Date.parse(String(lastSuccessAt));
    if (Number.isNaN(ts)) return true;
    var now = typeof nowMs === "number" ? nowMs : Date.now();
    return (now - ts) / (1000 * 60 * 60) > STALE_CRON_HOURS;
  }

  function toNumberOrNull(v) {
    if (v == null || v === "") return null;
    var n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function mapAgentSloRow(row) {
    if (!row || typeof row !== "object") return null;
    var agent = String(row.agent || "");
    if (KNOWN_AGENTS.indexOf(agent) < 0) return null;
    var codes = Array.isArray(row.alert_codes)
      ? row.alert_codes.map(function (c) {
          return String(c);
        })
      : [];
    return {
      agent: agent,
      snapshotDate: row.snapshot_date != null ? String(row.snapshot_date) : null,
      ok: Boolean(row.ok),
      sampleN: Math.max(0, Number(row.sample_n) || 0),
      successRate: toNumberOrNull(row.success_rate),
      errorRate: toNumberOrNull(row.error_rate),
      tokensP95: toNumberOrNull(row.tokens_p95),
      alertCodes: codes,
      createdAt: row.created_at != null ? String(row.created_at) : null,
    };
  }

  /**
   * Mantém o snapshot mais recente por agent (created_at desc preferido).
   */
  function pickLatestPerAgent(rows) {
    var list = Array.isArray(rows) ? rows : [];
    var byAgent = {};
    for (var i = 0; i < list.length; i++) {
      var mapped = mapAgentSloRow(list[i]);
      if (!mapped || !mapped.createdAt) continue;
      var prev = byAgent[mapped.agent];
      if (!prev || String(mapped.createdAt) > String(prev.createdAt)) {
        byAgent[mapped.agent] = mapped;
      }
    }
    var out = [];
    for (var a = 0; a < KNOWN_AGENTS.length; a++) {
      var id = KNOWN_AGENTS[a];
      if (byAgent[id]) out.push(byAgent[id]);
    }
    return out;
  }

  function buildAgentSlosSection(rows, opts) {
    var options = opts || {};
    var latest = pickLatestPerAgent(rows);
    var lastSuccessAt = null;
    for (var i = 0; i < latest.length; i++) {
      var ca = latest[i].createdAt;
      if (ca && (!lastSuccessAt || ca > lastSuccessAt)) lastSuccessAt = ca;
    }
    var rawCount = Array.isArray(rows) ? rows.length : 0;
    return {
      latest: latest,
      cronStatus: {
        lastSuccessAt: lastSuccessAt,
        stale: isAgentSloCronStale(lastSuccessAt, options.nowMs),
        snapshotCount: rawCount,
      },
    };
  }

  /**
   * Default seguro quando a Edge antiga não envia agentSlos (ADMIN-SLO-03).
   */
  function emptyAgentSlosSection() {
    return {
      latest: [],
      cronStatus: {
        lastSuccessAt: null,
        stale: true,
        snapshotCount: 0,
      },
    };
  }

  function normalizeAgentSlosSection(raw) {
    if (!raw || typeof raw !== "object") return emptyAgentSlosSection();
    var latest = Array.isArray(raw.latest) ? raw.latest : [];
    var safeLatest = [];
    for (var i = 0; i < latest.length; i++) {
      var item = latest[i];
      if (!item || typeof item !== "object") continue;
      var agent = String(item.agent || "");
      if (KNOWN_AGENTS.indexOf(agent) < 0) continue;
      safeLatest.push({
        agent: agent,
        snapshotDate: item.snapshotDate != null ? String(item.snapshotDate) : null,
        ok: Boolean(item.ok),
        sampleN: Math.max(0, Number(item.sampleN) || 0),
        successRate: toNumberOrNull(item.successRate),
        errorRate: toNumberOrNull(item.errorRate),
        tokensP95: toNumberOrNull(item.tokensP95),
        alertCodes: Array.isArray(item.alertCodes)
          ? item.alertCodes.map(String)
          : [],
        createdAt: item.createdAt != null ? String(item.createdAt) : null,
      });
    }
    var cron = raw.cronStatus && typeof raw.cronStatus === "object"
      ? raw.cronStatus
      : {};
    var lastSuccessAt =
      cron.lastSuccessAt != null ? String(cron.lastSuccessAt) : null;
    return {
      latest: safeLatest,
      cronStatus: {
        lastSuccessAt: lastSuccessAt,
        stale:
          typeof cron.stale === "boolean"
            ? cron.stale
            : isAgentSloCronStale(lastSuccessAt),
        snapshotCount: Math.max(0, Number(cron.snapshotCount) || 0),
      },
    };
  }

  /**
   * ADMIN-SLO-02 — payload só metadados (recursivo em chaves de object).
   */
  function assertAgentSloPayloadMetadataOnly(payload) {
    var stack = [payload];
    while (stack.length) {
      var cur = stack.pop();
      if (cur == null || typeof cur !== "object") continue;
      if (Array.isArray(cur)) {
        for (var i = 0; i < cur.length; i++) stack.push(cur[i]);
        continue;
      }
      var keys = Object.keys(cur);
      for (var k = 0; k < keys.length; k++) {
        var key = keys[k];
        var lower = key.toLowerCase();
        for (var d = 0; d < PHI_DENY_KEYS.length; d++) {
          if (lower === PHI_DENY_KEYS[d] || lower.indexOf(PHI_DENY_KEYS[d]) >= 0) {
            throw new Error("phi_key_forbidden:" + key);
          }
        }
        stack.push(cur[key]);
      }
    }
    return true;
  }

  return {
    KNOWN_AGENTS: KNOWN_AGENTS,
    SAFE_SELECT_COLUMNS: SAFE_SELECT_COLUMNS,
    PHI_DENY_KEYS: PHI_DENY_KEYS,
    STALE_CRON_HOURS: STALE_CRON_HOURS,
    isAgentSloCronStale: isAgentSloCronStale,
    mapAgentSloRow: mapAgentSloRow,
    pickLatestPerAgent: pickLatestPerAgent,
    buildAgentSlosSection: buildAgentSlosSection,
    emptyAgentSlosSection: emptyAgentSlosSection,
    normalizeAgentSlosSection: normalizeAgentSlosSection,
    assertAgentSloPayloadMetadataOnly: assertAgentSloPayloadMetadataOnly,
  };
});

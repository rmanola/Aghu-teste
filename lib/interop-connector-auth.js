/**
 * Autenticação machine-to-machine de conectores interop (FEAT-138).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.AghuInteropConnectorAuth = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var CONNECTOR_HEADER = "x-aghu-connector-key";
  var WORKSPACE_HEADER = "x-aghu-workspace-id";
  var VALID_TYPES = ["hl7_https", "fhir_https"];
  var VALID_STATUSES = ["active", "revoked"];

  function str(v) {
    return v == null ? "" : String(v).trim();
  }

  /**
   * SHA-256 hex sync — Node `crypto` quando disponível; senão pure-JS
   * (Deno Edge não expõe `require("crypto")` no UMD vendor).
   */
  function sha256HexPure(message) {
    function rotr(n, x) {
      return (x >>> n) | (x << (32 - n));
    }
    function ch(x, y, z) {
      return (x & y) ^ (~x & z);
    }
    function maj(x, y, z) {
      return (x & y) ^ (x & z) ^ (y & z);
    }
    function sigma0(x) {
      return rotr(2, x) ^ rotr(13, x) ^ rotr(22, x);
    }
    function sigma1(x) {
      return rotr(6, x) ^ rotr(11, x) ^ rotr(25, x);
    }
    function gamma0(x) {
      return rotr(7, x) ^ rotr(18, x) ^ (x >>> 3);
    }
    function gamma1(x) {
      return rotr(17, x) ^ rotr(19, x) ^ (x >>> 10);
    }

    var K = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
      0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
      0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
      0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
      0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
      0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
      0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
      0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
      0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ];

    var bytes = [];
    var s = String(message);
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 0x80) bytes.push(c);
      else if (c < 0x800) {
        bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
      } else {
        bytes.push(
          0xe0 | (c >> 12),
          0x80 | ((c >> 6) & 0x3f),
          0x80 | (c & 0x3f),
        );
      }
    }
    var bitLen = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    // 64-bit big-endian bit length (high 32 = 0 for keys < 2^29 bytes)
    bytes.push(0, 0, 0, 0);
    bytes.push(
      (bitLen >>> 24) & 0xff,
      (bitLen >>> 16) & 0xff,
      (bitLen >>> 8) & 0xff,
      bitLen & 0xff,
    );

    var H = [
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
      0x1f83d9ab, 0x5be0cd19,
    ];

    for (var offset = 0; offset < bytes.length; offset += 64) {
      var w = new Array(64);
      for (var t = 0; t < 16; t++) {
        var j = offset + t * 4;
        w[t] =
          ((bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3]) >>>
          0;
      }
      for (t = 16; t < 64; t++) {
        w[t] = (gamma1(w[t - 2]) + w[t - 7] + gamma0(w[t - 15]) + w[t - 16]) >>> 0;
      }
      var a = H[0],
        b = H[1],
        c2 = H[2],
        d = H[3],
        e = H[4],
        f = H[5],
        g = H[6],
        h = H[7];
      for (t = 0; t < 64; t++) {
        var t1 = (h + sigma1(e) + ch(e, f, g) + K[t] + w[t]) >>> 0;
        var t2 = (sigma0(a) + maj(a, b, c2)) >>> 0;
        h = g;
        g = f;
        f = e;
        e = (d + t1) >>> 0;
        d = c2;
        c2 = b;
        b = a;
        a = (t1 + t2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0;
      H[1] = (H[1] + b) >>> 0;
      H[2] = (H[2] + c2) >>> 0;
      H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0;
      H[5] = (H[5] + f) >>> 0;
      H[6] = (H[6] + g) >>> 0;
      H[7] = (H[7] + h) >>> 0;
    }

    var out = "";
    for (i = 0; i < 8; i++) {
      var hex = (H[i] >>> 0).toString(16);
      out += ("00000000" + hex).slice(-8);
    }
    return out;
  }

  function sha256Hex(value) {
    if (typeof require === "function") {
      try {
        var nodeCrypto = require("crypto");
        return nodeCrypto.createHash("sha256").update(String(value), "utf8").digest("hex");
      } catch (_e) {
        /* fallthrough — Deno Edge UMD */
      }
    }
    return sha256HexPure(value);
  }

  function hashConnectorKey(plainKey) {
    var key = str(plainKey);
    if (!key || key.length < 16) {
      throw new Error("connector_key_too_short");
    }
    return sha256Hex(key);
  }

  /**
   * Comparação em tempo constante — evita side-channel de timing na
   * validação de credenciais (mesmo hasheadas, defesa em profundidade).
   */
  function timingSafeEqualHex(a, b) {
    if (typeof a !== "string" || typeof b !== "string") return false;
    if (a.length !== b.length) return false;
    var diff = 0;
    for (var i = 0; i < a.length; i++) {
      diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
  }

  function verifyConnectorKey(plainKey, storedHash) {
    if (!plainKey || !storedHash) return false;
    try {
      return timingSafeEqualHex(
        hashConnectorKey(plainKey),
        str(storedHash).toLowerCase(),
      );
    } catch (_e) {
      return false;
    }
  }

  function normalizeConnectorRow(row) {
    if (!row || typeof row !== "object") return null;
    return {
      id: str(row.id),
      workspace_id: str(row.workspace_id),
      connector_type: str(row.connector_type),
      name: str(row.name),
      key_hash: str(row.key_hash).toLowerCase(),
      status: str(row.status) || "active",
      audit_user_id: str(row.audit_user_id) || null,
    };
  }

  /**
   * INTCOR-AC-04 — valida hash, workspace e estado do conector.
   */
  function authenticateConnector(opts) {
    opts = opts || {};
    var plainKey = str(opts.plainKey);
    var workspaceId = str(opts.workspaceId);
    var row = normalizeConnectorRow(opts.connectorRow);
    if (!plainKey) {
      return { ok: false, status: 401, error: "connector_key_missing" };
    }
    if (!workspaceId) {
      return { ok: false, status: 401, error: "workspace_id_missing" };
    }
    if (!row || !row.id || !row.workspace_id) {
      return { ok: false, status: 401, error: "connector_not_found" };
    }
    if (row.workspace_id !== workspaceId) {
      return { ok: false, status: 401, error: "workspace_mismatch" };
    }
    if (VALID_TYPES.indexOf(row.connector_type) === -1) {
      return { ok: false, status: 401, error: "connector_type_invalid" };
    }
    if (VALID_STATUSES.indexOf(row.status) === -1 || row.status === "revoked") {
      return { ok: false, status: 401, error: "connector_revoked" };
    }
    if (!verifyConnectorKey(plainKey, row.key_hash)) {
      return { ok: false, status: 401, error: "connector_key_invalid" };
    }
    return {
      ok: true,
      connectorId: row.id,
      workspaceId: row.workspace_id,
      connectorType: row.connector_type,
      auditUserId: row.audit_user_id,
    };
  }

  function extractConnectorAuthFromHeaders(headers) {
    headers = headers || {};
    var lower = {};
    Object.keys(headers).forEach(function (k) {
      lower[k.toLowerCase()] = headers[k];
    });
    return {
      plainKey: str(lower[CONNECTOR_HEADER]),
      workspaceId: str(lower[WORKSPACE_HEADER]),
    };
  }

  /**
   * INTCOR-AC-06 — idempotência por external_message_id aceito anteriormente.
   */
  function isIdempotentReplay(logRows, externalMessageId) {
    var id = str(externalMessageId);
    if (!id || !Array.isArray(logRows)) return false;
    for (var i = 0; i < logRows.length; i++) {
      var row = logRows[i];
      if (!row) continue;
      if (
        str(row.external_message_id) === id &&
        str(row.status) === "accepted"
      ) {
        return true;
      }
    }
    return false;
  }

  return {
    CONNECTOR_HEADER: CONNECTOR_HEADER,
    WORKSPACE_HEADER: WORKSPACE_HEADER,
    VALID_TYPES: VALID_TYPES,
    hashConnectorKey: hashConnectorKey,
    verifyConnectorKey: verifyConnectorKey,
    authenticateConnector: authenticateConnector,
    extractConnectorAuthFromHeaders: extractConnectorAuthFromHeaders,
    isIdempotentReplay: isIdempotentReplay,
    normalizeConnectorRow: normalizeConnectorRow,
  };
});

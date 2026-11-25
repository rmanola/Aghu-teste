/**
 * Identidade canónica do paciente AGHU: prontuário normalizado.
 * record_client_id = UUID v5 determinístico derivado só do prontuário.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.AghuPatientIdentity = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /** Namespace fixo do projeto (UUID v5). */
  var AGHU_NAMESPACE = "a1b2c3d4-e5f6-5789-a234-000000000001";

  function normalizeProntuario(raw) {
    if (raw == null || raw === "") return "";
    var d = String(raw).replace(/\D/g, "");
    return d.replace(/^0+/, "") || d;
  }

  function slugPart(s) {
    if (!s) return "unknown";
    try {
      return String(s)
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "") || "unknown";
    } catch (e) {
      return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "_") || "unknown";
    }
  }

  function buildPatientKey(prontuario) {
    var p = normalizeProntuario(prontuario);
    return p || null;
  }

  function legacyPatientKey(prontuario, primeiroNome) {
    var p = normalizeProntuario(prontuario);
    var fn = slugPart(primeiroNome || "");
    if (!p || !fn || fn === "unknown") return p || null;
    return p + "_" + fn;
  }

  function uuidToBytes(uuid) {
    var hex = String(uuid).replace(/-/g, "");
    var out = new Uint8Array(16);
    for (var i = 0; i < 16; i++) {
      out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
  }

  function formatUuidV5(hashBytes) {
    var b = hashBytes.slice(0, 16);
    b[6] = (b[6] & 0x0f) | 0x50;
    b[8] = (b[8] & 0x3f) | 0x80;
    var hex = "";
    for (var i = 0; i < 16; i++) {
      hex += b[i].toString(16).padStart(2, "0");
    }
    return (
      hex.slice(0, 8) +
      "-" +
      hex.slice(8, 12) +
      "-" +
      hex.slice(12, 16) +
      "-" +
      hex.slice(16, 20) +
      "-" +
      hex.slice(20)
    );
  }

  /** SHA-1 sync pure-JS (Deno Edge UMD sem `require("crypto")`). */
  function sha1SyncPure(data) {
    var bytes =
      data instanceof Uint8Array
        ? Array.prototype.slice.call(data)
        : Array.prototype.slice.call(new Uint8Array(data));
    var bitLenHi = Math.floor((bytes.length * 8) / 0x100000000);
    var bitLenLo = (bytes.length * 8) >>> 0;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    bytes.push(
      (bitLenHi >>> 24) & 0xff,
      (bitLenHi >>> 16) & 0xff,
      (bitLenHi >>> 8) & 0xff,
      bitLenHi & 0xff,
      (bitLenLo >>> 24) & 0xff,
      (bitLenLo >>> 16) & 0xff,
      (bitLenLo >>> 8) & 0xff,
      bitLenLo & 0xff,
    );

    var h0 = 0x67452301;
    var h1 = 0xefcdab89;
    var h2 = 0x98badcfe;
    var h3 = 0x10325476;
    var h4 = 0xc3d2e1f0;
    var w = new Array(80);

    function rotl(n, x) {
      return ((x << n) | (x >>> (32 - n))) >>> 0;
    }

    for (var offset = 0; offset < bytes.length; offset += 64) {
      for (var i = 0; i < 16; i++) {
        var j = offset + i * 4;
        w[i] =
          ((bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3]) >>>
          0;
      }
      for (i = 16; i < 80; i++) {
        w[i] = rotl(1, w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]);
      }
      var a = h0,
        b = h1,
        c = h2,
        d = h3,
        e = h4;
      for (i = 0; i < 80; i++) {
        var f, k;
        if (i < 20) {
          f = (b & c) | (~b & d);
          k = 0x5a827999;
        } else if (i < 40) {
          f = b ^ c ^ d;
          k = 0x6ed9eba1;
        } else if (i < 60) {
          f = (b & c) | (b & d) | (c & d);
          k = 0x8f1bbcdc;
        } else {
          f = b ^ c ^ d;
          k = 0xca62c1d6;
        }
        var temp = (rotl(5, a) + f + e + k + w[i]) >>> 0;
        e = d;
        d = c;
        c = rotl(30, b);
        b = a;
        a = temp;
      }
      h0 = (h0 + a) >>> 0;
      h1 = (h1 + b) >>> 0;
      h2 = (h2 + c) >>> 0;
      h3 = (h3 + d) >>> 0;
      h4 = (h4 + e) >>> 0;
    }

    var out = new Uint8Array(20);
    var hs = [h0, h1, h2, h3, h4];
    for (i = 0; i < 5; i++) {
      out[i * 4] = (hs[i] >>> 24) & 0xff;
      out[i * 4 + 1] = (hs[i] >>> 16) & 0xff;
      out[i * 4 + 2] = (hs[i] >>> 8) & 0xff;
      out[i * 4 + 3] = hs[i] & 0xff;
    }
    return out;
  }

  function sha1Sync(data) {
    if (typeof require === "function") {
      try {
        var nodeCrypto = require("crypto");
        return new Uint8Array(nodeCrypto.createHash("sha1").update(data).digest());
      } catch (_e) {
        /* Deno Edge UMD */
      }
    }
    return sha1SyncPure(data);
  }

  function concatNamespaceAndName(namespaceUuid, name) {
    var ns = uuidToBytes(namespaceUuid);
    var enc = new TextEncoder().encode(String(name));
    var out = new Uint8Array(ns.length + enc.length);
    out.set(ns, 0);
    out.set(enc, ns.length);
    return out;
  }

  function recordClientIdFromProntuarioSync(prontuario) {
    var normalized = normalizeProntuario(prontuario);
    if (!normalized) return null;
    var payload = concatNamespaceAndName(AGHU_NAMESPACE, normalized);
    var hash = sha1Sync(payload);
    return formatUuidV5(hash);
  }

  async function recordClientIdFromProntuario(prontuario) {
    var normalized = normalizeProntuario(prontuario);
    if (!normalized) return null;
    var payload = concatNamespaceAndName(AGHU_NAMESPACE, normalized);
    if (typeof crypto !== "undefined" && crypto.subtle && crypto.subtle.digest) {
      var hashBuf = await crypto.subtle.digest("SHA-1", payload);
      return formatUuidV5(new Uint8Array(hashBuf));
    }
    return recordClientIdFromProntuarioSync(prontuario);
  }

  function isValidProntuarioForIdentity(prontuario) {
    var p = normalizeProntuario(prontuario);
    return !!p && p !== "0";
  }

  /** Nome de exibição: rejeita rótulos de episódio/data (ex. "06/07/2026 - Especialidade"). */
  function hasPatientDisplayName(meta) {
    var n = String((meta && (meta.nomeCompleto || meta.primeiroNome)) || "").trim();
    if (n.length < 2 || !/[A-Za-zÀ-ÿ]/.test(n)) return false;
    if (/^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(n)) return false;
    return true;
  }

  function isCompletePatientIdentity(pii) {
    if (!pii || typeof pii !== "object") return false;
    return (
      isValidProntuarioForIdentity(pii.prontuario) && hasPatientDisplayName(pii)
    );
  }

  function recordClientIdMatchesProntuario(recordClientId, prontuario) {
    var expected = recordClientIdFromProntuarioSync(prontuario);
    return !!(expected && recordClientId && String(recordClientId) === expected);
  }

  return {
    AGHU_NAMESPACE: AGHU_NAMESPACE,
    normalizeProntuario: normalizeProntuario,
    buildPatientKey: buildPatientKey,
    legacyPatientKey: legacyPatientKey,
    slugPart: slugPart,
    recordClientIdFromProntuario: recordClientIdFromProntuario,
    recordClientIdFromProntuarioSync: recordClientIdFromProntuarioSync,
    isValidProntuarioForIdentity: isValidProntuarioForIdentity,
    hasPatientDisplayName: hasPatientDisplayName,
    isCompletePatientIdentity: isCompletePatientIdentity,
    recordClientIdMatchesProntuario: recordClientIdMatchesProntuario,
  };
});

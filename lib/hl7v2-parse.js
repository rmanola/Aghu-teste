/**
 * Parser HL7v2 mínimo pipe-delimited (FEAT-139).
 * Segmentos: MSH, PID, PV1, OBR, OBX — ADT^A01/A03/A08, ORU^R01.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.AghuHl7v2Parse = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var canonicalApi = null;

  function getCanonicalApi() {
    if (canonicalApi) return canonicalApi;
    if (typeof require === "function") {
      try {
        canonicalApi = require("./interop-canonical.js");
        return canonicalApi;
      } catch (_e) {
        /* Deno Edge: require relativo falha no bundle — usar global UMD */
      }
    }
    var g =
      typeof globalThis !== "undefined"
        ? globalThis
        : typeof window !== "undefined"
          ? window
          : root;
    if (g && g.AghuInteropCanonical) {
      canonicalApi = g.AghuInteropCanonical;
    }
    return canonicalApi;
  }

  function str(v) {
    return v == null ? "" : String(v).trim();
  }

  function splitSegments(message) {
    var text = String(message || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    return text
      .split("\n")
      .map(function (line) {
        return line.trim();
      })
      .filter(function (line) {
        return line.length > 0;
      });
  }

  function parseFields(segment) {
    return String(segment || "").split("|");
  }

  function parseMessage(message) {
    var lines = splitSegments(message);
    if (!lines.length) {
      return { ok: false, error: "empty_message" };
    }
    var segments = {};
    var segmentList = [];
    for (var i = 0; i < lines.length; i++) {
      var name = lines[i].slice(0, 3);
      if (!segments[name]) segments[name] = [];
      var fields = parseFields(lines[i]);
      segments[name].push(fields);
      segmentList.push({ name: name, fields: fields });
    }
    var msh = segments.MSH && segments.MSH[0];
    if (!msh) {
      return { ok: false, error: "msh_missing" };
    }
    var messageType = str(msh[8]);
    var parts = messageType.split("^");
    var msgType = parts[0] || "";
    var trigger = parts[1] || "";
    return {
      ok: true,
      segments: segments,
      segmentList: segmentList,
      messageControlId: str(msh[9]),
      messageType: msgType,
      triggerEvent: trigger,
      messageTypeFull: messageType,
      encoding: str(msh[17]) || "UTF-8",
    };
  }

  function parsePidName(pidFields) {
    var raw = str(pidFields[5]);
    if (!raw) return { nomeCompleto: "", primeiroNome: "" };
    var pieces = raw.split("^");
    var family = str(pieces[0]);
    var given = str(pieces[1]);
    var nomeCompleto = [given, family].filter(Boolean).join(" ").trim();
    return {
      nomeCompleto: nomeCompleto || family || given,
      primeiroNome: given || family,
    };
  }

  function parsePidProntuario(pidFields) {
    var rawList = str(pidFields[3]);
    if (!rawList) return "";
    var ids = rawList.split("~");
    for (var i = 0; i < ids.length; i++) {
      var parts = ids[i].split("^");
      var value = str(parts[0]);
      if (value) return value;
    }
    return "";
  }

  function hl7DateToIso(raw) {
    var s = str(raw);
    if (s.length >= 8) {
      return s.slice(0, 4) + "-" + s.slice(4, 6) + "-" + s.slice(6, 8);
    }
    return "";
  }

  function parsePid(pidFields) {
    if (!pidFields) return null;
    var name = parsePidName(pidFields);
    var sex = str(pidFields[8]);
    var sexo = sex === "M" ? "M" : sex === "F" ? "F" : "";
    return {
      prontuario: parsePidProntuario(pidFields),
      nomeCompleto: name.nomeCompleto,
      primeiroNome: name.primeiroNome,
      dataNascimento: hl7DateToIso(pidFields[7]),
      sexo: sexo,
    };
  }

  function parsePv1(pv1Fields) {
    if (!pv1Fields) return null;
    var location = str(pv1Fields[3]).split("^")[0];
    var visitNumber = str(pv1Fields[19]) || str(pv1Fields[1]) || "visit";
    var admitTime = hl7DateToIso(pv1Fields[44]) || hl7DateToIso(pv1Fields[45]);
    return {
      id: "hl7-" + visitNumber,
      externalId: visitNumber,
      kind: "hospitalization",
      location: location,
      startedAt: admitTime || new Date().toISOString().slice(0, 10),
      label: location ? "Internação " + location : "Internação",
    };
  }

  function parseObxResults(segments, obrFields) {
    var obxList = segments.OBX || [];
    var results = [];
    var obrSol = obrFields ? str(obrFields[2]) || str(obrFields[3]) : "";
    var obrTime = obrFields ? hl7DateToIso(obrFields[7]) : "";
    for (var i = 0; i < obxList.length; i++) {
      var obx = obxList[i];
      var codeParts = str(obx[3]).split("^");
      var examName = str(codeParts[1]) || str(codeParts[0]) || "Resultado";
      results.push({
        examName: examName,
        dataColetaISO: obrTime || hl7DateToIso(obx[14]) || new Date().toISOString().slice(0, 10),
        solicitation: obrSol,
        sample: str(obx[15]),
        resultado: str(obx[5]),
        unidade: str(obx[6]),
        referencia: str(obx[7]),
        flag: str(obx[8]),
      });
    }
    return results;
  }

  function messageToCanonical(message) {
    var parsed = parseMessage(message);
    if (!parsed.ok) return parsed;
    var canon = getCanonicalApi();
    if (!canon) {
      return { ok: false, error: "canonical_unavailable" };
    }
    var pid = parsePid(parsed.segments.PID && parsed.segments.PID[0]);
    if (!pid || !pid.prontuario) {
      return { ok: false, error: "pid_missing" };
    }
    var event = {
      externalMessageId: parsed.messageControlId,
      patientRef: pid,
      source: "hl7",
    };
    var type = parsed.messageType;
    var trigger = parsed.triggerEvent;
    if (type === "ADT") {
      var pv1 = parsePv1(parsed.segments.PV1 && parsed.segments.PV1[0]);
      if (pv1) {
        if (trigger === "A03") {
          pv1.status = "closed";
          pv1.endedAt = new Date().toISOString().slice(0, 10);
        } else {
          pv1.status = "active";
        }
        event.episode = pv1;
      }
    } else if (type === "ORU" && trigger === "R01") {
      var obr = parsed.segments.OBR && parsed.segments.OBR[0];
      event.examResults = parseObxResults(parsed.segments, obr);
      if (!event.examResults.length) {
        return { ok: false, error: "obx_missing" };
      }
    } else {
      return { ok: false, error: "unsupported_message_type" };
    }
    var normalized = canon.normalizeCanonicalEvent(event);
    if (!normalized.ok) return normalized;
    return {
      ok: true,
      parsed: parsed,
      event: normalized.event,
    };
  }

  return {
    parseMessage: parseMessage,
    parsePid: parsePid,
    parsePv1: parsePv1,
    messageToCanonical: messageToCanonical,
    hl7DateToIso: hl7DateToIso,
  };
});

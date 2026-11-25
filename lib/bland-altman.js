/**
 * FEAT-209 — Bland-Altman com critério a priori obrigatório (SEG-AC-08/09).
 */

"use strict";

const { readFileSync } = require("node:fs");
const { createHash } = require("node:crypto");

function loadAPrioriProtocol(pathOrObj) {
  const data =
    typeof pathOrObj === "string"
      ? JSON.parse(readFileSync(pathOrObj, "utf8"))
      : pathOrObj;
  if (!data || !data.a_priori || !data.declared_at || !data.author) {
    throw new Error("criterio_a_priori_ausente");
  }
  if (!data.min_studies || Number(data.min_studies) < 30) {
    throw new Error("criterio_a_priori_min_studies");
  }
  if (data.a_priori.liver_loa_ml == null || data.a_priori.pancreas_loa_ml == null) {
    throw new Error("criterio_a_priori_limites_ausentes");
  }
  return data;
}

function blandAltman(pairs, declaredLoa) {
  if (!Array.isArray(pairs) || pairs.length < 30) {
    throw new Error("bland_altman_n_insuficiente");
  }
  const diffs = pairs.map((p) => Number(p.autoMl) - Number(p.refMl));
  const n = diffs.length;
  const bias = diffs.reduce((a, b) => a + b, 0) / n;
  const variance = diffs.reduce((a, d) => a + (d - bias) ** 2, 0) / (n - 1);
  const sd = Math.sqrt(variance);
  const loaLow = bias - 1.96 * sd;
  const loaHigh = bias + 1.96 * sd;
  const within =
    Math.abs(loaLow) <= declaredLoa && Math.abs(loaHigh) <= declaredLoa;
  return { n, bias, loaLow, loaHigh, declaredLoa, withinLimits: within };
}

/** Gera ≥30 pares sintéticos determinísticos (seed). */
function syntheticPairs(n, seed, organ) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const h = createHash("sha256")
      .update(`${seed}:${organ}:${i}`)
      .digest();
    const ref = 1000 + (h.readUInt16BE(0) % 500);
    const noise = ((h.readUInt16BE(2) % 40) - 20) / 2;
    out.push({ autoMl: ref + noise, refMl: ref });
  }
  return out;
}

function runBlandAltmanAnalysis({ protocol, pairsLiver, pairsPancreas }) {
  const proto = loadAPrioriProtocol(protocol);
  const liver = blandAltman(pairsLiver, Number(proto.a_priori.liver_loa_ml));
  const pancreas = blandAltman(
    pairsPancreas,
    Number(proto.a_priori.pancreas_loa_ml),
  );
  return {
    protocolId: proto.protocol_id,
    declaredAt: proto.declared_at,
    author: proto.author,
    liver,
    pancreas,
  };
}

module.exports = {
  loadAPrioriProtocol,
  blandAltman,
  syntheticPairs,
  runBlandAltmanAnalysis,
};

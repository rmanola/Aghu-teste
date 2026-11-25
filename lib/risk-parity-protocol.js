/**
 * FEAT-210 — protocolo de tolerância a priori (espelho Node de parity_protocol.py).
 */

"use strict";

const { readFileSync, existsSync } = require("node:fs");
const { createHash } = require("node:crypto");

function loadProtocol(pathOrObj) {
  const data =
    typeof pathOrObj === "string"
      ? JSON.parse(readFileSync(pathOrObj, "utf8"))
      : pathOrObj;
  if (!data || !data.a_priori || data.a_priori.tolerance == null) {
    throw new Error("criterio_a_priori_ausente");
  }
  if (!data.declared_at || !data.author) {
    throw new Error("criterio_a_priori_ausente");
  }
  return data;
}

function protocolHash(pathOrObj) {
  const raw =
    typeof pathOrObj === "string" ? readFileSync(pathOrObj, "utf8") : JSON.stringify(pathOrObj);
  return createHash("sha256").update(raw).digest("hex");
}

function cohortHash(cohort) {
  return createHash("sha256")
    .update(JSON.stringify(cohort.cases || cohort))
    .digest("hex");
}

function assertToleranceImmutable(protocolPath, resultsRegistryPath) {
  const proto = loadProtocol(protocolPath);
  if (!existsSync(resultsRegistryPath)) return;
  const registry = JSON.parse(readFileSync(resultsRegistryPath, "utf8"));
  if (registry.tolerance == null) return;
  if (Number(registry.tolerance) !== Number(proto.a_priori.tolerance)) {
    throw new Error("tolerancia_paridade_imutavel_violada");
  }
}

function writeParityRegistry(registryPath, entry) {
  const payload = {
    status: "green",
    ...entry,
  };
  require("node:fs").writeFileSync(registryPath, JSON.stringify(payload, null, 2) + "\n");
}

module.exports = {
  loadProtocol,
  protocolHash,
  cohortHash,
  assertToleranceImmutable,
  writeParityRegistry,
};

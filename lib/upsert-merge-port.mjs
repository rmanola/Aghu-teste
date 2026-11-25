/**
 * Espelho Node testável do merge parcial encrypt-and-upsert.
 * @sync supabase/functions/_shared/upsert-merge.ts
 * @sync supabase/functions/_shared/record-flags.ts
 */

function hasObject(value) {
  return value != null && typeof value === "object";
}

function hasReceitasSnap(value) {
  if (!hasObject(value)) return false;
  const snap = value;
  const receitas = snap.receitas;
  if (Array.isArray(receitas) && receitas.length > 0) {
    for (const doc of receitas) {
      if (!hasObject(doc)) continue;
      const lines = doc.lines;
      if (!Array.isArray(lines)) continue;
      for (const line of lines) {
        if (hasObject(line) && String(line.drugName || "").trim()) return true;
      }
    }
  }
  const orientItems = snap.orientacoes?.items;
  if (Array.isArray(orientItems) && orientItems.some((t) => String(t || "").trim())) {
    return true;
  }
  const laudo = snap.laudo;
  if (hasObject(laudo)) {
    if (
      String(laudo.dataInternacao || "").trim() ||
      String(laudo.diagnostico || "").trim() ||
      String(laudo.procedimento || "").trim() ||
      String(laudo.dataProcedimento || "").trim() ||
      String(laudo.evolucao || "").trim() ||
      String(laudo.cid10 || "").trim()
    ) {
      return true;
    }
  }
  const atestado = snap.atestado;
  if (hasObject(atestado)) {
    if (
      String(atestado.procedimento || "").trim() ||
      String(atestado.dataInicioAfastamento || "").trim() ||
      String(atestado.cid10 || "").trim()
    ) {
      return true;
    }
  }
  return false;
}

function hasControlesContent(value) {
  if (!hasObject(value)) return false;
  return Array.isArray(value.entries) && value.entries.length > 0;
}

function hasExamsContent(value) {
  if (!hasObject(value)) return false;
  const keys = value.examsByKey;
  if (!keys || typeof keys !== "object") return false;
  return Object.keys(keys).length > 0;
}

function hasPrescricoesContent(value) {
  if (!hasObject(value)) return false;
  if (Array.isArray(value.entries)) return value.entries.length > 0;
  return !!(
    String(value.dieta || "").trim() ||
    String(value.data || "").trim() ||
    String(value.texto || "").trim() ||
    (Array.isArray(value.antibiotico) && value.antibiotico.length) ||
    (Array.isArray(value.hidratacao) && value.hidratacao.length) ||
    (Array.isArray(value.analgesia) && value.analgesia.length)
  );
}

function hasHpbRegistry(value) {
  if (!hasObject(value)) return false;
  return Array.isArray(value.episodes) && value.episodes.length > 0;
}

function hasResearchRegistry(value) {
  if (!hasObject(value)) return false;
  const protocols = value.protocols;
  if (!protocols || typeof protocols !== "object") return false;
  for (const key of Object.keys(protocols)) {
    const bucket = protocols[key];
    if (!bucket || typeof bucket !== "object") continue;
    const status = bucket.enrollment?.status;
    if (status === "enrolled" || status === "eligible" || status === "screened") {
      return true;
    }
    const entities = bucket.entities;
    if (!Array.isArray(entities)) continue;
    for (const ent of entities) {
      if (!hasObject(ent)) continue;
      if (!ent.deletedAt) return true;
    }
  }
  return false;
}

function hasPatientEpisodes(value) {
  if (!hasObject(value)) return false;
  if (!Array.isArray(value.entries)) return false;
  for (const ent of value.entries) {
    if (!hasObject(ent)) continue;
    if (!ent.deletedAt) return true;
  }
  return false;
}

function hasPassometroContent(value) {
  if (!hasObject(value)) return false;
  if (value.version === 2 && Array.isArray(value.registros)) {
    return value.registros.length > 0;
  }
  return true;
}

export function deriveRecordFlags(payload) {
  return {
    has_exams: hasExamsContent(payload.exams),
    has_controles: hasControlesContent(payload.controles),
    has_prescricoes: hasPrescricoesContent(payload.prescricoes),
    has_passometro: hasPassometroContent(payload.passometro),
    has_analise: hasObject(payload.analise),
    has_receitas: hasReceitasSnap(payload.receitas),
    has_hpb_registry: hasHpbRegistry(payload.hpb_registry),
    has_research_registry: hasResearchRegistry(payload.research_registry),
    has_patient_episodes: hasPatientEpisodes(payload.patient_episodes),
  };
}

const OPTIONAL_DOMAIN_KEYS = [
  "controles",
  "prescricoes",
  "passometro",
  "analise",
  "receitas",
  "hpb_registry",
  "research_registry",
  "patient_episodes",
];

function domainFlagKey(domain) {
  return `has_${domain}`;
}

export function isOptionalDomainInPayload(value) {
  return value != null && typeof value === "object";
}

export function shouldApplyOptionalDomainUpdate(domain, body, existing) {
  if (!isOptionalDomainInPayload(body[domain])) return false;
  if (!existing) return true;

  const incoming = deriveRecordFlags({ [domain]: body[domain] });
  const flagKey = domainFlagKey(domain);
  if (incoming[flagKey]) return true;

  const ctKey = `${domain}_ciphertext`;
  const hasExisting = Boolean(existing[ctKey]) || Boolean(existing[flagKey]);
  return !hasExisting;
}

export function payloadHasDataDomain(body) {
  return (
    isOptionalDomainInPayload(body.exams) ||
    isOptionalDomainInPayload(body.controles) ||
    isOptionalDomainInPayload(body.prescricoes) ||
    isOptionalDomainInPayload(body.passometro) ||
    isOptionalDomainInPayload(body.analise) ||
    isOptionalDomainInPayload(body.receitas) ||
    isOptionalDomainInPayload(body.hpb_registry) ||
    isOptionalDomainInPayload(body.research_registry) ||
    isOptionalDomainInPayload(body.patient_episodes)
  );
}

export function mergeRecordFlags(body, existing) {
  const incoming = deriveRecordFlags(body);
  if (!existing) return incoming;
  return {
    has_exams: isOptionalDomainInPayload(body.exams)
      ? incoming.has_exams
      : existing.has_exams,
    has_controles: shouldApplyOptionalDomainUpdate("controles", body, existing)
      ? incoming.has_controles
      : existing.has_controles,
    has_prescricoes: shouldApplyOptionalDomainUpdate("prescricoes", body, existing)
      ? incoming.has_prescricoes
      : existing.has_prescricoes,
    has_passometro: shouldApplyOptionalDomainUpdate("passometro", body, existing)
      ? incoming.has_passometro
      : existing.has_passometro,
    has_analise: shouldApplyOptionalDomainUpdate("analise", body, existing)
      ? incoming.has_analise
      : existing.has_analise,
    has_receitas: shouldApplyOptionalDomainUpdate("receitas", body, existing)
      ? incoming.has_receitas
      : existing.has_receitas,
    has_hpb_registry: shouldApplyOptionalDomainUpdate("hpb_registry", body, existing)
      ? incoming.has_hpb_registry
      : existing.has_hpb_registry,
    has_research_registry: shouldApplyOptionalDomainUpdate(
      "research_registry",
      body,
      existing,
    )
      ? incoming.has_research_registry
      : existing.has_research_registry,
    has_patient_episodes: shouldApplyOptionalDomainUpdate(
      "patient_episodes",
      body,
      existing,
    )
      ? incoming.has_patient_episodes
      : existing.has_patient_episodes,
  };
}

export function resolveArchiveSchemaVersion(bodyVersion, existing) {
  const incoming =
    typeof bodyVersion === "number" && Number.isFinite(bodyVersion)
      ? Math.max(1, Math.floor(bodyVersion))
      : 1;
  if (!existing) return incoming;
  return Math.max(existing.archive_schema_version ?? 1, incoming);
}

export function pickOptionalCiphertext(domain, body, encrypted, existing) {
  if (shouldApplyOptionalDomainUpdate(domain, body, existing)) {
    return encrypted;
  }
  if (existing) {
    const col = `${domain}_ciphertext`;
    return existing[col] ?? null;
  }
  return null;
}

/** Simula get-patient-record-fields: só domínios com ciphertext presente. */
export function mockFieldsReadResponse(existing, fields) {
  const out = {};
  for (const field of fields || []) {
    const col = `${field}_ciphertext`;
    if (existing && existing[col] != null) {
      out[field] = { ciphertext: existing[col] };
    }
  }
  return out;
}

export { OPTIONAL_DOMAIN_KEYS };

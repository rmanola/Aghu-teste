/**
 * META-AC-02: flags de domínio clínico (espelho de supabase/functions/_shared/record-flags.ts).
 */

function hasObject(value) {
  return value != null && typeof value === "object";
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

function hasPassometroContent(value) {
  if (!hasObject(value)) return false;
  if (value.version === 2 && Array.isArray(value.registros)) {
    return value.registros.length > 0;
  }
  return true;
}

export function deriveRecordFlags(payload) {
  return {
    has_exams: hasObject(payload.exams),
    has_controles: hasObject(payload.controles),
    has_prescricoes: hasPrescricoesContent(payload.prescricoes),
    has_passometro: hasPassometroContent(payload.passometro),
    has_analise: hasObject(payload.analise),
    has_receitas: hasObject(payload.receitas),
    has_hpb_registry: hasHpbRegistry(payload.hpb_registry),
  };
}

export function upsertDomainsPresent(payload) {
  const flags = deriveRecordFlags(payload);
  const out = [];
  if (flags.has_exams) out.push("exams");
  if (hasObject(payload.pii)) out.push("pii");
  if (flags.has_controles) out.push("controles");
  if (flags.has_prescricoes) out.push("prescricoes");
  if (flags.has_passometro) out.push("passometro");
  if (flags.has_analise) out.push("analise");
  if (flags.has_receitas) out.push("receitas");
  if (flags.has_hpb_registry) out.push("hpb_registry");
  return out;
}

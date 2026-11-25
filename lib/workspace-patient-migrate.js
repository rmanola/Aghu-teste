/**
 * Regras de migração pessoal → equipe (espelho para testes Node).
 */
export function partitionMigrateIds(
  requestedIds,
  sourceIds,
  targetIds,
) {
  const sourceSet = new Set(sourceIds);
  const targetSet = new Set(targetIds);
  const migrated = [];
  const skipped = [];

  for (const id of [...new Set(requestedIds)]) {
    if (!sourceSet.has(id)) {
      skipped.push({ record_client_id: id, reason: "not_in_source" });
      continue;
    }
    if (targetSet.has(id)) {
      skipped.push({ record_client_id: id, reason: "already_in_target" });
      continue;
    }
    migrated.push(id);
  }

  return { migrated, skipped };
}

/**
 * OrBoardV1 — schema do mapa de sala de cirurgia (FEAT-112).
 * Plaintext só na Edge / após decrypt; Postgres guarda ciphertext.
 */

export const OR_BOARD_SCHEMA_VERSION = 1;

export const OR_SLOT_STATUSES = Object.freeze([
  "planned",
  "confirmed",
  "cancelled",
]);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * @param {unknown} item
 * @returns {{ ok: true, item: { id: string, label: string } } | { ok: false, error: string }}
 */
export function validateOrCatalogItem(item) {
  if (!item || typeof item !== "object") {
    return { ok: false, error: "catalog_item_invalid" };
  }
  const c = /** @type {Record<string, unknown>} */ (item);
  if (!nonEmptyString(c.id)) return { ok: false, error: "catalog_id_required" };
  if (!nonEmptyString(c.label)) return { ok: false, error: "catalog_label_required" };
  return {
    ok: true,
    item: {
      id: String(c.id).trim(),
      label: String(c.label).trim(),
    },
  };
}

/**
 * @param {unknown} raw
 * @param {string} fieldError
 * @returns {{ ok: true, items: { id: string, label: string }[] } | { ok: false, error: string }}
 */
function normalizeCatalog(raw, fieldError) {
  if (raw == null) return { ok: true, items: [] };
  if (!Array.isArray(raw)) return { ok: false, error: fieldError };
  /** @type {{ id: string, label: string }[]} */
  const items = [];
  const ids = new Set();
  for (const entry of raw) {
    const result = validateOrCatalogItem(entry);
    if (!result.ok) return result;
    if (ids.has(result.item.id)) {
      return { ok: false, error: "catalog_id_duplicate" };
    }
    ids.add(result.item.id);
    items.push(result.item);
  }
  return { ok: true, items };
}

/**
 * @param {unknown} room
 * @returns {{ ok: true, room: object } | { ok: false, error: string }}
 */
export function validateOrRoom(room) {
  if (!room || typeof room !== "object") {
    return { ok: false, error: "room_invalid" };
  }
  const r = /** @type {Record<string, unknown>} */ (room);
  if (!nonEmptyString(r.id)) return { ok: false, error: "room_id_required" };
  if (!nonEmptyString(r.label)) return { ok: false, error: "room_label_required" };
  if (typeof r.sortOrder !== "number" || !Number.isFinite(r.sortOrder)) {
    return { ok: false, error: "room_sort_order_invalid" };
  }
  return {
    ok: true,
    room: {
      id: String(r.id).trim(),
      label: String(r.label).trim(),
      sortOrder: r.sortOrder,
    },
  };
}

/**
 * @param {unknown} slot
 * @returns {{ ok: true, slot: object } | { ok: false, error: string }}
 */
export function validateOrSlot(slot) {
  if (!slot || typeof slot !== "object") {
    return { ok: false, error: "slot_invalid" };
  }
  const s = /** @type {Record<string, unknown>} */ (slot);
  if (!nonEmptyString(s.id)) return { ok: false, error: "slot_id_required" };
  if (!nonEmptyString(s.roomId)) return { ok: false, error: "slot_room_id_required" };
  if (!nonEmptyString(s.date) || !DATE_RE.test(String(s.date).trim())) {
    return { ok: false, error: "slot_date_required" };
  }
  if (!nonEmptyString(s.startTime) || !TIME_RE.test(String(s.startTime).trim())) {
    return { ok: false, error: "slot_start_time_required" };
  }
  if (!nonEmptyString(s.endTime) || !TIME_RE.test(String(s.endTime).trim())) {
    return { ok: false, error: "slot_end_time_required" };
  }
  if (!nonEmptyString(s.procedure)) {
    return { ok: false, error: "slot_procedure_required" };
  }
  if (typeof s.patientLabel !== "string") {
    return { ok: false, error: "slot_patient_label_required" };
  }
  const status = typeof s.status === "string" ? s.status : "";
  if (!OR_SLOT_STATUSES.includes(status)) {
    return { ok: false, error: "slot_status_invalid" };
  }

  let recordClientId = null;
  if (s.recordClientId != null && s.recordClientId !== "") {
    if (typeof s.recordClientId !== "string") {
      return { ok: false, error: "slot_record_client_id_invalid" };
    }
    recordClientId = s.recordClientId.trim() || null;
  }

  return {
    ok: true,
    slot: {
      id: String(s.id).trim(),
      roomId: String(s.roomId).trim(),
      date: String(s.date).trim(),
      startTime: String(s.startTime).trim(),
      endTime: String(s.endTime).trim(),
      procedure: String(s.procedure).trim(),
      patientLabel: String(s.patientLabel),
      recordClientId,
      surgeon:
        typeof s.surgeon === "string" && s.surgeon.trim()
          ? s.surgeon.trim()
          : undefined,
      status,
      notes:
        typeof s.notes === "string" && s.notes.trim()
          ? s.notes.trim()
          : undefined,
    },
  };
}

/**
 * @param {unknown} board
 * @returns {{ ok: true, board: object } | { ok: false, error: string }}
 */
export function validateOrBoard(board) {
  if (!board || typeof board !== "object") {
    return { ok: false, error: "board_invalid" };
  }
  const b = /** @type {Record<string, unknown>} */ (board);
  if (b.schemaVersion !== OR_BOARD_SCHEMA_VERSION) {
    return { ok: false, error: "board_schema_version_invalid" };
  }
  if (!Array.isArray(b.rooms)) return { ok: false, error: "board_rooms_invalid" };
  if (!Array.isArray(b.slots)) return { ok: false, error: "board_slots_invalid" };

  const procedures = normalizeCatalog(
    b.procedureCatalog,
    "board_procedure_catalog_invalid",
  );
  if (!procedures.ok) return procedures;
  const surgeons = normalizeCatalog(
    b.surgeonCatalog,
    "board_surgeon_catalog_invalid",
  );
  if (!surgeons.ok) return surgeons;

  /** @type {object[]} */
  const rooms = [];
  const roomIds = new Set();
  for (const raw of b.rooms) {
    const result = validateOrRoom(raw);
    if (!result.ok) return result;
    if (roomIds.has(result.room.id)) {
      return { ok: false, error: "board_room_id_duplicate" };
    }
    roomIds.add(result.room.id);
    rooms.push(result.room);
  }

  /** @type {object[]} */
  const slots = [];
  const slotIds = new Set();
  for (const raw of b.slots) {
    const result = validateOrSlot(raw);
    if (!result.ok) return result;
    if (slotIds.has(result.slot.id)) {
      return { ok: false, error: "board_slot_id_duplicate" };
    }
    if (roomIds.size > 0 && !roomIds.has(result.slot.roomId)) {
      return { ok: false, error: "slot_room_id_unknown" };
    }
    slotIds.add(result.slot.id);
    slots.push(result.slot);
  }

  rooms.sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));

  return {
    ok: true,
    board: {
      schemaVersion: OR_BOARD_SCHEMA_VERSION,
      rooms,
      slots,
      procedureCatalog: procedures.items,
      surgeonCatalog: surgeons.items,
    },
  };
}

/**
 * @returns {{ schemaVersion: 1, rooms: [], slots: [], procedureCatalog: [], surgeonCatalog: [] }}
 */
export function emptyOrBoard() {
  return {
    schemaVersion: OR_BOARD_SCHEMA_VERSION,
    rooms: [],
    slots: [],
    procedureCatalog: [],
    surgeonCatalog: [],
  };
}

/**
 * @param {object} board
 * @param {string | null | undefined} date YYYY-MM-DD
 */
export function filterOrBoardByDate(board, date) {
  if (!date) return board;
  return {
    ...board,
    slots: (board.slots || []).filter((s) => s.date === date),
  };
}

/**
 * Merge seguro: rooms do incoming; slots de dias em `replaceDates` vêm do incoming;
 * restantes slots do existing (desde que a sala ainda exista).
 * Sem `replaceDates` → substitui o board inteiro (incoming).
 *
 * @param {object} existing
 * @param {object} incoming
 * @param {string[] | null | undefined} replaceDates
 */
export function mergeOrBoard(existing, incoming, replaceDates) {
  const incomingOk = validateOrBoard(incoming);
  if (!incomingOk.ok) return incomingOk;

  if (!Array.isArray(replaceDates) || replaceDates.length === 0) {
    return incomingOk;
  }

  const existingOk = validateOrBoard(existing);
  const prevSlots = existingOk.ok ? existingOk.board.slots : [];
  const replace = new Set(replaceDates.filter((d) => typeof d === "string"));
  const roomIds = new Set(incomingOk.board.rooms.map((r) => r.id));
  const preserved = prevSlots.filter(
    (s) => !replace.has(s.date) && roomIds.has(s.roomId),
  );
  const incomingForDates = incomingOk.board.slots.filter((s) =>
    replace.has(s.date),
  );

  return validateOrBoard({
    schemaVersion: 1,
    rooms: incomingOk.board.rooms,
    slots: [...preserved, ...incomingForDates],
    procedureCatalog: incomingOk.board.procedureCatalog,
    surgeonCatalog: incomingOk.board.surgeonCatalog,
  });
}

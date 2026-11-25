/**
 * Re-export para testes Node na raiz do repo.
 * Implementação canônica: web/lib/patient-records/normalize-patient-record-fields.mjs
 */
export {
  PATIENT_RECORD_FIELD_ORDER,
  normalizePatientRecordFields,
  patientRecordFieldsKey,
  patientRecordPiiKey,
  fieldsForFetch,
} from "../../web/lib/patient-records/normalize-patient-record-fields.mjs";

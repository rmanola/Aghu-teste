/**
 * Tipos analíticos e política de missing para dicionário HPB (pesquisa).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuHpbResearchTypes = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var DEFAULT_EMPTY_SENTINELS = {
    pending: ["pendente"],
    unknown: ["não informado", "nao informado", "ni", "unknown"],
  };

  var NOT_APPLICABLE_VALUES = ["não se aplica", "nao se aplica"];

  function uiTypeToResearchType(uiType, readOnly) {
    if (readOnly) return "calculated";
    var t = String(uiType || "").trim();
    if (t === "select" || t === "boolean") return "categorical";
    if (t === "number") return "continuous";
    if (t === "date") return "date";
    return "text";
  }

  function missingPolicyForField(def, emptySentinels) {
    var sentinels = emptySentinels || DEFAULT_EMPTY_SENTINELS;
    var uiType = def && def.type ? def.type : "text";
    var policy = {
      empty: "incomplete",
      pending: "pending",
      unknown: "unknown",
      notApplicable: "valid",
      nonStringFilled: uiType === "number" || uiType === "boolean" ? "valid" : "n/a",
    };
    return {
      policy: policy,
      sentinels: {
        pending: sentinels.pending || DEFAULT_EMPTY_SENTINELS.pending,
        unknown: sentinels.unknown || DEFAULT_EMPTY_SENTINELS.unknown,
        notApplicable: NOT_APPLICABLE_VALUES,
      },
    };
  }

  function camelToSnake(key) {
    return String(key || "")
      .replace(/([A-Z])/g, "_$1")
      .replace(/__/g, "_")
      .toLowerCase();
  }

  return {
    DEFAULT_EMPTY_SENTINELS: DEFAULT_EMPTY_SENTINELS,
    NOT_APPLICABLE_VALUES: NOT_APPLICABLE_VALUES,
    camelToSnake: camelToSnake,
    missingPolicyForField: missingPolicyForField,
    uiTypeToResearchType: uiTypeToResearchType,
  };
});

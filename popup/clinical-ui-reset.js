/**
 * Evento central para resetar UI clínica in-memory após purge de storage.
 */
(function () {
  "use strict";

  var EVENT = "aghu:clinical-storage-cleared";

  function dispatch() {
    document.dispatchEvent(new CustomEvent(EVENT));
  }

  window.AghuClinicalUiReset = {
    EVENT: EVENT,
    dispatch: dispatch,
  };
})();

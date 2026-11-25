/**
 * FEAT-208 — contador de bytes no boundary da aplicação (IMG-AC-08).
 * Classifica tráfego: metadata | pixel. Assertiva positiva: pixel === 0.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.AghuImagingPixelCounter = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var PIXEL_PATH_RE =
    /\/(?:wado|dicom-web\/studies\/[^/]+\/series\/[^/]+\/instances\/[^/]+\/(?:frames|rendered)|frames\/)/i;
  var PIXEL_CT_RE =
    /application\/dicom|multipart\/related|image\/(?:jpeg|jls|jp2|jpx|dicom)/i;

  function createPixelByteCounter() {
    var metadataBytes = 0;
    var pixelBytes = 0;
    var events = [];

    function classify(req) {
      var path = String((req && req.path) || "");
      var contentType = String((req && req.contentType) || "");
      var classHint = req && req.classHint;
      if (classHint === "pixel" || classHint === "metadata") return classHint;
      if (PIXEL_PATH_RE.test(path) || PIXEL_CT_RE.test(contentType)) {
        return "pixel";
      }
      return "metadata";
    }

    function record(req) {
      var bytes = Math.max(0, Number((req && req.bytes) || 0) || 0);
      var kind = classify(req);
      if (kind === "pixel") pixelBytes += bytes;
      else metadataBytes += bytes;
      events.push({
        kind: kind,
        bytes: bytes,
        path: String((req && req.path) || ""),
      });
      return kind;
    }

    function report() {
      return {
        metadataBytes: metadataBytes,
        pixelBytes: pixelBytes,
        events: events.slice(),
      };
    }

    /**
     * Assertiva positiva: falha se qualquer byte de pixel atravessou o boundary.
     */
    function assertZeroPixelBytes() {
      var r = report();
      if (r.pixelBytes !== 0) {
        var err = new Error(
          "[AGHU imaging] IMG-AC-08 FAIL: " +
            r.pixelBytes +
            " bytes de pixel atravessaram o boundary da aplicação.",
        );
        err.code = "PIXEL_BYTES_NONZERO";
        err.report = r;
        throw err;
      }
      return r;
    }

    return {
      record: record,
      classify: classify,
      report: report,
      assertZeroPixelBytes: assertZeroPixelBytes,
    };
  }

  /**
   * Simula sessão de visualização correcta: metadados pela app, frames directos
   * ao Orthanc (não passam pelo counter da app).
   */
  function runSyntheticViewerSession(counter, opts) {
    var c = counter || createPixelByteCounter();
    var studyUid =
      (opts && opts.studyUid) || "1.2.826.0.1.3680043.10.511.208.1";
    // Metadados pela aplicação (lista + emissão de token)
    c.record({
      path: "/api/person/x/imaging-studies",
      bytes: 420,
      classHint: "metadata",
    });
    c.record({
      path: "/api/imaging/token",
      bytes: 180,
      classHint: "metadata",
    });
    c.record({
      path: "/api/imaging/orthanc-auth",
      bytes: 96,
      classHint: "metadata",
    });
    // Frames QIDO/WADO vão DIRECTOS ao Orthanc — NÃO registados no boundary.
    void studyUid;
    return c.assertZeroPixelBytes();
  }

  return {
    createPixelByteCounter: createPixelByteCounter,
    runSyntheticViewerSession: runSyntheticViewerSession,
    PIXEL_PATH_RE: PIXEL_PATH_RE,
  };
});

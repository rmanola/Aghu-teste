/**
 * Vias de administração canônicas (HUCAM) e inferência por apresentação.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuReceitaAdministrationRoutes = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var ROUTE_ORAL = "USO ORAL";
  var ROUTE_IV = "USO IV";
  var ROUTE_IM = "USO INTRAMUSCULAR";
  var ROUTE_SC = "USO SUBCUTÂNEO";
  var ROUTE_TOPICAL = "USO TÓPICO";
  var ROUTE_INHALATION = "USO INALATÓRIO";
  var ROUTE_TRANSDERMAL = "USO TRANSDÉRMICO";
  var ROUTE_RECTAL = "USO RETAL";
  var ROUTE_SUBLINGUAL = "USO SUBLINGUAL";

  var ADMINISTRATION_ROUTES = [
    ROUTE_ORAL,
    ROUTE_IV,
    ROUTE_IM,
    ROUTE_SC,
    ROUTE_TOPICAL,
    ROUTE_INHALATION,
    ROUTE_TRANSDERMAL,
    ROUTE_RECTAL,
    ROUTE_SUBLINGUAL,
  ];

  function normPres(presentation) {
    return String(presentation || "")
      .trim()
      .toUpperCase();
  }

  function routesForPresentation(presentation) {
    var p = normPres(presentation);
    if (!p) return [];

    if (p.indexOf("CAP INAL") === 0 || p.indexOf("NEB") === 0 || p.indexOf("SPRAY") === 0) {
      return [ROUTE_INHALATION];
    }
    if (p.indexOf("CAP") === 0) return [ROUTE_ORAL];
    if (p.indexOf("SUS ORAL") === 0 || p.indexOf("SOL ORAL") === 0 || p.indexOf("XPE ORAL") === 0) {
      return [ROUTE_ORAL];
    }
    if (p.indexOf("SL") === 0) return [ROUTE_SUBLINGUAL];
    if (p.indexOf("SUP") === 0) return [ROUTE_RECTAL];
    if (p.indexOf("EV") === 0) return [ROUTE_IV];
    if (p.indexOf("SOL INJ") === 0) return [ROUTE_IM, ROUTE_IV];
    if (p.indexOf("AMP") === 0) return [ROUTE_IM, ROUTE_IV];
    if (p.indexOf("SER") === 0) {
      if (p.indexOf("MEQ") >= 0) return [ROUTE_IV];
      return [ROUTE_SC];
    }
    if (p.indexOf("CAN") === 0 || p.indexOf("F/A") === 0) return [ROUTE_SC];
    if (p.indexOf("GEL") === 0) return [ROUTE_TOPICAL];
    if (p.indexOf("TDA") === 0 || p.indexOf("ADE") === 0) return [ROUTE_TRANSDERMAL];
    if (
      p.indexOf("CP") === 0 ||
      p.indexOf("XPE") === 0 ||
      p.indexOf("SUS") === 0 ||
      p.indexOf("GTS") === 0 ||
      p.indexOf("SACHÊ") === 0 ||
      p.indexOf("SACH") === 0
    ) {
      return [ROUTE_ORAL];
    }
    return [];
  }

  function intersectRoutes(allowed, drugRoutes) {
    if (!Array.isArray(allowed) || !allowed.length) return [];
    if (!Array.isArray(drugRoutes) || !drugRoutes.length) return allowed.slice();
    var set = {};
    for (var i = 0; i < drugRoutes.length; i++) {
      set[drugRoutes[i]] = true;
    }
    var out = [];
    for (var j = 0; j < allowed.length; j++) {
      if (set[allowed[j]]) out.push(allowed[j]);
    }
    return out;
  }

  function defaultRouteForAllowed(allowedRoutes, presentation) {
    if (!Array.isArray(allowedRoutes) || !allowedRoutes.length) return null;
    if (allowedRoutes.length === 1) return allowedRoutes[0];
    var p = normPres(presentation);
    if (p.indexOf("AMP") === 0 && allowedRoutes.indexOf(ROUTE_IM) >= 0) {
      return ROUTE_IM;
    }
    return allowedRoutes[0];
  }

  function coerceRouteSelection(currentRoute, allowedRoutes, defaultRoute) {
    allowedRoutes = Array.isArray(allowedRoutes) ? allowedRoutes : [];
    var current = String(currentRoute || "").trim();
    if (current && allowedRoutes.indexOf(current) >= 0) return current;
    if (allowedRoutes.length === 1) return allowedRoutes[0];
    if (defaultRoute && allowedRoutes.indexOf(defaultRoute) >= 0) return defaultRoute;
    return "";
  }

  return {
    ADMINISTRATION_ROUTES: ADMINISTRATION_ROUTES,
    routesForPresentation: routesForPresentation,
    intersectRoutes: intersectRoutes,
    defaultRouteForAllowed: defaultRouteForAllowed,
    coerceRouteSelection: coerceRouteSelection,
  };
});

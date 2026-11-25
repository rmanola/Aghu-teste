/**
 * Tokens de design AGHU — fonte única para web (globals.css) e popup (popup.css).
 * Editar aqui → `node scripts/sync-theme-tokens.mjs`.
 * Nomes estáveis: --bg, --surface, --accent, radius, focus, domain, etc.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuThemeTokens = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var SHARED = {
    accent: "#5b9cf6",
    accentDim: "#3a6bb5",
    green: "#4ade80",
    red: "#f87171",
    yellow: "#fbbf24",
    orange: "#fb923c",
    teal: "#2dd4bf",
    purple: "#a78bfa",
  };

  /** Radius scale (px). */
  var RADIUS = {
    sm: "4px",
    md: "6px",
    lg: "8px",
    xl: "12px",
  };

  /** 4-based spacing scale. */
  var SPACE = {
    1: "4px",
    2: "8px",
    3: "12px",
    4: "16px",
    5: "20px",
    6: "24px",
    8: "32px",
  };

  var MOTION = {
    fast: "120ms",
    normal: "200ms",
  };

  /**
   * Domínio clínico → token de cor semântica.
   * exames=accent, controles=teal, presc=purple, cirurgias/passômetro=orange
   */
  var DOMAIN = {
    exames: "accent",
    controles: "teal",
    prescricoes: "purple",
    cirurgias: "orange",
    passometro: "orange",
  };

  var LIGHT = {
    bg: "#f8f9fc",
    surface: "#ffffff",
    surface2: "#eef1f7",
    border: "#c8ceda",
    text: "#0f1419",
    textDim: "#3d4455",
    rowHighlight: "#dce6f5",
    accent: "#1d4ed8",
    accentDim: "#1e3a8a",
    accentMuted: "rgba(29, 78, 216, 0.1)",
    green: "#047857",
    red: "#b91c1c",
    yellow: "#a16207",
    orange: "#c2410c",
    teal: "#0f766e",
    tealMuted: "rgba(15, 118, 110, 0.12)",
    purple: "#6d28d9",
    examValueGrid: "#064e3b",
    examValueFetched: "#7c2d12",
    examValueEmpty: "#2d3344",
    warningBg: "#92400e",
    warningBgHover: "#78350f",
    focusRing: "0 0 0 2px #f8f9fc, 0 0 0 4px #1d4ed8",
  };

  var DARK = {
    bg: "#0f1117",
    surface: "#1a1d27",
    surface2: "#242733",
    border: "#2e3140",
    text: "#e4e6f0",
    textDim: "#8b8fa3",
    rowHighlight: "#1a2733",
    accent: SHARED.accent,
    accentDim: SHARED.accentDim,
    accentMuted: "rgba(91, 156, 246, 0.1)",
    green: SHARED.green,
    red: SHARED.red,
    yellow: SHARED.yellow,
    orange: SHARED.orange,
    teal: SHARED.teal,
    tealMuted: "rgba(45, 212, 191, 0.12)",
    purple: SHARED.purple,
    examValueGrid: SHARED.green,
    examValueFetched: SHARED.orange,
    examValueEmpty: "#8b8fa3",
    warningBg: "rgba(251, 146, 60, 0.22)",
    warningBgHover: "rgba(251, 146, 60, 0.32)",
    focusRing: "0 0 0 2px #0f1117, 0 0 0 4px #5b9cf6",
  };

  /**
   * @param {Record<string, string>} tokens
   * @param {{ indent?: string }} [options]
   */
  function toCssBlock(tokens, options) {
    var indent = (options && options.indent) || "  ";
    var lines = [
      "--bg: " + tokens.bg + ";",
      "--surface: " + tokens.surface + ";",
      "--surface2: " + tokens.surface2 + ";",
      "--border: " + tokens.border + ";",
      "--text: " + tokens.text + ";",
      "--text-dim: " + tokens.textDim + ";",
      "--row-highlight: " + tokens.rowHighlight + ";",
      "--accent: " + tokens.accent + ";",
      "--accent-dim: " + tokens.accentDim + ";",
      "--accent-muted: " + tokens.accentMuted + ";",
      "--green: " + tokens.green + ";",
      "--red: " + tokens.red + ";",
      "--yellow: " + tokens.yellow + ";",
      "--orange: " + tokens.orange + ";",
      "--teal: " + tokens.teal + ";",
      "--teal-muted: " + tokens.tealMuted + ";",
      "--purple: " + tokens.purple + ";",
      "--exam-value-grid: " + tokens.examValueGrid + ";",
      "--exam-value-fetched: " + tokens.examValueFetched + ";",
      "--exam-value-empty: " + tokens.examValueEmpty + ";",
      "--warning-bg: " + tokens.warningBg + ";",
      "--warning-bg-hover: " + tokens.warningBgHover + ";",
      "--focus-ring: " + tokens.focusRing + ";",
      "--radius-sm: " + RADIUS.sm + ";",
      "--radius-md: " + RADIUS.md + ";",
      "--radius-lg: " + RADIUS.lg + ";",
      "--radius-xl: " + RADIUS.xl + ";",
      "--space-1: " + SPACE[1] + ";",
      "--space-2: " + SPACE[2] + ";",
      "--space-3: " + SPACE[3] + ";",
      "--space-4: " + SPACE[4] + ";",
      "--space-5: " + SPACE[5] + ";",
      "--space-6: " + SPACE[6] + ";",
      "--space-8: " + SPACE[8] + ";",
      "--motion-fast: " + MOTION.fast + ";",
      "--motion-normal: " + MOTION.normal + ";",
      "--domain-exames: var(--accent);",
      "--domain-controles: var(--teal);",
      "--domain-prescricoes: var(--purple);",
      "--domain-cirurgias: var(--orange);",
      "--domain-passometro: var(--orange);",
      "--background: var(--bg);",
      "--foreground: var(--text);",
      "--muted: var(--surface2);",
      "--muted-fg: var(--text-dim);",
    ];
    return lines.map(function (line) {
      return indent + line;
    }).join("\n");
  }

  return {
    LIGHT: LIGHT,
    DARK: DARK,
    RADIUS: RADIUS,
    SPACE: SPACE,
    MOTION: MOTION,
    DOMAIN: DOMAIN,
    toCssBlock: toCssBlock,
  };
});

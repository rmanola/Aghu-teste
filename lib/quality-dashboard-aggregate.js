/**
 * Agregação de KPIs do dashboard de qualidade (FEAT-092 + FEAT-093/095 bloco G UTI
 * + FEAT-096 vínculo surgeryId).
 * Fontes: passometro (dx/cirurgias/equipe/poNotas) + patient_episodes
 * (dx união, complications, death, LOS, icuAdmissions[]).
 * NÃO usa header.staff nem HPB surgeon.
 *
 * hospInPeriod (ICU COB den): hospitalization com episode.startedAt ∈ period.
 * Eventos UTI no período: icu.startedAt ∈ period (FEAT-095 multi-evento).
 * COB-01: hospWithIcuEventInPeriod / hospInPeriod; COB-02/03: count eventos / den.
 * UNPL-05 / PLN-05: typeKeys via surgeryId → cirurgias[].id; senão janela temporal;
 * PLN-04: planned → bump dx do episódio (FEAT-096).
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AghuQualityDashboardAggregate = api;
})(
  typeof globalThis !== "undefined" ? globalThis : this,
  function (root) {
    "use strict";

    /**
     * Carrega dep: preferir require estático (webpack/Next); em falha,
     * cair para root/globalThis — nunca retornar cedo sem tentar globals.
     * Deno createRequire: UMD corre o IIFE mas devolve Module vazio `{}` —
     * tratar como miss e usar globalThis.Aghu*.
     */
    function isUsableModule(mod) {
      if (!mod || typeof mod !== "object") return false;
      try {
        return Object.keys(mod).length > 0;
      } catch (_e) {
        return false;
      }
    }

    function load(name, globalName) {
      var mod = null;
      if (typeof require === "function") {
        try {
          if (name === "quality-period-range.js") {
            mod = require("./quality-period-range.js");
          } else if (name === "cirurgias-equipe-parse.js") {
            mod = require("./cirurgias-equipe-parse.js");
          } else if (name === "patient-episodes-schema.js") {
            mod = require("./patient-episodes-schema.js");
          } else if (name === "passometro-collection.js") {
            mod = require("./passometro-collection.js");
          } else {
            mod = require("./" + name);
          }
        } catch (_e) {
          mod = null;
        }
      }
      if (isUsableModule(mod)) return mod;
      if (root && root[globalName]) return root[globalName];
      if (typeof globalThis !== "undefined" && globalThis[globalName]) {
        return globalThis[globalName];
      }
      return null;
    }

    var periodApi = load("quality-period-range.js", "AghuQualityPeriodRange");
    var equipeApi = load("cirurgias-equipe-parse.js", "AghuCirurgiasEquipeParse");
    var episodesApi = load("patient-episodes-schema.js", "AghuPatientEpisodesSchema");
    var collectionApi = load(
      "passometro-collection.js",
      "AghuPassometroCollection",
    );

    function str(v) {
      return v == null ? "" : String(v).trim();
    }

    /**
     * Headers clínicos do passômetro: une todos os snaps da coleção v2
     * (`registros[].snap.header`) ou fallback ao snap v1 (`passometro.header`).
     * @param {object|null|undefined} passometro
     * @param {object|null|undefined} episodesSnap
     * @returns {object[]}
     */
    function collectPassometroHeaders(passometro, episodesSnap) {
      var headers = [];
      if (!passometro || typeof passometro !== "object") return headers;

      // Unwrap v2 directo (não exige collectionApi) — evita headers vazios no browser.
      if (Array.isArray(passometro.registros)) {
        for (var i = 0; i < passometro.registros.length; i++) {
          var snap = passometro.registros[i] && passometro.registros[i].snap;
          if (snap && snap.header && typeof snap.header === "object") {
            headers.push(snap.header);
          }
        }
        // Enriquecimento opcional via collectionApi se o unwrap directo falhou.
        if (!headers.length && collectionApi) {
          try {
            var norm = collectionApi.normalizePassometroDomain
              ? collectionApi.normalizePassometroDomain(passometro, episodesSnap)
              : collectionApi.normalizeCollection
                ? { collection: collectionApi.normalizeCollection(passometro) }
                : null;
            if (norm) {
              var coll = norm.collection || { registros: [] };
              var regs = Array.isArray(coll.registros) ? coll.registros : [];
              for (var j = 0; j < regs.length; j++) {
                var snap2 = regs[j] && regs[j].snap;
                if (snap2 && snap2.header && typeof snap2.header === "object") {
                  headers.push(snap2.header);
                }
              }
            }
          } catch (_e) {
            /* ignore — keep direct-path result */
          }
        }
        if (headers.length) return headers;
      }

      if (passometro.header && typeof passometro.header === "object") {
        headers.push(passometro.header);
      }
      return headers;
    }

    function collectCirurgiasFromHeaders(headers) {
      var out = [];
      for (var i = 0; i < headers.length; i++) {
        var list = Array.isArray(headers[i].cirurgias) ? headers[i].cirurgias : [];
        for (var j = 0; j < list.length; j++) out.push(list[j]);
      }
      return out;
    }

    function normalizeTypeKey(texto) {
      var t = str(texto)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim();
      return t || "(sem nome)";
    }

    function splitComplicationTypes(texto) {
      var raw = str(texto);
      if (!raw) return [];
      var parts = raw.split(/[;\n\r]+/);
      var out = [];
      var seen = {};
      for (var i = 0; i < parts.length; i++) {
        var key = normalizeTypeKey(parts[i]);
        if (key === "(sem nome)" || seen[key]) continue;
        seen[key] = true;
        out.push(key);
      }
      return out;
    }

    function toIso(value) {
      if (periodApi && periodApi.toIsoDateLocal) {
        return periodApi.toIsoDateLocal(value);
      }
      var raw = str(value);
      if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
      var m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
      if (!m) return null;
      var d = parseInt(m[1], 10);
      var mo = parseInt(m[2], 10);
      var y = parseInt(m[3], 10);
      if (y < 100) y = y < 50 ? 2000 + y : 1900 + y;
      return (
        y +
        "-" +
        String(mo).padStart(2, "0") +
        "-" +
        String(d).padStart(2, "0")
      );
    }

    function inPeriod(iso, range) {
      if (!iso) return false;
      if (periodApi && periodApi.isDateInPeriod) {
        return periodApi.isDateInPeriod(iso, range);
      }
      if (range && range.from && iso < range.from) return false;
      if (range && range.to && iso > range.to) return false;
      return true;
    }

    function addDaysIso(iso, days) {
      if (periodApi && periodApi.addDaysIso) return periodApi.addDaysIso(iso, days);
      var p = String(iso).split("-");
      var dt = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
      dt.setDate(dt.getDate() + days);
      return (
        dt.getFullYear() +
        "-" +
        String(dt.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(dt.getDate()).padStart(2, "0")
      );
    }

    /** Dias de calendário inclusivos. */
    function calendarLosDays(startIso, endIso) {
      if (!startIso || !endIso) return null;
      var a = String(startIso).split("-");
      var b = String(endIso).split("-");
      var da = new Date(parseInt(a[0], 10), parseInt(a[1], 10) - 1, parseInt(a[2], 10));
      var db = new Date(parseInt(b[0], 10), parseInt(b[1], 10) - 1, parseInt(b[2], 10));
      var diff = Math.floor((db.getTime() - da.getTime()) / (24 * 60 * 60 * 1000));
      if (!Number.isFinite(diff) || diff < 0) return null;
      return Math.max(1, diff + 1);
    }

    function intervalsOverlap(aFrom, aTo, bFrom, bTo) {
      if (!aFrom || !bFrom) return false;
      var aEnd = aTo || aFrom;
      var bEnd = bTo || bFrom;
      return aFrom <= bEnd && bFrom <= aEnd;
    }

    function bump(map, key, n) {
      if (!key) return;
      map[key] = (map[key] || 0) + (n == null ? 1 : n);
    }

    function mapToSortedRows(map, labelFn) {
      var rows = [];
      for (var k in map) {
        if (!Object.prototype.hasOwnProperty.call(map, k)) continue;
        rows.push({
          key: k,
          count: map[k],
          label: labelFn ? labelFn(k) : k,
        });
      }
      rows.sort(function (a, b) {
        if (b.count !== a.count) return b.count - a.count;
        return String(a.key).localeCompare(String(b.key));
      });
      return rows;
    }

    function mean(nums) {
      if (!nums.length) return null;
      var s = 0;
      for (var i = 0; i < nums.length; i++) s += nums[i];
      return s / nums.length;
    }

    function meanMapRows(mapArr) {
      var rows = [];
      for (var k in mapArr) {
        if (!Object.prototype.hasOwnProperty.call(mapArr, k)) continue;
        var m = mean(mapArr[k]);
        if (m != null) rows.push({ key: k, mean: m, n: mapArr[k].length });
      }
      rows.sort(function (a, b) {
        return String(a.key).localeCompare(String(b.key));
      });
      return rows;
    }

    /** Taxa por chave: rate = den ? num/den : null. */
    function rateMapRows(numMap, denMap, labelMap) {
      var rows = [];
      for (var k in denMap) {
        if (!Object.prototype.hasOwnProperty.call(denMap, k)) continue;
        var den = denMap[k] || 0;
        var num = (numMap && numMap[k]) || 0;
        rows.push({
          key: k,
          label: (labelMap && labelMap[k]) || k,
          rate: den ? num / den : null,
          num: num,
          den: den,
        });
      }
      rows.sort(function (a, b) {
        var ra = a.rate == null ? -1 : a.rate;
        var rb = b.rate == null ? -1 : b.rate;
        if (rb !== ra) return rb - ra;
        return String(a.key).localeCompare(String(b.key));
      });
      return rows;
    }

    /** 1ª hosp com cx.data ∈ [startedAt, endUsed]. */
    function findHospContainingCx(hospList, cxData) {
      if (!cxData || !Array.isArray(hospList)) return null;
      for (var i = 0; i < hospList.length; i++) {
        var h = hospList[i];
        if (!h || !h.startedAt) continue;
        var endUsed = h.endUsed || h.endedAt || h.startedAt;
        if (cxData >= h.startedAt && cxData <= endUsed) return h;
      }
      return null;
    }

    function memberKeyOf(member) {
      if (!member) return "";
      if (equipeApi && equipeApi.memberKey) return equipeApi.memberKey(member);
      return str(member.crm) || normalizeTypeKey(member.name);
    }

    function memberLabel(member) {
      if (!member) return "";
      return str(member.name) || str(member.crm) || memberKeyOf(member);
    }

    function collectDxUnion(passometro, episodesSnap) {
      var list = [];
      var headers = collectPassometroHeaders(passometro, episodesSnap);
      for (var h = 0; h < headers.length; h++) {
        var headerDx = Array.isArray(headers[h].diagnosticos)
          ? headers[h].diagnosticos
          : [];
        for (var i = 0; i < headerDx.length; i++) {
          var d = headerDx[i];
          if (!d || !str(d.texto)) continue;
          list.push({
            texto: str(d.texto),
            data: toIso(d.data) || "",
            typeKey: normalizeTypeKey(d.texto),
            source: "passometro",
          });
        }
        // Legado: header.diagnostico (string) quando diagnosticos[] vazio.
        if (!headerDx.length && str(headers[h].diagnostico)) {
          var legacyDx = str(headers[h].diagnostico);
          list.push({
            texto: legacyDx,
            data: "",
            typeKey: normalizeTypeKey(legacyDx),
            source: "passometro-legacy",
          });
        }
      }
      var entries = [];
      if (episodesSnap) {
        entries = activeEpisodeEntries(episodesSnap);
      }
      for (var e = 0; e < entries.length; e++) {
        var diags = Array.isArray(entries[e].diagnoses) ? entries[e].diagnoses : [];
        for (var j = 0; j < diags.length; j++) {
          var dx = diags[j];
          if (!dx || !str(dx.texto)) continue;
          list.push({
            texto: str(dx.texto),
            data: toIso(dx.data) || "",
            typeKey: normalizeTypeKey(dx.texto),
            source: "episode",
          });
        }
      }
      var seen = {};
      var out = [];
      for (var k = 0; k < list.length; k++) {
        var item = list[k];
        var key = item.typeKey + "|" + (item.data || "");
        if (seen[key]) continue;
        seen[key] = true;
        out.push(item);
      }
      return out;
    }

    function cirurgiaTypeKey(cir) {
      var nome = str(cir && cir.nome) || str(cir && cir.descricao);
      return normalizeTypeKey(nome);
    }

    /**
     * Resolve typeKeys de cirurgia para um evento UTI (FEAT-096).
     * 1) surgeryId aponta para cirurgias[].id existente → typeKey dessa cx
     * 2) null / órfão → fallback janela temporal cx.data ∈ [startedAt, dischargedAt|asOf]
     * 3) sem match → [] (não entra em UNPL-05/PLN-05); nunca throw por id órfão
     * @param {{ surgeryId?: string|null, startedAt: string, dischargedAt?: string, endedAt?: string }} icu
     * @param {object[]} cirRows
     * @param {string} asOfIso
     * @returns {string[]}
     */
    function resolveIcuSurgeryTypeKeys(icu, cirRows, asOfIso) {
      var keys = [];
      var sid = str(icu && icu.surgeryId);
      var rows = Array.isArray(cirRows) ? cirRows : [];
      if (sid) {
        for (var i = 0; i < rows.length; i++) {
          var cir = rows[i];
          if (str(cir && cir.id) === sid) {
            keys.push(cirurgiaTypeKey(cir));
            return keys;
          }
        }
        // id órfão — cair para janela temporal (sem throw)
      }
      var icStart = str(icu && icu.startedAt);
      if (!icStart) return keys;
      var icEnd =
        str(icu && icu.dischargedAt) ||
        str(icu && icu.endedAt) ||
        str(asOfIso);
      for (var j = 0; j < rows.length; j++) {
        var cirAll = rows[j];
        var cirAllIso = toIso(cirAll && cirAll.data);
        if (!cirAllIso) continue;
        if (cirAllIso >= icStart && cirAllIso <= icEnd) {
          keys.push(cirurgiaTypeKey(cirAll));
        }
      }
      return keys;
    }

    function activeEpisodeEntries(episodesSnap) {
      if (episodesApi && episodesApi.filterActiveEntries && episodesSnap) {
        try {
          return episodesApi.filterActiveEntries(episodesSnap);
        } catch (_e) {
          /* Snapshot com UTI/legado inválido — ler raw sem re-normalizar. */
        }
      }
      if (episodesSnap && Array.isArray(episodesSnap.entries)) {
        return episodesSnap.entries.filter(function (e) {
          return !(e && e.deletedAt);
        });
      }
      return [];
    }

    /**
     * @param {object} patient
     * @param {{ from?: string|null, to?: string|null }} range
     * @param {{ asOf?: string|Date }|string|Date} [optsOrAsOf]
     */
    function extractPatientFacts(patient, range, optsOrAsOf) {
      var asOf =
        optsOrAsOf && typeof optsOrAsOf === "object" && !(optsOrAsOf instanceof Date)
          ? optsOrAsOf.asOf
          : optsOrAsOf;
      var asOfIso = toIso(asOf) || (periodApi && periodApi.toIsoDateLocal(new Date()));
      var passometro = patient && patient.passometro ? patient.passometro : null;
      var episodesSnap = patient && patient.patient_episodes ? patient.patient_episodes : null;
      var hasEpisodesFlag = !!(
        patient &&
        (patient.has_patient_episodes ||
          patient.hasPatientEpisodes ||
          episodesSnap)
      );
      var passHeaders = collectPassometroHeaders(passometro, episodesSnap);
      var hasPass = !!(
        patient &&
        (patient.has_passometro ||
          patient.hasPassometro ||
          passHeaders.length > 0 ||
          passometro)
      );
      var recordId =
        (patient && (patient.record_client_id || patient.recordClientId)) || "";

      var allDx = collectDxUnion(passometro, episodesSnap);
      var dxInPeriod = [];
      var dxUndatedItems = [];
      for (var i = 0; i < allDx.length; i++) {
        if (!allDx[i].data) {
          dxUndatedItems.push(allDx[i]);
          continue;
        }
        if (inPeriod(allDx[i].data, range)) dxInPeriod.push(allDx[i]);
      }
      var dxUndated = dxUndatedItems.length;

      var cirRows = collectCirurgiasFromHeaders(passHeaders);
      var cirInPeriod = [];
      for (var c = 0; c < cirRows.length; c++) {
        var cir = cirRows[c];
        var cirIso = toIso(cir && cir.data);
        if (!cirIso || !inPeriod(cirIso, range)) continue;
        var parsed =
          equipeApi && equipeApi.parseCirurgiaEquipe
            ? equipeApi.parseCirurgiaEquipe(cir)
            : {
                members: [],
                chefe: null,
                hasEquipeText: !!str(cir && cir.equipe),
                hasParseableMembers: false,
              };
        var poEvents = [];
        var poNotas = Array.isArray(cir.poNotas) ? cir.poNotas : [];
        for (var n = 0; n < poNotas.length; n++) {
          var note = poNotas[n];
          var noteIso = toIso(note && note.data) || cirIso;
          if (!inPeriod(noteIso, range)) continue;
          var types = splitComplicationTypes(note && note.complicacoes);
          for (var t = 0; t < types.length; t++) {
            poEvents.push({
              compTypeKey: types[t],
              data: noteIso,
              surgeryTypeKey: cirurgiaTypeKey(cir),
              source: "poNotas",
            });
          }
        }
        cirInPeriod.push({
          id: str(cir.id),
          data: cirIso,
          typeKey: cirurgiaTypeKey(cir),
          members: parsed.members || [],
          chefe: parsed.chefe,
          hasEquipeText: !!parsed.hasEquipeText,
          hasParseableMembers: !!parsed.hasParseableMembers,
          poEvents: poEvents,
        });
      }

      var episodeComps = [];
      var hospEpisodes = [];
      var icuAdmissions = [];
      var hospStartedInPeriod = 0;
      /** Hosp (episode.startedAt ∈ period) com ≥1 evento icu.startedAt ∈ period. */
      var hospWithIcuEventInPeriod = 0;
      var deathEvents = [];
      var entries = activeEpisodeEntries(episodesSnap);

      for (var e = 0; e < entries.length; e++) {
        var ep = entries[e];
        var comps = Array.isArray(ep.complications) ? ep.complications : [];
        var epDxKeys = (Array.isArray(ep.diagnoses) ? ep.diagnoses : [])
          .map(function (d) {
            return normalizeTypeKey(d && d.texto);
          })
          .filter(function (k) {
            return k && k !== "(sem nome)";
          });

        for (var ci = 0; ci < comps.length; ci++) {
          var comp = comps[ci];
          var cIso = toIso(comp && comp.data);
          if (!cIso || !inPeriod(cIso, range)) continue;
          var cTypes = splitComplicationTypes(comp && comp.texto);
          for (var ct = 0; ct < cTypes.length; ct++) {
            episodeComps.push({
              compTypeKey: cTypes[ct],
              data: cIso,
              dxTypeKeys: epDxKeys,
              source: "episode",
            });
          }
        }

        if (ep.kind === "hospitalization") {
          var start = toIso(ep.startedAt);
          var endRaw = toIso(ep.endedAt);
          var end = endRaw || asOfIso;
          var active = !endRaw;
          var rangeFrom = range && range.from ? range.from : "0000-01-01";
          var rangeTo = range && range.to ? range.to : "9999-12-31";
          if (start && intervalsOverlap(start, end, rangeFrom, rangeTo)) {
            var los = calendarLosDays(start, end);
            var compKeys = [];
            for (var ck = 0; ck < comps.length; ck++) {
              compKeys = compKeys.concat(splitComplicationTypes(comps[ck] && comps[ck].texto));
            }
            hospEpisodes.push({
              id: str(ep.id),
              startedAt: start,
              endedAt: endRaw,
              endUsed: end,
              active: active,
              losDays: los,
              dxTypeKeys: epDxKeys,
              compTypeKeys: compKeys,
              surgeryTypeKeys: [],
            });
          }
          // FEAT-095: den hospInPeriod = episode.startedAt ∈ period
          if (start && inPeriod(start, range)) {
            hospStartedInPeriod += 1;
          }
          // Eventos UTI: icuAdmissions[] (array ganha); legado singular → 1 item
          // com startedAt = episode.startedAt (migrate-on-read tolerante, sem throw)
          var icuRawList = [];
          if (Array.isArray(ep.icuAdmissions) && ep.icuAdmissions.length > 0) {
            icuRawList = ep.icuAdmissions;
          } else if (ep.icuAdmission != null && typeof ep.icuAdmission === "object") {
            icuRawList = [ep.icuAdmission];
          }
          var hadIcuEventInPeriod = false;
          for (var iiRaw = 0; iiRaw < icuRawList.length; iiRaw++) {
            var icuRaw = icuRawList[iiRaw];
            if (!icuRaw || typeof icuRaw !== "object") continue;
            var icuKind =
              str(icuRaw.kind).toLowerCase();
            if (icuKind !== "planned" && icuKind !== "unplanned") continue;
            // Singular legado sem startedAt → episode.startedAt
            var icuStartIso =
              toIso(icuRaw.startedAt) ||
              (Array.isArray(ep.icuAdmissions) && ep.icuAdmissions.length > 0
                ? ""
                : start);
            if (!icuStartIso || !inPeriod(icuStartIso, range)) continue;
            hadIcuEventInPeriod = true;
            var discIso = toIso(icuRaw.dischargedAt);
            // LOS por evento: startedAt → dischargedAt; sem alta → fora do mean
            var icuLos = discIso ? calendarLosDays(icuStartIso, discIso) : null;
            var icuReason = icuKind === "planned" ? "" : str(icuRaw.reason);
            var icuSurgeryId = str(icuRaw.surgeryId) || null;
            icuAdmissions.push({
              id: str(icuRaw.id) || str(ep.id) + "-icu-" + String(iiRaw),
              episodeId: str(ep.id),
              kind: icuKind,
              dischargedAt: discIso || "",
              reason: icuReason,
              reasonTypeKey: normalizeTypeKey(icuReason),
              startedAt: icuStartIso,
              endedAt: discIso || "",
              losDays: icuLos,
              dxTypeKeys: epDxKeys.slice(),
              surgeryId: icuSurgeryId,
              surgeryTypeKeys: [],
            });
          }
          if (start && inPeriod(start, range) && hadIcuEventInPeriod) {
            hospWithIcuEventInPeriod += 1;
          }
          var death = ep.death || { occurred: false, date: null };
          if (death.occurred && death.date) {
            var dIso = toIso(death.date);
            if (dIso) {
              deathEvents.push({
                date: dIso,
                startedAt: start,
                inPeriod: inPeriod(dIso, range),
              });
            }
          }
        }
      }

      for (var h = 0; h < hospEpisodes.length; h++) {
        var he = hospEpisodes[h];
        he.surgeryTypeKeys = [];
        var hEnd = he.endedAt || asOfIso;
        for (var cx = 0; cx < cirInPeriod.length; cx++) {
          var surgery = cirInPeriod[cx];
          if (surgery.data >= he.startedAt && surgery.data <= hEnd) {
            he.surgeryTypeKeys.push(surgery.typeKey);
          }
        }
      }

      // FEAT-096: surgeryId → typeKey; senão janela temporal legado
      for (var iu = 0; iu < icuAdmissions.length; iu++) {
        var ic = icuAdmissions[iu];
        ic.surgeryTypeKeys = resolveIcuSurgeryTypeKeys(ic, cirRows, asOfIso);
      }

      var hasDxPeriod = dxInPeriod.length > 0;
      var hasCirPeriod = cirInPeriod.length > 0;
      var hasEquipePeriod = cirInPeriod.some(function (x) {
        return x.hasEquipeText;
      });
      var hasAnyEvent =
        hasDxPeriod ||
        hasCirPeriod ||
        episodeComps.length > 0 ||
        deathEvents.some(function (d) {
          return d.inPeriod;
        });

      var allCompEvents = [];
      for (var pi = 0; pi < cirInPeriod.length; pi++) {
        for (var pe = 0; pe < cirInPeriod[pi].poEvents.length; pe++) {
          allCompEvents.push(cirInPeriod[pi].poEvents[pe]);
        }
      }
      for (var ei = 0; ei < episodeComps.length; ei++) {
        allCompEvents.push(episodeComps[ei]);
      }

      return {
        recordClientId: String(recordId),
        record_client_id: String(recordId),
        hasPassometro: hasPass,
        hasPatientEpisodes: hasEpisodesFlag || entries.length > 0,
        dxInPeriod: dxInPeriod,
        dxUndated: dxUndated,
        dxUndatedItems: dxUndatedItems,
        cirInPeriod: cirInPeriod,
        hasDxPeriod: hasDxPeriod,
        hasCirPeriod: hasCirPeriod,
        hasEquipePeriod: hasEquipePeriod,
        hasAnyEvent: hasAnyEvent,
        compEvents: allCompEvents,
        hospEpisodes: hospEpisodes,
        /** Count hospitalization com startedAt ∈ period (denominador ICU COB). */
        hospStartedInPeriod: hospStartedInPeriod,
        /** Hosp (startedAt ∈ period) com ≥1 evento icu.startedAt ∈ period (COB-01 num). */
        hospWithIcuEventInPeriod: hospWithIcuEventInPeriod,
        /** Eventos UTI com icu.startedAt ∈ period (planned|unplanned). */
        icuAdmissions: icuAdmissions,
        deathEvents: deathEvents,
        hasDeathInPeriod: deathEvents.some(function (d) {
          return d.inPeriod;
        }),
      };
    }

    function buildPatientFacts(patient, range, asOf) {
      return extractPatientFacts(patient, range, { asOf: asOf });
    }

    function matchPatientFilters(facts, filters) {
      filters = filters || {};
      if (!facts) return false;
      if (filters.dx) {
        var dxKey = normalizeTypeKey(filters.dx);
        if (
          !(facts.dxInPeriod || []).some(function (d) {
            return d.typeKey === dxKey;
          })
        ) {
          return false;
        }
      }
      if (filters.proc) {
        var procKey = normalizeTypeKey(filters.proc);
        if (
          !(facts.cirInPeriod || []).some(function (c) {
            return c.typeKey === procKey;
          })
        ) {
          return false;
        }
      }
      if (filters.chefe) {
        var chefeKey = str(filters.chefe);
        if (
          !(facts.cirInPeriod || []).some(function (c) {
            if (!c.chefe) return false;
            var mk = memberKeyOf(c.chefe);
            return mk === chefeKey || normalizeTypeKey(c.chefe.name) === normalizeTypeKey(chefeKey);
          })
        ) {
          return false;
        }
      }
      if (filters.profissional) {
        var profKey = str(filters.profissional);
        if (
          !(facts.cirInPeriod || []).some(function (c) {
            return (c.members || []).some(function (m) {
              var mk = memberKeyOf(m);
              return mk === profKey || normalizeTypeKey(m.name) === normalizeTypeKey(profKey);
            });
          })
        ) {
          return false;
        }
      }
      if (filters.comp) {
        var compKey = normalizeTypeKey(filters.comp);
        if (
          !(facts.compEvents || []).some(function (ev) {
            return ev.compTypeKey === compKey;
          })
        ) {
          return false;
        }
      }
      if (filters.icu) {
        var icuMode = str(filters.icu).toLowerCase();
        var icuList = facts.icuAdmissions || [];
        if (icuMode === "any") {
          if (!icuList.length) return false;
        } else if (icuMode === "planned") {
          if (
            !icuList.some(function (x) {
              return x.kind === "planned";
            })
          ) {
            return false;
          }
        } else if (icuMode === "unplanned") {
          if (
            !icuList.some(function (x) {
              return x.kind === "unplanned";
            })
          ) {
            return false;
          }
        }
      }
      if (filters.motivo) {
        var motivoKey = normalizeTypeKey(filters.motivo);
        if (
          !(facts.icuAdmissions || []).some(function (x) {
            return (
              x.kind === "unplanned" &&
              (x.reasonTypeKey === motivoKey ||
                normalizeTypeKey(x.reason) === motivoKey)
            );
          })
        ) {
          return false;
        }
      }
      if (filters.gap === "obito" && !facts.hasDeathInPeriod) return false;
      return true;
    }

    /**
     * Agrega KPIs a partir de facts já extraídos (Edge → cliente).
     * Mesmas KPIs que `aggregateQualityDashboard` — sem re-extrair blobs.
     *
     * @param {object[]|{ facts?: object[], period?: string, asOf?: string|Date, range?: object }} factsOrOpts
     * @param {{ period?: string, asOf?: string|Date, range?: object }} [maybeOpts]
     */
    function aggregateQualityDashboardFromFacts(factsOrOpts, maybeOpts) {
      var factsList;
      var opts;
      if (Array.isArray(factsOrOpts)) {
        factsList = factsOrOpts;
        opts = maybeOpts || {};
      } else {
        opts = factsOrOpts || {};
        factsList = Array.isArray(opts.facts) ? opts.facts : [];
      }

      var asOf = opts.asOf || new Date();
      var range =
        opts.range ||
        (periodApi
          ? periodApi.resolvePeriodRange(opts.period || periodApi.DEFAULT_PERIOD, asOf)
          : { period: opts.period || "30d", from: null, to: null });

      var nTotal =
        typeof opts.nTotal === "number" && opts.nTotal >= 0
          ? opts.nTotal
          : factsList.length;
      var nPass = 0;
      var nEligible = 0;
      for (var i = 0; i < factsList.length; i++) {
        var f0 = factsList[i] || {};
        if (f0.hasPassometro) nPass += 1;
        if (f0.hasPassometro || f0.hasPatientEpisodes) nEligible += 1;
      }

      var vol06 = {};
      var vol07 = {};
      var volUndated = {};
      var top01 = {};
      var top02 = {};
      var top03 = {};
      var top02Label = {};
      var top03Label = {};
      var comp04 = {};
      var comp05 = {};
      var comp06 = {};
      var comp07 = {};
      var comp08 = {};

      var nWithEvent = 0;
      var nHasDx = 0;
      var nHasCir = 0;
      var cirTotal = 0;
      var dxTotal = 0;
      var dxUndatedTotal = 0;
      var uniqueDx = {};
      var uniqueProc = {};
      var uniqueProf = {};
      var compTotal = 0;
      var patientsWithComp = 0;
      var cirWithComp = 0;
      var losValues = [];
      var losByDx = {};
      var losBySurg = {};
      var losByComp = {};
      var nActiveLos = 0;
      var deathInPeriod = 0;
      var death30Adm = 0;
      var death90Adm = 0;
      var death30Surg = 0;
      var death90Surg = 0;
      var hospInScope = 0;
      // FEAT-095 ICU — hospInPeriod = Σ hospStartedInPeriod (episode.startedAt ∈ period)
      var hospInPeriod = 0;
      var hospWithIcuEventInPeriod = 0;
      var icuPlanned = 0;
      var icuUnplanned = 0;
      var icuLosPlanned = [];
      var icuLosUnplanned = [];
      var unplEvents = 0;
      var unplPatients = {};
      var unplByReason = {};
      var unplByDx = {};
      var unplBySurg = {};
      // FEAT-096 — planned por dx / cirurgia
      var plnByDx = {};
      var plnBySurg = {};

      // FEAT-094 — COMP por equipe + tempo até alta pós-cx
      var comp09 = {};
      var comp10 = {};
      var comp11Num = {};
      var comp11Den = {};
      var comp12Num = {};
      var comp12Den = {};
      var comp09Label = {};
      var comp10Label = {};
      var postOpValues = [];
      var postOpByChefe = {};
      var postOpByProf = {};
      var postOpChefeLabel = {};
      var postOpProfLabel = {};
      var nActivePostOpExcluded = 0;

      for (var f = 0; f < factsList.length; f++) {
        var ft = factsList[f] || {};
        // Inclui passômetro OU episódios (COMP/LOS/DEATH/dx união) — alinhado ao pool do hook
        if (
          !ft.hasPassometro &&
          !ft.hasPatientEpisodes &&
          !(ft.hospEpisodes && ft.hospEpisodes.length) &&
          !(ft.icuAdmissions && ft.icuAdmissions.length) &&
          !ft.hasAnyEvent
        ) {
          continue;
        }
        if (ft.hasAnyEvent) nWithEvent += 1;
        if (ft.hasDxPeriod) nHasDx += 1;
        if (ft.hasCirPeriod) nHasCir += 1;

        dxUndatedTotal += ft.dxUndated || 0;
        var undatedItems = ft.dxUndatedItems || [];
        for (var ui = 0; ui < undatedItems.length; ui++) {
          bump(volUndated, undatedItems[ui].typeKey);
        }
        var dxIn = Array.isArray(ft.dxInPeriod) ? ft.dxInPeriod : [];
        dxTotal += dxIn.length;
        for (var di = 0; di < dxIn.length; di++) {
          uniqueDx[dxIn[di].typeKey] = true;
          bump(vol07, dxIn[di].typeKey);
        }

        var patientHadComp = false;
        var cirList = Array.isArray(ft.cirInPeriod) ? ft.cirInPeriod : [];
        for (var ci = 0; ci < cirList.length; ci++) {
          var cir = cirList[ci];
          cirTotal += 1;
          uniqueProc[cir.typeKey] = true;
          bump(vol06, cir.typeKey);
          bump(top01, cir.typeKey);

          if (cir.chefe) {
            var chefeK = memberKeyOf(cir.chefe);
            bump(top02, chefeK);
            top02Label[chefeK] = memberLabel(cir.chefe);
          }
          for (var mi = 0; mi < (cir.members || []).length; mi++) {
            var mk = memberKeyOf(cir.members[mi]);
            if (mk) {
              uniqueProf[mk] = true;
              bump(top03, mk);
              top03Label[mk] = memberLabel(cir.members[mi]);
            }
          }

          var poEvents = Array.isArray(cir.poEvents) ? cir.poEvents : [];
          if (poEvents.length) {
            cirWithComp += 1;
            patientHadComp = true;
          }
          for (var pe = 0; pe < poEvents.length; pe++) {
            var ev = poEvents[pe];
            compTotal += 1;
            bump(comp04, ev.compTypeKey);
            bump(comp05, ev.surgeryTypeKey);
            bump(comp07, ev.compTypeKey + "|" + ev.surgeryTypeKey);
            for (var pdx = 0; pdx < dxIn.length; pdx++) {
              bump(comp06, dxIn[pdx].typeKey);
              bump(comp08, ev.compTypeKey + "|" + dxIn[pdx].typeKey);
            }
          }

          // FEAT-094 COMP-09..12 — só poNotas + equipe parseável (nunca header.staff)
          var hasPo = poEvents.length > 0;
          if (cir.chefe) {
            var c9k = memberKeyOf(cir.chefe);
            if (c9k) {
              bump(comp11Den, c9k);
              if (hasPo) bump(comp11Num, c9k);
              comp09Label[c9k] = memberLabel(cir.chefe);
              for (var pe9 = 0; pe9 < poEvents.length; pe9++) {
                bump(comp09, c9k);
              }
            }
          }
          for (var mi9 = 0; mi9 < (cir.members || []).length; mi9++) {
            var mem9 = cir.members[mi9];
            var m9k = memberKeyOf(mem9);
            if (!m9k) continue;
            bump(comp12Den, m9k);
            if (hasPo) bump(comp12Num, m9k);
            comp10Label[m9k] = memberLabel(mem9);
            for (var pe10 = 0; pe10 < poEvents.length; pe10++) {
              bump(comp10, m9k);
            }
          }

          // FEAT-094 POST — 1ª hosp contendo a cx; só alta real (nunca asOf)
          var hospForPost = findHospContainingCx(
            Array.isArray(ft.hospEpisodes) ? ft.hospEpisodes : [],
            cir.data,
          );
          if (hospForPost) {
            if (hospForPost.active || !hospForPost.endedAt) {
              nActivePostOpExcluded += 1;
            } else {
              var postDays = calendarLosDays(cir.data, hospForPost.endedAt);
              if (postDays != null) {
                postOpValues.push(postDays);
                if (cir.chefe) {
                  var pCk = memberKeyOf(cir.chefe);
                  if (pCk) {
                    if (!postOpByChefe[pCk]) postOpByChefe[pCk] = [];
                    postOpByChefe[pCk].push(postDays);
                    postOpChefeLabel[pCk] = memberLabel(cir.chefe);
                  }
                }
                for (var miP = 0; miP < (cir.members || []).length; miP++) {
                  var memP = cir.members[miP];
                  var pMk = memberKeyOf(memP);
                  if (!pMk) continue;
                  if (!postOpByProf[pMk]) postOpByProf[pMk] = [];
                  postOpByProf[pMk].push(postDays);
                  postOpProfLabel[pMk] = memberLabel(memP);
                }
              }
            }
          }
        }

        var compEvents = Array.isArray(ft.compEvents) ? ft.compEvents : [];
        for (var ce = 0; ce < compEvents.length; ce++) {
          var cEv = compEvents[ce];
          if (cEv.source !== "episode") continue;
          patientHadComp = true;
          compTotal += 1;
          bump(comp04, cEv.compTypeKey);
          for (var dk = 0; dk < (cEv.dxTypeKeys || []).length; dk++) {
            bump(comp06, cEv.dxTypeKeys[dk]);
            bump(comp08, cEv.compTypeKey + "|" + cEv.dxTypeKeys[dk]);
          }
        }

        if (patientHadComp) patientsWithComp += 1;

        var hospList = Array.isArray(ft.hospEpisodes) ? ft.hospEpisodes : [];
        for (var hi = 0; hi < hospList.length; hi++) {
          var hosp = hospList[hi];
          hospInScope += 1;
          if (hosp.losDays != null) {
            losValues.push(hosp.losDays);
            if (hosp.active) nActiveLos += 1;
            for (var hdx = 0; hdx < (hosp.dxTypeKeys || []).length; hdx++) {
              if (!losByDx[hosp.dxTypeKeys[hdx]]) losByDx[hosp.dxTypeKeys[hdx]] = [];
              losByDx[hosp.dxTypeKeys[hdx]].push(hosp.losDays);
            }
            for (var hs = 0; hs < (hosp.surgeryTypeKeys || []).length; hs++) {
              if (!losBySurg[hosp.surgeryTypeKeys[hs]]) losBySurg[hosp.surgeryTypeKeys[hs]] = [];
              losBySurg[hosp.surgeryTypeKeys[hs]].push(hosp.losDays);
            }
            for (var hc = 0; hc < (hosp.compTypeKeys || []).length; hc++) {
              if (!losByComp[hosp.compTypeKeys[hc]]) losByComp[hosp.compTypeKeys[hc]] = [];
              losByComp[hosp.compTypeKeys[hc]].push(hosp.losDays);
            }
          }
        }

        hospInPeriod +=
          typeof ft.hospStartedInPeriod === "number" ? ft.hospStartedInPeriod : 0;
        hospWithIcuEventInPeriod +=
          typeof ft.hospWithIcuEventInPeriod === "number"
            ? ft.hospWithIcuEventInPeriod
            : 0;
        var icuList = Array.isArray(ft.icuAdmissions) ? ft.icuAdmissions : [];
        var patientHadUnpl = false;
        for (var ii = 0; ii < icuList.length; ii++) {
          var icu = icuList[ii];
          if (icu.kind === "planned") {
            icuPlanned += 1;
            if (icu.losDays != null) icuLosPlanned.push(icu.losDays);
            for (var pdx = 0; pdx < (icu.dxTypeKeys || []).length; pdx++) {
              bump(plnByDx, icu.dxTypeKeys[pdx]);
            }
            for (var psx = 0; psx < (icu.surgeryTypeKeys || []).length; psx++) {
              bump(plnBySurg, icu.surgeryTypeKeys[psx]);
            }
          } else if (icu.kind === "unplanned") {
            icuUnplanned += 1;
            unplEvents += 1;
            patientHadUnpl = true;
            if (icu.losDays != null) icuLosUnplanned.push(icu.losDays);
            bump(unplByReason, icu.reasonTypeKey || normalizeTypeKey(icu.reason));
            for (var idx = 0; idx < (icu.dxTypeKeys || []).length; idx++) {
              bump(unplByDx, icu.dxTypeKeys[idx]);
            }
            for (var isx = 0; isx < (icu.surgeryTypeKeys || []).length; isx++) {
              bump(unplBySurg, icu.surgeryTypeKeys[isx]);
            }
          }
        }
        if (patientHadUnpl) {
          var rid = String(ft.recordClientId || ft.record_client_id || "");
          if (rid) unplPatients[rid] = true;
        }

        var patientDeath30Surg = false;
        var patientDeath90Surg = false;
        var deathList = Array.isArray(ft.deathEvents) ? ft.deathEvents : [];
        for (var de = 0; de < deathList.length; de++) {
          var death = deathList[de];
          if (death.inPeriod) deathInPeriod += 1;
          if (death.startedAt) {
            var adm30 = addDaysIso(death.startedAt, 30);
            var adm90 = addDaysIso(death.startedAt, 90);
            var startInUiPeriod = inPeriod(death.startedAt, range);
            if (startInUiPeriod || inPeriod(death.date, range)) {
              if (death.date >= death.startedAt && death.date <= adm30) death30Adm += 1;
              if (death.date >= death.startedAt && death.date <= adm90) death90Adm += 1;
            }
          }
          for (var ds = 0; ds < cirList.length; ds++) {
            var sDate = cirList[ds].data;
            var s30 = addDaysIso(sDate, 30);
            var s90 = addDaysIso(sDate, 90);
            if (death.date >= sDate && death.date <= s30) patientDeath30Surg = true;
            if (death.date >= sDate && death.date <= s90) patientDeath90Surg = true;
          }
        }
        if (patientDeath30Surg) death30Surg += 1;
        if (patientDeath90Surg) death90Surg += 1;
      }

      function ratio(num, den) {
        if (!den) return 0;
        return num / den;
      }

      var denEligible = nEligible > 0 ? nEligible : nPass;
      var icuTotal = icuPlanned + icuUnplanned;

      return {
        period: {
          period: range.period || opts.period || "30d",
          from: range.from == null ? null : range.from,
          to: range.to == null ? null : range.to,
          asOf: toIso(asOf),
        },
        nTotal: nTotal,
        nPass: nPass,
        nEligible: nEligible,
        scale: {
          "KPI-SCALE-01": ratio(nPass, nTotal),
          "KPI-SCALE-02": ratio(nWithEvent, denEligible),
          SCALE_01: ratio(nPass, nTotal),
          SCALE_02: ratio(nWithEvent, denEligible),
        },
        scaleCounts: {
          scale01: { num: nPass, den: nTotal },
          scale02: { num: nWithEvent, den: denEligible },
        },
        coverage: {
          "KPI-COB-01": ratio(nHasDx, denEligible),
          "KPI-COB-02": ratio(nHasCir, denEligible),
        },
        coverageCounts: {
          cob01: { num: nHasDx, den: denEligible },
          cob02: { num: nHasCir, den: denEligible },
        },
        volume: {
          "KPI-VOL-01": cirTotal,
          "KPI-VOL-02": dxTotal,
          "KPI-VOL-03": Object.keys(uniqueDx).length,
          "KPI-VOL-04": Object.keys(uniqueProc).length,
          "KPI-VOL-05": Object.keys(uniqueProf).length,
          "KPI-VOL-06": mapToSortedRows(vol06),
          "KPI-VOL-07": mapToSortedRows(vol07),
          VOL_01: cirTotal,
          VOL_02: dxTotal,
          VOL_06: vol06,
          VOL_07: vol07,
          dxUndated: dxUndatedTotal,
          dxUndatedByType: mapToSortedRows(volUndated),
        },
        meta: {
          dxUndated: dxUndatedTotal,
          dxUndatedByType: mapToSortedRows(volUndated),
        },
        rankings: {
          "KPI-TOP-01": mapToSortedRows(top01),
          "KPI-TOP-02": mapToSortedRows(top02, function (k) {
            return top02Label[k] || k;
          }),
          "KPI-TOP-03": mapToSortedRows(top03, function (k) {
            return top03Label[k] || k;
          }),
        },
        top: {
          TOP_01: top01,
          TOP_02: top02,
          TOP_03: top03,
        },
        complications: {
          "KPI-COMP-01": compTotal,
          "KPI-COMP-02": patientsWithComp,
          "KPI-COMP-03": ratio(cirWithComp, cirTotal),
          "KPI-COMP-04": mapToSortedRows(comp04),
          "KPI-COMP-05": mapToSortedRows(comp05),
          "KPI-COMP-06": mapToSortedRows(comp06),
          "KPI-COMP-07": mapToSortedRows(comp07),
          "KPI-COMP-08": mapToSortedRows(comp08),
          "KPI-COMP-09": mapToSortedRows(comp09, function (k) {
            return comp09Label[k] || k;
          }),
          "KPI-COMP-10": mapToSortedRows(comp10, function (k) {
            return comp10Label[k] || k;
          }),
          "KPI-COMP-11": rateMapRows(comp11Num, comp11Den, comp09Label),
          "KPI-COMP-12": rateMapRows(comp12Num, comp12Den, comp10Label),
          COMP_01: compTotal,
          COMP_02: patientsWithComp,
          COMP_04: comp04,
          COMP_05: comp05,
          COMP_06: comp06,
          COMP_07: comp07,
          COMP_08: comp08,
        },
        complicationsCounts: {
          comp03: { num: cirWithComp, den: cirTotal },
        },
        /** Bloco H — tempo até alta pós-cirurgia (FEAT-094). */
        postOpDischarge: {
          "KPI-POST-01": mean(postOpValues),
          "KPI-POST-02": meanMapRows(postOpByChefe).map(function (r) {
            return {
              key: r.key,
              mean: r.mean,
              n: r.n,
              label: postOpChefeLabel[r.key] || r.key,
            };
          }),
          "KPI-POST-03": meanMapRows(postOpByProf).map(function (r) {
            return {
              key: r.key,
              mean: r.mean,
              n: r.n,
              label: postOpProfLabel[r.key] || r.key,
            };
          }),
          "KPI-POST-04": {
            nInMean: postOpValues.length,
            activeIncluded: 0,
            nActiveIncluded: 0,
            activeExcluded: nActivePostOpExcluded,
          },
        },
        los: {
          "KPI-LOS-01": mean(losValues),
          "KPI-LOS-02": meanMapRows(losByDx),
          "KPI-LOS-03": meanMapRows(losBySurg),
          "KPI-LOS-04": meanMapRows(losByComp),
          "KPI-LOS-05": {
            nInMean: losValues.length,
            activeIncluded: nActiveLos,
            nActiveIncluded: nActiveLos,
          },
          LOS_01: mean(losValues),
          LOS_05: {
            nInMean: losValues.length,
            nActiveIncluded: nActiveLos,
            activeIncluded: nActiveLos,
          },
        },
        deaths: {
          "KPI-DEATH-01": deathInPeriod,
          "KPI-DEATH-02": death30Adm,
          "KPI-DEATH-03": death90Adm,
          "KPI-DEATH-04": death30Surg,
          "KPI-DEATH-05": death90Surg,
          "KPI-DEATH-06": ratio(deathInPeriod, hospInScope),
        },
        deathsCounts: {
          death06: { num: deathInPeriod, den: hospInScope },
        },
        death: {
          DEATH_01: deathInPeriod,
          DEATH_02: death30Adm,
          DEATH_03: death90Adm,
          DEATH_04: death30Surg,
          DEATH_05: death90Surg,
          DEATH_06: ratio(deathInPeriod, hospInScope),
        },
        /** Bloco G — UTI (FEAT-095). Den = hospInPeriod; COB-01 = hosp com evento. */
        icu: {
          "KPI-ICU-COB-01": ratio(hospWithIcuEventInPeriod, hospInPeriod),
          "KPI-ICU-COB-02": ratio(icuPlanned, hospInPeriod),
          "KPI-ICU-COB-03": ratio(icuUnplanned, hospInPeriod),
          "KPI-ICU-COB-04": {
            planned: ratio(icuPlanned, icuTotal),
            unplanned: ratio(icuUnplanned, icuTotal),
            plannedCount: icuPlanned,
            unplannedCount: icuUnplanned,
            icuTotal: icuTotal,
          },
          "KPI-ICU-LOS-01": mean(icuLosPlanned),
          "KPI-ICU-LOS-02": mean(icuLosUnplanned),
          "KPI-ICU-LOS-03": {
            planned: icuLosPlanned.length,
            unplanned: icuLosUnplanned.length,
            nPlanned: icuLosPlanned.length,
            nUnplanned: icuLosUnplanned.length,
          },
          "KPI-UNPL-01": unplEvents,
          "KPI-UNPL-02": Object.keys(unplPatients).length,
          "KPI-UNPL-03": mapToSortedRows(unplByReason),
          "KPI-UNPL-04": mapToSortedRows(unplByDx),
          "KPI-UNPL-05": mapToSortedRows(unplBySurg),
          "KPI-PLN-04": mapToSortedRows(plnByDx),
          "KPI-PLN-05": mapToSortedRows(plnBySurg),
        },
        icuCounts: {
          cob01: { num: hospWithIcuEventInPeriod, den: hospInPeriod },
          cob02: { num: icuPlanned, den: hospInPeriod },
          cob03: { num: icuUnplanned, den: hospInPeriod },
          cob04: {
            planned: icuPlanned,
            unplanned: icuUnplanned,
            den: icuTotal,
          },
          hospInPeriod: hospInPeriod,
          hospWithIcuEventInPeriod: hospWithIcuEventInPeriod,
        },
        facts: factsList,
      };
    }

    /**
     * @param {object[]|{ patients?: object[], period?: string, asOf?: string|Date, range?: object }} patientsOrOpts
     * @param {{ period?: string, asOf?: string|Date, range?: object }} [maybeOpts]
     */
    function aggregateQualityDashboard(patientsOrOpts, maybeOpts) {
      var patients;
      var opts;
      if (Array.isArray(patientsOrOpts)) {
        patients = patientsOrOpts;
        opts = maybeOpts || {};
      } else {
        opts = patientsOrOpts || {};
        patients = Array.isArray(opts.patients) ? opts.patients : [];
      }

      var asOf = opts.asOf || new Date();
      var range =
        opts.range ||
        (periodApi
          ? periodApi.resolvePeriodRange(opts.period || periodApi.DEFAULT_PERIOD, asOf)
          : { period: opts.period || "30d", from: null, to: null });

      var factsList = [];
      for (var i = 0; i < patients.length; i++) {
        factsList.push(extractPatientFacts(patients[i], range, { asOf: asOf }));
      }

      return aggregateQualityDashboardFromFacts(factsList, {
        period: opts.period,
        asOf: asOf,
        range: range,
        nTotal: patients.length,
      });
    }

    return {
      normalizeTypeKey: normalizeTypeKey,
      splitComplicationTypes: splitComplicationTypes,
      calendarLosDays: calendarLosDays,
      extractPatientFacts: extractPatientFacts,
      buildPatientFacts: buildPatientFacts,
      matchPatientFilters: matchPatientFilters,
      aggregateQualityDashboardFromFacts: aggregateQualityDashboardFromFacts,
      aggregateQualityDashboard: aggregateQualityDashboard,
      /** FEAT-122: exposta para cpi-team-rollup.js reusar a mesma regra de identidade. */
      memberKeyOf: memberKeyOf,
      memberLabel: memberLabel,
    };
  },
);

/**
 * Catálogo de medicamentos para receituário (classe regulatória V1).
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AghuReceitaMedicationCatalog = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function getRoutesApi() {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./receita-administration-routes.js");
      } catch (_e) {}
    }
    return globalThis.AghuReceitaAdministrationRoutes;
  }

  /** @type {Array<{ code: string, genericName: string, prescriptionDocumentClass: string, controlListCode?: string|null, validityDays?: number|null, routes?: string[], presentations?: string[] }>} */
  var DRUGS = [
    // --- Antibióticos / antifúngicos (retenção antimicrobiano) ---
    { code: "MEROPENEM", genericName: "Meropenem", prescriptionDocumentClass: "SPECIAL_ANTIMICROBIAL", controlListCode: "ANTIMICROBIAL", validityDays: 10, presentations: ["EV 500 MG", "EV 1 G", "EV 2 G"] },
    { code: "ERTAPENEM", genericName: "Ertapenem", prescriptionDocumentClass: "SPECIAL_ANTIMICROBIAL", controlListCode: "ANTIMICROBIAL", validityDays: 10, presentations: ["EV 1 G"] },
    { code: "IMIPENEM_CILASTATIN", genericName: "Imipenem + Cilastatina", prescriptionDocumentClass: "SPECIAL_ANTIMICROBIAL", controlListCode: "ANTIMICROBIAL", validityDays: 10, presentations: ["EV 500 MG"] },
    { code: "PIPERACILLIN_TAZOBACTAM", genericName: "Piperacilina + Tazobactam", prescriptionDocumentClass: "SPECIAL_ANTIMICROBIAL", controlListCode: "ANTIMICROBIAL", validityDays: 10, presentations: ["EV 2,25 G", "EV 4,5 G"] },
    { code: "PIPERACILLIN", genericName: "Piperacilina", prescriptionDocumentClass: "SPECIAL_ANTIMICROBIAL", controlListCode: "ANTIMICROBIAL", validityDays: 10, presentations: ["EV 2 G", "EV 4 G"] },
    { code: "AMPICILLIN_SULBACTAM", genericName: "Ampicilina + Sulbactam", prescriptionDocumentClass: "SPECIAL_ANTIMICROBIAL", controlListCode: "ANTIMICROBIAL", validityDays: 10, presentations: ["EV 1,5 G", "EV 3 G"] },
    { code: "AMOXICILLIN_CLAV", genericName: "Amoxicilina + Clavulanato", prescriptionDocumentClass: "SPECIAL_ANTIMICROBIAL", controlListCode: "ANTIMICROBIAL", validityDays: 10, presentations: ["CP 500 MG + 125 MG", "CP 875 MG + 125 MG", "CP 1 G + 200 MG"] },
    { code: "AMOXICILLIN", genericName: "Amoxicilina", prescriptionDocumentClass: "SPECIAL_ANTIMICROBIAL", controlListCode: "ANTIMICROBIAL", validityDays: 10, presentations: ["CP 500 MG", "CP 875 MG", "SUS 250 MG/5 ML"] },
    { code: "AMPICILLIN", genericName: "Ampicilina", prescriptionDocumentClass: "SPECIAL_ANTIMICROBIAL", controlListCode: "ANTIMICROBIAL", validityDays: 10, presentations: ["CP 500 MG", "EV 1 G"] },
    { code: "CEFTRIAXONE", genericName: "Ceftriaxona", prescriptionDocumentClass: "SPECIAL_ANTIMICROBIAL", controlListCode: "ANTIMICROBIAL", validityDays: 10, presentations: ["EV 500 MG", "EV 1 G"] },
    { code: "CEFAZOLIN", genericName: "Cefazolina", prescriptionDocumentClass: "SPECIAL_ANTIMICROBIAL", controlListCode: "ANTIMICROBIAL", validityDays: 10, presentations: ["EV 1 G"] },
    { code: "CEFEPIME", genericName: "Cefepime", prescriptionDocumentClass: "SPECIAL_ANTIMICROBIAL", controlListCode: "ANTIMICROBIAL", validityDays: 10, presentations: ["EV 1 G", "EV 2 G"] },
    { code: "CEFTAZIDIME", genericName: "Ceftazidima", prescriptionDocumentClass: "SPECIAL_ANTIMICROBIAL", controlListCode: "ANTIMICROBIAL", validityDays: 10, presentations: ["EV 1 G"] },
    { code: "OXACILLIN", genericName: "Oxacilina", prescriptionDocumentClass: "SPECIAL_ANTIMICROBIAL", controlListCode: "ANTIMICROBIAL", validityDays: 10, presentations: ["EV 1 G"] },
    { code: "VANCOMYCIN", genericName: "Vancomicina", prescriptionDocumentClass: "SPECIAL_ANTIMICROBIAL", controlListCode: "ANTIMICROBIAL", validityDays: 10, presentations: ["EV 500 MG", "EV 1 G", "CP 125 MG"] },
    { code: "LINEZOLID", genericName: "Linezolida", prescriptionDocumentClass: "SPECIAL_ANTIMICROBIAL", controlListCode: "ANTIMICROBIAL", validityDays: 10, presentations: ["CP 600 MG", "EV 600 MG/300 ML"] },
    { code: "CLINDAMYCIN", genericName: "Clindamicina", prescriptionDocumentClass: "SPECIAL_ANTIMICROBIAL", controlListCode: "ANTIMICROBIAL", validityDays: 10, presentations: ["CP 300 MG", "EV 600 MG/4 ML"] },
    { code: "AZITHROMYCIN", genericName: "Azitromicina", prescriptionDocumentClass: "SPECIAL_ANTIMICROBIAL", controlListCode: "ANTIMICROBIAL", validityDays: 10, presentations: ["CP 500 MG", "SUS 200 MG/5 ML"] },
    { code: "CLARITHROMYCIN", genericName: "Claritromicina", prescriptionDocumentClass: "SPECIAL_ANTIMICROBIAL", controlListCode: "ANTIMICROBIAL", validityDays: 10, presentations: ["CP 500 MG", "SUS 250 MG/5 ML"] },
    { code: "DOXYCYCLINE", genericName: "Doxiciclina", prescriptionDocumentClass: "SPECIAL_ANTIMICROBIAL", controlListCode: "ANTIMICROBIAL", validityDays: 10, presentations: ["CP 100 MG"] },
    { code: "CIPROFLOXACIN", genericName: "Ciprofloxacino", prescriptionDocumentClass: "SPECIAL_ANTIMICROBIAL", controlListCode: "ANTIMICROBIAL", validityDays: 10, presentations: ["CP 500 MG", "CP 250 MG", "EV 400 MG/200 ML"] },
    { code: "LEVOFLOXACIN", genericName: "Levofloxacino", prescriptionDocumentClass: "SPECIAL_ANTIMICROBIAL", controlListCode: "ANTIMICROBIAL", validityDays: 10, presentations: ["CP 500 MG", "CP 750 MG", "EV 500 MG/100 ML"] },
    { code: "METRONIDAZOLE", genericName: "Metronidazol", prescriptionDocumentClass: "SPECIAL_ANTIMICROBIAL", controlListCode: "ANTIMICROBIAL", validityDays: 10, presentations: ["CP 250 MG", "CP 400 MG", "CP 500 MG", "EV 500 MG/100 ML"] },
    { code: "SULFAMETHOXAZOLE_TRIM", genericName: "Sulfametoxazol + Trimetoprima", prescriptionDocumentClass: "SPECIAL_ANTIMICROBIAL", controlListCode: "ANTIMICROBIAL", validityDays: 10, presentations: ["CP 400+80 MG", "SUS 200+40 MG/5 ML"] },
    { code: "GENTAMICIN", genericName: "Gentamicina", prescriptionDocumentClass: "SPECIAL_ANTIMICROBIAL", controlListCode: "ANTIMICROBIAL", validityDays: 10, presentations: ["AMP 80 MG/2 ML", "EV 80 MG/2 ML"] },
    { code: "AMIKACIN", genericName: "Amicacina", prescriptionDocumentClass: "SPECIAL_ANTIMICROBIAL", controlListCode: "ANTIMICROBIAL", validityDays: 10, presentations: ["EV 500 MG/2 ML"] },
    { code: "COLISTIN", genericName: "Colistimetato de sódio", prescriptionDocumentClass: "SPECIAL_ANTIMICROBIAL", controlListCode: "ANTIMICROBIAL", validityDays: 10, presentations: ["EV 150 MG"] },
    { code: "FLUCONAZOLE", genericName: "Fluconazol", prescriptionDocumentClass: "SPECIAL_ANTIMICROBIAL", controlListCode: "ANTIMICROBIAL", validityDays: 10, presentations: ["CP 100 MG", "CP 150 MG", "CP 200 MG", "EV 200 MG/100 ML"] },
    { code: "VORICONAZOLE", genericName: "Voriconazol", prescriptionDocumentClass: "SPECIAL_ANTIMICROBIAL", controlListCode: "ANTIMICROBIAL", validityDays: 10, presentations: ["CP 200 MG", "EV 200 MG", "SUS ORAL 40 MG/ML"] },
    { code: "CASPOFUNGIN", genericName: "Caspofungina", prescriptionDocumentClass: "SPECIAL_ANTIMICROBIAL", controlListCode: "ANTIMICROBIAL", validityDays: 10, presentations: ["EV 50 MG", "EV 70 MG"] },
    // --- Analgésicos ---
    { code: "DIPYRONE", genericName: "Dipirona", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 500 MG", "CP 1 G", "GTS 500 MG/ML", "AMP 500 MG/ML"] },
    { code: "PARACETAMOL", genericName: "Paracetamol", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 500 MG", "CP 750 MG", "GTS 200 MG/ML", "EV 10 MG/ML"] },
    { code: "PARACETAMOL_CODEINE", genericName: "Paracetamol + Codeína", prescriptionDocumentClass: "SPECIAL_NOTIFICATION", controlListCode: "A2", validityDays: 30, presentations: ["CP 500+30 MG"] },
    // --- Antiflamatórios (AINEs / AINE-COX) ---
    { code: "IBUPROFEN", genericName: "Ibuprofeno", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 300 MG", "CP 600 MG", "SUS ORAL 50 MG/ML"] },
    { code: "KETOROLAC", genericName: "Cetorolaco", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 10 MG", "AMP 30 MG/ML"] },
    { code: "DICLOFENAC", genericName: "Diclofenaco", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 50 MG", "GEL 1%", "AMP 75 MG/3 ML"] },
    { code: "KETOPROFEN", genericName: "Cetoprofeno", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 100 MG", "AMP 100 MG/2 ML"] },
    { code: "NAPROXEN", genericName: "Naproxeno", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 250 MG", "CP 500 MG"] },
    { code: "MELOXICAM", genericName: "Meloxicam", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 7,5 MG", "CP 15 MG"] },
    { code: "NIMESULIDE", genericName: "Nimesulida", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 100 MG", "GEL 1%"] },
    { code: "PIROXICAM", genericName: "Piroxicam", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 20 MG"] },
    { code: "COLCHICINE", genericName: "Colchicina", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 0,5 MG", "CP 1 MG"] },
    { code: "INDOMETHACIN", genericName: "Indometacina", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 25 MG", "CP 50 MG", "SUP 100 MG"] },
    { code: "CELECOXIB", genericName: "Celecoxibe", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 100 MG", "CP 200 MG"] },
    { code: "ETORICOXIB", genericName: "Etoricoxibe", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 60 MG", "CP 90 MG"] },
    { code: "SULFASALAZINE", genericName: "Sulfassalazina", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 500 MG"] },
    // --- Opioides ---
    { code: "CODEINE", genericName: "Codeína", prescriptionDocumentClass: "SPECIAL_NOTIFICATION", controlListCode: "A2", validityDays: 30, presentations: ["CP 30 MG", "XPE 3 MG/ML"] },
    { code: "MORPHINE", genericName: "Morfina", prescriptionDocumentClass: "SPECIAL_NOTIFICATION", controlListCode: "A1", validityDays: 30, presentations: ["CP 10 MG", "CP 30 MG", "SOL INJ 10 MG/ML"] },
    { code: "OXYCODONE", genericName: "Oxicodona", prescriptionDocumentClass: "SPECIAL_NOTIFICATION", controlListCode: "A1", validityDays: 30, presentations: ["CP 5 MG", "CP 10 MG", "CP 20 MG"] },
    { code: "TRAMADOL", genericName: "Tramadol", prescriptionDocumentClass: "SPECIAL_CONTROL", controlListCode: "A2", validityDays: 30, presentations: ["CP 50 MG", "CP 100 MG", "GTS 100 MG/ML", "AMP 50 MG/ML"] },
    { code: "FENTANYL", genericName: "Fentanil", prescriptionDocumentClass: "SPECIAL_NOTIFICATION", controlListCode: "A1", validityDays: 30, presentations: ["TDA 25 MCG/H", "TDA 50 MCG/H", "AMP 50 MCG/ML"] },
    { code: "BUPRENORPHINE", genericName: "Buprenorfina", prescriptionDocumentClass: "SPECIAL_NOTIFICATION", controlListCode: "A1", validityDays: 30, presentations: ["ADE 5 MCG/H", "ADE 10 MCG/H", "ADE 20 MCG/H"] },
    { code: "TAPENTADOL", genericName: "Tapentadol", prescriptionDocumentClass: "SPECIAL_NOTIFICATION", controlListCode: "A1", validityDays: 30, presentations: ["CP 50 MG", "CP 100 MG"] },
    // --- Antieméticos ---
    { code: "ONDANSETRON", genericName: "Ondansetrona", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 8 MG", "AMP 4 MG/2 ML", "SOL INJ 8 MG/4 ML"] },
    { code: "GRANISETRON", genericName: "Granisetrona", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 1 MG", "CP 2 MG", "AMP 1 MG/ML"] },
    { code: "PALONOSETRON", genericName: "Palonosetrona", prescriptionDocumentClass: "SIMPLE", presentations: ["AMP 0,25 MG/5 ML", "CP 0,5 MG"] },
    { code: "APREPITANT", genericName: "Aprepitanto", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 80 MG", "CP 125 MG"] },
    { code: "FOSAPREPITANT", genericName: "Fosaprepitanto", prescriptionDocumentClass: "SIMPLE", presentations: ["EV 150 MG"] },
    { code: "DROPERIDOL", genericName: "Droperidol", prescriptionDocumentClass: "SIMPLE", presentations: ["AMP 2,5 MG/ML"] },
    { code: "DIMENHYDRINATE", genericName: "Dimenidrinato", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 100 MG", "AMP 50 MG/ML"] },
    // --- Procinéticos / digestivos ---
    { code: "METOCLOPRAMIDE", genericName: "Metoclopramida", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 10 MG", "GTS 4 MG/ML", "AMP 10 MG/2 ML"] },
    { code: "DOMPERIDONE", genericName: "Domperidona", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 10 MG", "GTS 1 MG/ML"] },
    { code: "BROMOPRIDE", genericName: "Bromoprida", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 10 MG", "GTS 4 MG/ML", "AMP 10 MG/2 ML"] },
    { code: "SIMETHICONE", genericName: "Simeticona", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 40 MG", "CP 125 MG", "GTS 75 MG/ML"] },
    // --- Antiespasmódicos / dor abdominal ---
    { code: "HYOSCINE_BUTYLBROMIDE", genericName: "Escopolamina", searchAliases: ["hioscina butilbrometo", "butilbrometo de escopolamina", "buscopan", "hioscina"], prescriptionDocumentClass: "SIMPLE", presentations: ["CP 10 MG", "GTS 10 MG/ML", "AMP 20 MG/ML"] },
    { code: "DICYCLOMINE", genericName: "Dicicloverina", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 10 MG", "CP 20 MG", "GTS 20 MG/ML"] },
    { code: "TRIMEBUTINE", genericName: "Trimebutina", prescriptionDocumentClass: "SIMPLE", presentations: ["CAP MOLE 200 MG"] },
    { code: "PHLOROGLUCINOL", genericName: "Floroglucinol", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 80 MG", "AMP 40 MG/2 ML"] },
    { code: "PAPAVERINE", genericName: "Papaverina", prescriptionDocumentClass: "SIMPLE", presentations: ["AMP 50 MG/ML"] },
    { code: "MEBEVERINE", genericName: "Mebeverina", prescriptionDocumentClass: "SIMPLE", presentations: ["CAP LP 200 MG"] },
    { code: "ALVERINE", genericName: "Alverina", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 60 MG"] },
    { code: "SCOPOLAMINE", genericName: "Hioscina (hidrobrometo)", searchAliases: ["escopolamina adesivo", "scopoderm"], prescriptionDocumentClass: "SIMPLE", presentations: ["CP 0,4 MG", "AMP 0,5 MG/ML", "ADE 1,5 MG"] },
    // --- Laxantes ---
    { code: "LACTULOSE", genericName: "Lactulose", prescriptionDocumentClass: "SIMPLE", presentations: ["XPE 667 MG/ML", "XPE 10 G/15 ML"] },
    { code: "BISACODYL", genericName: "Bisacodil", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 5 MG", "SUP 10 MG"] },
    { code: "SENNA", genericName: "Sene", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 12 MG", "XPE ORAL"] },
    { code: "PEG_3350", genericName: "Polietilenoglicol 3350", prescriptionDocumentClass: "SIMPLE", presentations: ["SACHÊ 10 G", "SACHÊ 17 G"] },
    { code: "SODIUM_PICOSULFATE", genericName: "Picossulfato de sódio", prescriptionDocumentClass: "SIMPLE", presentations: ["GTS 7,5 MG/ML", "CP 5 MG"] },
    { code: "MINERAL_OIL", genericName: "Óleo mineral", prescriptionDocumentClass: "SIMPLE", presentations: ["XPE ORAL", "SOL ORAL"] },
    { code: "MAGNESIUM_HYDROXIDE", genericName: "Hidróxido de magnésio", prescriptionDocumentClass: "SIMPLE", presentations: ["XPE 400 MG/5 ML", "CP 400 MG"] },
    { code: "SORBITOL", genericName: "Sorbitol", prescriptionDocumentClass: "SIMPLE", presentations: ["XPE ORAL"] },
    // --- Corticoides ---
    { code: "PREDNISONE", genericName: "Prednisona", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 5 MG", "CP 20 MG"] },
    { code: "PREDNISOLONE", genericName: "Prednisolona", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 5 MG", "CP 20 MG", "SOL ORAL 3 MG/ML"] },
    { code: "DEXAMETHASONE", genericName: "Dexametasona", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 0,5 MG", "CP 4 MG", "AMP 4 MG/ML"] },
    { code: "HYDROCORTISONE", genericName: "Hidrocortisona", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 10 MG", "CP 20 MG", "EV 100 MG"] },
    { code: "METHYLPREDNISOLONE", genericName: "Metilprednisolona", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 4 MG", "EV 500 MG", "EV 1 G"] },
    { code: "BETAMETHASONE", genericName: "Betametasona", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 0,5 MG", "AMP 5,7 MG/ML"] },
    { code: "DEFLAZACORT", genericName: "Deflazacort", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 6 MG", "CP 30 MG"] },
    { code: "BUDESONIDE", genericName: "Budesonida", prescriptionDocumentClass: "SIMPLE", presentations: ["CAP INAL 200 MCG", "CAP INAL 400 MCG", "NEB 0,5 MG/2 ML"] },
    // --- Imunobiológicos / imunossupressores ---
    { code: "CICLOSPORIN", genericName: "Ciclosporina", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 25 MG", "CP 50 MG", "CP 100 MG", "SOL ORAL 100 MG/ML"] },
    { code: "TACROLIMUS", genericName: "Tacrolimo", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 0,5 MG", "CP 1 MG", "CP 5 MG"] },
    { code: "MYCOPHENOLATE", genericName: "Micofenolato de mofetila", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 500 MG"] },
    { code: "AZATHIOPRINE", genericName: "Azatioprina", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 50 MG"] },
    { code: "METHOTREXATE", genericName: "Metotrexato", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 2,5 MG", "AMP 50 MG/2 ML"] },
    { code: "INFLIXIMAB", genericName: "Infliximabe", prescriptionDocumentClass: "SIMPLE", presentations: ["EV 100 MG"] },
    { code: "ADALIMUMAB", genericName: "Adalimumabe", prescriptionDocumentClass: "SIMPLE", presentations: ["SER 40 MG/0,8 ML"] },
    { code: "ETANERCEPT", genericName: "Etanercepte", prescriptionDocumentClass: "SIMPLE", presentations: ["SER 25 MG", "SER 50 MG"] },
    { code: "TOCILIZUMAB", genericName: "Tocilizumabe", prescriptionDocumentClass: "SIMPLE", presentations: ["EV 400 MG/20 ML", "SER 162 MG"] },
    { code: "RITUXIMAB", genericName: "Rituximabe", prescriptionDocumentClass: "SIMPLE", presentations: ["EV 500 MG"] },
    { code: "VEDOLIZUMAB", genericName: "Vedolizumabe", prescriptionDocumentClass: "SIMPLE", presentations: ["EV 300 MG"] },
    { code: "USTEKINUMAB", genericName: "Ustequinumabe", prescriptionDocumentClass: "SIMPLE", presentations: ["SER 45 MG", "SER 90 MG"] },
    // --- Antihipertensivos ---
    { code: "LOSARTAN", genericName: "Losartana", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 25 MG", "CP 50 MG", "CP 100 MG"] },
    { code: "ENALAPRIL", genericName: "Enalapril", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 5 MG", "CP 10 MG", "CP 20 MG"] },
    { code: "AMLODIPINE", genericName: "Anlodipino", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 5 MG", "CP 10 MG"] },
    { code: "CAPTOPRIL", genericName: "Captopril", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 25 MG", "CP 50 MG"] },
    { code: "RAMIPRIL", genericName: "Ramipril", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 2,5 MG", "CP 5 MG", "CP 10 MG"] },
    { code: "LISINOPRIL", genericName: "Lisinopril", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 5 MG", "CP 10 MG", "CP 20 MG"] },
    { code: "PERINDOPRIL", genericName: "Perindopril", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 4 MG", "CP 8 MG"] },
    { code: "VALSARTAN", genericName: "Valsartana", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 40 MG", "CP 80 MG", "CP 160 MG"] },
    { code: "TELMISARTAN", genericName: "Telmisartana", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 40 MG", "CP 80 MG"] },
    { code: "OLMESARTAN", genericName: "Olmesartana", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 20 MG", "CP 40 MG"] },
    { code: "IRBESARTAN", genericName: "Irbesartana", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 150 MG", "CP 300 MG"] },
    { code: "CANDESARTAN", genericName: "Candesartana", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 8 MG", "CP 16 MG", "CP 32 MG"] },
    { code: "NIFEDIPINE", genericName: "Nifedipino", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 10 MG", "CP 20 MG"] },
    { code: "FELODIPINE", genericName: "Felodipino", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 5 MG", "CP 10 MG"] },
    { code: "DILTIAZEM", genericName: "Diltiazem", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 30 MG", "CP 60 MG"] },
    { code: "VERAPAMIL", genericName: "Verapamil", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 80 MG", "CP 120 MG"] },
    { code: "ATENOLOL", genericName: "Atenolol", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 25 MG", "CP 50 MG", "CP 100 MG"] },
    { code: "METOPROLOL", genericName: "Metoprolol", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 25 MG", "CP 50 MG", "CP 100 MG"] },
    { code: "CARVEDILOL", genericName: "Carvedilol", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 3,125 MG", "CP 6,25 MG", "CP 12,5 MG", "CP 25 MG"] },
    { code: "BISOPROLOL", genericName: "Bisoprolol", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 2,5 MG", "CP 5 MG", "CP 10 MG"] },
    { code: "PROPRANOLOL", genericName: "Propranolol", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 10 MG", "CP 40 MG", "CP 80 MG"] },
    { code: "NEBIVOLOL", genericName: "Nebivolol", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 5 MG"] },
    { code: "DOXAZOSIN", genericName: "Doxazosina", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 2 MG", "CP 4 MG"] },
    { code: "PRAZOSIN", genericName: "Prazosina", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 1 MG", "CP 2 MG", "CP 5 MG"] },
    { code: "CLONIDINE", genericName: "Clonidina", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 0,1 MG", "ADE 0,1 MG/24H", "ADE 0,2 MG/24H"] },
    { code: "HYDRALAZINE", genericName: "Hidralazina", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 25 MG", "CP 50 MG"] },
    { code: "METHYLDOPA", genericName: "Metildopa", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 250 MG", "CP 500 MG"] },
    // --- Diuréticos ---
    { code: "FUROSEMIDE", genericName: "Furosemida", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 40 MG", "AMP 10 MG/ML"] },
    { code: "SPIRONOLACTONE", genericName: "Espironolactona", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 25 MG", "CP 100 MG"] },
    { code: "HYDROCHLOROTHIAZIDE", genericName: "Hidroclorotiazida", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 25 MG", "CP 50 MG"] },
    { code: "CHLORTHALIDONE", genericName: "Clortalidona", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 12,5 MG", "CP 25 MG"] },
    { code: "INDAPAMIDE", genericName: "Indapamida", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 1,5 MG", "CP 2,5 MG"] },
    { code: "TORASEMIDE", genericName: "Torasemida", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 10 MG", "CP 20 MG"] },
    { code: "BUMETANIDE", genericName: "Bumetanida", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 0,5 MG", "CP 1 MG", "AMP 0,25 MG/ML"] },
    { code: "AMILORIDE", genericName: "Amilorida", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 5 MG"] },
    { code: "EPLERENONE", genericName: "Eplerenona", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 25 MG", "CP 50 MG"] },
    // --- Antitrombóticos (antiagregantes / antiplaquetários / anticoagulantes) ---
    { code: "ACETYLSALICYLIC", genericName: "Ácido acetilsalicílico", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 100 MG", "CP 500 MG"] },
    { code: "CLOPIDOGREL", genericName: "Clopidogrel", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 75 MG"] },
    { code: "TICAGRELOR", genericName: "Ticagrelor", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 90 MG"] },
    { code: "PRASUGREL", genericName: "Prasugrel", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 10 MG"] },
    { code: "TICLOPIDINE", genericName: "Ticlopidina", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 250 MG"] },
    { code: "DIPYRIDAMOLE", genericName: "Dipiridamol", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 75 MG", "CP 100 MG"] },
    { code: "WARFARIN", genericName: "Varfarina", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 2 MG", "CP 5 MG"] },
    { code: "ACENOCUMAROL", genericName: "Acenocumarol", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 1 MG", "CP 4 MG"] },
    { code: "RIVAROXABAN", genericName: "Rivaroxabana", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 10 MG", "CP 15 MG", "CP 20 MG"] },
    { code: "APIXABAN", genericName: "Apixabana", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 2,5 MG", "CP 5 MG"] },
    { code: "DABIGATRAN", genericName: "Dabigatrana", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 110 MG", "CP 150 MG"] },
    { code: "EDOXABAN", genericName: "Edoxabana", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 30 MG", "CP 60 MG"] },
    { code: "HEPARIN", genericName: "Heparina não fracionada", prescriptionDocumentClass: "SIMPLE", presentations: ["AMP 5.000 UI/ML", "EV 25.000 UI/5 ML"] },
    { code: "ENOXAPARIN", genericName: "Enoxaparina", prescriptionDocumentClass: "SIMPLE", presentations: ["SER 20 MG", "SER 40 MG", "SER 60 MG", "SER 80 MG"] },
    { code: "DALTEPARIN", genericName: "Dalteparina", prescriptionDocumentClass: "SIMPLE", presentations: ["SER 2.500 UI/0,2 ML", "SER 5.000 UI/0,2 ML", "SER 10.000 UI/ML"] },
    { code: "NADROPARIN", genericName: "Nadroparina", prescriptionDocumentClass: "SIMPLE", presentations: ["SER 3.800 UI/0,4 ML", "SER 5.700 UI/0,6 ML", "SER 9.500 UI/1 ML"] },
    { code: "TINZAPARIN", genericName: "Tinzaparina", prescriptionDocumentClass: "SIMPLE", presentations: ["SER 2.000 UI/0,2 ML", "SER 4.500 UI/0,45 ML", "SER 9.000 UI/0,45 ML"] },
    { code: "FONDAPARINUX", genericName: "Fondaparinux", prescriptionDocumentClass: "SIMPLE", presentations: ["SER 2,5 MG/0,5 ML", "SER 5 MG/0,4 ML", "SER 7,5 MG/0,6 ML"] },
    // --- Outros (diabetes, PPI, psico, onco oral, vitaminas) ---
    { code: "SEMAGLUTIDE", genericName: "Semaglutida", prescriptionDocumentClass: "SIMPLE", controlListCode: "GLP1", validityDays: 90, presentations: ["CAN 0,25 MG", "CAN 0,5 MG", "CAN 1 MG", "CAN 2,4 MG", "CP 3 MG", "CP 7 MG", "CP 14 MG"] },
    { code: "OMEPRAZOLE", genericName: "Omeprazol", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 20 MG", "CP 40 MG"] },
    { code: "PANTOPRAZOLE", genericName: "Pantoprazol", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 20 MG", "CP 40 MG"] },
    { code: "METFORMIN", genericName: "Metformina", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 500 MG", "CP 850 MG", "CP 1 G"] },
    { code: "INSULIN_NPH", genericName: "Insulina NPH", prescriptionDocumentClass: "SIMPLE", presentations: ["F/A 10ML", "F/A 10 ML 100 UI/ML"] },
    { code: "INSULIN_REGULAR", genericName: "Insulina regular", prescriptionDocumentClass: "SIMPLE", presentations: ["F/A 10ML", "F/A 10 ML 100 UI/ML"] },
    { code: "MIDAZOLAM", genericName: "Midazolam", prescriptionDocumentClass: "SPECIAL_CONTROL", controlListCode: "B1", validityDays: 30, presentations: ["AMP 5 MG/ML", "AMP 15 MG/3 ML", "CP 7,5 MG"] },
    { code: "DIAZEPAM", genericName: "Diazepam", prescriptionDocumentClass: "SPECIAL_CONTROL", controlListCode: "B1", validityDays: 30, presentations: ["CP 5 MG", "CP 10 MG", "AMP 10 MG/2 ML"] },
    { code: "CLONAZEPAM", genericName: "Clonazepam", prescriptionDocumentClass: "SPECIAL_CONTROL", controlListCode: "B1", validityDays: 30, presentations: ["CP 0,5 MG", "CP 2 MG", "GTS 2,5 MG/ML"] },
    { code: "LORAZEPAM", genericName: "Lorazepam", prescriptionDocumentClass: "SPECIAL_CONTROL", controlListCode: "B1", validityDays: 30, presentations: ["CP 1 MG", "CP 2 MG", "SL 2 MG"] },
    { code: "HALOPERIDOL", genericName: "Haloperidol", prescriptionDocumentClass: "SPECIAL_CONTROL", controlListCode: "B1", validityDays: 30, presentations: ["CP 1 MG", "CP 5 MG", "GTS 2 MG/ML", "AMP 5 MG/ML"] },
    { code: "AMITRIPTYLINE", genericName: "Amitriptilina", prescriptionDocumentClass: "SPECIAL_CONTROL", controlListCode: "B1", validityDays: 30, presentations: ["CP 25 MG", "CP 75 MG"] },
    { code: "SERTRALINE", genericName: "Sertralina", prescriptionDocumentClass: "SPECIAL_CONTROL", controlListCode: "B1", validityDays: 30, presentations: ["CP 50 MG", "CP 100 MG"] },
    { code: "ZOLPIDEM", genericName: "Zolpidem", prescriptionDocumentClass: "SPECIAL_CONTROL", controlListCode: "B1", validityDays: 30, presentations: ["CP 5 MG", "CP 10 MG", "SL 5 MG"] },
    { code: "ATORVASTATIN", genericName: "Atorvastatina", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 10 MG", "CP 20 MG", "CP 40 MG", "CP 80 MG"] },
    { code: "SIMVASTATIN", genericName: "Sinvastatina", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 10 MG", "CP 20 MG", "CP 40 MG"] },
    { code: "LEVOTHYROXINE", genericName: "Levotiroxina", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 25 MCG", "CP 50 MCG", "CP 75 MCG", "CP 100 MCG", "CP 125 MCG"] },
    { code: "TAMOXIFEN", genericName: "Tamoxifeno", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 10 MG", "CP 20 MG"] },
    { code: "LETROZOLE", genericName: "Letrozol", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 2,5 MG"] },
    { code: "CAPECITABINE", genericName: "Capecitabina", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 150 MG", "CP 500 MG"] },
    { code: "SALBUTAMOL", genericName: "Salbutamol", prescriptionDocumentClass: "SIMPLE", presentations: ["SPRAY 100 MCG", "XPE 2 MG/5 ML", "NEB 5 MG/ML"] },
    { code: "ALLOPURINOL", genericName: "Alopurinol", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 100 MG", "CP 300 MG"] },
    { code: "FERROUS_SULFATE", genericName: "Sulfato ferroso", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 40 MG FE", "XPE 25 MG/ML", "GTS 25 MG/ML"] },
    { code: "FOLIC_ACID", genericName: "Ácido fólico", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 1 MG", "CP 5 MG"] },
    { code: "VITAMIN_D", genericName: "Colecalciferol", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 7.000 UI", "CP 50.000 UI", "GTS 200 UI/GOTA"] },
    { code: "CALCIUM_CARBONATE", genericName: "Carbonato de cálcio", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 500 MG", "CP 1.250 MG"] },
    { code: "POTASSIUM_CHLORIDE", genericName: "Cloreto de potássio", prescriptionDocumentClass: "SIMPLE", presentations: ["XPE 6,7%", "CP 600 MG", "SER 10 MEQ/10 ML"] },
    { code: "MAGNESIUM_OXIDE", genericName: "Óxido de magnésio", prescriptionDocumentClass: "SIMPLE", presentations: ["CP 400 MG", "CP 500 MG"] },
  ];

  /** Mapa categoria → codes (espelha comentários de bloco no catálogo). */
  var CATALOG_CATEGORIES = {
    antimicrobial: [
      "MEROPENEM", "ERTAPENEM", "IMIPENEM_CILASTATIN", "PIPERACILLIN_TAZOBACTAM", "PIPERACILLIN",
      "AMPICILLIN_SULBACTAM", "AMOXICILLIN_CLAV", "AMOXICILLIN", "AMPICILLIN", "CEFTRIAXONE",
      "CEFAZOLIN", "CEFEPIME", "CEFTAZIDIME", "OXACILLIN", "VANCOMYCIN", "LINEZOLID", "CLINDAMYCIN",
      "AZITHROMYCIN", "CLARITHROMYCIN", "DOXYCYCLINE", "CIPROFLOXACIN", "LEVOFLOXACIN", "METRONIDAZOLE",
      "SULFAMETHOXAZOLE_TRIM", "GENTAMICIN", "AMIKACIN", "COLISTIN", "FLUCONAZOLE", "VORICONAZOLE",
      "CASPOFUNGIN",
    ],
    analgesic: ["DIPYRONE", "PARACETAMOL", "PARACETAMOL_CODEINE"],
    antiinflammatory: [
      "IBUPROFEN", "KETOROLAC", "DICLOFENAC", "KETOPROFEN", "NAPROXEN", "MELOXICAM",
      "NIMESULIDE", "PIROXICAM", "COLCHICINE", "INDOMETHACIN", "CELECOXIB", "ETORICOXIB", "SULFASALAZINE",
    ],
    opioid: [
      "CODEINE", "MORPHINE", "OXYCODONE", "TRAMADOL", "FENTANYL", "BUPRENORPHINE", "TAPENTADOL",
    ],
    antiemetic: [
      "ONDANSETRON", "GRANISETRON", "PALONOSETRON", "APREPITANT", "FOSAPREPITANT", "DROPERIDOL",
      "DIMENHYDRINATE",
    ],
    procinetic: ["METOCLOPRAMIDE", "DOMPERIDONE", "BROMOPRIDE", "SIMETHICONE"],
    antispasmodic: [
      "HYOSCINE_BUTYLBROMIDE", "DICYCLOMINE", "TRIMEBUTINE", "PHLOROGLUCINOL", "PAPAVERINE",
      "MEBEVERINE", "ALVERINE", "SCOPOLAMINE",
    ],
    laxative: [
      "LACTULOSE", "BISACODYL", "SENNA", "PEG_3350", "SODIUM_PICOSULFATE", "MINERAL_OIL",
      "MAGNESIUM_HYDROXIDE", "SORBITOL",
    ],
    corticosteroid: [
      "PREDNISONE", "PREDNISOLONE", "DEXAMETHASONE", "HYDROCORTISONE", "METHYLPREDNISOLONE",
      "BETAMETHASONE", "DEFLAZACORT", "BUDESONIDE",
    ],
    immunobiologic: [
      "CICLOSPORIN", "TACROLIMUS", "MYCOPHENOLATE", "AZATHIOPRINE", "METHOTREXATE", "INFLIXIMAB",
      "ADALIMUMAB", "ETANERCEPT", "TOCILIZUMAB", "RITUXIMAB", "VEDOLIZUMAB", "USTEKINUMAB",
    ],
    antihypertensive: [
      "LOSARTAN", "ENALAPRIL", "AMLODIPINE", "CAPTOPRIL", "RAMIPRIL", "LISINOPRIL", "PERINDOPRIL",
      "VALSARTAN", "TELMISARTAN", "OLMESARTAN", "IRBESARTAN", "CANDESARTAN", "NIFEDIPINE", "FELODIPINE",
      "DILTIAZEM", "VERAPAMIL", "ATENOLOL", "METOPROLOL", "CARVEDILOL", "BISOPROLOL", "PROPRANOLOL",
      "NEBIVOLOL", "DOXAZOSIN", "PRAZOSIN", "CLONIDINE", "HYDRALAZINE", "METHYLDOPA",
    ],
    diuretic: [
      "FUROSEMIDE", "SPIRONOLACTONE", "HYDROCHLOROTHIAZIDE", "CHLORTHALIDONE", "INDAPAMIDE",
      "TORASEMIDE", "BUMETANIDE", "AMILORIDE", "EPLERENONE",
    ],
    antithrombotic: [
      "ACETYLSALICYLIC", "CLOPIDOGREL", "TICAGRELOR", "PRASUGREL", "TICLOPIDINE", "DIPYRIDAMOLE",
      "WARFARIN", "ACENOCUMAROL", "RIVAROXABAN", "APIXABAN", "DABIGATRAN", "EDOXABAN", "HEPARIN",
      "ENOXAPARIN", "DALTEPARIN", "NADROPARIN", "TINZAPARIN", "FONDAPARINUX",
    ],
    other: [
      "SEMAGLUTIDE", "OMEPRAZOLE", "PANTOPRAZOLE", "METFORMIN",
      "INSULIN_NPH", "INSULIN_REGULAR", "MIDAZOLAM", "DIAZEPAM", "CLONAZEPAM", "LORAZEPAM", "HALOPERIDOL",
      "AMITRIPTYLINE", "SERTRALINE", "ZOLPIDEM", "ATORVASTATIN", "SIMVASTATIN", "LEVOTHYROXINE", "TAMOXIFEN", "LETROZOLE",
      "CAPECITABINE", "SALBUTAMOL", "ALLOPURINOL", "FERROUS_SULFATE", "FOLIC_ACID", "VITAMIN_D",
      "CALCIUM_CARBONATE", "POTASSIUM_CHLORIDE", "MAGNESIUM_OXIDE",
    ],
  };

  var BY_CODE = {};
  for (var i = 0; i < DRUGS.length; i++) {
    BY_CODE[DRUGS[i].code] = DRUGS[i];
  }

  function norm(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .trim();
  }

  function getMedicationByCode(code) {
    if (!code) return null;
    return BY_CODE[String(code).toUpperCase()] || null;
  }

  function drugMatchesSearch(needle, drug) {
    if (norm(drug.genericName).indexOf(needle) >= 0 || norm(drug.code).indexOf(needle) >= 0) {
      return true;
    }
    var aliases = drug.searchAliases;
    if (!Array.isArray(aliases)) return false;
    for (var i = 0; i < aliases.length; i++) {
      var alias = norm(aliases[i]);
      if (!alias) continue;
      if (alias.indexOf(needle) >= 0 || needle.indexOf(alias) >= 0) return true;
    }
    return false;
  }

  function searchMedications(q, limit) {
    var lim = typeof limit === "number" ? limit : 20;
    var needle = norm(q);
    if (!needle) return DRUGS.slice(0, lim);
    var out = [];
    for (var i = 0; i < DRUGS.length; i++) {
      var d = DRUGS[i];
      if (drugMatchesSearch(needle, d)) {
        out.push(d);
        if (out.length >= lim) break;
      }
    }
    return out;
  }

  function matchDrugScore(n, drug) {
    var gn = norm(drug.genericName);
    if (!n || !gn) return -1;
    if (n === gn) return 10000 + gn.length;

    var aliases = drug.searchAliases;
    if (Array.isArray(aliases)) {
      for (var a = 0; a < aliases.length; a++) {
        var alias = norm(aliases[a]);
        if (!alias) continue;
        if (n === alias) return 8000 + alias.length;
        if (alias.indexOf(n) >= 0 || n.indexOf(alias) >= 0) return 4000 + alias.length;
      }
    }

    if (gn.indexOf(" + ") !== -1) {
      var parts = String(drug.genericName || "")
        .split(/\s*\+\s*/)
        .map(function (p) {
          return norm(p);
        });
      for (var i = 0; i < parts.length; i++) {
        if (n === parts[i]) return 5000 + parts[i].length;
      }
      if (gn.indexOf(n) >= 0 || n.indexOf(gn) >= 0) return 3000 + gn.length;
      return -1;
    }

    if (gn.indexOf(n) >= 0 || n.indexOf(gn) >= 0) return gn.length;
    return -1;
  }

  function resolveClassForDrugName(name) {
    var n = norm(name);
    if (!n) return { prescriptionDocumentClass: "SIMPLE", catalogKey: null };
    var best = null;
    var bestScore = -1;
    for (var i = 0; i < DRUGS.length; i++) {
      var d = DRUGS[i];
      var score = matchDrugScore(n, d);
      if (score > bestScore) {
        best = d;
        bestScore = score;
      }
    }
    if (!best) return { prescriptionDocumentClass: "SIMPLE", catalogKey: null };
    return {
      prescriptionDocumentClass: best.prescriptionDocumentClass,
      catalogKey: best.code,
      controlListCode: best.controlListCode || null,
      validityDays: best.validityDays != null ? best.validityDays : null,
      drugName: best.genericName,
    };
  }

  function formatMedicationOptionLabel(drugName, presentation) {
    var name = String(drugName || "").trim();
    var pres = String(presentation || "").trim();
    if (!pres) return name;
    return name + " — " + pres;
  }

  function resolveRoutesForLine(input) {
    input = input || {};
    var routesApi = getRoutesApi();
    if (!routesApi) {
      return { allowedRoutes: [], defaultRoute: null };
    }
    var presentation = input.presentation != null ? String(input.presentation) : "";
    var allowed = routesApi.routesForPresentation(presentation);
    if (input.catalogKey) {
      var drug = getMedicationByCode(input.catalogKey);
      if (drug && drug.routes && drug.routes.length) {
        allowed = routesApi.intersectRoutes(allowed, drug.routes);
      }
    }
    if (!allowed.length) {
      allowed = routesApi.ADMINISTRATION_ROUTES.slice();
    }
    var defaultRoute = routesApi.defaultRouteForAllowed(allowed, presentation);
    return {
      allowedRoutes: allowed,
      defaultRoute: defaultRoute,
    };
  }

  function coerceRouteSelection(currentRoute, allowedRoutes, defaultRoute) {
    var routesApi = getRoutesApi();
    if (!routesApi) return String(currentRoute || "").trim();
    return routesApi.coerceRouteSelection(currentRoute, allowedRoutes, defaultRoute);
  }

  function drugToOption(drug, presentation) {
    var pres = presentation != null ? String(presentation) : "";
    var resolved = resolveRoutesForLine({ catalogKey: drug.code, presentation: pres });
    return {
      optionKey: drug.code + "|" + pres,
      catalogKey: drug.code,
      drugName: drug.genericName,
      presentation: pres,
      label: formatMedicationOptionLabel(drug.genericName, pres),
      prescriptionDocumentClass: drug.prescriptionDocumentClass,
      controlListCode: drug.controlListCode || null,
      validityDays: drug.validityDays != null ? drug.validityDays : null,
      routes: resolved.allowedRoutes,
      allowedRoutes: resolved.allowedRoutes,
      defaultRoute: resolved.defaultRoute,
    };
  }

  function flattenDrugOptions(drug) {
    var list = drug.presentations;
    if (Array.isArray(list) && list.length) {
      var out = [];
      for (var i = 0; i < list.length; i++) {
        out.push(drugToOption(drug, list[i]));
      }
      return out;
    }
    return [drugToOption(drug, "")];
  }

  function searchMedicationOptions(q, limit) {
    var lim = typeof limit === "number" ? limit : 20;
    var drugs = searchMedications(q, lim);
    var out = [];
    for (var i = 0; i < drugs.length; i++) {
      var opts = flattenDrugOptions(drugs[i]);
      for (var j = 0; j < opts.length; j++) {
        out.push(opts[j]);
        if (out.length >= lim) return out;
      }
    }
    return out;
  }

  function parseFreeTextMedication(text) {
    var raw = String(text || "").trim();
    if (!raw) {
      return { drugName: "", presentation: "" };
    }
    var sep = raw.indexOf(" — ");
    if (sep < 0) sep = raw.indexOf(" - ");
    if (sep >= 0) {
      return {
        drugName: raw.slice(0, sep).trim(),
        presentation: raw.slice(sep + 3).trim(),
      };
    }
    return { drugName: raw, presentation: "" };
  }

  function lineFromCatalog(code, overrides) {
    var drug = getMedicationByCode(code);
    if (!drug) return null;
    overrides = overrides || {};
    var pres = overrides.presentation != null ? String(overrides.presentation) : "";
    var resolved = resolveRoutesForLine({ catalogKey: drug.code, presentation: pres });
    var route =
      overrides.route != null && String(overrides.route).trim()
        ? coerceRouteSelection(overrides.route, resolved.allowedRoutes, resolved.defaultRoute)
        : coerceRouteSelection("", resolved.allowedRoutes, resolved.defaultRoute);
    return {
      drugName: overrides.drugName || drug.genericName,
      catalogKey: drug.code,
      presentation: pres,
      dose: overrides.dose || "",
      route: route,
      posology: overrides.posology || "",
      quantity: overrides.quantity || "",
      prescriptionDocumentClass: drug.prescriptionDocumentClass,
      classSource: "CATALOG",
      controlListCode: drug.controlListCode || null,
      validityDays: drug.validityDays != null ? drug.validityDays : null,
    };
  }

  return {
    DRUGS: DRUGS,
    CATALOG_CATEGORIES: CATALOG_CATEGORIES,
    getMedicationByCode: getMedicationByCode,
    searchMedications: searchMedications,
    searchMedicationOptions: searchMedicationOptions,
    formatMedicationOptionLabel: formatMedicationOptionLabel,
    parseFreeTextMedication: parseFreeTextMedication,
    resolveClassForDrugName: resolveClassForDrugName,
    resolveRoutesForLine: resolveRoutesForLine,
    coerceRouteSelection: coerceRouteSelection,
    lineFromCatalog: lineFromCatalog,
  };
});

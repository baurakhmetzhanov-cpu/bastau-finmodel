/*
 * Расчётное ядро финансовой модели проекта.
 * Повторяет формулы файла «Финмодель_проекта_типовая_v4.xlsx» (листы «Финмодель проекта» и «Денежный поток»).
 * Чистые функции без зависимостей: работает в браузере (window.FinEngine) и в Node (require).
 * Единицы: любые, но одинаковые для всех сумм (в прототипе – тенге).
 */
(function (root) {
  "use strict";

  var N = 36; // горизонт денежного потока, месяцев от начала работ

  var COST_NAMES = [
    "Материалы и оборудование",
    "Субподряд и работы",
    "Спецтехника и механизмы (аренда, услуги, ГСМ)",
    "Логистика и прочие прямые"
  ];

  function defaultParams() {
    return {
      budgetYear: 2027,
      vat: 0.16,
      kpn: 0.20,
      thr: 0.08,          // порог чистой рентабельности
      finRate: 0.20,      // ставка финансирования кассового разрыва, годовых
      disc: 0.20,         // ставка дисконтирования для NPV, годовых
      vatLag: 2,          // уплата НДС: месяцев после окончания квартала
      overheadRate: 0.06, // ставка накладных по умолчанию для новых проектов
      scenarios: {
        base: { name: "Базовый", over: 0, fx: 0, delay: 0 },
        pess: { name: "Пессимистичный", over: 0.10, fx: 0.15, delay: 2 },
        opt:  { name: "Оптимистичный", over: -0.03, fx: -0.05, delay: 0 }
      }
    };
  }

  function defaultProject(params) {
    params = params || defaultParams();
    return {
      id: "p" + Date.now().toString(36) + Math.floor(Math.random() * 1000),
      name: "Новый проект",
      customer: "",
      contractNo: "",
      owner: "",
      status: "draft",
      version: 1,
      startYear: params.budgetYear,
      startMonth: 1,
      term: 12,
      contract: 0,
      tmcShare: 0,
      adv: { base: "contractVat", pct: 0.30, yearAmount: 0, fixed: 0, month: 1 },
      offset: { mode: "prop", pct: 0.30 },
      retention: { pct: 0.10, returnLag: 3 },
      payLag: 1,
      schedule: { profile: "scurve", manual: zeros(N) },
      costs: [
        { pct: 0.35, vat: true, holding: 0.30, prepay: 0.30, lead: 1, lag: 1, fx: 0.30 },
        { pct: 0.18, vat: true, holding: 0.20, prepay: 0.30, lead: 0, lag: 1, fx: 0 },
        { pct: 0.08, vat: true, holding: 0.60, prepay: 0, lead: 0, lag: 1, fx: 0 },
        { pct: 0.04, vat: true, holding: 0, prepay: 0, lead: 0, lag: 1, fx: 0 }
      ],
      overhead: { pct: params.overheadRate, vatShare: 0.30 },
      amort: 0,
      bg: [
        { type: "advance", req: true, base: "advance", pct: 1.0, manual: 0, issue: null, term: null, rate: 0.03, cover: 0 },
        { type: "perf", req: true, base: "contractVat", pct: 0.03, manual: 0, issue: null, term: null, rate: 0.03, cover: 0 },
        { type: "warranty", req: false, base: "contractVat", pct: 0.03, manual: 0, issue: null, term: null, rate: 0.03, cover: 0 }
      ],
      financingSource: "",
      history: [],
      versions: []
    };
  }

  function zeros(n) { var a = []; for (var i = 0; i < n; i++) a.push(0); return a; }
  function sum(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s; }
  function smooth(x) { return 3 * x * x - 2 * x * x * x; }

  /** Доли выполнения по месяцам проекта (индекс 0 = месяц 1). */
  function scheduleShares(p) {
    var s = zeros(N), T = p.term, m;
    if (p.schedule.profile === "manual") {
      for (m = 0; m < N; m++) s[m] = Number(p.schedule.manual[m] || 0);
    } else if (p.schedule.profile === "uniform") {
      for (m = 1; m <= N; m++) s[m - 1] = m <= T ? 1 / T : 0;
    } else {
      for (m = 1; m <= N; m++) s[m - 1] = m <= T ? smooth(m / T) - smooth((m - 1) / T) : 0;
    }
    return s;
  }

  function advanceAmount(p, vat) {
    var C = p.contract, rev = C / (1 + vat), a = p.adv;
    switch (a.base) {
      case "contractNet": return rev * a.pct;
      case "year": return a.yearAmount * a.pct;
      case "fixed": return a.fixed;
      default: return C * a.pct;
    }
  }

  /**
   * Полный расчёт проекта.
   * @param p      проект
   * @param P      параметры компании
   * @param scen   ключ сценария: "base" | "pess" | "opt"
   */
  function calc(p, P, scen) {
    P = P || defaultParams();
    var sc = P.scenarios[scen || "base"];
    var VAT = P.vat, T = p.term, C = p.contract, rev = C / (1 + VAT);
    var s = scheduleShares(p);
    var tc = T;
    if (p.schedule.profile === "manual") {
      tc = 0;
      for (var q = 0; q < N; q++) if (s[q] > 0) tc = q + 1;
    }
    var adv = advanceAmount(p, VAT);
    var advShare = C ? adv / C : 0;
    var offPct = p.offset.mode === "prop" ? advShare : p.offset.pct;

    // себестоимость со сценарием
    var costs = p.costs.map(function (c) {
      return rev * c.pct * (1 + sc.over) * (1 + c.fx * sc.fx);
    });
    var direct = sum(costs);
    var vatable = 0;
    p.costs.forEach(function (c, i) { if (c.vat) vatable += costs[i]; });
    var overhead = rev * p.overhead.pct;

    // банковские гарантии
    var bg = p.bg.map(function (g) {
      var amount = 0;
      if (g.req) {
        if (g.base === "advance") amount = adv * g.pct;
        else if (g.base === "contractVat") amount = C * g.pct;
        else if (g.base === "contractNet") amount = rev * g.pct;
        else amount = g.manual;
      }
      var issue = g.issue, term = g.term;
      if (issue === null || issue === undefined || issue === "") issue = g.type === "advance" ? p.adv.month : (g.type === "perf" ? 1 : tc + 1);
      if (term === null || term === undefined || term === "") term = g.type === "advance" ? tc : (g.type === "perf" ? tc + 1 : 12);
      issue = Number(issue); term = Number(term);
      return { type: g.type, amount: amount, issue: issue, term: term, fee: amount * g.rate * term / 12, cover: amount * g.cover };
    });
    var bgCost = sum(bg.map(function (b) { return b.fee; }));

    // помесячный денежный поток
    var M = {};
    ["acts", "rev", "advIn", "offset", "advBal", "ret", "due", "pay", "retReturn", "receipts", "ohCash", "bgFee", "bgFeeAccr",
      "bgCover", "vatOut", "vatIn", "vatM", "vatQ", "vatPay", "supPay", "outPre", "netPre", "cumPre", "interest", "kpnCash", "net", "cum", "calMonth"]
      .forEach(function (k) { M[k] = zeros(N); });
    M.costNet = costs.map(function () { return zeros(N); });
    M.costVat = costs.map(function () { return zeros(N); });
    M.costPay = costs.map(function () { return zeros(N); });

    var L = p.payLag + sc.delay;
    var bal = 0, m, i;
    for (m = 1; m <= N; m++) {
      var k = m - 1;
      M.calMonth[k] = ((p.startMonth + m - 2) % 12) + 1;
      M.acts[k] = C * s[k];
      M.rev[k] = rev * s[k];
      M.advIn[k] = m === p.adv.month ? adv : 0;
      M.offset[k] = Math.min(M.acts[k] * offPct, bal + M.advIn[k]);
      bal = bal + M.advIn[k] - M.offset[k];
      M.advBal[k] = bal;
      M.ret[k] = M.acts[k] * p.retention.pct;
      M.due[k] = M.acts[k] - M.offset[k] - M.ret[k];
    }
    var retTotal = sum(M.ret);
    for (m = 1; m <= N; m++) {
      k = m - 1;
      M.pay[k] = m - L >= 1 ? M.due[m - L - 1] : 0;
      M.retReturn[k] = m === tc + p.retention.returnLag ? retTotal : 0;
      M.receipts[k] = M.advIn[k] + M.pay[k] + M.retReturn[k];
    }
    for (i = 0; i < costs.length; i++) {
      var c = p.costs[i];
      for (m = 1; m <= N; m++) {
        M.costNet[i][m - 1] = costs[i] * s[m - 1];
        M.costVat[i][m - 1] = costs[i] * (1 + VAT * (c.vat ? 1 : 0)) * s[m - 1];
      }
      for (m = 1; m <= N; m++) {
        var pre = 0, j;
        if (m === 1) { for (j = 1; j <= 1 + c.lead && j <= N; j++) pre += M.costVat[i][j - 1]; }
        else if (m + c.lead <= N) pre = M.costVat[i][m + c.lead - 1];
        var rest = m - c.lag >= 1 ? M.costVat[i][m - c.lag - 1] : 0;
        M.costPay[i][m - 1] = c.prepay * pre + (1 - c.prepay) * rest;
      }
    }
    for (m = 1; m <= N; m++) {
      k = m - 1;
      M.ohCash[k] = overhead * (1 + VAT * p.overhead.vatShare) * s[k];
      bg.forEach(function (b) {
        if (m === b.issue) { M.bgFee[k] += b.fee; M.bgCover[k] += b.cover; }
        if (m === b.issue + b.term) M.bgCover[k] -= b.cover;
        if (m >= b.issue && m < b.issue + b.term && b.term > 0) M.bgFeeAccr[k] += b.fee / b.term;
      });
      M.vatOut[k] = M.acts[k] * VAT / (1 + VAT);
      M.vatIn[k] = (vatable + overhead * p.overhead.vatShare) * VAT * s[k];
      M.vatM[k] = M.vatOut[k] - M.vatIn[k];
      M.supPay[k] = 0;
      for (i = 0; i < costs.length; i++) M.supPay[k] += M.costPay[i][k];
    }
    for (m = 1; m <= N; m++) {
      k = m - 1;
      if (M.calMonth[k] % 3 === 0) {
        var q2 = 0;
        for (j = Math.max(1, m - 2); j <= m; j++) q2 += M.vatM[j - 1];
        if (m > 3) q2 += Math.min(0, M.vatQ[m - 4]);
        M.vatQ[k] = q2;
      }
    }
    for (m = 1; m <= N; m++) {
      k = m - 1;
      var src = m - P.vatLag;
      M.vatPay[k] = (src >= 1 && M.calMonth[src - 1] % 3 === 0) ? Math.max(0, M.vatQ[src - 1]) : 0;
      M.outPre[k] = M.supPay[k] + M.ohCash[k] + M.bgFee[k] + M.bgCover[k] + M.vatPay[k];
      M.netPre[k] = M.receipts[k] - M.outPre[k];
      M.cumPre[k] = (k ? M.cumPre[k - 1] : 0) + M.netPre[k];
      M.interest[k] = Math.max(0, -M.cumPre[k]) * P.finRate / 12;
    }

    var margin = rev - direct;
    var ebitda = margin - overhead;
    var ebit = ebitda - p.amort;
    var interest = sum(M.interest);
    var pbt = ebit - bgCost - interest;
    var kpn = Math.max(0, pbt) * P.kpn;
    var np = pbt - kpn;

    var minCum = 0, minAt = 0;
    for (m = 1; m <= N; m++) {
      k = m - 1;
      M.kpnCash[k] = m === tc ? kpn : 0;
      M.net[k] = M.netPre[k] - M.interest[k] - M.kpnCash[k];
      M.cum[k] = (k ? M.cum[k - 1] : 0) + M.net[k];
      if (M.cum[k] < minCum) { minCum = M.cum[k]; minAt = m; }
    }
    var need = Math.max(0, -minCum);
    var r = Math.pow(1 + P.disc, 1 / 12) - 1, npv = 0;
    for (m = 1; m <= N; m++) npv += M.net[m - 1] / Math.pow(1 + r, m);

    var netMargin = rev ? np / rev : 0;
    var allowable = direct ? (pbt - P.thr * rev / (1 - P.kpn)) / direct : 0;
    var schedSum = sum(s);
    var maxLag = Math.max.apply(null, p.costs.map(function (c) { return c.lag; }));
    var horizonEnd = Math.max(tc + p.payLag + sc.delay + maxLag, tc + p.retention.returnLag,
      Math.max.apply(null, bg.map(function (b) { return b.issue + b.term; }))) + P.vatLag + 3;

    var checks = [];
    if (C > 0 && Math.abs(schedSum - 1) > 1e-4) checks.push("Сумма долей графика не равна 100%");
    if (horizonEnd > N) checks.push("Срок проекта с отсрочками превышает горизонт 36 мес.");
    if (Math.abs(M.advBal[N - 1]) > 1) checks.push("Аванс не зачтён полностью к концу горизонта");

    var verdict = (netMargin >= P.thr ? "ПРИНЯТЬ" : "НА ДОРАБОТКУ / ПЕРЕСМОТР") + (need > 0 ? " (обеспечить финансирование разрыва)" : "");

    return {
      scenario: scen || "base", shares: s, tc: tc, revenue: rev, advance: adv, advShare: advShare, offsetPct: offPct,
      costs: costs, direct: direct, vatable: vatable, margin: margin, marginPct: rev ? margin / rev : 0,
      overhead: overhead, ebitda: ebitda, ebit: ebit, bg: bg, bgCost: bgCost, interest: interest, pbt: pbt, kpn: kpn, np: np,
      netMargin: netMargin, vatPayTotal: sum(M.vatPay), need: need, needPct: C ? need / C : 0, maxMonth: need > 0 ? minAt : 0,
      npv: npv, allowable: allowable, holding: sum(costs.map(function (v, i2) { return v * p.costs[i2].holding; })),
      checks: checks, verdict: verdict, monthly: M
    };
  }

  /** Нужен ли Бюджетный комитет (п. 7.5 Регламента). */
  function committeeRequired(p, P) {
    var pess = calc(p, P, "pess");
    var reasons = [];
    if (pess.netMargin < P.thr) reasons.push("в пессимистичном сценарии чистая рентабельность ниже порога");
    if (pess.need > 0 && !String(p.financingSource || "").trim()) reasons.push("кассовый разрыв не обеспечен источником финансирования");
    return { required: reasons.length > 0, reasons: reasons, pess: pess };
  }

  /** Индекс месяца проекта (1..36) для календарного месяца бюджетного года; 0 – вне срока. */
  function projectMonth(p, budgetYear, j) {
    var idx = (budgetYear - p.startYear) * 12 + j - p.startMonth + 1;
    return idx >= 1 && idx <= N ? idx : 0;
  }

  /**
   * Данные проекта для бюджета (базовый сценарий, календарные месяцы бюджетного года).
   * Коды статей – по справочнику бюджетного файла (лист «Справочник статей»).
   */
  function budgetRows(p, P, budgetYear) {
    var R = calc(p, P, "base"), M = R.monthly, rows = [];
    function add(code, name, arrFn) {
      var vals = [];
      for (var j = 1; j <= 12; j++) {
        var idx = projectMonth(p, budgetYear, j);
        vals.push(idx ? arrFn(idx - 1) : 0);
      }
      rows.push({ code: code, name: name, months: vals, total: sum(vals) });
    }
    add(1100, "Выручка: поставка ТМЦ", function (k) { return M.rev[k] * p.tmcShare; });
    add(1200, "Выручка: СМР / услуги", function (k) { return M.rev[k] * (1 - p.tmcShare); });
    [2100, 2200, 2300, 2400].forEach(function (code, i) {
      add(code, COST_NAMES[i], function (k) { return M.costNet[i][k]; });
    });
    add(2500, "Банковские гарантии (комиссии)", function (k) { return M.bgFeeAccr[k]; });
    add(11010, "Авансы от заказчиков", function (k) { return M.advIn[k]; });
    add(11020, "Оплата заказчиками выполненных работ и поставок", function (k) { return M.pay[k]; });
    add(11030, "Возврат гарантийных удержаний", function (k) { return M.retReturn[k]; });
    add(11210, "Оплата поставщикам и субподрядчикам по проектам", function (k) { return M.supPay[k]; });
    add(11230, "Комиссии по банковским гарантиям", function (k) { return M.bgFee[k]; });
    add(11240, "Денежное покрытие банковских гарантий", function (k) { return M.bgCover[k]; });
    return rows;
  }

  var API = {
    N: N, COST_NAMES: COST_NAMES, defaultParams: defaultParams, defaultProject: defaultProject,
    scheduleShares: scheduleShares, calc: calc, committeeRequired: committeeRequired,
    projectMonth: projectMonth, budgetRows: budgetRows
  };
  root.FinEngine = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);

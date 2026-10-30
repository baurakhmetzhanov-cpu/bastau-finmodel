// Эталонные тесты: результаты расчётного ядра должны совпадать с Excel-моделью
// «Финмодель_проекта_типовая_v4.xlsx» (суммы в тыс. тенге, как в Excel). Запуск: node --test tests/
const test = require("node:test");
const assert = require("node:assert");
const E = require("../js/engine.js");
const golden = require("./golden.json");

function excelBase() {
  const P = E.defaultParams();
  const p = E.defaultProject(P);
  p.contract = 3000000; p.term = 12; p.startMonth = 1; p.amort = 6000;
  p.overhead = { pct: 0.06, vatShare: 0.30 };
  return { P, p };
}

function close(actual, expected, tol, label) {
  const ok = Math.abs(actual - expected) <= tol * Math.max(1, Math.abs(expected));
  assert.ok(ok, `${label}: получено ${actual}, ожидалось ${expected}`);
}

const KEYS = ["revenue", "direct", "margin", "overhead", "ebitda", "ebit", "bgCost", "need", "interest", "pbt", "kpn", "np",
  "netMargin", "vatPay", "npv", "allowable", "advance"];
const MAP = { vatPay: "vatPayTotal" };

function compare(R, G) {
  KEYS.forEach(k => close(R[MAP[k] || k], G[k], 1e-9, k));
  assert.strictEqual(R.maxMonth, G.maxMonth, "maxMonth");
  assert.strictEqual(R.tc, G.tc, "tc");
  G.cum.forEach((v, i) => close(R.monthly.cum[i], v, 1e-9, `накопленный остаток, мес. ${i + 1}`));
  G.receipts.forEach((v, i) => close(R.monthly.receipts[i], v, 1e-9, `поступления, мес. ${i + 1}`));
}

test("Базовый пример Excel (S-кривая, аванс 30% от договора)", () => {
  const { P, p } = excelBase();
  compare(E.calc(p, P, "base"), golden.base);
});

test("Стресс-пример Excel (пессимистичный сценарий, аванс от суммы на год, 100% предоплата, покрытие гарантий, ручной график)", () => {
  const { P, p } = excelBase();
  p.adv.base = "year"; p.adv.yearAmount = 1000000;
  p.costs[0].prepay = 1.0; p.costs[0].lead = 2;
  p.bg[0].cover = 0.2; p.bg[1].cover = 0.2;
  p.schedule.profile = "manual";
  [0.05, 0.1, 0.1, 0.15, 0.15, 0.15, 0.1, 0.1, 0.05, 0.05].forEach((v, i) => (p.schedule.manual[i] = v));
  compare(E.calc(p, P, "pess"), golden.stress);
});

test("Выборка бюджетного года: переходящий проект", () => {
  const P = E.defaultParams();
  const p = E.defaultProject(P);
  p.contract = 1160000000; p.startYear = 2026; p.startMonth = 9; p.term = 12; p.tmcShare = 0.4;
  p.retention.pct = 0.05; p.adv.base = "contractVat";
  const rows = E.budgetRows(p, P, 2027);
  const rev = rows.filter(r => r.code === 1100 || r.code === 1200).reduce((a, r) => a + r.total, 0);
  // выручка 2027 = выручка × (1 − F(4/12)), F – S-кривая
  const F = x => 3 * x * x - 2 * x * x * x;
  close(rev, 1000000000 * (1 - F(4 / 12)), 1e-9, "выручка 2027");
  assert.strictEqual(E.projectMonth(p, 2027, 1), 5);
  // сверка с листом проекта бюджетного файла v4 (тот же пример): оплата актов и возврат удержаний в 2027 году
  const get = code => rows.find(r => r.code === code).total;
  close(get(11020), 636187500, 1e-9, "оплата актов 2027");
  close(get(11030), 58000000, 1e-9, "возврат удержаний 2027");
  close(get(2500), 7743000, 1e-9, "комиссии гарантий (начисление) 2027");
});

/*
 * Хранилище прототипа: данные лежат в браузере пользователя (localStorage).
 * В целевой системе (СЭД) заменяется серверным API – см. docs/ТЗ_СЭД_финансовая_модель.md, раздел 7.
 */
(function (root) {
  "use strict";
  var KEY = "bastau-finmodel-v1";
  var mem = null;

  var ROLES = {
    rp: "Руководитель проекта",
    peo: "ПЭО / экономист",
    fd: "Финансовый директор",
    gd: "Генеральный директор / Бюджетный комитет",
    tr: "Казначейство"
  };
  var USERS = {
    rp: ["Руководитель проекта А", "Руководитель проекта Б"],
    peo: ["Экономист ПЭО"],
    fd: ["Финансовый директор"],
    gd: ["Генеральный директор"],
    tr: ["Казначей"]
  };
  var STATUSES = {
    draft: "Черновик",
    review: "На проверке ПЭО",
    rework: "На доработке",
    fd: "На согласовании ФД",
    bk: "На рассмотрении БК",
    approved: "Утверждён",
    budget: "В бюджете",
    rejected: "Отклонён"
  };

  function sample(E) {
    var P = E.defaultParams();
    var a = E.defaultProject(P);
    a.id = "demo1"; a.name = "ЦОД (тестовый пример 1)"; a.customer = "Заказчик А (тест)"; a.contractNo = "№ 01-ТЕСТ";
    a.owner = USERS.rp[0]; a.status = "budget"; a.startYear = 2026; a.startMonth = 9; a.term = 12;
    a.contract = 1160000000; a.tmcShare = 0.4; a.retention.pct = 0.05; a.amort = 0;
    a.history.push({ ts: "2026-10-30T09:00:00", user: "Экономист ПЭО", role: "peo", action: "Включён в бюджет (тестовые данные)", from: "approved", to: "budget", comment: "" });
    var b = E.defaultProject(P);
    b.id = "demo2"; b.name = "Поставка и монтаж оборудования (тестовый пример 2)"; b.customer = "Заказчик Б (тест)"; b.contractNo = "№ 02-ТЕСТ";
    b.owner = USERS.rp[1]; b.status = "fd"; b.startYear = 2027; b.startMonth = 3; b.term = 10; b.contract = 580000000;
    b.schedule.profile = "uniform"; b.adv.base = "year"; b.adv.yearAmount = 400000000; b.costs[0].prepay = 1; b.costs[0].lead = 1;
    b.bg[0].cover = 0.1; b.bg[1].cover = 0.1; b.retention.pct = 0.05;
    b.history.push({ ts: "2026-10-30T09:30:00", user: USERS.rp[1], role: "rp", action: "Отправлен на проверку", from: "draft", to: "review", comment: "" });
    b.history.push({ ts: "2026-10-30T10:00:00", user: "Экономист ПЭО", role: "peo", action: "Передан финансовому директору", from: "review", to: "fd", comment: "Проверено, замечаний нет" });
    var c = E.defaultProject(P);
    c.id = "demo3"; c.name = "Тендер: инженерные системы (тестовый пример 3)"; c.customer = "Заказчик В (тест)";
    c.owner = USERS.rp[0]; c.status = "draft"; c.startYear = 2027; c.startMonth = 5; c.term = 8; c.contract = 350000000;
    c.costs[1].pct = 0.30;
    return { params: P, projects: [a, b, c] };
  }

  function load(E) {
    try {
      var raw = root.localStorage && root.localStorage.getItem(KEY);
      if (raw) {
        var d = JSON.parse(raw);
        if (d && d.params && d.projects) return d;
      }
    } catch (e) { /* хранилище недоступно – работаем в памяти */ }
    if (mem) return mem;
    return sample(E);
  }

  function save(data) {
    mem = data;
    try { root.localStorage && root.localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
  }

  function reset(E) {
    var d = sample(E);
    save(d);
    return d;
  }

  root.FinStore = { load: load, save: save, reset: reset, ROLES: ROLES, USERS: USERS, STATUSES: STATUSES };
})(typeof window !== "undefined" ? window : globalThis);

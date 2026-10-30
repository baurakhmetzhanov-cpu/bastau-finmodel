/* Интерфейс прототипа финансовой модели проекта. Без сборки и фреймворков: обычный JavaScript. */
(function () {
  "use strict";
  var E = window.FinEngine, ST = window.FinStore;
  var D = ST.load(E);
  var S = { role: "rp", user: ST.USERS.rp[0], view: "registry", id: null, tab: "contract", scen: "base", onlyBudget: true, filter: "all" };
  var charts = [];
  var app = document.getElementById("app");
  if (window.Chart) { Chart.defaults.animation = false; Chart.defaults.font.family = "Segoe UI, Calibri, Arial, sans-serif"; }

  var SCEN = { base: "Базовый", pess: "Пессимистичный", opt: "Оптимистичный" };
  var ADV_BASE = { contractVat: "% от договорной суммы с НДС", contractNet: "% от договорной суммы без НДС", year: "% от суммы на финансовый год", fixed: "Фиксированная сумма" };
  var OFFS = { prop: "Пропорционально актам", fixed: "Фиксированный % от акта" };
  var PROF = { uniform: "Равномерно", scurve: "S-кривая", manual: "Ручной график" };
  var BG_BASE = { advance: "Сумма аванса", contractVat: "Договор с НДС", contractNet: "Договор без НДС", manual: "Ручной ввод" };
  var BG_NAMES = { advance: "На возврат аванса", perf: "На исполнение договора", warranty: "На гарантийный период" };
  var MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];

  var TRANSITIONS = [
    { key: "submit", role: "rp", from: ["draft", "rework"], to: "review", label: "Отправить на проверку ПЭО", cls: "primary", owner: true },
    { key: "peo_ok", role: "peo", from: ["review"], to: "fd", label: "Передать финансовому директору", cls: "teal" },
    { key: "peo_back", role: "peo", from: ["review"], to: "rework", label: "Вернуть на доработку", cls: "danger" },
    { key: "fd_ok", role: "fd", from: ["fd"], to: "approved", label: "Утвердить", cls: "primary", noCommittee: true },
    { key: "fd_bk", role: "fd", from: ["fd"], to: "bk", label: "Вынести на Бюджетный комитет", cls: "gold" },
    { key: "fd_back", role: "fd", from: ["fd"], to: "rework", label: "Вернуть на доработку", cls: "danger" },
    { key: "bk_ok", role: "gd", from: ["bk"], to: "approved", label: "Утвердить (решение Бюджетного комитета)", cls: "primary" },
    { key: "bk_back", role: "gd", from: ["bk"], to: "rework", label: "Вернуть на доработку", cls: "danger" },
    { key: "bk_rej", role: "gd", from: ["bk"], to: "rejected", label: "Отклонить", cls: "danger" },
    { key: "to_budget", role: "peo", from: ["approved"], to: "budget", label: "Включить в бюджет", cls: "teal" },
    { key: "from_budget", role: "peo", from: ["budget"], to: "approved", label: "Исключить из бюджета", cls: "danger" },
    { key: "correct", role: "rp", from: ["approved", "budget"], to: "draft", label: "Начать корректировку (новая версия)", cls: "gold", owner: true }
  ];

  // ------------------------------------------------------------ утилиты
  var nf = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
  function fmt(n) { return (n === null || n === undefined || isNaN(n)) ? "" : nf.format(Math.round(n)); }
  function fmtPct(x, d) { if (x === null || x === undefined || isNaN(x)) return ""; return (x * 100).toFixed(d === undefined ? 1 : d).replace(".", ",") + "%"; }
  function parseNum(v) { if (v === null || v === undefined) return 0; var s = String(v).replace(/[\s  ]/g, "").replace(",", "."); var n = Number(s); return isNaN(n) ? 0 : n; }
  function esc(s) { return String(s === null || s === undefined ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function getPath(o, path) { return path.split(".").reduce(function (a, k) { return a === undefined || a === null ? undefined : a[k]; }, o); }
  function setPath(o, path, v) { var ks = path.split("."), last = ks.pop(); var t = ks.reduce(function (a, k) { return a[k]; }, o); t[last] = v; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function nowIso() { var d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19); }
  function save() { ST.save(D); }
  function toast(msg) { var t = document.getElementById("toast"); t.textContent = msg; t.classList.remove("hidden"); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.add("hidden"); }, 2600); }
  function proj(id) { return D.projects.filter(function (p) { return p.id === id; })[0]; }
  function calLabel(p, m) { var mm = p.startMonth + m - 1; var y = p.startYear + Math.floor((mm - 1) / 12); var mo = ((mm - 1) % 12) + 1; return (mo < 10 ? "0" : "") + mo + "." + y; }
  function badge(st) { return '<span class="badge st-' + st + '">' + esc(ST.STATUSES[st] || st) + "</span>"; }
  function destroyCharts() { charts.forEach(function (c) { try { c.destroy(); } catch (e) { /* */ } }); charts = []; }

  function visibleProjects() {
    return D.projects.filter(function (p) { return S.role !== "rp" || p.owner === S.user; });
  }
  function canEdit(p) { return S.role === "rp" && p.owner === S.user && (p.status === "draft" || p.status === "rework"); }
  function canEditParams() { return S.role === "peo" || S.role === "fd"; }

  // ------------------------------------------------------------ модальное окно
  var modalOk = null;
  function openModal(title, text, onOk, okLabel) {
    document.getElementById("modalTitle").textContent = title;
    document.getElementById("modalText").textContent = text || "";
    document.getElementById("modalComment").value = "";
    document.getElementById("modalOk").textContent = okLabel || "Подтвердить";
    modalOk = onOk;
    document.getElementById("modal").classList.remove("hidden");
  }
  function closeModal() { document.getElementById("modal").classList.add("hidden"); modalOk = null; }
  document.getElementById("modalCancel").onclick = closeModal;
  document.getElementById("modalOk").onclick = function () { var c = document.getElementById("modalComment").value; var f = modalOk; closeModal(); if (f) f(c); };

  // ------------------------------------------------------------ шапка
  var roleSel = document.getElementById("roleSel"), userSel = document.getElementById("userSel");
  roleSel.innerHTML = Object.keys(ST.ROLES).map(function (k) { return '<option value="' + k + '">' + esc(ST.ROLES[k]) + "</option>"; }).join("");
  function fillUsers() { userSel.innerHTML = ST.USERS[S.role].map(function (u) { return "<option>" + esc(u) + "</option>"; }).join(""); userSel.value = S.user; }
  roleSel.onchange = function () { S.role = roleSel.value; S.user = ST.USERS[S.role][0]; fillUsers(); if (S.view === "project" && !visibleProjects().some(function (p) { return p.id === S.id; })) S.view = "registry"; render(); };
  userSel.onchange = function () { S.user = userSel.value; if (S.view === "project" && !visibleProjects().some(function (p) { return p.id === S.id; })) S.view = "registry"; render(); };
  fillUsers();
  document.getElementById("nav").onclick = function (e) { var b = e.target.closest("button[data-view]"); if (!b) return; S.view = b.dataset.view; render(); };

  // ------------------------------------------------------------ поля ввода
  function field(p, label, path, type, opts, editable, hint) {
    var v = getPath(p, path), dis = editable ? "" : " disabled", inner;
    if (type === "select") {
      inner = '<select data-path="' + path + '" data-type="select"' + dis + ">" + Object.keys(opts).map(function (k) { return '<option value="' + k + '"' + (String(v) === k ? " selected" : "") + ">" + esc(opts[k]) + "</option>"; }).join("") + "</select>";
    } else {
      var shown = type === "pct" ? (v * 100).toString().replace(".", ",") : (type === "money" ? fmt(v) : esc(v));
      inner = '<input data-path="' + path + '" data-type="' + type + '" value="' + shown + '"' + dis + ">";
    }
    return '<label class="fld"><span>' + esc(label) + (type === "pct" ? ", %" : "") + "</span>" + inner + (hint ? '<span class="small muted">' + esc(hint) + "</span>" : "") + "</label>";
  }
  function calcField(label, value) { return '<div class="fld"><span>' + esc(label) + '</span><div class="calc">' + value + "</div></div>"; }

  app.addEventListener("change", function (e) {
    var el = e.target, path = el.dataset.path;
    if (!path) return;
    var t = el.dataset.type, v = el.value;
    var target = el.dataset.scope === "params" ? D.params : proj(S.id);
    if (!target) return;
    if (t === "pct") v = parseNum(v) / 100;
    else if (t === "money" || t === "num") v = parseNum(v);
    else if (t === "int") v = Math.round(parseNum(v));
    else if (t === "intnull") v = String(v).trim() === "" ? null : Math.round(parseNum(v));
    else if (t === "bool") v = v === "1";
    setPath(target, path, v);
    save();
    render();
  });

  // ------------------------------------------------------------ реестр
  function viewRegistry() {
    var list = visibleProjects().filter(function (p) { return S.filter === "all" || p.status === S.filter; });
    var html = '<h1>Реестр проектов</h1><p class="muted">' + (S.role === "rp" ? "Показаны ваши проекты. " : "Показаны все проекты. ") +
      "Суммы – тенге. Показатели – по базовому сценарию.</p>";
    html += '<div class="toolbar">';
    if (S.role === "rp") html += '<button class="btn primary" data-act="new">+ Новый проект</button>';
    html += '<label class="small muted">Статус <select id="flt">' + '<option value="all">Все</option>' + Object.keys(ST.STATUSES).map(function (k) { return '<option value="' + k + '"' + (S.filter === k ? " selected" : "") + ">" + ST.STATUSES[k] + "</option>"; }).join("") + "</select></label>";
    html += '<span style="flex:1"></span><button class="btn" data-act="exportJson">Экспорт данных (JSON)</button><button class="btn" data-act="importJson">Импорт данных (JSON)</button><button class="btn danger" data-act="reset">Тестовые данные</button></div>';
    html += '<div class="panel" style="padding:0;overflow-x:auto"><table class="data"><tr><th>Проект</th><th>Заказчик</th><th>Руководитель проекта</th><th>Начало</th><th class="num">Сумма договора</th><th class="num">Чистая рент.</th><th class="num">Кассовый разрыв</th><th>Маршрут</th><th>Статус</th><th class="num">Версия</th></tr>';
    if (!list.length) html += '<tr><td colspan="10" class="muted">Проектов нет.</td></tr>';
    list.forEach(function (p) {
      var R = E.calc(p, D.params, "base"), cr = E.committeeRequired(p, D.params);
      html += "<tr><td><span class=\"link\" data-open=\"" + p.id + "\">" + esc(p.name) + "</span></td><td>" + esc(p.customer) + "</td><td>" + esc(p.owner) + "</td><td>" +
        calLabel(p, 1) + '</td><td class="num">' + fmt(p.contract) + '</td><td class="num">' + fmtPct(R.netMargin) + '</td><td class="num">' + fmt(R.need) + "</td><td>" +
        (cr.required ? '<span class="badge st-bk">через БК</span>' : '<span class="badge st-approved">ФД</span>') + "</td><td>" + badge(p.status) + '</td><td class="num">' + p.version + "</td></tr>";
    });
    html += "</table></div>";
    html += '<input type="file" id="fileIn" accept=".json,application/json" class="hidden">';
    app.innerHTML = html;
    document.getElementById("flt").onchange = function (e) { S.filter = e.target.value; render(); };
    document.getElementById("fileIn").onchange = importJson;
  }

  // ------------------------------------------------------------ карточка проекта
  function viewProject() {
    var p = proj(S.id);
    if (!p) { S.view = "registry"; return viewRegistry(); }
    var ed = canEdit(p), cr = E.committeeRequired(p, D.params), R = E.calc(p, D.params, "base");
    var html = '<div class="toolbar"><span class="link" data-act="back">← Реестр проектов</span></div>';
    html += '<div class="row"><div class="grow"><h1>' + esc(p.name) + "</h1><div class=\"muted\">" + esc(p.customer || "заказчик не указан") + " · " + esc(p.owner) + " · версия " + p.version + "</div></div><div>" + badge(p.status) + "</div></div>";
    // действия
    var acts = TRANSITIONS.filter(function (t) { return t.role === S.role && t.from.indexOf(p.status) >= 0 && (!t.owner || p.owner === S.user); });
    html += '<div class="toolbar">';
    acts.forEach(function (t) {
      var dis = t.noCommittee && cr.required;
      html += '<button class="btn ' + t.cls + '" data-tr="' + t.key + '"' + (dis ? ' disabled title="Нужен Бюджетный комитет"' : "") + ">" + esc(t.label) + "</button>";
    });
    if (S.role === "rp" && p.owner === S.user && (p.status === "draft" || p.status === "rework")) html += '<button class="btn" data-act="dup">Копировать проект</button><button class="btn danger" data-act="del">Удалить</button>';
    if (!acts.length && !ed) html += '<span class="muted small">Просмотр. ' + (S.role === "rp" ? "Редактировать можно свои проекты в статусах «Черновик» и «На доработке»." : "Для вашей роли действий в этом статусе нет.") + "</span>";
    html += "</div>";
    var pending = ["draft", "rework", "review", "fd", "bk"].indexOf(p.status) >= 0;
    if (cr.required) html += '<div class="note' + (pending ? " warn" : "") + '">' + (pending ? "Требуется рассмотрение Бюджетного комитета: " : "Маршрут через Бюджетный комитет: ") + esc(cr.reasons.join("; ")) + ".</div>";
    var tabs = { contract: "1. Договор и оплата", schedule: "2. График", costs: "3. Себестоимость", bg: "4. Гарантии", result: "5. Результат", cash: "6. Денежный поток", scen: "7. Сценарии", history: "8. Журнал" };
    html += '<div class="tabs">' + Object.keys(tabs).map(function (k) { return '<button data-tab="' + k + '" class="' + (S.tab === k ? "active" : "") + '">' + tabs[k] + "</button>"; }).join("") + "</div>";
    html += '<div id="tabBody">' + ({ contract: tabContract, schedule: tabSchedule, costs: tabCosts, bg: tabBg, result: tabResult, cash: tabCash, scen: tabScen, history: tabHistory }[S.tab])(p, ed, R, cr) + "</div>";
    app.innerHTML = html;
    afterProject(p);
  }

  function tabContract(p, ed, R) {
    var h = '<div class="panel"><h3>Договор</h3><div class="form">' +
      field(p, "Наименование проекта", "name", "text", null, ed) + field(p, "Заказчик", "customer", "text", null, ed) + field(p, "Договор №, дата", "contractNo", "text", null, ed) +
      field(p, "Год начала работ", "startYear", "int", null, ed) + field(p, "Месяц начала работ (1–12)", "startMonth", "int", null, ed) + field(p, "Срок выполнения работ, мес. (1–24)", "term", "int", null, ed) +
      field(p, "Договорная сумма с НДС, тенге", "contract", "money", null, ed) + calcField("Выручка без НДС", fmt(R.revenue)) + field(p, "Доля поставки ТМЦ в выручке", "tmcShare", "pct", null, ed, "остальное – СМР / услуги") +
      "</div></div>";
    h += '<div class="panel"><h3>Аванс от заказчика</h3><div class="form">' +
      field(p, "База расчёта аванса", "adv.base", "select", ADV_BASE, ed) + field(p, "Аванс, % от базы", "adv.pct", "pct", null, ed) +
      field(p, "Сумма на финансовый год, тенге", "adv.yearAmount", "money", null, ed) + field(p, "Фиксированная сумма аванса, тенге", "adv.fixed", "money", null, ed) +
      field(p, "Месяц получения аванса (от начала проекта)", "adv.month", "int", null, ed) + calcField("Аванс к поступлению", fmt(R.advance) + " (" + fmtPct(R.advShare) + " договора)") +
      field(p, "Порядок зачёта аванса", "offset.mode", "select", OFFS, ed) + field(p, "Зачёт аванса, % от акта (фиксированный порядок)", "offset.pct", "pct", null, ed) +
      calcField("Применяемый % зачёта", fmtPct(R.offsetPct)) + "</div></div>";
    h += '<div class="panel"><h3>Оплата актов и удержание</h3><div class="form">' +
      field(p, "Гарантийное удержание, % от акта", "retention.pct", "pct", null, ed) + field(p, "Возврат удержания, мес. после завершения работ", "retention.returnLag", "int", null, ed) +
      field(p, "Отсрочка оплаты актов заказчиком, мес.", "payLag", "int", null, ed) + "</div></div>";
    h += '<div class="panel"><h3>Накладные, амортизация, финансирование</h3><div class="form">' +
      field(p, "Накладные расходы компании, % от выручки", "overhead.pct", "pct", null, ed, "ставка накладных из утверждённого бюджета") +
      field(p, "Доля накладных, облагаемых НДС", "overhead.vatShare", "pct", null, ed) + field(p, "Амортизация собственной техники за срок, тенге", "amort", "money", null, ed) +
      field(p, "Источник покрытия кассового разрыва", "financingSource", "text", null, ed, "например: кредитная линия ForteBank, лимит …") + "</div></div>";
    return h;
  }

  function tabSchedule(p, ed, R) {
    var h = '<div class="panel"><div class="form">' + field(p, "Профиль графика выполнения", "schedule.profile", "select", PROF, ed) +
      calcField("Месяц завершения работ", R.tc) + calcField("Сумма долей", fmtPct(R.shares.reduce(function (a, b) { return a + b; }, 0), 2)) + "</div>";
    if (p.schedule.profile === "manual") {
      h += '<h3 style="margin-top:14px">Доля выполнения по месяцам, %</h3><div class="grid36">';
      for (var m = 0; m < E.N; m++) h += "<label>" + (m + 1) + " · " + calLabel(p, m + 1) + '<input data-path="schedule.manual.' + m + '" data-type="pct" value="' + (p.schedule.manual[m] * 100).toString().replace(".", ",") + '"' + (ed ? "" : " disabled") + "></label>";
      h += "</div>";
    } else h += '<p class="muted small">Для ввода долей по месяцам выберите «Ручной график».</p>';
    h += '</div><div class="chart-box"><canvas id="chShares"></canvas></div>';
    return h;
  }

  function tabCosts(p, ed, R) {
    var Rp = E.calc(p, D.params, "pess");
    var h = '<div class="panel" style="overflow-x:auto"><h3>Себестоимость (прямые затраты) и условия оплаты поставщикам</h3><table class="data"><tr><th>Статья</th><th class="num">% от выручки</th><th>НДС в цене</th><th class="num">Внутригрупп., %</th><th class="num">Аванс поставщику, %</th><th class="num">Аванс за, мес. до поставки</th><th class="num">Отсрочка остатка, мес.</th><th class="num">Валютная доля, %</th><th class="num">Сумма (базовый)</th><th class="num">Сумма (пессим.)</th></tr>';
    p.costs.forEach(function (c, i) {
      var d = ed ? "" : " disabled";
      function inp(path, type) { var v = getPath(p, path); return '<input data-path="' + path + '" data-type="' + type + '" value="' + (type === "pct" ? (v * 100).toString().replace(".", ",") : v) + '"' + d + ">"; }
      h += "<tr><td>" + esc(E.COST_NAMES[i]) + "</td><td>" + inp("costs." + i + ".pct", "pct") + '</td><td><select data-path="costs.' + i + '.vat" data-type="bool"' + d + '><option value="1"' + (c.vat ? " selected" : "") + '>Да</option><option value="0"' + (!c.vat ? " selected" : "") + ">Нет</option></select></td><td>" +
        inp("costs." + i + ".holding", "pct") + "</td><td>" + inp("costs." + i + ".prepay", "pct") + "</td><td>" + inp("costs." + i + ".lead", "int") + "</td><td>" + inp("costs." + i + ".lag", "int") + "</td><td>" + inp("costs." + i + ".fx", "pct") +
        '</td><td class="num">' + fmt(R.costs[i]) + '</td><td class="num">' + fmt(Rp.costs[i]) + "</td></tr>";
    });
    h += '<tr class="total"><td>Итого прямые затраты</td><td class="num">' + fmtPct(p.costs.reduce(function (a, c) { return a + c.pct; }, 0)) + '</td><td colspan="6"></td><td class="num">' + fmt(R.direct) + '</td><td class="num">' + fmt(Rp.direct) + "</td></tr></table>";
    h += '<p class="small muted">100% предоплата – аванс 100%; без аванса – 0%. Аванс за поставки первых месяцев отражается не ранее месяца начала работ. Валютная доля – часть закупки с ценой в иностранной валюте; в пессимистичном сценарии к ней применяется изменение курса.</p></div>';
    return h;
  }

  function tabBg(p, ed, R) {
    var d = ed ? "" : " disabled";
    var h = '<div class="panel" style="overflow-x:auto"><h3>Банковские гарантии</h3><table class="data"><tr><th>Параметр</th>' + p.bg.map(function (g) { return "<th>" + BG_NAMES[g.type] + "</th>"; }).join("") + "</tr>";
    function row(label, fn) { h += "<tr><td>" + label + "</td>" + p.bg.map(function (g, i) { return "<td>" + fn(g, i) + "</td>"; }).join("") + "</tr>"; }
    row("Требуется", function (g, i) { return '<select data-path="bg.' + i + '.req" data-type="bool"' + d + '><option value="1"' + (g.req ? " selected" : "") + '>Да</option><option value="0"' + (!g.req ? " selected" : "") + ">Нет</option></select>"; });
    row("База расчёта", function (g, i) { return '<select data-path="bg.' + i + '.base" data-type="select"' + d + ">" + Object.keys(BG_BASE).map(function (k) { return '<option value="' + k + '"' + (g.base === k ? " selected" : "") + ">" + BG_BASE[k] + "</option>"; }).join("") + "</select>"; });
    row("% от базы", function (g, i) { return '<input data-path="bg.' + i + '.pct" data-type="pct" value="' + (g.pct * 100).toString().replace(".", ",") + '"' + d + ">"; });
    row("Сумма при ручном вводе, тенге", function (g, i) { return '<input data-path="bg.' + i + '.manual" data-type="money" value="' + fmt(g.manual) + '"' + d + ">"; });
    row("Месяц выпуска (пусто – авто)", function (g, i) { return '<input data-path="bg.' + i + '.issue" data-type="intnull" placeholder="авто: ' + R.bg[i].issue + '" value="' + (g.issue === null ? "" : g.issue) + '"' + d + ">"; });
    row("Срок, мес. (пусто – авто)", function (g, i) { return '<input data-path="bg.' + i + '.term" data-type="intnull" placeholder="авто: ' + R.bg[i].term + '" value="' + (g.term === null ? "" : g.term) + '"' + d + ">"; });
    row("Комиссия банка, % годовых", function (g, i) { return '<input data-path="bg.' + i + '.rate" data-type="pct" value="' + (g.rate * 100).toString().replace(".", ",") + '"' + d + ">"; });
    row("Денежное покрытие, % от суммы", function (g, i) { return '<input data-path="bg.' + i + '.cover" data-type="pct" value="' + (g.cover * 100).toString().replace(".", ",") + '"' + d + ">"; });
    h += '<tr class="sub"><td>Сумма гарантии</td>' + R.bg.map(function (b) { return '<td class="num">' + fmt(b.amount) + "</td>"; }).join("") + "</tr>";
    h += '<tr class="sub"><td>Комиссия за срок</td>' + R.bg.map(function (b) { return '<td class="num">' + fmt(b.fee) + "</td>"; }).join("") + "</tr>";
    h += '<tr class="sub"><td>Денежное покрытие (блокируется)</td>' + R.bg.map(function (b) { return '<td class="num">' + fmt(b.cover) + "</td>"; }).join("") + "</tr></table>";
    h += '<p class="small muted">Гарантия на возврат аванса и гарантия исполнения – разные документы и суммы. По умолчанию: гарантия на аванс выпускается в месяц аванса и действует до завершения работ; гарантия исполнения – с начала работ на срок работ + 1 мес.; гарантия на гарантийный период – после сдачи на 12 мес.</p></div>';
    return h;
  }

  function scenSel() {
    return '<label class="small muted">Сценарий <select id="scenSel">' + Object.keys(SCEN).map(function (k) { return '<option value="' + k + '"' + (S.scen === k ? " selected" : "") + ">" + SCEN[k] + "</option>"; }).join("") + "</select></label>";
  }

  function tabResult(p, ed, R0, cr) {
    var R = E.calc(p, D.params, S.scen);
    var ok = R.netMargin >= D.params.thr;
    var h = '<div class="toolbar">' + scenSel() + "</div>";
    h += '<div class="verdict ' + (ok ? "ok" : "bad") + '">Вердикт (' + SCEN[S.scen].toLowerCase() + " сценарий): " + esc(R.verdict) + "</div>";
    R.checks.forEach(function (c) { h += '<div class="note warn">' + esc(c) + "</div>"; });
    function k(l, v, cls) { return '<div class="kpi ' + (cls || "") + '"><div class="l">' + l + '</div><div class="v">' + v + "</div></div>"; }
    h += '<div class="kpis">' + k("Выручка без НДС", fmt(R.revenue)) + k("Маржинальная прибыль", fmt(R.margin) + " · " + fmtPct(R.marginPct)) + k("EBITDA проекта", fmt(R.ebitda)) +
      k("Чистая прибыль", fmt(R.np), R.np < 0 ? "warn" : "") + k("Чистая рентабельность", fmtPct(R.netMargin), ok ? "good" : "warn") + k("NPV денежного потока", fmt(R.npv), R.npv < 0 ? "warn" : "") +
      k("Потребность в финансировании", fmt(R.need), R.need > 0 ? "warn" : "good") + k("Месяц максимального разрыва", R.maxMonth ? R.maxMonth + " (" + calLabel(p, R.maxMonth) + ")" : "нет разрыва") +
      k("НДС к уплате за проект", fmt(R.vatPayTotal)) + k("Допустимое удорожание затрат", fmtPct(R.allowable)) + "</div>";
    h += '<div class="row"><div class="grow panel"><h3>Финансовый результат проекта</h3><table class="data">';
    [["Выручка без НДС", R.revenue], ["(−) Прямые затраты", R.direct], ["Маржинальная прибыль", R.margin, 1], ["(−) Накладные", R.overhead], ["EBITDA", R.ebitda, 1], ["(−) Амортизация", p.amort],
      ["Операционная прибыль (EBIT)", R.ebit, 1], ["(−) Банковские гарантии", R.bgCost], ["(−) Проценты по финансированию разрыва", R.interest], ["Прибыль до налога", R.pbt, 1], ["(−) КПН", R.kpn], ["Чистая прибыль", R.np, 1]]
      .forEach(function (r) { h += "<tr" + (r[2] ? ' class="sub"' : "") + "><td>" + r[0] + '</td><td class="num">' + fmt(r[1]) + "</td></tr>"; });
    h += '</table></div><div class="grow"><div class="chart-box"><canvas id="chCum"></canvas></div><div class="note">Маршрут: ' + (cr.required ? "нужен Бюджетный комитет (" + esc(cr.reasons.join("; ")) + ")" : "утверждает финансовый директор") +
      ". Справочно: внутригрупповые закупки " + fmt(R.holding) + " тенге.</div></div></div>";
    return h;
  }

  function tabCash(p, ed) {
    var R = E.calc(p, D.params, S.scen), M = R.monthly;
    var rows = [["Акты выполненных работ (с НДС)", M.acts], ["Аванс от заказчика", M.advIn], ["Оплата актов заказчиком", M.pay], ["Возврат удержаний", M.retReturn], ["ИТОГО ПОСТУПЛЕНИЯ", M.receipts, 1],
      ["Оплата поставщикам и субподрядчикам", M.supPay], ["Накладные (с НДС)", M.ohCash], ["Комиссии по гарантиям", M.bgFee], ["Денежное покрытие гарантий", M.bgCover], ["НДС к уплате", M.vatPay],
      ["Проценты по разрыву", M.interest], ["КПН", M.kpnCash], ["ЧИСТЫЙ ПОТОК", M.net, 1], ["НАКОПЛЕННЫЙ ОСТАТОК", M.cum, 1]];
    var last = 0; for (var m = 0; m < E.N; m++) if (Math.abs(M.receipts[m]) + Math.abs(M.supPay[m]) + Math.abs(M.vatPay[m]) + Math.abs(M.bgCover[m]) > 0.5) last = m;
    var n = Math.min(E.N, last + 2);
    var h = '<div class="toolbar">' + scenSel() + '<span class="small muted">Тенге, с НДС. Показаны месяцы с движением денег.</span></div><div class="scroll"><table class="data"><tr><th>Показатель / месяц проекта</th><th class="num">Итого</th>';
    for (m = 0; m < n; m++) h += '<th class="num">' + (m + 1) + "<br>" + calLabel(p, m + 1) + "</th>";
    h += "</tr>";
    rows.forEach(function (r) {
      var tot = r[0] === "НАКОПЛЕННЫЙ ОСТАТОК" ? r[1][E.N - 1] : r[1].reduce(function (a, b) { return a + b; }, 0);
      h += "<tr" + (r[2] ? ' class="sub"' : "") + "><td>" + r[0] + '</td><td class="num">' + fmt(tot) + "</td>";
      for (m = 0; m < n; m++) h += '<td class="num"' + (r[0] === "НАКОПЛЕННЫЙ ОСТАТОК" && r[1][m] < 0 ? ' style="color:var(--red)"' : "") + ">" + fmt(r[1][m]) + "</td>";
      h += "</tr>";
    });
    return h + "</table></div>";
  }

  function tabScen(p) {
    var rs = Object.keys(SCEN).map(function (k) { return E.calc(p, D.params, k); });
    var h = '<div class="panel" style="overflow-x:auto"><h3>Сравнение сценариев</h3><table class="data"><tr><th>Показатель</th>' + Object.keys(SCEN).map(function (k) { return '<th class="num">' + SCEN[k] + "</th>"; }).join("") + "</tr>";
    [["Удорожание прямых затрат", function (r, k) { return fmtPct(D.params.scenarios[k].over); }], ["Изменение курса", function (r, k) { return fmtPct(D.params.scenarios[k].fx); }],
      ["Доп. задержка оплаты, мес.", function (r, k) { return D.params.scenarios[k].delay; }], ["Прямые затраты", function (r) { return fmt(r.direct); }],
      ["Маржинальная прибыль", function (r) { return fmt(r.margin); }], ["Чистая прибыль", function (r) { return fmt(r.np); }], ["Чистая рентабельность", function (r) { return fmtPct(r.netMargin); }],
      ["NPV", function (r) { return fmt(r.npv); }], ["Потребность в финансировании", function (r) { return fmt(r.need); }], ["Проценты по разрыву", function (r) { return fmt(r.interest); }],
      ["Вердикт", function (r) { return esc(r.verdict); }]].forEach(function (row) {
      h += "<tr><td>" + row[0] + "</td>" + rs.map(function (r, i) { return '<td class="num">' + row[1](r, Object.keys(SCEN)[i]) + "</td>"; }).join("") + "</tr>";
    });
    return h + '</table><p class="small muted">Драйверы сценариев задаются на странице «Параметры».</p></div>';
  }

  function tabHistory(p) {
    var h = '<div class="row"><div class="grow panel"><h3>Журнал согласования</h3><ul class="hist">';
    if (!p.history.length) h += '<li class="muted">Записей нет.</li>';
    p.history.slice().reverse().forEach(function (e) {
      h += "<li><b>" + esc(e.action) + "</b> · " + esc(e.ts.replace("T", " ")) + "<br><span class=\"small muted\">" + esc(e.user) + " (" + esc(ST.ROLES[e.role] || e.role) + ")" + (e.from ? " · " + esc(ST.STATUSES[e.from] || e.from) + " → " + esc(ST.STATUSES[e.to] || e.to) : "") + "</span>" + (e.comment ? "<br>" + esc(e.comment) : "") + "</li>";
    });
    h += '</ul></div><div class="grow panel"><h3>Версии</h3>';
    if (!p.versions.length) h += '<p class="muted">Предыдущих версий нет.</p>';
    else h += '<table class="data"><tr><th>Версия</th><th>Сохранена</th><th class="num">Чистая рент.</th><th class="num">Разрыв</th></tr>' + p.versions.map(function (v) {
      var R = E.calc(v.data, D.params, "base");
      return "<tr><td>" + v.version + "</td><td>" + esc(v.ts.replace("T", " ")) + '</td><td class="num">' + fmtPct(R.netMargin) + '</td><td class="num">' + fmt(R.need) + "</td></tr>";
    }).join("") + "</table>";
    if (p.approved) h += '<p class="small muted">Утверждённая версия: ' + p.approved.version + " от " + esc(p.approved.ts.replace("T", " ")) + ".</p>";
    return h + "</div></div>";
  }

  function afterProject(p) {
    var ss = document.getElementById("scenSel");
    if (ss) ss.onchange = function () { S.scen = ss.value; render(); };
    if (!window.Chart) return;
    var cS = document.getElementById("chShares");
    if (cS) {
      var R = E.calc(p, D.params, "base"), n = Math.max(R.tc, 1), lab = [], dat = [];
      for (var m = 1; m <= Math.min(E.N, n + 2); m++) { lab.push(calLabel(p, m)); dat.push(+(R.shares[m - 1] * 100).toFixed(2)); }
      charts.push(new Chart(cS, { type: "bar", data: { labels: lab, datasets: [{ label: "Доля выполнения, %", data: dat, backgroundColor: "#2C4A80" }] }, options: { maintainAspectRatio: false, plugins: { legend: { display: false } } } }));
    }
    var cC = document.getElementById("chCum");
    if (cC) {
      var b = E.calc(p, D.params, "base"), s = E.calc(p, D.params, S.scen === "base" ? "pess" : S.scen), lb = [];
      for (var k = 1; k <= E.N; k++) lb.push(k);
      charts.push(new Chart(cC, {
        type: "line", data: { labels: lb, datasets: [
          { label: "Накопленный остаток – базовый", data: b.monthly.cum.map(Math.round), borderColor: "#1F3864", pointRadius: 0, tension: .2 },
          { label: "Накопленный остаток – " + SCEN[s.scenario].toLowerCase(), data: s.monthly.cum.map(Math.round), borderColor: "#C00000", borderDash: [5, 4], pointRadius: 0, tension: .2 }] },
        options: { maintainAspectRatio: false, scales: { x: { title: { display: true, text: "месяц проекта" } }, y: { ticks: { callback: function (v) { return fmt(v / 1e6) + " млн"; } } } } }
      }));
    }
  }

  // ------------------------------------------------------------ портфель и бюджет
  function portfolioRows() {
    var by = D.params.budgetYear;
    return visibleProjects().filter(function (p) { return S.onlyBudget ? p.status === "budget" : (p.status === "budget" || p.status === "approved"); })
      .map(function (p) { return { p: p, rows: E.budgetRows(p, D.params, by) }; });
  }
  function sumCodes(rows, codes, j) { return rows.filter(function (r) { return codes.indexOf(r.code) >= 0; }).reduce(function (a, r) { return a + (j === undefined ? r.total : r.months[j]); }, 0); }
  var REV = [1100, 1200], COST = [2100, 2200, 2300, 2400, 2500], IN = [11010, 11020, 11030], OUT = [11210, 11230, 11240];

  function viewPortfolio() {
    var pr = portfolioRows(), by = D.params.budgetYear;
    var h = "<h1>Портфель и бюджет " + by + " года</h1><p class=\"muted\">Утверждённые проекты в календарных месяцах бюджетного года (базовый сценарий, тенге). Административные расходы, ФОТ АУП, налоги и CAPEX ведутся в бюджетном файле.</p>";
    h += '<div class="toolbar"><label class="small muted"><input type="checkbox" id="onlyB"' + (S.onlyBudget ? " checked" : "") + '> только «В бюджете» (иначе также «Утверждён»)</label><span style="flex:1"></span>' +
      ((S.role === "peo" || S.role === "fd") ? '<button class="btn primary" data-act="exportXlsx">Выгрузить в бюджет (Excel)</button>' : "") + "</div>";
    h += '<div class="panel" style="padding:0;overflow-x:auto"><table class="data"><tr><th>Проект</th><th>Статус</th><th class="num">Выручка</th><th class="num">Себестоимость</th><th class="num">Маржа</th><th class="num">Маржа, %</th><th class="num">Поступления</th><th class="num">Выплаты по проекту</th><th class="num">Чистый поток</th></tr>';
    var T = { rev: 0, cost: 0, inn: 0, out: 0 };
    pr.forEach(function (x) {
      var rev = sumCodes(x.rows, REV), cost = sumCodes(x.rows, COST), inn = sumCodes(x.rows, IN), out = sumCodes(x.rows, OUT);
      T.rev += rev; T.cost += cost; T.inn += inn; T.out += out;
      h += '<tr><td><span class="link" data-open="' + x.p.id + '">' + esc(x.p.name) + "</span></td><td>" + badge(x.p.status) + '</td><td class="num">' + fmt(rev) + '</td><td class="num">' + fmt(cost) + '</td><td class="num">' + fmt(rev - cost) +
        '</td><td class="num">' + fmtPct(rev ? (rev - cost) / rev : 0) + '</td><td class="num">' + fmt(inn) + '</td><td class="num">' + fmt(out) + '</td><td class="num">' + fmt(inn - out) + "</td></tr>";
    });
    if (!pr.length) h += '<tr><td colspan="9" class="muted">Нет проектов в выбранных статусах.</td></tr>';
    h += '<tr class="total"><td>Итого</td><td></td><td class="num">' + fmt(T.rev) + '</td><td class="num">' + fmt(T.cost) + '</td><td class="num">' + fmt(T.rev - T.cost) + '</td><td class="num">' + fmtPct(T.rev ? (T.rev - T.cost) / T.rev : 0) +
      '</td><td class="num">' + fmt(T.inn) + '</td><td class="num">' + fmt(T.out) + '</td><td class="num">' + fmt(T.inn - T.out) + "</td></tr></table></div>";
    h += '<div class="chart-box"><canvas id="chPort"></canvas></div>';
    h += '<div class="note">Выгрузка формирует файл с листом «Импорт проектов»: проект, код статьи по справочнику бюджетного файла, месяц, сумма. Этот же формат – основа обмена с СЭД и 1С (см. ТЗ, раздел 7).</div>';
    app.innerHTML = h;
    document.getElementById("onlyB").onchange = function (e) { S.onlyBudget = e.target.checked; render(); };
    if (window.Chart) {
      var rev = [], net = [], cum = [], c = 0;
      for (var j = 0; j < 12; j++) {
        var r = 0, n = 0;
        pr.forEach(function (x) { r += sumCodes(x.rows, REV, j); n += sumCodes(x.rows, IN, j) - sumCodes(x.rows, OUT, j); });
        rev.push(Math.round(r)); net.push(Math.round(n)); c += n; cum.push(Math.round(c));
      }
      charts.push(new Chart(document.getElementById("chPort"), {
        data: { labels: MONTHS, datasets: [
          { type: "bar", label: "Выручка без НДС", data: rev, backgroundColor: "#9DB4DA" },
          { type: "bar", label: "Чистый поток проектов", data: net, backgroundColor: "#2A8C82" },
          { type: "line", label: "Накопленный поток проектов", data: cum, borderColor: "#C8963E", pointRadius: 2 }] },
        options: { maintainAspectRatio: false, scales: { y: { ticks: { callback: function (v) { return fmt(v / 1e6) + " млн"; } } } } }
      }));
    }
  }

  function exportXlsx() {
    var pr = portfolioRows(), by = D.params.budgetYear, longRows = [["ID проекта", "Проект", "Версия", "Статус", "Код статьи", "Статья", "Год", "Месяц", "Сумма, тенге"]];
    var wide = [["Проект", "Код", "Статья"].concat(MONTHS).concat(["Итого"])];
    pr.forEach(function (x) {
      x.rows.forEach(function (r) {
        r.months.forEach(function (v, j) { if (Math.abs(v) > 0.005) longRows.push([x.p.id, x.p.name, x.p.version, ST.STATUSES[x.p.status], r.code, r.name, by, j + 1, Math.round(v * 100) / 100]); });
        wide.push([x.p.name, r.code, r.name].concat(r.months.map(function (v) { return Math.round(v); })).concat([Math.round(r.total)]));
      });
    });
    var name = "budget_import_" + by; // латиница: часть браузеров заменяет кириллические имена файлов
    if (window.XLSX) {
      var wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(longRows), "Импорт проектов");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(wide), "Свод по проектам");
      XLSX.writeFile(wb, name + ".xlsx");
    } else {
      download(name + ".csv", "﻿" + longRows.map(function (r) { return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(";"); }).join("\n"), "text/csv");
    }
    toast("Файл выгрузки сформирован");
  }

  function download(fname, content, type) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([content], { type: type }));
    a.download = fname; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function importJson(e) {
    var f = e.target.files[0]; if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      try {
        var d = JSON.parse(rd.result);
        if (!d.params || !Array.isArray(d.projects)) throw new Error("нет params / projects");
        openModal("Импорт данных", "Заменить текущие данные в браузере данными из файла «" + f.name + "» (" + d.projects.length + " проектов)?", function () { D = d; save(); render(); toast("Данные загружены"); }, "Заменить");
      } catch (err) { toast("Не удалось прочитать файл: " + err.message); }
    };
    rd.readAsText(f, "utf-8");
  }

  // ------------------------------------------------------------ параметры
  function viewParams() {
    var ed = canEditParams(), d = ed ? "" : " disabled", P = D.params;
    function f(label, path, type, hint) { return field(P, label, path, type, null, ed, hint).replace("data-path=", 'data-scope="params" data-path='); }
    var h = "<h1>Параметры</h1><p class=\"muted\">" + (ed ? "Изменения применяются ко всем проектам." : "Изменять параметры могут ПЭО и финансовый директор.") + "</p>";
    h += '<div class="panel"><h3>Ставки и оценка проектов</h3><div class="form">' + f("Бюджетный год", "budgetYear", "int") + f("Ставка НДС", "vat", "pct") + f("Ставка КПН", "kpn", "pct") +
      f("Порог чистой рентабельности", "thr", "pct") + f("Ставка финансирования разрыва, годовых", "finRate", "pct", "ориентир: базовая ставка НБРК 15,75% (23.10.2026) + маржа банка") +
      f("Ставка дисконтирования, годовых", "disc", "pct") + f("Уплата НДС, мес. после квартала", "vatLag", "int") + f("Ставка накладных по умолчанию", "overheadRate", "pct", "из утверждённого бюджета") + "</div></div>";
    h += '<div class="panel" style="overflow-x:auto"><h3>Сценарии</h3><table class="data"><tr><th>Драйвер</th><th>Базовый</th><th>Пессимистичный</th><th>Оптимистичный</th></tr>';
    [["Удорожание прямых затрат, %", "over", "pct"], ["Изменение курса валюты, %", "fx", "pct"], ["Доп. задержка оплаты актов, мес.", "delay", "int"]].forEach(function (r) {
      h += "<tr><td>" + r[0] + "</td>" + ["base", "pess", "opt"].map(function (k) {
        var v = P.scenarios[k][r[1]];
        return '<td><input data-scope="params" data-path="scenarios.' + k + "." + r[1] + '" data-type="' + r[2] + '" value="' + (r[2] === "pct" ? (v * 100).toString().replace(".", ",") : v) + '"' + d + "></td>";
      }).join("") + "</tr>";
    });
    h += "</table></div>";
    if (ed) h += '<button class="btn danger" data-act="paramsReset">Восстановить параметры по умолчанию</button>';
    app.innerHTML = h;
  }

  function viewAbout() {
    app.innerHTML = '<h1>О прототипе</h1><div class="panel"><p>Прототип финансовой модели проекта для ТОО «Bastau Project». Расчёт повторяет Excel-модель «Финмодель проекта v4»; совпадение подтверждено автоматическими тестами на эталонных примерах (папка <code>tests</code>).</p>' +
      "<h3>Что работает</h3><ul><li>Ввод условий договора, аванса, графика, себестоимости, условий оплаты поставщикам и банковских гарантий;</li><li>расчёт рентабельности, NPV, кассового разрыва, НДС, КПН в трёх сценариях;</li>" +
      "<li>маршрут согласования (руководитель проекта → ПЭО → финансовый директор → Бюджетный комитет) с журналом и версиями;</li><li>портфель утверждённых проектов и выгрузка в бюджет по кодам статей.</li></ul>" +
      "<h3>Ограничения прототипа</h3><ul><li>Роли переключаются вручную (демо-режим); в рабочей версии вход и права – через СЭД;</li><li>данные хранятся только в этом браузере; для передачи используйте экспорт и импорт JSON;</li>" +
      "<li>не используйте реальные коммерческие данные в публичной версии страницы.</li></ul><p>Требования к рабочей версии – в документе <code>docs/ТЗ_СЭД_финансовая_модель.md</code> репозитория.</p></div>";
  }

  // ------------------------------------------------------------ действия
  function doTransition(p, t) {
    var cr = E.committeeRequired(p, D.params);
    if (t.noCommittee && cr.required) { toast("Нужно вынести на Бюджетный комитет"); return; }
    if (t.key === "submit") {
      var miss = [];
      if (!String(p.name).trim()) miss.push("наименование");
      if (!String(p.customer || "").trim()) miss.push("заказчик");
      if (!(p.contract > 0)) miss.push("сумма договора");
      var sh = E.scheduleShares(p).reduce(function (a, b) { return a + b; }, 0);
      if (Math.abs(sh - 1) > 0.0001) miss.push("сумма долей графика должна быть 100%");
      if (miss.length) { toast("Заполните: " + miss.join(", ")); return; }
    }
    var needComment = ["peo_back", "fd_back", "bk_back", "bk_rej", "from_budget"].indexOf(t.key) >= 0;
    openModal(t.label, "Проект «" + p.name + "»: " + ST.STATUSES[p.status] + " → " + ST.STATUSES[t.to] + "." + (needComment ? " Комментарий обязателен." : ""), function (comment) {
      if (needComment && !String(comment).trim()) { toast("Укажите комментарий"); return; }
      var from = p.status;
      if (t.key === "correct") {
        var snap = clone(p); delete snap.history; delete snap.versions;
        p.versions.push({ version: p.version, ts: nowIso(), data: snap });
        p.version += 1;
      }
      if (t.to === "approved" && (t.key === "fd_ok" || t.key === "bk_ok")) {
        var R = E.calc(p, D.params, "base");
        p.approved = { version: p.version, ts: nowIso(), netMargin: R.netMargin, need: R.need };
      }
      p.status = t.to;
      p.history.push({ ts: nowIso(), user: S.user, role: S.role, action: t.label, from: from, to: t.to, comment: comment || "" });
      save(); render(); toast("Статус: " + ST.STATUSES[t.to]);
    });
  }

  app.addEventListener("click", function (e) {
    var el = e.target.closest("[data-open],[data-act],[data-tab],[data-tr]");
    if (!el) return;
    if (el.dataset.open) { S.id = el.dataset.open; S.view = "project"; S.tab = "contract"; render(); window.scrollTo(0, 0); return; }
    if (el.dataset.tab) { S.tab = el.dataset.tab; render(); return; }
    var p = proj(S.id);
    if (el.dataset.tr && p) { doTransition(p, TRANSITIONS.filter(function (t) { return t.key === el.dataset.tr; })[0]); return; }
    switch (el.dataset.act) {
      case "back": S.view = "registry"; render(); break;
      case "new":
        var np = E.defaultProject(D.params); np.owner = S.user; np.overhead.pct = D.params.overheadRate;
        np.history.push({ ts: nowIso(), user: S.user, role: S.role, action: "Создан", from: "", to: "draft", comment: "" });
        D.projects.push(np); save(); S.id = np.id; S.view = "project"; S.tab = "contract"; render(); break;
      case "dup":
        var cp = clone(p); cp.id = E.defaultProject(D.params).id; cp.name = p.name + " (копия)"; cp.status = "draft"; cp.version = 1; cp.versions = []; cp.approved = null;
        cp.history = [{ ts: nowIso(), user: S.user, role: S.role, action: "Создан копированием", from: "", to: "draft", comment: "" }];
        D.projects.push(cp); save(); S.id = cp.id; render(); toast("Создана копия"); break;
      case "del":
        openModal("Удалить проект", "Проект «" + p.name + "» будет удалён из этого браузера.", function () { D.projects = D.projects.filter(function (x) { return x.id !== p.id; }); save(); S.view = "registry"; render(); }, "Удалить"); break;
      case "exportJson": download("finmodel_data_" + nowIso().slice(0, 10) + ".json", JSON.stringify(D, null, 1), "application/json"); break;
      case "importJson": document.getElementById("fileIn").click(); break;
      case "reset": openModal("Тестовые данные", "Заменить все данные в этом браузере тестовыми примерами?", function () { D = ST.reset(E); render(); }, "Заменить"); break;
      case "exportXlsx": exportXlsx(); break;
      case "paramsReset": openModal("Параметры по умолчанию", "Вернуть ставки и сценарии к значениям по умолчанию?", function () { D.params = E.defaultParams(); save(); render(); }, "Вернуть"); break;
    }
  });

  // ------------------------------------------------------------ рендер
  function render() {
    destroyCharts();
    roleSel.value = S.role;
    Array.prototype.forEach.call(document.querySelectorAll("#nav button"), function (b) { b.classList.toggle("active", b.dataset.view === S.view || (S.view === "project" && b.dataset.view === "registry")); });
    ({ registry: viewRegistry, project: viewProject, portfolio: viewPortfolio, params: viewParams, about: viewAbout }[S.view] || viewRegistry)();
  }
  render();
})();

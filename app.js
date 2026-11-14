'use strict';
/* 极简日历 · 所有事项只保存在浏览器 localStorage，不上传服务器。 */

var STORAGE_KEY = 'paperperf-calendar-events-v1';
var WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

var state = {
  viewYear: null, viewMonth: null, // 0-11
  view: 'month',
  selectedDate: null, // 'YYYY-MM-DD'
  editingId: null,
  yearView: new Date().getFullYear()
};

var events = loadEvents();

var SUMMARY_KEY = 'paperperf-calendar-day-summary-v1';
var summaries = loadSummaries();
function loadSummaries() {
  try {
    var raw = localStorage.getItem(SUMMARY_KEY);
    if (!raw) return {};
    var obj = JSON.parse(raw);
    return obj && typeof obj === 'object' ? obj : {};
  } catch (e) { return {}; }
}
function saveSummaries() {
  try { localStorage.setItem(SUMMARY_KEY, JSON.stringify(summaries)); } catch (e) { /* 存储空间不足时静默失败 */ }
}

var TODO_KEY = 'paperperf-calendar-todos-v1';
var todos = loadTodos();
function loadTodos() {
  try {
    var raw = localStorage.getItem(TODO_KEY);
    if (!raw) return [];
    var arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter(function (t) { return t && t.id && t.title; }).map(function (t) {
      return { id: t.id, title: t.title, date: t.date || '', urgency: t.urgency || 'normal',
        done: !!t.done, doneAt: t.doneAt || 0, createdAt: t.createdAt || 0 };
    });
  } catch (e) { return []; }
}
function saveTodos() {
  try { localStorage.setItem(TODO_KEY, JSON.stringify(todos)); } catch (e) { /* 存储空间不足时静默失败 */ }
}

var URGENCY = { urgent: '紧急', normal: '一般', low: '不急' };
var URGENCY_ORDER = ['urgent', 'normal', 'low'];
var TODO_FOLDER_KEY = 'paperperf-calendar-todo-folders-v1';
var todoFolders = loadTodoFolders();
function loadTodoFolders() {
  try {
    var raw = localStorage.getItem(TODO_FOLDER_KEY);
    if (!raw) return {};
    var obj = JSON.parse(raw);
    return obj && typeof obj === 'object' ? obj : {};
  } catch (e) { return {}; }
}
function saveTodoFolders() {
  try { localStorage.setItem(TODO_FOLDER_KEY, JSON.stringify(todoFolders)); } catch (e) {}
}

var todoFilter = 'all';
var editingTodoId = null;

var HABITS = [
  { key: 'water', name: '多喝水' },
  { key: 'sleep', name: '早睡' },
  { key: 'save', name: '攒钱' },
  { key: 'poop', name: '噗噗' }
];
var HABIT_KEYS = HABITS.map(function (h) { return h.key; });
var HABIT_KEY = 'paperperf-calendar-habits-v1';
var habitChecks = loadHabitChecks();
function loadHabitChecks() {
  try {
    var raw = localStorage.getItem(HABIT_KEY);
    if (!raw) return {};
    var obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object') return {};
    Object.keys(obj).forEach(function (ds) {
      if (!Array.isArray(obj[ds])) delete obj[ds];
      else obj[ds] = obj[ds].filter(function (k) { return HABIT_KEYS.indexOf(k) !== -1; });
    });
    return obj;
  } catch (e) { return {}; }
}
function saveHabitChecks() {
  try { localStorage.setItem(HABIT_KEY, JSON.stringify(habitChecks)); } catch (e) { /* 存储空间不足时静默失败 */ }
}
var habitFilter = 'all';
var habitEditorDate = null;

/* ---------------- 工具 ---------------- */
function pad(n) { return (n < 10 ? '0' : '') + n; }
function fmtDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function parseDate(s) {
  var p = s.split('-');
  return new Date(+p[0], +p[1] - 1, +p[2]);
}
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function uid() { return 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function loadEvents() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    var arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter(function (e) { return e && e.id && e.date && e.title; }) : [];
  } catch (e) { return []; }
}
function saveEvents() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(events)); } catch (e) { /* 存储空间不足时静默失败 */ }
}
function eventsOn(dateStr) {
  return events.filter(function (e) { return e.date === dateStr; }).sort(sortEvents);
}
function sortEvents(a, b) {
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  return (a.time || '').localeCompare(b.time || '');
}
/* ---------------- 农历 ---------------- */
function lunarOf(dateObj) {
  var solar = Solar.fromDate(dateObj);
  return { solar: solar, lunar: solar.getLunar() };
}
function lunarLabel(dateObj) {
  var l = lunarOf(dateObj).lunar;
  var s = lunarOf(dateObj).solar;
  var fests = l.getFestivals().concat(s.getFestivals());
  if (fests.length) return { text: fests[0], festival: true };
  if (l.getDayInChinese() === '初一') return { text: l.getMonthInChinese() + '月', festival: false };
  return { text: l.getDayInChinese(), festival: false };
}
function lunarFull(dateObj) {
  var l = lunarOf(dateObj).lunar;
  return '农历' + l.getYearInChinese() + l.getYearShengXiao() + '年 ' +
    l.getMonthInChinese() + '月' + l.getDayInChinese();
}

/* ---------------- 时钟 ---------------- */
function buildTicks() {
  var g = document.getElementById('ticks');
  var html = '';
  for (var i = 0; i < 12; i++) {
    var a = i * 30 * Math.PI / 180;
    var x1 = 60 + Math.sin(a) * 48, y1 = 60 - Math.cos(a) * 48;
    var x2 = 60 + Math.sin(a) * 52, y2 = 60 - Math.cos(a) * 52;
    html += '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) +
      '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) +
      '" stroke="#a6abd0" stroke-width="1.5" stroke-linecap="round"/>';
  }
  g.innerHTML = html;
}
function tickClock() {
  var now = new Date();
  var s = now.getSeconds(), m = now.getMinutes(), h = now.getHours() % 12;
  document.getElementById('clockTime').textContent =
    pad(now.getHours()) + ':' + pad(m) + ':' + pad(s);
  document.getElementById('secHand').setAttribute('transform', 'rotate(' + (s * 6) + ' 60 60)');
  document.getElementById('minHand').setAttribute('transform', 'rotate(' + (m * 6 + s * 0.1) + ' 60 60)');
  document.getElementById('hourHand').setAttribute('transform', 'rotate(' + (h * 30 + m * 0.5) + ' 60 60)');
  updateNowLine();
}

/* ---------------- 渲染：侧边栏今天 ---------------- */
function renderToday() {
  var now = new Date();
  document.getElementById('todaySolar').textContent =
    now.getFullYear() + '年' + (now.getMonth() + 1) + '月' + now.getDate() + '日 · ' + WEEKDAYS[now.getDay()];
  document.getElementById('todayLunar').textContent = lunarFull(now);
}

/* ---------------- 渲染：月历 ---------------- */
function todosOn(dateStr) {
  return todos.filter(function (t) { return !t.done && t.date === dateStr; })
    .sort(function (a, b) {
      var ua = URGENCY_ORDER.indexOf(a.urgency || 'normal');
      var ub = URGENCY_ORDER.indexOf(b.urgency || 'normal');
      if (ua !== ub) return ua - ub;
      return (a.createdAt || 0) - (b.createdAt || 0);
    });
}
function jumpToTodo(id) {
  var t = todos.find(function (x) { return x.id === id; });
  if (t) {
    todoFilter = 'all';
    document.querySelectorAll('#todoFilter [data-filter]').forEach(function (x) {
      x.classList.toggle('active', x.getAttribute('data-filter') === 'all');
    });
    todoFolders[t.urgency || 'normal'] = false;
    saveTodoFolders();
  }
  setView('todo');
}
function renderMonth() {
  var y = state.viewYear, m = state.viewMonth;
  var title = document.getElementById('monthTitle');
  title.textContent = y + '年' + (m + 1) + '月';

  var first = new Date(y, m, 1);
  var offset = (first.getDay() + 6) % 7; // 周一起始
  var daysInMonth = new Date(y, m + 1, 0).getDate();
  var daysInPrev = new Date(y, m, 0).getDate();
  var todayStr = fmtDate(new Date());

  var grid = document.getElementById('calGrid');
  var html = '';
  for (var i = 0; i < 42; i++) {
    var cellDate, other = false;
    if (i < offset) { cellDate = new Date(y, m - 1, daysInPrev - offset + 1 + i); other = true; }
    else if (i >= offset + daysInMonth) { cellDate = new Date(y, m + 1, i - offset - daysInMonth + 1); other = true; }
    else { cellDate = new Date(y, m, i - offset + 1); }
    var ds = fmtDate(cellDate);
    var lunar = lunarLabel(cellDate);
    var dayEvents = eventsOn(ds);
    var dayTodos = todosOn(ds);
    var total = dayEvents.length + dayTodos.length;
    var cls = 'cal-cell' + (other ? ' other-month' : '') +
      (ds === todayStr ? ' today' : '') + (ds === state.selectedDate ? ' selected' : '');
    html += '<button type="button" class="' + cls + '" data-date="' + ds + '">';
    html += '<span class="solar">' + cellDate.getDate() + '</span>';
    html += '<div class="lunar' + (lunar.festival ? ' festival' : '') + '">' + escapeHtml(lunar.text) + '</div>';
    if (total) {
      var dotCount = Math.min(total, 3);
      var dots = '';
      for (var k = 0; k < dotCount; k++) dots += '<span class="dot"></span>';
      html += '<div class="dots">' + dots + '</div>';
      var firstTitle = dayEvents.length ? dayEvents[0].title : dayTodos[0].title;
      html += '<div class="ev-mini">' + escapeHtml(firstTitle) +
        (total > 1 ? ' 等' + total + '项' : '') + '</div>';
    }
    html += '</button>';
  }
  grid.innerHTML = html;
  grid.querySelectorAll('.cal-cell').forEach(function (cell) {
    cell.addEventListener('click', function () { openDay(cell.getAttribute('data-date')); });
  });
}

/* ---------------- 渲染：日程（24 小时时间轴） ---------------- */
function tlEventChip(e) {
  return '<div class="tl-ev" data-id="' + e.id + '">' +
    (e.time ? '<span class="tl-ev-time">' + escapeHtml(e.time) + '</span>' : '') +
    '<span>' + escapeHtml(e.title) + '</span>' +
    (e.note ? '<span class="tl-ev-note">' + escapeHtml(e.note) + '</span>' : '') + '</div>';
}
function tlTodoChip(t) {
  return '<div class="tl-ev tl-todo" data-todo-id="' + t.id + '">' +
    '<span class="tl-todo-tag">待办</span><span>' + escapeHtml(t.title) + '</span></div>';
}
function renderTimeline() {
  var ds = state.selectedDate || fmtDate(new Date());
  var d = parseDate(ds);
  document.getElementById('monthTitle').textContent =
    (d.getMonth() + 1) + '月' + d.getDate() + '日 · ' + WEEKDAYS[d.getDay()];
  document.getElementById('todaySolar').textContent = lunarFull(d);
  document.getElementById('todayLunar').textContent = '';
  document.getElementById('prevMonth').setAttribute('aria-label', '前一天');
  document.getElementById('nextMonth').setAttribute('aria-label', '后一天');
  var list = document.getElementById('agendaList');
  var dayEvents = eventsOn(ds);
  var allDay = dayEvents.filter(function (e) { return e.allDay; });
  var timed = dayEvents.filter(function (e) { return !e.allDay; });
  var dayTodos = todosOn(ds);
  var html = '<div class="tl-allday"><div class="tl-allday-label">全天</div><div class="tl-allday-items">';
  if (!allDay.length && !dayTodos.length) html += '<div class="tl-empty">无全天事项</div>';
  else {
    allDay.forEach(function (e) { html += tlEventChip(e); });
    dayTodos.forEach(function (t) { html += tlTodoChip(t); });
  }
  html += '</div></div><div class="tl-hours">';
  for (var h = 0; h < 24; h++) {
    var hourEvents = timed.filter(function (e) {
      return parseInt((e.time || '00').split(':')[0], 10) === h;
    });
    html += '<div class="tl-hour" data-hour="' + h + '"><div class="tl-hour-label">' + pad(h) + ':00</div><div class="tl-hour-body">';
    hourEvents.forEach(function (e) { html += tlEventChip(e); });
    html += '</div></div>';
  }
  html += '</div>';
  list.innerHTML = html;
  list.querySelectorAll('.tl-ev:not(.tl-todo)').forEach(function (el) {
    el.addEventListener('click', function (ev) {
      ev.stopPropagation();
      openDay(ds, el.getAttribute('data-id'));
    });
  });
  list.querySelectorAll('.tl-todo').forEach(function (el) {
    el.addEventListener('click', function (ev) {
      ev.stopPropagation();
      jumpToTodo(el.getAttribute('data-todo-id'));
    });
  });
  list.querySelectorAll('.tl-hour').forEach(function (row) {
    row.addEventListener('click', function () {
      openDay(ds);
      openForm(null, pad(+row.getAttribute('data-hour')) + ':00');
    });
  });
  updateNowLine();
}
function updateNowLine() {
  var line = document.querySelector('.tl-now');
  if (state.view !== 'agenda') { if (line) line.remove(); return; }
  var ds = state.selectedDate || fmtDate(new Date());
  if (ds !== fmtDate(new Date())) { if (line) line.remove(); return; }
  var now = new Date();
  var row = document.querySelector('.tl-hour[data-hour="' + now.getHours() + '"]');
  if (!row) { if (line) line.remove(); return; }
  var body = row.querySelector('.tl-hour-body');
  if (!line || line.parentNode !== body) {
    if (line) line.remove();
    line = document.createElement('div');
    line.className = 'tl-now';
    body.appendChild(line);
  }
  line.style.top = (now.getMinutes() / 60 * 100) + '%';
}
function scrollTimelineToNow() {
  if (state.view !== 'agenda') return;
  var ds = state.selectedDate || fmtDate(new Date());
  if (ds !== fmtDate(new Date())) return;
  var view = document.getElementById('agendaView');
  var row = document.querySelector('.tl-hour[data-hour="' + new Date().getHours() + '"]');
  if (row) view.scrollTop = Math.max(0, row.offsetTop - view.offsetTop - 90);
}
function stepDay(n) {
  var ds = state.selectedDate || fmtDate(new Date());
  var d = parseDate(ds);
  d.setDate(d.getDate() + n);
  state.viewYear = d.getFullYear();
  state.viewMonth = d.getMonth();
  showDay(fmtDate(d));
  renderMonth();
  renderTimeline();
  scrollTimelineToNow();
}

/* ---------------- 渲染：待办 ---------------- */
function todoSort(a, b) {
  if (!a.date && !b.date) return (a.createdAt || 0) - (b.createdAt || 0);
  if (!a.date) return 1;
  if (!b.date) return -1;
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  return (a.createdAt || 0) - (b.createdAt || 0);
}
function todoItemHtml(t, todayMs) {
  var dateHtml = '';
  if (t.date) {
    var d = parseDate(t.date);
    var diff = Math.round((parseDate(t.date).getTime() - todayMs) / 86400000);
    var cls = 'todo-date', text = (d.getMonth() + 1) + '月' + d.getDate() + '日';
    if (diff < 0) { cls += ' overdue'; text = '逾期 ' + (-diff) + ' 天'; }
    else if (diff === 0) { cls += ' today'; text = '今天'; }
    else if (diff === 1) text = '明天';
    dateHtml = '<button type="button" class="' + cls + '" data-date="' + t.date + '">' + text + '</button>';
  }
  var urg = t.urgency || 'normal';
  return '<div class="todo-item' + (t.done ? ' done' : '') + '" data-id="' + t.id + '">' +
    '<button type="button" class="todo-check" aria-label="完成"></button>' +
    '<button type="button" class="todo-urg ' + urg + '" title="' + URGENCY[urg] + '，点击切换" aria-label="紧急程度"></button>' +
    '<span class="todo-title">' + escapeHtml(t.title) + '</span>' +
    dateHtml +
    '<button type="button" class="todo-edit" aria-label="编辑">✎</button>' +
    '<button type="button" class="todo-del" aria-label="删除">×</button></div>';
}
function todoEditHtml(t) {
  function opt(v) { return '<option value="' + v + '"' + ((t.urgency || 'normal') === v ? ' selected' : '') + '>' + URGENCY[v] + '</option>'; }
  return '<div class="todo-item editing" data-id="' + t.id + '">' +
    '<input type="text" class="todo-edit-title" maxlength="80" value="' + escapeHtml(t.title) + '">' +
    '<input type="date" class="todo-edit-date" value="' + (t.date || '') + '">' +
    '<select class="todo-edit-urgency">' + opt('urgent') + opt('normal') + opt('low') + '</select>' +
    '<button type="button" class="todo-edit-save">保存</button>' +
    '<button type="button" class="todo-edit-cancel">取消</button></div>';
}
function renderTodos() {
  var list = document.getElementById('todoList');
  var todayMs = parseDate(fmtDate(new Date())).getTime();
  function inFilter(t) { return todoFilter === 'all' || (t.urgency || 'normal') === todoFilter; }
  var undone = todos.filter(function (t) { return !t.done && inFilter(t); });
  var done = todos.filter(function (t) { return t.done && inFilter(t); })
    .sort(function (a, b) { return (b.doneAt || 0) - (a.doneAt || 0); });
  var html = '';
  if (!todos.length) {
    html = '<div class="todo-empty">还没有待办事项，在上方添加一件吧。</div>';
  } else if (!undone.length && !done.length) {
    html = '<div class="todo-empty">这个分类下还没有待办事项。</div>';
  } else {
    URGENCY_ORDER.forEach(function (key) {
      if (todoFilter !== 'all' && todoFilter !== key) return;
      var items = undone.filter(function (t) { return (t.urgency || 'normal') === key; }).sort(todoSort);
      if (!items.length) return;
      var collapsed = !!todoFolders[key];
      html += '<div class="todo-folder' + (collapsed ? ' collapsed' : '') + '" data-folder="' + key + '">' +
        '<button type="button" class="todo-folder-head"><span class="todo-folder-arrow">▾</span>' +
        '<span class="todo-folder-dot ' + key + '"></span>' + URGENCY[key] +
        '<span class="todo-folder-count">' + items.length + ' 项</span></button>' +
        '<div class="todo-folder-body">';
      items.forEach(function (t) { html += t.id === editingTodoId ? todoEditHtml(t) : todoItemHtml(t, todayMs); });
      html += '</div></div>';
    });
    if (done.length) {
      html += '<div class="todo-section done"><h3>已完成<span>' + done.length + ' 项</span><button type="button" class="todo-clear" id="todoClearDone">清空</button></h3>';
      done.forEach(function (t) { html += t.id === editingTodoId ? todoEditHtml(t) : todoItemHtml(t, todayMs); });
      html += '</div>';
    }
  }
  list.innerHTML = html;
  list.querySelectorAll('.todo-check').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var id = btn.parentNode.getAttribute('data-id');
      var t = todos.find(function (x) { return x.id === id; });
      if (!t) return;
      t.done = !t.done;
      t.doneAt = t.done ? Date.now() : 0;
      saveTodos();
      refreshAll();
    });
  });
  list.querySelectorAll('.todo-del').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var id = btn.parentNode.getAttribute('data-id');
      todos = todos.filter(function (x) { return x.id !== id; });
      saveTodos();
      refreshAll();
    });
  });
  list.querySelectorAll('.todo-urg').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var id = btn.parentNode.getAttribute('data-id');
      var t = todos.find(function (x) { return x.id === id; });
      if (!t) return;
      var idx = URGENCY_ORDER.indexOf(t.urgency || 'normal');
      t.urgency = URGENCY_ORDER[(idx + 1) % URGENCY_ORDER.length];
      saveTodos();
      refreshAll();
    });
  });
  list.querySelectorAll('.todo-date').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var ds = btn.getAttribute('data-date');
      var d = parseDate(ds);
      state.viewYear = d.getFullYear();
      state.viewMonth = d.getMonth();
      showDay(ds);
      renderMonth();
      setView('agenda');
    });
  });
  list.querySelectorAll('.todo-folder-head').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var folder = btn.parentNode;
      var key = folder.getAttribute('data-folder');
      var collapsed = folder.classList.toggle('collapsed');
      todoFolders[key] = collapsed;
      saveTodoFolders();
    });
  });
  function startEdit(id) {
    editingTodoId = id;
    renderTodos();
    var input = list.querySelector('.todo-edit-title');
    if (input) { input.focus(); input.select(); }
  }
  list.querySelectorAll('.todo-edit').forEach(function (btn) {
    btn.addEventListener('click', function () {
      startEdit(btn.parentNode.getAttribute('data-id'));
    });
  });
  list.querySelectorAll('.todo-title').forEach(function (el) {
    el.addEventListener('click', function () {
      startEdit(el.parentNode.getAttribute('data-id'));
    });
  });
  list.querySelectorAll('.todo-edit-save').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var row = btn.parentNode;
      var id = row.getAttribute('data-id');
      var t = todos.find(function (x) { return x.id === id; });
      if (t) {
        var title = row.querySelector('.todo-edit-title').value.trim();
        if (title) t.title = title;
        t.date = row.querySelector('.todo-edit-date').value || '';
        t.urgency = row.querySelector('.todo-edit-urgency').value || 'normal';
        saveTodos();
      }
      editingTodoId = null;
      refreshAll();
    });
  });
  list.querySelectorAll('.todo-edit-cancel').forEach(function (btn) {
    btn.addEventListener('click', function () {
      editingTodoId = null;
      renderTodos();
    });
  });
  var clear = document.getElementById('todoClearDone');
  if (clear) clear.addEventListener('click', function () {
    todos = todos.filter(function (t) { return !t.done; });
    saveTodos();
    refreshAll();
  });
}

/* ---------------- 渲染：年历（全年打卡） ---------------- */
function renderYear() {
  var y = state.yearView;
  document.getElementById('monthTitle').textContent = y + '年';
  var counts = { water: 0, sleep: 0, save: 0, poop: 0 };
  var daysChecked = 0;
  Object.keys(habitChecks).forEach(function (ds) {
    if (parseDate(ds).getFullYear() !== y) return;
    var list = habitChecks[ds];
    if (!list || !list.length) return;
    daysChecked++;
    list.forEach(function (k) { if (counts[k] !== undefined) counts[k]++; });
  });
  document.getElementById('todaySolar').textContent = '已打卡 ' + daysChecked + ' 天';
  document.getElementById('todayLunar').textContent = '多喝水 ' + counts.water + ' · 早睡 ' + counts.sleep + ' · 攒钱 ' + counts.save + ' · 噗噗 ' + counts.poop;
  document.getElementById('prevMonth').setAttribute('aria-label', '上一年');
  document.getElementById('nextMonth').setAttribute('aria-label', '下一年');
  var grid = document.getElementById('yearGrid');
  var html = '';
  var todayStr = fmtDate(new Date());
  for (var m = 0; m < 12; m++) {
    var daysInMonth = new Date(y, m + 1, 0).getDate();
    html += '<div class="yr-row"><div class="yr-month">' + (m + 1) + '月</div><div class="yr-pill">';
    for (var d = 1; d <= daysInMonth; d++) {
      var ds = y + '-' + pad(m + 1) + '-' + pad(d);
      var list = habitChecks[ds] || [];
      var cls = 'yr-day';
      if (ds === todayStr) cls += ' today';
      if (ds === state.selectedDate) cls += ' selected';
      if (habitFilter === 'all') {
        if (list.length === 1) cls += ' h-' + list[0];
        else if (list.length > 1) cls += ' h-multi';
      } else if (list.indexOf(habitFilter) !== -1) {
        cls += ' h-' + habitFilter;
      }
      html += '<button type="button" class="' + cls + '" data-date="' + ds + '"><span>' + d + '</span></button>';
    }
    html += '</div></div>';
  }
  grid.innerHTML = html;
  grid.querySelectorAll('.yr-day').forEach(function (cell) {
    cell.addEventListener('click', function () { onYearDayClick(cell.getAttribute('data-date')); });
  });
  renderDayEditor();
}
function onYearDayClick(ds) {
  var d = parseDate(ds);
  state.viewYear = d.getFullYear();
  state.viewMonth = d.getMonth();
  showDay(ds);
  renderMonth();
  if (habitFilter === 'all') {
    habitEditorDate = (habitEditorDate === ds) ? null : ds;
    renderYear();
  } else {
    toggleHabit(ds, habitFilter);
  }
}
function toggleHabit(ds, key) {
  var list = (habitChecks[ds] || []).slice();
  var idx = list.indexOf(key);
  if (idx === -1) list.push(key);
  else list.splice(idx, 1);
  if (list.length) habitChecks[ds] = list;
  else delete habitChecks[ds];
  saveHabitChecks();
  renderYear();
}
function renderDayEditor() {
  var ed = document.getElementById('dayEditor');
  if (!habitEditorDate || habitFilter !== 'all') { ed.hidden = true; return; }
  ed.hidden = false;
  var d = parseDate(habitEditorDate);
  document.getElementById('dayEditorDate').textContent =
    (d.getMonth() + 1) + '月' + d.getDate() + '日 · ' + WEEKDAYS[d.getDay()];
  var list = habitChecks[habitEditorDate] || [];
  ed.querySelectorAll('.day-editor-chip').forEach(function (chip) {
    chip.classList.toggle('on', list.indexOf(chip.getAttribute('data-habit')) !== -1);
  });
}

/* ---------------- 视图切换 ---------------- */
function setView(view) {
  state.view = view;
  document.getElementById('monthView').hidden = view !== 'month';
  document.getElementById('agendaView').hidden = view !== 'agenda';
  document.getElementById('todoView').hidden = view !== 'todo';
  document.getElementById('yearView').hidden = view !== 'year';
  document.querySelectorAll('[data-view]').forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-view') === view);
  });
  document.getElementById('monthBar').classList.toggle('todo-mode', view === 'todo');
  document.body.classList.toggle('todo-view', view === 'todo');
  if (view === 'todo') closeDay();
  if (view === 'agenda') { renderTimeline(); scrollTimelineToNow(); }
  else if (view === 'todo') {
    document.getElementById('monthTitle').textContent = '待办事项';
    document.getElementById('todaySolar').textContent = '';
    document.getElementById('todayLunar').textContent = '';
    renderTodos();
  } else if (view === 'year') { renderYear(); }
  else {
    document.getElementById('prevMonth').setAttribute('aria-label', '上个月');
    document.getElementById('nextMonth').setAttribute('aria-label', '下个月');
    renderToday();
    renderMonth();
  }
}

/* ---------------- 日期详情面板 ---------------- */
var panel = document.getElementById('dayPanel');
var overlay = document.getElementById('overlay');
var form = document.getElementById('evForm');

function showDay(dateStr) {
  state.selectedDate = dateStr;
  var d = parseDate(dateStr);
  document.getElementById('dpTitle').textContent =
    (d.getMonth() + 1) + '月' + d.getDate() + '日 · ' + WEEKDAYS[d.getDay()];
  document.getElementById('dpLunar').textContent = lunarFull(d);
  renderDayEvents();
}
function openDay(dateStr, editId) {
  showDay(dateStr);
  state.editingId = null;
  form.hidden = true;
  panel.classList.add('open');
  overlay.classList.add('show');
  renderMonth();
  if (editId) openForm(editId);
}
function closeDay() {
  // 桌面端详情栏常驻右侧，不关闭
  if (window.innerWidth > 860) return;
  panel.classList.remove('open');
  overlay.classList.remove('show');
  state.selectedDate = null;
  form.hidden = true;
  renderMonth();
}
function renderDayEvents() {
  var box = document.getElementById('dpEvents');
  var list = eventsOn(state.selectedDate);
  var dayTodos = todosOn(state.selectedDate);
  if (!list.length && !dayTodos.length) {
    box.innerHTML = '<div class="dp-empty">这一天还没有安排。</div>';
  } else {
    var html = '<div class="dp-timeline">';
    list.forEach(function (e) {
      html += '<div class="dp-tl-item" data-id="' + e.id + '">' +
        '<div class="dp-tl-time">' + (e.allDay ? '全天' : escapeHtml(e.time || '')) + '</div>' +
        '<div class="dp-tl-card"><div class="dp-tl-title">' + escapeHtml(e.title) + '</div>' +
        (e.note ? '<div class="dp-tl-note">' + escapeHtml(e.note) + '</div>' : '') + '</div></div>';
    });
    dayTodos.forEach(function (t) {
      html += '<div class="dp-tl-item dp-tl-todo" data-todo-id="' + t.id + '">' +
        '<div class="dp-tl-time">全天</div>' +
        '<div class="dp-tl-card"><div class="dp-tl-title"><span class="dp-todo-tag">待办</span>' + escapeHtml(t.title) + '</div></div></div>';
    });
    html += '</div>';
    box.innerHTML = html;
    box.querySelectorAll('.dp-tl-item:not(.dp-tl-todo)').forEach(function (el) {
      el.addEventListener('click', function () { openForm(el.getAttribute('data-id')); });
    });
    box.querySelectorAll('.dp-tl-todo').forEach(function (el) {
      el.addEventListener('click', function () { jumpToTodo(el.getAttribute('data-todo-id')); });
    });
  }
  renderSummary();
}
function renderSummary() {
  var ds = state.selectedDate || fmtDate(new Date());
  var s = summaries[ds] || {};
  document.getElementById('sumText').value = s.text || '';
  document.querySelectorAll('.mood-btn').forEach(function (b) {
    b.classList.toggle('selected', b.getAttribute('data-mood') === (s.mood || ''));
  });
}
function saveSummary() {
  var ds = state.selectedDate || fmtDate(new Date());
  var text = document.getElementById('sumText').value;
  var mood = '';
  var sel = document.querySelector('.mood-btn.selected');
  if (sel) mood = sel.getAttribute('data-mood');
  if (!text.trim() && !mood) delete summaries[ds];
  else summaries[ds] = { text: text, mood: mood };
  saveSummaries();
}
function openForm(editId, presetTime) {
  state.editingId = editId || null;
  var ev = editId ? events.find(function (e) { return e.id === editId; }) : null;
  document.getElementById('fTitle').value = ev ? ev.title : '';
  document.getElementById('fDate').value = ev ? ev.date : state.selectedDate;
  document.getElementById('fAllDay').checked = ev ? !!ev.allDay : !presetTime;
  document.getElementById('fTime').value = ev && ev.time ? ev.time : (presetTime || '');
  document.getElementById('fNote').value = ev ? (ev.note || '') : '';
  document.getElementById('fDelete').hidden = !ev;
  syncTimeVisibility();
  form.hidden = false;
  document.getElementById('fTitle').focus();
}
function syncTimeVisibility() {
  document.getElementById('timeWrap').style.display =
    document.getElementById('fAllDay').checked ? 'none' : 'block';
}
function refreshAll() {
  renderMonth();
  if (state.view === 'agenda') renderTimeline();
  if (state.view === 'todo') renderTodos();
  if (state.view === 'year') renderYear();
  if (state.selectedDate) renderDayEvents();
}

form.addEventListener('submit', function (ev) {
  ev.preventDefault();
  var title = document.getElementById('fTitle').value.trim();
  var date = document.getElementById('fDate').value;
  var allDay = document.getElementById('fAllDay').checked;
  var time = allDay ? '' : document.getElementById('fTime').value;
  var note = document.getElementById('fNote').value.trim();
  if (!title || !date) return;
  if (state.editingId) {
    var old = events.find(function (e) { return e.id === state.editingId; });
    if (old) { old.title = title; old.date = date; old.allDay = allDay; old.time = time; old.note = note; }
  } else {
    events.push({ id: uid(), date: date, title: title, allDay: allDay, time: time, note: note });
  }
  saveEvents();
  state.editingId = null;
  form.hidden = true;
  state.selectedDate = date;
  refreshAll();
  // 若改了日期，跳转到对应月份
  var d = parseDate(date);
  state.viewYear = d.getFullYear(); state.viewMonth = d.getMonth();
  renderMonth();
});
document.getElementById('fCancel').addEventListener('click', function () {
  form.hidden = true; state.editingId = null;
});
document.getElementById('fDelete').addEventListener('click', function () {
  if (!state.editingId) return;
  if (!confirm('确定删除这个事项吗？')) return;
  events = events.filter(function (e) { return e.id !== state.editingId; });
  saveEvents();
  state.editingId = null;
  form.hidden = true;
  refreshAll();
});
document.getElementById('fAllDay').addEventListener('change', syncTimeVisibility);
document.getElementById('dpAdd').addEventListener('click', function () { openForm(null); });
document.getElementById('sumText').addEventListener('input', saveSummary);
document.querySelectorAll('.mood-btn').forEach(function (b) {
  b.addEventListener('click', function () {
    var was = b.classList.contains('selected');
    document.querySelectorAll('.mood-btn').forEach(function (x) { x.classList.remove('selected'); });
    if (!was) b.classList.add('selected');
    saveSummary();
  });
});
document.getElementById('todoAddForm').addEventListener('submit', function (e) {
  e.preventDefault();
  var title = document.getElementById('todoTitle').value.trim();
  if (!title) return;
  var date = document.getElementById('todoDate').value;
  var urgency = document.getElementById('todoUrgency').value || 'normal';
  todos.push({ id: uid(), title: title, date: date || '', urgency: urgency, done: false, doneAt: 0, createdAt: Date.now() });
  saveTodos();
  document.getElementById('todoTitle').value = '';
  document.getElementById('todoDate').value = '';
  refreshAll();
  document.getElementById('todoTitle').focus();
});
document.querySelectorAll('#todoFilter [data-filter]').forEach(function (b) {
  b.addEventListener('click', function () {
    todoFilter = b.getAttribute('data-filter');
    document.querySelectorAll('#todoFilter [data-filter]').forEach(function (x) {
      x.classList.toggle('active', x === b);
    });
    renderTodos();
  });
});
document.querySelectorAll('#habitFilter [data-habit]').forEach(function (b) {
  b.addEventListener('click', function () {
    habitFilter = b.getAttribute('data-habit');
    document.querySelectorAll('#habitFilter [data-habit]').forEach(function (x) {
      x.classList.toggle('active', x === b);
    });
    if (habitFilter !== 'all') habitEditorDate = null;
    renderYear();
  });
});
document.querySelectorAll('.day-editor-chip').forEach(function (chip) {
  chip.addEventListener('click', function () {
    if (!habitEditorDate) return;
    toggleHabit(habitEditorDate, chip.getAttribute('data-habit'));
  });
});
document.getElementById('dayEditorClose').addEventListener('click', function () {
  habitEditorDate = null;
  renderYear();
});
document.getElementById('dpClose').addEventListener('click', closeDay);
overlay.addEventListener('click', closeDay);
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDay(); });

/* ---------------- 月份导航 ---------------- */
document.getElementById('prevMonth').addEventListener('click', function () {
  if (state.view === 'agenda') { stepDay(-1); return; }
  if (state.view === 'year') { state.yearView--; renderYear(); return; }
  state.viewMonth--;
  if (state.viewMonth < 0) { state.viewMonth = 11; state.viewYear--; }
  renderMonth();
});
document.getElementById('nextMonth').addEventListener('click', function () {
  if (state.view === 'agenda') { stepDay(1); return; }
  if (state.view === 'year') { state.yearView++; renderYear(); return; }
  state.viewMonth++;
  if (state.viewMonth > 11) { state.viewMonth = 0; state.viewYear++; }
  renderMonth();
});
document.getElementById('todayBtn').addEventListener('click', function () {
  var now = new Date();
  state.viewYear = now.getFullYear(); state.viewMonth = now.getMonth();
  showDay(fmtDate(now));
  renderMonth();
  if (state.view === 'agenda') { renderTimeline(); scrollTimelineToNow(); }
  if (state.view === 'year') { state.yearView = now.getFullYear(); renderYear(); }
});

/* ---------------- 视图切换按钮 ---------------- */
document.querySelectorAll('[data-view]').forEach(function (b) {
  b.addEventListener('click', function () { setView(b.getAttribute('data-view')); });
});

/* ---------------- 导出 / 导入备份 ---------------- */
document.getElementById('exportBtn').addEventListener('click', function () {
  var blob = new Blob([JSON.stringify({ version: 1, events: events, summaries: summaries, todos: todos, habits: habitChecks }, null, 2)], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '日历备份-' + fmtDate(new Date()) + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
});
document.getElementById('importBtn').addEventListener('click', function () {
  document.getElementById('importFile').click();
});
document.getElementById('importFile').addEventListener('change', function (e) {
  var file = e.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function () {
    try {
      var data = JSON.parse(reader.result);
      var arr, sums = null, td = null, hb = null;
      if (Array.isArray(data)) arr = data;
      else if (data && Array.isArray(data.events)) { arr = data.events; sums = data.summaries || null; td = data.todos || null; hb = data.habits || null; }
      else throw new Error('格式不对');
      var known = new Set(events.map(function (x) { return x.id; }));
      var added = 0;
      arr.forEach(function (item) {
        if (item && item.id && item.date && item.title && !known.has(item.id)) {
          events.push({ id: item.id, date: item.date, title: item.title,
            allDay: !!item.allDay, time: item.time || '', note: item.note || '' });
          known.add(item.id); added++;
        }
      });
      var sumCount = 0;
      if (sums && typeof sums === 'object') {
        Object.keys(sums).forEach(function (ds) {
          if (sums[ds] && typeof sums[ds] === 'object' && !summaries[ds]) {
            summaries[ds] = sums[ds]; sumCount++;
          }
        });
        if (sumCount) saveSummaries();
      }
      var todoCount = 0;
      if (Array.isArray(td)) {
        var knownTodo = new Set(todos.map(function (x) { return x.id; }));
        td.forEach(function (item) {
          if (item && item.id && item.title && !knownTodo.has(item.id)) {
            todos.push({ id: item.id, title: item.title, date: item.date || '', urgency: item.urgency || 'normal',
              done: !!item.done, doneAt: item.doneAt || 0, createdAt: item.createdAt || 0 });
            knownTodo.add(item.id); todoCount++;
          }
        });
        if (todoCount) saveTodos();
      }
      var habitCount = 0;
      if (hb && typeof hb === 'object') {
        Object.keys(hb).forEach(function (ds) {
          if (!Array.isArray(hb[ds])) return;
          var cur = (habitChecks[ds] || []).slice();
          var added = false;
          hb[ds].forEach(function (k) {
            if (HABIT_KEYS.indexOf(k) !== -1 && cur.indexOf(k) === -1) { cur.push(k); added = true; }
          });
          if (cur.length) habitChecks[ds] = cur;
          if (added) habitCount++;
        });
        if (habitCount) saveHabitChecks();
      }
      saveEvents();
      refreshAll();
      var msg = added ? '已导入 ' + added + ' 个事项。' : '备份里没有新的事项。';
      if (sumCount) msg += '同时恢复了 ' + sumCount + ' 天的日总结。';
      if (todoCount) msg += '同时恢复了 ' + todoCount + ' 项待办。';
      if (habitCount) msg += '同时恢复了 ' + habitCount + ' 天的打卡记录。';
      alert(msg);
    } catch (err) { alert('导入失败：这个文件不是有效的日历备份。'); }
    e.target.value = '';
  };
  reader.readAsText(file);
});

/* ---------------- 启动 ---------------- */
(function init() {
  var now = new Date();
  state.viewYear = now.getFullYear();
  state.viewMonth = now.getMonth();
  buildTicks();
  tickClock();
  setInterval(tickClock, 1000);
  renderToday();
  showDay(fmtDate(now));
  renderMonth();
})();

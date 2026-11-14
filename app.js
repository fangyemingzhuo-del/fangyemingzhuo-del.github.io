'use strict';
/* 极简日历 · 所有事项只保存在浏览器 localStorage，不上传服务器。 */

var STORAGE_KEY = 'paperperf-calendar-events-v1';
var WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

var state = {
  viewYear: null, viewMonth: null, // 0-11
  view: 'month',
  selectedDate: null, // 'YYYY-MM-DD'
  editingId: null
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
    var cls = 'cal-cell' + (other ? ' other-month' : '') +
      (ds === todayStr ? ' today' : '') + (ds === state.selectedDate ? ' selected' : '');
    html += '<button type="button" class="' + cls + '" data-date="' + ds + '">';
    html += '<span class="solar">' + cellDate.getDate() + '</span>';
    html += '<div class="lunar' + (lunar.festival ? ' festival' : '') + '">' + escapeHtml(lunar.text) + '</div>';
    if (dayEvents.length) {
      html += '<div class="dots">' + dayEvents.slice(0, 3).map(function () { return '<span class="dot"></span>'; }).join('') + '</div>';
      html += '<div class="ev-mini">' + escapeHtml(dayEvents[0].title) +
        (dayEvents.length > 1 ? ' 等' + dayEvents.length + '项' : '') + '</div>';
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
  var html = '<div class="tl-allday"><div class="tl-allday-label">全天</div><div class="tl-allday-items">';
  if (!allDay.length) html += '<div class="tl-empty">无全天事项</div>';
  else allDay.forEach(function (e) { html += tlEventChip(e); });
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
  list.querySelectorAll('.tl-ev').forEach(function (el) {
    el.addEventListener('click', function (ev) {
      ev.stopPropagation();
      openDay(ds, el.getAttribute('data-id'));
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

/* ---------------- 视图切换 ---------------- */
function setView(view) {
  state.view = view;
  document.getElementById('monthView').hidden = view !== 'month';
  document.getElementById('agendaView').hidden = view !== 'agenda';
  document.querySelectorAll('[data-view]').forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-view') === view);
  });
  if (view === 'agenda') { renderTimeline(); scrollTimelineToNow(); }
  if (view === 'month') {
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
  if (!list.length) {
    box.innerHTML = '<div class="dp-empty">这一天还没有安排。</div>';
  } else {
    var html = '<div class="dp-timeline">';
    list.forEach(function (e) {
      html += '<div class="dp-tl-item" data-id="' + e.id + '">' +
        '<div class="dp-tl-time">' + (e.allDay ? '全天' : escapeHtml(e.time || '')) + '</div>' +
        '<div class="dp-tl-card"><div class="dp-tl-title">' + escapeHtml(e.title) + '</div>' +
        (e.note ? '<div class="dp-tl-note">' + escapeHtml(e.note) + '</div>' : '') + '</div></div>';
    });
    html += '</div>';
    box.innerHTML = html;
    box.querySelectorAll('.dp-tl-item').forEach(function (el) {
      el.addEventListener('click', function () { openForm(el.getAttribute('data-id')); });
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
document.getElementById('dpClose').addEventListener('click', closeDay);
overlay.addEventListener('click', closeDay);
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDay(); });

/* ---------------- 月份导航 ---------------- */
document.getElementById('prevMonth').addEventListener('click', function () {
  if (state.view === 'agenda') { stepDay(-1); return; }
  state.viewMonth--;
  if (state.viewMonth < 0) { state.viewMonth = 11; state.viewYear--; }
  renderMonth();
});
document.getElementById('nextMonth').addEventListener('click', function () {
  if (state.view === 'agenda') { stepDay(1); return; }
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
});

/* ---------------- 视图切换按钮 ---------------- */
document.querySelectorAll('[data-view]').forEach(function (b) {
  b.addEventListener('click', function () { setView(b.getAttribute('data-view')); });
});

/* ---------------- 导出 / 导入备份 ---------------- */
document.getElementById('exportBtn').addEventListener('click', function () {
  var blob = new Blob([JSON.stringify({ version: 1, events: events, summaries: summaries }, null, 2)], { type: 'application/json' });
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
      var arr, sums = null;
      if (Array.isArray(data)) arr = data;
      else if (data && Array.isArray(data.events)) { arr = data.events; sums = data.summaries || null; }
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
      saveEvents();
      refreshAll();
      var msg = added ? '已导入 ' + added + ' 个事项。' : '备份里没有新的事项。';
      if (sumCount) msg += '同时恢复了 ' + sumCount + ' 天的日总结。';
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

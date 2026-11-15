/* Moon-phase widget: accurate moon ages interpolated between verified phase
   instants (timeanddate / universaltimedate 2026 tables, checked 2026-11-15),
   with a mean-synodic fallback outside the anchored range. */
(function () {
  'use strict';

  var SYNODIC = 29.530588853;

  // Verified phase instants (UTC ms) -> moon age at that instant.
  var ANCHORS = [
    [Date.UTC(2026, 9, 26, 4, 12), 14.77],  // full
    [Date.UTC(2026, 10, 1, 20, 28), 22.15], // last quarter
    [Date.UTC(2026, 10, 9, 7, 2), 0.0],     // new
    [Date.UTC(2026, 10, 17, 11, 48), 7.38], // first quarter
    [Date.UTC(2026, 10, 24, 14, 53), 14.77],// full
    [Date.UTC(2026, 11, 1, 6, 8), 22.15],   // last quarter
    [Date.UTC(2026, 11, 9, 0, 52), 0.0],    // new
    [Date.UTC(2026, 11, 17, 5, 42), 7.38],  // first quarter
    [Date.UTC(2026, 11, 24, 1, 28), 14.77], // full
    [Date.UTC(2026, 11, 30, 18, 59), 22.15],// last quarter
    [Date.UTC(2027, 0, 7, 13, 0), 0.0]      // new (approx)
  ];
  var EPOCH_NEW = Date.UTC(2000, 0, 6, 18, 14); // known new moon

  function moonAge(utcMs) {
    for (var i = 0; i < ANCHORS.length - 1; i++) {
      var t0 = ANCHORS[i][0], a0 = ANCHORS[i][1];
      var t1 = ANCHORS[i + 1][0], a1 = ANCHORS[i + 1][1];
      if (t0 <= utcMs && utcMs <= t1) {
        var a1u = a1 > a0 ? a1 : a1 + SYNODIC;
        var frac = (utcMs - t0) / (t1 - t0);
        return (a0 + (a1u - a0) * frac) % SYNODIC;
      }
    }
    var age = ((utcMs - EPOCH_NEW) / 86400000) % SYNODIC;
    return age < 0 ? age + SYNODIC : age;
  }

  function illum(age) {
    return (1 - Math.cos(2 * Math.PI * age / SYNODIC)) / 2;
  }

  function phaseName(age) {
    if (age < 1.0) return '新月';
    if (age < 6.4) return '娥眉月';
    if (age < 8.4) return '上弦月';
    if (age < 13.8) return '盈凸月';
    if (age < 15.8) return '满月';
    if (age < 21.7) return '亏凸月';
    if (age < 23.2) return '下弦月';
    return '残月';
  }

  // Moon phase as an inline SVG string. r = radius, center (32, 32).
  function moonSVG(age) {
    var r = 26, cx = 32, cy = 32;
    var disc = '<circle cx="' + cx + '" cy="' + cy + '" r="' + r +
      '" fill="rgba(255,255,255,0.35)" stroke="rgba(100,130,145,0.30)" stroke-width="1"/>';
    if (age < 0.8 || age > 28.7) {
      return '<svg viewBox="0 0 64 64">' + disc + '</svg>';
    }
    var th = 2 * Math.PI * age / SYNODIC;
    var rx = Math.max(Math.abs(Math.cos(th)) * r, 0.01);
    var waxing = age < 14.77;
    var T = cx + ' ' + (cy - r), B = cx + ' ' + (cy + r);
    var outer, sweep;
    if (waxing) {
      outer = 'M ' + T + ' A ' + r + ' ' + r + ' 0 0 1 ' + B;
      sweep = age < 7.38 ? 0 : 1;
    } else {
      outer = 'M ' + T + ' A ' + r + ' ' + r + ' 0 0 0 ' + B;
      sweep = age < 22.15 ? 0 : 1;
    }
    var term = 'A ' + rx.toFixed(2) + ' ' + r + ' 0 0 ' + sweep + ' ' + T + ' Z';
    return '<svg viewBox="0 0 64 64">' + disc +
      '<path d="' + outer + ' ' + term + '" fill="url(#litGrad)"/></svg>';
  }

  var MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  var WEEK_CN = ['日', '一', '二', '三', '四', '五', '六'];

  var today = new Date();
  var todayY = today.getFullYear(), todayM = today.getMonth(), todayD = today.getDate();
  var viewY = todayY, viewM = todayM;
  var selY = todayY, selM = todayM, selD = todayD;

  var gridEl = document.getElementById('grid');
  var detailEl = document.getElementById('detailLine');

  function ageFor(y, m, d) {
    // moon age at local noon CST (04:00 UTC)
    return moonAge(Date.UTC(y, m, d, 4, 0));
  }

  function render() {
    document.getElementById('titleNum').textContent = viewM + 1;
    document.getElementById('titleMonth').textContent = MONTHS_EN[viewM];
    document.getElementById('titleYear').textContent = viewY;

    var daysInMonth = new Date(viewY, viewM + 1, 0).getDate();
    var firstDow = new Date(viewY, viewM, 1).getDay(); // 0 = Sunday
    var total = firstDow + daysInMonth;
    var rows = Math.ceil(total / 7);
    gridEl.style.setProperty('--rows', rows);

    var html = '';
    for (var i = 0; i < firstDow; i++) html += '<div class="cell empty"></div>';
    for (var d = 1; d <= daysInMonth; d++) {
      var cls = 'cell';
      if (viewY === todayY && viewM === todayM && d === todayD) cls += ' today';
      if (viewY === selY && viewM === selM && d === selD) cls += ' selected';
      html += '<div class="' + cls + '" data-day="' + d + '">' +
        '<span class="num">' + d + '</span>' +
        '<span class="moon">' + moonSVG(ageFor(viewY, viewM, d)) + '</span></div>';
    }
    gridEl.innerHTML = html;
    renderDetail();
  }

  function renderDetail() {
    var age = ageFor(selY, selM, selD);
    var dow = new Date(selY, selM, selD).getDay();
    var pct = Math.round(illum(age) * 100);
    var isToday = (selY === todayY && selM === todayM && selD === todayD);
    detailEl.innerHTML = (selM + 1) + '月' + selD + '日 星期' + WEEK_CN[dow] +
      ' <span class="dim">·</span> ' + phaseName(age) +
      ' <span class="dim">·</span> 照亮 ' + pct + '%' +
      (isToday ? ' <span class="dim">· 今天</span>' : '');
  }

  gridEl.addEventListener('click', function (e) {
    var cell = e.target.closest('.cell[data-day]');
    if (!cell) return;
    selY = viewY; selM = viewM; selD = +cell.getAttribute('data-day');
    gridEl.querySelectorAll('.cell.selected').forEach(function (c) {
      c.classList.remove('selected');
    });
    cell.classList.add('selected');
    renderDetail();
  });

  document.getElementById('prevBtn').addEventListener('click', function () {
    viewM--;
    if (viewM < 0) { viewM = 11; viewY--; }
    if (selY !== viewY || selM !== viewM) { selY = viewY; selM = viewM; selD = 1; }
    render();
  });
  document.getElementById('nextBtn').addEventListener('click', function () {
    viewM++;
    if (viewM > 11) { viewM = 0; viewY++; }
    if (selY !== viewY || selM !== viewM) { selY = viewY; selM = viewM; selD = 1; }
    render();
  });
  document.getElementById('todayBtn').addEventListener('click', function () {
    var now = new Date();
    viewY = now.getFullYear(); viewM = now.getMonth();
    selY = viewY; selM = viewM; selD = now.getDate();
    todayY = viewY; todayM = viewM; todayD = selD;
    render();
  });

  render();
})();

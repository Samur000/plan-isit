/* Дорожная карта ОП — ДГУ. Без зависимостей. Данные: window.DGU_ROADMAP_DATA (только из учебного плана) */
(function () {
  'use strict';

  var DATA = window.DGU_ROADMAP_DATA;
  var root = document.getElementById('dgu-roadmap');
  if (!root || !DATA || !DATA.programs || !DATA.programs.length) return;

  var PALETTE = {
    o1:    { c: '#64748B', t: '#EEF1F5', d: '#334155' },
    o2:    { c: '#0F9488', t: '#CCF2EC', d: '#0B5F57' },
    base:  { c: '#1D5FD6', t: '#DCE8FC', d: '#123E8C' },
    prof:  { c: '#7C3AED', t: '#EDE7FD', d: '#4C1D95' },
    dv:    { c: '#D97706', t: '#FEF3C7', d: '#92400E' },
    prac:  { c: '#16A34A', t: '#DCF5E3', d: '#14532D' },
    extra: { c: '#DB2777', t: '#FCE4F0', d: '#8A1747' }
  };
  var FALLBACK = PALETTE.o1;
  var HOURS = [
    ['lec', 'Лекции', '#1D5FD6'],
    ['lab', 'Лабораторные', '#0F9488'],
    ['pr', 'Практические', '#7C3AED'],
    ['iz', 'ИЗ', '#DB2777'],
    ['krp', 'КРП', '#DB2777'],
    ['self', 'Самостоятельная работа', '#B6C2D4'],
    ['exam', 'Контроль', '#F59E0B']
  ];
  var SHORT_HOURS = { lec: 'лекции', lab: 'лаб.', pr: 'практ.', iz: 'ИЗ', krp: 'КРП', self: 'самост.', exam: 'контроль' };
  var ICON_DOC = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>';
  var ICON_X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';

  var mqNarrow = window.matchMedia('(max-width: 760px)');
  var state = { pi: 0, track: 'all', query: '', hover: null, pinned: null };
  var P, byCode, trackById, outAdj, inAdj, cardEls, edgeEls, lastOpener, prevOverflow;

  // ---------- утилиты ----------
  function $(name) { return root.querySelector('[data-rm="' + name + '"]'); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  function vars(track) { var p = PALETTE[track] || FALLBACK; return '--c:' + p.c + ';--t:' + p.t + ';--d:' + p.d; }
  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }
  function range(arr) { return arr.length > 1 ? arr[0] + '–' + arr[arr.length - 1] : String(arr[0]); }
  function courses(sems) {
    var c = sems.map(function (s) { return Math.ceil(s / 2); });
    c = c.filter(function (v, i) { return c.indexOf(v) === i; });
    return range(c) + ' курс';
  }
  function mainForm(n) {
    if (n.kind === 'gia') return 'защита';
    var f = n.forms || [];
    if (f.indexOf('Экзамен') >= 0) return 'экзамен';
    if (f.indexOf('Зачёт с оценкой') >= 0) return 'зачёт с оц.';
    if (f.indexOf('Зачёт') >= 0) return 'зачёт';
    return '';
  }
  function volume(n) { return n.ze ? n.ze + ' з.е.' : (n.hours ? n.hours + ' ч' : ''); }
  function norm(s) { return String(s || '').toLowerCase().replace(/ё/g, 'е'); }
  function hoursWord(n) { return n + ' ' + plural(n, 'час', 'часа', 'часов'); }

  // ---------- данные программы ----------
  function indexProgram() {
    P = DATA.programs[state.pi];
    byCode = {}; trackById = {};
    P.tracks.forEach(function (t) { trackById[t.id] = t; });
    P.nodes.forEach(function (n) {
      byCode[n.code] = { node: n, parent: null };
      (n.options || []).forEach(function (o) { byCode[o.code] = { node: o, parent: n }; });
    });
    outAdj = {}; inAdj = {};
    (P.edges || []).forEach(function (e) {
      (outAdj[e[0]] = outAdj[e[0]] || []).push(e[1]);
      (inAdj[e[1]] = inAdj[e[1]] || []).push(e[0]);
    });
  }
  function related(code) {
    var set = {}; set[code] = true;
    [outAdj, inAdj].forEach(function (adj) {
      var stack = [code];
      while (stack.length) {
        var c = stack.pop();
        (adj[c] || []).forEach(function (x) { if (!set[x]) { set[x] = true; stack.push(x); } });
      }
    });
    return set;
  }
  function matches(n, q) {
    if (!q) return false;
    var hay = norm(n.name + ' ' + n.code);
    (n.options || []).forEach(function (o) { hay += ' ' + norm(o.name + ' ' + o.code); });
    return hay.indexOf(q) >= 0;
  }
  function summary(code) {
    return (P.summary || []).filter(function (s) { return s.code === code; })[0];
  }

  // ---------- шапка ----------
  function renderHeader() {
    var m = P.meta;
    $('faculty').textContent = m.faculty;
    $('name').textContent = m.code + ' ' + m.title;
    $('profile').textContent = 'Направленность (профиль): ' + m.profile;

    var sw = root.querySelector('.rm-switch');
    sw.style.display = DATA.programs.length > 1 ? '' : 'none';
    sw.innerHTML = DATA.programs.map(function (p, i) {
      return '<button type="button" role="tab" aria-selected="' + (i === state.pi) + '" data-pi="' + i + '">' +
        esc(p.meta.code) + '<small>' + esc(p.meta.short) + '</small></button>';
    }).join('');

    // цифры — из «Сводных данных» учебного плана
    var total = (P.summary || []).filter(function (s) { return /^Итого по ОП/.test(s.name); })[0];
    var stats = [[m.years, plural(m.years, 'год', 'года', 'лет') + ' обучения, ' + m.form.toLowerCase() + ' форма']];
    if (total) stats.push([total.ze, 'з.е. по программе']);
    [['Б1.О', 'з.е. обязательная часть'], ['Б1.В', 'з.е. часть, формируемая участниками образовательных отношений'],
     ['Б2.О', 'з.е. практика'], ['Б3', 'з.е. государственная итоговая аттестация']].forEach(function (x) {
      var s = summary(x[0]);
      if (s) stats.push([s.ze, x[1]]);
    });
    $('stats').innerHTML = stats.map(function (s) { return '<li><b>' + s[0] + '</b><span>' + esc(s[1]) + '</span></li>'; }).join('');
    $('links').innerHTML =
      '<a href="' + esc(m.planUrl) + '" target="_blank" rel="noopener">' + ICON_DOC + 'Учебный план (PDF)</a>' +
      '<span style="color:var(--rm-faint)">' + esc(m.fgos) + ' · набор ' + m.startYear + ' г. · ' + esc(m.approved) + '</span>';
    $('note').textContent = 'Все данные взяты из учебного плана ' + m.code + ' «' + m.title + '», набор ' + m.startYear +
      ' г. (' + m.approved + '). Колонки соответствуют модулям и блокам плана. Стрелки показывают логику обучения: какие дисциплины готовят к следующим. ' +
      'Они составлены по плану и содержанию дисциплин и носят рекомендательный характер.';
  }

  function renderTracks() {
    var html = '<button type="button" class="rm-chip" data-track="all" aria-pressed="' + (state.track === 'all') + '">Все модули</button>';
    P.tracks.forEach(function (t) {
      html += '<button type="button" class="rm-chip" data-track="' + t.id + '" style="' + vars(t.id) + '" aria-pressed="' +
        (state.track === t.id) + '"><i></i>' + esc(t.name) + '</button>';
    });
    $('tracks').innerHTML = html;
  }

  // ---------- сетка ----------
  function cardHtml(n) {
    if (n.kind === 'choice') {
      var head = n.mobility ? 'Модуль мобильности' : 'По выбору';
      var opts = n.options.map(function (o) {
        return '<button type="button" class="rm-opt" data-open="' + esc(o.code) + '">' + esc(o.name) + '</button>';
      }).join('<span class="rm-or">или</span>');
      return '<div class="rm-card rm-card--choice" data-code="' + esc(n.code) + '" style="' + vars(n.track) + '">' +
        '<div class="rm-choice-head">' + head + '<span>' + esc(volume(n)) + (mainForm(n) ? ' · ' + mainForm(n) : '') + '</span></div>' +
        opts + '</div>';
    }
    var compact = trackById[n.track] && trackById[n.track].compact;
    var cls = 'rm-card';
    if (compact) cls += ' rm-card--compact';
    if (n.kind === 'practice') cls += ' rm-card--practice';
    if (n.kind === 'gia') cls += ' rm-card--gia';
    if (n.kind === 'optional') cls += ' rm-card--optional';
    var form = mainForm(n);
    var open = '<button type="button" class="' + cls + '" data-code="' + esc(n.code) + '" data-open="' + esc(n.code) + '" style="' + vars(n.track) + '">';
    if (compact) {
      var bits = [volume(n), form, n.sems.length > 1 ? range(n.sems) + ' сем.' : '', n.kind === 'optional' ? 'факультатив' : '']
        .filter(Boolean).join(' · ');
      return open + '<span class="rm-card-name">' + esc(n.name) + '</span><span class="rm-card-meta">' + esc(bits) + '</span></button>';
    }
    var meta = '<span class="rm-pill">' + esc(volume(n)) + '</span>';
    if (form) meta += '<span class="rm-pill' + (form === 'экзамен' ? ' rm-pill--exam' : '') + '">' + form + '</span>';
    if (n.sems.length > 1) meta += '<span class="rm-pill rm-pill--c">' + range(n.sems) + ' сем.</span>';
    return open + '<span class="rm-card-name">' + esc(n.name) + '</span><span class="rm-card-meta">' + meta + '</span></button>';
  }

  function semSummary(sem) {
    var ze = 0, exams = 0;
    P.nodes.forEach(function (n) {
      if (n.kind === 'optional') return;
      (n.perSem || []).forEach(function (p) {
        if (p.sem !== sem) return;
        ze += p.ze || 0;
        if (p.forms.indexOf('Экзамен') >= 0) exams++;
      });
    });
    return ze + ' з.е. · ' + exams + ' ' + plural(exams, 'экзамен', 'экзамена', 'экзаменов');
  }

  // порядок внутри ячейки: обязательные -> вариативные -> по выбору -> факультативы
  var RANK = { core: 0, practice: 0, gia: 1, variable: 1, sport: 1, choice: 2, optional: 3 };
  function rank(n) { return RANK[n.kind] == null ? 1 : RANK[n.kind]; }

  function renderGrid() {
    var lanes = (mqNarrow.matches && state.track !== 'all')
      ? P.tracks.filter(function (t) { return t.id === state.track; })
      : P.tracks;
    var grid = $('grid');
    root.style.setProperty('--rm-lanes', lanes.length);
    var maxRow = Math.max.apply(null, P.nodes.map(function (n) { return n.start; }));

    var html = '<div class="rm-corner"></div>';
    lanes.forEach(function (t) {
      var cnt = P.nodes.filter(function (n) { return n.track === t.id; }).length;
      html += '<div class="rm-lanehead" data-lane="' + t.id + '" style="' + vars(t.id) + '"><i></i><b>' + esc(t.name) + '</b><span>' +
        esc(t.codes) + ' · ' + cnt + ' ' + plural(cnt, 'блок', 'блока', 'блоков') + '</span></div>';
    });
    for (var row = 1; row <= maxRow; row++) {
      var final = row === 9;
      var course = !final && row % 2 === 1 ? ' rm-course' : '';
      html += final
        ? '<div class="rm-rowlabel rm-rowlabel--final rm-course"><b>Финиш</b><span>итоговая аттестация</span></div>'
        : '<div class="rm-rowlabel' + course + '"><b>' + row + ' семестр</b><span>' + Math.ceil(row / 2) + ' курс · ' +
          (row % 2 ? 'осень' : 'весна') + '</span><em>' + semSummary(row) + '</em></div>';
      lanes.forEach(function (t) {
        var cards = P.nodes.filter(function (n) { return n.start === row && n.track === t.id; })
          .sort(function (a, b) { return rank(a) - rank(b) || b.sems.length - a.sems.length || (a.code < b.code ? -1 : 1); })
          .map(cardHtml).join('');
        html += '<div class="rm-cell' + (final ? ' rm-course' : course) + '">' + cards + '</div>';
      });
    }
    grid.innerHTML = html;
    cardEls = {};
    grid.querySelectorAll('[data-code]').forEach(function (elm) { cardEls[elm.getAttribute('data-code')] = elm; });
    applyState();
    scheduleDraw();
  }

  // ---------- полосы колонок и стрелки ----------
  var drawPending = false;
  function scheduleDraw() {
    if (drawPending) return;
    drawPending = true;
    requestAnimationFrame(function () { drawPending = false; drawEdges(); });
  }

  function drawEdges() {
    var tree = $('tree'), svg = $('edges'), grid = $('grid');
    var W = grid.scrollWidth, H = grid.offsetHeight;
    svg.setAttribute('width', W); svg.setAttribute('height', H);
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    var tr = tree.getBoundingClientRect();
    function box(elm) {
      var r = elm.getBoundingClientRect();
      return { l: r.left - tr.left, t: r.top - tr.top, w: r.width, h: r.height, cx: r.left - tr.left + r.width / 2 };
    }

    var out = '<defs>';
    Object.keys(PALETTE).forEach(function (k) {
      out += '<marker id="rm-ah-' + k + '" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto">' +
        '<path d="M0 0.5 L10 5 L0 9.5 Z" fill="' + PALETTE[k].c + '"/></marker>';
    });
    out += '</defs>';

    grid.querySelectorAll('.rm-lanehead').forEach(function (h) {
      var b = box(h), p = PALETTE[h.getAttribute('data-lane')] || FALLBACK;
      out += '<rect x="' + (b.l + 3) + '" y="2" width="' + (b.w - 6) + '" height="' + (H - 4) + '" rx="16" fill="' + p.t + '" fill-opacity=".38"/>';
    });

    // точки выхода/входа разносим, чтобы стрелки не сливались
    var boxes = {}, outs = {}, ins = {};
    (P.edges || []).forEach(function (e) {
      if (!cardEls[e[0]] || !cardEls[e[1]]) return;
      boxes[e[0]] = boxes[e[0]] || box(cardEls[e[0]]);
      boxes[e[1]] = boxes[e[1]] || box(cardEls[e[1]]);
      (outs[e[0]] = outs[e[0]] || []).push(e);
      (ins[e[1]] = ins[e[1]] || []).push(e);
    });
    function spread(list, key, otherKey) {
      list.sort(function (a, b) { return boxes[a[otherKey]].cx - boxes[b[otherKey]].cx; });
      var b = boxes[list[0][key]], n = list.length, pos = {};
      list.forEach(function (e, i) {
        var f = n === 1 ? 0.5 : 0.25 + 0.5 * i / (n - 1);
        pos[e[0] + '>' + e[1]] = b.l + b.w * f;
      });
      return pos;
    }
    var xOut = {}, xIn = {};
    Object.keys(outs).forEach(function (k) { var p = spread(outs[k], 0, 1); for (var x in p) xOut[x] = p[x]; });
    Object.keys(ins).forEach(function (k) { var p = spread(ins[k], 1, 0); for (var x in p) xIn[x] = p[x]; });

    edgeEls = [];
    (P.edges || []).forEach(function (e) {
      var a = boxes[e[0]], b = boxes[e[1]];
      if (!a || !b) return;
      var key = e[0] + '>' + e[1];
      var x1 = xOut[key], y1 = a.t + a.h, x2 = xIn[key], y2 = b.t - 1;
      var dy = Math.max(26, Math.min(140, (y2 - y1) * 0.45));
      var track = byCode[e[0]].node.track;
      var p = PALETTE[track] || FALLBACK;
      out += '<path class="rm-edge" data-a="' + esc(e[0]) + '" data-b="' + esc(e[1]) + '" d="M' + x1.toFixed(1) + ' ' + y1.toFixed(1) +
        ' C' + x1.toFixed(1) + ' ' + (y1 + dy).toFixed(1) + ' ' + x2.toFixed(1) + ' ' + (y2 - dy).toFixed(1) + ' ' + x2.toFixed(1) + ' ' + y2.toFixed(1) +
        '" stroke="' + p.c + '" marker-end="url(#rm-ah-' + (PALETTE[track] ? track : 'o1') + ')"/>';
    });
    svg.innerHTML = out;
    svg.querySelectorAll('.rm-edge').forEach(function (el) {
      edgeEls.push({ a: el.getAttribute('data-a'), b: el.getAttribute('data-b'), el: el });
    });
    applyState();
  }

  // ---------- фильтр и поиск ----------
  function applyState() {
    if (!cardEls) return;
    var focus = state.hover || state.pinned;
    var q = norm(state.query), active = null, search = false;
    if (focus && byCode[focus]) {
      active = related(focus);
    } else if (q) {
      active = {}; search = true;
      P.nodes.forEach(function (n) { if (matches(n, q)) active[n.code] = true; });
    } else if (state.track !== 'all') {
      active = {};
      P.nodes.forEach(function (n) { if (n.track === state.track) active[n.code] = true; });
    }
    $('tree').classList.toggle('rm-dim', !!active);
    Object.keys(cardEls).forEach(function (code) {
      var c = cardEls[code];
      c.classList.toggle('is-on', !!(active && active[code]));
      c.classList.toggle('is-self', !!focus && !search && code === focus);
      c.classList.toggle('is-match', search && !!active[code]);
    });
    (edgeEls || []).forEach(function (e) {
      e.el.classList.toggle('is-on', !!(active && active[e.a] && active[e.b]));
    });
    var pinned = state.pinned && byCode[state.pinned];
    root.classList.toggle('rm--pinned', !!pinned);
    if (pinned) {
      var n = pinned.node;
      $('focusname').textContent = n.kind === 'choice' ? n.options.map(function (o) { return o.name; }).join(' / ') : n.name;
    }
  }

  // ---------- модальное окно ----------
  function relItem(code) {
    var n = byCode[code].node;
    var label = n.kind === 'choice' ? 'По выбору: ' + n.options.map(function (o) { return o.name; }).join(' / ') : n.name;
    var target = n.kind === 'choice' ? n.options[0].code : code;
    var when = n.kind === 'gia' ? 'финиш' : range(n.sems) + ' сем.';
    return '<button type="button" class="rm-rel-item" data-goto="' + esc(target) + '" style="' + vars(n.track) + '"><i></i><span>' +
      esc(label) + '</span><small>' + when + '</small></button>';
  }

  function formsSummary(n) {
    var cnt = {}, order = [];
    (n.perSem || []).forEach(function (p) {
      p.forms.forEach(function (f) { if (!cnt[f]) { cnt[f] = 0; order.push(f); } cnt[f]++; });
    });
    if (!order.length) return n.kind === 'gia' ? 'Защита ВКР' : '—';
    return order.map(function (f) { return f + (cnt[f] > 1 ? ' ×' + cnt[f] : ''); }).join(', ');
  }

  function modalHtml(code) {
    var entry = byCode[code], n = entry.node, g = entry.parent, base = g || n;
    var track = trackById[base.track];
    var tags = '<span class="rm-tag rm-tag--c"><i></i>' + esc(track ? track.name : '') + '</span>' +
      '<span class="rm-tag">' + esc(n.part || base.part) + '</span>';
    var when = n.sems.length > 1 ? range(n.sems) + ' семестры' : n.sems[0] + ' семестр';
    var facts =
      '<div class="rm-fact"><span>Когда</span><b>' + when + '</b><span>' + courses(n.sems) + '</span></div>' +
      '<div class="rm-fact"><span>Объём</span><b>' + (n.ze ? n.ze + ' з.е.' : '—') + '</b><span>' + (n.hours ? hoursWord(n.hours) : '') + '</span></div>' +
      '<div class="rm-fact"><span>Аттестация</span><b>' + esc(formsSummary(n)) + '</b></div>';

    var html = '<div class="rm-m-top" style="' + vars(base.track) + '"></div><div class="rm-m-body" style="' + vars(base.track) + '">' +
      '<div class="rm-m-row"><div class="rm-m-tags">' + tags + '</div><button type="button" class="rm-close" data-rm="close" aria-label="Закрыть">' + ICON_X + '</button></div>' +
      '<div class="rm-m-code">' + esc(n.code) + (base.module ? ' · ' + esc(base.module) : '') + '</div>' +
      '<h2 class="rm-m-title" id="rm-modal-title">' + esc(n.name) + '</h2>' +
      '<div class="rm-facts">' + facts + '</div>';

    if (g) {
      var alt = g.options.filter(function (o) { return o.code !== n.code; })[0];
      var what = g.mobility
        ? 'Модуль мобильности: студент выбирает один из двух онлайн-курсов.'
        : 'Дисциплина по выбору: студент изучает одну из двух дисциплин.';
      html += '<div class="rm-sec"><div class="rm-choicebox">' + what + (alt ? ' Вторая: <button type="button" data-goto="' + esc(alt.code) + '">' + esc(alt.name) + '</button>' : '') + '</div></div>';
    }
    if (n.kind === 'optional') {
      html += '<div class="rm-sec"><div class="rm-choicebox">Факультатив: изучается по желанию и не входит в 240 з.е. программы.</div></div>';
    }
    var block = n.kind === 'practice' || n.kind === 'gia';
    if (block) {
      var weeks = (n.perSem || []).map(function (p) { return p.weeks; }).filter(Boolean)[0];
      var w = '';
      if (typeof weeks === 'number') w = weeks + ' ' + plural(weeks, 'неделя', 'недели', 'недель');
      else if (weeks) w = String(weeks).replace(' 1/3', '⅓').replace(' 2/3', '⅔') + ' недели';
      html += '<div class="rm-sec"><div class="rm-choicebox">' +
        (w ? 'Продолжительность: ' + w + '. ' : '') + 'Объём: ' + hoursWord(n.hours) +
        (n.contact ? ', из них контактная работа ' + n.contact + ' ч' : '') + '.</div></div>';
    }

    var hb = n.hoursBy || {}, total = HOURS.reduce(function (s, h) { return s + (hb[h[0]] || 0); }, 0);
    if (total > 0 && !block) {
      var used = HOURS.filter(function (h) { return hb[h[0]]; });
      html += '<div class="rm-sec"><div class="rm-sec-title">Из чего состоят ' + hoursWord(total) +
        (n.contact ? ' · контактная работа ' + n.contact + ' ч' : '') + '</div><div class="rm-bar">' +
        used.map(function (h) {
          return '<i style="flex:' + hb[h[0]] + ';background:' + h[2] + '" title="' + h[1] + ': ' + hb[h[0]] + ' ч"></i>';
        }).join('') + '</div><div class="rm-bar-legend">' +
        used.map(function (h) {
          return '<span><i style="background:' + h[2] + '"></i>' + h[1] + ' <b>' + hb[h[0]] + '</b></span>';
        }).join('') + '</div></div>';
    }

    if (n.perSem && n.perSem.length > 1) {
      html += '<div class="rm-sec"><div class="rm-sec-title">По семестрам</div><div class="rm-sems">' + n.perSem.map(function (p) {
        var parts = HOURS.filter(function (h) { return p[h[0]]; }).map(function (h) { return SHORT_HOURS[h[0]] + ' ' + p[h[0]]; }).join(' · ');
        return '<div class="rm-semrow"><b>' + p.sem + ' семестр</b><span>' + (p.ze ? p.ze + ' з.е.' : '') + (parts ? (p.ze ? ' · ' : '') + parts : '') +
          '</span><em>' + esc(p.forms.join(', ') || 'без аттестации') + '</em></div>';
      }).join('') + '</div></div>';
    }

    var ins = inAdj[base.code] || [], outs = outAdj[base.code] || [];
    html += '<div class="rm-sec rm-rel">' +
      '<div><div class="rm-sec-title">Опирается на</div><div class="rm-rel-list">' +
      (ins.length ? ins.map(relItem).join('') : '<span class="rm-rel-empty">Стартовая дисциплина</span>') + '</div></div>' +
      '<div><div class="rm-sec-title">Готовит к</div><div class="rm-rel-list">' +
      (outs.length ? outs.map(relItem).join('') : '<span class="rm-rel-empty">' + (n.kind === 'gia' ? 'Диплом бакалавра' : 'Завершающая дисциплина') + '</span>') + '</div></div></div>';

    html += '<p class="rm-m-foot">Источник: учебный план ' + esc(P.meta.code) + ', набор ' + P.meta.startYear + ' г.</p></div>';
    return html;
  }

  function openModal(code, opener) {
    if (!byCode[code]) return;
    var modal = $('modal'), panel = $('panel'), wasOpen = modal.classList.contains('is-open');
    if (!wasOpen) lastOpener = opener || document.activeElement;
    panel.innerHTML = modalHtml(code);
    panel.scrollTop = 0;
    if (!wasOpen) {
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
      prevOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = 'hidden';
    }
    panel.focus();
    var entry = byCode[code];
    state.pinned = (entry.parent || entry.node).code;
    state.hover = null;
    applyState();
    setHash(code);
  }

  function closeModal() {
    var modal = $('modal');
    if (!modal.classList.contains('is-open')) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.documentElement.style.overflow = prevOverflow || '';
    setHash(null);
    if (lastOpener && document.body.contains(lastOpener)) lastOpener.focus({ preventScroll: true });
  }

  function setHash(code) {
    if (!window.history || !history.replaceState) return;
    var url = location.pathname + location.search + (code ? '#roadmap=' + encodeURIComponent(P.id + ':' + code) : '');
    history.replaceState(null, '', url);
  }
  function readHash() {
    var m = /#roadmap=([^&]+)/.exec(location.hash);
    if (!m) return;
    var parts = decodeURIComponent(m[1]).split(':');
    var pi = DATA.programs.map(function (p) { return p.id; }).indexOf(parts[0]);
    if (pi < 0) return;
    if (pi !== state.pi) { state.pi = pi; renderAll(); }
    if (byCode[parts[1]]) openModal(parts[1]);
  }

  // ---------- события ----------
  root.addEventListener('click', function (ev) {
    var t = ev.target;
    var sw = t.closest('.rm-switch button');
    if (sw) { state.pi = +sw.getAttribute('data-pi'); state.track = 'all'; state.pinned = null; renderAll(); return; }
    var chip = t.closest('[data-track]');
    if (chip) {
      state.track = chip.getAttribute('data-track'); state.pinned = null;
      renderTracks();
      if (mqNarrow.matches) renderGrid(); else applyState();
      return;
    }
    if (t.closest('[data-rm="close"]')) { closeModal(); return; }
    if (t.closest('[data-rm="unfocus"]')) { state.pinned = null; applyState(); return; }
    var go = t.closest('[data-goto]');
    if (go) { openModal(go.getAttribute('data-goto')); return; }
    var open = t.closest('[data-open]');
    if (open) { openModal(open.getAttribute('data-open'), open); return; }
    if (t.closest('[data-rm="grid"]') && !t.closest('.rm-card') && state.pinned) { state.pinned = null; applyState(); }
  });

  root.addEventListener('pointerover', function (ev) {
    if (ev.pointerType !== 'mouse') return;
    var c = ev.target.closest('[data-rm="grid"] [data-code]');
    var code = c ? c.getAttribute('data-code') : null;
    if (code !== state.hover) { state.hover = code; applyState(); }
  });
  $('grid').addEventListener('pointerleave', function () { if (state.hover) { state.hover = null; applyState(); } });

  $('search').addEventListener('input', function (ev) { state.query = ev.target.value.trim(); state.pinned = null; applyState(); });
  $('search').addEventListener('keydown', function (ev) {
    if (ev.key !== 'Enter') return;
    var first = $('grid').querySelector('.is-match');
    if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  });

  document.addEventListener('keydown', function (ev) {
    var modal = $('modal');
    if (!modal.classList.contains('is-open')) return;
    if (ev.key === 'Escape') { ev.preventDefault(); closeModal(); return; }
    if (ev.key === 'Tab') {
      var f = $('panel').querySelectorAll('a[href], button');
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (ev.shiftKey && (document.activeElement === first || document.activeElement === $('panel'))) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
    }
  });

  if (window.ResizeObserver) new ResizeObserver(scheduleDraw).observe($('grid'));
  else window.addEventListener('resize', scheduleDraw);
  var onMq = function () { renderHint(); renderGrid(); };
  if (mqNarrow.addEventListener) mqNarrow.addEventListener('change', onMq); else mqNarrow.addListener(onMq);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleDraw);

  function renderHint() {
    var touch = window.matchMedia('(hover: none)').matches;
    $('hint').textContent = touch
      ? 'Нажмите на блок — откроются подробности, а на дереве подсветится цепочка связей.' +
        (mqNarrow.matches ? ' Дерево листается вбок, кнопки модулей показывают одну колонку.' : '')
      : 'Нажмите на блок, чтобы открыть подробности. Наведите курсор — подсветится вся цепочка связей.';
  }

  function renderAll() {
    renderHint();
    indexProgram();
    renderHeader();
    renderTracks();
    renderGrid();
  }
  renderAll();
  readHash();
})();

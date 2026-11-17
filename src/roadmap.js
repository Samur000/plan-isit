/* Дорожная карта ОП — ДГУ. Без зависимостей. Данные: window.DGU_ROADMAP_DATA */
(function () {
  'use strict';

  var DATA = window.DGU_ROADMAP_DATA;
  var root = document.getElementById('dgu-roadmap');
  if (!root || !DATA || !DATA.programs || !DATA.programs.length) return;

  var PALETTE = {
    math:   { c: '#D97706', t: '#FEF3C7', d: '#92400E' },
    prog:   { c: '#1D5FD6', t: '#DCE8FC', d: '#123E8C' },
    data:   { c: '#0F9488', t: '#CCF2EC', d: '#0B5F57' },
    sys:    { c: '#7C3AED', t: '#EDE7FD', d: '#4C1D95' },
    sec:    { c: '#DC2626', t: '#FDE2E2', d: '#8F1D1D' },
    crypto: { c: '#DB2777', t: '#FCE4F0', d: '#8A1747' },
    prac:   { c: '#16A34A', t: '#DCF5E3', d: '#14532D' },
    gen:    { c: '#64748B', t: '#EEF1F5', d: '#334155' }
  };
  var FALLBACK = PALETTE.gen;
  var HOURS = [
    ['lec', 'Лекции', '#1D5FD6'],
    ['lab', 'Лабораторные', '#0F9488'],
    ['pr', 'Практические', '#7C3AED'],
    ['self', 'Самостоятельная работа', '#B6C2D4'],
    ['control', 'Контроль', '#F59E0B']
  ];
  var SHORT_HOURS = { lec: 'лекции', lab: 'лаб.', pr: 'практ.', self: 'самост.', control: 'контроль' };
  var NS = 'http://www.w3.org/2000/svg';
  var ICON_DOC = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>';
  var ICON_LINK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>';
  var ICON_X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';

  var mqNarrow = window.matchMedia('(max-width: 760px)');
  var state = { pi: 0, track: 'all', query: '', hover: null, pinned: null };
  var P, byCode, outAdj, inAdj, cardEls, edgeEls, lastOpener, prevOverflow;

  // ---------- утилиты ----------
  function $(name) { return root.querySelector('[data-rm="' + name + '"]'); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  function vars(track) { var p = PALETTE[track] || FALLBACK; return '--c:' + p.c + ';--t:' + p.t + ';--d:' + p.d; }
  function color(track) { return (PALETTE[track] || FALLBACK).c; }
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

  // ---------- данные программы ----------
  function indexProgram() {
    P = DATA.programs[state.pi];
    byCode = {}; outAdj = {}; inAdj = {};
    P.nodes.forEach(function (n) {
      byCode[n.code] = { node: n, parent: null };
      (n.options || []).forEach(function (o) { byCode[o.code] = { node: o, parent: n }; });
    });
    P.edges.forEach(function (e) {
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
    var hay = norm(n.name + ' ' + n.short + ' ' + n.code);
    (n.options || []).forEach(function (o) { hay += ' ' + norm(o.name + ' ' + o.short); });
    return hay.indexOf(q) >= 0;
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

    var counted = P.nodes.filter(function (n) { return n.kind !== 'optional'; });
    var ze = counted.reduce(function (s, n) { return s + (n.ze || 0); }, 0);
    var disc = P.nodes.filter(function (n) { return ['core', 'variable', 'sport'].indexOf(n.kind) >= 0; }).length;
    var choices = P.nodes.filter(function (n) { return n.kind === 'choice'; }).length;
    var practices = P.nodes.filter(function (n) { return n.kind === 'practice'; }).length;
    var stats = [
      [m.years, plural(m.years, 'год', 'года', 'лет') + ' обучения, ' + m.form.toLowerCase() + ' форма'],
      [ze, 'зачётных единиц'],
      [disc, plural(disc, 'обязательная дисциплина', 'обязательные дисциплины', 'обязательных дисциплин')],
      [choices, plural(choices, 'выбор', 'выбора', 'выборов') + ' из двух дисциплин'],
      [practices, plural(practices, 'практика', 'практики', 'практик') + ' и защита ВКР']
    ];
    $('stats').innerHTML = stats.map(function (s) { return '<li><b>' + s[0] + '</b><span>' + esc(s[1]) + '</span></li>'; }).join('');
    $('links').innerHTML =
      '<a href="' + esc(m.planUrl) + '" target="_blank" rel="noopener">' + ICON_DOC + 'Учебный план (PDF)</a>' +
      '<a href="' + esc(m.eorUrl) + '" target="_blank" rel="noopener">' + ICON_LINK + 'Электронные образовательные ресурсы</a>' +
      '<span style="color:var(--rm-faint)">' + esc(m.fgos) + ' · набор ' + m.startYear + ' г.</span>';
  }

  function renderTracks() {
    var html = '<button type="button" class="rm-chip" data-track="all" aria-pressed="' + (state.track === 'all') + '">Все направления</button>';
    P.tracks.forEach(function (t) {
      html += '<button type="button" class="rm-chip" data-track="' + t.id + '" style="' + vars(t.id) + '" aria-pressed="' +
        (state.track === t.id) + '"><i></i>' + esc(t.name) + '</button>';
    });
    $('tracks').innerHTML = html;
  }

  // ---------- дерево ----------
  function cardHtml(n) {
    if (n.kind === 'choice') {
      var head = n.name === 'Модуль мобильности' ? 'Модуль мобильности' : 'По выбору';
      var opts = n.options.map(function (o) {
        return '<button type="button" class="rm-opt" data-open="' + esc(o.code) + '" title="' + esc(o.name) + '">' + esc(o.short) + '</button>';
      }).join('<span class="rm-or">или</span>');
      return '<div class="rm-card rm-card--choice" data-code="' + esc(n.code) + '" style="' + vars(n.track) + '">' +
        '<div class="rm-choice-head">' + head + '<span>' + esc(volume(n)) + (mainForm(n) ? ' · ' + mainForm(n) : '') + '</span></div>' +
        opts + '</div>';
    }
    var cls = 'rm-card';
    if (n.track === 'gen') cls += ' rm-card--compact';
    if (n.kind === 'practice') cls += ' rm-card--practice';
    if (n.kind === 'gia') cls += ' rm-card--gia';
    if (n.kind === 'optional') cls += ' rm-card--optional';
    var form = mainForm(n);
    if (n.track === 'gen') {
      var bits = [volume(n), form, n.sems.length > 1 ? range(n.sems) + ' сем.' : ''].filter(Boolean).join(' · ');
      return '<button type="button" class="' + cls + '" data-code="' + esc(n.code) + '" data-open="' + esc(n.code) + '" style="' + vars(n.track) + '" aria-label="' + esc(n.name) + '">' +
        '<span class="rm-card-name">' + esc(n.short) + '</span><span class="rm-card-meta">' + esc(bits) + '</span></button>';
    }
    var meta = '<span class="rm-pill">' + esc(volume(n)) + '</span>';
    if (form) meta += '<span class="rm-pill' + (form === 'экзамен' ? ' rm-pill--exam' : '') + '">' + form + '</span>';
    if (n.sems.length > 1) meta += '<span class="rm-pill rm-pill--c">' + range(n.sems) + ' сем.</span>';
    if (n.kind === 'optional') meta += '<span class="rm-pill">факультатив</span>';
    return '<button type="button" class="' + cls + '" data-code="' + esc(n.code) + '" data-open="' + esc(n.code) + '" style="' + vars(n.track) + '" aria-label="' + esc(n.name) + '">' +
      '<span class="rm-card-name">' + esc(n.short) + '</span><span class="rm-card-meta">' + meta + '</span></button>';
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

  // порядок внутри ячейки: обязательные -> профильные -> по выбору -> факультативы
  var RANK = { core: 0, practice: 0, gia: 0, variable: 1, sport: 1, choice: 2, optional: 3 };
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
        cnt + ' ' + plural(cnt, 'блок', 'блока', 'блоков') + '</span></div>';
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

    // фоновые «ветки»: полосы направлений
    grid.querySelectorAll('.rm-lanehead').forEach(function (h) {
      var b = box(h), p = PALETTE[h.getAttribute('data-lane')] || FALLBACK;
      out += '<rect x="' + (b.l + 3) + '" y="2" width="' + (b.w - 6) + '" height="' + (H - 4) + '" rx="16" fill="' + p.t + '" fill-opacity=".38"/>';
    });

    // точки выхода/входа разносим, чтобы стрелки не сливались
    var boxes = {}, outs = {}, ins = {};
    P.edges.forEach(function (e) {
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
    P.edges.forEach(function (e) {
      var a = boxes[e[0]], b = boxes[e[1]];
      if (!a || !b) return;
      var key = e[0] + '>' + e[1];
      var x1 = xOut[key], y1 = a.t + a.h, x2 = xIn[key], y2 = b.t - 1;
      var dy = Math.max(26, Math.min(140, (y2 - y1) * 0.45));
      var track = byCode[e[0]].node.track;
      out += '<path class="rm-edge" data-a="' + esc(e[0]) + '" data-b="' + esc(e[1]) + '" d="M' + x1.toFixed(1) + ' ' + y1.toFixed(1) +
        ' C' + x1.toFixed(1) + ' ' + (y1 + dy).toFixed(1) + ' ' + x2.toFixed(1) + ' ' + (y2 - dy).toFixed(1) + ' ' + x2.toFixed(1) + ' ' + y2.toFixed(1) +
        '" stroke="' + color(track) + '" marker-end="url(#rm-ah-' + (PALETTE[track] ? track : 'gen') + ')"/>';
    });
    svg.innerHTML = out;
    svg.querySelectorAll('.rm-edge').forEach(function (p) {
      edgeEls.push({ a: p.getAttribute('data-a'), b: p.getAttribute('data-b'), el: p });
    });
    applyState();
  }

  // ---------- подсветка, фильтр, поиск ----------
  function applyState() {
    if (!cardEls) return;
    var focus = state.hover || state.pinned;
    var q = norm(state.query);
    var active = null, mode = null;
    if (focus && byCode[focus]) { active = related(focus); mode = 'focus'; }
    else if (q) {
      active = {}; mode = 'search';
      P.nodes.forEach(function (n) { if (matches(n, q)) active[n.code] = true; });
    } else if (state.track !== 'all') {
      active = {}; mode = 'track';
      P.nodes.forEach(function (n) { if (n.track === state.track) active[n.code] = true; });
    }
    $('tree').classList.toggle('rm-dim', !!active);
    Object.keys(cardEls).forEach(function (code) {
      var c = cardEls[code];
      c.classList.toggle('is-on', !!(active && active[code]));
      c.classList.toggle('is-self', mode === 'focus' && code === focus);
      c.classList.toggle('is-match', mode === 'search' && !!active[code]);
    });
    (edgeEls || []).forEach(function (e) {
      e.el.classList.toggle('is-on', !!(active && active[e.a] && active[e.b]));
    });
    var pinned = state.pinned && byCode[state.pinned];
    root.classList.toggle('rm--pinned', !!pinned);
    if (pinned) {
      var n = pinned.node;
      $('focusname').textContent = n.kind === 'choice' ? n.options.map(function (o) { return o.short; }).join(' / ') : n.name;
    }
  }

  // ---------- модальное окно ----------
  function relItem(code) {
    var n = byCode[code].node;
    var label = n.kind === 'choice' ? 'По выбору: ' + n.options.map(function (o) { return o.short; }).join(' / ') : n.short;
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
    var track = P.tracks.filter(function (t) { return t.id === base.track; })[0];
    var tags = '<span class="rm-tag rm-tag--c"><i></i>' + esc(track ? track.name : '') + '</span>' +
      '<span class="rm-tag">' + esc(n.part || base.part) + '</span>';
    var when = n.kind === 'gia' ? '8 семестр' : (n.sems.length > 1 ? range(n.sems) + ' семестры' : n.sems[0] + ' семестр');
    var facts =
      '<div class="rm-fact"><span>Когда</span><b>' + when + '</b><span>' + courses(n.sems) + '</span></div>' +
      '<div class="rm-fact"><span>Объём</span><b>' + (n.ze ? n.ze + ' з.е.' : '—') + '</b><span>' + (n.hours ? n.hours + ' ' + plural(n.hours, 'час', 'часа', 'часов') : '') + '</span></div>' +
      '<div class="rm-fact"><span>Аттестация</span><b>' + esc(formsSummary(n)) + '</b></div>';

    var html = '<div class="rm-m-top" style="' + vars(base.track) + '"></div><div class="rm-m-body" style="' + vars(base.track) + '">' +
      '<div class="rm-m-row"><div class="rm-m-tags">' + tags + '</div><button type="button" class="rm-close" data-rm="close" aria-label="Закрыть">' + ICON_X + '</button></div>' +
      '<div class="rm-m-code">' + esc(n.code) + (base.module ? ' · ' + esc(base.module) : '') + '</div>' +
      '<h2 class="rm-m-title" id="rm-modal-title">' + esc(n.name) + '</h2>' +
      '<div class="rm-facts">' + facts + '</div>';

    if (g) {
      var alt = g.options.filter(function (o) { return o.code !== n.code; })[0];
      var what = g.name === 'Модуль мобильности'
        ? 'Модуль мобильности: онлайн-курс партнёрского вуза. Студент выбирает один из двух курсов.'
        : 'Дисциплина по выбору: студент изучает одну из двух дисциплин.';
      html += '<div class="rm-sec"><div class="rm-choicebox">' + what + (alt ? ' Вторая: <button type="button" data-goto="' + esc(alt.code) + '">' + esc(alt.name) + '</button>' : '') + '</div></div>';
    }
    if (n.kind === 'optional') {
      html += '<div class="rm-sec"><div class="rm-choicebox">Факультатив: изучается по желанию и не входит в 240 з.е. программы.</div></div>';
    }

    var hb = n.hoursBy || {}, total = HOURS.reduce(function (s, h) { return s + (hb[h[0]] || 0); }, 0);
    if (total > 0) {
      html += '<div class="rm-sec"><div class="rm-sec-title">Из чего состоят ' + total + ' ' + plural(total, 'час', 'часа', 'часов') + '</div><div class="rm-bar">' +
        HOURS.filter(function (h) { return hb[h[0]]; }).map(function (h) {
          return '<i style="flex:' + hb[h[0]] + ';background:' + h[2] + '" title="' + h[1] + ': ' + hb[h[0]] + ' ч"></i>';
        }).join('') + '</div><div class="rm-bar-legend">' +
        HOURS.filter(function (h) { return hb[h[0]]; }).map(function (h) {
          return '<span><i style="background:' + h[2] + '"></i>' + h[1] + ' <b>' + hb[h[0]] + '</b></span>';
        }).join('') + '</div></div>';
    } else if (n.hours && (n.kind === 'practice' || n.kind === 'gia')) {
      html += '<div class="rm-sec"><div class="rm-choicebox">' + (n.kind === 'gia'
        ? 'Подготовка к защите и защита выпускной квалификационной работы — завершающий этап обучения.'
        : 'Практика: работа в лаборатории, на кафедре или в организации-партнёре.') +
        ' Объём — ' + n.hours + ' ' + plural(n.hours, 'час', 'часа', 'часов') + '.</div></div>';
    }

    if (n.perSem && n.perSem.length > 1) {
      html += '<div class="rm-sec"><div class="rm-sec-title">По семестрам</div><div class="rm-sems">' + n.perSem.map(function (p) {
        var parts = HOURS.filter(function (h) { return p[h[0]]; }).map(function (h) { return SHORT_HOURS[h[0]] + ' ' + p[h[0]]; }).join(' · ');
        return '<div class="rm-semrow"><b>' + p.sem + ' семестр</b><span>' + (p.ze ? p.ze + ' з.е.' : '') + (parts ? (p.ze ? ' · ' : '') + parts : '') +
          '</span><em>' + esc(p.forms.join(', ') || 'без аттестации') + '</em></div>';
      }).join('') + '</div></div>';
    }

    var key = base.code;
    var ins = (inAdj[key] || []), outs = (outAdj[key] || []);
    html += '<div class="rm-sec rm-rel">' +
      '<div><div class="rm-sec-title">Опирается на</div><div class="rm-rel-list">' +
      (ins.length ? ins.map(relItem).join('') : '<span class="rm-rel-empty">Стартовая дисциплина ветки</span>') + '</div></div>' +
      '<div><div class="rm-sec-title">Готовит к</div><div class="rm-rel-list">' +
      (outs.length ? outs.map(relItem).join('') : '<span class="rm-rel-empty">' + (n.kind === 'gia' ? 'Диплом бакалавра' : 'Завершает ветку') + '</span>') + '</div></div></div>';

    html += '<div class="rm-sec"><div class="rm-sec-title">Документы</div>';
    if (n.rpd || n.fos) {
      html += '<div class="rm-docs">' +
        (n.rpd ? '<a class="rm-btn rm-btn--primary" href="' + esc(n.rpd) + '" target="_blank" rel="noopener">' + ICON_DOC + 'Рабочая программа</a>' : '') +
        (n.fos ? '<a class="rm-btn rm-btn--outline" href="' + esc(n.fos) + '" target="_blank" rel="noopener">' + ICON_DOC + 'Оценочные материалы (ФОС)</a>' : '') +
        '</div>';
    } else {
      html += '<div class="rm-docs-empty">Рабочая программа пока не размещена в ЭОР.</div>';
    }
    html += '</div><p class="rm-m-foot">Источник: учебный план ' + esc(P.meta.code) + ', набор ' + P.meta.startYear + ' г.; документы — ЭОР ДГУ.</p></div>';
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

  // ---------- блок «После выпуска» ----------
  function renderOutcomes() {
    var box = $('outcomes'), o = P.outcomes;
    box.style.display = o ? '' : 'none';
    if (!o) { box.innerHTML = ''; return; }
    var skills = (o.skills || []).map(function (sk) {
      var chips = (sk.codes || []).filter(function (c) { return byCode[c]; }).map(function (c) {
        return '<button type="button" class="rm-out-chip" data-open="' + esc(c) + '" title="' + esc(byCode[c].node.name) + '">' +
          esc(byCode[c].node.short) + '</button>';
      }).join('');
      return '<li style="' + vars(sk.track) + '"><i aria-hidden="true"></i><div><b>' + esc(sk.title) + '</b><p>' + esc(sk.text) +
        '</p><div class="rm-out-chips">' + chips + '</div></div></li>';
    }).join('');
    box.innerHTML =
      '<div class="rm-out-head"><h2 id="rm-out-title">' + esc(o.title) + '</h2>' +
      (o.lead || []).map(function (t) { return '<p>' + esc(t) + '</p>'; }).join('') + '</div>' +
      '<div class="rm-out-grid">' +
        '<div><h3>' + esc(o.skillsTitle) + '</h3><ul class="rm-out-skills">' + skills + '</ul></div>' +
        '<aside class="rm-out-side"><h3>' + esc(o.rolesTitle) + '</h3><ul class="rm-out-roles">' +
          (o.roles || []).map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul>' +
          (o.spheres ? '<h3>' + esc(o.spheresTitle || 'Сферы') + '</h3><p class="rm-out-spheres">' + esc(o.spheres) + '</p>' : '') +
          (o.searches && o.searches.length ? '<h3>' + esc(o.hhTitle) + '</h3><ul class="rm-out-search">' +
            o.searches.map(function (q) {
              return '<li><a href="' + esc(q.url) + '" target="_blank" rel="noopener">' + esc(q.label) + ICON_LINK + '</a></li>';
            }).join('') + '</ul>' : '') +
          (o.companyGroups && o.companyGroups.length ? '<h3>' + esc(o.companiesTitle) + '</h3>' +
            o.companyGroups.map(function (g) {
              return '<div class="rm-out-cgroup"><span>' + esc(g.title) + '</span><div class="rm-out-companies">' +
                g.items.map(function (c) {
                  return '<a href="https://hh.ru/employer/' + encodeURIComponent(c.id) + '" target="_blank" rel="noopener" title="' +
                    esc(c.name) + ' на hh.ru">' + esc(c.name) + '</a>';
                }).join('') + '</div></div>';
            }).join('') : '') +
          (o.note ? '<p class="rm-out-note">' + esc(o.note) + '</p>' : '') +
        '</aside></div>';
  }

  function renderHint() {
    var touch = window.matchMedia('(hover: none)').matches;
    $('hint').textContent = touch
      ? 'Нажмите на блок — откроются подробности, а на дереве подсветится цепочка связей.' +
        (mqNarrow.matches ? ' Дерево листается вбок; кнопки направлений показывают одну ветку.' : '')
      : 'Нажмите на блок, чтобы открыть подробности. Наведите курсор — подсветится вся цепочка связей.';
  }

  function renderAll() {
    renderHint();
    indexProgram();
    renderHeader();
    renderTracks();
    renderGrid();
    renderOutcomes();
  }
  renderAll();
  readHash();
})();

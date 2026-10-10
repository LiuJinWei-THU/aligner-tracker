/* 页面逻辑：三个页签、状态切换、编辑补录、导入导出、多周期统计 */
(function () {
  'use strict';

  var S = window.AlignerStorage;
  var T = window.AlignerStats;
  var CH = window.AlignerCharts;
  var H = 3600000;

  var data = S.load();
  var range = '7'; // '7' | '30' | 'w'（近12周）| 'm'（近12月）
  var $ = function (id) { return document.getElementById(id); };

  // 统计页当前渲染所依据的数据（供柱子点击回调使用）
  var curMode = 'day';
  var curDays = null;    // 日视图
  var curBuckets = null; // 周/月视图

  /* ---------------- 工具 ---------------- */
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function fmtDur(ms) {
    var min = Math.floor(ms / 60000);
    var h = Math.floor(min / 60), m = min % 60;
    if (h === 0) return m + '分钟';
    if (m === 0) return h + '小时';
    return h + '小时' + m + '分';
  }

  function fmtClock(ts) {
    var d = new Date(ts);
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  var WEEK = ['日', '一', '二', '三', '四', '五', '六'];
  function fmtDayHeader(ts) {
    var d = new Date(ts);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 周' + WEEK[d.getDay()];
  }

  function tsToLocalInput(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
      'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function vibrate(ms) {
    if (navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { /* 忽略 */ } }
  }

  function persist() {
    S.save(data);
    refreshAll();
  }

  /* ---------------- 页签切换 ---------------- */
  var tabs = ['today', 'stats', 'records'];
  function switchTab(name) {
    tabs.forEach(function (t) {
      $('page-' + t).classList.toggle('active', t === name);
    });
    document.querySelectorAll('.tabbar button').forEach(function (b) {
      b.classList.toggle('active', b.dataset.tab === name);
    });
    if (name === 'stats') renderStats(true);
    if (name === 'records') refreshRecords();
    window.scrollTo(0, 0);
  }

  /* ---------------- 主页（今天） ---------------- */
  function refreshHome() {
    var now = Date.now();
    var goalMs = data.settings.dailyGoalHours * H;
    var wearing = T.currentState(data.events);
    var session = T.sessionInfo(data.events, now);
    var today = T.dailyStats(data.events, now, 1)[0];
    var wornMs = today.wornMs === null ? 0 : today.wornMs;

    // 状态条
    var chip = $('status-chip');
    chip.textContent = wearing ? '🦷 正在佩戴' : '🍖 已摘下';
    chip.className = 'status-chip ' + (wearing ? 'on' : 'off');

    // 进度环
    var ratio = goalMs > 0 ? wornMs / goalMs : 0;
    $('ring-holder').innerHTML = CH.ring(ratio, wearing ? 'var(--c-green)' : 'var(--c-orange)');
    $('ring-main').textContent = fmtDur(wornMs);
    var met = wornMs >= goalMs;
    $('ring-sub').textContent = met ? '已达成今日目标 🎉' : '目标 ' + data.settings.dailyGoalHours + ' 小时';

    // 还能摘多久
    var allowance = goalMs - wornMs;
    var ac = $('allowance-card');
    if (allowance > 0) {
      var remaining = Math.max(0, 24 * H - (now - T.startOfDay(now)));
      var msg = '今天还能摘 <b>' + fmtDur(Math.min(allowance, remaining)) + '</b>';
      if (allowance >= remaining) msg = '今天剩余时间都戴着，即可达成目标';
      ac.innerHTML = msg + '<span class="card-sub">超过就要戴满 24 小时了</span>';
      ac.className = 'card allowance';
    } else {
      ac.innerHTML = '今天还能摘 <b>0 分钟</b>，之后需一直佩戴<span class="card-sub">想达标就别再摘啦</span>';
      ac.className = 'card allowance warn';
    }

    // 本次状态 & 摘戴次数
    $('session-label').textContent = wearing ? '本次已戴' : '本次已摘';
    $('session-dur').textContent = fmtDur(session.durationMs);
    $('session-since').textContent = '自 ' + fmtClock(session.sinceTs);
    $('off-count').textContent = T.offCountToday(data.events, now) + ' 次';

    // 大按钮
    var btn = $('btn-toggle');
    if (wearing) {
      btn.className = 'btn-main off-action';
      $('btn-toggle-icon').innerHTML = ICON_DOWN;
      $('btn-toggle-text').textContent = '摘下牙套';
      $('btn-toggle-sub').textContent = '吃饭/刷牙时点我';
    } else {
      btn.className = 'btn-main on-action';
      $('btn-toggle-icon').innerHTML = ICON_UP;
      $('btn-toggle-text').textContent = '戴上牙套';
      $('btn-toggle-sub').textContent = '戴回去就点我';
    }
  }

  var ICON_DOWN = '<svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M12 16l-6-6h4V4h4v6h4z"/><path d="M5 18h14v2H5z"/></svg>';
  var ICON_UP = '<svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M12 4l6 6h-4v6h-4v-6H6z"/><path d="M5 18h14v2H5z"/></svg>';

  function toggleAligner() {
    var wearing = T.currentState(data.events);
    var ev = { id: S.genId(), type: wearing ? 'off' : 'on', ts: Date.now() };
    data.events.push(ev);
    data.events.sort(function (a, b) { return a.ts - b.ts; });
    S.save(data);
    vibrate(40);
    showToast(
      (ev.type === 'off' ? '已记录：摘下牙套 ' : '已记录：戴上牙套 ') + fmtClock(ev.ts),
      '撤销',
      function () {
        data.events = data.events.filter(function (e) { return e.id !== ev.id; });
        persist();
      }
    );
    refreshAll();
  }

  /* ---------------- 统计页 ---------------- */
  function rangeInfo() {
    switch (range) {
      case 'w': return { mode: 'week', unit: '周', buckets: 12, title: '每周平均每天佩戴（小时）', caption: '点击柱子可查看该周详情' };
      case 'm': return { mode: 'month', unit: '月', buckets: 12, title: '每月平均每天佩戴（小时）', caption: '点击柱子可查看该月详情' };
      case '30': return { mode: 'day', days: 30, title: '每日佩戴时长（小时）', caption: '点击柱子可查看当天详情' };
      default: return { mode: 'day', days: 7, title: '每日佩戴时长（小时）', caption: '点击柱子可查看当天详情' };
    }
  }

  function renderStats(animate) {
    var now = Date.now();
    var goalHours = data.settings.dailyGoalHours;
    var goalMs = goalHours * H;
    var info = rangeInfo();
    var goalHours_ = goalHours; // 局部别名，供下方闭包使用
    var items, days;

    if (info.mode === 'day') {
      curMode = 'day';
      curBuckets = null;
      days = T.dailyStats(data.events, now, info.days);
      curDays = days;
      items = days.map(function (d) {
        return {
          label: d.isToday ? '今天' : CH.dateLabel(d.date),
          valueMs: d.wornMs,
          met: d.wornMs !== null && d.wornMs >= goalMs,
          isCurrent: d.isToday,
          tip: CH.dateLabel(d.date) + ' ' + CH.weekdayLabel(d.date)
        };
      });
      $('timeline-card').style.display = '';
      $('timeline-chart').innerHTML = CH.timeline(days, now);
    } else {
      curMode = info.mode;
      curDays = null;
      var buckets = info.mode === 'week'
        ? T.weeklyStats(data.events, now, info.buckets, goalMs)
        : T.monthlyStats(data.events, now, info.buckets, goalMs);
      curBuckets = buckets;
      items = buckets.map(function (b) {
        return {
          label: b.label,
          valueMs: b.avgMs,
          met: b.avgMs !== null && b.avgMs >= goalMs,
          isCurrent: b.isCurrent,
          tip: bucketRangeLabel(b, info.unit)
        };
      });
      // 汇总卡片基于覆盖整段周期的每日数据
      var spanDays = Math.round((T.startOfDay(now) - buckets[0].start) / 86400000) + 1;
      days = T.dailyStats(data.events, now, spanDays);
      $('timeline-card').style.display = 'none';
    }

    // 汇总卡片
    var sum = T.summarize(days, goalMs);
    $('sum-avg').textContent = fmtDur(Math.round(sum.avgMs));
    $('sum-avg-sub').textContent = info.mode === 'day' ? '平均每天佩戴' : '平均每天佩戴（近' + info.buckets + info.unit + '）';
    $('sum-met').textContent = sum.metCount + '/' + sum.validCount;
    $('sum-met-sub').textContent = '达标天数（≥' + goalHours + 'h）';
    $('sum-streak').textContent = sum.streak;
    $('sum-streak-sub').textContent = '连续达标天数';
    $('sum-rate').textContent = Math.round(sum.rate * 100) + '%';
    $('sum-rate-sub').textContent = '达标率';

    // 柱状图
    $('bar-title').textContent = info.title;
    var bar = $('bar-chart');
    bar.innerHTML = CH.barChart(items, goalHours, { animate: animate });
    bar.querySelectorAll('rect[data-idx]').forEach(function (r) {
      r.addEventListener('click', function () {
        var idx = Number(r.dataset.idx);
        $('bar-caption').innerHTML = curMode === 'day'
          ? dayCaption(curDays[idx], goalHours_)
          : bucketCaption(curBuckets[idx], info.unit);
      });
    });
    $('bar-caption').textContent = info.caption;
  }

  function dayCaption(d, goalHours) {
    if (!d || d.wornMs === null) return '';
    var met = d.wornMs >= goalHours * H;
    return '<b>' + (d.isToday ? '今天' : CH.dateLabel(d.date) + ' ' + CH.weekdayLabel(d.date)) + '</b>：' +
      '佩戴 ' + fmtDur(d.wornMs) + '，未戴 ' + fmtDur(d.offMs) +
      (met ? ' <span class="ok">✓ 达标</span>' : ' <span class="miss">✗ 未达标</span>');
  }

  function bucketRangeLabel(b, unit) {
    var s = new Date(b.start);
    if (unit === '周') {
      var e = new Date(T.addDays(b.start, 6));
      return (s.getMonth() + 1) + '月' + s.getDate() + '日–' + (e.getMonth() + 1) + '月' + e.getDate() + '日';
    }
    return s.getFullYear() + '年' + (s.getMonth() + 1) + '月';
  }

  function bucketCaption(b, unit) {
    if (!b) return '';
    var range = bucketRangeLabel(b, unit);
    if (b.validCount === 0) return '<b>' + range + '</b>：无记录';
    var status = b.isCurrent ? '本' + unit + '进行中' : '共 ' + b.validCount + ' 天';
    var met = b.avgMs >= data.settings.dailyGoalHours * H;
    return '<b>' + range + '</b>（' + status + '）：平均 ' + fmtDur(Math.round(b.avgMs)) + '/天' +
      '，达标 ' + b.metCount + '/' + b.validCount + ' 天' +
      '，共佩戴 ' + fmtDur(b.wornMs) +
      (met ? ' <span class="ok">✓</span>' : ' <span class="miss">✗</span>');
  }

  /* ---------------- 记录页 ---------------- */
  function refreshRecords() {
    var list = $('event-list');
    var normalized = T.normalize(data.events);
    if (normalized.length === 0) {
      list.innerHTML = '<div class="empty-tip">还没有记录。<br>去首页点一下"摘下牙套"开始吧，或者用上方"补录"添加过去的记录。</div>';
      return;
    }

    var groups = [];
    var curDay = null;
    normalized.forEach(function (e) {
      var day = T.startOfDay(e.ts);
      if (!curDay || curDay.date !== day) {
        curDay = { date: day, events: [] };
        groups.push(curDay);
      }
      curDay.events.push(e);
    });
    groups.reverse();

    var html = '';
    var now = Date.now();
    var todayStart = T.startOfDay(now);
    groups.forEach(function (g) {
      var isPast = g.date < todayStart;
      var dayTotal = '';
      if (isPast) {
        var dayEnd = T.startOfDay(T.addDays(g.date, 1));
        var offMs = 0;
        T.offIntervals(data.events, now).forEach(function (iv) {
          offMs += Math.max(0, Math.min(iv[1], dayEnd) - Math.max(iv[0], g.date));
        });
        dayTotal = ' · 佩戴 ' + fmtDur(Math.max(0, (dayEnd - g.date) - offMs));
      }
      html += '<div class="day-group"><div class="day-header">' + fmtDayHeader(g.date) + dayTotal + '</div>';
      g.events.forEach(function (e) {
        var off = e.type === 'off';
        html +=
          '<div class="ev-row' + (e._redundant ? ' redundant' : '') + '">' +
          '<span class="ev-badge ' + (off ? 'b-off' : 'b-on') + '">' + (off ? '摘下' : '戴上') + '</span>' +
          '<span class="ev-time">' + fmtClock(e.ts) + '</span>' +
          (e.note ? '<span class="ev-note">' + escapeHtml(e.note) + '</span>' : '') +
          (e._redundant ? '<span class="ev-warn" title="与前一事件类型相同，统计时已忽略">重复·已忽略</span>' : '') +
          '<span class="ev-actions">' +
          '<button class="btn-mini" data-action="edit" data-id="' + e.id + '">改</button>' +
          '<button class="btn-mini danger" data-action="del" data-id="' + e.id + '">删</button>' +
          '</span></div>';
      });
      html += '</div>';
    });
    list.innerHTML = html;
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function findEvent(id) {
    for (var i = 0; i < data.events.length; i++) {
      if (data.events[i].id === id) return data.events[i];
    }
    return null;
  }

  /* --------- 补录/编辑弹窗 --------- */
  var editingId = null;

  function openEventModal(ev) {
    editingId = ev ? ev.id : null;
    $('modal-title').textContent = ev ? '编辑记录' : '补录一条记录';
    var defaultType = ev ? ev.type : (T.currentState(data.events) ? 'off' : 'on');
    $('ev-type').value = defaultType;
    $('ev-time').value = tsToLocalInput(ev ? ev.ts : Date.now());
    $('ev-note').value = ev && ev.note ? ev.note : '';
    $('modal-overlay').classList.add('show');
    $('ev-time').focus();
  }

  function closeModal() {
    $('modal-overlay').classList.remove('show');
    editingId = null;
  }

  function saveEventModal() {
    var ts = new Date($('ev-time').value).getTime();
    if (!isFinite(ts)) { alert('请选择正确的时间'); return; }
    if (ts > Date.now() + 60000) { alert('时间不能是未来'); return; }
    var type = $('ev-type').value === 'off' ? 'off' : 'on';
    var note = $('ev-note').value.trim();

    if (editingId) {
      var ev = findEvent(editingId);
      if (ev) { ev.type = type; ev.ts = ts; if (note) ev.note = note; else delete ev.note; }
    } else {
      data.events.push({ id: S.genId(), type: type, ts: ts, note: note || undefined });
    }
    data.events.sort(function (a, b) { return a.ts - b.ts; });
    closeModal();
    persist();
    showToast('记录已保存');
  }

  /* ---------------- 数据导入导出 ---------------- */
  function exportData() {
    var payload = {
      app: 'aligner-tracker',
      exportedAt: new Date().toISOString(),
      data: { version: data.version, settings: data.settings, events: data.events }
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    var d = new Date();
    a.href = URL.createObjectURL(blob);
    a.download = '牙套记录备份_' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    showToast('已导出备份文件');
  }

  function importData(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = JSON.parse(reader.result);
        var incoming = parsed && parsed.data ? parsed.data : parsed;
        if (!incoming || !Array.isArray(incoming.events)) throw new Error('文件格式不对');
        var cleaned = incoming.events.map(S.sanitizeEvent).filter(Boolean);
        if (!window.confirm('导入将覆盖当前全部 ' + data.events.length + ' 条记录，确定继续吗？')) return;
        data.events = cleaned.sort(function (a, b) { return a.ts - b.ts; });
        if (incoming.settings && isFinite(Number(incoming.settings.dailyGoalHours))) {
          data.settings.dailyGoalHours = Number(incoming.settings.dailyGoalHours);
          $('goal-input').value = data.settings.dailyGoalHours;
        }
        persist();
        showToast('导入成功，共 ' + data.events.length + ' 条记录');
      } catch (err) {
        alert('导入失败：' + err.message);
      }
    };
    reader.readAsText(file);
  }

  function clearAll() {
    if (!window.confirm('确定清空所有记录吗？此操作不可恢复！')) return;
    if (!window.confirm('再次确认：真的要删除全部数据吗？建议先导出备份。')) return;
    data = S.defaultData();
    $('goal-input').value = data.settings.dailyGoalHours;
    persist();
    showToast('已清空');
  }

  /* ---------------- Toast ---------------- */
  var toastTimer = null;
  function showToast(msg, actionText, actionFn) {
    var t = $('toast');
    t.innerHTML = '<span>' + escapeHtml(msg) + '</span>' +
      (actionText ? '<button id="toast-action">' + escapeHtml(actionText) + '</button>' : '');
    t.classList.add('show');
    if (actionText) {
      $('toast-action').addEventListener('click', function () {
        actionFn();
        t.classList.remove('show');
      });
    }
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 5000);
  }

  /* ---------------- 总刷新 ---------------- */
  function refreshAll() {
    refreshHome();
    if ($('page-stats').classList.contains('active')) renderStats(false);
    if ($('page-records').classList.contains('active')) refreshRecords();
  }

  /* ---------------- 初始化 ---------------- */
  function init() {
    $('btn-toggle').addEventListener('click', toggleAligner);

    document.querySelectorAll('.tabbar button').forEach(function (b) {
      b.addEventListener('click', function () { switchTab(b.dataset.tab); });
    });

    [['7', 'range-7'], ['30', 'range-30'], ['w', 'range-w'], ['m', 'range-m']].forEach(function (pair) {
      $(pair[1]).addEventListener('click', function () {
        range = pair[0];
        setRangeBtns();
        renderStats(true);
      });
    });

    function setRangeBtns() {
      [['7', 'range-7'], ['30', 'range-30'], ['w', 'range-w'], ['m', 'range-m']].forEach(function (pair) {
        $(pair[1]).classList.toggle('active', range === pair[0]);
      });
    }
    setRangeBtns();

    $('btn-add').addEventListener('click', function () { openEventModal(null); });
    $('btn-modal-cancel').addEventListener('click', closeModal);
    $('modal-overlay').addEventListener('click', function (e) { if (e.target === this) closeModal(); });
    $('btn-modal-save').addEventListener('click', saveEventModal);

    $('event-list').addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-action]');
      if (!btn) return;
      var ev = findEvent(btn.dataset.id);
      if (!ev) return;
      if (btn.dataset.action === 'edit') {
        openEventModal(ev);
      } else if (btn.dataset.action === 'del') {
        if (window.confirm('删除这条「' + (ev.type === 'off' ? '摘下' : '戴上') + ' ' + fmtClock(ev.ts) + '」记录？')) {
          data.events = data.events.filter(function (x) { return x.id !== ev.id; });
          persist();
        }
      }
    });

    $('goal-input').value = data.settings.dailyGoalHours;
    $('goal-input').addEventListener('change', function () {
      var v = Number(this.value);
      if (!isFinite(v) || v <= 0 || v > 24) {
        alert('目标请填 1–24 之间的小时数');
        this.value = data.settings.dailyGoalHours;
        return;
      }
      data.settings.dailyGoalHours = v;
      persist();
      showToast('目标已更新为 ' + v + ' 小时/天');
    });

    $('btn-export').addEventListener('click', exportData);
    $('btn-import').addEventListener('click', function () { $('import-file').click(); });
    $('import-file').addEventListener('change', function () {
      if (this.files && this.files[0]) importData(this.files[0]);
      this.value = '';
    });
    $('btn-clear').addEventListener('click', clearAll);

    // 每秒刷新主页（实时计时）；统计页仅在可见时每 30 秒静默刷新（不重播动画）
    setInterval(refreshHome, 1000);
    var tick = 0;
    setInterval(function () {
      if ($('page-stats').classList.contains('active') && (++tick % 30 === 0)) renderStats(false);
    }, 1000);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) refreshAll();
    });

    refreshAll();

    // Service Worker（https 或 localhost 下启用，GitHub Pages / 本地测试均满足）
    if ('serviceWorker' in navigator &&
        (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
      navigator.serviceWorker.register('./sw.js').catch(function (err) {
        console.warn('Service Worker 注册失败：', err);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

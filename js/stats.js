/* 统计核心：由事件流推导佩戴区间、每日佩戴时长、汇总指标
 *
 * 核心模型：
 * - 事件流 = 按时间排序的 {type:'on'|'off', ts} 序列
 * - 未佩戴区间 = 每对 off→on 之间的时间（最后一个 off 若未闭合，则统计到 now）
 * - 每日佩戴时长 = 当日经过的时间 − 当日未佩戴时间
 * - 基线假设：第一个事件之前，若首个事件是 off 则视为"一直在戴"；
 *   若首个事件是 on 则视为"从当天 00:00 起就没戴"（用户可通过补录修正）
 * - 连续两个同类型事件（忘按导致的重复）取第一个生效，后续标记为冗余
 */
(function (global) {
  'use strict';

  var HOUR = 3600000;

  function startOfDay(ts) {
    var d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function addDays(ts, n) {
    var d = new Date(ts);
    d.setDate(d.getDate() + n);
    return d.getTime();
  }

  /* 返回按 ts 升序的事件数组（浅拷贝对象），并打上 _redundant 标记 */
  function normalize(events) {
    var sorted = events.map(function (e) {
      return { id: e.id, type: e.type, ts: e.ts, note: e.note };
    }).sort(function (a, b) { return a.ts - b.ts; });
    var lastType = null;
    sorted.forEach(function (e) {
      e._redundant = (lastType === e.type);
      if (!e._redundant) lastType = e.type;
    });
    return sorted;
  }

  /* 当前是否在佩戴：最后一个有效事件为 on → 佩戴；无事件 → 默认佩戴 */
  function currentState(events) {
    var sorted = normalize(events);
    for (var i = sorted.length - 1; i >= 0; i--) {
      if (!sorted[i]._redundant) return sorted[i].type === 'on';
    }
    return true;
  }

  /* 未佩戴区间列表 [[start,end],...]（毫秒时间戳，左闭右开）。
   * 若最后处于未佩戴状态，区间右端为 now。 */
  function offIntervals(events, now) {
    var sorted = normalize(events).filter(function (e) { return !e._redundant; });
    if (sorted.length === 0) return [];

    var intervals = [];
    var offStart = null;
    if (sorted[0].type === 'on') {
      // 首个事件是"戴上"：之前视为从当天 00:00 起就没戴
      offStart = startOfDay(sorted[0].ts);
    }
    sorted.forEach(function (e) {
      if (e.type === 'off') {
        if (offStart === null) offStart = e.ts;
      } else {
        if (offStart !== null) {
          intervals.push([offStart, Math.max(e.ts, offStart)]);
          offStart = null;
        }
      }
    });
    if (offStart !== null && now > offStart) {
      intervals.push([offStart, now]);
    }
    return intervals;
  }

  /* 最近 days 天（含今天）的每日统计。
   * 返回数组按时间升序；每天 { date, wornMs, offMs, offIntervals, isToday }，
   * wornMs 为 null 表示该天早于记录起点、无数据。 */
  function dailyStats(events, now, days) {
    var intervals = offIntervals(events, now);
    var sorted = normalize(events);
    var firstDay = sorted.length ? startOfDay(sorted[0].ts) : null;
    var todayStart = startOfDay(now);
    var result = [];

    for (var i = days - 1; i >= 0; i--) {
      var dayStart = addDays(todayStart, -i);
      var dayEnd = startOfDay(addDays(dayStart, 1)); // 兼容夏令时导致的 23/25 小时天
      var hasData = firstDay !== null ? dayStart >= firstDay : dayStart === todayStart;
      if (!hasData) {
        result.push({ date: dayStart, wornMs: null, offMs: null, offIntervals: [], isToday: dayStart === todayStart });
        continue;
      }
      var elapsed = Math.max(0, Math.min(now, dayEnd) - dayStart);
      var offMs = 0;
      var dayOffs = [];
      intervals.forEach(function (iv) {
        var s = Math.max(iv[0], dayStart);
        var e = Math.min(iv[1], dayEnd);
        if (e > s) { offMs += e - s; dayOffs.push([s, e]); }
      });
      result.push({
        date: dayStart,
        wornMs: Math.max(0, elapsed - offMs),
        offMs: offMs,
        offIntervals: dayOffs,
        isToday: dayStart === todayStart
      });
    }
    return result;
  }

  /* 汇总：平均佩戴、达标天数、达标率、连续达标天数 */
  function summarize(days, goalMs) {
    var valid = days.filter(function (d) { return d.wornMs !== null; });
    var total = valid.reduce(function (s, d) { return s + d.wornMs; }, 0);
    var met = valid.filter(function (d) { return d.wornMs >= goalMs; }).length;
    var streak = 0;
    for (var i = days.length - 1; i >= 0; i--) {
      var d = days[i];
      if (d.wornMs === null) break;
      if (d.isToday && d.wornMs < goalMs) continue; // 今天还没过完，未达标不断链
      if (d.wornMs >= goalMs) streak++;
      else break;
    }
    return {
      avgMs: valid.length ? total / valid.length : 0,
      metCount: met,
      validCount: valid.length,
      rate: valid.length ? met / valid.length : 0,
      streak: streak
    };
  }

  /* 主页"本次状态"：当前戴着/摘着，以及该状态持续了多久 */
  function sessionInfo(events, now) {
    var wearing = currentState(events);
    var sorted = normalize(events);
    var lastEff = null;
    for (var i = sorted.length - 1; i >= 0; i--) {
      if (!sorted[i]._redundant) { lastEff = sorted[i]; break; }
    }
    var since = lastEff ? lastEff.ts : startOfDay(now);
    return { wearing: wearing, sinceTs: since, durationMs: Math.max(0, now - since) };
  }

  /* 今日有效摘下次数（冗余事件不计数） */
  function offCountToday(events, now) {
    var todayStart = startOfDay(now);
    return normalize(events).filter(function (e) {
      return !e._redundant && e.type === 'off' && e.ts >= todayStart;
    }).length;
  }

  /* ---------- 周 / 月聚合 ---------- */

  function weekStart(ts) {
    var d = new Date(ts);
    var dow = (d.getDay() + 6) % 7; // 0 = 周一
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - dow);
    return d.getTime();
  }

  function monthStart(ts) {
    var d = new Date(ts);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function fmtMD(ts) {
    var d = new Date(ts);
    return (d.getMonth() + 1) + '/' + d.getDate();
  }

  /* 通用分桶：starts 为升序的桶起点（本地 0 点）。
   * 每桶返回 { start, end, label, isCurrent, validCount, metCount, wornMs, avgMs }。
   * avgMs = 该桶内有数据天的平均每日佩戴时长；无数据天为 null。 */
  function bucketize(events, now, starts, goalMs, labelFn) {
    var daysSpan = Math.round((startOfDay(now) - starts[0]) / 86400000) + 1;
    var dayMap = {};
    dailyStats(events, now, daysSpan).forEach(function (d) { dayMap[d.date] = d; });

    var out = [];
    for (var i = 0; i < starts.length; i++) {
      var s = starts[i];
      var isLast = (i === starts.length - 1);
      var e = isLast ? Infinity : starts[i + 1];
      var worn = 0, valid = 0, met = 0;
      for (var ds = s; ds < e && ds <= startOfDay(now); ds = startOfDay(addDays(ds, 1))) {
        var d = dayMap[ds];
        if (d && d.wornMs !== null) {
          valid++; worn += d.wornMs;
          if (d.wornMs >= goalMs) met++;
        }
      }
      out.push({
        start: s,
        end: isLast ? addDays(startOfDay(now), 1) : e,
        label: labelFn(s, isLast),
        isCurrent: isLast,
        validCount: valid,
        metCount: met,
        wornMs: worn,
        avgMs: valid ? worn / valid : null
      });
    }
    return out;
  }

  /* 近 count 周（本周在末尾），每周从周一开始 */
  function weeklyStats(events, now, count, goalMs) {
    var thisWeek = weekStart(now);
    var starts = [];
    for (var k = count - 1; k >= 0; k--) starts.push(addDays(thisWeek, -7 * k));
    return bucketize(events, now, starts, goalMs, function (s, isCurrent) {
      return isCurrent ? '本周' : fmtMD(s);
    });
  }

  /* 近 count 月（本月在末尾） */
  function monthlyStats(events, now, count, goalMs) {
    var d0 = new Date(now);
    var starts = [];
    for (var k = count - 1; k >= 0; k--) {
      starts.push(new Date(d0.getFullYear(), d0.getMonth() - k, 1).getTime());
    }
    return bucketize(events, now, starts, goalMs, function (s, isCurrent) {
      return isCurrent ? '本月' : ((new Date(s).getMonth() + 1) + '月');
    });
  }

  var AlignerStats = {
    HOUR: HOUR,
    startOfDay: startOfDay,
    addDays: addDays,
    normalize: normalize,
    currentState: currentState,
    offIntervals: offIntervals,
    dailyStats: dailyStats,
    summarize: summarize,
    sessionInfo: sessionInfo,
    offCountToday: offCountToday,
    weekStart: weekStart,
    monthStart: monthStart,
    weeklyStats: weeklyStats,
    monthlyStats: monthlyStats
  };

  global.AlignerStats = AlignerStats;
  if (typeof module !== 'undefined' && module.exports) module.exports = AlignerStats;
})(typeof window !== 'undefined' ? window : globalThis);

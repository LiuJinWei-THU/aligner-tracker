/* 图表绘制：纯 SVG 字符串拼接，无外部依赖，离线可用 */
(function (global) {
  'use strict';

  var C = {
    green: '#10b981',
    greenDark: '#059669',
    greenBg: '#d8f3e6',
    orange: '#f59e0b',
    orangeDark: '#d97706',
    gray: '#e5e7eb',
    grayDark: '#9ca3af',
    text: '#6b7280',
    textDark: '#374151',
    blue: '#3b82f6',
    track: '#e8f5ef'
  };

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function hoursOf(ms) { return ms / 3600000; }

  var WEEK = ['日', '一', '二', '三', '四', '五', '六'];
  function dateLabel(ts) {
    var d = new Date(ts);
    return (d.getMonth() + 1) + '/' + d.getDate();
  }
  function weekdayLabel(ts) {
    return '周' + WEEK[new Date(ts).getDay()];
  }

  /* ---------- 每日佩戴柱状图 ---------- */
  function barChart(days, goalHours, onTap) {
    var W = 720, H = 340;
    var mL = 46, mR = 12, mT = 34, mB = 46;
    var plotW = W - mL - mR, plotH = H - mT - mB;
    var n = days.length;
    var slot = plotW / n;
    var barW = Math.min(slot * 0.62, 40);
    var svg = '';

    // 横向网格线 + y 轴刻度（0–24h，每 4h）
    for (var h = 0; h <= 24; h += 4) {
      var y = mT + (1 - h / 24) * plotH;
      svg += '<line x1="' + mL + '" y1="' + y + '" x2="' + (W - mR) + '" y2="' + y +
        '" stroke="' + (h === 0 ? C.grayDark : C.gray) + '" stroke-width="1"/>';
      svg += '<text x="' + (mL - 8) + '" y="' + (y + 4) + '" text-anchor="end" font-size="12" fill="' + C.text + '">' + h + (h === 24 ? 'h' : '') + '</text>';
    }

    // 目标线
    var gy = mT + (1 - goalHours / 24) * plotH;
    svg += '<line x1="' + mL + '" y1="' + gy + '" x2="' + (W - mR) + '" y2="' + gy +
      '" stroke="' + C.blue + '" stroke-width="1.5" stroke-dasharray="6 5" opacity="0.85"/>';
    svg += '<text x="' + (W - mR) + '" y="' + (gy - 6) + '" text-anchor="end" font-size="12" fill="' + C.blue + '">目标 ' + goalHours + 'h</text>';

    // 柱子
    var labelEvery = n <= 8 ? 1 : Math.ceil(n / 10);
    for (var i = 0; i < n; i++) {
      var d = days[i];
      var x = mL + slot * i + (slot - barW) / 2;
      var cx = mL + slot * i + slot / 2;
      if (d.wornMs === null) {
        svg += '<text x="' + cx + '" y="' + (mT + plotH - 6) + '" text-anchor="middle" font-size="11" fill="' + C.grayDark + '">–</text>';
      } else {
        var hrs = hoursOf(d.wornMs);
        var bh = Math.max(2, hrs / 24 * plotH);
        var y2 = mT + plotH - bh;
        var met = d.wornMs >= goalHours * 3600000;
        var fill = met ? C.green : C.orange;
        var stroke = d.isToday ? C.textDark : 'none';
        svg += '<rect data-idx="' + i + '" x="' + x + '" y="' + y2 + '" width="' + barW + '" height="' + bh +
          '" rx="3" fill="' + fill + '"' + (stroke !== 'none' ? ' stroke="' + stroke + '" stroke-width="2"' : '') +
          ' style="cursor:pointer"><title>' + dateLabel(d.date) + ' ' + weekdayLabel(d.date) + '</title></rect>';
        if (n <= 8) {
          svg += '<text x="' + cx + '" y="' + (y2 - 6) + '" text-anchor="middle" font-size="12" font-weight="600" fill="' + C.textDark + '">' + hrs.toFixed(1) + '</text>';
        }
      }
      if (i % labelEvery === 0 || i === n - 1) {
        var lbl = d.isToday ? '今天' : dateLabel(d.date);
        svg += '<text x="' + cx + '" y="' + (mT + plotH + 18) + '" text-anchor="middle" font-size="11" fill="' +
          (d.isToday ? C.textDark : C.text) + '" font-weight="' + (d.isToday ? '700' : '400') + '">' + esc(lbl) + '</text>';
      }
    }

    return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="chart-svg" role="img" aria-label="每日佩戴时长柱状图">' + svg + '</svg>';
  }

  /* ---------- 每日摘戴时间线 ---------- */
  function timeline(days, now) {
    var W = 720;
    var rowH = 34, headerH = 20;
    var mL = 64, mR = 8;
    var plotW = W - mL - mR;
    var H = headerH + days.length * rowH + 6;
    var svg = '';

    // 顶部小时刻度（0/6/12/18/24）
    [0, 6, 12, 18, 24].forEach(function (h) {
      var x = mL + h / 24 * plotW;
      svg += '<text x="' + x + '" y="12" text-anchor="' + (h === 0 ? 'start' : (h === 24 ? 'end' : 'middle')) +
        '" font-size="10" fill="' + C.grayDark + '">' + h + '点</text>';
    });

    // 从旧到新排列，今天在最上面 → 先画旧的（y 越大越靠下）
    var rowsAsc = days.slice().reverse();
    rowsAsc.forEach(function (d, ri) {
      var y = headerH + (days.length - 1 - ri) * rowH;
      var cy = y + rowH / 2;
      // 日期标签（两行：日期 / 周几）
      svg += '<text x="' + (mL - 8) + '" y="' + (cy - 2) + '" text-anchor="end" font-size="11" font-weight="' +
        (d.isToday ? '700' : '400') + '" fill="' + C.textDark + '">' + (d.isToday ? '今天' : dateLabel(d.date)) + '</text>';
      if (!d.isToday) {
        svg += '<text x="' + (mL - 8) + '" y="' + (cy + 10) + '" text-anchor="end" font-size="9" fill="' + C.grayDark + '">' + weekdayLabel(d.date) + '</text>';
      }

      // 24h 轨道背景（佩戴=浅绿）
      var trackH = 16;
      if (d.wornMs === null) {
        svg += '<rect x="' + mL + '" y="' + (cy - trackH / 2) + '" width="' + plotW + '" height="' + trackH +
          '" rx="' + (trackH / 2) + '" fill="none" stroke="' + C.gray + '" stroke-dasharray="4 4"/>';
        svg += '<text x="' + (mL + plotW / 2) + '" y="' + (cy + 3) + '" text-anchor="middle" font-size="9" fill="' + C.grayDark + '">无记录</text>';
      } else {
        svg += '<rect x="' + mL + '" y="' + (cy - trackH / 2) + '" width="' + plotW + '" height="' + trackH +
          '" rx="' + (trackH / 2) + '" fill="' + C.track + '"/>';
        // 6 小时分隔细线
        for (var h = 6; h < 24; h += 6) {
          var gx = mL + h / 24 * plotW;
          svg += '<line x1="' + gx + '" y1="' + (cy - trackH / 2) + '" x2="' + gx + '" y2="' + (cy + trackH / 2) +
            '" stroke="#c3ddce" stroke-width="1"/>';
        }
        // 未佩戴区间 = 橙色块
        d.offIntervals.forEach(function (iv) {
          var x1 = mL + Math.max(0, (iv[0] - d.date) / 86400000) * plotW;
          var x2 = mL + Math.min(1, (iv[1] - d.date) / 86400000) * plotW;
          var w = Math.max(2, x2 - x1);
          svg += '<rect x="' + x1 + '" y="' + (cy - trackH / 2) + '" width="' + w + '" height="' + trackH +
            '" rx="' + Math.min(4, w / 2) + '" fill="' + C.orange + '"><title>' + timeStr(iv[0]) + ' – ' + timeStr(iv[1]) + ' 未佩戴</title></rect>';
        });
        // 今天的"当前时刻"游标
        if (d.isToday) {
          var nx = mL + Math.max(0, Math.min(1, (now - d.date) / 86400000)) * plotW;
          svg += '<line x1="' + nx + '" y1="' + (cy - trackH / 2 - 3) + '" x2="' + nx + '" y2="' + (cy + trackH / 2 + 3) +
            '" stroke="' + C.blue + '" stroke-width="2"/>';
        }
      }
    });

    return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="chart-svg" role="img" aria-label="每日摘戴时间线">' + svg + '</svg>';
  }

  function timeStr(ts) {
    var d = new Date(ts);
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /* ---------- 主页进度环 ---------- */
  function ring(ratio, color) {
    var size = 180, r = 76, cx = size / 2, cy = size / 2;
    var circ = 2 * Math.PI * r;
    var k = Math.max(0, Math.min(1, ratio));
    return '<svg viewBox="0 0 ' + size + ' ' + size + '" class="ring-svg">' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + C.gray + '" stroke-width="14"/>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + (color || C.green) +
      '" stroke-width="14" stroke-linecap="round" stroke-dasharray="' + (circ * k) + ' ' + circ +
      '" transform="rotate(-90 ' + cx + ' ' + cy + ')" style="transition:stroke-dasharray .4s"/>' +
      '</svg>';
  }

  var AlignerCharts = {
    barChart: barChart,
    timeline: timeline,
    ring: ring,
    dateLabel: dateLabel,
    weekdayLabel: weekdayLabel
  };

  global.AlignerCharts = AlignerCharts;
  if (typeof module !== 'undefined' && module.exports) module.exports = AlignerCharts;
})(typeof window !== 'undefined' ? window : globalThis);

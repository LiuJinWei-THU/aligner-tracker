/* 图表绘制：纯 SVG 字符串拼接，无外部依赖，离线可用。
 * 所有颜色经 CSS 变量注入（见 style.css），自动适配深色模式。 */
(function (global) {
  'use strict';

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var WEEK = ['日', '一', '二', '三', '四', '五', '六'];

  function dateLabel(ts) {
    var d = new Date(ts);
    return (d.getMonth() + 1) + '/' + d.getDate();
  }
  function weekdayLabel(ts) {
    return '周' + WEEK[new Date(ts).getDay()];
  }
  function timeStr(ts) {
    var d = new Date(ts);
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /* ---------- 通用柱状图 ----------
   * items: [{ label, valueMs(null=无数据), met, isCurrent, tip }]
   * opts:  { animate: bool }  valueMs 以"小时"为刻度绘制（y 轴 0–24h） */
  function barChart(items, goalHours, opts) {
    opts = opts || {};
    var W = 720, H = 340;
    var mL = 46, mR = 12, mT = 34, mB = 48;
    var plotW = W - mL - mR, plotH = H - mT - mB;
    var n = items.length;
    if (!n) return '';
    var slot = plotW / n;
    var barW = Math.min(slot * 0.62, 40);
    var svg = '';

    // 横向网格线 + y 轴刻度（0–24h，每 4h）
    for (var h = 0; h <= 24; h += 4) {
      var gy = mT + (1 - h / 24) * plotH;
      svg += '<line x1="' + mL + '" y1="' + gy + '" x2="' + (W - mR) + '" y2="' + gy +
        '" style="stroke:var(--c-grid' + (h === 0 ? '-strong' : '') + ')" stroke-width="1"/>';
      svg += '<text x="' + (mL - 8) + '" y="' + (gy + 5) + '" text-anchor="end" font-size="15" style="fill:var(--c-axis)">' + h + (h === 24 ? 'h' : '') + '</text>';
    }

    // 目标线
    var goalY = mT + (1 - goalHours / 24) * plotH;
    svg += '<line x1="' + mL + '" y1="' + goalY + '" x2="' + (W - mR) + '" y2="' + goalY +
      '" style="stroke:var(--c-blue)" stroke-width="1.5" stroke-dasharray="6 5" opacity="0.85"/>';
    svg += '<text x="' + (W - mR) + '" y="' + (goalY - 6) + '" text-anchor="end" font-size="15" style="fill:var(--c-blue)">目标 ' + goalHours + 'h</text>';

    // 柱子
    var labelEvery = n <= 14 ? 1 : Math.ceil(n / 10);
    items.forEach(function (it, i) {
      var x = mL + slot * i + (slot - barW) / 2;
      var cx = mL + slot * i + slot / 2;
      if (it.valueMs === null || it.valueMs === undefined) {
        svg += '<text x="' + cx + '" y="' + (mT + plotH - 6) + '" text-anchor="middle" font-size="15" style="fill:var(--c-grid-strong)">–</text>';
      } else {
        var hrs = it.valueMs / 3600000;
        var bh = Math.max(2, hrs / 24 * plotH);
        var y2 = mT + plotH - bh;
        svg += '<rect class="bar' + (it.isCurrent ? ' cur' : '') + '" data-idx="' + i + '" x="' + x + '" y="' + y2 +
          '" width="' + barW + '" height="' + bh + '" rx="4" style="fill:var(--c-' + (it.met ? 'green' : 'orange') +
          ');animation-delay:' + (i * 28) + 'ms">' +
          '<title>' + esc(it.tip || it.label) + '</title></rect>';
        if (n <= 12) {
          svg += '<text x="' + cx + '" y="' + (y2 - 7) + '" text-anchor="middle" font-size="18" font-weight="600" style="fill:var(--c-bar-label)">' + hrs.toFixed(1) + '</text>';
        }
      }
      if (i % labelEvery === 0 || i === n - 1) {
        svg += '<text x="' + cx + '" y="' + (mT + plotH + 20) + '" text-anchor="middle" font-size="16" style="fill:' +
          (it.isCurrent ? 'var(--c-bar-label)' : 'var(--c-axis)') + '" font-weight="' + (it.isCurrent ? '700' : '400') + '">' + esc(it.label) + '</text>';
      }
    });

    return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="chart-svg' + (opts.animate ? ' animate' : '') +
      '" role="img" aria-label="佩戴时长柱状图">' + svg + '</svg>';
  }

  /* ---------- 每日摘戴时间线 ---------- */
  function timeline(days, now) {
    var W = 720;
    var rowH = 40, headerH = 24;
    var mL = 64, mR = 8;
    var plotW = W - mL - mR;
    var H = headerH + days.length * rowH + 6;
    var svg = '';

    [0, 6, 12, 18, 24].forEach(function (h) {
      var x = mL + h / 24 * plotW;
      svg += '<text x="' + x + '" y="12" text-anchor="' + (h === 0 ? 'start' : (h === 24 ? 'end' : 'middle')) +
        '" font-size="14" style="fill:var(--c-axis)">' + h + '点</text>';
    });

    var rowsAsc = days.slice().reverse();
    rowsAsc.forEach(function (d, ri) {
      var y = headerH + (days.length - 1 - ri) * rowH;
      var cy = y + rowH / 2;
      svg += '<text x="' + (mL - 8) + '" y="' + (cy - 2) + '" text-anchor="end" font-size="16" font-weight="' +
        (d.isToday ? '700' : '400') + '" style="fill:var(--c-bar-label)">' + (d.isToday ? '今天' : dateLabel(d.date)) + '</text>';
      if (!d.isToday) {
        svg += '<text x="' + (mL - 8) + '" y="' + (cy + 11) + '" text-anchor="end" font-size="12" style="fill:var(--c-axis)">' + weekdayLabel(d.date) + '</text>';
      }

      var trackH = 18;
      if (d.wornMs === null) {
        svg += '<rect x="' + mL + '" y="' + (cy - trackH / 2) + '" width="' + plotW + '" height="' + trackH +
          '" rx="' + (trackH / 2) + '" fill="none" style="stroke:var(--c-grid)" stroke-dasharray="4 4"/>';
        svg += '<text x="' + (mL + plotW / 2) + '" y="' + (cy + 4) + '" text-anchor="middle" font-size="12" style="fill:var(--c-grid-strong)">无记录</text>';
      } else {
        svg += '<rect x="' + mL + '" y="' + (cy - trackH / 2) + '" width="' + plotW + '" height="' + trackH +
          '" rx="' + (trackH / 2) + '" style="fill:var(--c-track)"/>';
        for (var h = 6; h < 24; h += 6) {
          var gx = mL + h / 24 * plotW;
          svg += '<line x1="' + gx + '" y1="' + (cy - trackH / 2) + '" x2="' + gx + '" y2="' + (cy + trackH / 2) +
            '" style="stroke:var(--c-track-line)" stroke-width="1"/>';
        }
        d.offIntervals.forEach(function (iv) {
          var x1 = mL + Math.max(0, (iv[0] - d.date) / 86400000) * plotW;
          var x2 = mL + Math.min(1, (iv[1] - d.date) / 86400000) * plotW;
          var w = Math.max(2, x2 - x1);
          svg += '<rect x="' + x1 + '" y="' + (cy - trackH / 2) + '" width="' + w + '" height="' + trackH +
            '" rx="' + Math.min(4, w / 2) + '" style="fill:var(--c-orange)"><title>' + timeStr(iv[0]) + ' – ' + timeStr(iv[1]) + ' 未佩戴</title></rect>';
        });
        if (d.isToday) {
          var nx = mL + Math.max(0, Math.min(1, (now - d.date) / 86400000)) * plotW;
          svg += '<line x1="' + nx + '" y1="' + (cy - trackH / 2 - 3) + '" x2="' + nx + '" y2="' + (cy + trackH / 2 + 3) +
            '" style="stroke:var(--c-blue)" stroke-width="2"/>';
        }
      }
    });

    return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="chart-svg" role="img" aria-label="每日摘戴时间线">' + svg + '</svg>';
  }

  /* ---------- 主页进度环 ---------- */
  function ring(ratio, colorVar) {
    var size = 180, r = 76, cx = size / 2, cy = size / 2;
    var circ = 2 * Math.PI * r;
    var k = Math.max(0, Math.min(1, ratio));
    return '<svg viewBox="0 0 ' + size + ' ' + size + '" class="ring-svg" style="color:' + (colorVar || 'var(--c-green)') + '">' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" style="stroke:var(--c-grid)" stroke-width="14"/>' +
      '<circle class="fg" cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke-width="14"' +
      ' stroke-linecap="round" stroke-dasharray="' + (circ * k) + ' ' + circ +
      '" transform="rotate(-90 ' + cx + ' ' + cy + ')" style="stroke:currentColor;transition:stroke-dasharray .4s"/>' +
      '</svg>';
  }

  var AlignerCharts = {
    barChart: barChart,
    timeline: timeline,
    ring: ring,
    dateLabel: dateLabel,
    weekdayLabel: weekdayLabel,
    fmtMD: fmtMD
  };

  function fmtMD(ts) {
    var d = new Date(ts);
    return (d.getMonth() + 1) + '/' + d.getDate();
  }

  global.AlignerCharts = AlignerCharts;
  if (typeof module !== 'undefined' && module.exports) module.exports = AlignerCharts;
})(typeof window !== 'undefined' ? window : globalThis);

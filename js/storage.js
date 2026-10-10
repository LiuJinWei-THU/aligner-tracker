/* 数据层：localStorage 读写与事件模型 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'alignerTracker.v1';
  var DATA_VERSION = 1;

  function defaultData() {
    return {
      version: DATA_VERSION,
      settings: { dailyGoalHours: 22 },
      events: []
    };
  }

  function sanitizeEvent(e) {
    if (!e || (e.type !== 'on' && e.type !== 'off')) return null;
    if (typeof e.ts !== 'number' || !isFinite(e.ts)) return null;
    var out = { id: String(e.id || genId()), type: e.type, ts: e.ts };
    if (typeof e.note === 'string' && e.note.trim()) out.note = e.note.trim();
    return out;
  }

  function load() {
    try {
      var raw = global.localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultData();
      var data = JSON.parse(raw);
      if (!data || typeof data !== 'object') return defaultData();
      if (!Array.isArray(data.events)) data.events = [];
      data.events = data.events
        .map(sanitizeEvent)
        .filter(function (e) { return e !== null; })
        .sort(function (a, b) { return a.ts - b.ts; });
      if (!data.settings || typeof data.settings !== 'object') data.settings = {};
      var h = Number(data.settings.dailyGoalHours);
      data.settings.dailyGoalHours = (isFinite(h) && h > 0 && h <= 24) ? h : 22;
      data.version = DATA_VERSION;
      return data;
    } catch (err) {
      console.error('加载数据失败：', err);
      return defaultData();
    }
  }

  function save(data) {
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: DATA_VERSION,
        settings: data.settings,
        events: data.events
      }));
      return true;
    } catch (err) {
      console.error('保存数据失败：', err);
      if (typeof alert === 'function') alert('数据保存失败（存储空间可能已满）：' + (err && err.message));
      return false;
    }
  }

  function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  var AlignerStorage = {
    load: load,
    save: save,
    genId: genId,
    sanitizeEvent: sanitizeEvent,
    defaultData: defaultData
  };

  global.AlignerStorage = AlignerStorage;
  if (typeof module !== 'undefined' && module.exports) module.exports = AlignerStorage;
})(typeof window !== 'undefined' ? window : globalThis);

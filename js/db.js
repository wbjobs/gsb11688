/*
 * db.js — IndexedDB 预设存储（保存 / 读取 / 删除 / 列表）
 */
(function (global) {
  'use strict';

  var DB_NAME = 'svg-filter-lab';
  var STORE = 'presets';
  var dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbPromise;
  }

  function run(mode, action) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(STORE, mode);
        var store = t.objectStore(STORE);
        var req = action(store);
        var value;
        if (req) {
          req.onsuccess = function () { value = req.result; };
          req.onerror = function () { reject(req.error); };
        }
        t.oncomplete = function () { resolve(value); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error); };
      });
    });
  }

  // preset: { id?, name, chain, blendMode, opacity, createdAt }
  function save(preset) {
    preset.createdAt = preset.createdAt || Date.now();
    return run('readwrite', function (store) { return store.put(preset); });
  }

  function list() {
    return run('readonly', function (store) { return store.getAll(); });
  }

  function remove(id) {
    return run('readwrite', function (store) { return store.delete(id); });
  }

  global.PresetDB = { save: save, list: list, remove: remove };
})(window);

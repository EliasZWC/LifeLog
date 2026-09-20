/**
 * Livolog - 数据层。
 *
 * 目前直接落在 localStorage；后续要换成原生 SQLite 的话，
 * 只要保持这里的方法签名不变，页面代码不用动。
 *
 * 数据结构：
 *   Behavior = { id, name, icon }
 *   Record   = { id, behaviorId, type: 'period' | 'moment', start: <epoch ms>, end: <epoch ms> | null }
 */
(function (global) {
    'use strict';

    var BEHAVIOR_KEY = 'livolog.behaviors';
    var RECORD_KEY = 'livolog.records';

    var listeners = [];

    function read(key) {
        try {
            var raw = global.localStorage.getItem(key);
            var parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            return [];
        }
    }

    /** 从 CSV 载入期间不要反过来再写一遍文件 */
    var suppressPersist = false;

    function write(key, value) {
        try {
            global.localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            /* 隐私模式 / 配额用尽，忽略 */
        }
        if (!suppressPersist) {
            persistCsv();
        }
        notify();
    }

    /**
     * 把全部时间记录镜像到手机 Livolog 目录下的 records.csv —— 这个文件就是数据库。
     * 没有原生桥时（浏览器预览）自动跳过。
     */
    function persistCsv() {
        if (!global.LivologNative || typeof global.LivologNative.saveRecordsCsv !== 'function') {
            return;
        }
        try {
            global.LivologNative.saveRecordsCsv(
                global.LivologCsv.stringify(getRecords(), getBehaviors())
            );
        } catch (e) {
            /* 忽略 */
        }
    }

    function notify() {
        listeners.forEach(function (listener) {
            listener();
        });
    }

    function newId() {
        return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    }

    // --- 行为 ---------------------------------------------------------------

    function getBehaviors() {
        return read(BEHAVIOR_KEY);
    }

    function getBehavior(id) {
        var found = getBehaviors().filter(function (item) {
            return item.id === id;
        });
        return found.length ? found[0] : null;
    }

    function addBehavior(name, icon) {
        var behavior = {
            id: newId(),
            name: String(name || '').trim(),
            icon: icon || global.LivologIcons.fallback
        };
        var list = getBehaviors();
        list.push(behavior);
        write(BEHAVIOR_KEY, list);
        return behavior;
    }

    function removeBehavior(id) {
        removeBehaviors([id]);
    }

    function updateBehavior(id, name, icon) {
        var updated = null;
        var list = getBehaviors().map(function (item) {
            if (item.id !== id) {
                return item;
            }
            updated = {
                id: item.id,
                name: String(name || '').trim() || item.name,
                icon: icon || item.icon
            };
            return updated;
        });

        if (updated) {
            write(BEHAVIOR_KEY, list);
        }
        return updated;
    }

    /** 批量删除行为；连带删掉这些行为下的时间记录 */
    function removeBehaviors(ids) {
        var removed = {};
        ids.forEach(function (id) {
            removed[id] = true;
        });

        write(BEHAVIOR_KEY, getBehaviors().filter(function (item) {
            return !removed[item.id];
        }));
        write(RECORD_KEY, getRecords().filter(function (item) {
            return !removed[item.behaviorId];
        }));
    }

    // --- 时间记录 -----------------------------------------------------------

    /** 按开始时间倒序，新的在前 */
    function getRecords() {
        return read(RECORD_KEY).sort(function (a, b) {
            return b.start - a.start;
        });
    }

    function addRecord(behaviorId, type, start, end) {
        var record = {
            id: newId(),
            behaviorId: behaviorId,
            type: type,
            start: start,
            end: type === 'period' ? end : null
        };
        var list = read(RECORD_KEY);
        list.push(record);
        write(RECORD_KEY, list);
        return record;
    }

    /** 改一条已有记录（行为 / 类型 / 起止时间都能改） */
    function updateRecord(id, behaviorId, type, start, end) {
        var list = read(RECORD_KEY);
        var target = null;

        list.forEach(function (item) {
            if (item.id !== id) {
                return;
            }
            item.behaviorId = behaviorId;
            item.type = type;
            item.start = start;
            item.end = type === 'period' ? end : null;
            target = item;
        });

        if (target) {
            write(RECORD_KEY, list);
        }
        return target;
    }

    function removeRecord(id) {
        removeRecords([id]);
    }

    function removeRecords(ids) {
        var removed = {};
        ids.forEach(function (id) {
            removed[id] = true;
        });
        write(RECORD_KEY, read(RECORD_KEY).filter(function (item) {
            return !removed[item.id];
        }));
    }

    // --- CSV ---------------------------------------------------------------

    /**
     * 启动时用 CSV 的内容覆盖本地缓存（CSV 是数据库，本地只当缓存）。
     * @returns {boolean} 文件不存在或内容非法时返回 false，此时保留本地缓存
     */
    function applyStoredCsv(csv) {
        if (!csv || !String(csv).trim()) {
            return false;
        }
        return replaceFromCsv(csv).ok;
    }

    /** 设置页「导入 CSV」：用选中的文件替换全部时间记录 */
    function importCsvText(text) {
        return replaceFromCsv(text);
    }

    /** 当前数据的 CSV 文本（浏览器预览 / 调试用） */
    function exportCsv() {
        return global.LivologCsv.stringify(getRecords(), getBehaviors());
    }

    function replaceFromCsv(text) {
        var parsed = global.LivologCsv.parse(text);
        if (!parsed.ok) {
            return { ok: false, error: parsed.error };
        }

        suppressPersist = true;
        try {
            var behaviors = getBehaviors();
            var byName = {};
            behaviors.forEach(function (behavior) {
                byName[behavior.name] = behavior;
            });

            // CSV 里出现但本地没有的行为，自动建一个（图标用通用占位）
            parsed.behaviorNames.forEach(function (name) {
                if (!byName[name]) {
                    var created = { id: newId(), name: name, icon: global.LivologIcons.fallback };
                    behaviors.push(created);
                    byName[name] = created;
                }
            });

            var records = parsed.records.map(function (row) {
                return {
                    id: row.id || newId(),
                    behaviorId: byName[row.behavior].id,
                    type: row.type,
                    start: row.start,
                    end: row.end
                };
            });

            global.localStorage.setItem(BEHAVIOR_KEY, JSON.stringify(behaviors));
            global.localStorage.setItem(RECORD_KEY, JSON.stringify(records));
        } catch (e) {
            suppressPersist = false;
            return { ok: false, error: 'storage' };
        }
        suppressPersist = false;

        persistCsv();
        notify();

        return { ok: true, count: parsed.records.length };
    }

    global.LivologStore = {
        getBehaviors: getBehaviors,
        getBehavior: getBehavior,
        addBehavior: addBehavior,
        updateBehavior: updateBehavior,
        removeBehavior: removeBehavior,
        removeBehaviors: removeBehaviors,
        getRecords: getRecords,
        addRecord: addRecord,
        updateRecord: updateRecord,
        removeRecord: removeRecord,
        removeRecords: removeRecords,
        applyStoredCsv: applyStoredCsv,
        importCsvText: importCsvText,
        exportCsv: exportCsv,
        onChange: function (listener) {
            listeners.push(listener);
        }
    };
})(window);

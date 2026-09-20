/**
 * LifeLog - 数据层。
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

    var BEHAVIOR_KEY = 'lifelog.behaviors';
    var RECORD_KEY = 'lifelog.records';

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

    function write(key, value) {
        try {
            global.localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            /* 隐私模式 / 配额用尽，忽略 */
        }
        notify();
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
            icon: icon || global.LifeLogIcons.fallback
        };
        var list = getBehaviors();
        list.push(behavior);
        write(BEHAVIOR_KEY, list);
        return behavior;
    }

    function removeBehavior(id) {
        removeBehaviors([id]);
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

    global.LifeLogStore = {
        getBehaviors: getBehaviors,
        getBehavior: getBehavior,
        addBehavior: addBehavior,
        removeBehavior: removeBehavior,
        removeBehaviors: removeBehaviors,
        getRecords: getRecords,
        addRecord: addRecord,
        removeRecord: removeRecord,
        removeRecords: removeRecords,
        onChange: function (listener) {
            listeners.push(listener);
        }
    };
})(window);

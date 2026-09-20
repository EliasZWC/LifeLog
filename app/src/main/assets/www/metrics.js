/**
 * Livolog - 跟踪数据层。
 *
 * 跟踪与「行为 / 时间记录」是两套互相独立的数据：
 *   Metric       = { id, name, icon }
 *   MetricRecord = { id, metricId, time: <epoch ms>, value: <number> }
 *
 * 跟踪记录本质上是「时点」：只有记录时间与记录值，没有起止时间，所以也永远不会出现在时间页。
 * 落盘到与 records.csv 同一个目录下的 metrics.csv，格式 id,metric,time,value。
 */
(function (global) {
    'use strict';

    var METRIC_KEY = 'livolog.metrics';
    var RECORD_KEY = 'livolog.metricRecords';
    var HEADER = ['id', 'metric', 'time', 'value'];

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

    function notify() {
        listeners.forEach(function (listener) {
            try {
                listener();
            } catch (e) {
                /* 单个监听者出错不影响其他人 */
            }
        });
    }

    /** 镜像到 Livolog 目录下的 metrics.csv；没有原生桥时（浏览器预览）自动跳过 */
    function persistCsv() {
        if (!global.LivologNative || typeof global.LivologNative.saveMetricsCsv !== 'function') {
            return;
        }
        try {
            global.LivologNative.saveMetricsCsv(exportCsv());
        } catch (e) {
            /* 忽略 */
        }
    }

    function newId() {
        return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    }

    // --- 跟踪项 -------------------------------------------------------------

    function getMetrics() {
        return read(METRIC_KEY);
    }

    function getMetric(id) {
        var found = null;
        getMetrics().forEach(function (metric) {
            if (metric.id === id && found === null) {
                found = metric;
            }
        });
        return found;
    }

    function addMetric(name, icon) {
        var metric = {
            id: newId(),
            name: String(name || '').trim(),
            icon: icon || global.LivologIcons.fallback
        };
        var list = getMetrics();
        list.push(metric);
        write(METRIC_KEY, list);
        return metric;
    }

    function updateMetric(id, name, icon) {
        var list = getMetrics();
        var target = null;

        list.forEach(function (metric) {
            if (metric.id !== id) {
                return;
            }
            metric.name = String(name || '').trim();
            metric.icon = icon || metric.icon;
            target = metric;
        });

        if (target) {
            write(METRIC_KEY, list);
        }
        return target;
    }

    /** 删跟踪项会连带删掉它名下的全部记录 */
    function removeMetrics(ids) {
        var removed = {};
        ids.forEach(function (id) {
            removed[id] = true;
        });

        write(METRIC_KEY, getMetrics().filter(function (metric) {
            return !removed[metric.id];
        }));
        write(RECORD_KEY, getRecords().filter(function (record) {
            return !removed[record.metricId];
        }));
    }

    // --- 跟踪记录 -----------------------------------------------------------

    /** 按记录时间倒序，新的在前；传 metricId 只取该跟踪项的 */
    function getRecords(metricId) {
        return read(RECORD_KEY).filter(function (record) {
            return !metricId || record.metricId === metricId;
        }).sort(function (a, b) {
            return b.time - a.time;
        });
    }

    function normalizeValue(value) {
        var number = Number(value);
        return isFinite(number) ? number : null;
    }

    function addRecord(metricId, time, value) {
        var number = normalizeValue(value);
        if (!metricId || number === null) {
            return null;
        }

        var record = {
            id: newId(),
            metricId: metricId,
            time: time,
            value: number
        };
        var list = read(RECORD_KEY);
        list.push(record);
        write(RECORD_KEY, list);
        return record;
    }

    function updateRecord(id, metricId, time, value) {
        var number = normalizeValue(value);
        if (number === null) {
            return null;
        }

        var list = read(RECORD_KEY);
        var target = null;

        list.forEach(function (item) {
            if (item.id !== id) {
                return;
            }
            item.metricId = metricId;
            item.time = time;
            item.value = number;
            target = item;
        });

        if (target) {
            write(RECORD_KEY, list);
        }
        return target;
    }

    function removeRecords(ids) {
        var removed = {};
        ids.forEach(function (id) {
            removed[id] = true;
        });
        write(RECORD_KEY, read(RECORD_KEY).filter(function (record) {
            return !removed[record.id];
        }));
    }

    // --- CSV ----------------------------------------------------------------

    function stringify() {
        var namesById = {};
        getMetrics().forEach(function (metric) {
            namesById[metric.id] = metric.name;
        });

        var lines = [HEADER.join(',')];

        getRecords().slice().sort(function (a, b) {
            return a.time - b.time;
        }).forEach(function (record) {
            lines.push([
                global.LivologCsv.escapeField(record.id),
                global.LivologCsv.escapeField(namesById[record.metricId] || ''),
                global.LivologCsv.escapeField(global.LivologCsv.formatTimestamp(record.time)),
                global.LivologCsv.escapeField(record.value)
            ].join(','));
        });

        return lines.join('\r\n') + '\r\n';
    }

    function exportCsv() {
        return stringify();
    }

    function persistReplace(metrics, records) {
        suppressPersist = true;
        try {
            global.localStorage.setItem(METRIC_KEY, JSON.stringify(metrics));
            global.localStorage.setItem(RECORD_KEY, JSON.stringify(records));
        } catch (e) {
            suppressPersist = false;
            return false;
        }
        suppressPersist = false;
        return true;
    }

    /**
     * 用 CSV 内容覆盖本地缓存（CSV 是数据库，本地只当缓存）。
     * CSV 里出现但本地没有的跟踪项会自动建出来，图标用通用占位。
     * @returns {boolean} 文件不存在或内容非法时返回 false，此时保留本地缓存
     */
    function applyStoredCsv(csv) {
        if (!csv || !String(csv).trim()) {
            return false;
        }

        var rows = global.LivologCsv.parseRows(csv).filter(function (row) {
            return row.some(function (cell) {
                return String(cell).trim() !== '';
            });
        });

        var columns = [];
        var body = rows;
        if (rows.length) {
            columns = rows[0].map(function (name) {
                return String(name).trim().toLowerCase();
            });
            var at = {};
            columns.forEach(function (name, position) {
                at[name] = position;
            });
            // 认表头就跳过第一行；不认就按固定列序当成纯数据
            if (at.metric !== undefined && at.time !== undefined) {
                body = rows.slice(1);
            } else {
                columns = HEADER;
            }
        }

        var at = {};
        columns.forEach(function (name, position) {
            at[name] = position;
        });

        var metrics = getMetrics();
        var byName = {};
        metrics.forEach(function (metric) {
            byName[metric.name] = metric;
        });

        var records = [];
        body.forEach(function (row) {
            var name = String(row[at.metric] || '').trim();
            var time = global.LivologCsv.parseTimestamp(row[at.time]);
            var value = normalizeValue(row[at.value]);
            if (!name || time === null || value === null) {
                return;
            }

            if (!byName[name]) {
                var created = { id: newId(), name: name, icon: global.LivologIcons.fallback };
                metrics.push(created);
                byName[name] = created;
            }

            records.push({
                id: (at.id === undefined ? '' : String(row[at.id] || '').trim()) || newId(),
                metricId: byName[name].id,
                time: time,
                value: value
            });
        });

        if (!persistReplace(metrics, records)) {
            return false;
        }

        persistCsv();
        notify();
        return true;
    }

    global.LivologMetrics = {
        getMetrics: getMetrics,
        getMetric: getMetric,
        addMetric: addMetric,
        updateMetric: updateMetric,
        removeMetrics: removeMetrics,
        getRecords: getRecords,
        addRecord: addRecord,
        updateRecord: updateRecord,
        removeRecords: removeRecords,
        applyStoredCsv: applyStoredCsv,
        exportCsv: exportCsv,
        onChange: function (listener) {
            listeners.push(listener);
        }
    };
})(window);

/**
 * Livolog - 跟踪数据层。
 *
 * 跟踪与「行为 / 时间记录」是两套互相独立的数据：
 *   Metric       = { id, name, icon, fields: [{id, name}], primary: <fieldId> }
 *   MetricRecord = { id, metricId, time: <epoch ms>, values: [{fieldId, value: <number>}] }
 *
 * 一个跟踪项可以有任意多个字段（比如血压 = 高压 / 低压 / 脉搏），每条记录每个字段一个值；
 * `primary` 是「主值」，卡片标题与图表默认展示它。
 * 跟踪记录本质上是「时点」：只有记录时间与值，没有起止时间，所以永远不会出现在时间页。
 *
 * 落盘到与 records.csv 同一个目录下的 metrics.csv。文件其实只是「每条记录一行」：
 *   表头 = id,metric,time,主值列名,其他字段列名…
 * 所以像 Excel 那样手工加一列（比如再加个「体温」），导回来就自动变成新的字段。
 * 旧文件（表头 id,metric,time,value）也能读，会当成「只有一个叫 value 的字段」。
 */
(function (global) {
    'use strict';

    var METRIC_KEY = 'livolog.metrics';
    var RECORD_KEY = 'livolog.metricRecords';
    /** 旧版表头（单值），新版一开始也用它作为默认字段名 */
    var HEADER = ['id', 'metric', 'time', 'value'];
    var DEFAULT_FIELD = 'value';

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
        return normalizeMetric(found);
    }

    /** 把字段描述统一成 [{id, name}]，旧数据（没有 fields）自动补一个「值」字段 */
    function normalizeFields(fields) {
        var out = [];
        (fields || []).forEach(function (field) {
            var name = String(field && field.name ? field.name : '').trim();
            if (!name) {
                return;
            }
            out.push({ id: (field && field.id) || newId(), name: name });
        });
        if (!out.length) {
            out.push({ id: newId(), name: DEFAULT_FIELD });
        }
        return out;
    }

    /**
     * 补齐老数据结构：
     *   - 没有 fields → 一个叫「值」的字段；
     *   - primary 指向不存在的字段 → 指回第一个；
     *   - isDerived（计算出来的）字段名 → 不参与编辑
     */
    function normalizeMetric(metric) {
        if (!metric) {
            return null;
        }
        metric.fields = normalizeFields(metric.fields);
        if (metric.isDerived && metric.name) {
            metric.fields = [{ id: metric.fields[0].id, name: String(metric.name).trim() }];
            metric.primary = metric.fields[0].id;
            return metric;
        }
        var primary = metric.primary;
        var found = metric.fields.some(function (field) {
            return field.id === primary;
        });
        metric.primary = found ? primary : metric.fields[0].id;
        return metric;
    }

    /** 跟跟踪项当前的所有字段（含归一化） */
    function fieldsOf(metricId) {
        var metric = getMetric(metricId);
        return metric ? metric.fields : [];
    }

    /** 主值字段：卡片标题与图表默认看它 */
    function primaryField(metric) {
        var normalized = normalizeMetric(metric);
        if (!normalized) {
            return null;
        }
        var found = null;
        normalized.fields.forEach(function (field) {
            if (field.id === normalized.primary && !found) {
                found = field;
            }
        });
        return found || normalized.fields[0];
    }

    function addMetric(name, icon, fields) {
        var list = normalizeFields(fields);
        var metric = {
            id: newId(),
            name: String(name || '').trim(),
            icon: icon || global.LivologIcons.fallback,
            fields: list,
            primary: list[0].id
        };
        var metrics = getMetrics();
        metrics.push(metric);
        write(METRIC_KEY, metrics);
        return metric;
    }

    /**
     * 改跟踪项。字段改动时同时把已有记录对齐到新字段：
     * 按字段**名字**找（所以重命名不会丢数据），找不到的字段值留空。
     */
    function updateMetric(id, name, icon, fields) {
        var list = getMetrics();
        var target = null;

        list.forEach(function (metric) {
            if (metric.id !== id) {
                return;
            }

            var before = normalizeMetric(metric).fields.slice();
            metric.name = String(name || '').trim();
            metric.icon = icon || metric.icon;

            if (fields) {
                var next = normalizeFields(fields);
                var oldByName = {};
                before.forEach(function (field) {
                    oldByName[field.name] = field.id;
                });
                // 名字没变就沿用旧 id，这样已有记录不用动
                next.forEach(function (field) {
                    if (oldByName[field.name]) {
                        field.id = oldByName[field.name];
                    }
                });
                metric.fields = next;
                var primaryOk = next.some(function (field) {
                    return field.id === metric.primary;
                });
                metric.primary = primaryOk ? metric.primary : next[0].id;
            }
            target = normalizeMetric(metric);
        });

        if (target) {
            write(METRIC_KEY, list);
            remapRecords(target);
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

    /** 按给定的 id 顺序重排跟踪项（跟踪页长按拖动排序用） */
    function reorderMetrics(ids) {
        var rank = {};
        (ids || []).forEach(function (id, index) {
            rank[id] = index;
        });

        var list = getMetrics();
        list.sort(function (a, b) {
            var ra = rank[a.id] === undefined ? ids.length : rank[a.id];
            var rb = rank[b.id] === undefined ? ids.length : rank[b.id];
            return ra - rb;
        });
        write(METRIC_KEY, list);
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
        if (value === null || value === undefined || String(value).trim() === '') {
            return null;
        }
        var number = Number(value);
        return isFinite(number) ? number : null;
    }

    /**
     * 收一份「字段 → 值」的输入，输出与跟踪项当前字段对齐的数组。
     * 没填的字段存 null；全都没填就返回 null（不建这条记录）。
     */
    function normalizeValues(metricId, input) {
        var fields = fieldsOf(metricId);
        var values = [];
        var any = false;

        fields.forEach(function (field) {
            var raw = input && typeof input === 'object' ? input[field.id] : input;
            var number = normalizeValue(raw);
            if (number === null) {
                values.push({ fieldId: field.id, value: null });
                return;
            }
            any = true;
            values.push({ fieldId: field.id, value: number });
        });

        return any ? values : null;
    }

    function addRecord(metricId, time, values) {
        if (!metricId) {
            return null;
        }
        var normalized = normalizeValues(metricId, values);
        if (!normalized) {
            return null;
        }

        var record = {
            id: newId(),
            metricId: metricId,
            time: time,
            values: normalized
        };
        var list = read(RECORD_KEY);
        list.push(record);
        write(RECORD_KEY, list);
        return record;
    }

    function updateRecord(id, metricId, time, values) {
        var normalized = normalizeValues(metricId, values);
        if (!normalized) {
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
            item.values = normalized;
            target = item;
        });

        if (target) {
            write(RECORD_KEY, list);
        }
        return target;
    }

    /**
     * 字段改名 / 增删后，把已有记录对齐到新字段：
     * 按字段 id 平移；id 对不上时按名字找（改名场景）；仍对不上则该字段留空。
     */
    function remapRecords(metric) {
        var list = read(RECORD_KEY);
        var changed = false;
        var byId = {};
        metric.fields.forEach(function (field) {
            byId[field.id] = field;
        });

        list.forEach(function (record) {
            if (record.metricId !== metric.id) {
                return;
            }

            var values = (record.values || []).slice();
            metric.fields.forEach(function (field) {
                var has = values.some(function (entry) {
                    return entry.fieldId === field.id;
                });
                if (!has) {
                    values.push({ fieldId: field.id, value: null });
                }
            });
            record.values = values.filter(function (entry) {
                return !!byId[entry.fieldId];
            });
            changed = true;
        });

        if (changed) {
            write(RECORD_KEY, list);
        }
    }

    /** 取某条记录某个字段的值（没有就是 null） */
    function valueOf(record, fieldId) {
        var found = null;
        ((record && record.values) || []).forEach(function (entry) {
            if (entry.fieldId === fieldId && found === null) {
                found = entry.value;
            }
        });
        return found === undefined ? null : found;
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

    // 旧版宽表列名（value）与新版的默认字段名，读旧文件时无视大小写
    var LEGACY_VALUE_COLUMN = 'value';
    var META_COLUMNS = ['id', 'metric', 'time'];

    /** 字段名 → CSV 列名：去掉不能当列名的字符，重名的话加序号 */
    function columnName(fieldName, taken) {
        var base = String(fieldName || '').trim().replace(/[,\r\n"]/g, '');
        if (!base) {
            base = 'value';
        }
        var name = base;
        var index = 2;
        var lower = {};
        taken.forEach(function (item) {
            lower[item.toLowerCase()] = true;
        });
        while (lower[name.toLowerCase()]) {
            name = base + '_' + index;
            index += 1;
        }
        return name;
    }

    /**
     * 把每条记录压成一行（宽表）：字段名就是列名。
     * 列的集合来自所有跟踪项的字段，按跟踪项顺序排。
     */
    function stringify() {
        var metrics = getMetrics().map(normalizeMetric);
        var namesById = {};
        var columns = [];
        var taken = META_COLUMNS.slice();

        metrics.forEach(function (metric) {
            namesById[metric.id] = metric.name;
            metric.fields.forEach(function (field) {
                var name = columnName(field.name, taken);
                taken.push(name);
                columns.push({ metricId: metric.id, fieldId: field.id, name: name, field: field.name });
            });
        });

        var lines = [META_COLUMNS.concat(columns.map(function (column) {
            return column.name;
        })).join(',')];

        getRecords().slice().sort(function (a, b) {
            return a.time - b.time;
        }).forEach(function (record) {
            var row = [
                global.LivologCsv.escapeField(record.id),
                global.LivologCsv.escapeField(namesById[record.metricId] || ''),
                global.LivologCsv.escapeField(global.LivologCsv.formatTimestamp(record.time))
            ];

            columns.forEach(function (column) {
                if (column.metricId !== record.metricId) {
                    row.push('');
                    return;
                }
                var value = valueOf(record, column.fieldId);
                row.push(global.LivologCsv.escapeField(value === null ? '' : value));
            });

            lines.push(row.join(','));
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
            var head = {};
            columns.forEach(function (name, position) {
                head[name] = position;
            });
            // 认表头就跳过第一行；不认就按固定列序当成纯数据
            if (head.metric !== undefined && head.time !== undefined) {
                body = rows.slice(1);
            } else {
                columns = HEADER;
            }
        }

        var at = {};
        columns.forEach(function (name, position) {
            at[name] = position;
        });

        var metrics = getMetrics().map(normalizeMetric);
        var byName = {};
        metrics.forEach(function (metric) {
            byName[metric.name] = metric;
        });

        // 除了 id/metric/time 之外的列都当作「字段」：列名就是字段名。
        var valueColumns = [];
        Object.keys(at).forEach(function (name) {
            if (META_COLUMNS.indexOf(name) >= 0) {
                return;
            }
            valueColumns.push({ key: name, position: at[name] });
        });
        valueColumns.sort(function (a, b) {
            return a.position - b.position;
        });

        var records = [];
        body.forEach(function (row) {
            var name = String(row[at.metric] || '').trim();
            var time = global.LivologCsv.parseTimestamp(row[at.time]);
            if (!name || time === null) {
                return;
            }

            if (!byName[name]) {
                var created = normalizeMetric({
                    id: newId(),
                    name: name,
                    icon: global.LivologIcons.fallback
                });
                metrics.push(created);
                byName[name] = created;
            }
            var metric = byName[name];

            // 文件里这一行的字段集合，可能比跟踪项现有的多（Excel 里手工加了列）
            var rowFields = [];
            valueColumns.forEach(function (column) {
                var number = normalizeValue(row[column.position]);
                var fieldName = column.key === LEGACY_VALUE_COLUMN
                    ? (metric.fields[0] ? metric.fields[0].name : DEFAULT_FIELD)
                    : column.key;
                var found = null;
                metric.fields.forEach(function (field) {
                    if (!found && field.name.toLowerCase() === fieldName.toLowerCase()) {
                        found = field;
                    }
                });
                if (!found) {
                    found = { id: newId(), name: fieldName };
                    metric.fields.push(found);
                }
                rowFields.push({ fieldId: found.id, value: number });
            });

            // 跟踪项里有、文件里没这一列的值，补成空
            metric.fields.forEach(function (field) {
                var has = rowFields.some(function (entry) {
                    return entry.fieldId === field.id;
                });
                if (!has) {
                    rowFields.push({ fieldId: field.id, value: null });
                }
            });

            records.push({
                id: (at.id === undefined ? '' : String(row[at.id] || '').trim()) || newId(),
                metricId: metric.id,
                time: time,
                values: rowFields
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
        reorderMetrics: reorderMetrics,
        primaryField: primaryField,
        fieldsOf: fieldsOf,
        valueOf: valueOf,
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

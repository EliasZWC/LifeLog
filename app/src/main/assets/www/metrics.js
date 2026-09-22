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
    /**
     * 老数据（跟踪项没有 fields）补出来的那个字段要用的**固定 id**。
     * ⚠️ 不能用 newId()：normalizeMetric 每次读取都会跑，随机 id 会让同一个跟踪项
     *    每次的字段 id 都不同，老记录（values 里存的是当时那个 id）就全对不上了。
     *
     * ⚠️ 也**不能**用一个全局常量（v0.1.15 前的写法）：那样所有老跟踪项的
     *    第一字段 id 都叫 `legacy-value`，而 valueOf 只按 fieldId 匹配、不看这条
     *    记录属于哪个跟踪项，于是 A 的值能被 B 读到（用户报的「某项跟踪把别的
     *    跟踪的所有项目都包含了」就是这个）。所以 id 必须**按跟踪项派生**。
     */
    var LEGACY_FIELD_PREFIX = 'legacy:';

    /** 某个跟踪项「自动补出来的老字段」的固定 id（每个跟踪项各不相同） */
    function legacyFieldId(metricId) {
        return LEGACY_FIELD_PREFIX + String(metricId === undefined || metricId === null ? '' : metricId);
    }

    /** 旧版本用过的全局常量 id；迁移时要把它们换算成按跟踪项派生的 id */
    var LEGACY_FIELD_ID = 'legacy-value';

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

    /**
     * 把字段描述统一成 [{id, name}]，旧数据（没有 fields）自动补一个「值」字段。
     *
     * @param {Array} fields
     * @param {{metricId?: string, legacy?: boolean}} [options]
     *        legacy = true 表示这是在「补老数据」，补出来的字段用按跟踪项派生的固定 id，
     *        保证多次读取拿到同一个 id，且不同跟踪项之间不会撞车。
     */
    function normalizeFields(fields, options) {
        var out = [];
        (fields || []).forEach(function (field) {
            var name = String(field && field.name ? field.name : '').trim();
            if (!name) {
                return;
            }
            out.push({ id: (field && field.id) || newId(), name: name });
        });
        if (!out.length) {
            // ⚠️ 老数据补字段：id 必须固定且按跟踪项区分，否则要么每次读取都换一个，
            //    要么不同跟踪项共用同一个 id（都会让记录对不上）。
            var id = options && options.legacy
                ? legacyFieldId(options.metricId)
                : newId();
            out.push({ id: id, name: DEFAULT_FIELD });
        }
        return out;
    }

    /**
     * 补齐老数据结构：
     *   - 没有 fields → 一个叫「值」的字段；
     *   - primary 指向不存在的字段 → 指回第一个；
     *   - isDerived（计算出来的）字段名 → 不参与编辑
     *
     * ⚠️ 给老数据补字段时**必须用按跟踪项派生的固定 id**：
     *    normalizeMetric 每次读取都会跑一遍，用随机 id 会导致同一个跟踪项
     *    每次拿到的字段 id 都不一样 → 老记录的 values 永远对不上 → 记录「不能用了」；
     *    而用一个全局常量又会让不同跟踪项的字段 id 相同 → 值会互相串。
     *    （前一个是 v0.1.13 修的，后一个是 v0.1.15 修的。）
     */
    function normalizeMetric(metric) {
        if (!metric) {
            return null;
        }
        metric.fields = normalizeFields(metric.fields, {
            legacy: true,
            metricId: metric.id
        });
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

    /**
     * 一次性的老数据迁移（v0.1.13）：
     * 把「跟踪项没有 fields」与「记录只有 value」这两种老结构补成新结构并落盘。
     *
     * 老版本里 normalizeMetric 每次读取都用 newId() 给缺字段的跟踪项造 id，
     * 于是同一个跟踪项每次的字段 id 都不同，老记录存的 fieldId 永远对不上 ——
     * 表现就是「旧记录不能用了」。这里补齐后写入 localStorage，之后读到的都是稳定 id。
     *
     * @returns {boolean} 是否有改动
     */
    function migrateLegacy() {
        var metrics = read(METRIC_KEY);
        var records = read(RECORD_KEY);
        var changed = false;

        // 1. 跟踪项：缺 fields / primary 的补齐（normalizeMetric 已经用固定 id 兜底）
        var normalized = metrics.map(function (metric) {
            var before = JSON.stringify(metric.fields) + '|' + metric.primary;
            var next = normalizeMetric(metric);
            if (JSON.stringify(next.fields) + '|' + next.primary !== before) {
                changed = true;
            }
            return next;
        });

        // 2. 记录：{value: n} → {values: [{fieldId, value}]}
        var byId = {};
        normalized.forEach(function (metric) {
            byId[metric.id] = metric;
        });

        records.forEach(function (record) {
            if (Array.isArray(record.values) && record.values.length) {
                return;
            }
            var metric = byId[record.metricId];
            var fieldId = metric && metric.fields.length
                ? metric.fields[0].id
                : legacyFieldId(record.metricId);
            var number = normalizeValue(record.value);
            record.values = number === null
                ? []
                : [{ fieldId: fieldId, value: number }];
            delete record.value;
            changed = true;
        });

        /*
           2.5 把旧版那个**全局** `legacy-value` 换算成按跟踪项派生的 id。
               旧版所有老跟踪项的第一字段都叫这个，换算后各归各家，值才不会互相串。
        */
        records.forEach(function (record) {
            if (!Array.isArray(record.values) || !record.values.length) {
                return;
            }
            var metric = byId[record.metricId];
            if (!metric || !metric.fields.length) {
                return;
            }
            var target = metric.fields[0].id;
            if (target === LEGACY_FIELD_ID) {
                return; // 目标本身就是那个常量，不用换
            }
            var touched = false;
            record.values.forEach(function (entry) {
                if (entry.fieldId === LEGACY_FIELD_ID) {
                    entry.fieldId = target;
                    touched = true;
                }
            });
            if (touched) {
                changed = true;
            }
        });

        /*
           3. 把记录的 fieldId 对齐到跟踪项当前字段：
              认不上的（老版本随机生成的 id）落到第一个字段上，但如果记录里
              **已经有本跟踪项的字段**，就只丢掉认不上的那些，不再硬塞 ——
              否则会把别的跟踪项的值也塞进来（用户报的「包含了不属于本项的项目」）。
        */
        records.forEach(function (record) {
            var metric = byId[record.metricId];
            if (!metric || !Array.isArray(record.values) || !record.values.length) {
                return;
            }
            var keep = {};
            metric.fields.forEach(function (field) {
                keep[field.id] = true;
            });
            var kept = record.values.filter(function (entry) {
                return keep[entry.fieldId];
            });

            // 一个都没对上（老版本每次读取都随机生成字段 id）→ 落到第一个字段，值不丢
            if (!kept.length) {
                var fallback = metric.fields[0];
                var first = record.values.filter(function (entry) {
                    return entry.value !== null;
                })[0];
                if (fallback && first) {
                    kept = [{ fieldId: fallback.id, value: first.value }];
                }
            }

            /*
               ⚠️ 这里必须比**内容**而不是长度：fallback 常常是「一个换一个」，
                 长度没变，只比长度就会漏掉改写（v0.1.13 踩过的坑）。
            */
            var same = kept.length === record.values.length &&
                kept.every(function (entry, index) {
                    var other = record.values[index];
                    return other && other.fieldId === entry.fieldId &&
                        other.value === entry.value;
                });
            if (!same) {
                record.values = kept;
                changed = true;
            }
        });

        if (changed) {
            suppressPersist = true;
            try {
                global.localStorage.setItem(METRIC_KEY, JSON.stringify(normalized));
                global.localStorage.setItem(RECORD_KEY, JSON.stringify(records));
            } catch (e) {
                /* 忽略 */
            }
            suppressPersist = false;
        }
        return changed;
    }

    /**
     * 修复「跟踪项挂着一大堆不属于自己的项目」（v0.1.15）。
     *
     * 老版 applyStoredCsv 会把 CSV 里的**所有**值列都加成每个跟踪项的字段，
     * 于是血压的跟踪项里会出现 weight / waistline / weight_2 / waistline_2…
     * 一大堆别的跟踪项的项目（值全是空）。这里按「这个跟踪项自己的记录里
     * 到底用到过哪些字段」把多余的剪掉：
     *   - 有值的字段一定保留；
     *   - 从没被任何记录用过、名字又是「别的跟踪项的字段名」的一律删掉；
     *   - 至少保留一个字段（primary 指向的），否则跟踪项就没项目了。
     *
     * ⚠️ 只删**从来没有任何值**的字段，所以不会丢数据。
     *
     * @returns {boolean} 是否有改动
     */
    function pruneUnusedFields() {
        var metrics = read(METRIC_KEY).map(normalizeMetric);
        var records = read(RECORD_KEY);
        var changed = false;

        // 统计每个跟踪项各字段「被真正写过值」的次数
        var usedByMetric = {};
        records.forEach(function (record) {
            var bucket = usedByMetric[record.metricId] ||
                (usedByMetric[record.metricId] = {});
            normalizeRecordValues(record).forEach(function (entry) {
                if (entry.value === null || entry.value === undefined) {
                    return;
                }
                bucket[entry.fieldId] = (bucket[entry.fieldId] || 0) + 1;
            });
        });

        metrics.forEach(function (metric) {
            var used = usedByMetric[metric.id] || {};
            var keep = metric.fields.filter(function (field) {
                return used[field.id];
            });
            if (!keep.length) {
                // 一条值都没有：只留 primary 指向的那个（或第一个），别把跟踪项清空
                var primary = primaryField(metric);
                keep = [primary || metric.fields[0]];
            }
            if (keep.length === metric.fields.length) {
                return;
            }

            var keptIds = {};
            keep.forEach(function (field) {
                keptIds[field.id] = true;
            });
            metric.fields = keep;
            if (!keptIds[metric.primary]) {
                metric.primary = keep[0].id;
            }
            // 记录里的 values 也按新字段集合裁一遍（多余的都是空值）
            records.forEach(function (record) {
                if (record.metricId !== metric.id || !Array.isArray(record.values)) {
                    return;
                }
                record.values = record.values.filter(function (entry) {
                    return keptIds[entry.fieldId];
                });
            });
            changed = true;
        });

        if (changed) {
            suppressPersist = true;
            try {
                global.localStorage.setItem(METRIC_KEY, JSON.stringify(metrics));
                global.localStorage.setItem(RECORD_KEY, JSON.stringify(records));
            } catch (e) {
                /* 忽略 */
            }
            suppressPersist = false;
        }
        return changed;
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

    /**
     * 把一条记录的值统一成 [{fieldId, value}]。
     * 兼容老结构：更早的版本每条记录只存一个 `value`（没有 values 数组），
     * 这时把它当作「跟踪项第一个字段」的值。
     */
    function normalizeRecordValues(record, metricId) {
        if (!record) {
            return [];
        }
        if (Array.isArray(record.values) && record.values.length) {
            return record.values;
        }
        // 老结构：{ value: <number> }
        if (record.value !== undefined && record.value !== null) {
            var owner = record.metricId || metricId;
            var fields = fieldsOf(owner);
            // 用按跟踪项派生的 id 兜底，避免不同跟踪项之间串值
            var field = fields.length ? fields[0] : { id: legacyFieldId(owner) };
            return [{ fieldId: field.id, value: normalizeValue(record.value) }];
        }
        return [];
    }

    /**
     * 取某条记录某个字段的值（没有就是 null）。
     *
     * ⚠️ 必须**同时**校验 fieldId 与记录归属的跟踪项：老数据里不同跟踪项的字段 id
     *    可能撞车（旧版都用 `legacy-value`），只看 fieldId 会让 A 跟踪项读到 B 的值。
     *    这里在「记录的 metricId 与入参给出的跟踪项不一致」且字段不属于该记录时返回 null。
     */
    function valueOf(record, fieldId, metricId) {
        if (!record || !fieldId) {
            return null;
        }
        // 记录自己的跟踪项优先；调用方传进来的 metricId 只作为交叉校验
        var owner = record.metricId;
        if (owner && metricId && owner !== metricId) {
            // 明确不是同一个跟踪项 —— 绝不返回别的跟踪项的值
            return null;
        }
        var found = null;
        normalizeRecordValues(record).forEach(function (entry) {
            if (entry.fieldId === fieldId && found === null) {
                found = entry.value;
            }
        });
        return found === undefined || found === null ? null : found;
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

    /**
     * 字段名 → CSV 列名：去掉不能当列名的字符，重名的话加序号。
     *
     * ⚠️ 重名的后缀要能**反解回原字段名**，否则「列出 → 读回」这一圈会把
     *    `weight_2` 当成一个真名叫 weight_2 的新字段，越滚越多
     *    （用户报的 weight_2 / waistline_2 就是这么来的）。
     *    所以后缀用 `~2` 这种不会出现在字段名里的分隔符，读回来时剥掉即可；
     *    列名里的 `_2` 如果本来就是字段名的一部分，也不会被误剥。
     */
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
            name = base + '~' + index;
            index += 1;
        }
        return name;
    }

    /** CSV 列名 → 字段名（剥掉重名后缀 `~N`） */
    function fieldNameOfColumn(column) {
        return String(column || '').replace(/~\d+$/, '');
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
                var value = valueOf(record, column.fieldId, record.metricId);
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

        /*
           ⚠️ 先把「每行的原始值」读出来，按跟踪项分组，**再**决定字段。
              不能像以前那样「每行把所有列都当成字段塞给该行的跟踪项」：
              宽表里 A 的列（如 Systolic）在 B 的行里是空的，以前却照样给 B
              建了同名字段，于是每个跟踪项都长出一大堆别的项目的字段
              （用户报的「一个跟踪记录很多很多项目」就是这个）。
        */
        var raw = [];
        body.forEach(function (row) {
            var name = String(row[at.metric] || '').trim();
            var time = global.LivologCsv.parseTimestamp(row[at.time]);
            if (!name || time === null) {
                return;
            }
            var cells = {};
            valueColumns.forEach(function (column) {
                cells[column.key] = normalizeValue(row[column.position]);
            });
            raw.push({
                id: (at.id === undefined ? '' : String(row[at.id] || '').trim()) || newId(),
                name: name,
                time: time,
                cells: cells
            });
        });

        // 每个跟踪项真正用到的列 = 它自己的行里至少有一个非空值的那几列
        var usedColumns = {};
        raw.forEach(function (entry) {
            var set = usedColumns[entry.name] || (usedColumns[entry.name] = {});
            valueColumns.forEach(function (column) {
                if (entry.cells[column.key] !== null) {
                    set[column.key] = true;
                }
            });
        });

        /*
           确定每个跟踪项最终的字段列表：
             - 保留跟踪项已有的字段（按名字匹配，改名不丢数据）；
             - 只补充「本跟踪项自己的行里真的有值」的列；
             - legacy `value` 列仍映射到第一个字段。
        */
        var records = [];
        raw.forEach(function (entry) {
            if (!byName[entry.name]) {
                var created = normalizeMetric({
                    id: newId(),
                    name: entry.name,
                    icon: global.LivologIcons.fallback
                });
                metrics.push(created);
                byName[entry.name] = created;
            }
            var metric = byName[entry.name];
            var used = usedColumns[entry.name] || {};

            var rowFields = [];
            valueColumns.forEach(function (column) {
                if (!used[column.key] && column.key !== LEGACY_VALUE_COLUMN) {
                    return; // 这一列在这个跟踪项里全是空的，不是它的项目
                }
                var number = entry.cells[column.key];
                if (column.key === LEGACY_VALUE_COLUMN && number === null) {
                    return;
                }
                // 列名可能是 `weight~2` 这种重名形式，读回字段名时把后缀剥掉
                var fieldName = column.key === LEGACY_VALUE_COLUMN
                    ? (metric.fields[0] ? metric.fields[0].name : DEFAULT_FIELD)
                    : fieldNameOfColumn(column.key);
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
                if (number !== null) {
                    rowFields.push({ fieldId: found.id, value: number });
                }
            });

            // 跟踪项里有、文件里这一行没值的字段，补成空（保持每行字段集合完整）
            metric.fields.forEach(function (field) {
                var has = rowFields.some(function (item) {
                    return item.fieldId === field.id;
                });
                if (!has) {
                    rowFields.push({ fieldId: field.id, value: null });
                }
            });

            records.push({
                id: entry.id,
                metricId: metric.id,
                time: entry.time,
                values: rowFields
            });
        });

        if (!persistReplace(metrics, records)) {
            return false;
        }

        /*
           读完文件再剪一遍「从来没有任何值」的多余字段。
           老文件（或老版本生成的缓存）里，每个跟踪项都被塞进了所有列当字段，
           上面按「本跟踪项自己用到的列」重建已经修掉大部分；这里再兜一次底，
           顺便把已经落盘的老数据也清干净。
        */
        pruneUnusedFields();

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
        migrateLegacy: migrateLegacy,
        pruneUnusedFields: pruneUnusedFields,
        exportCsv: exportCsv,
        onChange: function (listener) {
            listeners.push(listener);
        }
    };
})(window);

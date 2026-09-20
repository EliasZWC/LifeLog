/**
 * LifeLog - CSV 序列化 / 解析（时间记录的落盘格式）。
 *
 * 表头固定为：id,behavior,type,start,end
 * - behavior 写的是行为**名称**而不是 id，这样文件人能读、也能跨设备迁移
 * - start / end 为本地时间 "YYYY-MM-DD HH:mm"；时点的 end 留空
 * - 行尾用 CRLF，方便 Excel 直接打开
 */
(function (global) {
    'use strict';

    var HEADER = ['id', 'behavior', 'type', 'start', 'end'];

    function pad(value, length) {
        var text = String(value);
        while (text.length < length) {
            text = '0' + text;
        }
        return text;
    }

    function formatTimestamp(ms) {
        var date = new Date(ms);
        return date.getFullYear() + '-' + pad(date.getMonth() + 1, 2) + '-' + pad(date.getDate(), 2) +
            ' ' + pad(date.getHours(), 2) + ':' + pad(date.getMinutes(), 2);
    }

    /** 容忍 "YYYY-MM-DD HH:mm"、"YYYY-MM-DDTHH:mm"、"YYYY-MM-DD-HH:mm" 几种写法 */
    function parseTimestamp(text) {
        var matched = /^(\d{4})-(\d{2})-(\d{2})[ T-](\d{1,2}):(\d{2})/.exec(String(text || '').trim());
        if (!matched) {
            return null;
        }

        var year = Number(matched[1]);
        var month = Number(matched[2]);
        var day = Number(matched[3]);
        var hour = Number(matched[4]);
        var minute = Number(matched[5]);

        if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) {
            return null;
        }

        var date = new Date(year, month - 1, day, hour, minute, 0, 0);
        if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
            return null;
        }

        return date.getTime();
    }

    function escapeField(value) {
        var text = value === null || value === undefined ? '' : String(value);
        return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
    }

    function stringify(records, behaviors) {
        var namesById = {};
        (behaviors || []).forEach(function (behavior) {
            namesById[behavior.id] = behavior.name;
        });

        var lines = [HEADER.join(',')];

        (records || []).forEach(function (record) {
            var hasEnd = record.end !== null && record.end !== undefined;
            lines.push([
                escapeField(record.id),
                escapeField(namesById[record.behaviorId] || ''),
                escapeField(record.type),
                escapeField(formatTimestamp(record.start)),
                escapeField(hasEnd ? formatTimestamp(record.end) : '')
            ].join(','));
        });

        return lines.join('\r\n') + '\r\n';
    }

    function parseRows(text) {
        var source = String(text || '').replace(/^\uFEFF/, '');
        var rows = [];
        var row = [];
        var field = '';
        var inQuotes = false;
        var index = 0;

        while (index < source.length) {
            var ch = source.charAt(index);

            if (inQuotes) {
                if (ch === '"') {
                    if (source.charAt(index + 1) === '"') {
                        field += '"';
                        index += 2;
                        continue;
                    }
                    inQuotes = false;
                    index += 1;
                    continue;
                }
                field += ch;
                index += 1;
                continue;
            }

            if (ch === '"') {
                inQuotes = true;
                index += 1;
            } else if (ch === ',') {
                row.push(field);
                field = '';
                index += 1;
            } else if (ch === '\r') {
                index += 1;
            } else if (ch === '\n') {
                row.push(field);
                rows.push(row);
                row = [];
                field = '';
                index += 1;
            } else {
                field += ch;
                index += 1;
            }
        }

        if (field !== '' || row.length) {
            row.push(field);
            rows.push(row);
        }

        return rows;
    }

    /**
     * @returns {{ok: boolean, error?: string, records?: Array, behaviorNames?: Array<string>}}
     *   error 取值：'empty' | 'header'
     */
    function parse(text) {
        var rows = parseRows(text).filter(function (row) {
            return row.some(function (cell) {
                return String(cell).trim() !== '';
            });
        });

        if (!rows.length) {
            return { ok: false, error: 'empty' };
        }

        var columns = rows[0].map(function (name) {
            return String(name).trim().toLowerCase();
        });
        var hasHeader = columns.indexOf('start') >= 0;
        var body = hasHeader ? rows.slice(1) : rows;
        var names = hasHeader ? columns : HEADER;

        var at = {};
        names.forEach(function (name, position) {
            at[name] = position;
        });

        if (at.behavior === undefined || at.start === undefined) {
            return { ok: false, error: 'header' };
        }

        var records = [];
        var behaviorNames = [];

        body.forEach(function (row) {
            var behavior = String(row[at.behavior] || '').trim();
            var start = parseTimestamp(row[at.start]);
            if (!behavior || start === null) {
                return;
            }

            var type = at.type === undefined ? '' : String(row[at.type] || '').trim();
            if (type !== 'period' && type !== 'moment') {
                type = 'moment';
            }

            var end = at.end === undefined ? null : parseTimestamp(row[at.end]);
            if (type === 'period' && end === null) {
                type = 'moment';
            }
            if (type === 'moment') {
                end = null;
            }

            records.push({
                id: at.id === undefined ? '' : String(row[at.id] || '').trim(),
                behavior: behavior,
                type: type,
                start: start,
                end: end
            });

            if (behaviorNames.indexOf(behavior) < 0) {
                behaviorNames.push(behavior);
            }
        });

        return { ok: true, records: records, behaviorNames: behaviorNames };
    }

    global.LifeLogCsv = {
        header: HEADER,
        stringify: stringify,
        parse: parse,
        formatTimestamp: formatTimestamp
    };
})(window);

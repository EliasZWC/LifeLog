/**
 * Livolog - 日期时间的格式化与分段输入。
 *
 * 分段输入是 [YYYY]-[MM]-[DD]-[HH]:[mm] 五个固定宽度的小输入框：
 * 只收数字、填满自动跳下一位、在空位按退格回退。时间页与跟踪页共用同一套。
 */
(function (global) {
    'use strict';

    var CLOCK_DIGITS = 2;
    var YEAR_DIGITS = 4;

    /** 时间口径模块（延迟取，避免加载顺序问题） */
    function clock() {
        return global.LivologClock;
    }

    // --- 格式化 -------------------------------------------------------------

    function pad(value, length) {
        var text = String(value);
        while (text.length < length) {
            text = '0' + text;
        }
        return text;
    }

    /*
       ⚠️ 这三个函数都**转交**给 `LivologClock`，别在这里直接用 `new Date()` 的本地字段：
         用户在设置页把时区改成别的以后，「一天」的口径就跟着变了，
         时间页分组、日期标记、日期选择器都得一致。`LivologClock` 是唯一的口径来源。
    */

    function formatDate(timestamp) {
        return global.LivologClock.formatDate(timestamp);
    }

    function formatClock(timestamp) {
        return global.LivologClock.formatClock(timestamp);
    }

    /** 取某个时间戳所在自然日的零点（全 app 统一的“一天”口径） */
    function startOfDay(timestamp) {
        return global.LivologClock.startOfDay(timestamp);
    }

    // --- 分段输入 -----------------------------------------------------------

    /** 焦点跳到同一张弹窗里的上/下一个分段输入框 */
    function focusSibling(input, step) {
        var scope = input.closest ? (input.closest('.sheet') || document) : document;
        var all = Array.prototype.slice.call(scope.querySelectorAll('.seg'));
        var index = all.indexOf(input);
        var next = all[index + step];
        if (next) {
            next.focus();
        }
    }

    function segmentInput(digits, placeholder, name, inputs, onChange) {
        var input = global.LivologUI.el('input', 'seg');
        input.type = 'text';
        input.inputMode = 'numeric';
        input.autocomplete = 'off';
        input.maxLength = digits;
        input.placeholder = placeholder;
        input.dataset.length = String(digits);
        input.setAttribute('aria-label', placeholder);

        input.addEventListener('input', function () {
            var digitsOnly = input.value.replace(/\D/g, '').slice(0, digits);
            if (input.value !== digitsOnly) {
                input.value = digitsOnly;
            }
            if (digitsOnly.length === digits) {
                focusSibling(input, 1);
            }
            if (onChange) {
                onChange();
            }
        });

        input.addEventListener('keydown', function (event) {
            if (event.key === 'Backspace' && input.value === '') {
                focusSibling(input, -1);
            }
        });

        input.addEventListener('focus', function () {
            input.select();
        });

        inputs[name] = input;
        return input;
    }

    function appendSeparator(row, text) {
        row.appendChild(global.LivologUI.el('span', 'datetime-sep', text));
    }

    /**
     * 生成一组 [YYYY]-[MM]-[DD]-[HH]:[mm] 输入。
     * @param {string|null} labelText 前缀标签，不需要就传 null
     * @param {number} initial 初始时间戳
     * @param {Function} [onChange] 任一格内容变化时回调
     * @returns {{root: HTMLElement, inputs: object}}
     */
    function buildGroup(labelText, initial, onChange) {
        var group = global.LivologUI.el('div', 'datetime-group');
        var inputs = {};

        if (labelText) {
            group.appendChild(global.LivologUI.el('span', 'datetime-label', labelText));
        }

        var row = global.LivologUI.el('div', 'datetime-row');

        row.appendChild(segmentInput(YEAR_DIGITS, 'YYYY', 'year', inputs, onChange));
        appendSeparator(row, '-');
        row.appendChild(segmentInput(CLOCK_DIGITS, 'MM', 'month', inputs, onChange));
        appendSeparator(row, '-');
        row.appendChild(segmentInput(CLOCK_DIGITS, 'DD', 'day', inputs, onChange));
        appendSeparator(row, '-');
        row.appendChild(segmentInput(CLOCK_DIGITS, 'HH', 'hour', inputs, onChange));
        appendSeparator(row, ':');
        row.appendChild(segmentInput(CLOCK_DIGITS, 'mm', 'minute', inputs, onChange));

        group.appendChild(row);

        var date = clock().parts(initial);
        inputs.year.value = pad(date.year, YEAR_DIGITS);
        inputs.month.value = pad(date.month, CLOCK_DIGITS);
        inputs.day.value = pad(date.day, CLOCK_DIGITS);
        inputs.hour.value = pad(date.hour, CLOCK_DIGITS);
        inputs.minute.value = pad(date.minute, CLOCK_DIGITS);

        return { root: group, inputs: inputs };
    }

    function readGroup(group) {
        var values = {};
        Object.keys(group.inputs).forEach(function (name) {
            values[name] = group.inputs[name].value;
        });
        return values;
    }

    /** 读出来的值不完整 / 不是合法日期时返回 null */
    function toTimestamp(values) {
        if (!values) {
            return null;
        }

        var names = ['year', 'month', 'day', 'hour', 'minute'];
        for (var i = 0; i < names.length; i += 1) {
            var expected = names[i] === 'year' ? YEAR_DIGITS : CLOCK_DIGITS;
            if (!values[names[i]] || values[names[i]].length !== expected) {
                return null;
            }
        }

        var year = Number(values.year);
        var month = Number(values.month);
        var day = Number(values.day);
        var hour = Number(values.hour);
        var minute = Number(values.minute);

        if (month < 1 || month > 12 || day < 1 || day > 31) {
            return null;
        }
        if (hour > 23 || minute > 59) {
            return null;
        }

        // 用墙上时间去校验「2月30日」这类不存在的日期：
        // 先按日历规则算，再看换算出来的时刻读回墙上时间是不是同一个日期
        var utc = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
        if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 ||
            utc.getUTCDate() !== day) {
            return null;
        }

        return clock().stamp(year, month, day, hour, minute);
    }

    /**
     * 只要 [YYYY]-[MM]-[DD] 的分段输入（统计范围用）。
     * @returns {{root: HTMLElement, inputs: object}}
     */
    function buildDateGroup(labelText, initial, onChange) {
        var group = global.LivologUI.el('div', 'datetime-group');
        var inputs = {};

        if (labelText) {
            group.appendChild(global.LivologUI.el('span', 'datetime-label', labelText));
        }

        var row = global.LivologUI.el('div', 'datetime-row');
        row.appendChild(segmentInput(YEAR_DIGITS, 'YYYY', 'year', inputs, onChange));
        appendSeparator(row, '-');
        row.appendChild(segmentInput(CLOCK_DIGITS, 'MM', 'month', inputs, onChange));
        appendSeparator(row, '-');
        row.appendChild(segmentInput(CLOCK_DIGITS, 'DD', 'day', inputs, onChange));
        group.appendChild(row);

        var date = clock().parts(initial);
        inputs.year.value = pad(date.year, YEAR_DIGITS);
        inputs.month.value = pad(date.month, CLOCK_DIGITS);
        inputs.day.value = pad(date.day, CLOCK_DIGITS);

        return { root: group, inputs: inputs };
    }

    /** 只读到「日」，返回当天零点的时间戳；不完整或非法返回 null */
    function toDateTimestamp(values) {
        if (!values || !values.year || !values.month || !values.day) {
            return null;
        }
        if (values.year.length !== YEAR_DIGITS ||
            values.month.length !== CLOCK_DIGITS ||
            values.day.length !== CLOCK_DIGITS) {
            return null;
        }

        var year = Number(values.year);
        var month = Number(values.month);
        var day = Number(values.day);
        if (month < 1 || month > 12 || day < 1 || day > 31) {
            return null;
        }

        return startOfDay(clock().stamp(year, month, day, 0, 0));
    }

    global.LivologDateTime = {
        YEAR_DIGITS: YEAR_DIGITS,
        CLOCK_DIGITS: CLOCK_DIGITS,
        pad: pad,
        formatDate: formatDate,
        formatClock: formatClock,
        startOfDay: startOfDay,
        buildGroup: buildGroup,
        buildDateGroup: buildDateGroup,
        readGroup: readGroup,
        toTimestamp: toTimestamp,
        toDateTimestamp: toDateTimestamp
    };
})(window);

/**
 * LifeLog - 日期时间的格式化与分段输入。
 *
 * 分段输入是 [YYYY]-[MM]-[DD]-[HH]:[mm] 五个固定宽度的小输入框：
 * 只收数字、填满自动跳下一位、在空位按退格回退。时间页与跟踪页共用同一套。
 */
(function (global) {
    'use strict';

    var CLOCK_DIGITS = 2;
    var YEAR_DIGITS = 4;

    // --- 格式化 -------------------------------------------------------------

    function pad(value, length) {
        var text = String(value);
        while (text.length < length) {
            text = '0' + text;
        }
        return text;
    }

    function formatDate(timestamp) {
        var date = new Date(timestamp);
        return date.getFullYear() + '-' + pad(date.getMonth() + 1, 2) + '-' + pad(date.getDate(), 2);
    }

    function formatClock(timestamp) {
        var date = new Date(timestamp);
        return pad(date.getHours(), 2) + ':' + pad(date.getMinutes(), 2);
    }

    /** 取某个时间戳所在自然日的零点（全 app 统一的“一天”口径） */
    function startOfDay(timestamp) {
        var date = new Date(timestamp);
        return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
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
        var input = global.LifeLogUI.el('input', 'seg');
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
        row.appendChild(global.LifeLogUI.el('span', 'datetime-sep', text));
    }

    /**
     * 生成一组 [YYYY]-[MM]-[DD]-[HH]:[mm] 输入。
     * @param {string|null} labelText 前缀标签，不需要就传 null
     * @param {number} initial 初始时间戳
     * @param {Function} [onChange] 任一格内容变化时回调
     * @returns {{root: HTMLElement, inputs: object}}
     */
    function buildGroup(labelText, initial, onChange) {
        var group = global.LifeLogUI.el('div', 'datetime-group');
        var inputs = {};

        if (labelText) {
            group.appendChild(global.LifeLogUI.el('span', 'datetime-label', labelText));
        }

        var row = global.LifeLogUI.el('div', 'datetime-row');

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

        var date = new Date(initial);
        inputs.year.value = pad(date.getFullYear(), YEAR_DIGITS);
        inputs.month.value = pad(date.getMonth() + 1, CLOCK_DIGITS);
        inputs.day.value = pad(date.getDate(), CLOCK_DIGITS);
        inputs.hour.value = pad(date.getHours(), CLOCK_DIGITS);
        inputs.minute.value = pad(date.getMinutes(), CLOCK_DIGITS);

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

        var date = new Date(year, month - 1, day, hour, minute, 0, 0);
        // 2 月 30 日这类不存在的日期会被 Date 自动进位，这里挡掉
        if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
            return null;
        }

        return date.getTime();
    }

    /**
     * 只要 [YYYY]-[MM]-[DD] 的分段输入（统计范围用）。
     * @returns {{root: HTMLElement, inputs: object}}
     */
    function buildDateGroup(labelText, initial, onChange) {
        var group = global.LifeLogUI.el('div', 'datetime-group');
        var inputs = {};

        if (labelText) {
            group.appendChild(global.LifeLogUI.el('span', 'datetime-label', labelText));
        }

        var row = global.LifeLogUI.el('div', 'datetime-row');
        row.appendChild(segmentInput(YEAR_DIGITS, 'YYYY', 'year', inputs, onChange));
        appendSeparator(row, '-');
        row.appendChild(segmentInput(CLOCK_DIGITS, 'MM', 'month', inputs, onChange));
        appendSeparator(row, '-');
        row.appendChild(segmentInput(CLOCK_DIGITS, 'DD', 'day', inputs, onChange));
        group.appendChild(row);

        var date = new Date(initial);
        inputs.year.value = pad(date.getFullYear(), YEAR_DIGITS);
        inputs.month.value = pad(date.getMonth() + 1, CLOCK_DIGITS);
        inputs.day.value = pad(date.getDate(), CLOCK_DIGITS);

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

        return startOfDay(new Date(year, month - 1, day, 0, 0, 0, 0).getTime());
    }

    global.LifeLogDateTime = {
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

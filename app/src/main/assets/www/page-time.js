/**
 * LifeLog - 时间页。
 *
 * 三个视图（全部 / 时段 / 时点）由顶部视图栏切换；
 * 右下角悬浮按钮打开表单弹窗新增记录，时间按 YYYY-MM-DD-HH:mm 分段填写。
 */
(function (global) {
    'use strict';

    var VIEWS = ['all', 'period', 'moment'];
    var DEFAULT_VIEW = 'all';
    var VIEW_STORAGE_KEY = 'lifelog.timeView';
    var CLOCK_DIGITS = 2;
    var YEAR_DIGITS = 4;

    var listEl = null;
    var viewLabel = null;
    var viewButton = null;
    var fab = null;
    var sheet = null;
    var sheetTitle = null;
    var behaviorSelect = null;
    var typeSelect = null;
    var fieldsEl = null;
    var hintEl = null;
    var cancelBtn = null;
    var confirmBtn = null;

    var currentView = DEFAULT_VIEW;
    var groups = {};
    var behaviorValue = '';
    var typeValue = '';
    /** 非空表示当前表单在编辑这条已有记录，提交时走 update 而不是 add */
    var editingId = null;

    function t(key) {
        return global.LifeLogI18n ? global.LifeLogI18n.t(key) : key;
    }

    // --- 时间格式化 ---------------------------------------------------------

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

    function formatMonthDay(timestamp) {
        var date = new Date(timestamp);
        return pad(date.getMonth() + 1, 2) + '-' + pad(date.getDate(), 2);
    }

    function formatClock(timestamp) {
        var date = new Date(timestamp);
        return pad(date.getHours(), 2) + ':' + pad(date.getMinutes(), 2);
    }

    function sameDay(a, b) {
        return formatDate(a) === formatDate(b);
    }

    /** 上排：年月日（跨天用波浪号连接） */
    function dateLine(record) {
        if (record.type !== 'period' || record.end === null || sameDay(record.start, record.end)) {
            return formatDate(record.start);
        }
        return formatDate(record.start) + ' ~ ' + formatMonthDay(record.end);
    }

    /** 下排：时分 */
    function clockLine(record) {
        if (record.type !== 'period' || record.end === null) {
            return formatClock(record.start);
        }
        return formatClock(record.start) + ' ~ ' + formatClock(record.end);
    }

    // --- 分段数字输入 -------------------------------------------------------

    function segmentInput(digits, placeholder, name, inputs) {
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
            validate();
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

    function focusSibling(input, step) {
        var all = Array.prototype.slice.call(sheet.querySelectorAll('.seg'));
        var index = all.indexOf(input);
        var next = all[index + step];
        if (next) {
            next.focus();
        }
    }

    function appendSeparator(row, text) {
        row.appendChild(global.LifeLogUI.el('span', 'datetime-sep', text));
    }

    /** 生成一组 [YYYY]-[MM]-[DD]-[HH]:[mm] 输入 */
    function buildGroup(labelText, initial) {
        var group = global.LifeLogUI.el('div', 'datetime-group');
        var inputs = {};

        if (labelText) {
            group.appendChild(global.LifeLogUI.el('span', 'datetime-label', labelText));
        }

        var row = global.LifeLogUI.el('div', 'datetime-row');

        row.appendChild(segmentInput(YEAR_DIGITS, 'YYYY', 'year', inputs));
        appendSeparator(row, '-');
        row.appendChild(segmentInput(CLOCK_DIGITS, 'MM', 'month', inputs));
        appendSeparator(row, '-');
        row.appendChild(segmentInput(CLOCK_DIGITS, 'DD', 'day', inputs));
        appendSeparator(row, '-');
        row.appendChild(segmentInput(CLOCK_DIGITS, 'HH', 'hour', inputs));
        appendSeparator(row, ':');
        row.appendChild(segmentInput(CLOCK_DIGITS, 'mm', 'minute', inputs));

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

    // --- 视图栏 -------------------------------------------------------------

    function setView(view, options) {
        if (VIEWS.indexOf(view) < 0) {
            view = DEFAULT_VIEW;
        }

        var changed = view !== currentView;
        var from = VIEWS.indexOf(currentView);
        var to = VIEWS.indexOf(view);

        currentView = view;
        renderViewBar();

        try {
            global.localStorage.setItem(VIEW_STORAGE_KEY, view);
        } catch (e) {
            /* 忽略 */
        }

        render();

        if (changed && (!options || options.animate !== false)) {
            global.LifeLogUI.animateEnter(listEl, to >= from ? 1 : -1);
        }
    }

    function renderViewBar() {
        viewLabel.textContent = t('view.' + currentView);
        viewButton.setAttribute('aria-expanded', 'false');
    }

    function openViewMenu() {
        var items = VIEWS.map(function (view) {
            return {
                value: view,
                label: t('view.' + view),
                selected: view === currentView
            };
        });

        global.LifeLogUI.openMenu(viewButton, items, function (value) {
            setView(value);
        });
    }

    // --- 列表 ---------------------------------------------------------------

    function render() {
        if (!listEl) {
            return;
        }

        var records = global.LifeLogStore.getRecords().filter(function (record) {
            return currentView === 'all' || record.type === currentView;
        });

        listEl.innerHTML = '';

        if (!records.length) {
            listEl.appendChild(global.LifeLogUI.emptyState(t('time.empty')));
            return;
        }

        records.forEach(function (record) {
            var behavior = global.LifeLogStore.getBehavior(record.behaviorId);

            var card = global.LifeLogUI.el('li', 'card');
            card.dataset.id = record.id;
            card.appendChild(global.LifeLogUI.icon(
                behavior ? behavior.icon : global.LifeLogIcons.fallback,
                'card-icon'
            ));
            card.appendChild(global.LifeLogUI.el('span', 'card-title', behavior ? behavior.name : '—'));

            var time = global.LifeLogUI.el('span', 'card-time');
            time.appendChild(global.LifeLogUI.el('span', 'card-time-date', dateLine(record)));
            time.appendChild(global.LifeLogUI.el('span', 'card-time-clock', clockLine(record)));
            card.appendChild(time);

            if (global.LifeLogUI.isSelected(record.id)) {
                card.classList.add('is-selected');
            }

            global.LifeLogUI.attachLongPress(card, function () {
                global.LifeLogUI.startSelection(record.id);
            });

            card.addEventListener('click', function () {
                if (global.LifeLogUI.justLongPressed()) {
                    return;
                }
                if (global.LifeLogUI.isSelecting()) {
                    global.LifeLogUI.toggleSelection(record.id);
                    return;
                }
                // 普通点击 = 修改这条记录
                openForm(record);
            });

            listEl.appendChild(card);
        });
    }

    // --- 表单 ---------------------------------------------------------------

    /** 行为 / 类型两个下拉（自绘，统一 app 风格） */
    function createSelects() {
        behaviorSelect = global.LifeLogUI.createSelect(document.getElementById('time-behavior'), {
            getOptions: function () {
                return global.LifeLogStore.getBehaviors().map(function (behavior) {
                    return { value: behavior.id, label: behavior.name };
                });
            },
            getValue: function () {
                return behaviorValue;
            },
            onChange: function (value) {
                behaviorValue = value;
                validate();
            },
            isDisabled: function () {
                return global.LifeLogStore.getBehaviors().length === 0;
            },
            placeholder: function () {
                return t('time.form.needBehavior');
            }
        });

        typeSelect = global.LifeLogUI.createSelect(document.getElementById('time-type'), {
            getOptions: function () {
                return [
                    { value: 'moment', label: t('view.moment') },
                    { value: 'period', label: t('view.period') }
                ];
            },
            getValue: function () {
                return typeValue;
            },
            onChange: function (value) {
                // 换类型时把已填的时间带过去，别让用户重填
                var seed = currentSeed();
                typeValue = value;
                buildTimeFields(seed);
            },
            placeholder: function () {
                return t('time.form.type.none');
            }
        });
    }

    /** 当前表单里已填的起止时间（读不出来就是 null） */
    function currentSeed() {
        var start = null;
        var end = null;

        if (groups.moment) {
            start = toTimestamp(readGroup(groups.moment));
        } else if (groups.start) {
            start = toTimestamp(readGroup(groups.start));
        }
        if (groups.end) {
            end = toTimestamp(readGroup(groups.end));
        }

        return { start: start, end: end };
    }

    /** 类型决定时间怎么填：选之前第三行不可填写 */
    function buildTimeFields(seed) {
        fieldsEl.innerHTML = '';
        groups = {};

        var now = Date.now();
        var startAt = now;
        var endAt = now;

        if (seed && seed.start !== null) {
            // 编辑 / 切类型：沿用已有时间
            startAt = seed.start;
            endAt = seed.end !== null ? seed.end : seed.start;
        } else if (typeValue === 'period') {
            startAt = now - 60 * 60 * 1000;
        }

        if (typeValue === 'period' && endAt <= startAt) {
            endAt = startAt + 60 * 60 * 1000;
        }

        if (typeValue === 'moment') {
            groups.moment = buildGroup(null, startAt);
            fieldsEl.appendChild(groups.moment.root);
        } else if (typeValue === 'period') {
            groups.start = buildGroup(t('time.form.start'), startAt);
            groups.end = buildGroup(t('time.form.end'), endAt);
            fieldsEl.appendChild(groups.start.root);
            fieldsEl.appendChild(groups.end.root);
        }

        validate();
    }

    /**
     * 打开表单。
     * @param {object} [record] 传了就是「修改已有记录」，不传就是「新增」
     */
    function openForm(record) {
        var behaviors = global.LifeLogStore.getBehaviors();

        editingId = record && record.id ? record.id : null;

        if (editingId) {
            behaviorValue = record.behaviorId;
            typeValue = record.type;
        } else {
            behaviorValue = behaviors.length ? behaviors[0].id : '';
            typeValue = '';
        }

        sheetTitle.textContent = t(editingId ? 'time.form.editTitle' : 'time.form.title');
        behaviorSelect.refresh();
        typeSelect.refresh();
        buildTimeFields(editingId ? { start: record.start, end: record.end } : null);

        global.LifeLogUI.openSheet(sheet);
    }

    function validate() {
        var hasBehaviors = global.LifeLogStore.getBehaviors().length > 0;
        var type = typeValue;
        var start = null;
        var end = null;
        var hint = '';
        var ok = false;

        if (!hasBehaviors) {
            hint = t('time.form.needBehavior');
        } else if (!type) {
            hint = t('time.form.needType');
        } else if (type === 'moment') {
            start = toTimestamp(groups.moment ? readGroup(groups.moment) : null);
            if (start === null) {
                hint = t('time.form.invalidTime');
            } else {
                ok = true;
            }
        } else {
            start = toTimestamp(groups.start ? readGroup(groups.start) : null);
            end = toTimestamp(groups.end ? readGroup(groups.end) : null);
            if (start === null || end === null) {
                hint = t('time.form.invalidTime');
            } else if (end < start) {
                hint = t('time.form.endBeforeStart');
            } else {
                ok = true;
            }
        }

        hintEl.textContent = hint;
        hintEl.hidden = !hint;
        confirmBtn.disabled = !ok;

        return { ok: ok, start: start, end: end, type: type };
    }

    function submit() {
        var result = validate();
        if (!result.ok || !behaviorValue) {
            return;
        }

        if (editingId) {
            global.LifeLogStore.updateRecord(
                editingId,
                behaviorValue,
                result.type,
                result.start,
                result.end
            );
        } else {
            global.LifeLogStore.addRecord(
                behaviorValue,
                result.type,
                result.start,
                result.end
            );
        }

        editingId = null;
        global.LifeLogUI.closeSheet();

        // 当前视图看不到这条记录时切过去，保证有反馈
        if (currentView !== 'all' && currentView !== result.type) {
            setView(result.type);
        }
    }

    // --- 初始化 -------------------------------------------------------------

    function init() {
        listEl = document.getElementById('time-list');
        viewLabel = document.getElementById('view-current');
        viewButton = document.getElementById('view-button');
        fab = document.getElementById('time-fab');
        sheet = document.getElementById('sheet-time');
        sheetTitle = document.getElementById('sheet-time-title');
        fieldsEl = document.getElementById('time-fields');
        hintEl = document.getElementById('time-hint');
        cancelBtn = document.getElementById('time-cancel');
        confirmBtn = document.getElementById('time-confirm');

        createSelects();

        viewButton.addEventListener('click', openViewMenu);
        fab.addEventListener('click', function () {
            openForm(null);
        });
        cancelBtn.addEventListener('click', function () {
            editingId = null;
            global.LifeLogUI.closeSheet();
        });
        confirmBtn.addEventListener('click', submit);

        global.LifeLogStore.onChange(function () {
            render();
            // 行为被删掉后，表单里的下拉要跟着更新
            behaviorSelect.refresh();
        });
        if (global.LifeLogI18n) {
            global.LifeLogI18n.onChange(function () {
                renderViewBar();
                render();
                behaviorSelect.refresh();
                typeSelect.refresh();
            });
        }

        var saved = null;
        try {
            saved = global.localStorage.getItem(VIEW_STORAGE_KEY);
        } catch (e) {
            /* 忽略 */
        }

        setView(VIEWS.indexOf(saved) >= 0 ? saved : DEFAULT_VIEW, { animate: false });
    }

    /** 交给 LifeLogUI 的多选目标 */
    var selection = {
        onSelectionChange: render,
        onDelete: function (ids) {
            global.LifeLogStore.removeRecords(ids);
        }
    };

    global.LifeLogTimePage = {
        init: init,
        render: render,
        openForm: openForm,
        selection: selection,
        // 行为详情页复用同一套时间格式化
        dateLine: dateLine,
        clockLine: clockLine
    };
})(window);

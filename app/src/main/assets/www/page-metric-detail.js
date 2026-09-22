/**
 * Livolog - 跟踪详情页。
 *
 * 与行为详情页同构：全屏覆盖层 + 标题栏（返回 / 跟踪项名称 / 菜单）+ 视图栏（记录 / 统计）。
 *
 * 区别在**记录视图**：跟踪记录不属于时间记录，加不进时间页，
 * 所以这一页自带一个悬浮按钮作为**唯一**入口，表单是「记录时间 + 每个字段一个值」。
 * 一个跟踪项可以有多个字段（比如血压 = 高压 / 低压 / 脉搏），
 * 卡片显示「字段名 值」的列表，统计图默认看主字段（可在选项里改）。
 * 记录卡片与时间页一样支持长按多选删除。
 */
(function (global) {
    'use strict';

    var VIEWS = ['records', 'stats'];
    var DEFAULT_VIEW = 'records';
    var ANIMATION_MS = 280;

    var root = null;
    var titleEl = null;
    var backBtn = null;
    var menuBtn = null;
    var viewNav = null;
    var listEl = null;
    var recordFab = null;

    var deleteSheet = null;
    var deleteTip = null;
    var deleteInput = null;
    var deleteConfirm = null;

    var recordSheet = null;
    var recordTitle = null;
    var recordFields = null;
    var recordHint = null;
    var recordValues = [];
    var recordConfirm = null;

    var currentId = null;
    var currentView = DEFAULT_VIEW;
    var isOpen = false;

    var DAY_MS = 24 * 60 * 60 * 1000;

    /** 统计视图的选项：图类型 + 统计区间 + 看哪个字段；每次打开详情页重置 */
    var stats = { chartType: 'bar', range: null, fieldId: null };

    var group = null;
    var editingRecordId = null;

    function t(key) {
        return global.LivologI18n ? global.LivologI18n.t(key) : key;
    }

    function init() {
        root = document.getElementById('metric-detail');
        titleEl = document.getElementById('metric-detail-title');
        backBtn = document.getElementById('metric-detail-back');
        menuBtn = document.getElementById('metric-detail-menu');
        viewNav = document.getElementById('metric-detail-view-nav');
        listEl = document.getElementById('metric-detail-list');
        recordFab = document.getElementById('metric-record-fab');

        deleteSheet = document.getElementById('sheet-delete-metric');
        deleteTip = document.getElementById('metric-delete-tip');
        deleteInput = document.getElementById('metric-delete-input');
        deleteConfirm = document.getElementById('metric-delete-confirm');

        recordSheet = document.getElementById('sheet-metric-record');
        recordTitle = document.getElementById('sheet-metric-record-title');
        recordFields = document.getElementById('metric-record-fields');
        recordHint = document.getElementById('metric-record-hint');
        recordValues = document.getElementById('metric-record-values');
        recordConfirm = document.getElementById('metric-record-confirm');

        backBtn.addEventListener('click', function () {
            close();
        });
        menuBtn.addEventListener('click', openActions);
        viewNav.addEventListener('click', onViewNavClick);
        recordFab.addEventListener('click', function () {
            openRecordForm(null);
        });

        document.getElementById('metric-delete-cancel').addEventListener('click', function () {
            global.LivologUI.closeSheet();
        });
        deleteInput.addEventListener('input', validateDelete);
        deleteInput.addEventListener('keydown', function (event) {
            if (event.key === 'Enter') {
                confirmDelete();
            }
        });
        deleteConfirm.addEventListener('click', confirmDelete);

        document.getElementById('metric-record-cancel').addEventListener('click', function () {
            editingRecordId = null;
            global.LivologUI.closeSheet();
        });
        recordConfirm.addEventListener('click', submitRecord);

        // 字段是动态生成的，用委托监听回车提交
        recordValues.addEventListener('keydown', function (event) {
            if (event.key === 'Enter') {
                submitRecord();
            }
        });
        recordValues.addEventListener('input', validateRecord);

        global.LivologMetrics.onChange(refresh);
        if (global.LivologI18n) {
            global.LivologI18n.onChange(function () {
                if (isOpen) {
                    recordTitle.textContent = t(
                        editingRecordId ? 'metric.record.editTitle' : 'metric.record.title'
                    );
                }
                refresh();
            });
        }

        // 系统返回键 / 手势返回等价于点左上角返回
        global.addEventListener('popstate', function () {
            if (isOpen) {
                close({ history: false });
            }
        });
    }

    // --- 打开 / 关闭 --------------------------------------------------------

    function open(id) {
        var metric = global.LivologMetrics.getMetric(id);
        if (!metric || isOpen) {
            return;
        }

        currentId = id;
        currentView = DEFAULT_VIEW;
        stats = { chartType: 'bar', range: null, fieldId: null };

        // 这一页自己当多选目标（长按卡片 → 顶部操作栏 → 删除）
        global.LivologUI.bindSelection(selection);

        isOpen = true;

        root.hidden = false;
        refresh();

        global.requestAnimationFrame(function () {
            root.classList.add('is-open');
        });

        global.history.pushState({ livologMetric: id }, '');
    }

    function close(options) {
        if (!isOpen) {
            return;
        }

        isOpen = false;
        currentId = null;

        // 关掉详情页后，多选目标回到当前标签页的列表
        if (global.Livolog) {
            global.Livolog.syncSelection();
        }
        global.LivologUI.closeSheet();
        root.classList.remove('is-open');
        recordFab.hidden = true;

        global.setTimeout(function () {
            if (!isOpen) {
                root.hidden = true;
            }
        }, ANIMATION_MS);

        if (!options || options.history !== false) {
            global.history.back();
        }
    }

    // --- 渲染 ---------------------------------------------------------------

    function refresh() {
        if (!isOpen || !currentId) {
            return;
        }

        var metric = global.LivologMetrics.getMetric(currentId);
        if (!metric) {
            // 被重命名成别的 id 或已删除
            close();
            return;
        }

        titleEl.textContent = metric.name;
        renderViewNav();
        recordFab.hidden = currentView !== 'records';
        renderList(metric);
    }

    /** 顶栏下方的内嵌视图导航栏（记录 / 统计） */
    function renderViewNav() {
        Array.prototype.forEach.call(viewNav.children, function (button) {
            var active = button.dataset.view === currentView;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-selected', active ? 'true' : 'false');
        });
    }

    function onViewNavClick(event) {
        var target = event.target;
        var button = target && target.closest ? target.closest('.seg-nav-item') : null;
        if (!button || button.dataset.view === currentView) {
            return;
        }

        currentView = button.dataset.view;
        refresh();
        global.LivologUI.animateEnter(listEl, currentView === 'stats' ? 1 : -1);
    }

    function renderList(metric) {
        listEl.innerHTML = '';

        if (currentView === 'stats') {
            renderStats(metric);
            return;
        }

        var records = global.LivologMetrics.getRecords(metric.id);
        if (!records.length) {
            listEl.appendChild(global.LivologUI.emptyState(t('metric.detail.empty')));
            return;
        }

        records.forEach(function (record) {
            var card = global.LivologUI.el('li', 'card');
            card.dataset.id = record.id;
            card.appendChild(global.LivologUI.icon(metric.icon, 'card-icon'));

            // 左边：字段名 + 值（只有一个字段时就是单纯的数值）
            var body = global.LivologUI.el('div', 'card-body');
            metric.fields.forEach(function (field) {
                var value = global.LivologMetrics.valueOf(record, field.id);
                var line = global.LivologUI.el('span', 'card-value-line');
                if (metric.fields.length > 1) {
                    line.appendChild(global.LivologUI.el('span', 'card-value-key', field.name));
                }
                line.appendChild(global.LivologUI.el(
                    'span',
                    'card-title',
                    value === null ? '—' : formatValue(value)
                ));
                body.appendChild(line);
            });
            card.appendChild(body);

            var time = global.LivologUI.el('span', 'card-time');
            time.appendChild(global.LivologUI.el(
                'span', 'card-time-date', global.LivologDateTime.formatDate(record.time)
            ));
            time.appendChild(global.LivologUI.el(
                'span', 'card-time-clock', global.LivologDateTime.formatClock(record.time)
            ));
            card.appendChild(time);

            if (global.LivologUI.isSelected(record.id)) {
                card.classList.add('is-selected');
            }

            global.LivologUI.attachLongPress(card, function () {
                global.LivologUI.startSelection(record.id);
            });

            card.addEventListener('click', function () {
                if (global.LivologUI.justLongPressed()) {
                    return;
                }
                if (global.LivologUI.isSelecting()) {
                    global.LivologUI.toggleSelection(record.id);
                    return;
                }
                // 普通点击 = 修改这条记录
                openRecordForm(record);
            });

            listEl.appendChild(card);
        });
    }

    /** 数值去掉多余的小数位：72.50 → 72.5，1500 → 1500 */
    function formatValue(value) {
        var number = Number(value);
        if (!isFinite(number)) {
            return '—';
        }
        return String(Math.round(number * 1000) / 1000);
    }

    // --- 统计视图 -----------------------------------------------------------
    //
    // 布局：选项栏（图类型 / 时间范围）→ 图 → 统计信息文本。
    // 纵坐标 = 每天的取值合计，横轴刻度永远是日。

    /** 统计区间的默认值：最近 30 天，但不早于第一条记录 */
    function defaultRange(records) {
        var bounds = global.LivologChart.rangeOf(records.map(function (record) {
            return record.time;
        }));
        var today = global.LivologDateTime.startOfDay(Date.now());
        var end = Math.max(bounds.end, today);
        var earliest = Math.min(bounds.start, end);
        return { start: Math.max(earliest, end - 29 * DAY_MS), end: end };
    }

    /** 改了一头之后保证 start ≤ end */
    function normalizeRange(range, key, value) {
        var next = { start: range.start, end: range.end };
        next[key] = value;
        if (next.end < next.start) {
            var swap = next.start;
            next.start = next.end;
            next.end = swap;
        }
        return next;
    }

    function renderStats(metric) {
        var all = global.LivologMetrics.getRecords(metric.id);
        if (!all.length) {
            listEl.appendChild(global.LivologUI.emptyState(t('metric.detail.statsEmpty')));
            return;
        }

        if (!stats.range) {
            stats.range = defaultRange(all);
        }

        var fields = metric.fields;
        var primary = global.LivologMetrics.primaryField(metric);
        var field = null;
        fields.forEach(function (item) {
            if (item.id === stats.fieldId && !field) {
                field = item;
            }
        });
        if (!field) {
            field = primary;
            stats.fieldId = field.id;
        }

        var range = stats.range;
        var records = all.filter(function (record) {
            var day = global.LivologDateTime.startOfDay(record.time);
            return day >= range.start && day <= range.end;
        });

        // 按时间升序算统计（只看当前字段，值为空的记录不计）
        var ordered = records.filter(function (record) {
            return global.LivologMetrics.valueOf(record, field.id) !== null;
        }).slice().sort(function (a, b) {
            return a.time - b.time;
        });

        var times = [];
        var values = [];
        var total = 0;
        var max = -Infinity;
        var min = Infinity;

        ordered.forEach(function (record) {
            var value = global.LivologMetrics.valueOf(record, field.id);
            times.push(record.time);
            values.push(value);
            total += value;
            if (value > max) max = value;
            if (value < min) min = value;
        });

        var points = global.LivologChart.bucketByDay(times, values, range);

        var wrap = global.LivologUI.el('li', 'stats');

        var toolbar = global.LivologStats.build({
            getChartType: function () {
                return stats.chartType;
            },
            getRange: function () {
                return stats.range;
            },
            // 多字段时多一行「展示哪个值」；单字段不显示
            getFields: function () {
                return fields.length > 1 ? fields : null;
            },
            getFieldId: function () {
                return stats.fieldId;
            },
            onChange: function (key, value) {
                if (key === 'chartType') {
                    stats.chartType = value;
                } else if (key === 'field') {
                    stats.fieldId = value;
                } else {
                    stats.range = normalizeRange(stats.range, key, value);
                }
                refresh();
            }
        });
        wrap.appendChild(toolbar.root);

        var chartBlock = global.LivologUI.el('div', 'stats-chart');
        chartBlock.appendChild(global.LivologUI.el(
            'span', 'stats-chart-title', t('metric.detail.chartDaily')
        ));
        chartBlock.appendChild(global.LivologChart.build(points, {
            type: stats.chartType,
            // 点某一天时气泡里显示的是那天的取值（和列表里的写法一致）
            format: formatValue
        }));
        wrap.appendChild(chartBlock);

        var latest = ordered.length
            ? global.LivologMetrics.valueOf(ordered[ordered.length - 1], field.id)
            : null;

        var list = global.LivologUI.el('dl', 'stats-list');
        [
            [t('metric.detail.count'), String(ordered.length)],
            [t('metric.detail.latest'), latest === null ? '—' : formatValue(latest)],
            [
                t('metric.detail.average'),
                ordered.length ? formatValue(total / ordered.length) : '—'
            ],
            [t('metric.detail.max'), ordered.length ? formatValue(max) : '—'],
            [t('metric.detail.min'), ordered.length ? formatValue(min) : '—']
        ].forEach(function (row) {
            list.appendChild(global.LivologUI.el('dt', 'stats-key', row[0]));
            list.appendChild(global.LivologUI.el('dd', 'stats-value', row[1]));
        });
        wrap.appendChild(list);

        listEl.appendChild(wrap);
    }

    // --- 记录表单（唯一入口） -----------------------------------------------

    /**
     * @param {object|null} record 传了就是修改已有记录
     */
    function openRecordForm(record) {
        if (!currentId) {
            return;
        }

        var metric = global.LivologMetrics.getMetric(currentId);
        if (!metric) {
            return;
        }

        editingRecordId = record && record.id ? record.id : null;
        var at = editingRecordId ? record.time : Date.now();

        recordFields.innerHTML = '';
        group = global.LivologDateTime.buildGroup(null, at, validateRecord);
        recordFields.appendChild(group.root);

        // 每个字段一个输入框；改已有记录时把旧值填回去
        recordValues.innerHTML = '';
        recordValueInputs = {};
        metric.fields.forEach(function (field) {
            var row = global.LivologUI.el('div', 'form-row');
            row.appendChild(global.LivologUI.el('label', 'form-label', field.name));
            var input = document.createElement('input');
            input.className = 'form-input';
            input.type = 'text';
            input.inputMode = 'decimal';
            input.autocomplete = 'off';
            input.dataset.fieldId = field.id;
            input.placeholder = t('metric.record.valuePlaceholder');
            var existing = editingRecordId
                ? global.LivologMetrics.valueOf(record, field.id)
                : null;
            input.value = existing === null ? '' : formatValue(existing);
            row.appendChild(input);
            recordValues.appendChild(row);
            recordValueInputs[field.id] = input;
        });

        recordTitle.textContent = t(
            editingRecordId ? 'metric.record.editTitle' : 'metric.record.title'
        );

        validateRecord();
        global.LivologUI.openSheet(recordSheet);
    }

    /** 表单里每个字段的输入框，按字段 id 索引 */
    var recordValueInputs = {};

    /** 读表单：返回 {fieldId: 值字符串}，只收有内容的 */
    function readRecordValues() {
        var out = {};
        var any = false;
        var invalid = false;
        Object.keys(recordValueInputs).forEach(function (fieldId) {
            var text = recordValueInputs[fieldId].value.trim();
            if (!text) {
                return;
            }
            var number = Number(text);
            if (!isFinite(number)) {
                invalid = true;
                return;
            }
            out[fieldId] = number;
            any = true;
        });
        return { values: out, any: any, invalid: invalid };
    }

    function validateRecord() {
        var time = group ? global.LivologDateTime.toTimestamp(
            global.LivologDateTime.readGroup(group)
        ) : null;
        var read = readRecordValues();

        var hint = '';
        if (time === null) {
            hint = t('metric.record.invalidTime');
        } else if (read.invalid) {
            hint = t('metric.record.invalidValue');
        } else if (!read.any) {
            hint = t('metric.record.invalidValue');
        }

        recordHint.textContent = hint;
        recordHint.hidden = !hint;
        recordConfirm.disabled = !!hint;

        return { ok: !hint, time: time, values: read.values };
    }

    function submitRecord() {
        var result = validateRecord();
        if (!result.ok || !currentId) {
            return;
        }

        if (editingRecordId) {
            global.LivologMetrics.updateRecord(
                editingRecordId, currentId, result.time, result.values
            );
        } else {
            global.LivologMetrics.addRecord(currentId, result.time, result.values);
        }

        editingRecordId = null;
        global.LivologUI.closeSheet();
    }

    // --- 菜单 ---------------------------------------------------------------

    function openActions() {
        menuBtn.setAttribute('aria-expanded', 'true');
        global.LivologUI.openMenu(menuBtn, [
            { value: 'rename', label: t('behavior.menu.rename') },
            { value: 'delete', label: t('behavior.menu.delete') }
        ], function (value) {
            menuBtn.setAttribute('aria-expanded', 'false');
            if (value === 'rename') {
                global.LivologMetricPage.openEdit(currentId);
            } else {
                openDeleteSheet();
            }
        });
    }

    // --- 删除（输入名称确认） -----------------------------------------------

    function openDeleteSheet() {
        var metric = global.LivologMetrics.getMetric(currentId);
        if (!metric) {
            return;
        }

        deleteTip.textContent = t('metric.delete.tip').replace('{name}', metric.name);
        deleteInput.value = '';
        validateDelete();
        global.LivologUI.openSheet(deleteSheet);
    }

    function validateDelete() {
        var metric = global.LivologMetrics.getMetric(currentId);
        deleteConfirm.disabled = !metric || deleteInput.value.trim() !== metric.name;
    }

    function confirmDelete() {
        var metric = global.LivologMetrics.getMetric(currentId);
        if (!metric || deleteInput.value.trim() !== metric.name) {
            return;
        }

        global.LivologUI.closeSheet();
        // 连带删掉该跟踪项名下的全部记录
        global.LivologMetrics.removeMetrics([metric.id]);
        global.LivologUI.toast(t('toast.deleted'));
        close();
    }

    /** 交给 LivologUI 的多选目标：选中态变了就重画列表，删掉的是跟踪记录 */
    var selection = {
        onSelectionChange: refresh,
        onDelete: function (ids) {
            global.LivologMetrics.removeRecords(ids);
        }
    };

    global.LivologMetricDetail = {
        init: init,
        open: open,
        close: close,
        refresh: refresh,
        selection: selection,
        isOpen: function () {
            return isOpen;
        }
    };
})(window);

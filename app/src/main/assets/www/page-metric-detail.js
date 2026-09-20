/**
 * LifeLog - 跟踪详情页。
 *
 * 与行为详情页同构：全屏覆盖层 + 标题栏（返回 / 跟踪项名称 / 菜单）+ 视图栏（记录 / 统计）。
 *
 * 区别在**记录视图**：跟踪记录不属于时间记录，加不进时间页，
 * 所以这一页自带一个悬浮按钮作为**唯一**入口，表单也只有「记录时间 + 记录值」。
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
    var recordValue = null;
    var recordConfirm = null;

    var currentId = null;
    var currentView = DEFAULT_VIEW;
    var isOpen = false;

    var DAY_MS = 24 * 60 * 60 * 1000;

    /** 统计视图的选项：图类型 + 统计区间；每次打开详情页重置 */
    var stats = { chartType: 'bar', range: null };

    var group = null;
    var editingRecordId = null;

    function t(key) {
        return global.LifeLogI18n ? global.LifeLogI18n.t(key) : key;
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
        recordValue = document.getElementById('metric-record-value');
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
            global.LifeLogUI.closeSheet();
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
            global.LifeLogUI.closeSheet();
        });
        recordConfirm.addEventListener('click', submitRecord);
        recordValue.addEventListener('input', validateRecord);
        recordValue.addEventListener('keydown', function (event) {
            if (event.key === 'Enter') {
                submitRecord();
            }
        });

        global.LifeLogMetrics.onChange(refresh);
        if (global.LifeLogI18n) {
            global.LifeLogI18n.onChange(function () {
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
        var metric = global.LifeLogMetrics.getMetric(id);
        if (!metric || isOpen) {
            return;
        }

        currentId = id;
        currentView = DEFAULT_VIEW;
        stats = { chartType: 'bar', range: null };
        isOpen = true;

        root.hidden = false;
        refresh();

        global.requestAnimationFrame(function () {
            root.classList.add('is-open');
        });

        global.history.pushState({ lifelogMetric: id }, '');
    }

    function close(options) {
        if (!isOpen) {
            return;
        }

        isOpen = false;
        currentId = null;

        global.LifeLogUI.closeSheet();
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

        var metric = global.LifeLogMetrics.getMetric(currentId);
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
        global.LifeLogUI.animateEnter(listEl, currentView === 'stats' ? 1 : -1);
    }

    function renderList(metric) {
        listEl.innerHTML = '';

        if (currentView === 'stats') {
            renderStats(metric);
            return;
        }

        var records = global.LifeLogMetrics.getRecords(metric.id);
        if (!records.length) {
            listEl.appendChild(global.LifeLogUI.emptyState(t('metric.detail.empty')));
            return;
        }

        records.forEach(function (record) {
            var card = global.LifeLogUI.el('li', 'card');
            card.appendChild(global.LifeLogUI.icon(metric.icon, 'card-icon'));
            card.appendChild(global.LifeLogUI.el('span', 'card-title', formatValue(record.value)));

            var time = global.LifeLogUI.el('span', 'card-time');
            time.appendChild(global.LifeLogUI.el(
                'span', 'card-time-date', global.LifeLogDateTime.formatDate(record.time)
            ));
            time.appendChild(global.LifeLogUI.el(
                'span', 'card-time-clock', global.LifeLogDateTime.formatClock(record.time)
            ));
            card.appendChild(time);

            // 点卡片即可修改这条记录
            card.addEventListener('click', function () {
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
    // 布局：选项栏（图类型 / 开始 / 结束）→ 图 → 统计信息文本。
    // 纵坐标 = 每天的取值合计，横轴刻度永远是日。

    /** 统计区间的默认值：最近 30 天，但不早于第一条记录 */
    function defaultRange(records) {
        var bounds = global.LifeLogChart.rangeOf(records.map(function (record) {
            return record.time;
        }));
        var today = global.LifeLogDateTime.startOfDay(Date.now());
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
        var all = global.LifeLogMetrics.getRecords(metric.id);
        if (!all.length) {
            listEl.appendChild(global.LifeLogUI.emptyState(t('metric.detail.statsEmpty')));
            return;
        }

        if (!stats.range) {
            stats.range = defaultRange(all);
        }

        var range = stats.range;
        var records = all.filter(function (record) {
            var day = global.LifeLogDateTime.startOfDay(record.time);
            return day >= range.start && day <= range.end;
        });

        // 按时间升序算统计
        var ordered = records.slice().sort(function (a, b) {
            return a.time - b.time;
        });

        var times = [];
        var values = [];
        var total = 0;
        var max = -Infinity;
        var min = Infinity;

        ordered.forEach(function (record) {
            times.push(record.time);
            values.push(record.value);
            total += record.value;
            if (record.value > max) max = record.value;
            if (record.value < min) min = record.value;
        });

        var points = global.LifeLogChart.bucketByDay(times, values, range);

        var wrap = global.LifeLogUI.el('li', 'stats');

        var toolbar = global.LifeLogStats.build({
            getChartType: function () {
                return stats.chartType;
            },
            getRange: function () {
                return stats.range;
            },
            onChange: function (key, value) {
                if (key === 'chartType') {
                    stats.chartType = value;
                } else {
                    stats.range = normalizeRange(stats.range, key, value);
                }
                refresh();
            }
        });
        wrap.appendChild(toolbar.root);

        var chartBlock = global.LifeLogUI.el('div', 'stats-chart');
        chartBlock.appendChild(global.LifeLogUI.el(
            'span', 'stats-chart-title', t('metric.detail.chartDaily')
        ));
        chartBlock.appendChild(global.LifeLogChart.build(points, { type: stats.chartType }));
        wrap.appendChild(chartBlock);

        var latest = ordered.length ? ordered[ordered.length - 1].value : null;

        var list = global.LifeLogUI.el('dl', 'stats-list');
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
            list.appendChild(global.LifeLogUI.el('dt', 'stats-key', row[0]));
            list.appendChild(global.LifeLogUI.el('dd', 'stats-value', row[1]));
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

        editingRecordId = record && record.id ? record.id : null;
        var at = editingRecordId ? record.time : Date.now();

        recordFields.innerHTML = '';
        group = global.LifeLogDateTime.buildGroup(null, at, validateRecord);
        recordFields.appendChild(group.root);

        recordValue.value = editingRecordId ? formatValue(record.value) : '';
        recordTitle.textContent = t(
            editingRecordId ? 'metric.record.editTitle' : 'metric.record.title'
        );

        validateRecord();
        global.LifeLogUI.openSheet(recordSheet);
    }

    function readRecordValue() {
        var text = recordValue.value.trim();
        if (!text) {
            return null;
        }
        var number = Number(text);
        return isFinite(number) ? number : null;
    }

    function validateRecord() {
        var time = group ? global.LifeLogDateTime.toTimestamp(
            global.LifeLogDateTime.readGroup(group)
        ) : null;
        var value = readRecordValue();

        var hint = '';
        if (time === null) {
            hint = t('metric.record.invalidTime');
        } else if (value === null) {
            hint = t('metric.record.invalidValue');
        }

        recordHint.textContent = hint;
        recordHint.hidden = !hint;
        recordConfirm.disabled = !!hint;

        return { ok: !hint, time: time, value: value };
    }

    function submitRecord() {
        var result = validateRecord();
        if (!result.ok || !currentId) {
            return;
        }

        if (editingRecordId) {
            global.LifeLogMetrics.updateRecord(
                editingRecordId, currentId, result.time, result.value
            );
        } else {
            global.LifeLogMetrics.addRecord(currentId, result.time, result.value);
        }

        editingRecordId = null;
        global.LifeLogUI.closeSheet();
    }

    // --- 菜单 ---------------------------------------------------------------

    function openActions() {
        menuBtn.setAttribute('aria-expanded', 'true');
        global.LifeLogUI.openMenu(menuBtn, [
            { value: 'rename', label: t('behavior.menu.rename') },
            { value: 'delete', label: t('behavior.menu.delete') }
        ], function (value) {
            menuBtn.setAttribute('aria-expanded', 'false');
            if (value === 'rename') {
                global.LifeLogMetricPage.openEdit(currentId);
            } else {
                openDeleteSheet();
            }
        });
    }

    // --- 删除（输入名称确认） -----------------------------------------------

    function openDeleteSheet() {
        var metric = global.LifeLogMetrics.getMetric(currentId);
        if (!metric) {
            return;
        }

        deleteTip.textContent = t('metric.delete.tip').replace('{name}', metric.name);
        deleteInput.value = '';
        validateDelete();
        global.LifeLogUI.openSheet(deleteSheet);
    }

    function validateDelete() {
        var metric = global.LifeLogMetrics.getMetric(currentId);
        deleteConfirm.disabled = !metric || deleteInput.value.trim() !== metric.name;
    }

    function confirmDelete() {
        var metric = global.LifeLogMetrics.getMetric(currentId);
        if (!metric || deleteInput.value.trim() !== metric.name) {
            return;
        }

        global.LifeLogUI.closeSheet();
        // 连带删掉该跟踪项名下的全部记录
        global.LifeLogMetrics.removeMetrics([metric.id]);
        global.LifeLogUI.toast(t('toast.deleted'));
        close();
    }

    global.LifeLogMetricDetail = {
        init: init,
        open: open,
        close: close,
        refresh: refresh,
        isOpen: function () {
            return isOpen;
        }
    };
})(window);

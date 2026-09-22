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
    var viewBar = null;
    var viewLabel = null;
    var viewButton = null;

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

    /*
       记录视图的时间范围：与时间页同一套（全部 / 最近一年 / 最近一月 / 最近一周），
       但**不复用**时间页的 localStorage 偏好 —— 详情页的范围是临时的，
       每次打开都回到「全部」。
    */
    var RANGES = ['all', 'year', 'month', 'week'];
    var RANGE_DAYS = { all: 0, year: 365, month: 30, week: 7 };
    var range = 'all';

    var DAY_MS = 24 * 60 * 60 * 1000;

    /** 统计视图的选项：时间区间 + 看哪几个项目；每次打开详情页重置（图类型固定折线图） */
    var stats = { range: null, series: [] };

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
        viewBar = document.getElementById('metric-detail-view-bar');
        viewLabel = document.getElementById('metric-detail-view-current');
        viewButton = document.getElementById('metric-detail-view-button');

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
        viewButton.addEventListener('click', openRangeMenu);
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
        range = 'all';
        stats = { range: null, series: [] };

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

        // 视图栏只在记录视图显示（统计视图自己有选项栏）
        viewBar.hidden = currentView !== 'records';

        if (currentView === 'stats') {
            renderStats(metric);
            return;
        }

        var records = global.LivologMetrics.getRecords(metric.id).filter(function (record) {
            var days = RANGE_DAYS[range] || 0;
            if (!days) {
                return true;
            }
            var start = global.LivologDateTime.startOfDay(Date.now()) - (days - 1) * DAY_MS;
            return record.time >= start;
        });

        renderViewBar();

        if (!records.length) {
            listEl.appendChild(global.LivologUI.emptyState(t('metric.detail.empty')));
            return;
        }

        // 与时间页同一个分段逻辑：按天插日期标记
        global.LivologTimePage.appendRecordCards(
            listEl,
            records,
            function (record) {
                return buildRecordCard(metric, record);
            },
            function (record) {
                return record.time;
            }
        );
    }

    /** 范围栏的文字 */
    function renderViewBar() {
        viewLabel.textContent = t('time.range.' + range);
        viewButton.setAttribute('aria-expanded', 'false');
    }

    function openRangeMenu() {
        viewButton.setAttribute('aria-expanded', 'true');
        global.LivologUI.openMenu(
            viewButton,
            RANGES.map(function (value) {
                return {
                    value: value,
                    label: t('time.range.' + value),
                    selected: value === range
                };
            }),
            function (value) {
                renderViewBar();
                if (value !== range) {
                    var from = RANGES.indexOf(range);
                    var to = RANGES.indexOf(value);
                    range = value;
                    renderList(global.LivologMetrics.getMetric(currentId));
                    global.LivologUI.animateEnter(listEl, to >= from ? 1 : -1);
                }
            }
        );
    }

    /** 一条记录的卡片 */
    function buildRecordCard(metric, record) {
        var card = global.LivologUI.el('li', 'card');
        card.dataset.id = record.id;
        card.appendChild(global.LivologUI.icon(metric.icon, 'card-icon'));

        // 左边：项目名 + 值（只有一个项目时就是单纯的数值）
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

        return card;
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

    /*
       线型表：多项目时靠它区分哪条线是哪个项目。
       顺序要与 metric.fields 一致；不够用时循环取（项目一般 2~4 个）。
    */
    var SERIES_DASHES = [null, '5 3', '1 3', '7 3 2 3', '2 2', '9 3 2 3 2 3'];

    /** 第 i 条线的 dasharray（null = 实线） */
    function dashOf(index) {
        return SERIES_DASHES[index % SERIES_DASHES.length];
    }

    /**
     * 图内图例：每条线一个「线型样例 + 项目名」，画在图表块里、图的下面。
     * 线型样例要和真正的线一致（同一个 dash），否则图例没意义。
     */
    function buildLegend(metric, chosen) {
        var legend = global.LivologUI.el('div', 'chart-legend');
        chosen.forEach(function (field) {
            var index = metric.fields.indexOf(field);
            var dash = dashOf(index < 0 ? 0 : index);

            var entry = global.LivologUI.el('span', 'chart-legend-entry');
            var swatch = document.createElementNS(
                'http://www.w3.org/2000/svg', 'svg'
            );
            swatch.setAttribute('class', 'chart-legend-swatch');
            swatch.setAttribute('viewBox', '0 0 24 8');
            swatch.setAttribute('aria-hidden', 'true');
            var line = document.createElementNS(
                'http://www.w3.org/2000/svg', 'line'
            );
            line.setAttribute('x1', '0');
            line.setAttribute('y1', '4');
            line.setAttribute('x2', '24');
            line.setAttribute('y2', '4');
            if (dash) {
                line.setAttribute('stroke-dasharray', dash);
            }
            swatch.appendChild(line);
            entry.appendChild(swatch);
            entry.appendChild(global.LivologUI.el('span', 'chart-legend-name', field.name));
            legend.appendChild(entry);
        });
        return legend;
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
        var range = stats.range;
        var records = all.filter(function (record) {
            var day = global.LivologDateTime.startOfDay(record.time);
            return day >= range.start && day <= range.end;
        });

        /*
           只画「选中的项目」；一个都没选（stats.series 为空数组）= 全部。
           图例直接画在图里（图内左上角），不单独占一行。
        */
        var chosen = fields.filter(function (field) {
            return !stats.series.length || stats.series.indexOf(field.id) >= 0;
        });
        if (!chosen.length) {
            chosen = fields.slice();
        }

        /*
           每个项目一条折线：把该项目「有记录」的日子按时间归到每天，再交给
           LivologChart.buildMulti 一次画出来，用线型区分项目。
           某个项目某天没值 → 那天的点标记为 has:false，折线跨过去（不断线）。
        */
        var dayList = [];
        var daySeen = {};
        records.forEach(function (record) {
            var day = global.LivologDateTime.startOfDay(record.time);
            if (!daySeen[day]) {
                daySeen[day] = true;
                dayList.push(day);
            }
        });
        dayList.sort(function (a, b) {
            return a - b;
        });

        var series = chosen.map(function (field) {
            // 每天取该项目当天的最后一个值（同一天记多次就取最后的）
            var byDay = {};
            records.forEach(function (record) {
                var value = global.LivologMetrics.valueOf(record, field.id);
                if (value === null) {
                    return;
                }
                var day = global.LivologDateTime.startOfDay(record.time);
                byDay[day] = value;
            });
            // 线型按「在跟踪项字段里的位置」定，这样取消/勾选项目时同一个项目的线型不变
            var index = metric.fields.indexOf(field);
            return {
                name: field.name,
                dash: dashOf(index < 0 ? 0 : index),
                points: dayList.map(function (day) {
                    var has = Object.prototype.hasOwnProperty.call(byDay, day);
                    return { day: day, value: has ? byDay[day] : 0, has: has };
                })
            };
        });

        // 横轴要有「天」可画；一条记录都没落在区间里时给一天空白
        var days = dayList.length ? dayList.map(function (day) {
            return { day: day };
        }) : [{ day: range.start }];

        var wrap = global.LivologUI.el('li', 'stats');

        var toolbar = global.LivologStats.build({
            getChartType: function () {
                return 'line';
            },
            getRange: function () {
                return stats.range;
            },
            // 统一用折线图，所以不再给「图类型」这一行
            lockChartType: true,
            // 第一行：选看哪几个项目（多项目才显示）
            getSeries: function () {
                return fields.length > 1 ? fields : null;
            },
            getSelectedSeries: function () {
                return stats.series;
            },
            onChange: function (key, value) {
                if (key === 'series') {
                    stats.series = value;
                } else if (key !== 'field' && key !== 'chartType') {
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
        chartBlock.appendChild(global.LivologChart.buildMulti(days, series, {
            // 气泡里每行一个项目：写「项目名 值」，多项目时才带名字
            format: function (value, name) {
                return chosen.length > 1 && name
                    ? name + ' ' + formatValue(value)
                    : formatValue(value);
            }
        }));
        // 图例画在图里面（图下方），不再单独占工具栏一行
        if (chosen.length > 1) {
            chartBlock.appendChild(buildLegend(metric, chosen));
        }
        wrap.appendChild(chartBlock);

        // 统计信息只针对「主项目」（多项目量纲不同，混在一起算没有意义）
        var primary = global.LivologMetrics.primaryField(metric);
        var ordered = records.filter(function (record) {
            return global.LivologMetrics.valueOf(record, primary.id) !== null;
        }).slice().sort(function (a, b) {
            return a.time - b.time;
        });

        var total = 0;
        var max = -Infinity;
        var min = Infinity;
        ordered.forEach(function (record) {
            var value = global.LivologMetrics.valueOf(record, primary.id);
            total += value;
            if (value > max) max = value;
            if (value < min) min = value;
        });

        var latest = ordered.length
            ? global.LivologMetrics.valueOf(ordered[ordered.length - 1], primary.id)
            : null;

        var list = global.LivologUI.el('dl', 'stats-list');
        [
            // 统计口径写在最前面，免得误以为是把所有项目混在一起算的
            [t('metric.detail.formula'), primary.name],
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
        // 时间只有「什么时候记的」一种含义，给个提示文字与下面的字段标签对齐
        group = global.LivologDateTime.buildGroup(t('time.form.happen'), at, validateRecord);
        recordFields.appendChild(group.root);

        // 每个字段一块「标签 + 输入框」，上下排：
        // 一行一个字段名 + 右对齐的输入框会让几行标签左沿参差不齐（名字长短不一），
        // 上下排则所有输入框都与上面的时间 / 名称对齐。
        recordValues.innerHTML = '';
        recordValueInputs = {};
        metric.fields.forEach(function (field) {
            var block = global.LivologUI.el('div', 'form-row form-row-stacked');
            block.appendChild(global.LivologUI.el('label', 'form-label', field.name));
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
            block.appendChild(input);
            recordValues.appendChild(block);
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
            { value: 'delete', label: t('behavior.menu.delete'), danger: true }
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

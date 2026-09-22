/**
 * Livolog - 时间页。
 *
 * 三个视图（全部 / 时段 / 时点）由顶部视图栏切换；
 * 右下角悬浮按钮打开表单弹窗新增记录，时间按 YYYY-MM-DD-HH:mm 分段填写。
 */
(function (global) {
    'use strict';

    var VIEWS = ['all', 'year', 'month', 'week'];
    var DEFAULT_VIEW = 'all';
    var VIEW_STORAGE_KEY = 'livolog.timeView';
    /** 视图 = 看最近多少天；all 表示不限制 */
    var VIEW_DAYS = { all: 0, year: 365, month: 30, week: 7 };
    /**
     * 每个范围要显示到哪一级分组。
     * 范围内已经固定了的层级不再重复显示（否则只会出现孤零零的一个分区）：
     *   全部 → 年/月/周；最近一年 → 月/周；最近一月 → 周；最近一周 → 不分分区，直接列记录
     */
    var VIEW_LEVELS = { all: 3, year: 2, month: 1, week: 0 };
    var LEVEL_KINDS = ['week', 'month', 'year'];
    var DAY_MS = 24 * 60 * 60 * 1000;

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
    var noteInput = null;
    var cancelBtn = null;
    var confirmBtn = null;

    var currentView = DEFAULT_VIEW;
    var groups = {};
    var behaviorValue = '';
    var typeValue = '';
    /** 非空表示当前表单在编辑这条已有记录，提交时走 update 而不是 add */
    var editingId = null;

    function t(key) {
        return global.LivologI18n ? global.LivologI18n.t(key) : key;
    }

    // --- 时间格式化 ---------------------------------------------------------
    // 与跟踪页共用 LivologDateTime（见 datetime.js），这里只保留
    //「一条记录怎么显示成两行」的规则。

    /** 上排：只显示「开始」那天的日期。跨天的时段也不展开，数据本身不受影响。 */
    function dateLine(record) {
        return global.LivologDateTime.formatDate(record.start);
    }

    /** 下排：时分（时段显示起止） */
    function clockLine(record) {
        if (record.type !== 'period' || record.end === null) {
            return global.LivologDateTime.formatClock(record.start);
        }
        return global.LivologDateTime.formatClock(record.start) + ' ~ ' +
            global.LivologDateTime.formatClock(record.end);
    }

    /** 分段日期时间输入统一走 LivologDateTime，这里只做一层转发方便本文件调用 */
    function buildGroup(labelText, initial, onChange) {
        return global.LivologDateTime.buildGroup(labelText, initial, onChange);
    }

    function readGroup(group) {
        return global.LivologDateTime.readGroup(group);
    }

    function toTimestamp(values) {
        return global.LivologDateTime.toTimestamp(values);
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
            global.LivologUI.animateEnter(listEl, to >= from ? 1 : -1);
        }
    }

    function renderViewBar() {
        viewLabel.textContent = t('time.range.' + currentView);
        viewButton.setAttribute('aria-expanded', 'false');
    }

    function openViewMenu() {
        var items = VIEWS.map(function (view) {
            return {
                value: view,
                label: t('time.range.' + view),
                selected: view === currentView
            };
        });

        global.LivologUI.openMenu(viewButton, items, function (value) {
            setView(value);
        });
    }

    // --- 列表 ---------------------------------------------------------------
    //
    // 记录按「年 → 月 → 周」三级分组，每一级都能展开 / 折叠。
    // 周按「月内第几周」算（1–7 号为第 1 周…），这样周总是完整地落在某个月里，
    // 不会出现一个周横跨两个月、挂在哪边都不对的情况。

    /** 已折叠的分组 key；只在本次会话里记着 */
    var collapsed = {};

    /**
     * 先建成完整的年/月/周三棵树，再根据当前范围决定从哪一级开始显示。
     * @returns {Array|null} null 表示不分分区（直接列记录）
     */
    function buildTree(records, levels) {
        var years = [];
        var yearIndex = {};
        var pad = global.LivologDateTime.pad;

        records.forEach(function (record) {
            var date = new Date(record.start);
            var year = date.getFullYear();
            var month = date.getMonth() + 1;
            var week = Math.floor((date.getDate() - 1) / 7) + 1;

            var yearKey = 'y' + year;
            if (!yearIndex[yearKey]) {
                yearIndex[yearKey] = {
                    key: yearKey,
                    label: t('time.group.year').replace('{y}', String(year)),
                    count: 0,
                    months: [],
                    monthIndex: {}
                };
                years.push(yearIndex[yearKey]);
            }
            var yearNode = yearIndex[yearKey];
            yearNode.count += 1;

            var monthKey = yearKey + 'm' + month;
            if (!yearNode.monthIndex[monthKey]) {
                yearNode.monthIndex[monthKey] = {
                    key: monthKey,
                    label: t('time.group.month')
                        .replace('{y}', String(year))
                        .replace('{m}', pad(month, 2)),
                    count: 0,
                    weeks: [],
                    weekIndex: {}
                };
                yearNode.months.push(yearNode.monthIndex[monthKey]);
            }
            var monthNode = yearNode.monthIndex[monthKey];
            monthNode.count += 1;

            var weekKey = monthKey + 'w' + week;
            if (!monthNode.weekIndex[weekKey]) {
                monthNode.weekIndex[weekKey] = {
                    key: weekKey,
                    label: t('time.group.week')
                        .replace('{y}', String(year))
                        .replace('{m}', pad(month, 2))
                        .replace('{n}', String(week)),
                    count: 0,
                    records: []
                };
                monthNode.weeks.push(monthNode.weekIndex[weekKey]);
            }
            var weekNode = monthNode.weekIndex[weekKey];
            weekNode.count += 1;
            weekNode.records.push(record);
        });

        if (levels >= 3) {
            return years;
        }

        var months = [];
        years.forEach(function (yearNode) {
            months = months.concat(yearNode.months);
        });
        if (levels === 2) {
            return months;
        }

        var weeks = [];
        months.forEach(function (monthNode) {
            weeks = weeks.concat(monthNode.weeks);
        });
        if (levels === 1) {
            return weeks;
        }

        return null;
    }

    function section(node, kind, depth, buildBody) {
        var li = global.LivologUI.el('li', 'group group-' + kind);
        var opened = !collapsed[node.key];

        var head = global.LivologUI.el('button', 'group-head');
        head.type = 'button';
        head.style.paddingLeft = (20 + depth * 12) + 'px';
        head.setAttribute('aria-expanded', opened ? 'true' : 'false');
        head.appendChild(global.LivologUI.el('span', 'group-chevron'))
            .innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
            '<path d="M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z"/></svg>';
        head.appendChild(global.LivologUI.el('span', 'group-title', node.label));
        // 右侧标明这是哪一级（年 / 月 / 周），层级一眼能看出来
        head.appendChild(global.LivologUI.el('span', 'group-level', t('time.level.' + kind)));
        li.appendChild(head);

        var body = global.LivologUI.el('ul', 'group-body');
        body.hidden = !opened;
        if (!opened) {
            li.classList.add('is-collapsed');
        }
        buildBody(body);
        li.appendChild(body);

        // 就地折叠，不重绘整个列表，避免滚动位置跳动
        head.addEventListener('click', function () {
            var willClose = !body.hidden;
            body.hidden = willClose;
            li.classList.toggle('is-collapsed', willClose);
            head.setAttribute('aria-expanded', willClose ? 'false' : 'true');
            if (willClose) {
                collapsed[node.key] = true;
            } else {
                delete collapsed[node.key];
            }
        });

        return li;
    }

    /** 时间页的记录列表：按 .start 分天（复用共用的 appendRecordCards） */
    function appendRecords(container, records) {
        appendRecordCards(container, records, recordCard, function (record) {
            return record.start;
        });
    }

    /** 日期标记：YYYY-MM-DD, 周几（如 2026-09-19, Sat） */
    function dayMark(day) {
        var text = global.LivologDateTime.formatDate(day) + ', ' +
            t('weekday.' + new Date(day).getDay());
        return global.LivologUI.el('li', 'day-mark', text);
    }

    /**
     * 按天排列卡片：换一天就在前面插一条日期标记。
     * 时间页与行为 / 跟踪详情页共用（三处的记录视图长得一样）。
     *
     * @param {HTMLElement} container
     * @param {Array<{time: number}>} entries 已按时间**降序**排好的条目
     * @param {(entry: object) => HTMLElement} buildCard 造一张卡片
     * @param {(entry: object) => number} [timeOf] 取时间戳，默认取 entry.time
     */
    function appendRecordCards(container, entries, buildCard, timeOf) {
        var at = timeOf || function (entry) {
            return entry.time;
        };
        var lastDay = null;

        entries.forEach(function (entry) {
            var day = global.LivologDateTime.startOfDay(at(entry));
            if (day !== lastDay) {
                lastDay = day;
                container.appendChild(dayMark(day));
            }
            container.appendChild(buildCard(entry));
        });
    }

    /**
     * 卡片左边那两块：主文字 + 选填的描述。
     * 描述为空时连元素都不建，所以没有描述的记录卡片和以前一样高。
     */
    function cardBody(title, note) {
        var body = global.LivologUI.el('div', 'card-body');
        body.appendChild(global.LivologUI.el('span', 'card-title', title));
        if (note) {
            body.appendChild(global.LivologUI.el('span', 'card-note', note));
        }
        return body;
    }

    /** 单条记录卡片（与行为详情页里的列表长一样） */
    function recordCard(record) {
        var behavior = global.LivologStore.getBehavior(record.behaviorId);

        var card = global.LivologUI.el('li', 'card');
        card.dataset.id = record.id;
        card.appendChild(global.LivologUI.icon(
            behavior ? behavior.icon : global.LivologIcons.fallback,
            'card-icon'
        ));
        card.appendChild(cardBody(
            behavior ? behavior.name : '—',
            record.note
        ));

        var time = global.LivologUI.el('span', 'card-time');
        time.appendChild(global.LivologUI.el('span', 'card-time-date', dateLine(record)));
        time.appendChild(global.LivologUI.el('span', 'card-time-clock', clockLine(record)));
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
            openForm(record);
        });

        return card;
    }

    /** 当前视图的起始时间；all 返回 null 表示不限制 */
    function rangeStart() {
        var days = VIEW_DAYS[currentView] || 0;
        if (!days) {
            return null;
        }
        var today = global.LivologDateTime.startOfDay(Date.now());
        return today - (days - 1) * DAY_MS;
    }

    function render() {
        if (!listEl) {
            return;
        }

        var start = rangeStart();
        var records = global.LivologStore.getRecords().filter(function (record) {
            return start === null || record.start >= start;
        });

        listEl.innerHTML = '';

        if (!records.length) {
            listEl.appendChild(global.LivologUI.emptyState(t('time.empty')));
            return;
        }

        var levels = VIEW_LEVELS[currentView] === undefined ? 3 : VIEW_LEVELS[currentView];
        var nodes = buildTree(records, levels);

        // 范围内已经固定了的层级不重复显示：最近一周就直接列记录
        if (!nodes) {
            appendRecords(listEl, records);
            return;
        }

        var kind = LEVEL_KINDS[levels - 1];
        nodes.forEach(function (node) {
            listEl.appendChild(renderNode(node, kind, 0));
        });
    }

    /** 递归渲染一个分区（年 → 月 → 周，具体到哪一级由当前范围决定） */
    function renderNode(node, kind, depth) {
        var childKind = kind === 'year' ? 'month' : (kind === 'month' ? 'week' : null);
        var children = kind === 'year' ? node.months : node.weeks;

        return section(node, kind, depth, function (body) {
            if (!childKind) {
                appendRecords(body, node.records);
                return;
            }

            (children || []).forEach(function (child) {
                body.appendChild(renderNode(child, childKind, depth + 1));
            });
        });
    }

    // --- 表单 ---------------------------------------------------------------

    /** 行为 / 类型两个下拉（自绘，统一 app 风格） */
    function createSelects() {
        behaviorSelect = global.LivologUI.createSelect(document.getElementById('time-behavior'), {
            getOptions: function () {
                return global.LivologStore.getBehaviors().map(function (behavior) {
                    return { value: behavior.id, label: behavior.name };
                });
            },
            getValue: function () {
                return behaviorValue;
            },
            onChange: function (value) {
                behaviorValue = value;
                // 换行为时把它习惯的记录类型带过来（用户仍可手改）
                applyPreferredType();
                validate();
            },
            isDisabled: function () {
                return global.LivologStore.getBehaviors().length === 0;
            },
            placeholder: function () {
                return t('time.form.needBehavior');
            }
        });

        typeSelect = global.LivologUI.createSelect(document.getElementById('time-type'), {
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

    /**
     * 这个行为「偏向」的记录类型：记过的次数多的那种；一样多就用最近一次。
     * 从没记过就不猜，返回空串。
     */
    function preferredType(behaviorId) {
        if (!behaviorId) {
            return '';
        }

        // getRecords() 已经是按时间倒序，所以第一条就是这个行为最近一次的类型
        var count = {};
        var latest = '';
        global.LivologStore.getRecords().forEach(function (record) {
            if (record.behaviorId !== behaviorId || !record.type) {
                return;
            }
            if (!latest) {
                latest = record.type;
            }
            count[record.type] = (count[record.type] || 0) + 1;
        });

        var best = latest;
        Object.keys(count).forEach(function (type) {
            if (count[type] > count[best]) {
                best = type;
            }
        });
        return best;
    }

    /**
     * 按当前行为的习惯预选记录类型（只在「新增」时用）。
     * 自动填完照样能手动改，所以这里不做任何锁定。
     */
    function applyPreferredType() {
        if (editingId) {
            return;
        }

        var preferred = preferredType(behaviorValue);
        if (!preferred || preferred === typeValue) {
            return;
        }

        typeValue = preferred;
        buildTimeFields(currentSeed());
        typeSelect.refresh();
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
            groups.moment = buildGroup(null, startAt, validate);
            fieldsEl.appendChild(groups.moment.root);
        } else if (typeValue === 'period') {
            groups.start = buildGroup(t('time.form.start'), startAt, validate);
            groups.end = buildGroup(t('time.form.end'), endAt, validate);
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
        var behaviors = global.LivologStore.getBehaviors();

        editingId = record && record.id ? record.id : null;

        if (editingId) {
            behaviorValue = record.behaviorId;
            typeValue = record.type;
        } else {
            behaviorValue = behaviors.length ? behaviors[0].id : '';
            // 新增：先按「第一个行为偏向的类型」预选，用户随时可改
            typeValue = preferredType(behaviorValue);
        }

        sheetTitle.textContent = t(editingId ? 'time.form.editTitle' : 'time.form.title');
        noteInput.value = editingId ? (record.note || '') : '';
        behaviorSelect.refresh();
        typeSelect.refresh();
        buildTimeFields(editingId ? { start: record.start, end: record.end } : null);

        global.LivologUI.openSheet(sheet);
    }

    function validate() {
        var hasBehaviors = global.LivologStore.getBehaviors().length > 0;
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
            global.LivologStore.updateRecord(
                editingId,
                behaviorValue,
                result.type,
                result.start,
                result.end,
                noteInput.value
            );
        } else {
            global.LivologStore.addRecord(
                behaviorValue,
                result.type,
                result.start,
                result.end,
                noteInput.value
            );
        }

        editingId = null;
        global.LivologUI.closeSheet();

        // 只有新记录落在当前范围之外（比如在「最近一周」里补一条上个月的）才切回「全部」，
        // 保证有反馈；在范围内的记录不要动视图。
        // ⚠️ 这里以前拿 result.type 去比对，而视图早就改成范围了（all/year/month/week），
        //    比对必然不相等 → setView('moment') → 落到默认值，于是「最近一周」被重置成「全部」。
        var start = rangeStart();
        if (start !== null && result.start < start) {
            setView('all');
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
        noteInput = document.getElementById('time-note');
        cancelBtn = document.getElementById('time-cancel');
        confirmBtn = document.getElementById('time-confirm');

        createSelects();

        viewButton.addEventListener('click', openViewMenu);
        fab.addEventListener('click', function () {
            openForm(null);
        });
        cancelBtn.addEventListener('click', function () {
            editingId = null;
            global.LivologUI.closeSheet();
        });
        confirmBtn.addEventListener('click', submit);

        global.LivologStore.onChange(function () {
            render();
            // 行为被删掉后，表单里的下拉要跟着更新
            behaviorSelect.refresh();
        });
        if (global.LivologI18n) {
            global.LivologI18n.onChange(function () {
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

    /** 交给 LivologUI 的多选目标 */
    var selection = {
        onSelectionChange: render,
        onDelete: function (ids) {
            global.LivologStore.removeRecords(ids);
        }
    };

    global.LivologTimePage = {
        init: init,
        render: render,
        openForm: openForm,
        selection: selection,
        // 行为详情页复用同一套时间格式化 / 卡片结构
        dateLine: dateLine,
        clockLine: clockLine,
        cardBody: cardBody,
        // 详情页的记录视图也按天分隔（与时间页同一个实现）
        dayMark: dayMark,
        appendRecordCards: appendRecordCards
    };
})(window);

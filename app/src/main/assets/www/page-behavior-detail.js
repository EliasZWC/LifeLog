/**
 * LifeLog - 行为详情页。
 *
 * 全屏覆盖在 app 之上，自带标题栏（返回 / 行为名称 / 菜单）与视图栏（记录 / 统计）。
 * 打开时往 history 里 push 一条记录，这样系统返回键、手势返回都能直接回来。
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

    var deleteSheet = null;
    var deleteTip = null;
    var deleteInput = null;
    var deleteConfirm = null;

    var currentId = null;
    var currentView = DEFAULT_VIEW;
    var isOpen = false;

    var DAY_MS = 24 * 60 * 60 * 1000;

    /** 统计视图的选项：图类型 + 统计区间；每次打开详情页重置 */
    var stats = { chartType: 'bar', range: null };

    function t(key) {
        return global.LifeLogI18n ? global.LifeLogI18n.t(key) : key;
    }

    function init() {
        root = document.getElementById('behavior-detail');
        titleEl = document.getElementById('detail-title');
        backBtn = document.getElementById('detail-back');
        menuBtn = document.getElementById('detail-menu');
        viewNav = document.getElementById('detail-view-nav');
        listEl = document.getElementById('detail-list');

        deleteSheet = document.getElementById('sheet-delete-behavior');
        deleteTip = document.getElementById('delete-tip');
        deleteInput = document.getElementById('delete-confirm-input');
        deleteConfirm = document.getElementById('delete-confirm');

        backBtn.addEventListener('click', function () {
            close();
        });
        menuBtn.addEventListener('click', openActions);
        viewNav.addEventListener('click', onViewNavClick);

        document.getElementById('delete-cancel').addEventListener('click', function () {
            global.LifeLogUI.closeSheet();
        });
        deleteInput.addEventListener('input', validateDelete);
        deleteInput.addEventListener('keydown', function (event) {
            if (event.key === 'Enter') {
                confirmDelete();
            }
        });
        deleteConfirm.addEventListener('click', confirmDelete);

        global.LifeLogStore.onChange(refresh);
        if (global.LifeLogI18n) {
            global.LifeLogI18n.onChange(refresh);
        }

        // 系统返回键 / 手势返回会触发 popstate，等价于点左上角返回
        global.addEventListener('popstate', function () {
            if (isOpen) {
                close({ history: false });
            }
        });
    }

    // --- 打开 / 关闭 --------------------------------------------------------

    function open(id) {
        var behavior = global.LifeLogStore.getBehavior(id);
        if (!behavior || isOpen) {
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

        global.history.pushState({ lifelogBehavior: id }, '');
    }

    function close(options) {
        if (!isOpen) {
            return;
        }

        isOpen = false;
        currentId = null;

        global.LifeLogUI.closeSheet();
        root.classList.remove('is-open');

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

        var behavior = global.LifeLogStore.getBehavior(currentId);
        if (!behavior) {
            // 行为被删掉了
            close();
            return;
        }

        titleEl.textContent = behavior.name;
        renderViewNav();
        renderList(behavior);
    }

    /** 顶栏下方的内嵌视图导航栏（记录 / 统计），点哪一项就切到哪一项 */
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

    function renderList(behavior) {
        listEl.innerHTML = '';

        if (currentView === 'stats') {
            renderStats(behavior);
            return;
        }

        var records = global.LifeLogStore.getRecords().filter(function (record) {
            return record.behaviorId === behavior.id;
        });

        if (!records.length) {
            listEl.appendChild(global.LifeLogUI.emptyState(t('behavior.detail.empty')));
            return;
        }

        records.forEach(function (record) {
            var card = global.LifeLogUI.el('li', 'card');
            card.appendChild(global.LifeLogUI.icon(behavior.icon, 'card-icon'));
            card.appendChild(global.LifeLogUI.el('span', 'card-title', behavior.name));

            var time = global.LifeLogUI.el('span', 'card-time');
            time.appendChild(global.LifeLogUI.el(
                'span', 'card-time-date', global.LifeLogTimePage.dateLine(record)
            ));
            time.appendChild(global.LifeLogUI.el(
                'span', 'card-time-clock', global.LifeLogTimePage.clockLine(record)
            ));
            card.appendChild(time);

            // 与时间页一致：点卡片即可修改这条记录
            card.addEventListener('click', function () {
                global.LifeLogTimePage.openForm(record);
            });

            listEl.appendChild(card);
        });
    }

    // --- 统计视图 -----------------------------------------------------------
    //
    // 布局：选项栏（图类型 / 开始 / 结束）→ 图 → 统计信息文本。
    // 图与「按天归集」都走 LifeLogChart（内联 SVG 手绘，横轴刻度永远是日）。
    // 只有「时刻」记录的行为没有时长可言，此时退化为按天记次数。

    /** 时长格式化：不足 1 小时只显示分钟，正好整点不显示 0 分钟 */
    function formatDuration(ms) {
        var minutes = Math.max(0, Math.round((ms || 0) / 60000));
        var hours = Math.floor(minutes / 60);
        var rest = minutes % 60;

        if (hours <= 0) {
            return rest + t('unit.minute');
        }
        if (rest === 0) {
            return hours + t('unit.hour');
        }
        return hours + t('unit.hour') + ' ' + rest + t('unit.minute');
    }

    /** 统计区间的默认值：最近 30 天，但不早于第一条记录 */
    function defaultRange(records) {
        var bounds = global.LifeLogChart.rangeOf(records.map(function (record) {
            return record.start;
        }));
        var today = global.LifeLogDateTime.startOfDay(Date.now());
        var end = Math.max(bounds.end, today);
        var earliest = Math.min(bounds.start, end);
        return { start: Math.max(earliest, end - 29 * DAY_MS), end: end };
    }

    /** 改了一头之后保证 start ≤ end（顺序不对就直接对调） */
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

    function renderStats(behavior) {
        var all = global.LifeLogStore.getRecords().filter(function (record) {
            return record.behaviorId === behavior.id;
        });

        if (!all.length) {
            listEl.appendChild(global.LifeLogUI.emptyState(t('behavior.detail.statsEmpty')));
            return;
        }

        if (!stats.range) {
            stats.range = defaultRange(all);
        }

        var range = stats.range;
        var records = all.filter(function (record) {
            var day = global.LifeLogDateTime.startOfDay(record.start);
            return day >= range.start && day <= range.end;
        });

        var totalMs = 0;
        records.forEach(function (record) {
            if (record.type === 'period' && record.end !== null) {
                totalMs += Math.max(0, record.end - record.start);
            }
        });

        // 有「时段」记录才画时长；否则退化为按天记次数
        var useDuration = totalMs > 0;

        var times = [];
        var values = [];
        records.forEach(function (record) {
            times.push(record.start);
            if (!useDuration) {
                values.push(1);
            } else if (record.type === 'period' && record.end !== null) {
                values.push(Math.max(0, record.end - record.start) / 60000);
            } else {
                values.push(0);
            }
        });

        var points = global.LifeLogChart.bucketByDay(times, values, range);
        var days = points.length;

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
            'span',
            'stats-chart-title',
            t(useDuration ? 'behavior.detail.chartDuration' : 'behavior.detail.chartCount')
        ));
        chartBlock.appendChild(global.LifeLogChart.build(points, { type: stats.chartType }));
        wrap.appendChild(chartBlock);

        var list = global.LifeLogUI.el('dl', 'stats-list');
        [
            [t('behavior.detail.total'), formatDuration(totalMs)],
            [t('behavior.detail.count'), String(records.length)],
            [
                t('behavior.detail.perTime'),
                formatDuration(records.length ? totalMs / records.length : 0)
            ],
            [t('behavior.detail.perDay'), formatDuration(days ? totalMs / days : 0)]
        ].forEach(function (row) {
            list.appendChild(global.LifeLogUI.el('dt', 'stats-key', row[0]));
            list.appendChild(global.LifeLogUI.el('dd', 'stats-value', row[1]));
        });
        wrap.appendChild(list);

        listEl.appendChild(wrap);
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
                global.LifeLogBehaviorPage.openEdit(currentId);
            } else {
                openDeleteSheet();
            }
        });
    }

    // --- 删除（输入名称确认） -----------------------------------------------

    function openDeleteSheet() {
        var behavior = global.LifeLogStore.getBehavior(currentId);
        if (!behavior) {
            return;
        }

        deleteTip.textContent = t('behavior.delete.tip').replace('{name}', behavior.name);
        deleteInput.value = '';
        validateDelete();
        global.LifeLogUI.openSheet(deleteSheet);
    }

    function validateDelete() {
        var behavior = global.LifeLogStore.getBehavior(currentId);
        var typed = deleteInput.value.trim();
        deleteConfirm.disabled = !behavior || typed !== behavior.name;
    }

    function confirmDelete() {
        var behavior = global.LifeLogStore.getBehavior(currentId);
        if (!behavior || deleteInput.value.trim() !== behavior.name) {
            return;
        }

        global.LifeLogUI.closeSheet();
        // 连带删掉该行为名下的全部时间记录
        global.LifeLogStore.removeBehaviors([behavior.id]);
        global.LifeLogUI.toast(t('toast.deleted'));
        close();
    }

    global.LifeLogBehaviorDetail = {
        init: init,
        open: open,
        close: close,
        refresh: refresh,
        isOpen: function () {
            return isOpen;
        }
    };
})(window);

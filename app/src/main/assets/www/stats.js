/**
 * Livolog - 统计视图的选项栏。
 *
 * 两到三行：图类型（直方图 / 折线图）、时间范围（开始 / 结束）、
 * 以及多字段跟踪时的「展示哪个值」。
 * 样式直接复用设置页的「左名称 / 右值」行，所以看起来和其它地方一致；
 * 横坐标刻度始终是「日」，所以这里不需要选项。
 * 起止时间是同一件事的两端，所以合成一个选项：左边标签、右边开始 / 结束上下两行。
 */
(function (global) {
    'use strict';

    var TYPES = ['bar', 'line'];

    function t(key) {
        return global.LivologI18n ? global.LivologI18n.t(key) : key;
    }

    /**
     * 「左名称 / 右值 + 下拉箭头」的一行。
     * ⚠️ 箭头是必须的（用户 2026-09-22 要求）：右边的值本身看不出可以点，
     *    得给个 ▾ 才像个下拉。项目选择行与图类型行都用它。
     */
    function row(label, valueEl, onOpen) {
        var item = global.LivologUI.el('li', 'setting-item');
        var button = global.LivologUI.el('button', 'setting-action');
        button.type = 'button';
        button.setAttribute('aria-haspopup', 'menu');
        button.setAttribute('aria-expanded', 'false');
        button.appendChild(global.LivologUI.el('span', 'setting-label', label));
        button.appendChild(valueEl);
        button.appendChild(chevron());
        button.addEventListener('click', function () {
            onOpen(button);
        });
        item.appendChild(button);
        return item;
    }

    /**
     * 下拉箭头（纯装饰）。
     * 直接内联一段三角，不走图标库 —— 图标库是给用户选的「业务图标」，
     * 这种 UI 装饰不该占用图标名额，也不受用户改图标库影响。
     */
    function chevron() {
        var span = global.LivologUI.el('span', 'setting-chevron');
        span.setAttribute('aria-hidden', 'true');
        span.innerHTML = '<svg viewBox="0 0 24 24" focusable="false">' +
            '<path d="M7 10l5 5 5-5z"/></svg>';
        return span;
    }

    /**
     * @param {object} config
     *   getChartType: () => 'bar' | 'line'
     *   getRange:     () => {start: number, end: number}
     *   onChange:     (key: 'chartType'|'start'|'end'|'series', value) => void
     *   getSeries?:   () => [{id, name}] | null
     *                 多项目跟踪时用来选「看哪几个项目」；单选时传 null
     *   getSelectedSeries?: () => string[]   当前选中的项目 id（空数组 = 全部）
     *   lockChartType?: boolean  true 则不显示「图类型」行（只有折线图这一种）
     * @returns {{root: HTMLElement, refresh: () => void}}
     */
    function build(config) {
        var list = global.LivologUI.el('ul', 'setting-list stats-options');
        var chartValue = global.LivologUI.el('span', 'setting-value');

        /*
           多项目跟踪：第一行是「选哪几个项目」，默认 All。
           菜单只有两个选项 —— All / Select…；点 Select… 弹居中模态的勾选清单
           （用户 2026-09-22 明确要求这个交互，替代原来直接列项目的做法）。
           range 固定在第二行。
        */
        var series = config.getSeries ? config.getSeries() : null;
        var seriesValue = global.LivologUI.el('span', 'setting-value');
        if (series && series.length > 1) {
            list.appendChild(row(t('stats.series'), seriesValue,
                function (anchor) {
                    anchor.setAttribute('aria-expanded', 'true');
                    var selected = config.getSelectedSeries ? config.getSelectedSeries() : [];
                    var all = !selected.length;
                    global.LivologUI.openMenu(anchor, [
                        { value: '__all__', label: t('stats.series.all'), selected: all },
                        { value: '__pick__', label: t('stats.series.pick'), selected: !all }
                    ], function (value) {
                        anchor.setAttribute('aria-expanded', 'false');
                        if (value === '__all__') {
                            config.onChange('series', []);
                            return;
                        }
                        global.LivologUI.openChecklist({
                            title: t('stats.series.pick'),
                            allLabel: t('stats.series.all'),
                            confirmLabel: t('action.confirm'),
                            cancelLabel: t('action.cancel'),
                            items: series.map(function (entry) {
                                return {
                                    id: entry.id,
                                    label: entry.name,
                                    checked: all || selected.indexOf(entry.id) >= 0
                                };
                            }),
                            onConfirm: function (ids) {
                                config.onChange('series', ids);
                            }
                        });
                    });
                }));
        }

        // 图类型：只有确实支持多种时才给这一行（跟踪统计固定折线图，不给）
        if (!config.lockChartType) {
            list.appendChild(row(t('stats.chartType'), chartValue, function (anchor) {
                anchor.setAttribute('aria-expanded', 'true');
                global.LivologUI.openMenu(
                    anchor,
                    TYPES.map(function (type) {
                        return {
                            value: type,
                            label: t('stats.chartType.' + type),
                            selected: type === config.getChartType()
                        };
                    }),
                    function (value) {
                        anchor.setAttribute('aria-expanded', 'false');
                        config.onChange('chartType', value);
                    }
                );
            }));
        }

        /*
           起止时间合成一个选项。
           ⚠️ 用户 2026-09-22 要求：**去掉左边的「Range」标签、日期居中**，
              因为这一行不再需要左对齐的说明文字了（它本身就长得像日期区间）。
              开始 —— 结束并排居中，两端各自可点。
        */
        var rangeItem = global.LivologUI.el('li', 'setting-item stats-range');
        var rangeValues = global.LivologUI.el('div', 'stats-range-values');
        var startValue = timeButton('stats.pickStart', 'start');
        var endValue = timeButton('stats.pickEnd', 'end');
        rangeValues.appendChild(startValue);
        rangeValues.appendChild(global.LivologUI.el('span', 'stats-range-dash', '—'));
        rangeValues.appendChild(endValue);
        rangeItem.appendChild(rangeValues);
        list.appendChild(rangeItem);

        // 两个时间各自可点，点了打开自己的日期选择；
        // 值后面跟一个箭头，因为光看日期看不出这一行能点
        function timeButton(titleKey, key) {
            var button = global.LivologUI.el('button', 'stats-range-time');
            button.type = 'button';
            button.appendChild(global.LivologUI.el('span', 'stats-range-date'));
            button.appendChild(chevron());
            button.addEventListener('click', function () {
                global.LivologDatePicker.open({
                    title: t(titleKey),
                    value: config.getRange()[key],
                    onPick: function (ms) {
                        config.onChange(key, ms);
                    }
                });
            });
            return button;
        }

        /**
         * 第一行的值：没筛选时显示 All，筛了就显示选中的项目名（逗号分隔）。
         * 不再拼「全部 + 名字」那种混合串 —— 用户要求只有 All / Select 两种状态。
         */
        function seriesLabel() {
            if (!series || series.length <= 1) {
                return '';
            }
            var selected = config.getSelectedSeries ? config.getSelectedSeries() : [];
            if (!selected.length || selected.length === series.length) {
                return t('stats.series.all');
            }
            var names = [];
            series.forEach(function (entry) {
                if (selected.indexOf(entry.id) >= 0) {
                    names.push(entry.name);
                }
            });
            return names.join(', ');
        }

        function refresh() {
            var range = config.getRange();
            if (!config.lockChartType) {
                chartValue.textContent = t('stats.chartType.' + config.getChartType());
            }
            startValue.querySelector('.stats-range-date').textContent =
                global.LivologDateTime.formatDate(range.start);
            endValue.querySelector('.stats-range-date').textContent =
                global.LivologDateTime.formatDate(range.end);
            // 「选项目」那一行的值
            if (series && series.length > 1) {
                seriesValue.textContent = seriesLabel();
            }
        }

        refresh();

        return { root: list, refresh: refresh };
    }

    global.LivologStats = {
        build: build
    };
})(window);

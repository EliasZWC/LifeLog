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

    function row(label, valueEl, onOpen) {
        var item = global.LivologUI.el('li', 'setting-item');
        var button = global.LivologUI.el('button', 'setting-action');
        button.type = 'button';
        button.setAttribute('aria-haspopup', 'menu');
        button.setAttribute('aria-expanded', 'false');
        button.appendChild(global.LivologUI.el('span', 'setting-label', label));
        button.appendChild(valueEl);
        button.addEventListener('click', function () {
            onOpen(button);
        });
        item.appendChild(button);
        return item;
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
           多项目跟踪：第一行是「选哪几个项目」，默认全部。
           可多选 —— 点一下只在/取消该项目；全部取消就回到「全部」。
           （用户 2026-09-22 明确要求：项目放第一个，range 放第二个。）
        */
        var series = config.getSeries ? config.getSeries() : null;
        var seriesValue = global.LivologUI.el('span', 'setting-value');
        if (series && series.length > 1) {
            list.appendChild(row(t('stats.series'), seriesValue,
                function (anchor) {
                    anchor.setAttribute('aria-expanded', 'true');
                    var selected = config.getSelectedSeries ? config.getSelectedSeries() : [];
                    var all = !selected.length;
                    var items = [{ value: '__all__', label: t('stats.series.all'), selected: all }];
                    series.forEach(function (entry) {
                        items.push({
                            value: entry.id,
                            label: entry.name,
                            selected: !all && selected.indexOf(entry.id) >= 0
                        });
                    });
                    global.LivologUI.openMenu(anchor, items, function (value) {
                        anchor.setAttribute('aria-expanded', 'false');
                        var next;
                        if (value === '__all__') {
                            next = [];
                        } else if (all) {
                            // 从「全部」点某一项 → 只看这一项
                            next = [value];
                        } else if (selected.indexOf(value) >= 0) {
                            next = selected.filter(function (id) {
                                return id !== value;
                            });
                        } else {
                            next = selected.concat([value]);
                        }
                        config.onChange('series', next);
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

        // 起止时间合成一个选项：左边「Range」垂直居中，右边开始 / 结束上下两行、都贴右
        var rangeItem = global.LivologUI.el('li', 'setting-item stats-range');
        rangeItem.appendChild(global.LivologUI.el('span', 'setting-label', t('stats.range')));

        var rangeValues = global.LivologUI.el('div', 'stats-range-values');
        var startValue = timeButton('stats.pickStart', 'start');
        var endValue = timeButton('stats.pickEnd', 'end');
        rangeValues.appendChild(startValue);
        rangeValues.appendChild(endValue);
        rangeItem.appendChild(rangeValues);
        list.appendChild(rangeItem);

        // 两个时间各自可点，点了打开自己的日期选择
        function timeButton(titleKey, key) {
            var button = global.LivologUI.el('button', 'stats-range-time');
            button.type = 'button';
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

        /** 第一行的值：显示「全部」或选中的项目名（逗号分隔） */
        function seriesLabel() {
            if (!series || series.length <= 1) {
                return '';
            }
            var selected = config.getSelectedSeries ? config.getSelectedSeries() : [];
            if (!selected.length) {
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
            startValue.textContent = global.LivologDateTime.formatDate(range.start);
            endValue.textContent = global.LivologDateTime.formatDate(range.end);
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

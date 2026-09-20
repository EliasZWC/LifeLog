/**
 * LifeLog - 统计视图的选项栏。
 *
 * 三行：图类型（直方图 / 折线图）、开始、结束。
 * 样式直接复用设置页的「左名称 / 右值」行，所以看起来和其它地方一致；
 * 横坐标刻度始终是「日」，所以这里不需要选项。
 */
(function (global) {
    'use strict';

    var TYPES = ['bar', 'line'];

    function t(key) {
        return global.LifeLogI18n ? global.LifeLogI18n.t(key) : key;
    }

    function row(label, valueEl, onOpen) {
        var item = global.LifeLogUI.el('li', 'setting-item');
        var button = global.LifeLogUI.el('button', 'setting-action');
        button.type = 'button';
        button.setAttribute('aria-haspopup', 'menu');
        button.setAttribute('aria-expanded', 'false');
        button.appendChild(global.LifeLogUI.el('span', 'setting-label', label));
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
     *   onChange:     (key: 'chartType'|'start'|'end', value) => void
     * @returns {{root: HTMLElement, refresh: () => void}}
     */
    function build(config) {
        var list = global.LifeLogUI.el('ul', 'setting-list stats-options');
        var chartValue = global.LifeLogUI.el('span', 'setting-value');
        var startValue = global.LifeLogUI.el('span', 'setting-value');
        var endValue = global.LifeLogUI.el('span', 'setting-value');

        list.appendChild(row(t('stats.chartType'), chartValue, function (anchor) {
            anchor.setAttribute('aria-expanded', 'true');
            global.LifeLogUI.openMenu(
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

        list.appendChild(row(t('stats.rangeStart'), startValue, function () {
            global.LifeLogDatePicker.open({
                title: t('stats.pickStart'),
                value: config.getRange().start,
                onPick: function (ms) {
                    config.onChange('start', ms);
                }
            });
        }));

        list.appendChild(row(t('stats.rangeEnd'), endValue, function () {
            global.LifeLogDatePicker.open({
                title: t('stats.pickEnd'),
                value: config.getRange().end,
                onPick: function (ms) {
                    config.onChange('end', ms);
                }
            });
        }));

        function refresh() {
            var range = config.getRange();
            chartValue.textContent = t('stats.chartType.' + config.getChartType());
            startValue.textContent = global.LifeLogDateTime.formatDate(range.start);
            endValue.textContent = global.LifeLogDateTime.formatDate(range.end);
        }

        refresh();

        return { root: list, refresh: refresh };
    }

    global.LifeLogStats = {
        build: build
    };
})(window);

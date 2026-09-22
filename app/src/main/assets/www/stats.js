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
     *   onChange:     (key: 'chartType'|'start'|'end'|'field', value) => void
     *   getFields?:   () => [{id, name}] | null   多项目时多一行「图例」（单项目传 null）
     *   getFieldId?:  () => string
     *   lockChartType?: boolean   true 则不显示「图类型」那一行（只有折线图这一种）
     *   getDashes?:   () => string[]  与 fields 一一对应的线型（dasharray）
     * @returns {{root: HTMLElement, refresh: () => void}}
     */
    function build(config) {
        var list = global.LivologUI.el('ul', 'setting-list stats-options');
        var chartValue = global.LivologUI.el('span', 'setting-value');

        // 图类型：只有确实支持多种时才给这一行
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

        /*
           多项目跟踪（比如血压）不再让人「选看哪个值」，而是一次把每个项目都画成一条线，
           靠**线型**区分。这里放一个图例：线型样例 + 项目名。
           单项目时不需要图例（只有一条实线）。
        */
        var fields = config.getFields ? config.getFields() : null;
        var legendEl = null;
        if (fields && fields.length) {
            var legendItem = global.LivologUI.el('li', 'setting-item stats-legend-item');
            legendItem.appendChild(
                global.LivologUI.el('span', 'setting-label', t('stats.legend'))
            );
            legendEl = global.LivologUI.el('div', 'stats-legend');
            legendItem.appendChild(legendEl);
            list.appendChild(legendItem);
        }

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

        /** 图例：每条线一个「线型样例 + 名称」 */
        function renderLegend() {
            if (!legendEl) {
                return;
            }
            var dashes = config.getDashes ? config.getDashes() : [];
            legendEl.innerHTML = '';
            (fields || []).forEach(function (field, index) {
                var entry = global.LivologUI.el('span', 'stats-legend-entry');
                var swatch = document.createElementNS(
                    'http://www.w3.org/2000/svg', 'svg'
                );
                swatch.setAttribute('class', 'stats-legend-swatch chart-series-' + index);
                swatch.setAttribute('viewBox', '0 0 24 8');
                swatch.setAttribute('aria-hidden', 'true');
                var line = document.createElementNS(
                    'http://www.w3.org/2000/svg', 'line'
                );
                line.setAttribute('x1', '0');
                line.setAttribute('y1', '4');
                line.setAttribute('x2', '24');
                line.setAttribute('y2', '4');
                if (dashes[index]) {
                    line.setAttribute('stroke-dasharray', dashes[index]);
                }
                swatch.appendChild(line);
                entry.appendChild(swatch);
                entry.appendChild(global.LivologUI.el('span', 'stats-legend-name', field.name));
                legendEl.appendChild(entry);
            });
        }

        function refresh() {
            var range = config.getRange();
            if (!config.lockChartType) {
                chartValue.textContent = t('stats.chartType.' + config.getChartType());
            }
            startValue.textContent = global.LivologDateTime.formatDate(range.start);
            endValue.textContent = global.LivologDateTime.formatDate(range.end);
            renderLegend();
        }

        refresh();

        return { root: list, refresh: refresh };
    }

    global.LivologStats = {
        build: build
    };
})(window);

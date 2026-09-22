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
     *   getFields?:   () => [{id, name}] | null   多字段时多一行选择（单字段传 null）
     *   getFieldId?:  () => string
     * @returns {{root: HTMLElement, refresh: () => void}}
     */
    function build(config) {
        var list = global.LivologUI.el('ul', 'setting-list stats-options');
        var chartValue = global.LivologUI.el('span', 'setting-value');
        var fieldValue = global.LivologUI.el('span', 'setting-value');

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

        // 多字段跟踪（比如血压）才需要选「看哪个值」
        var fields = config.getFields ? config.getFields() : null;
        if (fields && fields.length) {
            list.appendChild(row(t('metric.detail.formula'), fieldValue, function (anchor) {
                anchor.setAttribute('aria-expanded', 'true');
                global.LivologUI.openMenu(
                    anchor,
                    fields.map(function (field) {
                        return {
                            value: field.id,
                            label: field.name,
                            selected: field.id === config.getFieldId()
                        };
                    }),
                    function (value) {
                        anchor.setAttribute('aria-expanded', 'false');
                        config.onChange('field', value);
                    }
                );
            }));
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

        function refresh() {
            var range = config.getRange();
            chartValue.textContent = t('stats.chartType.' + config.getChartType());
            startValue.textContent = global.LivologDateTime.formatDate(range.start);
            endValue.textContent = global.LivologDateTime.formatDate(range.end);

            if (fields && fields.length) {
                var current = null;
                fields.forEach(function (field) {
                    if (field.id === config.getFieldId() && !current) {
                        current = field;
                    }
                });
                fieldValue.textContent = current ? current.name : fields[0].name;
            }
        }

        refresh();

        return { root: list, refresh: refresh };
    }

    global.LivologStats = {
        build: build
    };
})(window);

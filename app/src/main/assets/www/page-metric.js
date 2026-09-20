/**
 * LifeLog - 跟踪页。
 *
 * 跟踪项是「被跟踪的数据」（体重 / 腰围 / 每天喝水量 …），它**不是**时间记录：
 * 跟踪数据不会出现在时间页，也不参与行为统计。
 * 列表展示已建立的跟踪项，右下角悬浮按钮打开表单弹窗新增。
 */
(function (global) {
    'use strict';

    var listEl = null;
    var fab = null;
    var sheet = null;
    var sheetTitle = null;
    var nameInput = null;
    var iconPicker = null;
    var cancelBtn = null;
    var confirmBtn = null;

    /** 正在编辑的跟踪项 id；为空表示新增 */
    var editingId = null;

    function t(key) {
        return global.LifeLogI18n ? global.LifeLogI18n.t(key) : key;
    }

    function init() {
        listEl = document.getElementById('metric-list');
        fab = document.getElementById('metric-fab');
        sheet = document.getElementById('sheet-metric');
        sheetTitle = document.getElementById('sheet-metric-title');
        nameInput = document.getElementById('metric-name');
        cancelBtn = document.getElementById('metric-cancel');
        confirmBtn = document.getElementById('metric-confirm');

        iconPicker = global.LifeLogUI.createIconPicker(
            document.getElementById('metric-icon-picker')
        );

        fab.addEventListener('click', function () {
            openForm(null);
        });
        cancelBtn.addEventListener('click', function () {
            global.LifeLogUI.closeSheet();
        });
        confirmBtn.addEventListener('click', submit);
        nameInput.addEventListener('input', validate);
        nameInput.addEventListener('keydown', function (event) {
            if (event.key === 'Enter') {
                submit();
            }
        });

        global.LifeLogMetrics.onChange(render);
        if (global.LifeLogI18n) {
            global.LifeLogI18n.onChange(function () {
                applyTitle();
                render();
            });
        }
        render();
    }

    /** @param {string|null} id 传 id 就是重命名 */
    function openForm(id) {
        var metric = id ? global.LifeLogMetrics.getMetric(id) : null;
        if (id && !metric) {
            return;
        }

        editingId = id || null;
        nameInput.value = metric ? metric.name : '';
        iconPicker.select(metric ? metric.icon : global.LifeLogIcons.names()[0]);
        applyTitle();
        validate();
        global.LifeLogUI.openSheet(sheet);
    }

    function applyTitle() {
        var key = editingId ? 'metric.edit.title' : 'metric.form.title';
        sheetTitle.setAttribute('data-i18n', key);
        sheetTitle.textContent = t(key);
    }

    function validate() {
        var ok = nameInput.value.trim().length > 0;
        confirmBtn.disabled = !ok;
        return ok;
    }

    function submit() {
        if (!validate()) {
            return;
        }

        if (editingId) {
            global.LifeLogMetrics.updateMetric(editingId, nameInput.value, iconPicker.getSelected());
            global.LifeLogMetricDetail.refresh();
        } else {
            global.LifeLogMetrics.addMetric(nameInput.value, iconPicker.getSelected());
        }

        global.LifeLogUI.closeSheet();
    }

    /** 表示「点进去还有内容」的右对齐箭头 */
    function chevron() {
        var span = global.LifeLogUI.el('span', 'card-chevron');
        span.setAttribute('aria-hidden', 'true');
        span.innerHTML = '<svg viewBox="0 0 24 24" focusable="false">' +
            '<path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>';
        return span;
    }

    function render() {
        if (!listEl) {
            return;
        }

        var metrics = global.LifeLogMetrics.getMetrics();
        listEl.innerHTML = '';

        if (!metrics.length) {
            listEl.appendChild(global.LifeLogUI.emptyState(t('metric.empty')));
            return;
        }

        metrics.forEach(function (metric) {
            var card = global.LifeLogUI.el('li', 'card');
            card.dataset.id = metric.id;
            card.appendChild(global.LifeLogUI.icon(metric.icon, 'card-icon'));
            card.appendChild(global.LifeLogUI.el('span', 'card-title', metric.name));
            card.appendChild(chevron());

            card.addEventListener('click', function () {
                global.LifeLogMetricDetail.open(metric.id);
            });

            listEl.appendChild(card);
        });
    }

    global.LifeLogMetricPage = {
        init: init,
        render: render,
        openEdit: function (id) {
            openForm(id);
        }
    };
})(window);

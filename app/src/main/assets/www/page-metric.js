/**
 * Livolog - 跟踪页。
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
    var fieldsEl = null;
    var iconPicker = null;
    var cancelBtn = null;
    var confirmBtn = null;

    /** 正在编辑的跟踪项 id；为空表示新增 */
    var editingId = null;

    function t(key) {
        return global.LivologI18n ? global.LivologI18n.t(key) : key;
    }

    function init() {
        listEl = document.getElementById('metric-list');
        fab = document.getElementById('metric-fab');
        sheet = document.getElementById('sheet-metric');
        sheetTitle = document.getElementById('sheet-metric-title');
        nameInput = document.getElementById('metric-name');
        fieldsEl = document.getElementById('metric-fields');
        cancelBtn = document.getElementById('metric-cancel');
        confirmBtn = document.getElementById('metric-confirm');

        iconPicker = global.LivologUI.createIconPicker(
            document.getElementById('metric-icon-picker')
        );

        fab.addEventListener('click', function () {
            openForm(null);
        });
        cancelBtn.addEventListener('click', function () {
            global.LivologUI.closeSheet();
        });
        confirmBtn.addEventListener('click', submit);
        nameInput.addEventListener('input', validate);
        nameInput.addEventListener('keydown', function (event) {
            if (event.key === 'Enter') {
                submit();
            }
        });

        global.LivologMetrics.onChange(render);
        if (global.LivologI18n) {
            global.LivologI18n.onChange(function () {
                applyTitle();
                render();
            });
        }
        // 长按卡片拖动排序（与行为页一致）
        global.LivologUI.attachSortable(listEl, {
            onDrop: function (ids) {
                global.LivologMetrics.reorderMetrics(ids);
            }
        });

        render();
    }

    /** @param {string|null} id 传 id 就是重命名 */
    function openForm(id) {
        var metric = id ? global.LivologMetrics.getMetric(id) : null;
        if (id && !metric) {
            return;
        }

        editingId = id || null;
        nameInput.value = metric ? metric.name : '';
        iconPicker.select(metric ? metric.icon : global.LivologIcons.names()[0]);
        renderFieldRows(metric ? metric.fields.map(function (field) {
            return field.name;
        }) : ['']);
        applyTitle();
        validate();
        global.LivologUI.openSheet(sheet);
    }

    /** 字段名输入行：初始一行，底部按钮可以再加 */
    function renderFieldRows(names) {
        fieldsEl.innerHTML = '';

        var rows = global.LivologUI.el('div', 'field-rows');
        fieldsEl.appendChild(rows);

        (names.length ? names : ['']).forEach(function (value) {
            rows.appendChild(fieldRow(value));
        });

        var add = global.LivologUI.el('button', 'field-add');
        add.type = 'button';
        add.setAttribute('data-i18n', 'metric.form.item.add');
        add.textContent = t('metric.form.item.add');
        add.addEventListener('click', function () {
            rows.appendChild(fieldRow(''));
            validate();
            var inputs = rows.querySelectorAll('.field-input');
            if (inputs.length) {
                inputs[inputs.length - 1].focus();
            }
        });
        fieldsEl.appendChild(add);
    }

    /** 一行字段：输入框 + 删除按钮 */
    function fieldRow(value) {
        var row = global.LivologUI.el('div', 'field-row');

        var input = document.createElement('input');
        input.className = 'form-input field-input';
        input.type = 'text';
        input.maxLength = 16;
        input.autocomplete = 'off';
        input.placeholder = t('metric.form.itemNamePlaceholder');
        input.value = value;
        input.addEventListener('input', validate);
        input.addEventListener('keydown', function (event) {
            if (event.key === 'Enter') {
                submit();
            }
        });
        row.appendChild(input);

        var remove = global.LivologUI.el('button', 'icon-button field-remove');
        remove.type = 'button';
        remove.setAttribute('aria-label', t('action.close'));
        remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
            '<path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
        remove.addEventListener('click', function () {
            row.remove();
            validate();
        });
        row.appendChild(remove);

        return row;
    }

    /** 表单里填的字段名（去掉空行） */
    function readFieldNames() {
        return Array.prototype.map.call(
            fieldsEl.querySelectorAll('.field-input'),
            function (input) {
                return input.value.trim();
            }
        ).filter(function (name) {
            return !!name;
        });
    }

    function applyTitle() {
        var key = editingId ? 'metric.edit.title' : 'metric.form.title';
        sheetTitle.setAttribute('data-i18n', key);
        sheetTitle.textContent = t(key);
    }

    function validate() {
        var ok = nameInput.value.trim().length > 0 && readFieldNames().length > 0;
        confirmBtn.disabled = !ok;
        return ok;
    }

    function submit() {
        if (!validate()) {
            return;
        }

        var fields = readFieldNames().map(function (name) {
            return { name: name };
        });

        if (editingId) {
            global.LivologMetrics.updateMetric(
                editingId, nameInput.value, iconPicker.getSelected(), fields
            );
            global.LivologMetricDetail.refresh();
        } else {
            global.LivologMetrics.addMetric(nameInput.value, iconPicker.getSelected(), fields);
        }

        global.LivologUI.closeSheet();
    }

    /** 表示「点进去还有内容」的右对齐箭头 */
    function chevron() {
        var span = global.LivologUI.el('span', 'card-chevron');
        span.setAttribute('aria-hidden', 'true');
        span.innerHTML = '<svg viewBox="0 0 24 24" focusable="false">' +
            '<path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>';
        return span;
    }

    function render() {
        if (!listEl) {
            return;
        }

        var metrics = global.LivologMetrics.getMetrics();
        listEl.innerHTML = '';

        if (!metrics.length) {
            listEl.appendChild(global.LivologUI.emptyState(t('metric.empty')));
            return;
        }

        metrics.forEach(function (metric) {
            var card = global.LivologUI.el('li', 'card');
            card.dataset.id = metric.id;
            card.appendChild(global.LivologUI.icon(metric.icon, 'card-icon'));
            card.appendChild(global.LivologUI.el('span', 'card-title', metric.name));
            card.appendChild(chevron());

            card.addEventListener('click', function () {
                global.LivologMetricDetail.open(metric.id);
            });

            listEl.appendChild(card);
        });
    }

    global.LivologMetricPage = {
        init: init,
        render: render,
        openEdit: function (id) {
            openForm(id);
        }
    };
})(window);

/**
 * LifeLog - 行为页。
 * 列表展示已建立的行为，右下角悬浮按钮打开表单弹窗新增。
 */
(function (global) {
    'use strict';

    var listEl = null;
    var fab = null;
    var sheet = null;
    var nameInput = null;
    var iconPicker = null;
    var cancelBtn = null;
    var confirmBtn = null;

    function t(key) {
        return global.LifeLogI18n ? global.LifeLogI18n.t(key) : key;
    }

    function init() {
        listEl = document.getElementById('behavior-list');
        fab = document.getElementById('behavior-fab');
        sheet = document.getElementById('sheet-behavior');
        nameInput = document.getElementById('behavior-name');
        cancelBtn = document.getElementById('behavior-cancel');
        confirmBtn = document.getElementById('behavior-confirm');

        iconPicker = global.LifeLogUI.createIconPicker(
            document.getElementById('behavior-icon-picker')
        );

        fab.addEventListener('click', openForm);
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

        global.LifeLogStore.onChange(render);
        if (global.LifeLogI18n) {
            global.LifeLogI18n.onChange(render);
        }
        render();
    }

    /** 正在编辑的行为 id；为空表示新增 */
    var editingId = null;

    function openForm() {
        editingId = null;
        nameInput.value = '';
        iconPicker.select(global.LifeLogIcons.names()[0]);
        applyTitle();
        validate();
        global.LifeLogUI.openSheet(sheet);
    }

    /** 详情页选「重命名」时调这里，预填现有名称与图标 */
    function openEdit(id) {
        var behavior = global.LifeLogStore.getBehavior(id);
        if (!behavior) {
            return;
        }

        editingId = id;
        nameInput.value = behavior.name;
        iconPicker.select(behavior.icon);
        applyTitle();
        validate();
        global.LifeLogUI.openSheet(sheet);
    }

    function applyTitle() {
        var title = sheet.querySelector('.sheet-title');
        if (!title) {
            return;
        }
        var key = editingId ? 'behavior.edit.title' : 'behavior.form.title';
        title.setAttribute('data-i18n', key);
        title.textContent = t(key);
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
            global.LifeLogStore.updateBehavior(editingId, nameInput.value, iconPicker.getSelected());
            global.LifeLogBehaviorDetail.refresh();
        } else {
            global.LifeLogStore.addBehavior(nameInput.value, iconPicker.getSelected());
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

        var behaviors = global.LifeLogStore.getBehaviors();
        listEl.innerHTML = '';

        if (!behaviors.length) {
            listEl.appendChild(global.LifeLogUI.emptyState(t('behavior.empty')));
            return;
        }

        behaviors.forEach(function (behavior) {
            var card = global.LifeLogUI.el('li', 'card');
            card.dataset.id = behavior.id;
            card.appendChild(global.LifeLogUI.icon(behavior.icon, 'card-icon'));
            card.appendChild(global.LifeLogUI.el('span', 'card-title', behavior.name));
            card.appendChild(chevron());

            card.addEventListener('click', function () {
                global.LifeLogBehaviorDetail.open(behavior.id);
            });

            listEl.appendChild(card);
        });
    }

    global.LifeLogBehaviorPage = {
        init: init,
        render: render,
        openEdit: openEdit
    };
})(window);

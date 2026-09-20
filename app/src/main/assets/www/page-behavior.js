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

    var selectedIcon = null;

    function t(key) {
        return global.LifeLogI18n ? global.LifeLogI18n.t(key) : key;
    }

    function init() {
        listEl = document.getElementById('behavior-list');
        fab = document.getElementById('behavior-fab');
        sheet = document.getElementById('sheet-behavior');
        nameInput = document.getElementById('behavior-name');
        iconPicker = document.getElementById('behavior-icon-picker');
        cancelBtn = document.getElementById('behavior-cancel');
        confirmBtn = document.getElementById('behavior-confirm');

        buildIconPicker();

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

    function buildIconPicker() {
        global.LifeLogIcons.names().forEach(function (name) {
            var button = global.LifeLogUI.el('button', 'icon-option');
            button.type = 'button';
            button.dataset.icon = name;
            button.setAttribute('aria-label', name);
            button.appendChild(global.LifeLogUI.icon(name));
            button.addEventListener('click', function () {
                selectIcon(name);
            });
            iconPicker.appendChild(button);
        });

        selectIcon(global.LifeLogIcons.names()[0]);
    }

    function selectIcon(name) {
        selectedIcon = name;
        Array.prototype.forEach.call(iconPicker.children, function (button) {
            button.classList.toggle('is-selected', button.dataset.icon === name);
        });
    }

    function openForm() {
        nameInput.value = '';
        selectIcon(global.LifeLogIcons.names()[0]);
        validate();
        global.LifeLogUI.openSheet(sheet);
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
        global.LifeLogStore.addBehavior(nameInput.value, selectedIcon);
        global.LifeLogUI.closeSheet();
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
            card.appendChild(global.LifeLogUI.icon(behavior.icon, 'card-icon'));
            card.appendChild(global.LifeLogUI.el('span', 'card-title', behavior.name));
            listEl.appendChild(card);
        });
    }

    global.LifeLogBehaviorPage = {
        init: init,
        render: render
    };
})(window);

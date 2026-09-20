/**
 * LifeLog - 日期选择（只要年月日）。
 *
 * 复用底部 sheet：一组分段输入 + 取消 / 确定。统计视图的起止日期用它。
 */
(function (global) {
    'use strict';

    var sheet = null;
    var titleEl = null;
    var fieldsEl = null;
    var hintEl = null;
    var confirmBtn = null;

    var group = null;
    var onPick = null;

    function t(key) {
        return global.LifeLogI18n ? global.LifeLogI18n.t(key) : key;
    }

    function init() {
        sheet = document.getElementById('sheet-date');
        if (!sheet) {
            return;
        }

        titleEl = document.getElementById('sheet-date-title');
        fieldsEl = document.getElementById('date-fields');
        hintEl = document.getElementById('date-hint');
        confirmBtn = document.getElementById('date-confirm');

        document.getElementById('date-cancel').addEventListener('click', function () {
            onPick = null;
            global.LifeLogUI.closeSheet();
        });
        confirmBtn.addEventListener('click', submit);
    }

    /**
     * @param {{title?: string, value?: number, onPick: (ms: number) => void}} config
     */
    function open(config) {
        if (!sheet) {
            return;
        }

        onPick = config.onPick;
        titleEl.textContent = config.title || '';

        fieldsEl.innerHTML = '';
        group = global.LifeLogDateTime.buildDateGroup(
            null,
            config.value || Date.now(),
            validate
        );
        fieldsEl.appendChild(group.root);

        validate();
        global.LifeLogUI.openSheet(sheet);
    }

    function readValue() {
        return group
            ? global.LifeLogDateTime.toDateTimestamp(global.LifeLogDateTime.readGroup(group))
            : null;
    }

    function validate() {
        var ok = readValue() !== null;
        hintEl.textContent = ok ? '' : t('date.invalid');
        hintEl.hidden = ok;
        confirmBtn.disabled = !ok;
        return ok;
    }

    function submit() {
        if (!validate()) {
            return;
        }

        var value = readValue();
        var callback = onPick;
        onPick = null;

        global.LifeLogUI.closeSheet();
        if (callback) {
            callback(value);
        }
    }

    global.LifeLogDatePicker = {
        init: init,
        open: open
    };
})(window);

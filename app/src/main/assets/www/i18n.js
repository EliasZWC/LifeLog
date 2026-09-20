/**
 * LifeLog - 极简国际化。
 *
 * 默认语言为英文（DEFAULT_LOCALE），zh 词条已备好，交给后续「设置」页切换。
 * 支持三种绑定：data-i18n（文本）、data-i18n-aria-label、data-i18n-placeholder。
 */
(function (global) {
    'use strict';

    var DEFAULT_LOCALE = 'en';
    var STORAGE_KEY = 'lifelog.locale';

    var MESSAGES = {
        en: {
            'app.name': 'LifeLog',
            'nav.label': 'Main navigation',
            'nav.time': 'Time',
            'nav.behavior': 'Behavior',
            'nav.settings': 'Settings',

            'view.all': 'All',
            'view.period': 'Period',
            'view.moment': 'Moment',
            'view.switch': 'Switch view',

            'time.empty': 'No records yet',
            'time.add': 'Add record',
            'time.form.title': 'New record',
            'time.form.behavior': 'Behavior',
            'time.form.type': 'Type',
            'time.form.type.none': 'Select type',
            'time.form.start': 'Start',
            'time.form.end': 'End',
            'time.form.needBehavior': 'Create a behavior first',
            'time.form.needType': 'Select a type to fill in the time',
            'time.form.invalidTime': 'Fill in the whole time',
            'time.form.endBeforeStart': 'End time is earlier than start time',

            'behavior.empty': 'No behaviors yet',
            'behavior.add': 'Add behavior',
            'behavior.form.title': 'New behavior',
            'behavior.form.name': 'Name',
            'behavior.form.namePlaceholder': 'e.g. Sleep',
            'behavior.form.icon': 'Icon',
            'behavior.form.needName': 'Enter a name',

            'action.cancel': 'Cancel',
            'action.confirm': 'Confirm',

            'selection.cancel': 'Cancel selection',
            'selection.delete': 'Delete selected',
            'selection.count': '{n} selected',

            'settings.version': 'Version',

            'settings.theme': 'Theme',
            'settings.theme.light': 'Light',
            'settings.theme.dark': 'Dark',
            'settings.theme.system': 'Follow system'
        },
        zh: {
            'app.name': 'LifeLog',
            'nav.label': '主导航',
            'nav.time': '时间',
            'nav.behavior': '行为',
            'nav.settings': '设置',

            'view.all': '全部',
            'view.period': '时段',
            'view.moment': '时点',
            'view.switch': '切换视图',

            'time.empty': '还没有记录',
            'time.add': '新增记录',
            'time.form.title': '新增记录',
            'time.form.behavior': '行为',
            'time.form.type': '类型',
            'time.form.type.none': '请选择类型',
            'time.form.start': '开始',
            'time.form.end': '结束',
            'time.form.needBehavior': '请先到「行为」页创建行为',
            'time.form.needType': '请先选择类型',
            'time.form.invalidTime': '时间未填写完整',
            'time.form.endBeforeStart': '结束时间早于开始时间',

            'behavior.empty': '还没有行为',
            'behavior.add': '新增行为',
            'behavior.form.title': '新增行为',
            'behavior.form.name': '名称',
            'behavior.form.namePlaceholder': '例如：睡眠',
            'behavior.form.icon': '图标',
            'behavior.form.needName': '请输入名称',

            'action.cancel': '取消',
            'action.confirm': '确定',

            'selection.cancel': '取消选择',
            'selection.delete': '删除所选',
            'selection.count': '已选 {n} 项',

            'settings.version': '版本',

            'settings.theme': '主题',
            'settings.theme.light': '日间模式',
            'settings.theme.dark': '夜间模式',
            'settings.theme.system': '跟随系统模式'
        }
    };

    var current = DEFAULT_LOCALE;
    var listeners = [];

    function normalize(locale) {
        if (!locale) {
            return DEFAULT_LOCALE;
        }
        var value = String(locale).toLowerCase();
        if (MESSAGES[value]) {
            return value;
        }
        if (value.indexOf('zh') === 0) {
            return 'zh';
        }
        return DEFAULT_LOCALE;
    }

    function t(key) {
        var table = MESSAGES[current] || {};
        if (Object.prototype.hasOwnProperty.call(table, key)) {
            return table[key];
        }
        var fallback = MESSAGES[DEFAULT_LOCALE];
        return Object.prototype.hasOwnProperty.call(fallback, key) ? fallback[key] : key;
    }

    /** 把当前语言应用到 DOM 上带 data-i18n / data-i18n-aria-label 的元素 */
    function apply(root) {
        var scope = root || document;

        Array.prototype.forEach.call(scope.querySelectorAll('[data-i18n]'), function (element) {
            element.textContent = t(element.dataset.i18n);
        });

        Array.prototype.forEach.call(scope.querySelectorAll('[data-i18n-aria-label]'), function (element) {
            element.setAttribute('aria-label', t(element.dataset.i18nAriaLabel));
        });

        Array.prototype.forEach.call(scope.querySelectorAll('[data-i18n-placeholder]'), function (element) {
            element.setAttribute('placeholder', t(element.dataset.i18nPlaceholder));
        });

        document.documentElement.lang = current === 'zh' ? 'zh-CN' : 'en';
        document.title = t('app.name');
    }

    function setLocale(locale) {
        current = normalize(locale);
        try {
            localStorage.setItem(STORAGE_KEY, current);
        } catch (e) {
            /* 隐私模式下忽略 */
        }
        apply(document);
        listeners.forEach(function (listener) {
            listener(current);
        });
        return current;
    }

    function init() {
        var saved = null;
        try {
            saved = localStorage.getItem(STORAGE_KEY);
        } catch (e) {
            /* 忽略 */
        }
        current = normalize(saved || DEFAULT_LOCALE);
        apply(document);
        return current;
    }

    global.LifeLogI18n = {
        DEFAULT_LOCALE: DEFAULT_LOCALE,
        init: init,
        setLocale: setLocale,
        getLocale: function () {
            return current;
        },
        t: t,
        apply: apply,
        onChange: function (listener) {
            listeners.push(listener);
        }
    };
})(window);

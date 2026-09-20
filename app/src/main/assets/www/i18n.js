/**
 * LifeLog - 极简国际化。
 *
 * 默认语言为英文（DEFAULT_LOCALE），zh 词条已备好，交给后续「设置」页切换。
 */
(function (global) {
    'use strict';

    var DEFAULT_LOCALE = 'en';
    var STORAGE_KEY = 'lifelog.locale';

    var MESSAGES = {
        en: {
            'app.name': 'LifeLog',
            'nav.label': 'Main navigation',
            'nav.period': 'Period',
            'nav.moment': 'Moment',
            'nav.stats': 'Stats',
            'nav.settings': 'Settings',
            'settings.theme': 'Theme',
            'settings.theme.light': 'Light',
            'settings.theme.dark': 'Dark',
            'settings.theme.system': 'Follow system'
        },
        zh: {
            'app.name': 'LifeLog',
            'nav.label': '主导航',
            'nav.period': '时段',
            'nav.moment': '时点',
            'nav.stats': '统计',
            'nav.settings': '设置',
            'settings.theme': '主题',
            'settings.theme.light': '日间模式',
            'settings.theme.dark': '夜间模式',
            'settings.theme.system': '跟随系统模式'
        }
    };

    var current = DEFAULT_LOCALE;

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
        apply: apply
    };
})(window);

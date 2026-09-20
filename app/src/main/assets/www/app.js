/**
 * LifeLog - 应用外壳逻辑
 * 负责底部导航切换、顶部标题同步，以及各模块的启动。
 */
(function () {
    'use strict';

    var STORAGE_KEY = 'lifelog.activeTab';
    var DEFAULT_TAB = 'period';
    var TAB_ORDER = ['period', 'moment', 'stats', 'settings'];

    var tabs = Array.prototype.slice.call(document.querySelectorAll('.nav-item'));
    var titleEl = document.getElementById('page-title');
    var pages = {};
    TAB_ORDER.forEach(function (name) {
        pages[name] = document.getElementById('page-' + name);
    });

    function selectTab(name) {
        if (!pages[name]) {
            name = DEFAULT_TAB;
        }

        tabs.forEach(function (tab) {
            var active = tab.dataset.page === name;
            tab.classList.toggle('is-active', active);
            tab.setAttribute('aria-selected', active ? 'true' : 'false');
        });

        Object.keys(pages).forEach(function (key) {
            if (pages[key]) {
                pages[key].hidden = key !== name;
            }
        });

        if (titleEl) {
            // 标题文案复用导航词条，切语言时也能一起更新
            titleEl.setAttribute('data-i18n', 'nav.' + name);
            titleEl.textContent = window.LifeLogI18n ? window.LifeLogI18n.t('nav.' + name) : name;
        }

        try {
            localStorage.setItem(STORAGE_KEY, name);
        } catch (e) {
            /* 隐私模式下忽略 */
        }
    }

    tabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
            selectTab(tab.dataset.page);
        });
    });

    if (window.LifeLogI18n) {
        window.LifeLogI18n.init();
    }
    if (window.LifeLogTheme) {
        window.LifeLogTheme.init();
    }
    if (window.LifeLogSettings) {
        window.LifeLogSettings.init();
    }

    var initial = DEFAULT_TAB;
    try {
        initial = localStorage.getItem(STORAGE_KEY) || DEFAULT_TAB;
    } catch (e) {
        /* 忽略 */
    }
    selectTab(initial);

    // 禁止双指缩放 / 长按放大镜造成的页面抖动
    document.addEventListener('gesturestart', function (event) {
        event.preventDefault();
    });

    // 暴露给后续功能扩展使用
    window.LifeLog = {
        selectTab: selectTab,
        TAB_ORDER: TAB_ORDER
    };
})();

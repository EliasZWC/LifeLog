/**
 * LifeLog - 应用外壳逻辑
 * 负责底部导航切换、顶部标题同步、页面进入动画，以及各模块的启动。
 */
(function () {
    'use strict';

    var STORAGE_KEY = 'lifelog.activeTab';
    var DEFAULT_TAB = 'time';
    var TAB_ORDER = ['time', 'behavior', 'settings'];

    var tabs = Array.prototype.slice.call(document.querySelectorAll('.nav-item'));
    var titleEl = document.getElementById('page-title');
    var pages = {};
    TAB_ORDER.forEach(function (name) {
        pages[name] = document.getElementById('page-' + name);
    });

    var currentTab = null;

    function pageModule(name) {
        // 只有时间页还保留长按多选（行为页改为进详情页删除）
        return name === 'time' ? window.LifeLogTimePage : null;
    }

    function selectTab(name, options) {
        if (!pages[name]) {
            name = DEFAULT_TAB;
        }

        var changed = name !== currentTab;
        // 向右切从右侧进入，向左切从左侧进入
        var direction = TAB_ORDER.indexOf(name) >= TAB_ORDER.indexOf(currentTab) ? 1 : -1;

        tabs.forEach(function (tab) {
            var active = tab.dataset.page === name;
            tab.classList.toggle('is-active', active);
            tab.setAttribute('aria-selected', active ? 'true' : 'false');
        });

        TAB_ORDER.forEach(function (key) {
            if (pages[key]) {
                pages[key].hidden = key !== name;
            }
        });

        // 悬浮按钮跟着当前页显示
        Array.prototype.forEach.call(document.querySelectorAll('[data-tab]'), function (fab) {
            fab.hidden = fab.dataset.tab !== name;
        });

        // 切页会退出多选，并把多选目标改成当前页的列表
        if (window.LifeLogUI) {
            var module = pageModule(name);
            window.LifeLogUI.bindSelection(module ? module.selection : null);
        }

        if (titleEl) {
            // 标题文案复用导航词条，切语言时也能一起更新
            titleEl.setAttribute('data-i18n', 'nav.' + name);
            titleEl.textContent = window.LifeLogI18n ? window.LifeLogI18n.t('nav.' + name) : name;
        }

        if (changed && (!options || options.animate !== false)) {
            window.LifeLogUI.animateEnter(pages[name], direction);
        }

        currentTab = name;

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
    if (window.LifeLogUI) {
        window.LifeLogUI.init();
    }
    if (window.LifeLogBehaviorPage) {
        window.LifeLogBehaviorPage.init();
    }
    if (window.LifeLogBehaviorDetail) {
        window.LifeLogBehaviorDetail.init();
    }
    if (window.LifeLogTimePage) {
        window.LifeLogTimePage.init();
    }
    if (window.LifeLogSettings) {
        window.LifeLogSettings.init();
    }
    if (window.LifeLogUpdate) {
        window.LifeLogUpdate.init();
    }

    var initial = DEFAULT_TAB;
    try {
        initial = localStorage.getItem(STORAGE_KEY) || DEFAULT_TAB;
    } catch (e) {
        /* 忽略 */
    }
    // 首屏不播切换动画
    selectTab(initial, { animate: false });

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

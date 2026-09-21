/**
 * Livolog - 应用外壳逻辑
 * 负责底部导航切换、顶部标题同步、页面进入动画，以及各模块的启动。
 */
(function () {
    'use strict';

    var STORAGE_KEY = 'livolog.activeTab';
    var DEFAULT_TAB = 'time';
    var TAB_ORDER = ['time', 'behavior', 'metric', 'setting'];

    var tabs = Array.prototype.slice.call(document.querySelectorAll('.nav-item'));
    var titleEl = document.getElementById('page-title');
    var pages = {};
    TAB_ORDER.forEach(function (name) {
        pages[name] = document.getElementById('page-' + name);
    });

    var currentTab = null;

    function pageModule(name) {
        // 只有时间页还保留长按多选（行为页改为进详情页删除）
        return name === 'time' ? window.LivologTimePage : null;
    }

    /**
     * 把多选目标绑回某个标签页的列表：切页时、以及关掉详情页时都要做一次。
     * 切页时 currentTab 还没更新，所以要把目标页传进来。
     */
    function syncSelection(name) {
        if (!window.LivologUI) {
            return;
        }
        var module = pageModule(name || currentTab);
        window.LivologUI.bindSelection(module ? module.selection : null);
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
        syncSelection(name);

        if (titleEl) {
            // 标题文案复用导航词条，切语言时也能一起更新
            titleEl.setAttribute('data-i18n', 'nav.' + name);
            titleEl.textContent = window.LivologI18n ? window.LivologI18n.t('nav.' + name) : name;
        }

        if (changed && (!options || options.animate !== false)) {
            window.LivologUI.animateEnter(pages[name], direction);
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

    if (window.LivologI18n) {
        window.LivologI18n.init();
    }
    if (window.LivologTheme) {
        window.LivologTheme.init();
    }
    if (window.LivologUI) {
        window.LivologUI.init();
    }
    if (window.LivologBehaviorPage) {
        window.LivologBehaviorPage.init();
    }
    if (window.LivologBehaviorDetail) {
        window.LivologBehaviorDetail.init();
    }
    if (window.LivologTimePage) {
        window.LivologTimePage.init();
    }
    if (window.LivologMetricPage) {
        window.LivologMetricPage.init();
    }
    if (window.LivologMetricDetail) {
        window.LivologMetricDetail.init();
    }
    if (window.LivologSettingPage) {
        window.LivologSettingPage.init();
    }
    if (window.LivologDatePicker) {
        window.LivologDatePicker.init();
    }
    if (window.LivologUpdate) {
        window.LivologUpdate.init();
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
    window.Livolog = {
        selectTab: selectTab,
        syncSelection: syncSelection,
        TAB_ORDER: TAB_ORDER
    };
})();

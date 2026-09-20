/**
 * LifeLog - 行为详情页。
 *
 * 全屏覆盖在 app 之上，自带标题栏（返回 / 行为名称 / 菜单）与视图栏（记录 / 统计）。
 * 打开时往 history 里 push 一条记录，这样系统返回键、手势返回都能直接回来。
 */
(function (global) {
    'use strict';

    var VIEWS = ['records', 'stats'];
    var DEFAULT_VIEW = 'records';
    var ANIMATION_MS = 280;

    var root = null;
    var titleEl = null;
    var backBtn = null;
    var menuBtn = null;
    var viewLabel = null;
    var viewButton = null;
    var listEl = null;

    var deleteSheet = null;
    var deleteTip = null;
    var deleteInput = null;
    var deleteConfirm = null;

    var currentId = null;
    var currentView = DEFAULT_VIEW;
    var isOpen = false;

    function t(key) {
        return global.LifeLogI18n ? global.LifeLogI18n.t(key) : key;
    }

    function init() {
        root = document.getElementById('behavior-detail');
        titleEl = document.getElementById('detail-title');
        backBtn = document.getElementById('detail-back');
        menuBtn = document.getElementById('detail-menu');
        viewLabel = document.getElementById('detail-view-current');
        viewButton = document.getElementById('detail-view-button');
        listEl = document.getElementById('detail-list');

        deleteSheet = document.getElementById('sheet-delete-behavior');
        deleteTip = document.getElementById('delete-tip');
        deleteInput = document.getElementById('delete-confirm-input');
        deleteConfirm = document.getElementById('delete-confirm');

        backBtn.addEventListener('click', function () {
            close();
        });
        menuBtn.addEventListener('click', openActions);
        viewButton.addEventListener('click', openViewMenu);

        document.getElementById('delete-cancel').addEventListener('click', function () {
            global.LifeLogUI.closeSheet();
        });
        deleteInput.addEventListener('input', validateDelete);
        deleteInput.addEventListener('keydown', function (event) {
            if (event.key === 'Enter') {
                confirmDelete();
            }
        });
        deleteConfirm.addEventListener('click', confirmDelete);

        global.LifeLogStore.onChange(refresh);
        if (global.LifeLogI18n) {
            global.LifeLogI18n.onChange(refresh);
        }

        // 系统返回键 / 手势返回会触发 popstate，等价于点左上角返回
        global.addEventListener('popstate', function () {
            if (isOpen) {
                close({ history: false });
            }
        });
    }

    // --- 打开 / 关闭 --------------------------------------------------------

    function open(id) {
        var behavior = global.LifeLogStore.getBehavior(id);
        if (!behavior || isOpen) {
            return;
        }

        currentId = id;
        currentView = DEFAULT_VIEW;
        isOpen = true;

        root.hidden = false;
        refresh();

        global.requestAnimationFrame(function () {
            root.classList.add('is-open');
        });

        global.history.pushState({ lifelogBehavior: id }, '');
    }

    function close(options) {
        if (!isOpen) {
            return;
        }

        isOpen = false;
        currentId = null;

        global.LifeLogUI.closeSheet();
        root.classList.remove('is-open');

        global.setTimeout(function () {
            if (!isOpen) {
                root.hidden = true;
            }
        }, ANIMATION_MS);

        if (!options || options.history !== false) {
            global.history.back();
        }
    }

    // --- 渲染 ---------------------------------------------------------------

    function refresh() {
        if (!isOpen || !currentId) {
            return;
        }

        var behavior = global.LifeLogStore.getBehavior(currentId);
        if (!behavior) {
            // 行为被删掉了
            close();
            return;
        }

        titleEl.textContent = behavior.name;
        viewLabel.textContent = t('behavior.detail.' + currentView);
        renderList(behavior);
    }

    function renderList(behavior) {
        listEl.innerHTML = '';

        if (currentView === 'stats') {
            listEl.appendChild(global.LifeLogUI.emptyState(t('behavior.detail.statsEmpty')));
            return;
        }

        var records = global.LifeLogStore.getRecords().filter(function (record) {
            return record.behaviorId === behavior.id;
        });

        if (!records.length) {
            listEl.appendChild(global.LifeLogUI.emptyState(t('behavior.detail.empty')));
            return;
        }

        records.forEach(function (record) {
            var card = global.LifeLogUI.el('li', 'card');
            card.appendChild(global.LifeLogUI.icon(behavior.icon, 'card-icon'));
            card.appendChild(global.LifeLogUI.el('span', 'card-title', behavior.name));

            var time = global.LifeLogUI.el('span', 'card-time');
            time.appendChild(global.LifeLogUI.el(
                'span', 'card-time-date', global.LifeLogTimePage.dateLine(record)
            ));
            time.appendChild(global.LifeLogUI.el(
                'span', 'card-time-clock', global.LifeLogTimePage.clockLine(record)
            ));
            card.appendChild(time);

            listEl.appendChild(card);
        });
    }

    // --- 视图栏 -------------------------------------------------------------

    function openViewMenu() {
        var items = VIEWS.map(function (view) {
            return {
                value: view,
                label: t('behavior.detail.' + view),
                selected: view === currentView
            };
        });

        viewButton.setAttribute('aria-expanded', 'true');
        global.LifeLogUI.openMenu(viewButton, items, function (value) {
            viewButton.setAttribute('aria-expanded', 'false');
            if (value === currentView) {
                return;
            }
            currentView = value;
            refresh();
            global.LifeLogUI.animateEnter(listEl, value === 'stats' ? 1 : -1);
        });
    }

    // --- 菜单 ---------------------------------------------------------------

    function openActions() {
        menuBtn.setAttribute('aria-expanded', 'true');
        global.LifeLogUI.openMenu(menuBtn, [
            { value: 'rename', label: t('behavior.menu.rename') },
            { value: 'delete', label: t('behavior.menu.delete') }
        ], function (value) {
            menuBtn.setAttribute('aria-expanded', 'false');
            if (value === 'rename') {
                global.LifeLogBehaviorPage.openEdit(currentId);
            } else {
                openDeleteSheet();
            }
        });
    }

    // --- 删除（输入名称确认） -----------------------------------------------

    function openDeleteSheet() {
        var behavior = global.LifeLogStore.getBehavior(currentId);
        if (!behavior) {
            return;
        }

        deleteTip.textContent = t('behavior.delete.tip').replace('{name}', behavior.name);
        deleteInput.value = '';
        validateDelete();
        global.LifeLogUI.openSheet(deleteSheet);
    }

    function validateDelete() {
        var behavior = global.LifeLogStore.getBehavior(currentId);
        var typed = deleteInput.value.trim();
        deleteConfirm.disabled = !behavior || typed !== behavior.name;
    }

    function confirmDelete() {
        var behavior = global.LifeLogStore.getBehavior(currentId);
        if (!behavior || deleteInput.value.trim() !== behavior.name) {
            return;
        }

        global.LifeLogUI.closeSheet();
        // 连带删掉该行为名下的全部时间记录
        global.LifeLogStore.removeBehaviors([behavior.id]);
        global.LifeLogUI.toast(t('toast.deleted'));
        close();
    }

    global.LifeLogBehaviorDetail = {
        init: init,
        open: open,
        close: close,
        refresh: refresh,
        isOpen: function () {
            return isOpen;
        }
    };
})(window);

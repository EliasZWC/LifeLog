/**
 * Livolog - 通用 UI 组件：弹窗（底部表单）、下拉菜单、进入动画、DOM 小工具。
 */
(function (global) {
    'use strict';

    var ANIMATION_CLASSES = ['enter-forward', 'enter-backward'];
    var ANIMATION_MS = 260;
    var TRANSITION_MS = 220;

    var scrim = null;
    var currentSheet = null;
    var menuEl = null;

    // --- DOM 小工具 ---------------------------------------------------------

    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) {
            node.className = className;
        }
        if (text !== undefined && text !== null) {
            node.textContent = text;
        }
        return node;
    }

    /** 用图标库里的 path 生成一个 <span><svg/></span> */
    function icon(name, className) {
        var span = el('span', className || 'icon');
        span.setAttribute('aria-hidden', 'true');
        span.innerHTML = '<svg viewBox="0 0 24 24" focusable="false">' +
            global.LivologIcons.get(name) + '</svg>';
        return span;
    }

    function emptyState(text) {
        return el('li', 'empty-state', text);
    }

    function t(key) {
        return global.LivologI18n ? global.LivologI18n.t(key) : key;
    }

    // --- 轻提示 -------------------------------------------------------------

    var toastEl = null;
    var toastTimer = null;

    function toast(message) {
        if (!message) {
            return;
        }

        if (!toastEl) {
            toastEl = el('div', 'toast');
            document.body.appendChild(toastEl);
        }

        toastEl.textContent = message;
        toastEl.classList.remove('is-open');
        void toastEl.offsetWidth; // 重排一次，让连续提示也能重播动画
        toastEl.classList.add('is-open');

        if (toastTimer) {
            global.clearTimeout(toastTimer);
        }
        toastTimer = global.setTimeout(function () {
            toastEl.classList.remove('is-open');
        }, 2200);
    }

    // --- 原生壳通信 ---------------------------------------------------------

    /**
     * 原生通过 evaluateJavascript 调用这里，把系统栏尺寸与版本号推给网页。
     * 网页不依赖 env(safe-area-inset-*)，而是用这些变量自己让位，
     * 这样遮罩与弹窗能真正铺满整屏（包括状态栏那一条）。
     */
    var shell = {
        version: null,
        storagePath: '',
        storageError: '',

        setInsets: function (top, right, bottom, left, keyboard) {
            var style = document.documentElement.style;
            style.setProperty('--safe-top', top + 'px');
            style.setProperty('--safe-right', right + 'px');
            style.setProperty('--safe-bottom', bottom + 'px');
            style.setProperty('--safe-left', left + 'px');
            style.setProperty('--keyboard', keyboard + 'px');
        },

        setVersion: function (name, code) {
            shell.version = { name: String(name), code: code };
            if (global.LivologSettingPage && global.LivologSettingPage.refreshVersion) {
                global.LivologSettingPage.refreshVersion();
            }
        },

        getVersion: function () {
            return shell.version;
        },

        /** 原生读完 Livolog/records.csv 后把内容与路径推过来 */
        onStorageReady: function (csv, path) {
            shell.storagePath = path || '';
            refreshStorageUi();
            if (global.LivologStore && global.LivologStore.applyStoredCsv) {
                global.LivologStore.applyStoredCsv(csv);
            }
        },

        /** 落盘结果 */
        onCsvSaved: function (ok, detail) {
            if (ok) {
                shell.storagePath = detail || shell.storagePath;
                shell.storageError = '';
            } else {
                shell.storageError = detail || 'error';
                toast(t('toast.saveFailed') + ': ' + shell.storageError);
            }
            refreshStorageUi();
        },

        /** 原生读完 metrics.csv 后把内容推过来（与 records.csv 同一个目录） */
        onMetricsReady: function (csv) {
            if (global.LivologMetrics && global.LivologMetrics.applyStoredCsv) {
                global.LivologMetrics.applyStoredCsv(csv);
            }
        },

        onMetricsSaved: function (ok, detail) {
            if (!ok) {
                toast(t('toast.saveFailed') + ': ' + (detail || 'error'));
            }
        },

        /** 只换目录、内容不变（例如切到新文件夹后的回推），不动现有数据 */
        onStoragePathChanged: function (path) {
            shell.storagePath = path || '';
            shell.storageError = '';
            refreshStorageUi();
        },

        getStoragePath: function () {
            return shell.storagePath;
        },

        getStorageError: function () {
            return shell.storageError;
        },

        /** 设置页「导出数据」的结果（原生写完后回推） */
        onExported: function (ok, detail) {
            if (!ok) {
                toast(t('toast.exportFailed').replace('{reason}', detail || ''));
                return;
            }
            if (detail) {
                toast(t('toast.exported').replace('{path}', detail));
            } else {
                toast(t('toast.exportCanceled'));
            }
        },

        // --- 应用内更新（实现在 update.js） ---------------------------------

        onUpdateAvailable: function (version, current, size, stalled) {
            if (global.LivologUpdate) {
                global.LivologUpdate.onAvailable(version, current, size, stalled);
            }
        },

        onUpdateProgress: function (percent) {
            if (global.LivologUpdate) {
                global.LivologUpdate.onProgress(percent);
            }
        },

        onUpdateReady: function () {
            if (global.LivologUpdate) {
                global.LivologUpdate.onReady();
            }
        },

        onUpdateFailed: function (reason, downloaded) {
            if (global.LivologUpdate) {
                global.LivologUpdate.onFailed(reason, downloaded);
            }
        },

        /** 语言切换时刷新更新弹窗里的文案 */
        refreshUpdate: function () {
            if (global.LivologUpdate) {
                global.LivologUpdate.refresh();
            }
        }
    };

    function refreshStorageUi() {
        if (global.LivologSettingPage && global.LivologSettingPage.refreshStoragePath) {
            global.LivologSettingPage.refreshStoragePath();
        }
    }

    global.LivologShell = shell;

    // --- 自定义下拉选择器 ---------------------------------------------------

    var CHEVRON_PATH = '<path d="M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z"/>';

    /**
     * 用自绘控件替代原生 <select>（原生在 WebView 里弹出的是系统样式，无法统一风格）。
     *
     * @param {HTMLElement} mount 容器，会被清空并填入按钮
     * @param {object} config
     *   getOptions:  () => [{ value, label }]
     *   getValue:    () => string
     *   onChange:    (value) => void
     *   isDisabled?: () => boolean
     *   placeholder?: () => string   当前值没有对应项时显示的文字
     * @returns {{ refresh: () => void }}
     */
    function createSelect(mount, config) {
        mount.innerHTML = '';

        var button = el('button', 'form-select');
        button.type = 'button';
        button.setAttribute('aria-haspopup', 'listbox');
        button.setAttribute('aria-expanded', 'false');

        var label = el('span', 'form-select-label');
        button.appendChild(label);
        mount.appendChild(button);

        var chevron = el('span', 'select-chevron');
        chevron.setAttribute('aria-hidden', 'true');
        chevron.innerHTML = '<svg viewBox="0 0 24 24" focusable="false">' + CHEVRON_PATH + '</svg>';
        mount.appendChild(chevron);

        function current() {
            var value = config.getValue();
            var found = null;
            (config.getOptions() || []).forEach(function (option) {
                if (option.value === value && found === null) {
                    found = option;
                }
            });
            return found;
        }

        function refresh() {
            var found = current();
            label.textContent = found
                ? found.label
                : (config.placeholder ? config.placeholder() : '');
            label.classList.toggle('is-placeholder', !found);
            button.disabled = config.isDisabled ? !!config.isDisabled() : false;
        }

        button.addEventListener('click', function () {
            if (button.disabled) {
                return;
            }

            var value = config.getValue();
            var items = (config.getOptions() || []).map(function (option) {
                return {
                    value: option.value,
                    label: option.label,
                    selected: option.value === value
                };
            });

            if (!items.length) {
                return;
            }

            button.setAttribute('aria-expanded', 'true');
            openMenu(button, items, function (next) {
                button.setAttribute('aria-expanded', 'false');
                config.onChange(next);
                // 选完必须自己刷一次按钮文字，否则上面还挂着旧值
                // （onChange 里多半只是改数据 / 重画表单，不会回头照顾这个按钮）
                refresh();
            });
        });

        refresh();

        return { refresh: refresh };
    }

    /**
     * 「整行可点」的设置项选择器：左边名称、右边当前值，点整行弹下拉菜单。
     * 设置页用它；表单里就地显示下拉控件的地方仍用 createSelect。
     *
     * @param {HTMLElement} row 可点击的整行
     * @param {HTMLElement} valueEl 显示当前值的元素
     * @param {object} config 同 createSelect
     */
    function createRowPicker(row, valueEl, config) {
        function refresh() {
            var value = config.getValue();
            var found = null;
            (config.getOptions() || []).forEach(function (option) {
                if (option.value === value && found === null) {
                    found = option;
                }
            });

            valueEl.textContent = found
                ? found.label
                : (config.placeholder ? config.placeholder() : '');
            row.disabled = config.isDisabled ? !!config.isDisabled() : false;
        }

        row.addEventListener('click', function () {
            if (row.disabled) {
                return;
            }

            var value = config.getValue();
            var items = (config.getOptions() || []).map(function (option) {
                return {
                    value: option.value,
                    label: option.label,
                    selected: option.value === value
                };
            });

            if (!items.length) {
                return;
            }

            row.setAttribute('aria-expanded', 'true');
            openMenu(row, items, function (next) {
                row.setAttribute('aria-expanded', 'false');
                config.onChange(next);
            });
        });

        refresh();

        return { refresh: refresh };
    }

    /**
     * 图标选择器：行内只显示当前选中的图标，点一下弹出一整块图标面板。
     * 图标多了以后横向滑条太长，所以改成「点开再选」。
     * @param {HTMLElement} mount 容器，会被清空
     * @returns {{ select: (name: string) => void, getSelected: () => string }}
     */
    function createIconPicker(mount) {
        var names = global.LivologIcons.names();
        var selected = names[0];

        mount.innerHTML = '';

        var trigger = el('button', 'icon-trigger');
        trigger.type = 'button';
        trigger.setAttribute('aria-haspopup', 'dialog');
        trigger.setAttribute('aria-expanded', 'false');
        trigger.appendChild(icon(selected, 'icon-trigger-icon'));
        var chevron = el('span', 'select-chevron');
        chevron.setAttribute('aria-hidden', 'true');
        chevron.innerHTML = '<svg viewBox="0 0 24 24" focusable="false">' + CHEVRON_PATH + '</svg>';
        trigger.appendChild(chevron);
        mount.appendChild(trigger);

        var panel = el('div', 'icon-panel');
        panel.setAttribute('role', 'dialog');
        panel.hidden = true;

        var toolbar = el('div', 'icon-panel-head');
        toolbar.appendChild(el('span', 'icon-panel-title', t('icon.pick')));
        var closeButton = el('button', 'icon-button');
        closeButton.type = 'button';
        closeButton.setAttribute('aria-label', t('action.close'));
        closeButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
            '<path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>' +
            '</svg>';
        toolbar.appendChild(closeButton);
        panel.appendChild(toolbar);

        var grid = el('div', 'icon-grid');
        names.forEach(function (name) {
            var button = el('button', 'icon-option');
            button.type = 'button';
            button.dataset.icon = name;
            button.setAttribute('aria-label', name);
            button.appendChild(icon(name));
            button.addEventListener('click', function () {
                select(name);
                close();
            });
            grid.appendChild(button);
        });
        panel.appendChild(grid);
        mount.appendChild(panel);

        function reflect() {
            trigger.replaceChild(icon(selected, 'icon-trigger-icon'), trigger.firstChild);
            Array.prototype.forEach.call(grid.children, function (button) {
                button.classList.toggle('is-selected', button.dataset.icon === selected);
            });
        }

        function open() {
            panel.hidden = false;
            trigger.setAttribute('aria-expanded', 'true');
            // 选中的那个滚进可视区
            var active = null;
            Array.prototype.forEach.call(grid.children, function (button) {
                if (button.dataset.icon === selected) active = button;
            });
            if (active && active.scrollIntoView) {
                active.scrollIntoView({ block: 'center' });
            }
        }

        function close() {
            panel.hidden = true;
            trigger.setAttribute('aria-expanded', 'false');
        }

        function select(name) {
            if (names.indexOf(name) < 0) {
                return;
            }
            selected = name;
            reflect();
        }

        trigger.addEventListener('click', function () {
            if (panel.hidden) {
                open();
            } else {
                close();
            }
        });
        closeButton.addEventListener('click', close);

        // 切语言时「选择图标」与关闭按钮的无障碍文案要跟着变
        if (global.LivologI18n) {
            global.LivologI18n.onChange(function () {
                panel.querySelector('.icon-panel-title').textContent = t('icon.pick');
                closeButton.setAttribute('aria-label', t('action.close'));
            });
        }

        reflect();

        return {
            select: select,
            getSelected: function () {
                return selected;
            }
        };
    }

    // --- 长按 ---------------------------------------------------------------

    var LONG_PRESS_MS = 500;
    var longPressAt = 0;

    function attachLongPress(element, handler) {
        var timer = null;

        function cancel() {
            if (timer) {
                global.clearTimeout(timer);
                timer = null;
            }
        }

        function start() {
            cancel();
            timer = global.setTimeout(function () {
                timer = null;
                longPressAt = Date.now();
                handler();
            }, LONG_PRESS_MS);
        }

        element.addEventListener('touchstart', start, { passive: true });
        element.addEventListener('touchend', cancel);
        element.addEventListener('touchmove', cancel);
        element.addEventListener('touchcancel', cancel);
        element.addEventListener('mousedown', start);
        element.addEventListener('mouseup', cancel);
        element.addEventListener('mouseleave', cancel);
    }

    /** 长按之后紧跟的那次 click 要忽略掉 */
    function justLongPressed() {
        return Date.now() - longPressAt < 400;
    }

    // --- 长按拖动排序 -------------------------------------------------------

    var SORT_HOLD_MS = 350;
    /** 长按期间手指/鼠标移动超过这个距离就当成滚动，不算长按 */
    var SORT_MOVE_TOLERANCE = 8;

    /**
     * 让列表里的卡片可以长按后拖动排序。
     * 拖动过程中就地重排（相邻卡片直接换位，不做位移补间），松手时把新顺序回调出去，
     * 由调用方写回数据层。
     *
     * @param {HTMLElement} list 列表容器（只处理它的直接子元素）
     * @param {object} config
     *   itemSelector?: string 默认 '.card'
     *   onDrop: (ids: Array<string>) => void
     */
    function attachSortable(list, config) {
        var itemSelector = config.itemSelector || '.card';
        var holdTimer = null;
        var dragEl = null;
        var pointerId = null;
        var startY = 0;
        var draggedAt = 0;

        function cards() {
            return Array.prototype.filter.call(list.children, function (child) {
                return child.matches && child.matches(itemSelector);
            });
        }

        function stopHold() {
            if (holdTimer) {
                global.clearTimeout(holdTimer);
                holdTimer = null;
            }
        }

        /** 拖动期间不让页面跟着滚：touch-action 在触摸开始后就改不动了，只能拦 touchmove */
        function preventScroll(event) {
            event.preventDefault();
        }

        /** 把被拖的卡片插到手指所在的位置 */
        function moveTo(y) {
            var siblings = cards();
            var target = null;

            siblings.forEach(function (card) {
                if (card === dragEl || target) {
                    return;
                }
                var box = card.getBoundingClientRect();
                if (y < box.top + box.height / 2) {
                    target = card;
                }
            });

            if (target) {
                if (target.previousElementSibling !== dragEl) {
                    list.insertBefore(dragEl, target);
                }
            } else if (siblings.length && siblings[siblings.length - 1] !== dragEl) {
                list.appendChild(dragEl);
            }
        }

        function startDrag(event) {
            var card = event.target.closest ? event.target.closest(itemSelector) : null;
            if (!card || !list.contains(card)) {
                return;
            }

            dragEl = card;
            pointerId = event.pointerId;
            card.classList.add('is-dragging');
            list.classList.add('is-sorting');
            document.addEventListener('touchmove', preventScroll, { passive: false });
        }

        function stopDrag(commit) {
            document.removeEventListener('touchmove', preventScroll);
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
            document.removeEventListener('pointercancel', onUp);
            list.classList.remove('is-sorting');
            stopHold();

            var dragged = dragEl;
            dragEl = null;
            pointerId = null;

            if (!dragged) {
                return;
            }

            dragged.classList.remove('is-dragging');
            draggedAt = Date.now();

            if (commit !== false && config.onDrop) {
                config.onDrop(cards().map(function (card) {
                    return card.dataset.id;
                }));
            }
        }

        function onMove(event) {
            if (dragEl && (pointerId === null || event.pointerId === pointerId)) {
                moveTo(event.clientY);
            }
        }

        function onUp() {
            if (dragEl) {
                stopDrag(true);
            }
        }

        list.addEventListener('pointerdown', function (event) {
            if (dragEl || holdTimer) {
                return;
            }
            if (event.button !== undefined && event.button !== 0) {
                return;
            }
            if (!event.target.closest || !event.target.closest(itemSelector)) {
                return;
            }

            startY = event.clientY;
            var seed = event;
            holdTimer = global.setTimeout(function () {
                holdTimer = null;
                startDrag(seed);
                if (dragEl) {
                    document.addEventListener('pointermove', onMove);
                    document.addEventListener('pointerup', onUp);
                    document.addEventListener('pointercancel', onUp);
                }
            }, SORT_HOLD_MS);
        });

        // 还没到长按时间就开始移动 = 用户在滚动列表
        list.addEventListener('pointermove', function (event) {
            if (holdTimer && Math.abs(event.clientY - startY) > SORT_MOVE_TOLERANCE) {
                stopHold();
            }
        });

        list.addEventListener('pointerup', stopHold);
        list.addEventListener('pointercancel', stopHold);

        // 拖完紧跟的那次 click 不能触发卡片的正常点击（否则会点进详情页）
        list.addEventListener('click', function (event) {
            if (Date.now() - draggedAt < 400) {
                event.preventDefault();
                event.stopPropagation();
            }
        }, true);
    }

    // --- 进入动画 -----------------------------------------------------------

    /** direction < 0 从左侧进入，否则从右侧进入 */
    function animateEnter(element, direction) {
        if (!element) {
            return;
        }

        ANIMATION_CLASSES.forEach(function (className) {
            element.classList.remove(className);
        });
        void element.offsetWidth; // 强制重排，保证连续切换时动画能重播

        var className = direction < 0 ? 'enter-backward' : 'enter-forward';
        element.classList.add(className);

        global.setTimeout(function () {
            element.classList.remove(className);
        }, ANIMATION_MS);
    }

    // --- 弹窗 ---------------------------------------------------------------

    function openSheet(sheet) {
        if (!sheet) {
            return;
        }
        closeMenu();
        hideSheet(currentSheet, true);

        currentSheet = sheet;
        scrim.hidden = false;
        sheet.hidden = false;

        global.requestAnimationFrame(function () {
            scrim.classList.add('is-open');
            sheet.classList.add('is-open');
        });
    }

    function closeSheet() {
        hideSheet(currentSheet, false);
        currentSheet = null;
    }

    function hideSheet(sheet, immediate) {
        if (!sheet) {
            return;
        }

        sheet.classList.remove('is-open');
        scrim.classList.remove('is-open');

        if (immediate) {
            sheet.hidden = true;
            if (!currentSheet) {
                scrim.hidden = true;
            }
            return;
        }

        global.setTimeout(function () {
            sheet.hidden = true;
            if (!currentSheet) {
                scrim.hidden = true;
            }
        }, TRANSITION_MS);
    }

    // --- 下拉菜单 -----------------------------------------------------------

    function onDocumentPointerDown(event) {
        if (menuEl && !menuEl.contains(event.target)) {
            closeMenu();
        }
    }

    function closeMenu() {
        if (!menuEl) {
            return;
        }

        var node = menuEl;
        menuEl = null;

        node.classList.remove('is-open');
        document.removeEventListener('pointerdown', onDocumentPointerDown, true);
        global.removeEventListener('scroll', closeMenu, true);

        global.setTimeout(function () {
            if (node.parentNode) {
                node.parentNode.removeChild(node);
            }
        }, TRANSITION_MS);
    }

    /**
     * 在 anchor 下方弹出菜单。
     * @param {Element} anchor
     * @param {Array<{value:string,label:string,selected?:boolean}>} items
     * @param {(value:string)=>void} onSelect
     */
    function openMenu(anchor, items, onSelect) {
        closeMenu();

        var node = el('div', 'menu');
        node.setAttribute('role', 'menu');

        items.forEach(function (item) {
            var button = el('button', 'menu-item', item.label);
            button.type = 'button';
            button.setAttribute('role', 'menuitem');
            if (item.selected) {
                button.classList.add('is-selected');
            }
            button.addEventListener('click', function () {
                closeMenu();
                onSelect(item.value);
            });
            node.appendChild(button);
        });

        document.body.appendChild(node);
        menuEl = node;

        var rect = anchor.getBoundingClientRect();
        var width = node.offsetWidth;
        var left = Math.min(rect.right - width, global.innerWidth - width - 8);
        node.style.left = Math.max(8, left) + 'px';
        node.style.top = (rect.bottom + 6) + 'px';

        global.requestAnimationFrame(function () {
            node.classList.add('is-open');
        });

        global.setTimeout(function () {
            document.addEventListener('pointerdown', onDocumentPointerDown, true);
            global.addEventListener('scroll', closeMenu, true);
        }, 0);
    }

    // --- 卡片多选 -----------------------------------------------------------

    var selection = {
        active: false,
        ids: [],
        provider: null
    };

    var selectionBar = null;
    var selectionCount = null;

    /** 每页注册自己的回调；切页时由 app.js 重新绑定 */
    function bindSelection(provider) {
        selection.provider = provider || null;
        clearSelection();
    }

    function isSelecting() {
        return selection.active;
    }

    function isSelected(id) {
        return selection.ids.indexOf(id) >= 0;
    }

    function notifySelection() {
        if (selection.provider && selection.provider.onSelectionChange) {
            selection.provider.onSelectionChange();
        }
    }

    function openSelectionBar() {
        if (!selectionBar) {
            return;
        }
        selectionBar.hidden = false;
        global.requestAnimationFrame(function () {
            selectionBar.classList.add('is-open');
        });
    }

    function closeSelectionBar() {
        if (!selectionBar) {
            return;
        }
        selectionBar.classList.remove('is-open');
        global.setTimeout(function () {
            if (!selection.active) {
                selectionBar.hidden = true;
            }
        }, TRANSITION_MS);
    }

    function updateSelectionCount() {
        if (selectionCount) {
            selectionCount.textContent = t('selection.count').replace('{n}', String(selection.ids.length));
        }
    }

    function startSelection(id) {
        if (!selection.provider || selection.active) {
            return;
        }
        selection.active = true;
        selection.ids = id ? [id] : [];
        updateSelectionCount();
        openSelectionBar();
        notifySelection();
    }

    function toggleSelection(id) {
        if (!selection.active) {
            return;
        }

        var index = selection.ids.indexOf(id);
        if (index >= 0) {
            selection.ids.splice(index, 1);
        } else {
            selection.ids.push(id);
        }

        if (!selection.ids.length) {
            clearSelection();
            return;
        }

        updateSelectionCount();
        notifySelection();
    }

    function clearSelection() {
        var wasActive = selection.active;
        selection.active = false;
        selection.ids = [];
        if (wasActive) {
            closeSelectionBar();
        }
        notifySelection();
    }

    function deleteSelected() {
        var ids = selection.ids.slice();
        var provider = selection.provider;

        selection.active = false;
        selection.ids = [];
        closeSelectionBar();

        if (provider && provider.onDelete) {
            provider.onDelete(ids);
        }
    }

    // --- 初始化 -------------------------------------------------------------

    function init() {
        scrim = document.getElementById('scrim');
        if (scrim) {
            scrim.addEventListener('click', closeSheet);
        }

        selectionBar = document.getElementById('selection-bar');
        selectionCount = document.getElementById('selection-count');
        if (selectionBar) {
            var closeButton = document.getElementById('selection-close');
            var deleteButton = document.getElementById('selection-delete');
            if (closeButton) {
                closeButton.addEventListener('click', clearSelection);
            }
            if (deleteButton) {
                deleteButton.addEventListener('click', deleteSelected);
            }
        }

        document.addEventListener('keydown', function (event) {
            if (event.key !== 'Escape') {
                return;
            }
            if (menuEl) {
                closeMenu();
            } else if (currentSheet) {
                closeSheet();
            }
        });
    }

    global.LivologUI = {
        init: init,
        el: el,
        icon: icon,
        emptyState: emptyState,
        t: t,
        animateEnter: animateEnter,
        createSelect: createSelect,
        createRowPicker: createRowPicker,
        createIconPicker: createIconPicker,
        attachLongPress: attachLongPress,
        justLongPressed: justLongPressed,
        attachSortable: attachSortable,
        toast: toast,
        openSheet: openSheet,
        closeSheet: closeSheet,
        isSheetOpen: function () {
            return !!currentSheet;
        },
        currentSheet: function () {
            return currentSheet;
        },
        openMenu: openMenu,
        closeMenu: closeMenu,
        bindSelection: bindSelection,
        isSelecting: isSelecting,
        isSelected: isSelected,
        startSelection: startSelection,
        toggleSelection: toggleSelection,
        clearSelection: clearSelection
    };
})(window);

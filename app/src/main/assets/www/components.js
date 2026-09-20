/**
 * LifeLog - 通用 UI 组件：弹窗（底部表单）、下拉菜单、进入动画、DOM 小工具。
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
            global.LifeLogIcons.get(name) + '</svg>';
        return span;
    }

    function emptyState(text) {
        return el('li', 'empty-state', text);
    }

    function t(key) {
        return global.LifeLogI18n ? global.LifeLogI18n.t(key) : key;
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
            if (global.LifeLogSettingPage && global.LifeLogSettingPage.refreshVersion) {
                global.LifeLogSettingPage.refreshVersion();
            }
        },

        getVersion: function () {
            return shell.version;
        },

        /** 原生读完 LifeLog/records.csv 后把内容与路径推过来 */
        onStorageReady: function (csv, path) {
            shell.storagePath = path || '';
            refreshStorageUi();
            if (global.LifeLogStore && global.LifeLogStore.applyStoredCsv) {
                global.LifeLogStore.applyStoredCsv(csv);
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
            if (global.LifeLogMetrics && global.LifeLogMetrics.applyStoredCsv) {
                global.LifeLogMetrics.applyStoredCsv(csv);
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

        onUpdateAvailable: function (version, current, size) {
            if (global.LifeLogUpdate) {
                global.LifeLogUpdate.onAvailable(version, current, size);
            }
        },

        onUpdateProgress: function (percent) {
            if (global.LifeLogUpdate) {
                global.LifeLogUpdate.onProgress(percent);
            }
        },

        onUpdateReady: function () {
            if (global.LifeLogUpdate) {
                global.LifeLogUpdate.onReady();
            }
        },

        onUpdateFailed: function (reason, downloaded) {
            if (global.LifeLogUpdate) {
                global.LifeLogUpdate.onFailed(reason, downloaded);
            }
        },

        /** 语言切换时刷新更新弹窗里的文案 */
        refreshUpdate: function () {
            if (global.LifeLogUpdate) {
                global.LifeLogUpdate.refresh();
            }
        }
    };

    function refreshStorageUi() {
        if (global.LifeLogSettingPage && global.LifeLogSettingPage.refreshStoragePath) {
            global.LifeLogSettingPage.refreshStoragePath();
        }
    }

    global.LifeLogShell = shell;

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
     * 图标选择器（横向滚动的图标条），行为表单与跟踪表单共用。
     * @param {HTMLElement} mount 容器，会被清空
     * @param {string} [initial] 初始选中的图标名
     * @returns {{ select: (name: string) => void, getSelected: () => string }}
     */
    function createIconPicker(mount, initial) {
        var names = global.LifeLogIcons.names();
        var selected = null;

        mount.innerHTML = '';
        names.forEach(function (name) {
            var button = el('button', 'icon-option');
            button.type = 'button';
            button.dataset.icon = name;
            button.setAttribute('aria-label', name);
            button.appendChild(icon(name));
            button.addEventListener('click', function () {
                select(name);
            });
            mount.appendChild(button);
        });

        function select(name) {
            selected = name;
            Array.prototype.forEach.call(mount.children, function (button) {
                button.classList.toggle('is-selected', button.dataset.icon === name);
            });
        }

        select(names.indexOf(initial) >= 0 ? initial : names[0]);

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

    global.LifeLogUI = {
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

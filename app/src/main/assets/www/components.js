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

    // --- 初始化 -------------------------------------------------------------

    function init() {
        scrim = document.getElementById('scrim');
        if (scrim) {
            scrim.addEventListener('click', closeSheet);
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
        animateEnter: animateEnter,
        openSheet: openSheet,
        closeSheet: closeSheet,
        isSheetOpen: function () {
            return !!currentSheet;
        },
        currentSheet: function () {
            return currentSheet;
        },
        openMenu: openMenu,
        closeMenu: closeMenu
    };
})(window);

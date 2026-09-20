/**
 * Livolog - 主题偏好。
 *
 * 三种模式：
 *   'light' / 'dark'  -> 在 <html> 上写 data-theme，覆盖系统配色
 *   'system'          -> 不写 data-theme，交给 CSS 的 prefers-color-scheme
 *
 * 生效后会通过 LivologNative.setThemeMode() 通知原生层，
 * 让状态栏图标颜色和窗口背景跟着一起变。
 */
(function (global) {
    'use strict';

    var STORAGE_KEY = 'livolog.theme';
    var MODES = ['light', 'dark', 'system'];
    var DEFAULT_MODE = 'system';

    // 与 styles.css 里的 --bg 保持一致
    var BACKGROUND = { light: '#EFEFED', dark: '#1E1E1E' };

    var mode = DEFAULT_MODE;
    var listeners = [];

    function normalize(value) {
        return MODES.indexOf(value) >= 0 ? value : DEFAULT_MODE;
    }

    function prefersDark() {
        return !!(global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches);
    }

    /** 当前实际生效的外观：'light' | 'dark' */
    function resolved() {
        return mode === 'system' ? (prefersDark() ? 'dark' : 'light') : mode;
    }

    function apply() {
        var root = document.documentElement;

        if (mode === 'system') {
            root.removeAttribute('data-theme');
        } else {
            root.setAttribute('data-theme', mode);
        }

        var meta = document.querySelector('meta[name="theme-color"]');
        if (meta) {
            meta.setAttribute('content', BACKGROUND[resolved()]);
        }
    }

    function notifyNative() {
        try {
            if (global.LivologNative && typeof global.LivologNative.setThemeMode === 'function') {
                global.LivologNative.setThemeMode(mode);
            }
        } catch (e) {
            /* 非 Android（例如浏览器预览）环境，忽略 */
        }
    }

    function emit() {
        listeners.forEach(function (listener) {
            listener(mode, resolved());
        });
    }

    function setMode(next) {
        mode = normalize(next);

        try {
            localStorage.setItem(STORAGE_KEY, mode);
        } catch (e) {
            /* 隐私模式下忽略 */
        }

        apply();
        notifyNative();
        emit();
        return mode;
    }

    function init() {
        var saved = null;
        try {
            saved = localStorage.getItem(STORAGE_KEY);
        } catch (e) {
            /* 忽略 */
        }
        mode = normalize(saved);
        apply();
        notifyNative();

        // 处于「跟随系统」时，系统深浅色切换需要重新同步
        if (global.matchMedia) {
            var query = global.matchMedia('(prefers-color-scheme: dark)');
            var onSystemChange = function () {
                if (mode !== 'system') {
                    return;
                }
                apply();
                notifyNative();
                emit();
            };

            if (typeof query.addEventListener === 'function') {
                query.addEventListener('change', onSystemChange);
            } else if (typeof query.addListener === 'function') {
                query.addListener(onSystemChange);
            }
        }

        return mode;
    }

    global.LivologTheme = {
        MODES: MODES,
        DEFAULT_MODE: DEFAULT_MODE,
        init: init,
        setMode: setMode,
        getMode: function () {
            return mode;
        },
        resolved: resolved,
        onChange: function (listener) {
            listeners.push(listener);
        }
    };
})(window);

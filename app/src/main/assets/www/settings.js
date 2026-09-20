/**
 * LifeLog - 设置页。
 *
 * 每项设置都是「左标题 + 右下拉框」的列表行。
 * 下拉框用 LifeLogUI.createSelect 自绘，以统一 app 风格（原生 select 会弹系统样式）。
 * 新增设置项只要往 HANDLERS 里加一条即可。
 */
(function (global) {
    'use strict';

    var HANDLERS = {
        theme: {
            mount: 'setting-theme',
            getOptions: function () {
                return [
                    { value: 'light', label: t('settings.theme.light') },
                    { value: 'dark', label: t('settings.theme.dark') },
                    { value: 'system', label: t('settings.theme.system') }
                ];
            },
            getValue: function () {
                return global.LifeLogTheme.getMode();
            },
            setValue: function (value) {
                global.LifeLogTheme.setMode(value);
            }
        }
    };

    var selects = {};

    function t(key) {
        return global.LifeLogI18n ? global.LifeLogI18n.t(key) : key;
    }

    function init() {
        Object.keys(HANDLERS).forEach(function (name) {
            var handler = HANDLERS[name];
            var mount = document.getElementById(handler.mount);
            if (!mount) {
                return;
            }

            selects[name] = global.LifeLogUI.createSelect(mount, {
                getOptions: handler.getOptions,
                getValue: handler.getValue,
                onChange: function (value) {
                    handler.setValue(value);
                    refresh();
                },
                placeholder: handler.placeholder
            });
        });

        // 被其它入口改动时保持控件同步
        global.LifeLogTheme.onChange(refresh);
        if (global.LifeLogI18n) {
            global.LifeLogI18n.onChange(refresh);
        }

        refreshVersion();
    }

    function refresh() {
        Object.keys(selects).forEach(function (name) {
            selects[name].refresh();
        });
    }

    /** 版本号由原生壳通过 LifeLogShell.setVersion 推过来，保证与 build.gradle.kts 单一来源 */
    function refreshVersion() {
        var node = document.getElementById('setting-version');
        if (!node) {
            return;
        }
        var version = global.LifeLogShell ? global.LifeLogShell.getVersion() : null;
        node.textContent = version ? version.name + ' (' + version.code + ')' : '—';
    }

    global.LifeLogSettings = {
        init: init,
        refreshVersion: refreshVersion
    };
})(window);

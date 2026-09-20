/**
 * LifeLog - 设置页。
 *
 * 按分区列出设置项（个性化 / 数据管理 / 关于）：
 * - 下拉框用 LifeLogUI.createSelect 自绘，以统一 app 风格（原生 select 会弹系统样式）
 * - 导入 CSV 用一个隐藏的 <input type="file">，原生 WebChromeClient 会接管选文件
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
            global.LifeLogI18n.onChange(function () {
                refresh();
                refreshStoragePath();
            });
        }

        var importButton = document.getElementById('setting-import');
        var fileInput = document.getElementById('setting-import-file');
        if (importButton && fileInput) {
            importButton.addEventListener('click', function () {
                fileInput.click();
            });
            fileInput.addEventListener('change', handleFile);
        }

        refreshVersion();
        refreshStoragePath();
    }

    /** 选完 CSV 后直接在前端解析，不绕原生（原生只负责拉起选择器） */
    function handleFile(event) {
        var input = event.target;
        var file = input.files && input.files[0];
        input.value = ''; // 同一个文件也能重复选
        if (!file) {
            return;
        }

        var reader = new FileReader();
        reader.onload = function () {
            var result = global.LifeLogStore.importCsvText(String(reader.result || ''));
            if (!result.ok) {
                global.LifeLogUI.toast(
                    t('toast.importFailed').replace('{reason}', result.error || '')
                );
                return;
            }
            if (!result.count) {
                global.LifeLogUI.toast(t('toast.importEmpty'));
                return;
            }
            global.LifeLogUI.toast(t('toast.imported').replace('{n}', String(result.count)));
        };
        reader.onerror = function () {
            global.LifeLogUI.toast(t('toast.importFailed').replace('{reason}', 'read'));
        };
        reader.readAsText(file);
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
        // 只显示版本名，形如 0.0.6
        node.textContent = version ? version.name : '—';
    }

    /** CSV 数据库文件的落盘位置，由原生壳推送 */
    function refreshStoragePath() {
        var node = document.getElementById('setting-storage-path');
        if (!node) {
            return;
        }
        var path = global.LifeLogShell ? global.LifeLogShell.getStoragePath() : '';
        node.textContent = path || t('settings.import.empty');
    }

    global.LifeLogSettings = {
        init: init,
        refreshVersion: refreshVersion,
        refreshStoragePath: refreshStoragePath
    };
})(window);

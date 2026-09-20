/**
 * LifeLog - 设置页。
 *
 * 按分区列出设置项（通用 / 数据管理 / 关于）：
 * - 每项都是统一的「左名称 / 右当前值」行，点整行才弹出选项（LifeLogUI.createRowPicker）
 * - 导入 CSV 用一个隐藏的 <input type="file">，原生 WebChromeClient 会接管选文件
 */
(function (global) {
    'use strict';

    /** 联系邮箱（设置页「关于 → 联系」） */
    var CONTACT_EMAIL = 'eliaschang@163.com';

    var HANDLERS = {
        language: {
            mount: 'setting-language',
            value: 'setting-language-value',
            getOptions: function () {
                return [
                    { value: 'en', label: t('setting.language.en') },
                    { value: 'zh', label: t('setting.language.zh') }
                ];
            },
            getValue: function () {
                return global.LifeLogI18n.getLocale();
            },
            setValue: function (value) {
                global.LifeLogI18n.setLocale(value);
            }
        },
        theme: {
            mount: 'setting-theme',
            value: 'setting-theme-value',
            getOptions: function () {
                return [
                    { value: 'light', label: t('setting.theme.light') },
                    { value: 'dark', label: t('setting.theme.dark') },
                    { value: 'system', label: t('setting.theme.system') }
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

    var rowPickers = {};

    function t(key) {
        return global.LifeLogI18n ? global.LifeLogI18n.t(key) : key;
    }

    function init() {
        Object.keys(HANDLERS).forEach(function (name) {
            var handler = HANDLERS[name];
            var mount = document.getElementById(handler.mount);
            var valueEl = document.getElementById(handler.value);
            if (!mount || !valueEl) {
                return;
            }

            rowPickers[name] = global.LifeLogUI.createRowPicker(mount, valueEl, {
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
                if (global.LifeLogShell && global.LifeLogShell.refreshUpdate) {
                    global.LifeLogShell.refreshUpdate();
                }
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

        var exportButton = document.getElementById('setting-export');
        if (exportButton) {
            exportButton.addEventListener('click', handleExport);
        }

        var storageRow = document.getElementById('setting-storage');
        if (storageRow) {
            // 点一下换文件夹；长按恢复默认（自定义位置时才有意义）
            storageRow.addEventListener('click', function () {
                if (global.LifeLogUI.justLongPressed()) {
                    return;
                }
                pickStorageFolder();
            });
            global.LifeLogUI.attachLongPress(storageRow, function () {
                resetStorageFolder();
            });
        }

        var contactRow = document.getElementById('setting-contact');
        var contactValue = document.getElementById('setting-contact-value');
        if (contactValue) {
            contactValue.textContent = CONTACT_EMAIL;
            contactValue.title = CONTACT_EMAIL;
        }
        if (contactRow) {
            contactRow.addEventListener('click', function () {
                openMail(CONTACT_EMAIL);
            });
        }

        refreshVersion();
        refreshStoragePath();
    }

    /** 点「联系」时用系统邮件应用发信 */
    function openMail(address) {
        var url = 'mailto:' + address;

        if (global.LifeLogNative && typeof global.LifeLogNative.openExternal === 'function') {
            global.LifeLogNative.openExternal(url);
            return;
        }
        global.location.href = url;
    }

    function pickStorageFolder() {
        if (!global.LifeLogNative || typeof global.LifeLogNative.pickStorageFolder !== 'function') {
            global.LifeLogUI.toast(t('setting.storage.unavailable'));
            return;
        }
        global.LifeLogNative.pickStorageFolder();
    }

    function resetStorageFolder() {
        if (!global.LifeLogNative || typeof global.LifeLogNative.resetStorageFolder !== 'function') {
            return;
        }
        global.LifeLogNative.resetStorageFolder();
        global.LifeLogUI.toast(t('setting.storage.reset'));
    }

    /** 导出全部数据：交给原生弹系统「另存为」，浏览器预览时退回下载文件 */
    function handleExport() {
        var csv = global.LifeLogStore.exportCsv();

        if (global.LifeLogNative && typeof global.LifeLogNative.exportRecordsCsv === 'function') {
            global.LifeLogNative.exportRecordsCsv(csv);
            return;
        }

        try {
            var blob = new Blob([csv], { type: 'text/csv' });
            var url = global.URL.createObjectURL(blob);
            var link = document.createElement('a');
            link.href = url;
            link.download = 'lifelog.csv';
            link.click();
            global.setTimeout(function () {
                global.URL.revokeObjectURL(url);
            }, 0);
        } catch (e) {
            global.LifeLogUI.toast(t('toast.exportFailed').replace('{reason}', 'unsupported'));
        }
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
        Object.keys(rowPickers).forEach(function (name) {
            rowPickers[name].refresh();
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
        node.textContent = path || t('setting.import.empty');
        // 路径过长时值会被省略号截断，用 title 保留完整信息
        node.title = path || '';
    }

    global.LifeLogSettingPage = {
        init: init,
        refreshVersion: refreshVersion,
        refreshStoragePath: refreshStoragePath
    };
})(window);

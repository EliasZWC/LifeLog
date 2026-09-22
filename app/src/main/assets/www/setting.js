/**
 * Livolog - 设置页。
 *
 * 按分区列出设置项（通用 / 数据管理 / 关于）：
 * - 每项都是统一的「左名称 / 右当前值」行，点整行才弹出选项（LivologUI.createRowPicker）
 * - 导入 CSV 用一个隐藏的 <input type="file">，原生 WebChromeClient 会接管选文件；
 *   时间记录与跟踪数据共用一个 input，点「导入」时先选哪一份，选完才拉选择器
 *   （`importTarget` 就是这一步记下来的）
 */
(function (global) {
    'use strict';

    /** 联系邮箱（设置页「关于 → 联系」） */
    var CONTACT_EMAIL = 'eliaschang@163.com';

    /** 当前导入的目标：'records'（时间记录）或 'metrics'（跟踪数据） */
    var importTarget = 'records';

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
                return global.LivologI18n.getLocale();
            },
            setValue: function (value) {
                global.LivologI18n.setLocale(value);
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
                return global.LivologTheme.getMode();
            },
            setValue: function (value) {
                global.LivologTheme.setMode(value);
            }
        }
    };

    var rowPickers = {};

    function t(key) {
        return global.LivologI18n ? global.LivologI18n.t(key) : key;
    }

    function init() {
        Object.keys(HANDLERS).forEach(function (name) {
            var handler = HANDLERS[name];
            var mount = document.getElementById(handler.mount);
            var valueEl = document.getElementById(handler.value);
            if (!mount || !valueEl) {
                return;
            }

            rowPickers[name] = global.LivologUI.createRowPicker(mount, valueEl, {
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
        global.LivologTheme.onChange(refresh);
        if (global.LivologI18n) {
            global.LivologI18n.onChange(function () {
                refresh();
                refreshStoragePath();
                if (global.LivologShell && global.LivologShell.refreshUpdate) {
                    global.LivologShell.refreshUpdate();
                }
            });
        }

        var importButton = document.getElementById('setting-import');
        var fileInput = document.getElementById('setting-import-file');
        if (importButton && fileInput) {
            importButton.addEventListener('click', function () {
                // 先选「导入哪份数据」，选完再拉系统文件选择器
                openDataMenu(importButton, function (kind) {
                    importTarget = kind;
                    fileInput.click();
                });
            });
            fileInput.addEventListener('change', handleFile);
        }

        var exportButton = document.getElementById('setting-export');
        if (exportButton) {
            exportButton.addEventListener('click', function () {
                openDataMenu(exportButton, function (kind) {
                    handleExport(kind);
                });
            });
        }

        var storageRow = document.getElementById('setting-storage');
        if (storageRow) {
            // 点一下换文件夹；长按恢复默认（自定义位置时才有意义）
            storageRow.addEventListener('click', function () {
                if (global.LivologUI.justLongPressed()) {
                    return;
                }
                pickStorageFolder();
            });
            global.LivologUI.attachLongPress(storageRow, function () {
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

        if (global.LivologNative && typeof global.LivologNative.openExternal === 'function') {
            global.LivologNative.openExternal(url);
            return;
        }
        global.location.href = url;
    }

    function pickStorageFolder() {
        if (!global.LivologNative || typeof global.LivologNative.pickStorageFolder !== 'function') {
            global.LivologUI.toast(t('setting.storage.unavailable'));
            return;
        }
        global.LivologNative.pickStorageFolder();
    }

    function resetStorageFolder() {
        if (!global.LivologNative || typeof global.LivologNative.resetStorageFolder !== 'function') {
            return;
        }
        global.LivologNative.resetStorageFolder();
        global.LivologUI.toast(t('setting.storage.reset'));
    }

    /**
     * 「导入 / 导出数据」先让用户选哪一份数据（时间记录 / 跟踪数据）。
     * @param {HTMLElement} anchor
     * @param {(kind: 'records'|'metrics') => void} onPick
     */
    function openDataMenu(anchor, onPick) {
        anchor.setAttribute('aria-expanded', 'true');
        global.LivologUI.openMenu(anchor, [
            { value: 'records', label: t('setting.data.records') },
            { value: 'metrics', label: t('setting.data.metrics') }
        ], function (kind) {
            anchor.setAttribute('aria-expanded', 'false');
            onPick(kind);
        });
    }

    /** 导出：时间记录 / 跟踪数据各导各的，交给原生弹系统「另存为」 */
    function handleExport(kind) {
        var csv = kind === 'metrics'
            ? global.LivologMetrics.exportCsv()
            : global.LivologStore.exportCsv();

        if (global.LivologNative && typeof global.LivologNative.exportRecordsCsv === 'function') {
            // 第二个参数让原生知道默认文件名用什么（metrics 用 metrics-xxx.csv）
            global.LivologNative.exportRecordsCsv(csv, kind === 'metrics' ? 'metrics' : 'records');
            return;
        }

        try {
            var blob = new Blob([csv], { type: 'text/csv' });
            var url = global.URL.createObjectURL(blob);
            var link = document.createElement('a');
            link.href = url;
            link.download = (kind === 'metrics' ? 'livolog-metrics' : 'livolog') + '.csv';
            link.click();
            global.setTimeout(function () {
                global.URL.revokeObjectURL(url);
            }, 0);
        } catch (e) {
            global.LivologUI.toast(t('toast.exportFailed').replace('{reason}', 'unsupported'));
        }
    }

    /**
     * 把 `importCsvText` 返回的错误码翻成人话。
     * 未知码原样返回，好歹让用户看到点什么、方便反馈。
     * @param {string} code
     */
    function importReason(code) {
        var key = 'toast.importReason.' + (code || '');
        var text = t(key);
        return text === key ? (code || '') : text;
    }

    /**
     * 选完 CSV 后直接在前端解析，不绕原生（原生只负责拉起选择器）。
     * `importTarget` 决定这份文件被当成时间记录还是跟踪数据。
     */
    function handleFile(event) {
        var input = event.target;
        var file = input.files && input.files[0];
        input.value = ''; // 同一个文件也能重复选
        var kind = importTarget;
        importTarget = 'records';
        if (!file) {
            return;
        }

        var reader = new FileReader();
        reader.onload = function () {
            var text = String(reader.result || '');
            var result = kind === 'metrics'
                ? global.LivologMetrics.importCsvText(text)
                : global.LivologStore.importCsvText(text);
            if (!result.ok) {
                global.LivologUI.toast(
                    t('toast.importFailed').replace('{reason}', importReason(result.error))
                );
                return;
            }
            if (kind === 'metrics') {
                // 跟踪数据没有「条数」这个概念（跟踪项 + 记录两样），提示分开写
                if (!result.records) {
                    global.LivologUI.toast(t('toast.importEmpty'));
                    return;
                }
                global.LivologUI.toast(
                    t('toast.importedMetrics')
                        .replace('{m}', String(result.metrics))
                        .replace('{n}', String(result.records))
                );
                return;
            }
            if (!result.count) {
                global.LivologUI.toast(t('toast.importEmpty'));
                return;
            }
            global.LivologUI.toast(t('toast.imported').replace('{n}', String(result.count)));
        };
        reader.onerror = function () {
            global.LivologUI.toast(t('toast.importFailed').replace('{reason}', importReason('read')));
        };
        reader.readAsText(file);
    }

    function refresh() {
        Object.keys(rowPickers).forEach(function (name) {
            rowPickers[name].refresh();
        });
    }

    /** 版本号由原生壳通过 LivologShell.setVersion 推过来，保证与 build.gradle.kts 单一来源 */
    function refreshVersion() {
        var node = document.getElementById('setting-version');
        if (!node) {
            return;
        }
        var version = global.LivologShell ? global.LivologShell.getVersion() : null;
        // 只显示版本名，形如 0.0.6
        node.textContent = version ? version.name : '—';
    }

    /** CSV 数据库文件的落盘位置，由原生壳推送 */
    function refreshStoragePath() {
        var node = document.getElementById('setting-storage-path');
        if (!node) {
            return;
        }
        var path = global.LivologShell ? global.LivologShell.getStoragePath() : '';
        node.textContent = path || t('setting.import.empty');
        // 路径过长时值会被省略号截断，用 title 保留完整信息
        node.title = path || '';
    }

    global.LivologSettingPage = {
        init: init,
        refreshVersion: refreshVersion,
        refreshStoragePath: refreshStoragePath
    };
})(window);

/**
 * LifeLog - 应用内更新。
 *
 * 原生壳每次进入前台都会去 GitHub 查一次最新 Release，发现有新版就把版本号推过来，
 * 这里弹窗询问；用户确认后由原生下载 APK，进度再推回来；下载完成原生直接拉起系统安装器。
 *
 * 原生 → 网页（都挂在 LifeLogShell 上）：
 *   onUpdateAvailable(version, current, size, stalled)  发现新版本
 *   onUpdateProgress(percent)                  下载进度 0~100
 *   onUpdateReady()                            下载完成，安装器已拉起
 *   onUpdateFailed(reason, downloaded)         失败；downloaded=true 表示包已下好，可直接重试安装
 *
 * 网页 → 原生（LifeLogNative）：
 *   downloadUpdate()   开始下载
 *   installUpdate()    重试安装已下好的包
 *   closeUpdate()      弹窗被关掉，原生可以重置「本次进入已检查过」的状态
 */
(function (global) {
    'use strict';

    /** 弹窗当前所处的阶段 */
    var STATE_AVAILABLE = 'available';
    var STATE_DOWNLOADING = 'downloading';

    var sheet = null;
    var textEl = null;
    var stalledEl = null;
    var progressEl = null;
    var fillEl = null;
    var percentEl = null;
    var laterBtn = null;
    var confirmBtn = null;

    var state = STATE_AVAILABLE;
    /** 包已经下好，只差安装（点确定走 installUpdate 而不是重新下载） */
    var downloaded = false;
    var info = null;

    function t(key) {
        return global.LifeLogI18n ? global.LifeLogI18n.t(key) : key;
    }

    function init() {
        sheet = document.getElementById('sheet-update');
        textEl = document.getElementById('update-text');
        stalledEl = document.getElementById('update-stalled');
        progressEl = document.getElementById('update-progress');
        fillEl = document.getElementById('update-fill');
        percentEl = document.getElementById('update-percent');
        laterBtn = document.getElementById('update-later');
        confirmBtn = document.getElementById('update-confirm');

        if (!sheet) {
            return;
        }

        laterBtn.addEventListener('click', dismiss);
        confirmBtn.addEventListener('click', confirm);

        // 点遮罩也能关掉弹窗，但生命周期的收尾得自己补上
        var scrim = document.getElementById('scrim');
        if (scrim) {
            scrim.addEventListener('click', function () {
                if (state === STATE_DOWNLOADING || sheet.hidden) {
                    return;
                }
                downloaded = false;
                notifyNativeClosed();
            });
        }
    }

    // --- 原生回调 -----------------------------------------------------------

    function onAvailable(version, current, size, stalled) {
        if (!sheet) {
            return;
        }

        info = {
            version: String(version),
            current: String(current),
            size: String(size || ''),
            stalled: !!stalled
        };
        downloaded = false;
        setState(STATE_AVAILABLE);
        renderText();

        global.LifeLogUI.openSheet(sheet);
    }

    function onProgress(percent) {
        if (!sheet || state !== STATE_DOWNLOADING) {
            return;
        }

        var value = Math.max(0, Math.min(100, Number(percent) || 0));
        fillEl.style.width = value + '%';
        percentEl.textContent = value + '%';
    }

    function onReady() {
        // 安装器已经起来，收起弹窗并给一句反馈
        downloaded = false;
        setState(STATE_AVAILABLE);
        global.LifeLogUI.closeSheet();
        global.LifeLogUI.toast(t('update.installing'));
    }

    function onFailed(reason, isDownloaded) {
        if (!sheet) {
            return;
        }

        downloaded = !!isDownloaded;
        setState(STATE_AVAILABLE);

        var key = 'update.failed.' + (reason || 'unknown');
        var message = t(key);
        textEl.textContent = message === key ? t('update.failed.unknown') : message;
        confirmBtn.textContent = t(downloaded ? 'update.retryInstall' : 'update.now');
    }

    // --- 交互 ---------------------------------------------------------------

    function confirm() {
        if (state === STATE_DOWNLOADING) {
            return;
        }

        if (downloaded) {
            if (global.LifeLogNative && typeof global.LifeLogNative.installUpdate === 'function') {
                global.LifeLogNative.installUpdate();
            }
            return;
        }

        if (!global.LifeLogNative || typeof global.LifeLogNative.downloadUpdate !== 'function') {
            return;
        }

        setState(STATE_DOWNLOADING);
        global.LifeLogNative.downloadUpdate();
    }

    function dismiss() {
        if (state === STATE_DOWNLOADING) {
            // 下载中不给关，避免界面与原生状态脱节
            return;
        }

        downloaded = false;
        global.LifeLogUI.closeSheet();
        notifyNativeClosed();
    }

    /** 告诉原生“弹窗没了”，它才能重置「本次进入已检查过」的状态 */
    function notifyNativeClosed() {
        if (global.LifeLogNative && typeof global.LifeLogNative.closeUpdate === 'function') {
            global.LifeLogNative.closeUpdate();
        }
    }

    // --- 渲染 ---------------------------------------------------------------

    function setState(next) {
        state = next;
        var busy = next === STATE_DOWNLOADING;

        progressEl.hidden = !busy;
        laterBtn.disabled = busy;
        confirmBtn.disabled = busy;
        confirmBtn.textContent = busy ? t('update.downloading') : t('update.now');

        if (busy) {
            fillEl.style.width = '0%';
            percentEl.textContent = '0%';
            textEl.textContent = t('update.downloading');
        }
    }

    function renderText() {
        textEl.textContent = t('update.message')
            .replace('{version}', info ? info.version : '')
            .replace('{size}', info ? info.size : '')
            .replace('{current}', info ? info.current : '');

        stalledEl.hidden = !(info && info.stalled);
        if (info && info.stalled) {
            stalledEl.textContent = t('update.stalled');
        }
    }

    global.LifeLogUpdate = {
        init: init,
        onAvailable: onAvailable,
        onProgress: onProgress,
        onReady: onReady,
        onFailed: onFailed,
        refresh: function () {
            if (state === STATE_DOWNLOADING) {
                return;
            }
            if (info) {
                renderText();
            }
            confirmBtn.textContent = t(downloaded ? 'update.retryInstall' : 'update.now');
        }
    };
})(window);

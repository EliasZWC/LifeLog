/**
 * Livolog - 极简国际化。
 *
 * 默认语言为英文（DEFAULT_LOCALE），zh 词条已备好，交给后续「设置」页切换。
 * 支持三种绑定：data-i18n（文本）、data-i18n-aria-label、data-i18n-placeholder。
 */
(function (global) {
    'use strict';

    var DEFAULT_LOCALE = 'en';
    var STORAGE_KEY = 'livolog.locale';

    var MESSAGES = {
        en: {
            'app.name': 'Livolog',
            'nav.label': 'Main navigation',
            'nav.time': 'Time',
            'nav.behavior': 'Behavior',
            'nav.metric': 'Track',
            'nav.setting': 'Setting',

            'view.all': 'All',
            'view.period': 'Period',
            'view.moment': 'Moment',
            'view.records': 'Records',
            'view.stats': 'Stats',
            'view.switch': 'Switch view',

            'time.range.all': 'All',
            'time.range.year': 'Last year',
            'time.range.month': 'Last month',
            'time.range.week': 'Last week',
            'time.group.year': '{y}',
            'time.group.month': '{y}-{m}',
            'time.group.week': '{y}-{m}-W{n}',
            'time.level.year': 'Year',
            'time.level.month': 'Month',
            'time.level.week': 'Week',

            // 日期标记里的周几（getDay() 的 0~6，0 = 周日）
            'weekday.0': 'Sun',
            'weekday.1': 'Mon',
            'weekday.2': 'Tue',
            'weekday.3': 'Wed',
            'weekday.4': 'Thu',
            'weekday.5': 'Fri',
            'weekday.6': 'Sat',

            'date.invalid': 'Date is incomplete',

            'stats.chartType': 'Chart',
            'stats.chartType.bar': 'Bars',
            'stats.chartType.line': 'Line',
            'stats.range': 'Range',
            'stats.pickStart': 'Start date',
            'stats.pickEnd': 'End date',

            'time.empty': 'No records yet',
            'time.add': 'Add record',
            'time.form.title': 'New record',
            'time.form.editTitle': 'Edit record',
            'time.form.behavior': 'Behavior',
            'time.form.type': 'Type',
            'time.form.type.none': 'Select type',
            'time.form.note': 'Description',
            'time.form.note.placeholder': 'Optional, e.g. slept badly',
            'time.form.start': 'Start',
            'time.form.end': 'End',
            'time.form.needBehavior': 'Create a behavior first',
            'time.form.needType': 'Select a type to fill in the time',
            'time.form.invalidTime': 'Fill in the whole time',
            'time.form.endBeforeStart': 'End time is earlier than start time',

            'behavior.empty': 'No behaviors yet',
            'behavior.add': 'Add behavior',
            'behavior.form.title': 'New behavior',
            'behavior.edit.title': 'Edit behavior',
            'behavior.form.name': 'Name',
            'behavior.form.namePlaceholder': 'e.g. Sleep',
            'behavior.form.icon': 'Icon',
            'behavior.form.needName': 'Enter a name',

            'behavior.menu.open': 'More options',
            'behavior.menu.rename': 'Rename',
            'behavior.menu.delete': 'Delete',
            'behavior.detail.back': 'Back',
            'behavior.detail.records': 'Records',
            'behavior.detail.stats': 'Stats',
            'behavior.detail.empty': 'No records yet',
            'behavior.detail.statsEmpty': 'No records yet',
            'behavior.detail.total': 'Total time',
            'behavior.detail.count': 'Total times',
            'behavior.detail.perTime': 'Average per time',
            'behavior.detail.perDay': 'Average per day',
            'behavior.detail.chartDuration': 'Minutes per day',
            'behavior.detail.chartCount': 'Times per day',

            'unit.hour': 'h',
            'unit.minute': 'm',

            'behavior.delete.title': 'Delete behavior',
            'behavior.delete.tip': 'Type {name} to confirm. All time records of this behavior will be deleted too.',
            'behavior.delete.hint': 'Behavior name',
            'behavior.delete.confirm': 'Delete',

            'metric.empty': 'No trackers yet',
            'metric.add': 'Add tracker',
            'metric.form.title': 'New tracker',
            'metric.edit.title': 'Edit tracker',
            'metric.form.name': 'Name',
            'metric.form.namePlaceholder': 'e.g. Weight',
            'metric.form.fields': 'Fields',
            'metric.form.field.add': 'Add field',
            'metric.form.fieldNamePlaceholder': 'e.g. systolic',
            'metric.form.fields.invalid': 'Give every field a name',
            'metric.menu.rename': 'Rename',
            'metric.detail.records': 'Records',
            'metric.detail.stats': 'Stats',
            'metric.detail.empty': 'No entries yet',
            'metric.detail.statsEmpty': 'No entries yet',
            'metric.detail.chartDaily': 'Value per day',
            'metric.detail.count': 'Entries',
            'metric.detail.latest': 'Latest',
            'metric.detail.average': 'Average',
            'metric.detail.max': 'Maximum',
            'metric.detail.min': 'Minimum',
            'metric.record.add': 'Add entry',
            'metric.record.title': 'New entry',
            'metric.record.editTitle': 'Edit entry',
            'metric.record.value': 'Value',
            'metric.record.valuePlaceholder': '0',
            'metric.detail.formula': 'Show',
            'metric.detail.chartFormula': 'Show which value',
            'metric.record.invalidTime': 'Time is incomplete',
            'metric.record.invalidValue': 'Please enter a number',
            'metric.delete.title': 'Delete tracker',
            'metric.delete.tip': 'Type {name} to confirm. All entries of this tracker will be deleted too.',
            'metric.delete.hint': 'Tracker name',
            'metric.delete.confirm': 'Delete',

            'setting.group.general': 'General',
            'setting.group.data': 'Data',
            'setting.group.about': 'About',
            'setting.language': 'Language',
            'setting.language.en': 'English',
            'setting.language.zh': '中文',
            'setting.contact': 'Contact',
            'setting.import': 'Import data',
            'setting.export': 'Export data',
            'setting.storage': 'Location',
            'setting.import.empty': 'Not created yet',

            'toast.imported': 'Imported {n} records',
            'toast.importFailed': 'Import failed: {reason}',
            'toast.importEmpty': 'No valid rows found',
            'toast.deleted': 'Deleted',
            'toast.saveFailed': 'Failed to write CSV',
            'toast.exported': 'Exported to {path}',
            'toast.exportFailed': 'Export failed: {reason}',
            'toast.exportCanceled': 'Export canceled',

            'update.title': 'Update available',
            'update.message': 'Version {version} has been released ({size}). You are on {current}.',
            'update.later': 'Later',
            'update.now': 'Update',
            'update.downloading': 'Downloading...',
            'update.retryInstall': 'Retry install',
            'update.installing': 'Downloaded, installing...',
            'update.failed.permission': 'Allow Livolog to install apps in the system settings, then come back and retry.',
            'update.failed.network': 'Download failed. Check your network and try again.',
            'update.failed.install': 'Could not start the installer. Please install the APK manually.',
            'update.failed.invalid': 'The downloaded file is not a valid APK. Please try again.',
            'update.failed.truncated': 'The download was incomplete. Please try again.',
            'update.failed.mismatch': 'The downloaded package does not match the released version. Please try again.',
            'update.failed.downgrade': 'The downloaded package is not newer than the installed one, so it was not installed.',
            'update.failed.unknown': 'Update failed. Please try again later.',
            'update.stalled': 'The previous install did not take effect. Allow Livolog to install apps in the system settings, then try again.',

            'action.cancel': 'Cancel',
            'action.confirm': 'Confirm',
            'action.close': 'Close',

            'icon.pick': 'Choose icon',

            'selection.cancel': 'Cancel selection',
            'selection.delete': 'Delete selected',
            'selection.count': '{n} selected',

            'setting.version': 'Version',
            'setting.storage.pick': 'Tap to choose another folder',
            'setting.storage.unavailable': 'Changing the folder is only available in the app',
            'setting.storage.reset': 'Restored the default location',

            'setting.theme': 'Theme',
            'setting.theme.light': 'Light',
            'setting.theme.dark': 'Dark',
            'setting.theme.system': 'Follow system'
        },
        zh: {
            'app.name': 'Livolog',
            'nav.label': '主导航',
            'nav.time': '时间',
            'nav.behavior': '行为',
            'nav.metric': '跟踪',
            'nav.setting': '设置',

            'view.all': '全部',
            'view.period': '时段',
            'view.moment': '时点',
            'view.records': '记录',
            'view.stats': '统计',
            'view.switch': '切换视图',

            'time.range.all': '全部',
            'time.range.year': '最近一年',
            'time.range.month': '最近一月',
            'time.range.week': '最近一周',
            'time.group.year': '{y}',
            'time.group.month': '{y}-{m}',
            'time.group.week': '{y}-{m}-W{n}',
            'time.level.year': '年',
            'time.level.month': '月',
            'time.level.week': '周',

            'weekday.0': '周日',
            'weekday.1': '周一',
            'weekday.2': '周二',
            'weekday.3': '周三',
            'weekday.4': '周四',
            'weekday.5': '周五',
            'weekday.6': '周六',

            'date.invalid': '日期未填写完整',

            'stats.chartType': '图类型',
            'stats.chartType.bar': '直方图',
            'stats.chartType.line': '折线图',
            'stats.range': '时间范围',
            'stats.pickStart': '选择开始日期',
            'stats.pickEnd': '选择结束日期',

            'time.empty': '还没有记录',
            'time.add': '新增记录',
            'time.form.title': '新增记录',
            'time.form.editTitle': '修改记录',
            'time.form.behavior': '行为',
            'time.form.type': '类型',
            'time.form.type.none': '请选择类型',
            'time.form.note': '描述',
            'time.form.note.placeholder': '选填，比如「睡得不太好」',
            'time.form.start': '开始',
            'time.form.end': '结束',
            'time.form.needBehavior': '请先到「行为」页创建行为',
            'time.form.needType': '请先选择类型',
            'time.form.invalidTime': '时间未填写完整',
            'time.form.endBeforeStart': '结束时间早于开始时间',

            'behavior.empty': '还没有行为',
            'behavior.add': '新增行为',
            'behavior.form.title': '新增行为',
            'behavior.edit.title': '编辑行为',
            'behavior.form.name': '名称',
            'behavior.form.namePlaceholder': '例如：睡眠',
            'behavior.form.icon': '图标',
            'behavior.form.needName': '请输入名称',

            'behavior.menu.open': '更多操作',
            'behavior.menu.rename': '重命名',
            'behavior.menu.delete': '删除',
            'behavior.detail.back': '返回',
            'behavior.detail.records': '记录',
            'behavior.detail.stats': '统计',
            'behavior.detail.empty': '还没有记录',
            'behavior.detail.statsEmpty': '还没有记录',
            'behavior.detail.total': '总时长',
            'behavior.detail.count': '总次数',
            'behavior.detail.perTime': '平均每次时长',
            'behavior.detail.perDay': '平均每日时长',
            'behavior.detail.chartDuration': '每日时长（分钟）',
            'behavior.detail.chartCount': '每日次数',

            'unit.hour': '小时',
            'unit.minute': '分钟',

            'behavior.delete.title': '删除行为',
            'behavior.delete.tip': '请输入「{name}」以确认删除，该行为下的所有时间记录也会一并删除。',
            'behavior.delete.hint': '行为名称',
            'behavior.delete.confirm': '删除',
            'metric.empty': '还没有跟踪项',
            'metric.add': '新增跟踪项',
            'metric.form.title': '新增跟踪项',
            'metric.edit.title': '编辑跟踪项',
            'metric.form.name': '名称',
            'metric.form.namePlaceholder': '例如：体重',
            'metric.form.fields': '字段',
            'metric.form.field.add': '添加字段',
            'metric.form.fieldNamePlaceholder': '例如：高压',
            'metric.form.fields.invalid': '每个字段都要填名字',
            'metric.menu.rename': '重命名',
            'metric.detail.records': '记录',
            'metric.detail.stats': '统计',
            'metric.detail.empty': '还没有记录',
            'metric.detail.statsEmpty': '还没有记录',
            'metric.detail.chartDaily': '每日取值',
            'metric.detail.count': '记录次数',
            'metric.detail.latest': '最新值',
            'metric.detail.average': '平均值',
            'metric.detail.max': '最大值',
            'metric.detail.min': '最小值',
            'metric.record.add': '新增记录',
            'metric.record.title': '新增记录',
            'metric.record.editTitle': '修改记录',
            'metric.record.value': '记录值',
            'metric.record.valuePlaceholder': '0',
            'metric.detail.formula': '计算公式',
            'metric.detail.chartFormula': '展示哪个值',
            'metric.record.invalidTime': '时间未填写完整',
            'metric.record.invalidValue': '请填写一个数值',
            'metric.delete.title': '删除跟踪项',
            'metric.delete.tip': '请输入 {name} 以确认，该跟踪项下的全部记录也会一并删除。',
            'metric.delete.hint': '跟踪项名称',
            'metric.delete.confirm': '删除',
            'setting.group.general': '通用',
            'setting.group.data': '数据管理',
            'setting.group.about': '关于',
            'setting.language': '语言',
            'setting.language.en': 'English',
            'setting.language.zh': '中文',
            'setting.contact': '联系',
            'setting.import': '导入数据',
            'setting.export': '导出数据',
            'setting.storage': '数据存储位置',
            'setting.import.empty': '尚未创建',

            'toast.imported': '已导入 {n} 条记录',
            'toast.importFailed': '导入失败：{reason}',
            'toast.importEmpty': '没有可导入的有效行',
            'toast.deleted': '已删除',
            'toast.saveFailed': 'CSV 写入失败',
            'toast.exported': '已导出到 {path}',
            'toast.exportFailed': '导出失败：{reason}',
            'toast.exportCanceled': '已取消导出',

            'update.title': '发现新版本',
            'update.message': '新版本 {version} 已发布（{size}），当前版本 {current}。',
            'update.later': '稍后',
            'update.now': '更新',
            'update.downloading': '正在下载…',
            'update.retryInstall': '重试安装',
            'update.installing': '下载完成，正在安装…',
            'update.failed.permission': '请在系统设置里允许 Livolog 安装应用，然后回到这里重试。',
            'update.failed.network': '下载失败，请检查网络后重试。',
            'update.failed.install': '无法拉起安装器，请手动安装下载好的 APK。',
            'update.failed.invalid': '下载到的不是合法的安装包，请重试。',
            'update.failed.truncated': '下载不完整，请重试。',
            'update.failed.mismatch': '下载到的包与发布版本不一致，请重试。',
            'update.failed.downgrade': '下载到的包不比已安装的版本新，已阻止安装。',
            'update.failed.unknown': '更新失败，请稍后再试。',
            'update.stalled': '上一次安装没有生效。请确认系统已允许 Livolog 安装应用，然后重试。',

            'action.cancel': '取消',
            'action.confirm': '确定',
            'action.close': '关闭',

            'icon.pick': '选择图标',

            'selection.cancel': '取消选择',
            'selection.delete': '删除所选',
            'selection.count': '已选 {n} 项',

            'setting.version': '版本',
            'setting.storage.pick': '点击可选择其它文件夹',
            'setting.storage.unavailable': '仅 app 内支持更换文件夹',
            'setting.storage.reset': '已恢复默认位置',

            'setting.theme': '主题',
            'setting.theme.light': '日间模式',
            'setting.theme.dark': '夜间模式',
            'setting.theme.system': '跟随系统模式'
        }
    };

    var current = DEFAULT_LOCALE;
    var listeners = [];

    function normalize(locale) {
        if (!locale) {
            return DEFAULT_LOCALE;
        }
        var value = String(locale).toLowerCase();
        if (MESSAGES[value]) {
            return value;
        }
        if (value.indexOf('zh') === 0) {
            return 'zh';
        }
        return DEFAULT_LOCALE;
    }

    function t(key) {
        var table = MESSAGES[current] || {};
        if (Object.prototype.hasOwnProperty.call(table, key)) {
            return table[key];
        }
        var fallback = MESSAGES[DEFAULT_LOCALE];
        return Object.prototype.hasOwnProperty.call(fallback, key) ? fallback[key] : key;
    }

    /** 把当前语言应用到 DOM 上带 data-i18n / data-i18n-aria-label 的元素 */
    function apply(root) {
        var scope = root || document;

        Array.prototype.forEach.call(scope.querySelectorAll('[data-i18n]'), function (element) {
            element.textContent = t(element.dataset.i18n);
        });

        Array.prototype.forEach.call(scope.querySelectorAll('[data-i18n-aria-label]'), function (element) {
            element.setAttribute('aria-label', t(element.dataset.i18nAriaLabel));
        });

        Array.prototype.forEach.call(scope.querySelectorAll('[data-i18n-placeholder]'), function (element) {
            element.setAttribute('placeholder', t(element.dataset.i18nPlaceholder));
        });

        document.documentElement.lang = current === 'zh' ? 'zh-CN' : 'en';
        document.title = t('app.name');
    }

    function setLocale(locale) {
        current = normalize(locale);
        try {
            localStorage.setItem(STORAGE_KEY, current);
        } catch (e) {
            /* 隐私模式下忽略 */
        }
        apply(document);
        listeners.forEach(function (listener) {
            listener(current);
        });
        return current;
    }

    function init() {
        var saved = null;
        try {
            saved = localStorage.getItem(STORAGE_KEY);
        } catch (e) {
            /* 忽略 */
        }
        current = normalize(saved || DEFAULT_LOCALE);
        apply(document);
        return current;
    }

    global.LivologI18n = {
        DEFAULT_LOCALE: DEFAULT_LOCALE,
        init: init,
        setLocale: setLocale,
        getLocale: function () {
            return current;
        },
        t: t,
        apply: apply,
        onChange: function (listener) {
            listeners.push(listener);
        }
    };
})(window);

/**
 * Livolog - 时间口径设置（时区 / 每周起始日）。
 *
 * 这两项会改变「一天从哪一刻开始」和「哪一天算一周的头」，
 * 所以时间页的分组、日期标记、以及统计里的按天归属都要走这里，
 * 不要各自去用 `new Date(...).getDate()` 那套本地时间。
 *
 * 时区实现思路：JS 的 `Date` 只能用系统时区，没有「这个 Date 属于哪个时区」的概念。
 * 于是统一走一个绕过本地时区的转换 ——
 *   某个绝对时刻 T 在时区 Z 下的「墙上时间」数字，等于
 *   `T + offset(Z, T)` 这个绝对时刻用 **UTC** 读出来的数字。
 * 反解（墙上时间 → 绝对时刻）因为夏令时不是双射，用两次逼近足够准。
 */
(function (global) {
    'use strict';

    /** 跟随系统（不偏移） */
    var TZ_SYSTEM = 'system';

    /** 每周起始日：0 = 周天，1 = 周一（跟 Date.getDay() 同一套编号） */
    var WEEK_START_SUNDAY = 0;
    var WEEK_START_MONDAY = 1;

    /**
     * 可选时区。列的是 UTC 偏移**固定的**地区（没有夏令时），
     * 这样「挑了个时区」的行为是稳定可预期的 —— 见下面 `resolveOffset` 的说明。
     * `offset` 单位是分钟，东区为正。
     */
    var ZONES = [
        { id: 'system', offset: null },
        { id: 'utc-11', offset: -11 * 60 },
        { id: 'utc-10', offset: -10 * 60 },
        { id: 'utc-9', offset: -9 * 60 },
        { id: 'utc-8', offset: -8 * 60 },
        { id: 'utc-7', offset: -7 * 60 },
        { id: 'utc-6', offset: -6 * 60 },
        { id: 'utc-5', offset: -5 * 60 },
        { id: 'utc-4', offset: -4 * 60 },
        { id: 'utc-3', offset: -3 * 60 },
        { id: 'utc-2', offset: -2 * 60 },
        { id: 'utc-1', offset: -1 * 60 },
        { id: 'utc0', offset: 0 },
        { id: 'utc1', offset: 1 * 60 },
        { id: 'utc2', offset: 2 * 60 },
        { id: 'utc3', offset: 3 * 60 },
        { id: 'utc4', offset: 4 * 60 },
        { id: 'utc5', offset: 5 * 60 },
        { id: 'utc6', offset: 6 * 60 },
        { id: 'utc7', offset: 7 * 60 },
        { id: 'utc8', offset: 8 * 60 },
        { id: 'utc9', offset: 9 * 60 },
        { id: 'utc10', offset: 10 * 60 },
        { id: 'utc11', offset: 11 * 60 },
        { id: 'utc12', offset: 12 * 60 },
        { id: 'utc13', offset: 13 * 60 },
        { id: 'utc14', offset: 14 * 60 }
    ];

    var MODE_KEY = 'livolog.timezone';
    var WEEK_START_KEY = 'livolog.weekStart';

    var listeners = [];

    function read(key, fallback) {
        try {
            var value = global.localStorage.getItem(key);
            return value === null ? fallback : value;
        } catch (e) {
            return fallback;
        }
    }

    function write(key, value) {
        try {
            global.localStorage.setItem(key, value);
        } catch (e) {
            /* 存不下就只在本次会话生效 */
        }
    }

    function notify() {
        listeners.slice().forEach(function (listener) {
            try {
                listener();
            } catch (e) {
                /* 单个监听器出错不影响其它 */
            }
        });
    }

    // --- 时区 ---------------------------------------------------------------

    function getTimezone() {
        var id = read(MODE_KEY, TZ_SYSTEM);
        return zoneById(id) ? id : TZ_SYSTEM;
    }

    function setTimezone(id) {
        write(MODE_KEY, zoneById(id) ? id : TZ_SYSTEM);
        notify();
    }

    function zoneById(id) {
        for (var i = 0; i < ZONES.length; i++) {
            if (ZONES[i].id === id) {
                return ZONES[i];
            }
        }
        return null;
    }

    function zones() {
        return ZONES.slice();
    }

    /**
     * 当前时区相对 UTC 的偏移（分钟，东区为正）。
     *
     * ⚠️ 自己挑的时区一律用**固定偏移**，不查该地区的夏令时历史：我们列的是
     *    `UTC+8` 这种纯偏移标签，本来就只承诺偏移量；真要按地区算夏令时，
     *    得内建一整张 tzdata，为这个功能不值得。
     *    跟随系统时则由 `getTimezoneOffset()` 给出真实值（夏令时自然就对了）。
     */
    function offsetMinutes() {
        return offsetMinutesAt(Date.now());
    }

    // --- 墙上时间 ←→ 绝对时刻 -----------------------------------------------

    /**
     * 绝对时刻 → 该时区下的墙上时间，**表示成一个「假装是 UTC」的 Date**。
     * 之后一律用 `getUTCFullYear()` 这类 UTC 访问器读它，不能用本地访问器。
     */
    function wall(timestamp) {
        return new Date(timestamp + offsetMinutesAt(timestamp) * 60000);
    }

    /**
     * 墙上时间的年月日时分 → 绝对时刻。
     *
     * ⚠️ 跟随系统 + 夏令时的时候，这是**多对一**（春季被跳掉的那一小时不存在、
     *    秋季那一小时出现两次），所以严格的反解不存在。用两轮逼近取一个
     *    稳定且合理的结果就够了：第一轮按当前偏移猜，第二轮用猜出来的时刻
     *    自己所在时刻的偏移修正。
     *    自己挑的时区是固定偏移，一轮就精确，第二轮相当于原地不动。
     */
    function stamp(year, month, day, hour, minute) {
        var ymd = Date.UTC(year, month - 1, day, hour || 0, minute || 0);
        var offset = offsetMinutesAt(ymd);
        var result = ymd - offset * 60000;
        offset = offsetMinutesAt(result);
        return ymd - offset * 60000;
    }

    /**
     * 某个绝对时刻的偏移。跟随系统时按**那个时刻**查（夏令时自然就对）；
     * 自己挑的时区是固定值，参数用不上。
     */
    function offsetMinutesAt(timestamp) {
        var zone = zoneById(getTimezone());
        if (!zone || zone.offset === null) {
            return -new Date(timestamp).getTimezoneOffset();
        }
        return zone.offset;
    }

    /** 该时区下这一天的零点 */
    function startOfDay(timestamp) {
        var w = wall(timestamp);
        return stamp(w.getUTCFullYear(), w.getUTCMonth() + 1, w.getUTCDate(), 0, 0);
    }

    /** 把 Date 拆成该时区下的年月日等字段 */
    function parts(timestamp) {
        var w = wall(timestamp);
        return {
            year: w.getUTCFullYear(),
            month: w.getUTCMonth() + 1,
            day: w.getUTCDate(),
            hour: w.getUTCHours(),
            minute: w.getUTCMinutes(),
            weekday: w.getUTCDay()
        };
    }

    /** 形如 2026-09-24 */
    function formatDate(timestamp) {
        var p = parts(timestamp);
        return p.year + '-' + pad(p.month, 2) + '-' + pad(p.day, 2);
    }

    /** 形如 08:05 */
    function formatClock(timestamp) {
        var p = parts(timestamp);
        return pad(p.hour, 2) + ':' + pad(p.minute, 2);
    }

    function pad(value, length) {
        var text = String(value);
        while (text.length < length) {
            text = '0' + text;
        }
        return text;
    }

    // --- 每周起始日 ---------------------------------------------------------

    function getWeekStart() {
        var value = Number(read(WEEK_START_KEY, WEEK_START_SUNDAY));
        return value === WEEK_START_MONDAY ? WEEK_START_MONDAY : WEEK_START_SUNDAY;
    }

    function setWeekStart(value) {
        write(WEEK_START_KEY, Number(value) === WEEK_START_MONDAY
            ? String(WEEK_START_MONDAY)
            : String(WEEK_START_SUNDAY));
        notify();
    }

    /**
     * 某个日期（该时区下的年月日）所属周的**周一日期**的绝对时刻。
     *
     * 周编号用 ISO 的「周一为一周之首」来算 ——
     * 这样跨月跨年相邻的两天，周编号的差就恰好等于真实周差，
     * 不需要额外处理月份/年份边界。
     * @returns {number} 该周周一的零点（绝对时刻）
     */
    function weekStartOf(timestamp) {
        var day = startOfDay(timestamp);
        // 距周一的偏移：周日是 0 → 6，其余 n → n-1
        var weekday = parts(day).weekday;
        var backToMonday = (weekday + 6) % 7;
        return day - backToMonday * 86400000;
    }

    /**
     * 稳定且单调的周分组键（`YYYY-MM-DD` 形式的周一首日）。
     * 用周一首日的日期而不是 ISO 周号：跨年时周号会跳，
     * 相邻两周还要比较年份，容易出错。
     */
    function weekKey(timestamp) {
        return formatDate(weekStartOf(timestamp));
    }

    /**
     * 用户设置里「一周的头」在第几列（用于列表里排星期顺序，
     * 以及决定一周的显示区间）。
     * @returns {number} 0..6
     */
    function firstWeekdayIndex() {
        return getWeekStart();
    }

    /**
     * 把该周（周一为基准）的 7 天，按用户设置的起始日重排。
     * @returns {Array<{weekday:number, offset:number}>} offset 是距周一的**天数**
     *          （可能是负数收尾，见下行注释），顺序就是用户要的展示顺序
     */
    function weekDaysOf() {
        // 周一 ~ 周日 的 weekday 编号，再整体旋转到用户选的起始日
        var order = [1, 2, 3, 4, 5, 6, 0];
        var start = firstWeekdayIndex();
        var at = order.indexOf(start);
        var rotated = order.slice(at).concat(order.slice(0, at));
        return rotated.map(function (weekday) { return { weekday: weekday }; });
    }

    global.LivologClock = {
        TZ_SYSTEM: TZ_SYSTEM,
        WEEK_START_SUNDAY: WEEK_START_SUNDAY,
        WEEK_START_MONDAY: WEEK_START_MONDAY,
        zones: zones,
        getTimezone: getTimezone,
        setTimezone: setTimezone,
        offsetMinutes: offsetMinutes,
        getWeekStart: getWeekStart,
        setWeekStart: setWeekStart,
        wall: wall,
        stamp: stamp,
        parts: parts,
        pad: pad,
        startOfDay: startOfDay,
        formatDate: formatDate,
        formatClock: formatClock,
        weekStartOf: weekStartOf,
        weekKey: weekKey,
        firstWeekdayIndex: firstWeekdayIndex,
        weekDaysOf: weekDaysOf,
        onChange: function (listener) {
            listeners.push(listener);
        }
    };
})(window);

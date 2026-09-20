/**
 * LifeLog - 直方图。
 *
 * 用内联 SVG 手绘，不引第三方图表库；颜色全部走 CSS 变量，跟随主题。
 * 纵坐标 = 每天的累计值，横坐标 = 天数。行为详情页与跟踪详情页共用。
 */
(function (global) {
    'use strict';

    var WIDTH = 320;
    var HEIGHT = 170;
    var PAD_LEFT = 40;
    var PAD_RIGHT = 8;
    var PAD_TOP = 14;
    var PAD_BOTTOM = 26;

    /** 横轴刻度：月-日（不补零，窄屏更省空间） */
    function dateLabel(ms) {
        var date = new Date(ms);
        return (date.getMonth() + 1) + '-' + date.getDate();
    }

    function tickLabel(value) {
        return String(Math.round(value * 10) / 10);
    }

    /**
     * @param {Array<{day: number, value: number}>} points 按时间升序，每个点代表一天
     * @returns {SVGElement}
     */
    function build(points) {
        var list = points || [];
        if (!list.length) {
            list = [{ day: Date.now(), value: 0 }];
        }

        var plotW = WIDTH - PAD_LEFT - PAD_RIGHT;
        var plotH = HEIGHT - PAD_TOP - PAD_BOTTOM;
        var baseY = PAD_TOP + plotH;

        var max = 0;
        list.forEach(function (point) {
            if (point.value > max) {
                max = point.value;
            }
        });
        if (max <= 0) {
            max = 1;
        }

        var slot = plotW / list.length;
        var barW = Math.max(3, Math.min(slot - 3, 22));

        var parts = [
            '<line class="chart-grid" x1="' + PAD_LEFT + '" y1="' + PAD_TOP +
                '" x2="' + (WIDTH - PAD_RIGHT) + '" y2="' + PAD_TOP + '" />',
            '<line class="chart-axis" x1="' + PAD_LEFT + '" y1="' + baseY +
                '" x2="' + (WIDTH - PAD_RIGHT) + '" y2="' + baseY + '" />',
            '<text class="chart-tick" x="' + (PAD_LEFT - 6) + '" y="' +
                (PAD_TOP + 4) + '" text-anchor="end">' + tickLabel(max) + '</text>',
            '<text class="chart-tick" x="' + (PAD_LEFT - 6) + '" y="' +
                (baseY + 4) + '" text-anchor="end">0</text>'
        ];

        list.forEach(function (point, index) {
            if (point.value <= 0) {
                return;
            }
            var height = Math.max(2, (point.value / max) * plotH);
            var x = PAD_LEFT + index * slot + (slot - barW) / 2;
            parts.push(
                '<rect class="chart-bar" x="' + x.toFixed(1) + '" y="' +
                (baseY - height).toFixed(1) + '" width="' + barW.toFixed(1) +
                '" height="' + height.toFixed(1) + '" rx="2" />'
            );
        });

        // 横轴只标「首 / 中 / 尾」三处日期，避免挤成一团
        [0, Math.floor((list.length - 1) / 2), list.length - 1]
            .filter(function (value, index, array) {
                return array.indexOf(value) === index;
            })
            .forEach(function (index) {
                var cx = PAD_LEFT + index * slot + slot / 2;
                var anchor = index === 0
                    ? 'start'
                    : (index === list.length - 1 ? 'end' : 'middle');
                parts.push(
                    '<text class="chart-tick" x="' + cx.toFixed(1) + '" y="' +
                    (baseY + 17) + '" text-anchor="' + anchor + '">' +
                    dateLabel(list[index].day) + '</text>'
                );
            });

        var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'chart');
        svg.setAttribute('viewBox', '0 0 ' + WIDTH + ' ' + HEIGHT);
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        svg.setAttribute('role', 'img');
        svg.innerHTML = parts.join('');

        return svg;
    }

    /**
     * 把一个时间窗口里的事件按天累计成图表数据点。
     * @param {Array<number>} times 事件时间戳
     * @param {Array<number>} values 与 times 一一对应的取值
     * @returns {{points: Array, days: number}}
     */
    function dailyPoints(times, values) {
        var DAY_MS = 24 * 60 * 60 * 1000;

        function startOfDay(ms) {
            var date = new Date(ms);
            return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
        }

        if (!times.length) {
            return { points: [], days: 0 };
        }

        var earliest = times[0];
        var latest = times[0];
        times.forEach(function (ms) {
            if (ms < earliest) earliest = ms;
            if (ms > latest) latest = ms;
        });

        var today = startOfDay(Date.now());
        var spanDays = Math.max(
            1,
            Math.round((Math.max(today, startOfDay(latest)) - startOfDay(earliest)) / DAY_MS) + 1
        );
        // 窗口自适应：至少一周，最多一个月，免得只有两天数据时出现两根孤零零的柱子
        var windowDays = Math.min(30, Math.max(7, spanDays));
        var windowStart = today - (windowDays - 1) * DAY_MS;

        var points = [];
        for (var i = 0; i < windowDays; i += 1) {
            points.push({ day: windowStart + i * DAY_MS, value: 0 });
        }

        times.forEach(function (ms, index) {
            var slot = Math.round((startOfDay(ms) - windowStart) / DAY_MS);
            if (slot < 0 || slot >= windowDays) {
                return;
            }
            points[slot].value += Number(values[index]) || 0;
        });

        return { points: points, days: Math.max(1, spanDays) };
    }

    global.LifeLogChart = {
        build: build,
        dailyPoints: dailyPoints,
        dateLabel: dateLabel
    };
})(window);

/**
 * LifeLog - 统计图。
 *
 * 用内联 SVG 手绘，不引第三方图表库；颜色全部走 CSS 变量，跟随主题。
 * 横坐标刻度**永远是日**；纵坐标由调用方决定含义（时长 / 次数 / 取值）。
 *
 * 两种图：
 *   - 直方图 bar ：纵轴从 0 起，适合「每天累计了多少」
 *   - 折线图 line：纵轴按数据的最小/最大取值铺开，适合看走势（比如体重）；
 *     没有记录的那几天是断开的，不会把「没数据」画成 0
 */
(function (global) {
    'use strict';

    var WIDTH = 320;
    var HEIGHT = 170;
    var PAD_LEFT = 40;
    var PAD_RIGHT = 8;
    var PAD_TOP = 14;
    var PAD_BOTTOM = 26;
    var DAY_MS = 24 * 60 * 60 * 1000;

    /** 取某个时间戳所在自然日的零点 */
    function startOfDay(ms) {
        var date = new Date(ms);
        return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    }

    /** 横轴刻度：月-日（不补零，窄屏更省空间） */
    function dateLabel(ms) {
        var date = new Date(ms);
        return (date.getMonth() + 1) + '-' + date.getDate();
    }

    function tickLabel(value) {
        return String(Math.round(value * 100) / 100);
    }

    /**
     * @param {Array<{day: number, value: number, has: boolean}>} points 按时间升序，每个点代表一天
     * @param {{type?: 'bar'|'line'}} [options]
     * @returns {SVGElement}
     */
    function build(points, options) {
        var list = points && points.length ? points : [{ day: Date.now(), value: 0, has: false }];
        var type = options && options.type === 'line' ? 'line' : 'bar';

        var plotW = WIDTH - PAD_LEFT - PAD_RIGHT;
        var plotH = HEIGHT - PAD_TOP - PAD_BOTTOM;
        var baseY = PAD_TOP + plotH;

        var max = -Infinity;
        var min = Infinity;
        var hasAny = false;
        list.forEach(function (point) {
            if (!point.has) {
                return;
            }
            hasAny = true;
            if (point.value > max) max = point.value;
            if (point.value < min) min = point.value;
        });

        if (type === 'line' && hasAny) {
            // 折线图看走势：最小值贴底、最大值贴顶，否则像体重这种
            // 数值集中在 70 附近的曲线会被压成贴在 0 基线上的一条直线
            if (max === min) {
                max += 1;
                min -= 1;
            }
        } else {
            min = 0;
            if (!(max > 0)) max = 1;
        }

        var span = max - min || 1;
        function toY(value) {
            return baseY - ((value - min) / span) * plotH;
        }

        var slot = plotW / list.length;
        var barW = Math.max(1, Math.min(slot - 3, 22));

        var parts = [
            '<line class="chart-grid" x1="' + PAD_LEFT + '" y1="' + PAD_TOP +
                '" x2="' + (WIDTH - PAD_RIGHT) + '" y2="' + PAD_TOP + '" />',
            '<line class="chart-axis" x1="' + PAD_LEFT + '" y1="' + baseY +
                '" x2="' + (WIDTH - PAD_RIGHT) + '" y2="' + baseY + '" />',
            '<text class="chart-tick" x="' + (PAD_LEFT - 6) + '" y="' +
                (PAD_TOP + 4) + '" text-anchor="end">' + tickLabel(max) + '</text>',
            '<text class="chart-tick" x="' + (PAD_LEFT - 6) + '" y="' +
                (baseY + 4) + '" text-anchor="end">' + tickLabel(min) + '</text>'
        ];

        function centerX(index) {
            return PAD_LEFT + index * slot + slot / 2;
        }

        if (type === 'line') {
            parts = parts.concat(buildLine(list, toY, centerX));
        } else {
            list.forEach(function (point, index) {
                if (!point.has || point.value <= 0) {
                    return;
                }
                var height = Math.max(2, ((point.value - min) / span) * plotH);
                var x = PAD_LEFT + index * slot + (slot - barW) / 2;
                parts.push(
                    '<rect class="chart-bar" x="' + x.toFixed(1) + '" y="' +
                    (baseY - height).toFixed(1) + '" width="' + barW.toFixed(1) +
                    '" height="' + height.toFixed(1) + '" rx="2" />'
                );
            });
        }

        // 横轴只标「首 / 中 / 尾」三处日期，避免挤成一团
        [0, Math.floor((list.length - 1) / 2), list.length - 1]
            .filter(function (value, index, array) {
                return array.indexOf(value) === index;
            })
            .forEach(function (index) {
                var anchor = index === 0
                    ? 'start'
                    : (index === list.length - 1 ? 'end' : 'middle');
                parts.push(
                    '<text class="chart-tick" x="' + centerX(index).toFixed(1) + '" y="' +
                    (baseY + 17) + '" text-anchor="' + anchor + '">' +
                    dateLabel(list[index].day) + '</text>'
                );
            });

        var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        // ⚠️ 根的 class 只能管到「这是一张图」——不能把 chart-bar / chart-line 也写上去。
        // stroke / stroke-width 在 SVG 里是**可继承**的，根上带了就会渗到所有子元素，
        // 连刻度文字都被描边，看上去又粗又糊。
        svg.setAttribute('class', 'chart');
        svg.setAttribute('data-chart-type', type);
        svg.setAttribute('viewBox', '0 0 ' + WIDTH + ' ' + HEIGHT);
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        svg.setAttribute('role', 'img');
        svg.innerHTML = parts.join('');

        return svg;
    }

    /** 折线：只连「有记录」的相邻天，中间没数据的断开 */
    function buildLine(list, toY, centerX) {
        var parts = [];
        var run = [];
        var total = 0;
        list.forEach(function (point) {
            if (point.has) total += 1;
        });
        // 点不多时把每个点都标出来，便于看清孤立的那几次记录
        var showDots = total <= 40;

        function flush() {
            if (run.length >= 2) {
                parts.push('<polyline class="chart-line" points="' +
                    run.map(function (item) {
                        return centerX(item.index).toFixed(1) + ',' + toY(item.value).toFixed(1);
                    }).join(' ') + '" />');
            }
            if (run.length === 1 || showDots) {
                run.forEach(function (item) {
                    parts.push('<circle class="chart-dot" cx="' +
                        centerX(item.index).toFixed(1) + '" cy="' + toY(item.value).toFixed(1) +
                        '" r="2.4" />');
                });
            }
            run = [];
        }

        list.forEach(function (point, index) {
            if (point.has) {
                run.push({ index: index, value: point.value });
            } else {
                flush();
            }
        });
        flush();

        return parts;
    }

    /**
     * 把事件按天归到给定区间里。
     * @param {Array<number>} times 事件时间戳
     * @param {Array<number>} values 与 times 一一对应的取值
     * @param {{start: number, end: number}} range 起止时间戳（两端都含当天）
     * @returns {Array<{day: number, value: number, has: boolean}>}
     */
    function bucketByDay(times, values, range) {
        var start = startOfDay(range.start);
        var end = startOfDay(range.end);
        if (end < start) {
            var swap = start;
            start = end;
            end = swap;
        }

        var days = Math.round((end - start) / DAY_MS) + 1;
        var points = [];
        for (var i = 0; i < days; i += 1) {
            points.push({ day: start + i * DAY_MS, value: 0, has: false });
        }

        (times || []).forEach(function (ms, index) {
            var slot = Math.round((startOfDay(ms) - start) / DAY_MS);
            if (slot < 0 || slot >= days) {
                return;
            }
            points[slot].value += Number(values[index]) || 0;
            points[slot].has = true;
        });

        return points;
    }

    /** 一批时间戳里第一天 / 最后一天（都归到零点） */
    function rangeOf(times) {
        if (!times || !times.length) {
            var today = startOfDay(Date.now());
            return { start: today, end: today };
        }

        var min = times[0];
        var max = times[0];
        times.forEach(function (ms) {
            if (ms < min) min = ms;
            if (ms > max) max = ms;
        });
        return { start: startOfDay(min), end: startOfDay(max) };
    }

    global.LifeLogChart = {
        build: build,
        bucketByDay: bucketByDay,
        rangeOf: rangeOf,
        startOfDay: startOfDay,
        dateLabel: dateLabel
    };
})(window);

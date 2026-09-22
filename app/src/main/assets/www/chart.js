/**
 * Livolog - 统计图。
 *
 * 用内联 SVG 手绘，不引第三方图表库；颜色全部走 CSS 变量，跟随主题。
 * 横坐标刻度**永远是日**；纵坐标由调用方决定含义（时长 / 次数 / 取值）。
 *
 * 两种图：
 *   - 直方图 bar ：纵轴从 0 起，适合「每天累计了多少」
 *   - 折线图 line：纵轴按数据的最小/最大取值铺开，适合看走势（比如体重）；
 *     没记录的那几天直接跨过去（连到上一个数据点），不会把「没数据」画成 0、也不断开
 */
(function (global) {
    'use strict';

    var WIDTH = 320;
    var HEIGHT = 170;
    /*
       ⚠️ 左右内边距必须相等，否则「绘图区」会偏（SVG 本身撑满宽度、居中，
          但绘图区是从 PAD_X 画到 WIDTH-PAD_X 的）。
          左边要放纵轴刻度数字（text-anchor: end，贴在 PAD_X - 6 处），
          所以要按最长刻度留够 —— 像 130.48 这种带小数的值有 6 个字符，
          窄了会被裁掉前面几位（曾经 PAD_X=26 就裁成 "0.48"）。
    */
    var PAD_X = 38;
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
     * @param {{type?: 'bar'|'line', format?: (value: number) => string}} [options]
     *        format 决定「点某一天时气泡里显示的文案」（默认取整数值）
     * @returns {SVGElement}
     */
    function build(points, options) {
        var list = points && points.length ? points : [{ day: Date.now(), value: 0, has: false }];
        var type = options && options.type === 'line' ? 'line' : 'bar';

        var plotW = WIDTH - PAD_X - PAD_X;
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
            '<line class="chart-grid" x1="' + PAD_X + '" y1="' + PAD_TOP +
                '" x2="' + (WIDTH - PAD_X) + '" y2="' + PAD_TOP + '" />',
            '<line class="chart-axis" x1="' + PAD_X + '" y1="' + baseY +
                '" x2="' + (WIDTH - PAD_X) + '" y2="' + baseY + '" />',
            '<text class="chart-tick" x="' + (PAD_X - 6) + '" y="' +
                (PAD_TOP + 4) + '" text-anchor="end">' + tickLabel(max) + '</text>',
            '<text class="chart-tick" x="' + (PAD_X - 6) + '" y="' +
                (baseY + 4) + '" text-anchor="end">' + tickLabel(min) + '</text>'
        ];

        function centerX(index) {
            return PAD_X + index * slot + slot / 2;
        }

        if (type === 'line') {
            parts = parts.concat(buildLine(list, toY, centerX));
        } else {
            list.forEach(function (point, index) {
                if (!point.has || point.value <= 0) {
                    return;
                }
                var height = Math.max(2, ((point.value - min) / span) * plotH);
                var x = PAD_X + index * slot + (slot - barW) / 2;
                parts.push(
                    '<rect class="chart-bar" data-index="' + index + '" x="' + x.toFixed(1) +
                    '" y="' + (baseY - height).toFixed(1) + '" width="' + barW.toFixed(1) +
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

        // 每天一整列透明命中区：点一下就能看到那天的具体数值
        var tips = list.map(function (point, index) {
            return {
                has: point.has,
                day: point.day,
                value: point.value,
                cx: centerX(index),
                top: type === 'line'
                    ? toY(point.value)
                    : baseY - Math.max(2, ((point.value - min) / span) * plotH)
            };
        });

        list.forEach(function (point, index) {
            parts.push(
                '<rect class="chart-hit" data-index="' + index + '" x="' +
                (PAD_X + index * slot).toFixed(1) + '" y="' + PAD_TOP + '" width="' +
                slot.toFixed(1) + '" height="' + plotH + '" />'
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

        attachTips(svg, tips, {
            type: type,
            baseY: baseY,
            format: options && options.format
        });

        return svg;
    }

    /**
     * 点某一天就在那个点上方/下方浮一个数值气泡（再点一次收起）。
     * 气泡画在 SVG 里（viewBox 坐标），所以跟着图一起缩放。
     */
    function attachTips(svg, tips, config) {
        var layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        layer.setAttribute('class', 'chart-tip');
        layer.setAttribute('hidden', 'true');
        svg.appendChild(layer);

        var current = -1;

        function clear() {
            layer.setAttribute('hidden', 'true');
            layer.innerHTML = '';
        }

        function show(index) {
            var tip = tips[index];
            var text = config.format
                ? String(config.format(tip.value))
                : String(Math.round(tip.value * 100) / 100);
            var boxW = text.length * 6.2 + 16;
            var boxH = 19;
            var boxX = Math.min(
                Math.max(tip.cx - boxW / 2, PAD_X),
                WIDTH - PAD_X - boxW
            );
            // 优先浮在柱顶 / 折线点上方；上面没地方就压到它下面
            var boxY = tip.top - boxH - 7;
            if (boxY < 2) {
                boxY = tip.top + 7;
            }

            var inner =
                '<rect x="' + boxX.toFixed(1) + '" y="' + boxY.toFixed(1) +
                '" width="' + boxW.toFixed(1) + '" height="' + boxH +
                '" rx="6" />' +
                '<text x="' + (boxX + boxW / 2).toFixed(1) + '" y="' +
                (boxY + 13).toFixed(1) + '" text-anchor="middle">' + text + '</text>';

            if (config.type === 'line') {
                inner = '<line class="chart-guide" x1="' + tip.cx.toFixed(1) +
                    '" y1="' + PAD_TOP + '" x2="' + tip.cx.toFixed(1) +
                    '" y2="' + config.baseY + '" />' + inner;
            }

            layer.innerHTML = inner;
            layer.removeAttribute('hidden');
        }

        svg.addEventListener('click', function (event) {
            var hit = event.target.closest ? event.target.closest('.chart-hit') : null;
            if (!hit) {
                return;
            }

            var index = Number(hit.getAttribute('data-index'));
            if (!tips[index] || !tips[index].has) {
                return;   // 那天没有记录，不弹气泡
            }

            if (current === index) {
                current = -1;
                clear();
                return;
            }

            current = index;
            show(index);
        });
    }

    /**
     * 折线：把「有记录」的天按顺序连成一条线。
     * 中间没有记录的天不画点、也不断线，直接跨过去连到上一个数据点。
     */
    function buildLine(list, toY, centerX) {
        var parts = [];
        var points = [];
        list.forEach(function (point, index) {
            if (point.has) {
                points.push({ index: index, value: point.value });
            }
        });

        function x(index) {
            return centerX(index).toFixed(1);
        }

        function y(value) {
            return toY(value).toFixed(1);
        }

        if (points.length >= 2) {
            parts.push('<polyline class="chart-line" points="' +
                points.map(function (item) {
                    return x(item.index) + ',' + y(item.value);
                }).join(' ') + '" />');
        }

        // 点不多时把每个点都标出来，便于看清孤立的那几次记录
        if (points.length <= 40) {
            points.forEach(function (item) {
                parts.push('<circle class="chart-dot" data-index="' + item.index +
                    '" cx="' + x(item.index) + '" cy="' + y(item.value) + '" r="2.4" />');
            });
        }

        return parts;
    }

    /**
     * 把「时段」拆到每一天再归到给定区间里。
     * 跨天的记录（比如 23:00 → 次日 07:00）会按实际跨过的时长分摊，
     * 而不是整段都算在开始那天；时点记录（end 为空）整份归到当天。
     *
     * @param {Array<{start: number, end?: number|null, value: number}>} items
     * @param {{start: number, end: number}} range 起止时间戳（两端都含当天）
     * @returns {Array<{day: number, value: number, has: boolean}>}
     */
    function bucketSpans(items, range) {
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

        function add(dayMs, amount) {
            var slot = Math.round((dayMs - start) / DAY_MS);
            if (slot < 0 || slot >= days) {
                return;
            }
            points[slot].value += amount;
            // 碰到过的天都算「有数据」，哪怕只分到十几分钟
            points[slot].has = true;
        }

        (items || []).forEach(function (item) {
            var from = Number(item.start);
            if (!isFinite(from)) {
                return;
            }

            var amount = Number(item.value) || 0;
            var to = (item.end === null || item.end === undefined) ? from : Number(item.end);
            if (!isFinite(to) || to < from) {
                to = from;
            }

            // 时点：整份归到当天
            if (to === from) {
                add(startOfDay(from), amount);
                return;
            }

            var total = to - from;
            var cursor = from;
            while (cursor < to) {
                var dayStart = startOfDay(cursor);
                var sliceEnd = Math.min(to, dayStart + DAY_MS);
                add(dayStart, amount * ((sliceEnd - cursor) / total));
                cursor = sliceEnd;
            }
        });

        return points;
    }

    /**
     * 把事件按天归到给定区间里（时点用，整份记在当天）。
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

    /**
     * 多序列折线图：同一个横轴（日）上画好几条线，用**不同的线型**区分。
     * 用在跟踪项的统计里 —— 一条记录有好几个项目（高压 / 低压 / 脉搏），
     * 每个项目一条线；用户不再选「看哪个值」，而是一次看全，
     * 靠 `dash`（实线 / 虚线 / 点线…）区分是哪一项。
     *
     * ⚠️ 和单序列 build(points, {type:'line'}) 的区别：
     *    - 纵轴范围取所有序列的并集（共用一根轴才可比）
     *    - 只画线，不画柱子（项目之间量纲可能不同，但至少线型能区分）
     *
     * @param {Array<{day: number}>} days 横轴（按升序的每一天）
     * @param {Array<{name: string, points: Array<{day:number, value:number, has:boolean}>,
     *                dash: string|null}>} series
     * @param {{format?: (value:number)=>string, tipFormat?: (seriesIndex:number, value:number)=>string}} [options]
     * @returns {SVGElement}
     */
    function buildMulti(days, series, options) {
        var list = days && days.length ? days : [{ day: Date.now() }];
        var plotW = WIDTH - PAD_X - PAD_X;
        var plotH = HEIGHT - PAD_TOP - PAD_BOTTOM;
        var baseY = PAD_TOP + plotH;

        var max = -Infinity;
        var min = Infinity;
        var hasAny = false;
        (series || []).forEach(function (item) {
            (item.points || []).forEach(function (point) {
                if (!point.has) {
                    return;
                }
                hasAny = true;
                if (point.value > max) max = point.value;
                if (point.value < min) min = point.value;
            });
        });

        if (hasAny) {
            if (max === min) {
                max += 1;
                min -= 1;
            }
        } else {
            min = 0;
            max = 1;
        }

        // 上下各留 8% 余量，免得最高 / 最低点贴着边框
        var pad = (max - min) * 0.08 || 1;
        max += pad;
        min -= pad;

        var span = max - min || 1;
        function toY(value) {
            return baseY - ((value - min) / span) * plotH;
        }

        var slot = plotW / list.length;

        function centerX(index) {
            return PAD_X + index * slot + slot / 2;
        }

        var parts = [
            '<line class="chart-grid" x1="' + PAD_X + '" y1="' + PAD_TOP +
                '" x2="' + (WIDTH - PAD_X) + '" y2="' + PAD_TOP + '" />',
            '<line class="chart-axis" x1="' + PAD_X + '" y1="' + baseY +
                '" x2="' + (WIDTH - PAD_X) + '" y2="' + baseY + '" />',
            '<text class="chart-tick" x="' + (PAD_X - 6) + '" y="' +
                (PAD_TOP + 4) + '" text-anchor="end">' + tickLabel(max) + '</text>',
            '<text class="chart-tick" x="' + (PAD_X - 6) + '" y="' +
                (baseY + 4) + '" text-anchor="end">' + tickLabel(min) + '</text>'
        ];

        // 每条序列：把有数据的天按顺序连起来（没记录的天跨过去，不断线）
        (series || []).forEach(function (item, seriesIndex) {
            var points = [];
            (item.points || []).forEach(function (point) {
                var index = list.findIndex(function (day) {
                    return day.day === point.day;
                });
                if (index >= 0 && point.has) {
                    points.push({ index: index, value: point.value });
                }
            });
            if (points.length < 2) {
                // 只有一个点也要看得见（画个孤点）
                points.forEach(function (entry) {
                    parts.push('<circle class="chart-dot chart-series-' + seriesIndex +
                        '" cx="' + centerX(entry.index).toFixed(1) + '" cy="' +
                        toY(entry.value).toFixed(1) + '" r="2.6" />');
                });
                return;
            }

            var style = item.dash ? ' stroke-dasharray="' + item.dash + '"' : '';
            parts.push('<polyline class="chart-line chart-series-' + seriesIndex +
                '" points="' + points.map(function (entry) {
                    return centerX(entry.index).toFixed(1) + ',' + toY(entry.value).toFixed(1);
                }).join(' ') + '"' + style + ' />');

            if (points.length <= 40) {
                points.forEach(function (entry) {
                    parts.push('<circle class="chart-dot chart-series-' + seriesIndex +
                        '" cx="' + centerX(entry.index).toFixed(1) + '" cy="' +
                        toY(entry.value).toFixed(1) + '" r="2.2" />');
                });
            }
        });

        // 横轴只标「首 / 中 / 尾」三处日期
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

        // 每天一整列透明命中区：点一下列出那一天各序列的值
        var tips = list.map(function (day, index) {
            var values = [];
            var has = false;
            (series || []).forEach(function (item) {
                (item.points || []).forEach(function (point) {
                    if (point.day !== day.day) {
                        return;
                    }
                    values.push({ name: item.name, value: point.value, has: point.has });
                    if (point.has) {
                        has = true;
                    }
                });
            });
            return { day: day.day, cx: centerX(index), values: values, has: has };
        });

        list.forEach(function (day, index) {
            parts.push(
                '<rect class="chart-hit" data-index="' + index + '" x="' +
                (PAD_X + index * slot).toFixed(1) + '" y="' + PAD_TOP + '" width="' +
                slot.toFixed(1) + '" height="' + plotH + '" />'
            );
        });

        var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'chart');
        svg.setAttribute('data-chart-type', 'line');
        svg.setAttribute('viewBox', '0 0 ' + WIDTH + ' ' + HEIGHT);
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        svg.setAttribute('role', 'img');
        svg.innerHTML = parts.join('');

        attachMultiTips(svg, tips, options, baseY);
        return svg;
    }

    /** 多序列的气泡：一天一行「项目名 值」 */
    function attachMultiTips(svg, tips, options, baseY) {
        var layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        layer.setAttribute('class', 'chart-tip');
        layer.setAttribute('hidden', 'true');
        svg.appendChild(layer);

        var current = -1;

        function clear() {
            layer.setAttribute('hidden', 'true');
            layer.innerHTML = '';
        }

        function show(index) {
            var tip = tips[index];
            var rows = tip.values.filter(function (row) {
                return row.has;
            });
            var format = (options && options.format) || function (value) {
                return String(Math.round(value * 100) / 100);
            };

            var lines = rows.map(function (row) {
                return format(row.value, row.name);
            });
            // 多行气泡：每行一个项目的值
            var lineH = 15;
            var boxH = lines.length * lineH + 8;
            var boxW = 0;
            lines.forEach(function (text) {
                boxW = Math.max(boxW, text.length * 6.2 + 16);
            });
            var boxX = Math.min(
                Math.max(tip.cx - boxW / 2, PAD_X),
                WIDTH - PAD_X - boxW
            );
            var boxY = PAD_TOP + 2;

            var inner =
                '<line class="chart-guide" x1="' + tip.cx.toFixed(1) +
                '" y1="' + PAD_TOP + '" x2="' + tip.cx.toFixed(1) +
                '" y2="' + baseY + '" />' +
                '<rect x="' + boxX.toFixed(1) + '" y="' + boxY.toFixed(1) +
                '" width="' + boxW.toFixed(1) + '" height="' + boxH +
                '" rx="6" />';

            lines.forEach(function (text, row) {
                inner += '<text x="' + (boxX + boxW / 2).toFixed(1) + '" y="' +
                    (boxY + 14 + row * lineH).toFixed(1) + '" text-anchor="middle">' +
                    text + '</text>';
            });

            layer.innerHTML = inner;
            layer.removeAttribute('hidden');
        }

        svg.addEventListener('click', function (event) {
            var hit = event.target.closest ? event.target.closest('.chart-hit') : null;
            if (!hit) {
                return;
            }
            var index = Number(hit.getAttribute('data-index'));
            if (!tips[index] || !tips[index].has) {
                return;
            }
            if (current === index) {
                current = -1;
                clear();
                return;
            }
            current = index;
            show(index);
        });
    }

    global.LivologChart = {
        build: build,
        buildMulti: buildMulti,
        bucketByDay: bucketByDay,
        bucketSpans: bucketSpans,
        rangeOf: rangeOf,
        startOfDay: startOfDay,
        dateLabel: dateLabel
    };
})(window);

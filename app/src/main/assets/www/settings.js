/**
 * LifeLog - 设置页。
 *
 * 每项设置都是「左标题 + 右下拉框」的列表行，用 data-setting 关联到具体处理器，
 * 后续新增设置项只要往 HANDLERS 里加一条即可。
 */
(function (global) {
    'use strict';

    var HANDLERS = {
        theme: {
            get: function () {
                return global.LifeLogTheme.getMode();
            },
            set: function (value) {
                global.LifeLogTheme.setMode(value);
            }
        }
    };

    function elementsFor(name) {
        return Array.prototype.slice.call(
            document.querySelectorAll('[data-setting="' + name + '"]')
        );
    }

    function init() {
        Object.keys(HANDLERS).forEach(function (name) {
            var handler = HANDLERS[name];

            elementsFor(name).forEach(function (element) {
                element.value = handler.get();

                element.addEventListener('change', function () {
                    handler.set(element.value);
                    element.value = handler.get();
                });
            });

            // 该项被其它入口改动时，保持控件同步
            global.LifeLogTheme.onChange(function () {
                elementsFor(name).forEach(function (element) {
                    element.value = handler.get();
                });
            });
        });
    }

    global.LifeLogSettings = {
        init: init
    };
})(window);

"""生成 app/src/main/assets/www/icons.js（带分类、名称、中英搜索关键词）。

图标路径来源：
  - 旧 icons.js 里已有的（不重新下载）
  - tools/_new.txt / tools/_new2.txt（fetch-icons.py 的产物）

用法：python tools/gen-icons.py
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WWW = ROOT / "app" / "src" / "main" / "assets" / "www"
TOOLS = ROOT / "tools"
OLD = (WWW / "icons.js").read_text(encoding="utf-8")

PATHS = {}
# 旧文件里是 JS 对象字面量：name: '<path...>',（最后一项可能没逗号）
for m in re.finditer(r"^\s{8}([a-z_0-9]+):\s*'(<.*?>)',?\s*$", OLD, re.M):
    PATHS[m.group(1)] = m.group(2)

for fname in ("_new.txt", "_new2.txt"):
    p = TOOLS / fname
    if not p.exists():
        continue
    for line in p.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^([a-z_0-9]+):\s*'(<.*>)',?$", line.strip())
        if not m:
            continue
        body = m.group(2)
        body = re.sub(r'<rect fill="none"[^>]*/>', "", body)
        body = re.sub(r'<path[^>]*fill="none"[^>]*/>', "", body)
        PATHS[m.group(1)] = body

GROUPS = [
    ("sport", [
        ("directions_run", "running jog 跑步 运动"),
        ("directions_walk", "walking 走路 散步 步行"),
        ("directions_bike", "cycling bike 骑车 自行车"),
        ("hiking", "hiking 徒步 登山 爬山"),
        ("rowing", "rowing 划船 赛艇"),
        ("pool", "swimming pool 游泳 泳池"),
        ("self_improvement", "meditation yoga 冥想 瑜伽 打坐"),
        ("spa", "spa relax 放松 水疗 养生"),
        ("fitness_center", "gym workout dumbbell 健身 举重 杠铃"),
        ("sports_gymnastics", "gymnastics 体操 拉伸"),
        ("sports_soccer", "soccer football 足球 球类"),
        ("sports_basketball", "basketball 篮球 球类"),
        ("sports_tennis", "tennis 网球 球类"),
        ("sports_esports", "esports gaming 电竞 游戏"),
    ]),
    ("food", [
        ("restaurant", "meal eat 吃饭 用餐 正餐"),
        ("local_dining", "dining eat 用餐 餐具"),
        ("restaurant_menu", "menu dining 菜单 用餐"),
        ("breakfast_dining", "breakfast 早餐 早饭"),
        ("lunch_dining", "lunch 午餐 午饭"),
        ("dinner_dining", "dinner 晚餐 晚饭"),
        ("fastfood", "fast food burger 快餐 汉堡"),
        ("local_pizza", "pizza 披萨 比萨"),
        ("icecream", "ice cream 冰淇淋 甜点"),
        ("local_cafe", "coffee cafe 咖啡 喝茶"),
        ("local_drink", "drink 饮料 喝水"),
        ("water_drop", "water 喝水 水分 补水"),
    ]),
    ("health", [
        ("local_hospital", "hospital 医院 就医"),
        ("medical_services", "medical first aid 医疗 急救 药箱"),
        ("medication", "medicine pill 吃药 药 药丸 药片"),
        ("medication_liquid", "medicine liquid syrup 药水 糖浆 药"),
        ("vaccines", "vaccine injection 疫苗 打针 注射"),
        ("bloodtype", "blood 血型 抽血 血液"),
        ("healing", "healing bandage 包扎 疗伤 创可贴"),
        ("masks", "mask 口罩 防护"),
        ("sick", "sick ill 生病 感冒 不舒服"),
        ("monitor_weight", "weight scale 体重 秤 称重"),
        ("straighten", "measure ruler 测量 卷尺 身长"),
        ("accessibility", "body shape 身材 身体 体型 人形"),
        ("biotech", "microscope lab 显微镜 化验 体检"),
        ("local_pharmacy", "pharmacy drugstore 药店 买药"),
        ("bedtime", "sleep night 睡觉 睡眠 夜间"),
        ("smoking_rooms", "smoking 抽烟 吸烟 香烟"),
        ("smoke_free", "no smoking 戒烟 不吸烟"),
        ("local_florist", "flower plant 花 植物 养花"),
        ("favorite", "heart love 心 爱心 喜欢"),
    ]),
    ("transport", [
        ("directions_car", "car drive 开车 汽车"),
        ("local_taxi", "taxi 出租车 打车"),
        ("directions_transit", "transit bus 公交 公共交通"),
        ("subway", "subway metro 地铁 轨道交通"),
        ("directions_boat", "boat ferry 船 轮渡"),
        ("flight", "flight plane 飞机 航班 出行"),
        ("hotel", "hotel sleep 住宿 酒店 旅馆"),
    ]),
    ("work", [
        ("school", "school study 上学 学习 学校"),
        ("book", "book read 看书 读书 阅读"),
        ("library_books", "books library 图书 图书馆 阅读"),
        ("work", "work briefcase 工作 上班 公文包"),
        ("computer", "computer desktop 电脑 台式机 办公"),
        ("psychology", "psychology brain 心理 思考 脑力"),
        ("translate", "translate language 翻译 语言 外语"),
        ("description", "document note 文档 文件 笔记"),
        ("edit", "edit write 写作 编辑 笔记"),
        ("bookmarks", "bookmark save 书签 收藏 标记"),
    ]),
    ("life", [
        ("home", "home house 家 在家 房子"),
        ("cleaning_services", "cleaning 打扫 清洁 家务"),
        ("wash", "wash 洗衣 洗涤 洗澡"),
        ("local_laundry_service", "laundry washer 洗衣机 洗衣"),
        ("shopping_cart", "shopping cart 购物 买菜 超市"),
        ("shopping_bag", "shopping bag 购物 买东西 逛街"),
        ("savings", "savings money piggy 存钱 储蓄 理财"),
        ("attach_money", "money 钱 花费 记账"),
        ("pets", "pet dog cat 宠物 猫 狗"),
        ("people", "people friends 朋友 社交 聚会"),
        ("face", "face 面部 护肤 脸"),
        ("alarm", "alarm clock 闹钟 定时 提醒"),
        ("bolt", "bolt lightning 闪电 打雷 电"),
    ]),
    ("play", [
        ("music_note", "music 音乐 听歌"),
        ("movie", "movie film 电影 看电影"),
        ("tv", "tv television 电视 看剧"),
        ("photo_camera", "camera photo 拍照 摄影 照片"),
        ("videogame_asset", "game console 游戏 打游戏"),
        ("smartphone", "phone mobile 手机 玩手机"),
        ("mood", "mood happy 心情 情绪 开心"),
    ]),
    ("other", [
        ("star", "star 星标 收藏 标记"),
        ("call", "call phone 电话 打电话"),
        ("email", "email mail 邮件 邮箱"),
    ]),
]

FAVORITES = [
    "hotel", "restaurant", "local_cafe", "directions_run", "directions_walk",
    "directions_bike", "fitness_center", "book", "work", "computer",
    "bedtime", "water_drop", "medication", "monitor_weight", "favorite",
    "home", "cleaning_services", "shopping_cart", "music_note", "movie",
    "smartphone", "people", "edit", "star",
]

HEADER = '''/**
 * Livolog - 图标库。
 *
 * 全部取自谷歌官方 Material Icons（material-design-icons 仓库 materialicons/24px 版本），
 * 只保留绘图元素并去掉透明背景层，方便用 CSS 的 fill: currentColor 着色。
 *
 * 每个图标带三样东西：
 *   - cat : 归属分类（图标选择器按它折叠分组）
 *   - kw  : 搜索关键词，中英双语、空格分隔（英文图标名本身不用写，搜索时自动带上）
 *   - path: 绘图内容
 *
 * ⚠️「常用」（favorite）是**虚拟分类**：成员从各分类里挑，所以会和归属分类重叠；
 *    除此之外任何两个分类都不共享图标（一个图标只有一个 cat）。
 *
 * 这个文件由 tools/gen-icons.py 生成，不要手改（加图标 / 改分类请改那个脚本）。
 */
(function (global) {
    'use strict';

    /** 分类顺序 = 选择器里的显示顺序；favorite 永远第一且默认展开 */
    var CATEGORIES = [
        { id: 'favorite', label: 'icon.category.favorite', defaultOpen: true },
        { id: 'sport', label: 'icon.category.sport' },
        { id: 'food', label: 'icon.category.food' },
        { id: 'health', label: 'icon.category.health' },
        { id: 'transport', label: 'icon.category.transport' },
        { id: 'work', label: 'icon.category.work' },
        { id: 'life', label: 'icon.category.life' },
        { id: 'play', label: 'icon.category.play' },
        { id: 'other', label: 'icon.category.other' }
    ];

    /** 图标表 */
    var ICONS = {
'''

TAIL = '''    var FALLBACK = 'star';
    var NAMES = Object.keys(ICONS);

    /** name -> {cat, haystack}，搜索与分组共用 */
    var INDEX = {};
    NAMES.forEach(function (name) {
        INDEX[name] = {
            cat: ICONS[name].cat,
            // 搜索用小写串：英文图标名（下划线换成空格）+ 中英关键词
            haystack: (name.replace(/_/g, ' ') + ' ' + ICONS[name].kw).toLowerCase()
        };
    });

    global.LivologIcons = {
        /** 取图标的绘图内容（<path> 等），未知名回退到通用图标 */
        get: function (name) {
            var found = ICONS[name];
            return found ? found.path : ICONS[FALLBACK].path;
        },
        has: function (name) {
            return Object.prototype.hasOwnProperty.call(ICONS, name);
        },
        /** 全部图标名（按分类顺序） */
        names: function () {
            return NAMES.slice();
        },
        /** 分类定义（label 是 i18n key） */
        categories: function () {
            return CATEGORIES.map(function (category) {
                return {
                    id: category.id,
                    label: category.label,
                    defaultOpen: !!category.defaultOpen
                };
            });
        },
        /**
         * 某个分类下的图标名。favorite 用 FAVORITES（会与归属分类重叠），
         * 其余分类按 cat 过滤 —— 所以除 favorite 外任何两个分类都不重叠。
         */
        namesIn: function (categoryId) {
            if (categoryId === 'favorite') {
                return FAVORITES.filter(function (name) {
                    return !!ICONS[name];
                });
            }
            return NAMES.filter(function (name) {
                return ICONS[name].cat === categoryId;
            });
        },
        /**
         * 搜索图标：中英文都行，大小写不敏感；空格分隔的多个词要「全部命中」。
         * @param {string} query
         * @returns {string[]} 命中的图标名（按分类顺序）
         */
        search: function (query) {
            var terms = String(query || '').toLowerCase().trim().split(/\\s+/)
                .filter(function (term) {
                    return !!term;
                });
            if (!terms.length) {
                return [];
            }
            return NAMES.filter(function (name) {
                var hay = INDEX[name].haystack;
                return terms.every(function (term) {
                    return hay.indexOf(term) >= 0;
                });
            });
        },
        fallback: FALLBACK
    };
})(window);
'''


def main():
    lines = [HEADER]
    total = 0
    for cat, items in GROUPS:
        lines.append("        // --- %s %s\n" % (cat, "-" * max(4, 58 - len(cat))))
        for name, kw in items:
            path = PATHS.get(name)
            if path is None:
                raise SystemExit("缺少图标数据: " + name)
            total += 1
            lines.append(
                "        %s: {\n            cat: '%s',\n            kw: '%s',\n            path: '%s'\n        },\n"
                % (name, cat, kw, path)
            )
        lines.append("\n")

    lines.append("    };\n\n")
    lines.append("    /** 「常用」里的图标（虚拟分类，会与归属分类重叠） */\n")
    lines.append("    var FAVORITES = [\n")
    for i in range(0, len(FAVORITES), 4):
        chunk = FAVORITES[i:i + 4]
        lines.append("        " + ", ".join("'" + n + "'" for n in chunk) + ",\n")
    lines.append("    ];\n\n")
    lines.append(TAIL)

    (WWW / "icons.js").write_text("".join(lines), encoding="utf-8")
    print("icons.js: %d 个图标 / %d 个分类（常用 %d 个）" % (total, len(GROUPS), len(FAVORITES)))


if __name__ == "__main__":
    main()

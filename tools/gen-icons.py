"""生成 app/src/main/assets/www/icons.js（带分类、名称、中英搜索关键词）。

图标路径来源：
  - 旧 icons.js 里已有的（不重新下载 —— 所以这个脚本可以反复跑）
  - tools/_new.txt / _new2.txt / _new3.txt（`fetch-icons.py` / `fetch-symbols.py` 的产物）

⚠️ 那三个 `_new*.txt` 是**用完即弃**的中间产物，仓库里没有（加图标时才现拉）。
   想加新图标：先 `python tools/fetch-icons.py <图标名…>` 生成对应的 txt，
   再跑本脚本合并。缺文件不影响既有图标，只是拉不到新的。

用法：python tools/gen-icons.py
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WWW = ROOT / "app" / "src" / "main" / "assets" / "www"
TOOLS = ROOT / "tools"
OLD = (WWW / "icons.js").read_text(encoding="utf-8")

PATHS = {}
# 旧文件里是对象字面量：
#     name: {
#         cat: 'sport',
#         kw: '...',
#         path: '<path .../>'
#     },
# （kw 里可能带中文，别用 \S 之类的假设；path 允许跨行用 .*? 匹配）
OLD_ENTRY = re.compile(
    r"^\s{8}([a-z_0-9]+):\s*\{\s*\n"
    r"\s*cat:\s*'[^']*',\s*\n"
    r"\s*kw:\s*'[^']*',\s*\n"
    r"\s*path:\s*'(<.*?>)',?\s*\n"
    r"\s*\},",
    re.M,
)
for m in OLD_ENTRY.finditer(OLD):
    PATHS[m.group(1)] = m.group(2)

# 兜底：也接受「name: '<path>'」这种简单写法
for m in re.finditer(r"^\s{8}([a-z_0-9]+):\s*'(<.*?>)',?\s*$", OLD, re.M):
    PATHS.setdefault(m.group(1), m.group(2))

for fname in ("_new.txt", "_new2.txt", "_new3.txt"):
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
        ("cardiology", "heart pulse ecg 心脏 心电图 心率 心血管"),
        ("genetics", "dna gene 基因 遗传 化验"),
        ("pill", "medicine pill capsule 药 药丸 药片 吃药"),
        ("syringe", "injection shot needle 打针 注射 针管"),
        ("medication", "medicine 吃药 药 药瓶"),
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
    ("study", [
        ("school", "school study 上学 学习 学校"),
        ("book", "book read 看书 读书 阅读"),
        ("book_4", "book read notebook 书本 读书 阅读 教材"),
        ("library_books", "books library 图书 图书馆 阅读"),
        ("psychology", "psychology brain 心理 思考 脑力"),
        ("translate", "translate language 翻译 语言 外语"),
    ]),
    ("work", [
        ("work", "work briefcase 工作 上班 公文包"),
        ("computer", "computer desktop 电脑 台式机 办公"),
        ("description", "document note 文档 文件 笔记"),
        ("edit", "edit write 写作 编辑 笔记"),
        ("bookmarks", "bookmark save 书签 收藏 标记"),
        ("call", "call phone 电话 打电话"),
        ("email", "email mail 邮件 邮箱"),
        ("star", "star 星标 星星 收藏 标记"),
    ]),
    ("daily", [
        ("home", "home house 家 在家 房子 日常 daily"),
        ("cleaning_services", "cleaning 打扫 清洁 家务 日常 daily"),
        ("wash", "wash 洗衣 洗涤 洗澡 日常 daily"),
        ("local_laundry_service", "laundry washer 洗衣机 洗衣 日常 daily"),
        ("shopping_cart", "shopping cart 购物 买菜 超市 日常 daily"),
        ("shopping_bag", "shopping bag 购物 买东西 逛街 日常 daily"),
        ("savings", "savings money piggy 存钱 储蓄 理财 日常 daily"),
        ("attach_money", "money 钱 花费 记账 日常 daily"),
        ("pets", "pet dog cat 宠物 猫 狗 日常 daily"),
        ("people", "people friends 朋友 社交 聚会 日常 daily"),
        ("face", "face 面部 护肤 脸 日常 daily"),
        ("alarm", "alarm clock 闹钟 定时 提醒 日常 daily"),
        ("bolt", "bolt lightning 闪电 打雷 电 日常 daily"),
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
        ("directions_walk", "walking 走路 散步 步行"),
        ("directions_bike", "cycling bike 骑车 自行车"),
    ]),
]

FAVORITES = [
    "hotel", "restaurant", "local_cafe", "directions_run", "fitness_center",
    "book", "work", "pill", "favorite", "shopping_cart", "people", "star",
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
 * ⚠️ 两套官方图标的坐标系不同，这里已统一到 24 网格：
 *    - 旧版 material-design-icons src/<cat>/<name>/materialicons/24px.svg 本身就是 0 0 24 24
 *    - 新版 Material Symbols symbols/web/<name>/materialsymbolsoutlined/<name>_24px.svg
 *      是 0 -960 960 960，由 tools/fetch-symbols.py 包一层 <g transform> 换算过来
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
        { id: 'study', label: 'icon.category.study' },
        { id: 'work', label: 'icon.category.work' },
        { id: 'daily', label: 'icon.category.daily' },
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


def check():
    """写文件前先自查：重名、favorite 指向不存在的图标、分类之间重叠。"""
    seen = {}
    problems = []

    for cat, items in GROUPS:
        for name, _kw in items:
            if name in seen:
                problems.append("图标 %s 同时出现在 %s 和 %s" % (name, seen[name], cat))
            seen[name] = cat
            if name not in PATHS:
                problems.append("图标 %s 缺少绘制数据（先跑 fetch 脚本）" % name)

    for name in FAVORITES:
        if name not in seen:
            problems.append("常用里的 %s 不在任何分类中" % name)

    # favorite 是虚拟分类，允许与归属分类重叠；其余分类两两不许重叠（上面 seen 已保证）
    if len(FAVORITES) != len(set(FAVORITES)):
        problems.append("常用列表里有重复项")

    if problems:
        for p in problems:
            print("  ! " + p, file=sys.stderr)
        raise SystemExit("图标自查未通过，已中止")


def main():
    check()
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

"""临时脚本：从谷歌 Material Icons 官方仓库拉取 24px SVG，产出 icons.js 的 path 片段。

用法：python _fetch_icons.py <图标名...>
每个名字会依次在 18 个分类目录里找，找到就打印 「name: '<内容>'」，
内容已去掉那张 fill="none" 的透明底板，只留 path / circle / rect / polygon。
"""
import re
import sys
import urllib.request

CATEGORIES = [
    "action", "alert", "av", "communication", "content", "device", "editor",
    "file", "hardware", "home", "image", "maps", "navigation",
    "notification", "places", "search", "social", "toggle",
]

BASE = ("https://raw.githubusercontent.com/google/material-design-icons/"
        "master/src/{cat}/{name}/materialicons/24px.svg")

# 只保留绘图元素，丢掉 <svg> 外壳和那张透明底
KEEP = re.compile(r"<(path|circle|rect|polygon|ellipse)\b[^>]*?/>", re.S)
# 去掉 fill="none" 的底板
NO_FILL = re.compile(r'<path\b[^>]*fill="none"[^>]*?/>', re.S)


def fetch(name):
    for cat in CATEGORIES:
        url = BASE.format(cat=cat, name=name)
        try:
            with urllib.request.urlopen(url, timeout=20) as resp:
                svg = resp.read().decode("utf-8")
        except Exception:
            continue
        svg = NO_FILL.sub("", svg)
        parts = KEEP.findall(svg)  # 只看标签名，重建时再取原文
        if not parts:
            continue
        # 按出现顺序取原文
        pieces = [m.group(0) for m in KEEP.finditer(svg)]
        body = "".join(pieces)
        # 统一成单引号包裹，方便塞进 JS 单引号字符串
        body = body.replace("\n", "").replace("  ", " ")
        return cat, body
    return None, None


def main():
    names = sys.argv[1:]
    missing = []
    for name in names:
        cat, body = fetch(name)
        if body is None:
            missing.append(name)
            continue
        print(f"{name}: '{body}',".replace("'", "'"))
        print(f"    # <- {cat}", file=sys.stderr)
    if missing:
        print("MISSING: " + ", ".join(missing), file=sys.stderr)


if __name__ == "__main__":
    main()

"""一次性脚本：从 Material Symbols（新版）拉取 24px outlined SVG，追加到 tools/_new3.txt。

旧版 material-design-icons 的 src/ 分类目录里没有 cardiology / genetics / pill /
syringe / book_4，这些只存在于新的 symbols/web 目录里。

⚠️ 两套图标的坐标系不一样：
  - 旧版（src/<cat>/<name>/materialicons/24px.svg）：viewBox="0 0 24 24"
  - 新版（symbols/web/<name>/materialsymbolsoutlined/<name>_24px.svg）：viewBox="0 -960 960 960"
本项目所有渲染处都写死了 viewBox="0 0 24 24"，所以这里**必须**把新图标换算到 24 网格：
  x24 = x960 / 40，y24 = (y960 + 960) / 40
用 <g transform="translate(0,24) scale(0.025)"> 包一层最省事，
既不用改一串 path 数字，也不用动 4 处渲染代码。

⚠️ transform 的顺序不能写反：
  translate(0,960) scale(0.025)  会先把平移量也缩 40 倍（实际只移了 24），
                                 y 最终落在 ≈939，图标整个飞出视窗。
  translate(0,24) scale(0.025)   实测 bbox = [1, 3, 22, 18.35]，正好落在 0~24 内。
"""
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "tools" / "_new3.txt"

BASE = ("https://raw.githubusercontent.com/google/material-design-icons/"
        "master/symbols/web/{n}/materialsymbolsoutlined/{n}_24px.svg")

# 只保留绘图元素，丢掉 <svg> 外壳和透明底板
KEEP = re.compile(r"<(path|circle|rect|polygon|ellipse)\b[^>]*?/>", re.S)
NO_FILL = re.compile(r'<path\b[^>]*fill="none"[^>]*?/>', re.S)

NAMES = ["cardiology", "genetics", "pill", "syringe", "book_4"]

# 960 网格 -> 24 网格：先缩到 1/40，再把 y 抬回 24（即 y24 = y960/40 + 24）
# 顺序不能反，详见文件头注释。
TRANSFORM = "translate(0,24) scale(0.025)"


def fetch(name):
    with urllib.request.urlopen(BASE.format(n=name), timeout=30) as resp:
        svg = resp.read().decode("utf-8")

    m = re.search(r'viewBox="([^"]+)"', svg)
    viewbox = m.group(1) if m else ""
    svg = NO_FILL.sub("", svg)
    body = "".join(x.group(0) for x in KEEP.finditer(svg))
    body = re.sub(r"\s+", " ", body).strip()

    if viewbox != "0 0 24 24":
        # 换到 24 网格，渲染处 viewBox="0 0 24 24" 就能直接用
        body = '<g transform="%s">%s</g>' % (TRANSFORM, body)
    return viewbox, body


def main():
    lines = []
    for name in NAMES:
        viewbox, body = fetch(name)
        if not body:
            print("EMPTY: " + name, file=sys.stderr)
            continue
        lines.append("%s: '%s'," % (name, body))
        print("%-12s viewBox=%-16s %2d elements, %4d chars"
              % (name, viewbox, body.count("<"), len(body)), file=sys.stderr)
    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("wrote " + str(OUT), file=sys.stderr)


if __name__ == "__main__":
    main()

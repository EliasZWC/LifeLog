"""一次性脚本：渲染「医疗健康 / 学习 / 工作」三个分类的全部图标，肉眼核对新增与迁移。"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WWW = ROOT / "app" / "src" / "main" / "assets" / "www"
t = (WWW / "icons.js").read_text(encoding="utf-8")

entries = re.findall(
    r"^\s{8}([a-z_0-9]+):\s*\{\s*\n\s*cat:\s*'([^']*)',\s*\n\s*kw:\s*'([^']*)',\s*\n"
    r"\s*path:\s*'(<.*?>)',?\s*\n\s*\},",
    t, re.M,
)

SHOW = {
    "health": "医疗健康 (新增 cardiology/genetics/pill/syringe)",
    "study": "学习 (book / book_4 迁入)",
    "work": "工作 (call / email / star 迁入)",
    "daily": "日常",
}
NEW = {"cardiology", "genetics", "pill", "syringe", "book_4"}
MOVED = {"call", "email", "star", "book", "book_4"}

sections = []
for cat, title in SHOW.items():
    items = [(n, p) for n, c, _k, p in entries if c == cat]
    cards = []
    for name, path in items:
        tag = "NEW" if name in NEW else ("MOVED" if name in MOVED else "")
        cards.append(
            '<figure class="%s"><svg viewBox="0 0 24 24">%s</svg>'
            '<figcaption><b>%s</b><small>%s</small></figcaption></figure>'
            % (tag.lower(), path, name, tag)
        )
    sections.append('<h2>%s <em>%d</em></h2><div class="grid">%s</div>'
                    % (title, len(items), "".join(cards)))

html = """<!doctype html><meta charset="utf-8"><title>category preview</title>
<style>
 body{background:#1E1E1E;color:#ECECEA;font:13px/1.4 system-ui;padding:20px}
 h2{font-size:14px;margin:22px 0 10px;color:#A9E5BC;font-weight:700}
 h2 em{color:#7E7E7C;font-style:normal;font-weight:400}
 .grid{display:flex;flex-wrap:wrap;gap:16px}
 figure{margin:0;width:72px;text-align:center}
 svg{width:40px;height:40px;fill:#ECECEA;display:block;margin:0 auto 6px;
     outline:1px dashed rgba(236,236,234,.22)}
 figcaption{font-size:10px;word-break:break-all;color:#9A9A98}
 figcaption b{display:block;color:#ECECEA;font-weight:600}
 figcaption small{display:block;color:#A9E5BC}
 figure.moved figcaption small{color:#FFD479}
</style>""" + "".join(sections)

out = WWW / "_category-preview.html"
out.write_text(html, encoding="utf-8")
print("wrote", out)

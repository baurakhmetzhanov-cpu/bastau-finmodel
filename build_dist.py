"""Собирает dist/finmodel.html: страница одним файлом (стили и скрипты внутри)."""
import re, pathlib
root = pathlib.Path(__file__).parent
html = (root / "index.html").read_text(encoding="utf-8")
css = (root / "css/style.css").read_text(encoding="utf-8")
html = html.replace('<link rel="stylesheet" href="css/style.css">', "<style>\n" + css + "</style>")
def inline(m):
    js = (root / m.group(1)).read_text(encoding="utf-8").replace("</script", "<\\/script")
    return "<script>\n" + js + "\n</script>"
html = re.sub(r'<script src="([^"]+)"></script>', inline, html)
(root / "dist").mkdir(exist_ok=True)
(root / "dist/finmodel.html").write_text(html, encoding="utf-8")
print("dist/finmodel.html", len(html.encode()) // 1024, "KB")

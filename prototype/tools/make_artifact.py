"""Bundle index.html + icons.js into one self-contained HTML fragment (for sharing as a single file).

Usage: python3 tools/make_artifact.py OUTPUT.html
"""
import os, sys

here = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(here)
html = open(os.path.join(root, "index.html"), encoding="utf-8").read()
icons = open(os.path.join(root, "icons.js"), encoding="utf-8").read()
body = html.split("<!--APP-START-->", 1)[1].split("<!--APP-END-->", 1)[0]
body = body.replace("</head>\n<body>\n", "")
body = body.replace('<script src="icons.js"></script>', "<script>" + icons + "</script>")
open(sys.argv[1], "w", encoding="utf-8").write(body)
print("wrote", sys.argv[1], len(body) // 1024, "KB")

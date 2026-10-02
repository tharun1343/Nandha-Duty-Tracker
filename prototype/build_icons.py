"""Rebuild icons.js (base64 data URIs) from the PNGs in ./icons.

Icons: Microsoft Fluent UI Emoji (3D), MIT licence — https://github.com/microsoft/fluentui-emoji
"""
import base64, json, os

here = os.path.dirname(os.path.abspath(__file__))
src = os.path.join(here, "icons")
icons = {}
for name in sorted(os.listdir(src)):
    if name.endswith(".png"):
        with open(os.path.join(src, name), "rb") as fh:
            icons[name[:-4]] = "data:image/png;base64," + base64.b64encode(fh.read()).decode()
with open(os.path.join(here, "icons.js"), "w") as fh:
    fh.write("window.ICONS=" + json.dumps(icons) + ";\n")
print(f"{len(icons)} icons written to icons.js")

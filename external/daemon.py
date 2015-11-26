#!/usr/bin/env python
import sys
import json
from render_tile import ImageProvider

while 1:
    line = sys.stdin.readline()
    if not line:
        break
    env = json.loads(line)
    renderer = ImageProvider(str(env.get('mapnikXml')))
    imgString = renderer.render_tile(env.get('x'), env.get('y'), env.get('z'))
    sys.stdout.write(imgString);
    sys.stdout.flush()



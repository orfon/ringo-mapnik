#!/usr/bin/env python
import sys
import json
from render_tile import ImageProvider
import struct

while 1:
    line = sys.stdin.readline()
    if not line:
        break
    try:
        env = json.loads(line)
        renderer = ImageProvider(str(env.get('mapnikXml')))
        imgString = renderer.render_tile(env.get('x'), env.get('y'), env.get('z'), env.get('utfGrid'))
        imgStringByteArray = bytearray(imgString)
        imgStringLen = len(imgStringByteArray)
        # for debugging
        # sys.stderr.write('len: ' + str(imgStringLen) + '\n')
        # sys.stderr.flush()

        sys.stdout.write(struct.pack('!i', imgStringLen))
        sys.stdout.write(imgStringByteArray)
        sys.stdout.flush()
    except Exception as e:
        sys.stderr.write(str(e) + '\n')
        sys.stderr.flush()
        # write 0 so java nows there was an error
        sys.stdout.write(struct.pack('!i', 0))
        sys.stdout.flush()



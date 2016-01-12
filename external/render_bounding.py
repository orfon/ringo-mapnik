#!/usr/bin/env python
import sys
import os
from render_tile import ImageProvider
from ast import literal_eval as make_tuple

if __name__ == "__main__":

    mapfile = os.environ['MAPNIK_MAP_FILE']
    tile_file = os.environ['MAPNIK_TILE_FILE']
    bbox = make_tuple(os.environ['MAPNIK_BBOX'])

    renderer = ImageProvider(mapfile)
    img = renderer.render_bounding(bbox)
    img.save(tile_file, 'png256')
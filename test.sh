#export MAPNIK_MAP_FILE=/home/simon/geo/ringo-mapnik/tests/fixtures/germans-vienna.xml
export MAPNIK_MAP_FILE=/home/simon/geo/ringo-mapnik/tests/fixtures/austrians-vienna.xml
export MAPNIK_TILE_DIR=/home/simon/geo/ringo-mapnik/tests/fixtures/testout/
# world
#export MAPNIK_BBOX="(-180.0,-90.0, 180.0,90.0)"
# vienna
#export MAPNIK_BBOX="(16.181822542508847, 48.11789767624906, 16.577504331553047, 48.32266000349662)"
# austria
export MAPNIK_BBOX="(9.53074,46.3723,17.16077,49.02052)"
export MAPNIK_UTFGRID=false
./external/generate_tiles.py

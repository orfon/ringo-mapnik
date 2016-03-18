Work in progress beta software.

# Mapnik rendering

Render tiles with mapnik.

ringo-mapnik comes with a high-level "Map" class to work with a multi-layer,
styled map but also exposes low-level modules for typical tasks such as converting
style information, dealing with GeoJson and handling multi-threaded mapnik
renders.

## Rendering

Thread-pool for fast on-demand tile rendering or bulk-rendering of whole maps.

## GeoJson

Fast GeoJson class based on minimal-json.

## Support style conversions

  * SLD into intermediate JSON representation
  * JSON into MSS
  * JSOn into cartoCss
  * MSS into cartoCSS

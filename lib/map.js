var fs = require('fs');
var {command} = require('ringo/subprocess');

var {MapnikWriter} = require('sld2mapnik/mapnikwriter');
var slreader = require('sld2mapnik/sldreader');
var generateTilesPy = module.resolve('../external/generate_tiles.py')

/**
 *
 */
exports.Map = function(mapPath) {

   this.createMapnikXmls = function() {
      map.layers.forEach(function(layer) {
         var mapnikWriter = new MapnikWriter();
         var geoJsonPath = fs.join(baseDirectory, layer.geojson);
         var sldXML = fs.read(fs.join(baseDirectory, layer.sld));
         var sldJson = slreader.parse(sldXML);

         var styleName = mapnikWriter.addLayer(geoJsonPath, layer.title);
         mapnikWriter.addStyle(sldJson, styleName);

         var mapnikFile = fs.base(layer.sld, '.sld') + '.xml';
         var mapnikXmlPath = fs.join(baseDirectory, mapnikFile);
         fs.write(mapnikXmlPath, mapnikWriter.toString());
         layer.mapnik = mapnikFile;

         var sldJsonFile = fs.base(layer.sld, '.sld') + '.json';
         var sldJsonPath = fs.join(baseDirectory, sldJsonFile);
         fs.write(sldJsonPath, JSON.stringify(sldJson));
         layer.sldJson = sldJsonFile;
      }, this);

   }

   this.save = function() {
      fs.write(mapPath, JSON.stringify(map));
   };

   this.renderTiles = function() {
      map.layers.forEach(function(layer) {
         if (layer.hasIcon == true && layer.hasPopups == true) {
            return;
         }
         var tileDirectory = layer.tiles || java.util.UUID.randomUUID().toString()
         var tilesPath = fs.join(baseDirectory, tileDirectory);
         layer.tiles = tileDirectory;
         fs.makeTree(tilesPath);
         var output = command(generateTilesPy, {
            env: {
               MAPNIK_MAP_FILE: fs.join(baseDirectory, layer.mapnik),
               MAPNIK_TILE_DIR: tilesPath,
               MAPNIK_BBOX: '(' + map.bounds.toString() + ')',
               MAPNIK_MIN_ZOOM: map.minZoom,
               MAPNIK_MAX_ZOOM: map.maxZoom,
               MAPNIK_UTFGRID: map.hasPopups
            }
         });
         console.log(output);
      })
   }

   var map = this.data = JSON.parse(fs.read(mapPath));
   var baseDirectory = fs.directory(mapPath);
   return this;
}
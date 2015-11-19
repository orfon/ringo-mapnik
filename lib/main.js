var fs = require('fs');
var $o = require('ringo/utils/objects');
var {command} = require('ringo/subprocess');

var generateTilesPy = module.resolve('../external/generate_tiles.py');
var generateSingleTilePy = module.resolve('../external/render_tile.py');
/**
 *
 */
exports.render = function(c) {
   var config = $o.merge(c, {
      mapnikXml: null,
      tileDirectory: null,
      bounds: null,
      minZoom: 5,
      maxZoom: 10,
      renderUtf: false
   });
   if (config.mapnikXml == null || config.tileDirectory == null || config.bounds == null) {
      throw 'Config is missing one of mapnikXml, tileDirectory or bounds';
   }
   // convert to python array (list) format
   var bounds = '(' + config.bounds.toString() + ')';
   var env = {
      MAPNIK_MAP_FILE: config.mapnikXml,
      MAPNIK_TILE_DIR: config.tileDirectory,
      MAPNIK_BBOX: bounds,
      MAPNIK_MIN_ZOOM: config.minZoom,
      MAPNIK_MAX_ZOOM: config.maxZoom,
      MAPNIK_UTFGRID: config.renderUtf
   };
   console.dir(env);
   var output = command(generateTilesPy, {
      env: env
   });
   return output;
}


exports.renderTile = function(c) {
   var config = $o.merge(c, {
      mapnikXml: null,
      MAPNIK_MIN_ZOOM: 8,
      x: null,
      y: null
   });

   var env = {
      MAPNIK_MAP_FILE: config.mapnikXml,
      MAPNIK_X: config.x,
      MAPNIK_Y: config.y,
      MAPNIK_Z: config.z
   }
   return command(generateSingleTilePy, {
      env: env,
      binary: true
   });
}
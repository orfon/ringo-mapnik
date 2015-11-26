var fs = require('fs');
var $o = require('ringo/utils/objects');
var {Stream, MemoryStream, TextStream} = require('io');
var {ByteArray} = require('binary');
var {command} = require('ringo/subprocess');

var generateTilesPy = module.resolve('../external/generate_tiles.py');
var generateSingleTilePy = module.resolve('../external/render_tile.py');
var daemonPy = module.resolve('../external/daemon.py');

exports.RenderDeamon = function() {

   var lock = {};

   this.process = null;

   this.start = function() {
      if (this.process != null) {
         throw new Error('already started');
      }
      var builder = new java.lang.ProcessBuilder(daemonPy);
      builder.redirectErrorStream(true);
      this.process = builder.start();
      this.processIn = new TextStream(new Stream(this.process.getOutputStream()));
      this.processOut = new java.io.DataInputStream(this.process.getInputStream());
   }

   this.stop = function() {
      this.process.destroy();
      this.processIn.close();
      this.processOut.close();
      // close alls streams/
      // send shutdown to py process
   }

   this.render = sync(function(c) {
      var config = $o.merge(c, {
         mapnikXml: null,
         x: null,
         y: null,
         z: null
      });
      var configText = JSON.stringify(config);
      this.processIn.writeLine(configText);
      this.processIn.flush();
      var timeStart = Date.now();
      while (this.processOut.available() === 0) {
         if (Date.now() - timeStart > 5 * 1000) {
            throw new Error("Mapnik read error - no data recieved");
         }
      }
      var byteArray = new ByteArray(this.processOut.available());
      this.processOut.read(byteArray);
      return byteArray;
   }, lock);

   return this;
}


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
      x: null,
      y: null,
      z: null
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
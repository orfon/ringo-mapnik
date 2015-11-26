var fs = require('fs');
var $o = require('ringo/utils/objects');
var {Stream, MemoryStream, TextStream} = require('io');
var {ByteArray} = require('binary');
var {command} = require('ringo/subprocess');

var generateTilesPy = module.resolve('../external/generate_tiles.py');
var generateSingleTilePy = module.resolve('../external/render_tile.py');
var daemonPy = module.resolve('../external/daemon.py');

function RenderProcess() {
   // number of seconds to wait for mapnik output
   var renderingTimeout = 20;

   this.lock = java.util.concurrent.locks.ReentrantLock();
   this.process = null;
   this.processIn = null;
   this.processOut = null;
   this.processError = null;

   this.stop = function() {
      this.process.destroy();
      this.processIn.close();
      this.processOut.close();
      // close alls streams/
      // send shutdown to py process
   }

   this.render = function(c) {
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
         if (Date.now() - timeStart > renderingTimeout * 1000) {
            throw new Error("Mapnik read error - no data recieved");
         }
      }
      if (this.processError.raw.inputStream.available() > 0) {
         console.error(this.processError.readLine());
      }
      var byteArray = new ByteArray(this.processOut.available());
      this.processOut.read(byteArray);
      return byteArray;
   };

   var builder = new java.lang.ProcessBuilder(daemonPy);
   this.process = builder.start();
   this.processIn = new TextStream(new Stream(this.process.getOutputStream()));
   this.processOut = new java.io.DataInputStream(this.process.getInputStream());
   this.processError = new TextStream(new Stream(this.process.getErrorStream()));

   return this;
}

exports.RenderDeamon = function(numberOfThreads) {

   numberOfThreads = numberOfThreads || 20;
   this.processList = [];

   this.start = function() {
      for (var i = 0; i < numberOfThreads; i++) {
         this.processList.push(new RenderProcess());
      }
   }

   this.stop = function() {
      this.processList.forEach(function(process) {
         process.stop();
      });
   }

   this.render = function(c) {
      // find first unlocked process and use it
      var found = null;
      this.processList.some(function(p) {
         if (p.lock.tryLock(0, java.util.concurrent.TimeUnit.SECONDS) == true) {
            found = p;
            return true;
         }
      });

      console.log(java.lang.Thread.currentThread().getId(), '0sec lock found?', found);

      if (found == null) {
         // if none found, try waiting for a random thread
         var randomIndex = Math.floor(Math.random() * this.processList.length);
         found = this.processList[randomIndex];
         var didLock = found.lock.tryLock(30, java.util.concurrent.TimeUnit.SECONDS);
         if (didLock == false) {
            // couldnt grab a process in time
            return false;
         }
      }

      try {
         return found.render(c);
      } finally {
         found.lock.unlock();
      }
   };



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
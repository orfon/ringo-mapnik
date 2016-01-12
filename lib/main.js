var fs = require('fs');
var $o = require('ringo/utils/objects');
var {Stream, MemoryStream, TextStream} = require('io');
var {ByteArray} = require('binary');
var {command} = require('ringo/subprocess');
var log = require('ringo/logging').getLogger(module.id);

var generateTilesPy = module.resolve('../external/generate_tiles.py');
var generateBoundingPy = module.resolve('../external/render_bounding.py');
var daemonPy = module.resolve('../external/daemon.py');

// number of seconds to wait for mapnik output
var renderingTimeout = 20;

/**
 * Keeps a python process running to render mapnik tiles.
 * Task to render is sent to python via stdin as a one line JSON string: {x: int, y: int, z: int, mapnikXml: /path/to/xml}
 * The response form the python daemon is:
 *     4 bytes length of png
 *     x bytes png data
 *
 */
function RenderProcess() {

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

   this.start = function() {
      if (this.process != null) {
         this.process.destroy();
      }
      this.process = builder.start();
      this.processIn = new TextStream(new Stream(this.process.getOutputStream()));
      this.processOut = new java.io.DataInputStream(this.process.getInputStream());
      this.processError = new TextStream(new Stream(this.process.getErrorStream()));

   }

   this.render = function(c) {
      var config = $o.merge(c, {
         mapnikXml: null,
         x: null,
         y: null,
         z: null,
         utfGrid: false
      });
      var configText = JSON.stringify(config);
      log.debug('query for', configText);
      this.processIn.writeLine(configText);
      this.processIn.flush();
      // first four byte (integer) is length of rendered png
      var pngByteSize = this.processOut.readInt();
      if (pngByteSize < 0) {
         log.error('negative png size. Restarting process');
         this.restart();
         return this.render(c);
      }
      if (pngByteSize > 0) {
         log.debug('start reading')
         log.debug('pngByteSize', pngByteSize);
         var byteArray = new ByteArray(pngByteSize);
         this.processOut.readFully(byteArray);
      }
      if (this.processError.raw.inputStream.available() > 0) {
         log.error('stderror size:', this.processError.readLine());
      }
      log.debug('finished reading')
      return byteArray;
   };

   var builder = new java.lang.ProcessBuilder(daemonPy);
   return this;
}

/**
 * Keep a list of rendering processes and delegates each render
 * to the first available. If none are available the rendering will
 * block for maximum of renderingTimeout+1 seconds to wait for a thread
 * to become available.
 */
exports.RenderDeamon = function(numberOfThreads) {

   numberOfThreads = numberOfThreads || 20;
   this.processList = [];

   this.start = function() {
      for (var i = 0; i < numberOfThreads; i++) {
         var renderProcess = new RenderProcess();
         renderProcess.start();
         this.processList.push(renderProcess);
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
         // tryLock(0) instead of tryLock() to honor waiting list
         if (p.lock.tryLock(0, java.util.concurrent.TimeUnit.SECONDS) == true) {
            found = p;
            return true;
         }
      });

      if (found == null) {
         // if none found, try waiting for a random thread
         var randomIndex = Math.floor(Math.random() * this.processList.length);
         found = this.processList[randomIndex];
         var didLock = found.lock.tryLock(renderingTimeout + 1, java.util.concurrent.TimeUnit.SECONDS);
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

exports.renderBounding = function(c) {
   var config = $o.merge(c, {
      mapnikXml: null,
      boundingBox: [],
      tileFile: null
   });

   var env = {
      MAPNIK_MAP_FILE: config.mapnikXml,
      MAPNIK_BBOX: config.boundingBox,
      MAPNIK_TILE_FILE: config.tileFile
   };
   console.dir(env);
   return command(generateBoundingPy, {
      env: env
   });
}
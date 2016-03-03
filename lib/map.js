var fs = require('fs');
var {command} = require('ringo/subprocess');
var $o = require('ringo/utils/objects');
var {command} = require('ringo/subprocess');
var log = require('ringo/logging').getLogger(module.id);

var {MapnikWriter} = require('./style/mapnikwriter');
var mssWriter = require('./style/msswriter');
var sldreader = require('./style/sldreader');
var mapnik = require('./mapnik');
var Renderer = require('carto/carto/renderer').Renderer;

var useShapePreview = false;
var gdalBinPath = "/usr/bin/";

var {GeoJson} = require('./geojson');

var mapMetadata = {
    "layers": [],
    "popup": {
        "template": "",
        "layerId": null
    },
    "controls": {
        "zoom": true,
        "layer": "xor",
        "layerCollapsed": false,
        "minZoom": 7,
        "maxZoom": 9,
        "bounds": [],
        "initialBounds": [],
        "forceBounds": true,
        "forceInitialBounds": false,
        "basemap": "bmapgrau"
    },
    "texts": {
        "title": "",
        "attribution": "",
        "description": "",
        "legend": []
    },
    "backend": {
        "isUtfDirty": false,
        "isTilesDirty": false,
        "isRendering": false
    }
};

var renderDaemon = module.singleton('renderdaemon', function() {
    var renderDaemon = new mapnik.RenderDeamon();
    renderDaemon.start();
    return renderDaemon;
});

/*
require('ringo/engine').addShutdownHook(function() {
    renderDaemon.stop();
});
*/


exports.MapFactory = function(config) {
    this.get = function(id) {
        return new Map(fs.join(this.config.basePath, id));
    };

    this.list = function() {
       var directories = fs.list(this.config.basePath);

       var maps = directories.filter(function(dir) {
          return dir.substring(0,1) !== '.';
       }).map(function(dir) {
          var map = new Map(fs.join(this.config.basePath, dir));
          var obj = map.serialize();
          obj.id = dir;
          obj.lastModified = (fs.lastModified(map.metadataPath)).getTime();
          return obj;
       }, this)

       maps.sort(function(a, b) {
          return a.lastModified < b.lastModified ? 1 : -1;
       });
       return maps;
    };

    this.create = function(title) {
        var mapIdTitle = title.replace(/[^a-zA-z0-9]/g, '').replace(/qgs$/, '');
        var mapId = mapIdTitle + '-' + java.util.UUID.randomUUID().toString().split('-')[0];
        var mapBaseDirectory = fs.join(this.config.basePath, mapId);
        fs.makeDirectory(mapBaseDirectory);

        var metadataPath = fs.join(mapBaseDirectory, 'metadata.json');
        var metadata = $o.merge({
            texts: {
                title: title,
                legend: []
            }
        }, mapMetadata)
        fs.write(metadataPath, JSON.stringify(metadata))

        return new Map(mapBaseDirectory);
    }

    this.config = config;

    return this;
}

var Map = exports.Map = function(mapBaseDirectory) {
    this.baseDirectory = mapBaseDirectory;
    this.id = this.baseDirectory.split('/').slice(-1)[0];
    this.mssPath = fs.join(this.baseDirectory, 'style.mss');
    this.metadataPath = fs.join(this.baseDirectory, 'metadata.json');
    this.metadata = JSON.parse(fs.read(this.metadataPath));
    this.layers = this.metadata.layers.map(function(layerData) {
        return new Layer(fs.join(this.baseDirectory, layerData.id), layerData);
    }, this);

    return this;
}

Map.prototype = {

    updatePopup: function() {
        if (this.metadata.popup.layerId == null) {
            return false;
        }
        var layer = this.getById(this.metadata.popup.layerId);
        layer.setPopupTemplate(this.metadata.popup.template);
    },
    getMss: function() {
        try {
            return fs.read(this.mssPath);
        } catch (e) {
            return null;
        }
    },

    setMss: function(mss) {
        fs.write(this.mssPath, mss);
        this.metadata.backend.isTilesDirty = true;
    },
    addMss: function(mss) {
        fs.write(this.mssPath, this.getMss() + '\n\n' + mss);
    },
    addLayer: function(title, geoJson, opacity) {
        var cleanTitle = title.toLowerCase().replace(/[^a-zA-z0-9]/g, '');
        var layerId = java.util.UUID.randomUUID().toString();
        var layerBasePath = fs.join(this.baseDirectory, layerId);
        fs.makeDirectory(layerBasePath);
        var layer = new Layer(layerBasePath, {
            id: layerId,
            title: cleanTitle,
            displayTitle: title,
            opacity: opacity
        });
        layer.setGeo(geoJson);
        this.layers.push(layer);
        // @@ Fix merge multi bounds
        this.metadata.controls.bounds = geoJson.extent();
        return layer;
    },
    serialize: function() {
        return $o.merge({
            layers: this.layers.map(function(l) { return l.serialize(); })
        }, this.metadata);
    },
    save: function() {
        this.metadata = this.serialize();
        fs.write(this.metadataPath, JSON.stringify(this.metadata));
    },
    createMssFromSld: function() {
        var mss = ""
        this.layers.forEach(function(layer) {
            var sldJson = sldreader.parse(layer.getSld());
            mss += '/**\n * Layer ' + layer.metadata.title + '\n *\n */\n';
            mss += mssWriter.transform(sldJson, layer.metadata.title);
            mss += '\n\n';

        });
        fs.write(this.mssPath, mss);
    },
    createMapnikFromMss: function() {
        this.layers.forEach(function(layer) {
            layer.createMapnikFromMss(this.getMss());
            layer.createMapnikPreviewFromMss(this.getMss());
        }, this);
    },
    render: function() {
        this.renderTiles();
        this.renderUtf();
    },
    renderTiles: function(zoomLevel, bounds) {
        bounds = bounds || this.metadata.controls.bounds;
        var levels = zoomLevel == null ?
            [this.metadata.controls.minZoom, this.metadata.controls.maxZoom]
            : [zoomLevel, zoomLevel];
        this.layers.forEach(function(layer) {
            layer.renderTiles(levels, bounds);
        });
        this.metadata.backend.isTilesDirty = false;
    },
    renderUtf: function(zoomLevel, bounds) {
        bounds = bounds || this.metadata.controls.bounds;
        var levels = zoomLevel == null ?
            [this.metadata.controls.minZoom, this.metadata.controls.maxZoom]
            : [zoomLevel, zoomLevel];

        this.layers.forEach(function(layer) {
            if (this.metadata.popup.layerId === layer.id) {
               layer.renderUtf(levels, bounds);
            }
        }, this);
        this.metadata.backend.isUtfDirty = false;
    },
    renderPreview: function() {
        mapnik.renderBounding({
           mapnikXml: this.layers[0].mapnikPath,
           boundingBox: this.metadata.controls.bounds,
           tileFile: fs.join(this.baseDirectory, 'preview.png')
        });
    },
    /**
     * The highest zoom level must produce less than 10.000 tiles.
     */
    maxZoomAllowed: function() {
       var maxZoom = 0;
       for (var z = 0; z < 23; z++) {
         var tiles = this.layers.map(function(layer) {
            return layer.getTileCount(z, this.metadata.controls.bounds);
         }, this);
         var sum = tiles.reduce(function(pv, cv) { return pv + cv; }, 0);
         if (sum > 10 * 1000) {
            break;
         }
         maxZoom = z;
       }
       return maxZoom;
    },

    updateMetadata: function(newData) {
        // clean params input
        for (var key in this.metadata) {
            if (newData[key] === 'null') {
               newData[key] = null;
            }
            for (var secondaryKey in newData[key]) {
               if (newData[key][secondaryKey] == 'null') {
                  newData[key][secondaryKey] = null;
               }
            }
        }
        var tilesDirty = false;
        var utfDirty = false;
        if (this.metadata.controls.minZoom > newData.controls.minZoom) {
            tilesDirty = true;
        }
        if (this.metadata.controls.maxZoom < newData.controls.maxZoom) {
            tilesDirty = true;
        }
        if (this.metadata.popup.template != newData.popup.template) {
            utfDirty = true;
        }
        if (this.metadata.popup.layerId != newData.popup.layerId) {
            utfDirty = true;
        }

        for (var key in this.metadata) {
            this.metadata[key] = $o.merge(newData[key], this.metadata[key]);
        }
        if (utfDirty) {
            this.updatePopup();
        }
        this.metadata.backend = {
            isTilesDirty: this.metadata.backend.isTilesDirty || tilesDirty,
            isUtfDirty: this.metadata.backend.isUtfDirty || utfDirty
        }
    },
    // rename, move and remove layers
    updateLayers: function(newLayerInfo) {
        var newLayers = [];
        newLayerInfo.forEach(function(info) {
            var layer = this.getById(info.id);
            layer.metadata.title = info.title;
            layer.metadata.displayTitle = info.displayTitle;
            layer.metadata.opacity = parseFloat(info.opacity, 10);
            newLayers.push(layer);

        }, this)
        this.layers = newLayers;
    },
    getTile: function(layerId, z, x, y) {
        return this.getById(layerId).getTile(z, x, y);
    },
    getJsonTile: function(layerId, z, x, y) {
       return this.getById(layerId).getJsonTile(z, x, y);
    },
    getById: function(layerId) {
       var found = null;
       this.layers.some(function(layer) {
          if (layer.id === layerId) {
             found = layer;
             return true;
          }
       })
       return found;
    }
}


var Layer = exports.Layer = function(baseDirectory, metadata) {
    this.metadata = $o.merge(metadata, {
        opacity: 1,
        title: '',
        displayTitle: '',
        id: java.util.UUID.randomUUID().toString()
    });
    this.id = this.metadata.id;
    this.baseDirectory = baseDirectory;

    this.sldPath = fs.join(this.baseDirectory, 'style.sld');
    this.geoPath = fs.join(this.baseDirectory, 'data.geojson');
    this.mapnikPath = fs.join(this.baseDirectory, 'style.xml');
    this.previewMapnikPath = fs.join(this.baseDirectory, 'previewstyle.xml');
    this.csvPath = fs.join(this.baseDirectory, 'data.csv');
    this.shapePath = fs.join(this.baseDirectory, 'previewdata.shp');
    this.tilesPath = fs.join(this.baseDirectory);
    return this;
}

Layer.prototype = {
    getPropertyDetails: function() {
        return new GeoJson(this.getGeo()).getPropertyDetails();
    },
    serialize: function() {
        return this.metadata;
    },
    getSld: function() {
        try {
            return fs.read(this.sldPath);
        } catch (e) {
            return null;
        }
    },
    setPopupTemplate: function(template) {
        var geoJson = new GeoJson(this.getGeo());
        geoJson.setPopupTemplate(template);
        this.setGeo(geoJson);
    },
    setGeo: function(json) {
        fs.write(this.geoPath, json);
        this.createShapefile();
    },
    getGeo: function() {
        try {
            return fs.read(this.geoPath);
        } catch (e) {
            return null;
        }
    },
    getMapnik: function() {
        try {
            return fs.read(this.mapnikPath);
        } catch (e) {
            return null;
        }
    },
    createMapnikPreviewFromMss: function(mss) {
        this.createMapnikFromMss(mss, true);
    },
    createMapnikFromMss: function(mss, isPreview) {
        var datasource = {
            type: 'geojson',
            base: this.baseDirectory,
            file: 'data.geojson'
        }
        var outputPath = this.mapnikPath;
        if (isPreview === true) {
           datasource = {
              type: 'ogr',
              base: this.baseDirectory,
              file: fs.base(this.shapePath),
              layer_by_index: 0
           }
           outputPath = this.previewMapnikPath;
        }
        var mml = {
            srs: "+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0.0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs +over",
            Stylesheet: [{
              id: this.id,
              data: mss
            }],
            Layer: [{
                name: this.metadata.title,
                srs: '+proj=longlat +ellps=WGS84 +datum=WGS84 +no_defs',
                Datasource: datasource
            }]
        };
        var r = new Renderer({
            mapnik_version: '2.3.0',
            filename: this.getSld()
        });
        var mapnikXml = r.render(mml);
        fs.write(outputPath, mapnikXml);
    },
    renderUtf: function(zoomLevels, bounds) {
        if (false == fs.exists(this.tilesPath)) {
            fs.makeTree(this.tilesPath);
        }
        var output = mapnik.render({
            mapnikXml: this.mapnikPath,
            tileDirectory: this.tilesPath,
            bounds: bounds,
            minZoom: zoomLevels[0],
            maxZoom: zoomLevels[1],
            renderUtf: true
        });
        console.log(output);
    },

    renderTiles: function(zoomLevel, bounds) {
        if (false == fs.exists(this.tilesPath)) {
            fs.makeTree(this.tilesPath);
        }
        var output = mapnik.render({
            mapnikXml: this.mapnikPath,
            tileDirectory: this.tilesPath,
            bounds: bounds,
            minZoom: zoomLevel[0],
            maxZoom: zoomLevel[1],
            renderUtf: false
        });
        console.log(output);
    },
    getTile: function(z, x, y) {
        return renderDaemon.render({
            mapnikXml: useShapePreview ? this.previewMapnikPath : this.mapnikPath,
            x: parseInt(x, 10),
            y: parseInt(y, 10),
            z: parseInt(z, 10),
            utfGrid: false
        });
    },
    getJsonTile: function(z, x, y) {
       return renderDaemon.render({
          mapnikXml: useShapePreview ? this.previewMapnikPath : this.mapnikPath,
          x: parseInt(x, 10),
          y: parseInt(y, 10),
          z: parseInt(z, 10),
          utfGrid: true
       })
    },
    createShapefile: function() {
      var mapping = {
         '(Multi Polygon)': 'MULTIPOLYGON',
         '(Polygon)': 'POLYGON',
         '(Line String)': 'LINESTRING',
         '(Point)': 'POINT'

      };
      var shapeInfo = command(gdalBinPath + 'ogrinfo', '-ro','-so','-q', this.geoPath);
      var shapeType = null;
      for (var key in mapping) {
         if (shapeInfo.indexOf(key) > -1) {
            shapeType = mapping[key];
            break;
         }
      }
      if (shapeType === null) {
         log.error('Unknown geojson shape type format. Ogrinfo output: ', shapeInfo);
         throw Error('Unbekanntes Datenformat: ', shapeInfo);
      }
      if (fs.exists(this.shapePath)) {
         fs.remove(this.shapePath);
      }
      var convertOutput = command(gdalBinPath + 'ogr2ogr', '-skipfailures',
            '-nlt', shapeType,
            this.shapePath, this.geoPath, '-lco', 'ENCODING=UTF-8');
      if (convertOutput != "") {
         log.info('Error converting to shapefile', convertOutput);
      }
    },
    getTileCount: function(maxZoom, bounds) {
       // http://wiki.openstreetmap.org/wiki/Slippy_map_tilenames#lon.2Flat_to_tile_numbers_2
      function long2tile(lon, zoom) {
         return (Math.floor((lon+180)/360*Math.pow(2,zoom)));
      }
      function lat2tile(lat, zoom)  {
         return (Math.floor((1-Math.log(Math.tan(lat*Math.PI/180) + 1/Math.cos(lat*Math.PI/180))/Math.PI)/2 *Math.pow(2,zoom)));
      }

      function countTiles(minZoom, maxZoom, bounds) {
         var tileCount = 0;

         for (var z = minZoom; z <= maxZoom + 1; z++) {
            var tilesDx = long2tile(bounds[2], z) - long2tile(bounds[0], z) + 1;
            var tilesDy = lat2tile(bounds[1], z) - lat2tile(bounds[3], z) + 1;
            tileCount += tilesDx * tilesDy;
         }
         return tileCount;
      }

      return countTiles(0, maxZoom, bounds);
    }
};

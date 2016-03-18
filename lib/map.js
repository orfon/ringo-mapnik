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

/**
 * Singleton MapFactory for retrieving and creating existing maps.
 * Alls maps are stored in a base directory and reference by id.
 *
 * @param {Object} config {basePath}
 */
exports.MapFactory = function(config) {

    /**
     * @param {String} id
     * @returns {Map} map
     */
    this.get = function(id) {
        return new Map(fs.join(this.config.basePath, id));
    };

    /**
     * Returns a list of non-blocked maps.
     * @returns {Array} of map instances
     */
    this.list = function() {
       var directories = fs.list(this.config.basePath);

       var maps = directories.filter(function(dir) {
          return dir.substring(0,1) !== '.'
                  && fs.isDirectory(fs.join(this.config.basePath, dir))
                  && false == fs.exists(fs.join(this.config.basePath, dir, 'globus-blocked'));
       }, this).map(function(dir) {
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

    /**
     * The id of the map is the cleaned title (some characters replaced)
     * with a random suffix.
     * @param {String} title
     * @returns {Map}
     */
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

/**
 * A Map consists of layers
 */
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

    /**
     * Blocking a map hides it in the list view.
     */
    block: function() {
      fs.write(fs.join(this.baseDirectory, 'globus-blocked'), new Date());
    },

    updatePopup: function() {
        if (this.metadata.popup.layerId == null) {
            return false;
        }
        var layer = this.getById(this.metadata.popup.layerId);
        layer.setPopupTemplate(this.metadata.popup.template);
    },
    /**
     * @returns {String} mss cartocss Styling
     */
    getMss: function() {
        try {
            return fs.read(this.mssPath);
        } catch (e) {
            return null;
        }
    },

    /**
     * Set new cartocss Styling
     * @params {String} mss cartocss Styling
     */
    setMss: function(mss) {
        fs.write(this.mssPath, mss);
        this.metadata.backend.isTilesDirty = true;
    },
    /**
     * append cartocss Styling to existing sheet
     * @params {String} mss
     */
    addMss: function(mss) {
        fs.write(this.mssPath, this.getMss() + '\n\n' + mss);
    },
    /**
     * Add a layer.
     * @param {String} title
     * @param {GeoJson} geoJson
     * @param {Number} opacity
     */
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
    /**
     * Returns metadata for the map itself and all layers.
     * @returns {Object} metadata
     */
    serialize: function() {
        return $o.merge({
            layers: this.layers.map(function(l) { return l.serialize(); })
        }, this.metadata);
    },
    /**
     * Save any metadata changes.
     */
    save: function() {
        this.metadata = this.serialize();
        fs.write(this.metadataPath, JSON.stringify(this.metadata));
    },
    /**
     * Create the mss Styling from the existing SLD file.
     */
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
    /**
     * Create mapnik styling from existing mss file.
     */
    createMapnikFromMss: function() {
        this.layers.forEach(function(layer) {
            layer.createMapnikFromMss(this.getMss());
            layer.createMapnikPreviewFromMss(this.getMss());
        }, this);
    },
    /**
     * Render all tiles - utf and raster - to display the map.
     */
    render: function() {
        this.renderTiles();
        this.renderUtf();
    },
    /**
     * Render raster tiles.
     */
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
    /**
     * Render UTF tiles
     */
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
    /**
     * Render a preview image of the whole map.
     */
    renderPreview: function() {
        mapnik.renderBounding({
           mapnikXml: this.layers[0].mapnikPath,
           boundingBox: this.metadata.controls.bounds,
           tileFile: fs.join(this.baseDirectory, 'preview.png')
        });
    },
    /**
     * The zoom level returned is the last acceptable zoomlevel
     * if less than 10.000 tiles should be produced.
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

    /**
     * Merge the given object into existing metadta.
     * @param {Object} metadata
     */
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
    /**
     * Merges the new layer info in the existing layers. Useful to reorder, re-name
     * or delete layers.
     * @param {Array} metadata for all layers
     */
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
    /**
     * Retrieve a single tile of the given layerId.
     * @param {String} layerId
     * @param {Number} zoom level
     * @param {Number} x tile coordinate
     * @param {Number} y tile coorindate
     * @returns {Binary} png image
     */
    getTile: function(layerId, z, x, y) {
        return this.getById(layerId).getTile(z, x, y);
    },
    /**
     * Retrieve a UTF map tile.
     * @param {String} layerId
     * @param {Number} zoom level
     * @param {Number} x tile coordinate
     * @param {Number} y tile coordinate
     * @returns {Binary} png image
     */
    getJsonTile: function(layerId, z, x, y) {
       return this.getById(layerId).getJsonTile(z, x, y);
    },
    /**
     * Retrieve a layer by id
     * @param {String} layerId
     * @returns {Binary} png image
     */
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

/**
 * A layer holds the polygon information as geojson, styling in either SLD,
 * mapnik xml or cartocss.
 * @param {String} baseDirectory of the map
 * @param {Object} metadta {opacity, title, displayTitle}
 * @returns {Layer}
 */
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
    /**
     * @returns {Array} type information and example for the shape's attributes
     */
    getPropertyDetails: function() {
        return new GeoJson(this.getGeo()).getPropertyDetails();
    },
    /**
     * @returns {Object} metadata
     */
    serialize: function() {
        return this.metadata;
    },
    /**
     *  @returns {String} SLD styling
     */
    getSld: function() {
        try {
            return fs.read(this.sldPath);
        } catch (e) {
            return null;
        }
    },
    /**
     * Set the new template String.
     * @param {String} template
     */
    setPopupTemplate: function(template) {
        var geoJson = new GeoJson(this.getGeo());
        geoJson.setPopupTemplate(template);
        this.setGeo(geoJson);
    },
    /**
     * Set the geojson
     * @param {GeoJson}
     */
    setGeo: function(json) {
        fs.write(this.geoPath, json);
        this.createShapefile();
    },
    /**
     * Get the existing geojson
     * @returns {GeoJson}
     */
    getGeo: function() {
        try {
            return fs.read(this.geoPath);
        } catch (e) {
            return null;
        }
    },
    /**
     * Get the mapnik styling XML
     */
    getMapnik: function() {
        try {
            return fs.read(this.mapnikPath);
        } catch (e) {
            return null;
        }
    },
    /**
     * Create mapnik preview styling from existing mss file
     */
    createMapnikPreviewFromMss: function(mss) {
        this.createMapnikFromMss(mss, true);
    },
    /**
     * Create mapink styhling from existing mss file
     */
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
    /**
     * Renders this layer's UTF tiles.
     * @param {Array} zoomLevels [minimum, maximum]
     * @param {Array} bounds [x1, y1, x2, y2]
     */
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

    /**
     * Renders this layer's tiles.
     * @param {Array} zoomLevels [minimum, maximum]
     * @param {Array} bounds [x1, y1, x2, y2]
     */
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
    /**
     * Get the raster tile for a given position
     * @param {Number} zoom level
     * @param {Number} x tile coordinate
     * @param {Number} y tile coordinate
     * @returns {Binary} png image
     */
    getTile: function(z, x, y) {
        return renderDaemon.render({
            mapnikXml: useShapePreview ? this.previewMapnikPath : this.mapnikPath,
            x: parseInt(x, 10),
            y: parseInt(y, 10),
            z: parseInt(z, 10),
            utfGrid: false
        });
    },
    /**
     * Get the UTF Tile for a given position
     * @param {Number} zoom level
     * @param {Number} x tile coordinate
     * @param {Number} z tile coordinate
     */
    getJsonTile: function(z, x, y) {
       return renderDaemon.render({
          mapnikXml: useShapePreview ? this.previewMapnikPath : this.mapnikPath,
          x: parseInt(x, 10),
          y: parseInt(y, 10),
          z: parseInt(z, 10),
          utfGrid: true
       })
    },
    /**
     * Create shapefile from existing geoJson file.
     */
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
    /**
     * Returns the number of tiles requried for rendering this layer up to the
     * given zoom level within the given bounds.
     * @params {Number} maxZoom
     * @params {Array} bounds [x1, y1, x2, y2]
     * @returns {Number} number of tiles required
     */
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

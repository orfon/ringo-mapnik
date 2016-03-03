var {RenderDeamon, renderBounding, render} = require('../lib/mapnik');
var assert = require('assert');
var fs = require('fs');
var assert = require('assert');
var {MapFactory, Layer} = require('../lib/map');
var {GeoJson} = require('../lib/geojson');
var factory = null;
var $o = require('ringo/utils/objects');

var mapsBasePath = module.resolve('./fixtures/maps/');
var geoJson = null;
var layerBasePath = fs.join(mapsBasePath, 'layer-test');
var viennaXmlPath = module.resolve('./fixtures/austrians-vienna.xml');
var viennaOgrXmlPath = module.resolve('./fixtures/austrians-vienna-ogr.xml');
var testOutputPng = module.resolve('./fixtures/test-output.png');

exports.setUp = function() {
   var xml = fs.read(viennaXmlPath + '.template');
   xml = xml.replace('%%BASE_PATH%%', module.resolve('./fixtures/'));
   fs.write(viennaXmlPath, xml);

   var xmlOgr = fs.read(viennaOgrXmlPath + '.template');
   xml = xml.replace('%%BASE_PATH%%', module.resolve('./fixtures/'));
   fs.write(viennaOgrXmlPath, xml);

   factory = new MapFactory({
        basePath: mapsBasePath
    });

    geoJson = fs.read(module.resolve('./fixtures/maps/simple-map/43df6ff1-b96a-434d-b0ad-8272417d87ef/data.geojson'));
}

function tryRemove(path) {
   try {
      fs.remove(path)
   } catch(e) {}
}

exports.tearDown = function() {
    tryRemove(testOutputPng);
    tryRemove(viennaXmlPath);
    tryRemove(viennaOgrXmlPath);

    tryRemove(fs.join(layerBasePath, 'style.xml'));
    tryRemove(fs.join(layerBasePath, 'data.geojson'));

    var map = factory.get('simple-map');
    var zoomPath15 = map.layers[0].tilesPath + '/15';
    var zoomPath16 = map.layers[0].tilesPath + '/16';

    try {
      fs.removeTree(zoomPath15);
    } catch(e) {}
    try {
      fs.removeTree(zoomPath16);
    } catch(e) {}
    tryRemove(fs.join(map.layers[0].baseDirectory, 'style.xml'))
    tryRemove(fs.join(map.layers[0].baseDirectory, 'previewstyle.xml'))
    tryRemove(fs.join(map.layers[0].baseDirectory, 'data.dbf'));
    tryRemove(fs.join(map.layers[0].baseDirectory, 'data.prj'));
    tryRemove(fs.join(map.layers[0].baseDirectory, 'data.shp'));
    tryRemove(fs.join(map.layers[0].baseDirectory, 'data.shx'));

}

exports.testDaemon = function() {
   [viennaXmlPath, viennaOgrXmlPath].forEach(function(mapnikXml) {
      var renderDeamon = new RenderDeamon();
      renderDeamon.start();
      var imgBinary = renderDeamon.render({
         mapnikXml: mapnikXml,
         x: 279,
         y: 177,
         z: 9
      });
      renderDeamon.stop();
      var binaryImage = JSON.parse(fs.read(module.resolve('./fixtures/daemon-binary-image-result.json')));
      assert.deepEqual(imgBinary.toArray(), binaryImage);
   });
}

exports.testBounding = function() {

   [viennaXmlPath, viennaOgrXmlPath].forEach(function(mapnikXml) {
      var viennaBounding = [15.967787227555085,48.081620729494375,16.85708055141957,48.32764203530962];
      renderBounding({
         mapnikXml: mapnikXml,
         boundingBox: viennaBounding,
         tileFile: testOutputPng
      });

      var referencePng = fs.read(module.resolve('./fixtures/reference-bounding-output.png'), {binary: true}).toArray();
      var outputPng = fs.read(testOutputPng, {binary: true}).toArray();

      assert.deepEqual(referencePng, outputPng);
   });
}

exports.testGeojson = function() {
    var json = new GeoJson(geoJson);
    assert.deepEqual(json.getUniqueValues('OBJECTID'), [30524]);
    assert.deepEqual(json.getMinMax('OBJECTID'), [30524, 30524]);
    assert.deepEqual(json.getPropertyDetails(), [
       {
           "name": "OBJECTID",
           "examples": "30524"
       },
       {
           "name": "LANDSCHAFT",
           "examples": "0"
       },
       {
           "name": "FLAECHE",
           "examples": "152104.09375"
       }
   ]);

    var clonedFeature = json.mergeClonedFeature(30524, 'OBJECTID', {
        foo: 'merge-bar',
        zar: '1.2'
    });

    assert.deepEqual(GeoJson.toObject(clonedFeature.get('properties')),  {
      "OBJECTID": 30524,
      "LANDSCHAFT": 0,
      "FLAECHE": 152104.09375,
      "foo": "merge-bar",
      "zar": "1.2"
   });
}

exports.testLayer = function(){
    // create an empty layer
    var layer = new Layer(layerBasePath, {
      id: 'randomfoo',
      title: 'data'
    });
    assert.equal(typeof layer.metadata.id, 'string')
    assert.equal(layer.baseDirectory, layerBasePath);
    assert.equal(layer.getSld(), null);
    layer.setGeo(geoJson);

    // render with mss
    var mss = '#data[OBJECTID=30524] { polygon-fill: black;}';
    layer.createMapnikFromMss(mss);
    // remove absolute paths and layer id from mapnik xml
    var mapnikXml = layer.getMapnik()
                     .replace(/<Parameter name="base">[^\]]*/g, '');
    assert.equal(mapnikXml, "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<!DOCTYPE Map[]>\n<Map srs=\"+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0.0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs +over\">\n\n\n<Style name=\"data\" filter-mode=\"first\">\n  <Rule>\n    <Filter>([OBJECTID] = 30524)</Filter>\n    <PolygonSymbolizer fill=\"#000000\" />\n  </Rule>\n</Style>\n<Layer name=\"data\"\n  srs=\"+proj=longlat +ellps=WGS84 +datum=WGS84 +no_defs\">\n    <StyleName>data</StyleName>\n    <Datasource>\n       <Parameter name=\"type\"><![CDATA[geojson]]></Parameter>\n       ]]></Parameter>\n       <Parameter name=\"file\"><![CDATA[data.geojson]]></Parameter>\n    </Datasource>\n  </Layer>\n\n</Map>");
}

exports.testMap = function() {

    // get existing map
    var map = factory.get('simple-map');
    assert.isNotNull(map);

    map.createMssFromSld()
    map.createMapnikFromMss();
    map.layers[0].createShapefile();

    assert.notEqual(null, map.layers[0].getMapnik())

    map.renderTiles();

    var zoomPath15 = map.layers[0].tilesPath + '/15';
    var zoomPath16 = map.layers[0].tilesPath + '/16';
    assert.isTrue(fs.exists(zoomPath15));
    assert.isTrue(fs.exists(zoomPath16));

    fs.removeTree(zoomPath15);
    fs.removeTree(zoomPath16);

    assert.isNotNull(map.getTile(map.layers[0].id, 6, 17, 17));

    map.renderUtf();


    /* cant test with random style name
    assert.equal(
        map.layers[0].getMapnik().replace(map.layers[0].id, ''),
        fs.read(module.resolve('./fixtures/mapnik-generated-from-sld.xml'))
    );
    */

}

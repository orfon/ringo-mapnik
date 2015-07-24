var {Map} = require('../lib/map');
var assert = require('assert');
var fs = require('fs');

exports.testWriter = function() {
   var mapPath = module.resolve('./fixtures/map.json');
   var map = new Map(mapPath);
   map.createMapnikXmls();

   assert.deepEqual(map.data, {
       "name": "Wien Ausländeranteil",
       "enableLayerControl": false,
       "enableZoom": false,
       "enablePopups": true,
       "basemaps": [
           {
               "url": "http://maps{s}.wien.gv.at/basemap/bmapgrau/normal/google3857/{z}/{y}/{x}.png",
               "attribution": "Basemap: <a target='_top' href='http://basemap.at'>basemap.at</a>'",
               "subdomains": [
                   "",
                   "1",
                   "2",
                   "3",
                   "4"
               ]
           }
       ],
       "layers": [
           {
               "title": "Österreicher",
               "sld": "austrians-vienna.sld",
               "geojson": "vienna.geojson",
               "mapnik": "austrians-vienna.xml",
               "tiles": null,
               "hasPopups": true,
               "disabled": false
           }
       ]
   });

   map.renderTiles()

   var baseDirectory = fs.directory(mapPath);
   map.data.layers.forEach(function(layer) {
      var mapnikPath = fs.join(baseDirectory, layer.mapnik);
      assert.isTrue(fs.exists(mapnikPath));
      //fs.remove(mapnikPath);
   })
}
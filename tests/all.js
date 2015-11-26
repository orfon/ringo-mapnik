var {RenderDeamon} = require('../lib/main');
var assert = require('assert');
var fs = require('fs');

exports.testDaemon = function() {
   var renderDeamon = new RenderDeamon();
   renderDeamon.start();
   var imgBinary = renderDeamon.render({
      mapnikXml: module.resolve('./fixtures/austrians-vienna.xml'),
      x: 279,
      y: 177,
      z: 9
   });

   console.log(imgBinary);
   renderDeamon.stop();
}
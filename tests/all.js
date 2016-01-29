var {RenderDeamon, renderBounding, render} = require('../lib/main');
var assert = require('assert');
var fs = require('fs');

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
}

exports.tearDown = function() {
   try {
      fs.remove(testOutputPng);
   } catch (e) {
      // test might have failed earlier
   }
   try {
      fs.remove(viennaXmlPath);
   } catch (e) {
      //
   }
   try {
      fs.remove(viennaOgrXmlPath);
   } catch (e) {
      //
   }
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
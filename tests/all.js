var {RenderDeamon, renderBounding, render} = require('../lib/main');
var assert = require('assert');
var fs = require('fs');

var viennaXmlPath = module.resolve('./fixtures/austrians-vienna.xml');
var testOutputPng = module.resolve('./fixtures/test-output.png');

exports.setUp = function() {
   var xml = fs.read(viennaXmlPath);
   xml = xml.replace('%%BASE_PATH%%', module.resolve('./fixtures/'));
   fs.write(viennaXmlPath, xml);
}

exports.tearDown = function() {
   try {
      fs.remove(testOutputPng);
   } catch (e) {
      // test might have failed earlier
   }
}

exports.testDaemon = function() {
   var renderDeamon = new RenderDeamon();
   renderDeamon.start();
   var imgBinary = renderDeamon.render({
      mapnikXml: module.resolve('./fixtures/austrians-vienna.xml'),
      x: 279,
      y: 177,
      z: 9
   });
   renderDeamon.stop();
   var binaryImage = JSON.parse(fs.read(module.resolve('./fixtures/daemon-binary-image-result.json')));
   assert.deepEqual(imgBinary.toArray(), binaryImage);
}

exports.testTiles = function() {

}

exports.testBounding = function() {

   var viennaBounding = [15.967787227555085,48.081620729494375,16.85708055141957,48.32764203530962];
   renderBounding({
      mapnikXml: viennaXmlPath,
      boundingBox: viennaBounding,
      tileFile: testOutputPng
   });


   var referencePng = fs.read(module.resolve('./fixtures/reference-bounding-output.png'), {binary: true}).toArray();
   var outputPng = fs.read(testOutputPng, {binary: true}).toArray();

   assert.deepEqual(referencePng, outputPng);
}
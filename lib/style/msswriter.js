var mapping = {
   color: 'line-color',
   strokeOpacity: 'line-opacity',
   fillColor: 'polygon-fill',
   fillOpacity: 'polygon-opacity',
   weight: 'line-width',
};

var pointMapping = {
   fillOpacity: 'marker-opacity',
   fillColor: 'marker-fill',
   color: 'marker-line-color',
   weight: 'marker-line-width',
   strokeOpacity: 'marker-line-opacity',
   pointRadius: 'size',
   size: 'size'
}

exports.transform = function(featureTypeStyles, layerName) {
   var text = [];
   featureTypeStyles.forEach(function(rules) {
      rules.forEach(function(rule) {
         text.push('#' + layerName);
         if (rule.filter && rule.filter.comparisions) {
            // @@ qgis bug https://hub.qgis.org/issues/9365
            // if the comparision has two parts: >0 and <= 0 it will always fail
            // so fix it by only using the second part.
            if (rule.filter.comparisions.length === 2) {
               var firstNull = rule.filter.comparisions[0].literal === '0' && rule.filter.comparisions[0].operator === '>';
               var secondNull = rule.filter.comparisions[1].literal === '0' && rule.filter.comparisions[1].operator === '<=';
               if (firstNull && secondNull) {
                  rule.filter.comparisions = [rule.filter.comparisions[1]];
               }
            }
            // @@ qgis bug end
            rule.filter.comparisions.forEach(function(comparision) {
               var literal = '"' + comparision.literal + '"';
               if (false == isNaN(comparision.literal)) {
                  literal = comparision.literal;
               }
               text.push('["' + comparision.property + '"' + comparision.operator + literal + ']');
            });
         }
         text.push('{\n');
         for (var key in rule.symbolizer) {
            if (rule.symbolizer.type === 'point') {
               if (key === 'file') {
                  text.push('   marker-file: url(../icons/' + rule.symbolizer[key] + ');\n');
               } else {
                  var symb = pointMapping[key];
                  if (symb != null) {
                     var value = rule.symbolizer[key];
                     if (symb === 'size') {
                        value = 3.8 * parseFloat(value, 10);
                        if (value != 0) {
                           text.push('   marker-width: ' + value + ';\n');
                           text.push('   marker-height: ' + value + ';\n');
                        }
                     } else {
                        text.push('   ' + symb + ': ' + value + ';\n');
                     }
                  } else {
                     //console.log('unmapped point marker key', key);
                  }
               }
            } else {
               var symb = mapping[key];
               if (symb != null) {
                  var value = rule.symbolizer[key];
                  if (symb == 'line-width') {
                     // assume default DPI
                     value = 3.8 * parseFloat(value, 10);
                  }
                  text.push('   ' + symb + ': ' + value + ';\n');
               } else {
                  //console.log('unmapped key', key);
               }
            }
         };
         text.push('}\n\n');

      })
   });

   return text.join('');
}
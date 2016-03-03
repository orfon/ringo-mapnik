var handlebars = require("handlebars");
var $o = require('ringo/utils/objects');
addToClasspath(module.resolve('../jars/minimal-json-0.9.4.jar'));
var {Json, JsonObject, JsonArray} = Packages.com.eclipsesource.json;


handlebars.registerHelper('number', function(number) {
   var float = parseFloat(number, 10);
   if (isNaN(float) === true) {
      return number;
   }
   var formatter = java.text.DecimalFormat.getInstance(new java.util.Locale('de'));
   return formatter.format(float);
});

handlebars.registerHelper('percent', function(number) {
   var float = parseFloat(number, 10);
   if (isNaN(float) == true) {
      return number;
   }
   var formatter = java.text.DecimalFormat.getInstance(new java.util.Locale('de'));
   return formatter.format(number * 100) + '%';


});

function onlyUnique(value, index, self) {
   return self.indexOf(value) === index;
}

var GeoJson = exports.GeoJson = function(data) {
    // assuming data.type is a featurecollection
    this.data = Json.parse(data).asObject();
    this.features = this.data.get('features').asArray();
    return this;
}

GeoJson.createPropertiesFromArray = function(fields, line) {
    var obj = {};
    fields.forEach(function(f, idx) {
        var val = line[idx];
        if (f.type === 'number') {
            val = parseFloat(val, 10);
        }
        obj[f.name] = val;
    });
    return obj;
}

var toObject = GeoJson.toObject = function toObject(jsonObject) {
   var obj = {};
   var iterator = jsonObject.iterator();
   while (iterator.hasNext()) {
      var member = iterator.next();
      obj[member.getName()] = toValue(member.getValue());
   }
   return obj;
};

var toValue = GeoJson.toValue = function toValue(jsonValue) {
   if (jsonValue === null) {
      return null;
   } else if (jsonValue.isBoolean()) {
      return jsonValue.asBoolean();
   } else if (jsonValue.isNumber()) {
      return jsonValue.asFloat();
   } else if (jsonValue.isString()) {
      return jsonValue.asString();
   } else if (jsonValue.isNull()) {
      return null;
   }
   console.error('json type not handled');
   return null;
}

GeoJson.prototype = {
    size: function() {
        return this.features.size();
    },
    setPopupTemplate: function(template) {
        var compiledTemplate = handlebars.compile(template);
        var featureIterator = this.features.iterator();
        while (featureIterator.hasNext()) {
            var feature = featureIterator.next();
            var htmlExp = compiledTemplate(toObject(feature.get('properties')) || {});
            feature.get('properties').asObject().set('html_exp', htmlExp);
        };
    },
    getUniqueValues: function(fieldName) {
        var values = [];
        var featureIterator = this.features.iterator();
        while (featureIterator.hasNext()) {
            var feature = featureIterator.next();
            var jsonValue = feature.get('properties').asObject().get(fieldName);
            values.push(toValue(jsonValue));
            values = values.filter(onlyUnique);
        }
        return values;
    },
    getMinMax: function(fieldName) {
        if (fieldName == null) {
            throw 'missing fieldName argument';
        }
        var min = Infinity;
        var max = 0;
        var featureIterator = this.features.iterator();
        while (featureIterator.hasNext()) {
          var feature = featureIterator.next();
          var value = parseFloat(toValue(feature.get('properties').get(fieldName)), 10);
          if (min > value) {
             min = value;
          }
          if (max < value) {
             max = value;
          }
        }
        return [min, max];
    },
    mergeClonedFeature: function(id, localJoinField, properties) {
        var clone = null;
        var featureIterator = this.features.iterator();
        while (featureIterator.hasNext()) {
            var feature = featureIterator.next();
            if (feature.get('properties').asObject().getInt(localJoinField, -1) == id) {
                clone = Json.parse(feature.toString());
                for (var key in properties) {
                   clone.get('properties').add(key, properties[key]);
                }
                break;
            }
        }
        return clone;
    },
    joinWithCsv: function(csv, csvJoinField, localJoinField, keepUnused) {
        var fields = csv.fields;
        var features = new JsonArray();
        csv.lines.forEach(function(nextLine, idx){
            if (idx !== 0) {
                var properties = GeoJson.createPropertiesFromArray(fields, nextLine);
                var id = properties[csvJoinField];
                var feature = this.mergeClonedFeature(id, localJoinField, properties);
                if (feature != null) {
                    features.add(feature)
                }
            }
        }, this);
        this.features = features;
    },
    toJSON: function() {
       return this.toString();
    },
    toString: function() {
        var out = new JsonObject();
        out.add('type', this.data.get('type'));
        out.add('crs', this.data.get('crs'));
        out.add('features', this.features);
        return out.toString();
    },
    // get property names per layer
    getPropertyDetails: function(idx) {
        var infos = this.features.get(0).asObject().get('properties').asObject().names().toArray().map(function(name) {
            return {
                name: name,
                examples: []
            }
        }).filter(function(info) {
            // hacky exclude template
            return info.name !== 'html_exp';
        })
        infos.forEach(function(info) {
            var featureIterator = this.features.iterator();
            while (featureIterator.hasNext()) {
                var feature = featureIterator.next();
                info.examples.push(toValue(feature.get('properties').asObject().get(info.name)));
                info.examples = info.examples.filter(onlyUnique);
                if (info.examples.length >= 10) {
                   break;
                }
            }
            info.examples.sort();
            info.examples = info.examples.join(', ').substring(0, 50);
        }, this);
        return infos;
    },
    extent: function() {
        // assuming MultiPolygon
        var extent = [Infinity, Infinity, -Infinity, -Infinity];
        var featureIterator = this.features.iterator();
        while (featureIterator.hasNext()) {
            var feature = featureIterator.next();
            var geometry = feature.get('geometry').asObject();
            var type = geometry.getString('type', '')
            var coordinates = geometry.get('coordinates').asArray();
            var coordinatesIterator = coordinates.iterator();
            if (type === 'MultiPolygon') {
               while(coordinatesIterator.hasNext()) {
                  var polygons = coordinatesIterator.next().asArray().iterator();
                  while (polygons.hasNext()) {
                     var poly = polygons.next().asArray().iterator();
                     while (poly.hasNext()) {
                        var coord = poly.next().asArray();
                        if (extent[0] > toValue(coord.get(0))) extent[0] = toValue(coord.get(0));
                        if (extent[1] > toValue(coord.get(1))) extent[1] = toValue(coord.get(1));
                        if (extent[2] < toValue(coord.get(0))) extent[2] = toValue(coord.get(0));
                        if (extent[3] < toValue(coord.get(1))) extent[3] = toValue(coord.get(1));
                     }
                  };
               }
            } else if (type === 'Polygon') {
               while (coordinatesIterator.hasNext()) {
                  var line = coordinatesIterator.next().asArray().iterator();
                  while (line.hasNext()) {
                     var coord = line.next().asArray();
                     if (extent[0] > toValue(coord.get(0))) extent[0] = toValue(coord.get(0));
                     if (extent[1] > toValue(coord.get(1))) extent[1] = toValue(coord.get(1));
                     if (extent[2] < toValue(coord.get(0))) extent[2] = toValue(coord.get(0));
                     if (extent[3] < toValue(coord.get(1))) extent[3] = toValue(coord.get(1));
                  }
               }
            } else if (type == 'Point') {
               var coord = coordinates;
               if (extent[0] > toValue(coord.get(0))) extent[0] = toValue(coord.get(0));
               if (extent[1] > toValue(coord.get(1))) extent[1] = toValue(coord.get(1));
               if (extent[2] < toValue(coord.get(0))) extent[2] = toValue(coord.get(0));
               if (extent[3] < toValue(coord.get(1))) extent[3] = toValue(coord.get(1));
            };
        };
        return extent;
    }
}
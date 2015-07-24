# Generate slippy map tiles and UTFGrid using geojson and SLD styling information

This forks out to a generate_tiles.py file based on openstreetmaps example [1] to generate the tiled information.

Relies on a custom metdata map format to describe the layers. Example:

    {
       "layers": [
           {
               "sld": "austrians-vienna.sld",
               "hasPopups": false,
               "geojson": "austrians-vienna.geojson",
               "title": "SPÖ Wähler"
           }
       ],
       "attribution": "Public domain",
       "description": "SPÖ Wähler in Vienna 2010",
       "bounds": [
           16.181822542508847,
           48.11789767624906,
           16.577504331553047,
           48.32266000349662
       ],
       "minZoom": 6,
       "maxZoom": 11,
       "name": "gemeindebauten.qgs"
    }

Each layers entry can additional have the properties `mapnik` pointing to the mapnik.xml file, and a property `tiles` with the name of slippy tiles directory. Those two properties are typicall filled in by this package after the mapnik XML and tiles were created.

[1] https://github.com/openstreetmap/mapnik-stylesheets/blob/master/generate_tiles.py
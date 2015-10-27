'use babel';
'use strict';

module.exports.config = {
  cargoPath:  {
    title: 'Path to the Cargo executable',
    type: 'string',
    default: 'cargo',
    order: 1
  }
};

function provideBuilder() {

  var fs = require('fs');

  return {
    niceName: 'Cargo',

    isEligable: function (path) {
      return fs.existsSync(path + '/Cargo.toml');
    },

    settings: function (path) {
      var cargoPath = atom.config.get('build-cargo.cargoPath');

      return [
        {
          name: 'Cargo: build',
          exec: cargoPath,
          args: [ 'build' ],
          sh: false,
          errorMatch: [
            '(?<file>.+.rs):(?<line>\\d+):(?<col>\\d+):',
            'thread \'[^\\\']+\' panicked at \'[^\\\']+\', (?<file>[^\\/][^\\:]+):(?<line>\\d+)'
          ]
        },
        {
          name: 'Cargo: clean',
          exec: cargoPath,
          args: [ 'clean' ],
          sh: false,
          errorMatch: []
        },
        {
          name: 'Cargo: update',
          exec: cargoPath,
          args: [ 'update' ],
          sh: false,
          errorMatch: []
        },
        {
          name: 'Cargo: test',
          exec: cargoPath,
          args: [ 'test' ],
          sh: false,
          errorMatch: [
            '(?<file>.+.rs):(?<line>\\d+):(?<col>\\d+):',
            'thread \'[^\\\']+\' panicked at \'[^\\\']+\', (?<file>[^\\/][^\\:]+):(?<line>\\d+)'
          ]
        },
        {
          name: 'Cargo: run',
          exec: cargoPath,
          args: [ 'run' ],
          sh: false,
          errorMatch: [
            '(?<file>.+.rs):(?<line>\\d+):(?<col>\\d+):',
            'thread \'[^\\\']+\' panicked at \'[^\\\']+\', (?<file>[^\\/][^\\:]+):(?<line>\\d+)'
          ]
        }
      ];
    }
  };
}

module.exports.provideBuilder = provideBuilder;

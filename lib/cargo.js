'use babel';
'use strict';

module.exports.config = {
  cargoPath:  {
    title: 'Path to the Cargo executable',
    type: 'string',
    default: 'cargo',
    order: 1
  },
  verbose: {
    title: 'Verbose Cargo output',
    description: 'Pass the --verbose flag to cargo',
    type: 'boolean',
    default: false,
    order: 2
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
      var args = [];
      atom.config.get('build-cargo.verbose') && args.push('--verbose');

      return [
        {
          name: 'Cargo: build',
          exec: cargoPath,
          args: [ 'build' ].concat(args),
          sh: false,
          errorMatch: [
            '(?<file>.+.rs):(?<line>\\d+):(?<col>\\d+):',
            'thread \'[^\\\']+\' panicked at \'[^\\\']+\', (?<file>[^\\/][^\\:]+):(?<line>\\d+)'
          ]
        },
        {
          name: 'Cargo: clean',
          exec: cargoPath,
          args: [ 'clean' ].concat(args),
          sh: false,
          errorMatch: []
        },
        {
          name: 'Cargo: update',
          exec: cargoPath,
          args: [ 'update' ].concat(args),
          sh: false,
          errorMatch: []
        },
        {
          name: 'Cargo: test',
          exec: cargoPath,
          args: [ 'test' ].concat(args),
          sh: false,
          errorMatch: [
            '(?<file>.+.rs):(?<line>\\d+):(?<col>\\d+):',
            'thread \'[^\\\']+\' panicked at \'[^\\\']+\', (?<file>[^\\/][^\\:]+):(?<line>\\d+)'
          ]
        },
        {
          name: 'Cargo: run',
          exec: cargoPath,
          args: [ 'run' ].concat(args),
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

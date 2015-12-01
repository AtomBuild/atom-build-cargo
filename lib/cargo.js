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
  },
  openDocs: {
    title: 'Open documentation in browser after \'doc\' target is built',
    type: 'boolean',
    default: false,
    order: 3
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

      var docArgs = ['doc'];
      atom.config.get('build-cargo.openDocs') && docArgs.push('--open');

      return [
        {
          name: 'Cargo: build (debug)',
          exec: cargoPath,
          args: [ 'build' ].concat(args),
          sh: false,
          errorMatch: [
            '(?<file>.+.rs):(?<line>\\d+):(?<col>\\d+):(error):',
            'thread \'[^\\\']+\' panicked at \'[^\\\']+\', (?<file>[^\\/][^\\:]+):(?<line>\\d+)'
          ]
        },
        {
          name: 'Cargo: build (release)',
          exec: cargoPath,
          args: [ 'build', '--release' ].concat(args),
          sh: false,
          errorMatch: [
            '(?<file>.+.rs):(?<line>\\d+):(?<col>\\d+):',
            'thread \'[^\\\']+\' panicked at \'[^\\\']+\', (?<file>[^\\/][^\\:]+):(?<line>\\d+)'
          ]
        },
        {
          name: 'Cargo: bench',
          exec: cargoPath,
          args: [ 'bench' ].concat(args),
          sh: false,
          errorMatch: [
            '(?<file>.+.rs):(?<line>\\d+):(?<col>\\d+):(error):',
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
          name: 'Cargo: doc',
          exec: cargoPath,
          args: docArgs.concat(args),
          sh: false,
          errorMatch: []
        },
        {
          name: 'Cargo: run',
          exec: cargoPath,
          env: { RUST_BACKTRACE: '1' },
          args: [ 'run' ].concat(args),
          sh: false,
          errorMatch: [
            '(?<file>.+.rs):(?<line>\\d+):(?<col>\\d+):',
            'at (?<file>[^.\/][^\\/][^\\:]+):(?<line>\\d+)',
            'thread \'[^\\\']+\' panicked at \'[^\\\']+\', (?<file>[^\\/][^\\:]+):(?<line>\\d+)'
          ]
        },
        {
          name: 'Cargo: test',
          exec: cargoPath,
          env: { RUST_BACKTRACE: '1' },
          args: [ 'test' ].concat(args),
          sh: false,
          errorMatch: [
            '(?<file>.+.rs):(?<line>\\d+):(?<col>\\d+):',
            'at (?<file>[^.\/][^\\/][^\\:]+):(?<line>\\d+)',
            'thread \'[^\\\']+\' panicked at \'[^\\\']+\', (?<file>[^\\/][^\\:]+):(?<line>\\d+)'
          ]
        },
        {
          name: 'Cargo: update',
          exec: cargoPath,
          args: [ 'update' ].concat(args),
          sh: false,
          errorMatch: []
        }
      ];
    }
  };
}

module.exports.provideBuilder = provideBuilder;

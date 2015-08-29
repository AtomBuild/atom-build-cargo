'use babel';
'use strict';

function provideBuilder() {

  var fs = require('fs');

  return {
    niceName: 'Cargo',

    isEligable: function (path) {
      return fs.existsSync(path + '/Cargo.toml');
    },

    settings: function (path) {
      return [
        {
          name: 'Cargo: build',
          exec: 'cargo',
          args: [ 'build' ],
          sh: false,
          errorMatch: '(?<file>.+.rs):(?<line>\\d+):(?<col>\\d+):'
        },
        {
          name: 'Cargo: test',
          exec: 'cargo',
          args: [ 'test' ],
          sh: false,
          errorMatch: '(?<file>.+.rs):(?<line>\\d+):(?<col>\\d+):'
        },
        {
          name: 'Cargo: run',
          exec: 'cargo',
          args: [ 'run' ],
          sh: false,
          errorMatch: '(?<file>.+.rs):(?<line>\\d+):(?<col>\\d+):'
        }
      ];
    }
  };
}

module.exports.provideBuilder = provideBuilder;

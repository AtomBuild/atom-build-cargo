'use babel';

import fs from 'fs';

export const config = {
  cargoPath: {
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
  },
  showBacktrace: {
    title: 'Show backtrace information in tests',
    description: 'Set environment variable RUST_BACKTRACE=1',
    type: 'boolean',
    default: false,
    order: 4
  },
  cargoCheck: {
    title: 'Enable `cargo check',
    description: 'Enable the `cargo check` Cargo command. Only use this if you have `cargo check` installed.',
    type: 'boolean',
    default: false,
    order: 5
  },
  cargoClippy: {
    title: 'Enable `cargo clippy',
    description: 'Enable the `cargo clippy` Cargo command to run Clippy\'s lints. \
                  Only use this if you have the `cargo clippy` package installed.',
    type: 'boolean',
    default: false,
    order: 6
  },
  jsonErrors: {
    title: 'Use json errors',
    description: 'Instead of using regex to parse the human readable output (requires rustc version 1.7)',
    type: 'boolean',
    default: false,
    order: 7
  }
};

export function provideBuilder() {
  return class CargoBuildProvider {
    constructor(cwd) {
      this.cwd = cwd;
    }

    getNiceName() {
      return 'Cargo';
    }

    isEligible() {
      return fs.existsSync(`${this.cwd}/Cargo.toml`);
    }

    settings() {
      const cargoPath = atom.config.get('build-cargo.cargoPath');
      const args = [];
      atom.config.get('build-cargo.verbose') && args.push('--verbose');

      const docArgs = [ 'doc' ];
      atom.config.get('build-cargo.openDocs') && docArgs.push('--open');

      const env = {};
      if (atom.config.get('build-cargo.jsonErrors')) {
          env["RUSTFLAGS"] = "-Z unstable-options --error-format=json";
      }
      if (atom.config.get('build-cargo.showBacktrace')) {
        env['RUST_BACKTRACE'] = '1'
      }

      const matchRelaxed = '(?<file>.+.rs):(?<line>\\d+):(?<col>\\d+):(?: (?<line_end>\\d+):(?<col_end>\\d+) )?(error):';
      const matchStrictRegex = '(?<file>.+.rs):(?<line>\\d+):(?<col>\\d+):(?: (?<line_end>\\d+):(?<col_end>\\d+) )?';
      const matchStrictFunction = function(output) {
          var array = [];
          output.split(/\n/).forEach(function(line) {
              if (line[0] != '{') {
                  return;
              }
              const json = JSON.parse(line);
              json.spans.forEach(function(span) {
                  json.file = span.file_name;
                  json.line = span.line_start;
                  json.line_end = span.line_end;
                  json.col = span.column_start;
                  json.col_end = span.column_end;
                  this.push(json);
              }.bind(this));
          }.bind(array));
          return array;
      };
      const matchStrict = atom.config.get('build-cargo.jsonErrors') ? matchStrictFunction : matchStrictRegex;
      const matchThreadPanic = 'thread \'[^\\\']+\' panicked at \'[^\\\']+\', (?<file>[^\\/][^\\:]+):(?<line>\\d+)';
      const matchBacktrace = 'at (?<file>[^.\/][^\\/][^\\:]+):(?<line>\\d+)';

      var commands = [
        {
          name: 'Cargo: build (debug)',
          exec: cargoPath,
          env: env,
          args: [ 'build' ].concat(args),
          sh: false,
          errorMatch: [ matchRelaxed, matchThreadPanic ],
          atomCommandName: "cargo:build-debug"
        },
        {
          name: 'Cargo: build (release)',
          exec: cargoPath,
          env: env,
          args: [ 'build', '--release' ].concat(args),
          sh: false,
          errorMatch: [ matchStrict, matchThreadPanic ],
          atomCommandName: "cargo:build-release"
        },
        {
          name: 'Cargo: bench',
          exec: cargoPath,
          env: env,
          args: [ 'bench' ].concat(args),
          sh: false,
          errorMatch: [ matchRelaxed, matchThreadPanic ],
          atomCommandName: "cargo:bench"
        },
        {
          name: 'Cargo: clean',
          exec: cargoPath,
          env: env,
          args: [ 'clean' ].concat(args),
          sh: false,
          errorMatch: [],
          atomCommandName: "cargo:clean"
        },
        {
          name: 'Cargo: doc',
          exec: cargoPath,
          env: env,
          args: docArgs.concat(args),
          sh: false,
          errorMatch: [],
          atomCommandName: "cargo:doc"
        },
        {
          name: 'Cargo: run',
          exec: cargoPath,
          env: env,
          args: [ 'run' ].concat(args),
          sh: false,
          errorMatch: [ matchStrict, matchThreadPanic, matchBacktrace ],
          atomCommandName: "cargo:run"
        },
        {
          name: 'Cargo: test',
          exec: cargoPath,
          env: env,
          args: [ 'test' ].concat(args),
          sh: false,
          errorMatch: [ matchStrict, matchThreadPanic, matchBacktrace ],
          atomCommandName: "cargo:run-test"
        },
        {
          name: 'Cargo: update',
          exec: cargoPath,
          env: env,
          args: [ 'update' ].concat(args),
          sh: false,
          errorMatch: [],
          atomCommandName: "cargo:update"
        },
        {
          name: `Cargo: build example`,
          exec: cargoPath,
          env: env,
          args: [ 'build', '--example', '{FILE_ACTIVE_NAME_BASE}' ].concat(args),
          sh: false,
          errorMatch: [ matchRelaxed, matchThreadPanic ],
          atomCommandName: "cargo:build-example"
        },
        {
          name: `Cargo: run example`,
          exec: cargoPath,
          env: env,
          args: [ 'run', '--example', '{FILE_ACTIVE_NAME_BASE}' ].concat(args),
          sh: false,
          errorMatch: [ matchStrict, matchThreadPanic, matchBacktrace ],
          atomCommandName: "cargo:run-example"
        },
        {
          name: `Cargo: run bin`,
          exec: cargoPath,
          env: env,
          args: [ 'run', '--bin', '{FILE_ACTIVE_NAME_BASE}' ].concat(args),
          sh: false,
          errorMatch: [ matchStrict, matchThreadPanic, matchBacktrace ],
          atomCommandName: "cargo:run-bin"
        }
      ];

      if (atom.config.get('build-cargo.cargoClippy')) {
        commands.push({
          name: `Cargo: Clippy`,
          exec: cargoPath,
          env: env,
          args: ['clippy'].concat(args),
          sh: false,
          errorMatch: [ matchRelaxed, matchThreadPanic ],
          atomCommandName: "cargo:clippy"
        })
      }

      if (atom.config.get('build-cargo.cargoCheck')) {
        commands.push({
          name: `Cargo: check`,
          exec: cargoPath,
          env: env,
          args: ['check'].concat(args),
          sh: false,
          errorMatch: [ matchRelaxed, matchThreadPanic ],
          atomCommandName: "cargo:check"
        })
      }

      return commands;
    }
  };
}

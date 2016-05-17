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
    description: 'Enable the `cargo clippy` Cargo command to run Clippy\'s lints. Only use this if you have the `cargo clippy` package installed.',
    type: 'boolean',
    default: false,
    order: 6
  },
  jsonErrors: {
    title: 'Use json errors',
    description: 'Instead of using regex to parse the human readable output (requires rustc version 1.7)\nNote: this is an unstable feature of the Rust compiler and prone to change and break frequently.',
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
        env.RUSTFLAGS = '-Z unstable-options --error-format=json';
      }
      if (atom.config.get('build-cargo.showBacktrace')) {
        env.RUST_BACKTRACE = '1';
      }

      const matchRelaxed = '(?<file>.+.rs):(?<line>\\d+):(?<col>\\d+):(?: (?<line_end>\\d+):(?<col_end>\\d+) )?(error): (?<message>[^\n]+)';
      const matchStrict = '(?<file>.+.rs):(?<line>\\d+):(?<col>\\d+):(?: (?<line_end>\\d+):(?<col_end>\\d+) )?(?<message>[^\n]+)';
      const matchFunction = atom.config.get('build-cargo.jsonErrors') && function (output) {
        const array = [];
        function level2severity(level) {
          switch (level) {
            case 'warning': return 'warning';
            case 'error': return 'error';
            case 'note': return 'info';
            default: return 'error';
          }
        }
        output.split(/\n/).forEach(line => {
          if (line[0] !== '{') {
            return;
          }
          const json = JSON.parse(line);
          const trace = [];
          json.children.forEach(child => {
            child.spans.forEach(span => {
              trace.push({
                message: child.message,
                file: span.file_name,
                line: span.line_start,
                line_end: span.line_end,
                col: span.column_start,
                col_end: span.column_end,
                type: 'Trace', // FIXME: change to `child.level` after https://github.com/steelbrain/linter/issues/1149 is fixed
                severity: level2severity(json.level)
              });
            });
          });
          if (json.code) {
            trace.push({
              message: json.code.explanation,
              type: 'Explanation',
              severity: 'info'
            });
          }
          json.spans.forEach(span => {
            array.push({
              message: json.message,
              file: span.file_name,
              line: span.line_start,
              line_end: span.line_end,
              col: span.column_start,
              col_end: span.column_end,
              type: json.level, // FIXME: change to `json.code ? json.code : json.level` after https://github.com/steelbrain/linter/issues/1149 is fixed
              severity: level2severity(json.level),
              trace: trace
            });
          });
        });
        return array;
      };
      const matchThreadPanic = 'thread \'[^\\\']+\' panicked at \'[^\\\']+\', (?<file>[^\\/][^\\:]+):(?<line>\\d+)';
      const matchBacktrace = 'at (?<file>[^.\/][^\\/][^\\:]+):(?<line>\\d+)';

      const commands = [
        {
          name: 'Cargo: build (debug)',
          exec: cargoPath,
          env: env,
          args: [ 'build' ].concat(args),
          sh: false,
          errorMatch: matchFunction ? matchThreadPanic : [ matchRelaxed, matchThreadPanic ],
          functionMatch: matchFunction,
          atomCommandName: 'cargo:build-debug'
        },
        {
          name: 'Cargo: build (release)',
          exec: cargoPath,
          env: env,
          args: [ 'build', '--release' ].concat(args),
          sh: false,
          errorMatch: matchFunction ? matchThreadPanic : [ matchStrict, matchThreadPanic ],
          functionMatch: matchFunction,
          atomCommandName: 'cargo:build-release'
        },
        {
          name: 'Cargo: bench',
          exec: cargoPath,
          env: env,
          args: [ 'bench' ].concat(args),
          sh: false,
          errorMatch: matchFunction ? matchThreadPanic : [ matchRelaxed, matchThreadPanic ],
          functionMatch: matchFunction,
          atomCommandName: 'cargo:bench'
        },
        {
          name: 'Cargo: clean',
          exec: cargoPath,
          env: env,
          args: [ 'clean' ].concat(args),
          sh: false,
          errorMatch: [],
          atomCommandName: 'cargo:clean'
        },
        {
          name: 'Cargo: doc',
          exec: cargoPath,
          env: env,
          args: docArgs.concat(args),
          sh: false,
          errorMatch: [],
          atomCommandName: 'cargo:doc'
        },
        {
          name: 'Cargo: run (debug)',
          exec: cargoPath,
          env: env,
          args: [ 'run' ].concat(args),
          sh: false,
          errorMatch: matchFunction ? [ matchThreadPanic, matchBacktrace ] : [ matchStrict, matchThreadPanic, matchBacktrace ],
          functionMatch: matchFunction,
          atomCommandName: 'cargo:run-debug'
        },
        {
          name: 'Cargo: run (release)',
          exec: cargoPath,
          env: env,
          args: [ 'run', '--release' ].concat(args),
          sh: false,
          errorMatch: matchFunction ? [ matchThreadPanic, matchBacktrace ] : [ matchStrict, matchThreadPanic, matchBacktrace ],
          functionMatch: matchFunction,
          atomCommandName: 'cargo:run-release'
        },
        {
          name: 'Cargo: test',
          exec: cargoPath,
          env: env,
          args: [ 'test' ].concat(args),
          sh: false,
          errorMatch: matchFunction ? [matchThreadPanic, matchBacktrace] : [ matchStrict, matchThreadPanic, matchBacktrace ],
          functionMatch: matchFunction,
          atomCommandName: 'cargo:run-test'
        },
        {
          name: 'Cargo: update',
          exec: cargoPath,
          env: env,
          args: [ 'update' ].concat(args),
          sh: false,
          errorMatch: [],
          atomCommandName: 'cargo:update'
        },
        {
          name: 'Cargo: build example',
          exec: cargoPath,
          env: env,
          args: [ 'build', '--example', '{FILE_ACTIVE_NAME_BASE}' ].concat(args),
          sh: false,
          errorMatch: matchFunction ? matchThreadPanic : [ matchRelaxed, matchThreadPanic ],
          functionMatch: matchFunction,
          atomCommandName: 'cargo:build-example'
        },
        {
          name: 'Cargo: run example',
          exec: cargoPath,
          env: env,
          args: [ 'run', '--example', '{FILE_ACTIVE_NAME_BASE}' ].concat(args),
          sh: false,
          errorMatch: matchFunction ? [matchThreadPanic, matchBacktrace] : [ matchRelaxed, matchThreadPanic, matchBacktrace ],
          functionMatch: matchFunction,
          atomCommandName: 'cargo:run-example'
        },
        {
          name: 'Cargo: run bin',
          exec: cargoPath,
          env: env,
          args: [ 'run', '--bin', '{FILE_ACTIVE_NAME_BASE}' ].concat(args),
          sh: false,
          errorMatch: matchFunction ? [matchThreadPanic, matchBacktrace] : [ matchRelaxed, matchThreadPanic, matchBacktrace ],
          functionMatch: matchFunction,
          atomCommandName: 'cargo:run-bin'
        }
      ];

      if (atom.config.get('build-cargo.cargoClippy')) {
        commands.push({
          name: 'Cargo: Clippy',
          exec: cargoPath,
          env: env,
          args: ['clippy'].concat(args),
          sh: false,
          errorMatch: matchFunction ? matchThreadPanic : [ matchRelaxed, matchThreadPanic ],
          functionMatch: matchFunction,
          atomCommandName: 'cargo:clippy'
        });
      }

      if (atom.config.get('build-cargo.cargoCheck')) {
        commands.push({
          name: 'Cargo: check',
          exec: cargoPath,
          env: env,
          args: ['check'].concat(args),
          sh: false,
          errorMatch: matchFunction ? matchThreadPanic : [ matchRelaxed, matchThreadPanic ],
          functionMatch: matchFunction,
          atomCommandName: 'cargo:check'
        });
      }

      return commands;
    }
  };
}

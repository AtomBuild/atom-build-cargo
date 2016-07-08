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

      function level2severity(level) {
        switch (level) {
          case 'warning': return 'warning';
          case 'error': return 'error';
          case 'note': return 'info';
          case 'help': return 'info';
          default: return 'error';
        }
      }

      function level2type(level) {
        return level.charAt(0).toUpperCase() + level.slice(1);
      }

      // Parses json output
      function parseJsonOutput(line, messages) {
        const json = JSON.parse(line);
        const trace = [];
        json.spans.forEach(span => {
          trace.push({
            message: span.label,
            file: span.file_name,
            line: span.line_start,
            line_end: span.line_end,
            col: span.column_start,
            col_end: span.column_end,
            type: level2type('note'),
            severity: level2severity('note')
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
          messages.push({
            message: json.message,
            file: span.file_name,
            line: span.line_start,
            line_end: span.line_end,
            col: span.column_start,
            col_end: span.column_end,
            type: level2type(json.level),
            severity: level2severity(json.level),
            trace: trace
          });
        });
      }

      function matchFunction(output) {
        const useJson = atom.config.get('build-cargo.jsonErrors');
        const messages = [];  // resulting collection of high-level messages
        let msg = null;       // current high-level message (error, warning or panic)
        let sub = null;       // current submessage (note or help)
        let match = null;

        output.split(/\n/).forEach(line => {
          // Cargo final error messages start with 'error:', skip them
          if (line === null || line === '' || line.substring(0, 6) === 'error:') {
            msg = null;
            sub = null;
          } else if (useJson && line[0] === '{') {
            // Parse a JSON block
            parseJsonOutput(line, messages);
          } else if (line.substring(0, 16) === 'stack backtrace:') {
            // Start a stacktrace submessage (it's always under a panic message)
            if (msg !== null) {
              sub = {
                message: 'Stack backtrace',
                type: 'Stack'
              };
              msg.trace.push(sub);
            }
          } else {
            // Check for compilation messages
            match = /^(.+.rs):(\d+):(\d+):(?: (\d+):(\d+))? (error|warning|help|note): (.*)/g.exec(line);
            if (match) {
              const level = match[6];
              const message = match[7];
              if (level === 'error' || level === 'warning' || msg === null) {
                msg = {
                  message: message,
                  file: match[1],
                  line: match[2],
                  line_end: match[4],
                  col: match[3],
                  col_end: match[5],
                  type: level2type(level),
                  severity: level2severity(level),
                  trace: []
                };
                messages.push(msg);
                sub = null;
              } else {
                sub = {
                  message: message,
                  file: match[1],
                  line: match[2],
                  line_end: match[4],
                  col: match[3],
                  col_end: match[5],
                  type: level2type(level),
                  severity: level2severity(level)
                };
                msg.trace.push(sub);
              }
            } else {
              // Check for panic
              match = /^(thread '[^']+' panicked at '[^']+'), ([^\/][^\:]+):(\d+)/g.exec(line);
              if (match) {
                msg = {
                  message: match[1],
                  file: match[2],
                  line: match[3],
                  type: 'Panic',
                  severity: 'error',
                  trace: []
                };
                messages.push(msg);
                sub = null;
              } else if (sub !== null) {
                // Just a description in the current block. Only add it when in submessage
                // because Linter does the job for high-level messages.
                sub.message += '\n' + line;
              }
            }
          }
        });
        return messages;
      }

      const commands = [
        {
          name: 'Cargo: build (debug)',
          exec: cargoPath,
          env: env,
          args: [ 'build' ].concat(args),
          sh: false,
          functionMatch: matchFunction,
          atomCommandName: 'cargo:build-debug'
        },
        {
          name: 'Cargo: build (release)',
          exec: cargoPath,
          env: env,
          args: [ 'build', '--release' ].concat(args),
          sh: false,
          functionMatch: matchFunction,
          atomCommandName: 'cargo:build-release'
        },
        {
          name: 'Cargo: bench',
          exec: cargoPath,
          env: env,
          args: [ 'bench' ].concat(args),
          sh: false,
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
          functionMatch: matchFunction,
          atomCommandName: 'cargo:run-debug'
        },
        {
          name: 'Cargo: run (release)',
          exec: cargoPath,
          env: env,
          args: [ 'run', '--release' ].concat(args),
          sh: false,
          functionMatch: matchFunction,
          atomCommandName: 'cargo:run-release'
        },
        {
          name: 'Cargo: test',
          exec: cargoPath,
          env: env,
          args: [ 'test' ].concat(args),
          sh: false,
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
          functionMatch: matchFunction,
          atomCommandName: 'cargo:build-example'
        },
        {
          name: 'Cargo: run example',
          exec: cargoPath,
          env: env,
          args: [ 'run', '--example', '{FILE_ACTIVE_NAME_BASE}' ].concat(args),
          sh: false,
          functionMatch: matchFunction,
          atomCommandName: 'cargo:run-example'
        },
        {
          name: 'Cargo: run bin',
          exec: cargoPath,
          env: env,
          args: [ 'run', '--bin', '{FILE_ACTIVE_NAME_BASE}' ].concat(args),
          sh: false,
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
          functionMatch: matchFunction,
          atomCommandName: 'cargo:check'
        });
      }

      return commands;
    }
  };
}

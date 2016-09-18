'use babel';

import fs from 'fs';

// Transfer existing settings from previous versions of the package
if (atom.config.get('build-cargo.showBacktrace')) {
  atom.config.set('build-cargo.backtraceType', 'Compact');
}
if (atom.config.get('build-cargo.cargoCheck')) {
  atom.config.set('build-cargo.extCommands.cargoCheck', true);
}
if (atom.config.get('build-cargo.cargoClippy')) {
  atom.config.set('build-cargo.extCommands.cargoClippy', true);
}
// Remove old settings
atom.config.unset('build-cargo.showBacktrace');
atom.config.unset('build-cargo.cargoCheck');
atom.config.unset('build-cargo.cargoClippy');
atom.config.unset('build-cargo.jsonErrors');

export const config = {
  cargoPath: {
    title: 'Path to the Cargo executable',
    type: 'string',
    default: 'cargo',
    order: 1
  },
  multiCrateProjects: {
    title: 'Enable multi-crate projects support',
    description: 'Build internal crates separately based on the current open file.',
    type: 'boolean',
    default: false,
    order: 2
  },
  verbose: {
    title: 'Verbose Cargo output',
    description: 'Pass the --verbose flag to Cargo.',
    type: 'boolean',
    default: false,
    order: 3
  },
  backtraceType: {
    title: 'Backtrace',
    description: 'Stack backtrace verbosity level. Uses the environment variable RUST_BACKTRACE=1 if not `Off`.',
    type: 'string',
    default: 'Off',
    enum: [ 'Off', 'Compact', 'Full' ],
    order: 4
  },
  jsonErrorFormat: {
    title: 'Use JSON error format',
    description: 'Use JSON error format instead of human readable output. When switched off, Linter is not used to display compiler messages.',
    type: 'boolean',
    default: true,
    order: 5
  },
  openDocs: {
    title: 'Open documentation in browser after \'doc\' target is built',
    type: 'boolean',
    default: false,
    order: 6
  },
  extCommands: {
    title: 'Extended Commands',
    type: 'object',
    order: 7,
    properties: {
      cargoCheck: {
        title: 'Enable cargo check',
        description: 'Enable the `cargo check` Cargo command. Only use this if you have `cargo check` installed.',
        type: 'boolean',
        default: false,
        order: 1
      },
      cargoClippy: {
        title: 'Enable cargo clippy',
        description: 'Enable the `cargo clippy` Cargo command to run Clippy\'s lints. Only use this if you have the `cargo clippy` package installed.',
        type: 'boolean',
        default: false,
        order: 2
      }
    }
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
      const path = require('path');
      const err = require('./errors');
      const jsonParser = require('./json-parser');
      const panicParser = require('./panic-parser');

      let buildWorkDir;        // The last build workding directory (might differ from the project root for multi-crate projects)
      const panicsLimit = 10;  // Max number of panics to show at once

      function matchFunction(output) {
        const useJson = atom.config.get('build-cargo.jsonErrorFormat');
        const messages = [];    // resulting collection of high-level messages
        let msg = null;         // current high-level message (error, warning or panic)
        let sub = null;         // current submessage (note or help)
        let panicsN = 0;        // quantity of panics in this output
        const lines = output.split(/\n/);
        for (let i = 0; i < lines.length; i++) {
          let line = lines[i];
          if (!useJson) {
            // Remove ANSI escape codes from output
            line = line.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
          }
          // Cargo final error messages start with 'error:', skip them
          if (line === null || line === '' || line.startsWith('error:')) {
            msg = null;
            sub = null;
          } else if (useJson && line[0] === '{') {
            // Parse a JSON block
            jsonParser.parseMessage(line, messages);
          } else {
            // Check for compilation messages
            const match = /^(.+):(\d+):(\d+):(?: (\d+):(\d+))? (error|warning|help|note): (.*)/g.exec(line);
            if (match) {
              let filePath = match[1];
              let startLine = match[2];
              let startCol = match[3];
              let endLine = match[4];
              let endCol = match[5];
              const level = match[6];
              const message = match[7];
              if (level === 'error' || level === 'warning') {
                msg = {
                  message: message,
                  file: filePath,
                  line: startLine,
                  line_end: endLine,
                  col: startCol,
                  col_end: endCol,
                  type: err.level2type(level),
                  severity: err.level2severity(level),
                  trace: []
                };
                messages.push(msg);
                sub = null;
              } else {
                if (filePath.startsWith('<')) {
                  // The message has incorrect file link, omit it
                  filePath = undefined;
                  startLine = undefined;
                  startCol = undefined;
                  endLine = undefined;
                  endCol = undefined;
                } else if (msg && msg.file.startsWith('<')) {
                  // The root message has incorrect file link, use the one from the extended messsage
                  msg.file = filePath;
                  msg.line = startLine;
                  msg.line_end = endLine;
                  msg.col = startCol;
                  msg.col_end = endCol;
                }
                if (msg) {
                  sub = {
                    message: message,
                    file: filePath,
                    line: startLine,
                    line_end: endLine,
                    col: startCol,
                    col_end: endCol,
                    type: err.level2type(level),
                    severity: err.level2severity(level)
                  };
                  msg.trace.push(sub);
                }
              }
            } else {
              // Check for panic
              const parsedQty = panicParser.tryParsePanic(lines, i, panicsN < panicsLimit, buildWorkDir);
              if (parsedQty > 0) {
                msg = null;
                sub = null;
                i += parsedQty - 1; // Subtract one because the current line is already counted
                panicsN += 1;
              } else if (sub !== null) {
                // Just a description in the current block. Only add it when in submessage
                // because Linter does the job for high-level messages.
                sub.message += '\n' + line;
              }
            }
          }
        }
        const hiddenPanicsN = panicsN - panicsLimit;
        if (hiddenPanicsN === 1) {
          atom.notifications.addError('One more panic is hidden', { dismissable: true });
        } else if (hiddenPanicsN > 1) {
          atom.notifications.addError(hiddenPanicsN + ' more panics are hidden', { dismissable: true });
        }
        return messages.filter(function (m) {
          return err.preprocessMessage(m, buildWorkDir);
        });
      }

      // Checks if the given object represents the root of the project or file system
      function isRoot(parts) {
        if (parts.dir === parts.root) {
          return true;    // The file system root
        }
        return atom.project.getPaths().some(p => {
          return parts.dir === p;
        });
      }

      // Returns the closest directory with Cargo.toml in it.
      // If there's no such directory, returns undefined.
      function findCargoProjectDir(p) {
        const parts = path.parse(p);
        const root = isRoot(parts);
        const cargoToml = path.format({
          dir: parts.dir,
          base: 'Cargo.toml'
        });
        try {
          if (fs.statSync(cargoToml).isFile()) {
            return {
              dir: parts.dir,
              root: root
            };
          }
        } catch (e) {
          if (e.code !== 'ENOENT') {  // No such file (Cargo.toml)
            throw e;
          }
        }
        if (root) {
          return undefined;
        }
        return findCargoProjectDir(parts.dir);
      }

      // This function is called before every build. It finds the closest
      // Cargo.toml file in the path and uses its directory as working.
      function prepareBuild(buildCfg) {
        // Common build command parameters
        buildCfg.exec = atom.config.get('build-cargo.cargoPath');
        buildCfg.env = {};
        if (atom.config.get('build-cargo.jsonErrorFormat')) {
          buildCfg.env.RUSTFLAGS = '-Z unstable-options --error-format=json';
        } else if (process.platform !== 'win32') {
          buildCfg.env.TERM = 'xterm';
          buildCfg.env.RUSTFLAGS = '--color=always';
        }
        if (atom.config.get('build-cargo.backtraceType') !== 'Off') {
          buildCfg.env.RUST_BACKTRACE = '1';
        }
        buildCfg.args = buildCfg.args || [];
        atom.config.get('build-cargo.verbose') && buildCfg.args.push('--verbose');

        // Substitute working directory if we are in a multi-crate environment
        if (atom.config.get('build-cargo.multiCrateProjects')) {
          const editor = atom.workspace.getActiveTextEditor();
          buildCfg.cwd = undefined;
          if (editor && editor.getPath()) {
            const wdInfo = findCargoProjectDir(editor.getPath());
            if (wdInfo) {
              if (!wdInfo.root) {
                const p = path.parse(wdInfo.dir);
                atom.notifications.addInfo('Building ' + p.base + '...');
              }
              buildCfg.cwd = wdInfo.dir;
            }
          }
        }
        if (!buildCfg.cwd && atom.project.getPaths().length > 0) {
          // Build in the root of the first path by default
          buildCfg.cwd = atom.project.getPaths()[0];
        }
        buildWorkDir = buildCfg.cwd;
      }

      const commands = [
        {
          name: 'Cargo: build (debug)',
          atomCommandName: 'cargo:build-debug',
          argsCfg: [ 'build' ]
        },
        {
          name: 'Cargo: build (release)',
          atomCommandName: 'cargo:build-release',
          argsCfg: [ 'build', '--release' ]
        },
        {
          name: 'Cargo: bench',
          atomCommandName: 'cargo:bench',
          argsCfg: [ 'bench' ]
        },
        {
          name: 'Cargo: clean',
          atomCommandName: 'cargo:clean',
          argsCfg: [ 'clean' ]
        },
        {
          name: 'Cargo: doc',
          atomCommandName: 'cargo:doc',
          argsCfg: [ 'doc' ],
          preConfig: function () {
            atom.config.get('build-cargo.openDocs') && this.args.push('--open');
          }
        },
        {
          name: 'Cargo: run (debug)',
          atomCommandName: 'cargo:run-debug',
          argsCfg: [ 'run' ]
        },
        {
          name: 'Cargo: run (release)',
          atomCommandName: 'cargo:run-release',
          argsCfg: [ 'run', '--release' ]
        },
        {
          name: 'Cargo: test',
          atomCommandName: 'cargo:run-test',
          argsCfg: [ 'test' ]
        },
        {
          name: 'Cargo: update',
          atomCommandName: 'cargo:update',
          argsCfg: [ 'update' ]
        },
        {
          name: 'Cargo: build example',
          atomCommandName: 'cargo:build-example',
          argsCfg: [ 'build', '--example', '{FILE_ACTIVE_NAME_BASE}' ]
        },
        {
          name: 'Cargo: run example',
          atomCommandName: 'cargo:run-example',
          argsCfg: [ 'run', '--example', '{FILE_ACTIVE_NAME_BASE}' ]
        },
        {
          name: 'Cargo: run bin',
          atomCommandName: 'cargo:run-bin',
          argsCfg: [ 'run', '--bin', '{FILE_ACTIVE_NAME_BASE}' ]
        }
      ];

      if (atom.config.get('build-cargo.extCommands.cargoClippy')) {
        commands.push({
          name: 'Cargo: Clippy',
          atomCommandName: 'cargo:clippy',
          argsCfg: [ 'clippy' ]
        });
      }

      if (atom.config.get('build-cargo.extCommands.cargoCheck')) {
        commands.push({
          name: 'Cargo: check',
          atomCommandName: 'cargo:check',
          argsCfg: [ 'check' ]
        });
      }

      commands.forEach(cmd => {
        cmd.exec = atom.config.get('build-cargo.cargoPath');
        cmd.sh = false;
        cmd.functionMatch = matchFunction;
        cmd.preBuild = function () {
          this.args = this.argsCfg.slice(0);    // Clone initial arguments
          if (this.preConfig) {
            this.preConfig();                   // Allow the command to configure its arguments
          }
          prepareBuild(this);
        };
      });

      return commands;
    }
  };
}

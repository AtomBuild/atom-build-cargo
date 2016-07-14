'use babel';

import fs from 'fs';

// Transfer existing settings from previous versions of the package
if (atom.config.get('build-cargo.cargoCheck')) {
  atom.config.set('build-cargo.extCommands.cargoCheck', true)
}
if (atom.config.get('build-cargo.cargoClippy')) {
  atom.config.set('build-cargo.extCommands.cargoClippy', true)
}
// Remove old settings
atom.config.unset('build-cargo.cargoCheck');
atom.config.unset('build-cargo.cargoClippy');

const defaultCargoCmd = 'cargo';

export const config = {
  cargoPath: {
    title: 'Path to the Cargo executable',
    type: 'string',
    default: defaultCargoCmd,
    order: 1
  },
  multiCrateProjects: {
    title: 'Enable multi-crate projects support',
    description: 'Build internal crates separately based on the current open file',
    type: 'boolean',
    default: false,
    order: 2
  },
  verbose: {
    title: 'Verbose Cargo output',
    description: 'Pass the --verbose flag to cargo',
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
  jsonErrors: {
    title: 'Use json errors',
    description: 'Instead of using regex to parse the human readable output (requires rustc version 1.7)\nNote: this is an unstable feature of the Rust compiler and prone to change and break frequently.',
    type: 'boolean',
    default: false,
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

      // Constants to detect links to Rust's source code and make them followable
      const unixRustSrcPrefix = '../src/';
      const windowsRustSrcPrefix = '..\\src\\';
      const rustSrcPrefixLen = unixRustSrcPrefix.length;  // Equal for both unix and windows
      const rustSrcPath = process.env.RUST_SRC_PATH;

      let buildWorkDir;        // The last build workding directory (might differ from the project root for multi-crate projects)
      let panicsCounter = 0;   // Counts all panics
      const panicsLimit = 10;  // Max number of panics to show at once

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

      // Checks if the given file path returned by rustc or cargo points to the Rust source code
      function isRustSourceLink(filePath) {
        const prefix = filePath.substring(0, rustSrcPrefixLen);
        return prefix === unixRustSrcPrefix || prefix === windowsRustSrcPrefix;
      }

      // Checks if a file pointed by a message relates to the Rust source code
      // (has one of the predefined prefixes) and corrects it if needed and if possible
      function normalizePath(filePath) {
        if (rustSrcPath && isRustSourceLink(filePath)) {
          // Combine RUST_SRC_PATH with what follows after the prefix
          // Subtract 1 to preserve the original delimiter
          return rustSrcPath + filePath.substring(rustSrcPrefixLen - 1);
        }
        return filePath;
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

      // Shows panic info
      function showPanic(panic) {
        // Only add link if we have panic.filePath, otherwise it's an external link
        atom.notifications.addError(
          'A thread panicked at '
              + (panic.filePath ? '<a id="' + panic.id + '" href="#">' : '')
              + 'line ' + panic.line + ' in ' + panic.file
              + (panic.filePath ? '</a>' : ''), {
                detail: panic.message,
                stack: panic.stack,
                dismissable: true
              });
        if (panic.filePath) {
          const link = document.getElementById(panic.id);
          if (link) {
            link.panic = panic;
            link.addEventListener('click', function (e) {
              atom.workspace.open(e.target.panic.filePath, {
                searchAllPanes: true,
                initialLine: e.target.panic.line - 1
              });
            });
          }
        }
      }

      // Tries to parse a stack trace. Returns the quantity of actually parsed lines.
      function tryParseStackTrace(lines, i, panic) {
        let parsedQty = 0;
        let line = lines[i];
        if (line.substring(0, 16) === 'stack backtrace:') {
          parsedQty += 1;
          const panicLines = [];
          for (let j = i + 1; j < lines.length; j++) {
            line = lines[j];
            const matchFunc = /^\s+(\d+):\s+(0x[a-f0-9]+) - (.+)$/g.exec(line);
            if (matchFunc) {
              // A line with a function call
              panicLines.push(line);
            } else {
              const matchLink = /(at (.+):(\d+))$/g.exec(line);
              if (matchLink) {
                // A line with a file link
                if (!panic.file && !isRustSourceLink(matchLink[2])) {
                  panic.file = matchLink[2];    // Found a link to our source code
                  panic.line = matchLink[3];
                }
                panicLines.push('  ' + matchLink[1]); // less leading spaces
              } else {
                // Stack trace has ended
                break;
              }
            }
            parsedQty += 1;
          }
          panic.stack = panicLines.join('\n');
        }
        return parsedQty;
      }

      // Tries to parse a panic and its stack trace. Returns the quantity of actually
      // parsed lines.
      function tryParsePanic(lines, i, show) {
        const line = lines[i];
        const match = /(thread '.+' panicked at '.+'), ([^\/][^\:]+):(\d+)/g.exec(line);
        let parsedQty = 0;
        if (match) {
          parsedQty = 1;
          const panic = {
            id: 'build-cargo-panic-' + (++panicsCounter), // Unique panic ID
            message: match[1],
            file: isRustSourceLink(match[2]) ? undefined : match[2],
            filePath: undefined,
            line: parseInt(match[3], 10),
            stack: undefined
          };
          parsedQty = 1 + tryParseStackTrace(lines, i + 1, panic);
          if (panic.file) {
            panic.filePath = path.isAbsolute(panic.file) ? panic.file : path.join(buildWorkDir, panic.file);
          } else {
            panic.file = match[2];  // We failed to find a link to our source code, use Rust's
          }
          if (show) {
            showPanic(panic);
          }
        }
        return parsedQty;
      }

      function matchFunction(output) {
        const useJson = atom.config.get('build-cargo.jsonErrors');
        const messages = [];    // resulting collection of high-level messages
        let msg = null;         // current high-level message (error, warning or panic)
        let sub = null;         // current submessage (note or help)
        let panicsN = 0;        // quantity of panics in this output
        const lines = output.split(/\n/);
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          // Cargo final error messages start with 'error:', skip them
          if (line === null || line === '' || line.substring(0, 6) === 'error:') {
            msg = null;
            sub = null;
          } else if (useJson && line[0] === '{') {
            // Parse a JSON block
            parseJsonOutput(line, messages);
          } else {
            // Check for compilation messages
            const match = /^(.+.rs):(\d+):(\d+):(?: (\d+):(\d+))? (error|warning|help|note): (.*)/g.exec(line);
            if (match) {
              const level = match[6];
              const message = match[7];
              if (level === 'error' || level === 'warning' || msg === null) {
                msg = {
                  message: message,
                  file: normalizePath(match[1]),
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
                  file: normalizePath(match[1]),
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
              const parsedQty = tryParsePanic(lines, i, panicsN < panicsLimit);
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
        return messages;
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
        if (atom.config.get('build-cargo.jsonErrors')) {
          buildCfg.env.RUSTFLAGS = '-Z unstable-options --error-format=json';
        }
        if (atom.config.get('build-cargo.showBacktrace')) {
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
          preConfig: function() {
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
        cmd.exec = defaultCargoCmd;
        cmd.sh = false;
        cmd.functionMatch = matchFunction;
        cmd.preBuild = function() {
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

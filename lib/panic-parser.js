'use babel';

//
// Panics and stack backtraces parser.
//

const path = require('path');

// Constants to detect links to Rust's source code and make them followable
const unixRustSrcPrefix = '../src/';
const windowsRustSrcPrefix = '..\\src\\';

let panicsCounter = 0;   // Counts all panics

// Checks if the given file path returned by rustc or cargo points to the Rust source code
function isRustSourceLink(filePath) {
  return filePath.startsWith(unixRustSrcPrefix) || filePath.startsWith(windowsRustSrcPrefix);
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
      const matchFunc = /^(\s+\d+):\s+0x[a-f0-9]+ - (?:(.+)::h[0-9a-f]+|(.+))$/g.exec(line);
      if (matchFunc) {
        // A line with a function call
        if (atom.config.get('build-cargo.backtraceType') === 'Compact') {
          line = matchFunc[1] + ':  ' + (matchFunc[2] || matchFunc[3]);
        }
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
const tryParsePanic = (lines, i, show, buildWorkDir) => {
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
};

export { tryParsePanic };

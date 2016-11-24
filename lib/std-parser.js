'use babel';

//
// Standard error format parser.
//

const err = require('./errors');

// Detects message headers (the main message and location):
//
// Examles:
//
// error[E0023]: Some error message
//   --> src/main.rs:157:12
//
// <std macros>:1:33: 1:58 Some message
//
// src/main.rs:157:12: 157:18 Some message
//
// error: Something happened
//
// Retursn the message infromation and the number of parsed lines.
function parseMessageHeader(lines, i) {
  const match = /^(error|warning|note|help)(?:\[(E\d+)\])?: (.*)/.exec(lines[i]);
  if (match) {
    const level = match[1];
    const code = match[2];
    const message = match[3];
    if (lines.length >= i) {
      const locMatch = /^\s*--> (.+):(\d+):(\d+)/.exec(lines[i + 1]);
      if (locMatch) {
        const locFile = locMatch[1];
        const locLine = parseInt(locMatch[2], 10);
        const locColStart = parseInt(locMatch[3], 10);
        const msg = {
          message: message,
          type: err.level2type(level),
          severity: err.level2severity(level),
          file: locFile,
          line: locLine,
          line_end: locLine,
          col: locColStart,
          col_end: locColStart + 1,  // Highlight only one symbol by default
          trace: [],
          extra: {
            errorCode: code
          }
        };
        if (code && code.length > 0) {
          msg.trace.push({
            html_message: '<a href="https://doc.rust-lang.org/error-index.html#' + msg.extra.errorCode + '">Explain error ' + code + '</a>',
            type: 'Explanation',
            severity: 'info',
            extra: {},
            order: 100 // Always put it to the end of the list
          });
        }
        return {
          message: msg,
          parsedQty: 2    // Number of parsed lines
        };
      }
    }
  }

  // Try the format that is usually found in errors within macros:
  // file_name:l:c: le:ce: message
  const macroMatch = /^\s*(.+):(\d+):(\d+): (\d+):(\d+) (error|warning|note|help):\s*(.*)/.exec(lines[i]);
  if (macroMatch) {
    const msg = {
      message: macroMatch[7],
      type: err.level2type(macroMatch[6]),
      severity: err.level2severity(macroMatch[6]),
      file: macroMatch[1],
      line: parseInt(macroMatch[2], 10),
      line_end: parseInt(macroMatch[4], 10),
      col: parseInt(macroMatch[3], 10),
      col_end: parseInt(macroMatch[5], 10),
      trace: [],
      extra: {}
    };
    return {
      message: msg,
      parsedQty: 1    // Number of parsed lines
    };
  }

  // Try the simplest format:
  // error: message
  const simpleMatch = /^\s*(error|warning|note|help):\s*(.*)/.exec(lines[i]);
  if (simpleMatch) {
    const msg = {
      message: simpleMatch[2],
      type: err.level2type(simpleMatch[1]),
      severity: err.level2severity(simpleMatch[1]),
      trace: [],
      extra: {}
    };
    return {
      message: msg,
      parsedQty: 1    // Number of parsed lines
    };
  }

  return undefined;
}

// Parses a code block. If a message provided, extracts the additional info (the span length,
// the additional text etc) from the block and modifies the message info accordingly.
//
// Examle:
//
//    |
// 12 |    some code here
//    |         ^^^^ additional text
//    = note: additional note
//
// Returns the number of parsed lines.
function parseCodeBlock(lines, i, msg) {
  let l = i;
  let spanLineNo = -1;
  while (l < lines.length && lines[l] !== '') {
    const line = lines[l];
    let lineParsed = false;
    const codeMatch = /^\s*(\d*)\s*\|.*/.exec(line);
    if (codeMatch) {
      if (codeMatch[1].length > 0) {
        spanLineNo = parseInt(codeMatch[1], 10);
      } else {
        const spanMatch = /^[\s\d]*\|(\s+)([\^-]+)\s*(.*)/.exec(line);
        if (spanMatch) {
          // The line contains span highlight
          const startCol = spanMatch[1].length;
          const light = spanMatch[2];
          const label = spanMatch[3].length > 0 ? spanMatch[3] : undefined;
          if (light[0] === '^') {
            // It's the primary span. Copy the highlighting infro to the main message
            msg.col_end = msg.col + light.length;
            msg.extra.spanLabel = label;
          } else if (light[0] === '-' && label) {
            // It's a secondary span, create a submessage
            msg.trace.push({
              message: label,
              type: 'Note',
              severity: 'info',
              file: msg.file,
              line: spanLineNo,
              line_end: spanLineNo,
              col: startCol,
              col_end: startCol + light.length,
              extra: {}
            });
          }
        }
      }
      lineParsed = true;
    } else {
      const auxMatch = /^\s*= (note|help): (.+)/.exec(line);
      if (auxMatch) {
        msg.trace.push({
          message: auxMatch[2],
          type: err.level2type(auxMatch[1]),
          severity: err.level2severity(auxMatch[1]),
          extra: {}
        });
        lineParsed = true;
      }
    }
    if (!lineParsed && line.startsWith('...')) {  // Gaps in the source code are displayed this way
      lineParsed = true;
    }
    // TODO: Backward compatibility with Rust prior to 1.12. Remove this if-block when there's no need to support it.
    if (!lineParsed && (/^[^:]*:(\d+)\s+.*/.test(line) || /^\s+\^.*/.test(line))) {
      lineParsed = true;
    }
    if (lineParsed) {
      l += 1;
    } else {
      break;
    }
  }

  return l - i;
}

function parseMessageBlock(lines, i, messages, parentMsg) {
  let l = i;
  const headerInfo = parseMessageHeader(lines, i);
  if (headerInfo) {
    // TODO: Backward compatibility with Rust prior to 1.12. Remove this if-block when there's no need to support it.
    if ((parentMsg && (headerInfo.message.severity === 'error' || headerInfo.message.severity === 'warning'))
        || (!parentMsg && headerInfo.message.severity !== 'error' && headerInfo.message.severity !== 'warning')) {
      return 0;
    }
    // Message header detected, remember it and continue parsing
    l += headerInfo.parsedQty;
    if (parentMsg) {
      // We are parsing a submessage, add it to trace
      parentMsg.trace.push(headerInfo.message);
    } else {
      // We are parsing the main message
      messages.push(headerInfo.message);
    }
    l += parseCodeBlock(lines, l, headerInfo.message);
    // If it's the main message, parse its submessages
    if (!parentMsg) {
      while (l < lines.length) {
        const subParsedQty = parseMessageBlock(lines, l, messages, headerInfo.message);
        if (subParsedQty > 0) {
          l += subParsedQty;
        } else {
          break;
        }
      }
    }
  }

  return l - i;
}

const tryParseMessage = (lines, i, messages) => {
  return parseMessageBlock(lines, i, messages, null);
};

export { tryParseMessage };

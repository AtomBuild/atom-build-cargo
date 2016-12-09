'use babel';

//
// JSON error format parser.
//

const err = require('./errors');

import marked from 'marked';

// Copies a location from the given span to a linter message
function copySpanLocation(span, msg) {
  msg.file = span.file_name;
  msg.line = span.line_start;
  msg.line_end = span.line_end;
  msg.col = span.column_start;
  msg.col_end = span.column_end;
}

function parseSpan(span, msg, mainMsg) {
  if (span.is_primary) {
    msg.extra.spanLabel = span.label;
    // If the error is within a macro, add the macro text to the message
    if (span.file_name && span.file_name.startsWith('<') && span.text && span.text.length > 0) {
      msg.trace.push({
        message: span.text[0].text,
        type: 'Macro',
        severity: 'info',
        extra: {}
      });
    }
  }
  if (span.file_name && !span.file_name.startsWith('<')) {
    if (!span.is_primary && span.label) {
      // A secondary span
      const trace = {
        message: span.label,
        type: 'Note',
        severity: 'info',
        extra: {}
      };
      copySpanLocation(span, trace);
      msg.trace.push(trace);
    }
    // Copy the main error location from the primary span or from any other
    // span if it hasn't been defined yet
    if (span.is_primary || !msg.file) {
      copySpanLocation(span, msg);
    }
    return true;
  } else if (span.expansion) {
    return parseSpan(span.expansion.span, msg, mainMsg);
  }
  return false;
}

// Parses spans of the given message
function parseSpans(jsonObj, msg, mainMsg) {
  if (jsonObj.spans) {
    jsonObj.spans.forEach(span => parseSpan(span, msg, mainMsg));
  }
}

// Parses a compile message in the JSON format
const parseMessage = (line, messages) => {
  const json = JSON.parse(line).message;
  if (!json || !json.level) {
    // It's a cargo general message, not a compiler's one. Skip it.
    // In the future can be changed to "reason !== 'compiler-message'"
    return;
  }
  const msg = {
    message: json.message,
    type: err.level2type(json.level),
    severity: err.level2severity(json.level),
    trace: [],
    extra: {}
  };
  parseSpans(json, msg, msg);
  json.children.forEach(child => {
    const tr = {
      message: child.message,
      type: err.level2type(child.level),
      severity: err.level2severity(child.level),
      trace: [],
      extra: {}
    };
    parseSpans(child, tr, msg);
    msg.trace.push(tr);
  });
  if (json.code) {
    msg.extra.errorCode = json.code.code;
    if (json.code.explanation) {
      msg.trace.push({
        html_message: '<details><summary>Expand to see the detailed explanation</summary>' + marked(json.code.explanation) + '</details>',
        type: 'Explanation',
        severity: 'info',
        extra: {}
      });
    }
  }
  messages.push(msg);
};

export { parseMessage };

'use babel';

//
// JSON error format parser.
//

const err = require('./errors');

// Collection of span labels that must be ignored (not added to the main message)
// because the main message already contains the same information
const redundantLabels = [{
  // E0001
  label: /this is an unreachable pattern/,
  message: /unreachable pattern/
}, {
  // E0004
  label: /pattern `.+` not covered/,
  message: /non-exhaustive patterns: `.+` not covered/
}, {
  // E00023
  label: /expected \d+ fields, found \d+/,
  message: /this pattern has \d+ field, but the corresponding variant has \d+ fields/
}, {
  // E0026
  label: /struct `.+` does not have field `.+`/,
  message: /struct `.+` does not have a field named `.+`/
}, {
  // E0027
  label: /missing field `.+`/,
  message: /pattern does not mention field `.+`/
}, {
  // E0029
  label: /ranges require char or numeric types/,
  message: /only char and numeric types are allowed in range patterns/
}, {
  // E0040
  label: /call to destructor method/,
  message: /explicit use of destructor method/
}, {
  // E0046
  label: /missing `.+` in implementation/,
  message: /not all trait items implemented, missing: `.+`/
}, {
  // E0057
  label: /expected \d+ parameter[s]?/,
  message: /this function takes \d+ parameter[s]? but \d+ parameter[s]? (was|were) supplied/
}, {
  // E0062
  label: /used more than once/,
  message: /field `.+` specified more than once/
}, {
  // E0067
  label: /invalid expression for left-hand side/,
  message: /invalid left-hand side expression/
}, {
  // E0068
  label: /return type is not \(\)/,
  message: /`return;` in a function whose return type is not `\(\)`/
}, {
  // E0071
  label: /not a struct/,
  message: /`.+` does not name a struct or a struct variant/
}, {
  // E0072
  label: /recursive type has infinite size/,
  message: /recursive type `.+` has infinite size/
}, {
  // E0087
  label: /expected \d+ parameter[s]?/,
  message: /too many type parameters provided: expected at most \d+ parameter[s]?, found \d+ parameter[s]?/
}, {
  // E0091
  label: /unused type parameter/,
  message: /type parameter `.+` is unused/
}, {
  // E0101
  label: /cannot resolve type of expression/,
  message: /cannot determine a type for this expression: unconstrained type/
}, {
  // E0102
  label: /cannot resolve type of variable/,
  message: /cannot determine a type for this local variable: unconstrained type/
}, {
  // E0106
  label: /expected lifetime parameter/,
  message: /missing lifetime specifier/
}, {
  // E0107
  label: /(un)?expected (\d+ )?lifetime parameter[s]?/,
  message: /wrong number of lifetime parameters: expected \d+, found \d+/
}, {
  // E0109
  label: /type parameter not allowed/,
  message: /type parameters are not allowed on this type/
}, {
  // E0110
  label: /lifetime parameter not allowed/,
  message: /lifetime parameters are not allowed on this type/
}, {
  // E0116
  label: /impl for type defined outside of crate/,
  message: /cannot define inherent `.+` for a type outside of the crate where the type is defined/
}, {
  // E0117
  label: /impl doesn't use types inside crate/,
  message: /only traits defined in the current crate can be implemented for arbitrary types/
}, {
  // E0119
  label: /conflicting implementation for `.+`/,
  message: /conflicting implementations of trait `.+` for type `.+`/
}, {
  // E0120
  label: /implementing Drop requires a struct/,
  message: /the Drop trait may only be implemented on structures/
}, {
  // E0121
  label: /not allowed in type signatures/,
  message: /the type placeholder `_` is not allowed within types on item signatures/
}, {
  // E0124
  label: /field already declared/,
  message: /field `.+` is already declared/
}, {
  // E0368
  label: /cannot use `[<>+&|^\-]?=` on type `.+`/,
  message: /binary assignment operation `[<>+&|^\-]?=` cannot be applied to type `.+`/
}, {
  // E0387
  label: /cannot borrow mutably/,
  message: /cannot borrow immutable local variable `.+` as mutable/
}];

// Copies a location from the given span to a linter message
function copySpanLocation(span, msg) {
  msg.file = span.file_name;
  msg.line = span.line_start;
  msg.line_end = span.line_end;
  msg.col = span.column_start;
  msg.col_end = span.column_end;
}

// Checks if the location of the given span is the same as the location
// of the given message
function compareLocations(span, msg) {
  return span.file_name === msg.file
    && span.line_start === msg.line
    && span.line_end === msg.line_end
    && span.column_start === msg.col
    && span.column_end === msg.col_end;
}

// Appends spans's label to the main message. It only adds the label if:
// - the main message doesn't contain exactly the same phrase
// - the main message doesn't contain the same information but uses different wording
function appendSpanLabel(span, msg) {
  if (!span.label || msg.message.indexOf(span.label) >= 0) {
    return;
  }
  for (idx in redundantLabels) {
    const l = redundantLabels[idx];
    if (l.label.test(span.label) && l.message.test(msg.message)) {
      return;
    }
  }
  msg.message += ' (' + span.label + ')';
}

function parseSpan(span, msg, mainMsg) {
  if (span.is_primary) {
    appendSpanLabel(span, msg);
    // If the error is within a macro, add the macro text to the message
    if (span.file_name && span.file_name.startsWith('<') && span.text && span.text.length > 0) {
      msg.trace.push({
        message: span.text[0].text,
        type: 'Macro',
        severity: 'info'
      });
    }
  }
  if (span.file_name && !span.file_name.startsWith('<')) {
    if (!span.is_primary && span.label) {
      // A secondary span
      const trace = {
        message: span.label,
        type: 'Note',
        severity: 'info'
      };
      // Add location only if it's not the same as in the primary span
      // or if the primary span is unknown at this point
      if (!compareLocations(span, mainMsg)) {
        copySpanLocation(span, trace);
      }
      msg.trace.push(trace);
    }
    // Copy the main error location from the primary span or from any other
    // span if it hasn't been defined yet
    if (span.is_primary || !msg.file) {
      if (!compareLocations(span, mainMsg)) {
        copySpanLocation(span, msg);
      }
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
  const json = JSON.parse(line);
  const msg = {
    message: json.message,
    type: err.level2type(json.level),
    severity: err.level2severity(json.level),
    trace: []
  };
  parseSpans(json, msg, msg);
  json.children.forEach(child => {
    const tr = {
      message: child.message,
      type: err.level2type(child.level),
      severity: err.level2severity(child.level)
    };
    parseSpans(child, tr, msg);
    msg.trace.push(tr);
  });
  if (json.code) {
    if (json.code.code) {
      msg.message += ' [' + json.code.code + ']';
    }
    if (json.code.explanation) {
      msg.trace.push({
        message: json.code.explanation,
        type: 'Explanation',
        severity: 'info'
      });
    }
  }
  messages.push(msg);
};

export { parseMessage };

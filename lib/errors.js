'use babel';

//
// Utility functions for parsing errors
//

const notificationCfg = { dismissable: true };

// Meta errors are ignored
const metaErrors = [
  /aborting due to (\d+ )?previous error[s]?/,
  /Could not compile `.+`./
];

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
  label: /expected \d+ field[s]?, found \d+/,
  message: /this pattern has \d+ field[s]?, but the corresponding variant has \d+ field[s]?/
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

const level2severity = (level) => {
  switch (level) {
    case 'warning': return 'warning';
    case 'error': return 'error';
    case 'note': return 'info';
    case 'help': return 'info';
    default: return 'error';
  }
};

const level2type = (level) => {
  return level.charAt(0).toUpperCase() + level.slice(1);
};

// Appends a span label to the main message if it's not redundant.
function appendSpanLabel(msg) {
  if (msg.extra.spanLabel && msg.extra.spanLabel.length > 0) {
    const label = msg.extra.spanLabel;
    if (msg.message.indexOf(label) >= 0) {
      return;      // Label is contained within the main message
    }
    for (let i = 0; i < redundantLabels.length; i++) {
      const l = redundantLabels[i];
      if (l.label.test(label) && l.message.test(msg.message)) {
        return;    // Submesage fits one of the deduplication patterns
      }
    }
    msg.message += ' (' + label + ')';
  }
}

// Adds the error code to the message
function appendErrorCode(msg) {
  if (msg.extra.errorCode && msg.extra.errorCode.length > 0) {
    msg.message += ' [' + msg.extra.errorCode + ']';
  }
}

// Adds an extra info (if provided) to the message.
// Deletes the extra info after extracting.
function appendExtraInfo(msg) {
  if (msg.extra) {
    appendSpanLabel(msg);
    appendErrorCode(msg);
    delete msg.extra;
  }
}

// Checks if the location of the given message is valid
function isValidLocation(msg) {
  return msg.file && !msg.file.startsWith('<');
}

// Removes location info from the given message
function removeLocation(msg) {
  delete msg.file;
  delete msg.line;
  delete msg.line_end;
  delete msg.col;
  delete msg.col_end;
}

// Copies location info from one message to another
function copyLocation(fromMsg, toMsg) {
  toMsg.file = fromMsg.file;
  toMsg.line = fromMsg.line;
  toMsg.line_end = fromMsg.line_end;
  toMsg.col = fromMsg.col;
  toMsg.col_end = fromMsg.col_end;
}

// Removes location info from the submessage if it's exactly the same as in
// the main message.
// Fixes locations that don't point to a valid source code.
// Example: <std macros>:1:33: 1:60
function normalizeLocations(msg) {
  for (let i = 0; i < msg.trace.length; i++) {
    const subMsg = msg.trace[i];
    // Deduplicate location
    if (!isValidLocation(subMsg) || (subMsg.file === msg.file && subMsg.line === msg.line && subMsg.col === msg.col)) {
      removeLocation(subMsg);
    }
    if (!isValidLocation(msg) && isValidLocation(subMsg)) {
      copyLocation(subMsg, msg);
      removeLocation(subMsg);
    }
  }
}

// Set location for special cases when the compiler doesn't provide it
function preprocessMessage(msg, buildWorkDir) {
  appendExtraInfo(msg);
  normalizeLocations(msg);
  // Reorder trace items if needed.
  // Not explicitly ordered items always go first in their original order.
  msg.trace.sort(function (a, b) {
    if (!a.order && b.order) {
      return -1;
    }
    return a.order && b.order ? a.order - b.order : 1;
  });
  // Check if the message can be added to Linter
  if (isValidLocation(msg)) {
    return true;
  }
  // Ignore meta errors
  for (let i = 0; i < metaErrors.length; i++) {
    if (metaErrors[i].test(msg.message)) {
      return false;
    }
  }
  // Location is not provided for the message, so it cannot be added to Linter.
  // Display it as a notification.
  switch (msg.level) {
    case 'info':
    case 'note':
      atom.notifications.addInfo(msg.message, notificationCfg);
      break;
    case 'warning':
      atom.notifications.addWarning(msg.message, notificationCfg);
      break;
    default:
      atom.notifications.addError(msg.message, notificationCfg);
  }
  return false;
}

export { level2severity, level2type, preprocessMessage };

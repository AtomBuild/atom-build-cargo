'use babel';

//
// Utility functions for parsing errors
//

const notificationCfg = { dismissable: true };

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

// Set location for special cases when the compiler doesn't provide it
function preprocessMessage(msg, buildWorkDir) {
  if (msg.file) {
    return true;
  }
  if (msg.message !== 'aborting due to previous error') { // This meta error is ignored
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
  }
  return false;
}

export { level2severity, level2type, preprocessMessage };

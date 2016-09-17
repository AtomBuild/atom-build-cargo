'use babel';

//
// Utility functions for parsing errors
//

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
	if (msg.message === 'main function not found') {
		msg.file = buildWorkDir + '/src/main.rs';	// TODO: When running an example, set the path to the example file.
		return true;
	}
	return false;
}

export { level2severity, level2type, preprocessMessage };

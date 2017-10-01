const childProcess = require('child_process');

module.exports = function javaversion(callback) {
  const exec = childProcess.exec('java -version', (err, stdout, stderr) => {
    const javaVersion = new RegExp('version').test(stderr)
      ? stderr
          .replace('\n', ' ')
          .split(' ')[2]
          .replace(/"/g, '')
      : false;
    return callback(err, javaVersion);
  });
};

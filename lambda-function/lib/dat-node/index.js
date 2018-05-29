const fs = require('fs');
const javaVersion = require('./java-version');

function checkDependencies(jarPath, settings) {
  /**
   * Ensure Java installed, DAT jar available
   */

  javaVersion((err, version) => {
    if (err) {
      throw err;
    }
    if (settings.verbose) {
      console.log(`Java version: ${version}`);
    }

    fs.stat(jarPath, (err, stat) => {
      if (err) {
        // console.log(err)
        throw new Error(err, 'DicomAnonymizerTool Jar file not found');
      }
      if (settings.verbose) {
        console.log(`DicomAnonymizerTool jar found`);
      }
    });
  });
}

module.exports = settings => {
  if (!settings.jarPath) {
    throw new Error('Path to DAT.jar is required');
  }
  const jarPath = settings.jarPath;
  const DATWrapper = require('./dat-wrapper')({ jarPath });

  // check deps
  checkDependencies(jarPath, settings);

  return {
    anonymize: DATWrapper.anonymize,
  };
};

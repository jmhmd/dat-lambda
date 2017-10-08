const childProcess = require('child_process');

/**
 *
options: {
  flags:
    -in {input} specifies the file or directory to be anonymized
        If {input} is a directory, all files in it and its subdirectories are processed.
    -out {output} specifies the file or directory in which to store the anonymized file or files.
        If -out is missing and -in specifies a file, the anonymized file is named {input}-an.
        If -out is missing and -in specifies a directory, an output directory named {input}-an is created.
        If {output} is missing and -in specifies a file, the anonymized file overwrites {input}
        If {output} is present and -in specifies a file, the anonymized file is named {output}
        If {output} is present and -in specifies a directory, an output directory named {output} is created.
    -f {scriptfile} specifies the filter script.
        If -f is missing, all files are accepted.
        If {scriptfile} is missing, the default script is used.
    -da {scriptfile} specifies the anonymizer script.
        If -da is missing, element anonymization is not performed.
        If {scriptfile} is missing, the default script is used.
    -p{param} "{value}" specifies a value for the specified parameter.
        {value} must be encapsulated in quotes.
    -e{element} "{script}" specifies a script for the specified element.
        {element} may be specified as a DICOM keyword, e.g. -ePatientName.
        {element} may be specified as (group,element), e.g. -e(0010,0010).
        {element} may be specified as [group,element], e.g. -e[0010,0010].
        {element} may be specified as groupelement, e.g. -e00100010.
        {script} must be encapsulated in quotes.
    -lut {lookuptablefile} specifies the anonymizer lookup table properties file.
        If -lut is missing, the default lookup table is used.
    -dpa {pixelscriptfile} specifies the pixel anonymizer script file.
        If -dpa is missing, pixel anonymization is not performed.
        If {pixelscriptfile} is missing, the default pixel script is used.
    -dec specifies that the image is to be decompressed if the pixel anonymizer requires it.
    -rec specifies that the image is to be recompressed after pixel anonymization if it was decompressed.
    -test specifies that the pixel anonymizer is to blank regions in mid-gray.
    -check {frame} specifies that the anonymized image is to be tested to ensure that the images load.
        If -check is missing, no frame checking is done.
        If {frame} is missing, only the last frame is checked.
        If {frame} is specified as first, only the first frame is checked.
        If {frame} is specified as last, only the last frame is checked.
        If {frame} is specified as all, all frames are checked.
    -n {threads} specifies the number of parallel threads used for processing.
    -v specifies verbose output
 * }
 */
module.exports = settings => {
  if (!settings.jarPath) {
    throw new Error('Path to DAT.jar is required');
  }
  const jarPath = settings.jarPath;

  return {
    anonymize: (options, callback) => {
      if (!callback && typeof options === 'function') {
        callback = options;
        options = {};
      }

      let execString = `java -jar ${jarPath}`;

      if (!options.da) {
        options.da = __dirname + '/dicom-anonymizer.default.script'; // use default anonymization script. -da flag must be present to do anonymization
      }
      if (!options.dpa) {
        options.dpa = __dirname + '/dicom-pixel-anonymizer.default.script';
      }

      if (options) {
        Object.keys(options).forEach(flag => {
          execString += ` -${flag} ${options[flag]}`;
        });
      }

      console.log(execString);

      childProcess.exec(execString, (err, stdout, stderr) => {
        return callback(err, stdout, stderr);
      });
    },
  };
};

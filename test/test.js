const childExec = require('child_process').exec;
const anonymize = require('../lambda-function/lib/dat-node')({ jarPath: '../lambda-function/lib/DicomAnonymizerTool/DAT.jar' })
  .anonymize;

const inPath = __dirname + '/01.dcm';
const outPath = __dirname + '/output/01-anon.dcm';

anonymize(
  {
    in: inPath,
    out: outPath,
  },
  (err, stdout, stderr) => {
    console.log(err, stdout, stderr);
    const execString = `diff -y <(dcmdump ${inPath}) <(dcmdump ${outPath}) --suppress-common-lines`;
    childExec(
      execString,
      { shell: "/bin/bash" },
      console.log
    );
  }
);

const multipart = require('parse-multipart');
const fs = require('fs');
const anonymize = require('./lib/dat-node')({ jarPath: './lib/DicomAnonymizerTool/DAT.jar' })
  .anonymize;

exports.handler = (event, context, callback) => {
  console.log('handler-start', new Date().getTime());
  console.time('parse-buffer');
  const bodyBuffer = new Buffer(event['body-json'].toString(), 'base64');
  const boundary = multipart.getBoundary(event.params.header['content-type']);
  const parts = multipart.Parse(bodyBuffer, boundary);
  const file = parts[0];
  const fileBuffer = file.data;
  console.timeEnd('parse-buffer');

  const filePath = `/tmp/${file.filename}`;

  // save file to tmp so we can modify
  fs.writeFileSync(filePath, fileBuffer);

  console.time('anonymize');
  // anonymize file in place
  anonymize({ in: filePath, out: filePath}, (err, stdout, stderr) => {
    if (err) {
      fs.unlinkSync(filePath);
      return callback(err);
    }
    console.timeEnd('anonymize');

    const loadedFileBuffer = fs.readFileSync(filePath);


    // console.time('parse');
    // const dataset = dicomParser.parseDicom(loadedFileBuffer);
    // const studyInstanceUid = dataset.string('x0020000d');
    // console.timeEnd('parse');

    console.time('to-base-64');
    const base64String = loadedFileBuffer.toString('base64');
    console.timeEnd('to-base-64');

    console.log('handler-end', new Date().getTime());
    callback(null, base64String);

    fs.unlinkSync(filePath);
  });
};

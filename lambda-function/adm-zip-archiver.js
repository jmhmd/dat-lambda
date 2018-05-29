// const AWS = require('aws-sdk');
// const s3 = new AWS.S3();
const fs = require('fs-extra');
const { promisify } = require('util');
const writeFile = promisify(fs.writeFile);
const tempy = require('tempy');
const AdmZip = require('adm-zip');
const archiver = require('archiver');

const file = fs.readFileSync(__dirname + '/../test/_test-dicom.zip');
const zip = new AdmZip(file);
zip.extractAllTo(__dirname + '/../test/tmp');

// create a file to stream archive data to.
var output = fs.createWriteStream('../test/_output.zip');
var archive = archiver('zip', {
  zlib: { level: 1 } // Sets the compression level.
});

// listen for all archive data to be written
// 'close' event is fired only when a file descriptor is involved
output.on('close', function() {
  console.log(archive.pointer() + ' total bytes');
  console.log('archiver has been finalized and the output file descriptor has closed.');
  fs.removeSync('../test/tmp');
});

// This event is fired when the data source is drained no matter what was the data source.
// It is not part of this library but rather from the NodeJS Stream API.
// @see: https://nodejs.org/api/stream.html#stream_event_end
output.on('end', function() {
  console.log('Data has been drained');
});

// good practice to catch warnings (ie stat failures and other non-blocking errors)
archive.on('warning', function(err) {
  if (err.code === 'ENOENT') {
    // log warning
  } else {
    // throw error
    throw err;
  }
});

// good practice to catch this error explicitly
archive.on('error', function(err) {
  throw err;
});

// pipe archive data to the file
archive.pipe(output);

// append files from a sub-directory, putting its contents at the root of archive
archive.directory('../test/tmp', false);

archive.finalize();

// 6.9s, 54.9 MB

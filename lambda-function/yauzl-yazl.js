const fs = require('fs-extra');
const path = require('path');
const yauzl = require('yauzl');
const yazl = require('yazl');
const klaw = require('klaw-sync');

async function main() {
  await new Promise((resolve, reject) => {
    fs.ensureDirSync('../test/tmp/');
    yauzl.open(__dirname + '/../test/_test-dicom.zip', { lazyEntries: true }, function(
      err,
      zipfile
    ) {
      if (err) throw err;
      zipfile.readEntry();
      zipfile.on('entry', function(entry) {
        if (/\/$/.test(entry.fileName)) {
          // Directory file names end with '/'.
          // Note that entires for directories themselves are optional.
          // An entry's fileName implicitly requires its parent directories to exist.
          zipfile.readEntry();
        } else {
          // file entry
          zipfile.openReadStream(entry, function(err, readStream) {
            if (err) throw err;
            readStream.on('end', function() {
              zipfile.readEntry();
            });
            const outPath = path.resolve('../test/tmp/', entry.fileName);
            fs.ensureDirSync(path.dirname(outPath));
            readStream.pipe(fs.createWriteStream(outPath));
          });
        }
      });
      zipfile.on('end', resolve);
      zipfile.on('error', reject);
    });
  });

  var zipfile = new yazl.ZipFile();
  const paths = klaw('../test/tmp', { nodir: true }).map((p) => p.path);
  paths.forEach((p) => {
    zipfile.addFile(p, path.relative('../test/tmp', p));
  });

  // pipe() can be called any time after the constructor
  zipfile.outputStream
    .pipe(fs.createWriteStream(__dirname + '/../test/_output.zip'))
    .on('close', function() {
      console.log('done');
      fs.removeSync('../test/tmp');
    });

  // call end() after all the files have been added
  zipfile.end();
}

main();

// 9.2s, 53.7 MB

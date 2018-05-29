const AWS = require('aws-sdk');
const s3 = new AWS.S3();
const fs = require('fs-extra');
const path = require('path');
const fileType = require('file-type');
const readChunk = require('read-chunk');
const unzip = require('unzip-stream');
const archiver = require('archiver');
const tempy = require('tempy');
const anonymize = require('./lib/dat-node')({ jarPath: './lib/DicomAnonymizerTool/DAT.jar' })
  .anonymize;

function getDestKey(filePath) {
  const filename = path.basename(filePath);
  const destKey = path.join('anonymized', filename);
  return destKey;
}

async function generateZip(inPath, outPath) {
  return new Promise((resolve, reject) => {
    // create a file to stream archive data to.
    const output = fs.createWriteStream(outPath);
    const archive = archiver('zip');
    // listen for all archive data to be written
    // 'close' event is fired only when a file descriptor is involved
    output.on('close', resolve);
    // good practice to catch warnings (ie stat failures and other non-blocking errors)
    archive.on('warning', function(err) {
      if (err.code === 'ENOENT') {
        console.error(err);
      } else {
        // throw error
        return reject(err);
      }
    });
    // good practice to catch this error explicitly
    archive.on('error', reject);
    // pipe archive data to the file
    archive.pipe(output);
    // append files from a sub-directory, putting its contents at the root of archive
    archive.directory(inPath, false);
    archive.finalize();
  })
}

async function processZip(filePath) {
  const inDir = tempy.directory();
  const outDir = `${inDir}-anon`;

  // unzip archive
  await new Promise((resolve, reject) => {
    fs
      .createReadStream(filePath)
      .pipe(unzip.Extract({ path: inDir }))
      .on('close', resolve)
      .on('error', reject);
  });
  console.log(`Zip file extracted to ${inDir}.`);

  // delete __MACOSX folder if present
  if (await fs.exists(path.join(inDir, '__MACOSX'))) {
    console.log('Deleting "__MACOSX" directory.');
    await fs.remove(path.join(inDir, '__MACOSX'));
  }

  return new Promise((resolve, reject) => {
    // anonymize directory
    anonymize({ in: inDir, out: outDir }, async (anonErr, stdout, stderr) => {
      if (anonErr) {
        await fs.remove(inDir);
        await fs.remove(outDir);
        return reject(anonErr);
      }

      // zip anonymized dir
      console.log('Zipping anonymized files.');
      const anonZipPath = tempy.file({ extension: 'zip' });
      try {
        await generateZip(outDir, anonZipPath);
        return resolve(anonZipPath);
      } catch (zipErr) {
        await fs.remove(anonZipPath);
        return reject(zipErr);
      } finally {
        try {
          console.log('Cleaning up temporary files/directories.');
          await fs.remove(inDir);
          await fs.remove(outDir);
        } catch (err) {
          console.error(err);
          throw new Error('Error cleaning temp directories.');
        }
      }
    });
  });
}

async function processSingleFile(filePath) {
  const outPath = `${filePath}-anon`;
  return new Promise((resolve, reject) => {
    // anonymize file
    console.log(`Anonymizing ${filePath} to ${outPath}`);
    anonymize({ in: filePath, out: outPath }, (anonErr, stdout, stderr) => {
      console.log(stdout, stderr);
      if (anonErr) {
        return reject(anonErr);
      }
      return resolve(outPath);
    });
  });
}

async function processFile(filePath) {
  const chunkBuffer = readChunk.sync(filePath, 0, 4100);
  const type = fileType(chunkBuffer);

  let processedFilePath;
  if (type && type.ext === 'zip') {
    try {
      console.log('Processing zip file.');
      processedFilePath = await processZip(filePath);
    } catch (err) {
      console.error(err);
      throw new Error('Error processing zip file.');
    }
  } else {
    console.log('Not a zip file.');
    try {
      processedFilePath = await processSingleFile(filePath);
    } catch (err) {
      console.error(err);
      throw new Error('Error processing file.');
    }
  }
  return processedFilePath;
}

exports.handler = async (event) => {
  const test = event.test;
  const srcBucket = event.Records[0].s3.bucket.name;
  // Object key may have spaces or unicode non-ASCII characters.
  const srcKey = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, ' '));

  try {
    const destKey = getDestKey(srcKey);
    let processedFilePath;

    console.log(`Processing file with key ${srcKey} from bucket ${srcBucket}.`);

    let tmpFilePath;
    try {
      const file = await s3
        .getObject({
          Bucket: srcBucket,
          Key: srcKey,
        })
        .promise();
      tmpFilePath = tempy.file();
      await fs.writeFile(tmpFilePath, file.Body);
    } catch (err) {
      console.error(err);
      throw new Error('Error getting object from S3.');
    }

    console.log(`Saved temporary file "${tmpFilePath}".`);

    try {
      processedFilePath = await processFile(tmpFilePath);
      await s3
        .putObject({
          Bucket: srcBucket,
          Key: destKey,
          Body: fs.createReadStream(processedFilePath),
        })
        .promise();
      return 'Success.';
    } catch (err) {
      console.error('Error processing file:', err);
    } finally {
      await fs.remove(tmpFilePath);
      await fs.remove(processedFilePath);
    }
  } finally {
    // if not testing, delete the source (non-anonymized) file
    if (!test) {
      await s3.deleteObject({
        Bucket: srcBucket,
        Key: srcKey,
      });
    }
  }
};

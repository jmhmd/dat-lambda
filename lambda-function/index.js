const AWS = require('aws-sdk');
const s3 = new AWS.S3();
const fs = require('fs-extra');
const path = require('path');
const stream = require('stream');
const StreamFileType = require('stream-file-type');
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
  });
}

async function processZip(fileStream) {
  const inDir = tempy.directory();
  const outDir = `${inDir}-anon`;

  // unzip archive
  await new Promise((resolve, reject) => {
    fileStream
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

async function processSingleFile(fileStream) {
  const inPath = tempy.file();
  const outPath = `${inPath}-anon`;

  // write file to tmp
  await new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(inPath);
    fileStream
      .pipe(writeStream)
      .on('close', resolve)
      .on('error', reject);
  });

  // anonymize file
  console.log(`Anonymizing ${inPath} to ${outPath}`);
  try {
    const outFile = await new Promise((resolve, reject) => {
      anonymize({ in: inPath, out: outPath }, (anonErr, stdout, stderr) => {
        console.log(stdout, stderr);
        if (anonErr) {
          return reject(anonErr);
        }
        return resolve(outPath);
      });
    });
    return outFile;
  } catch (err) {
    throw err;
  } finally {
    fs.remove(inPath);
  }
}

async function processFile(fileStream) {
  let type;
  let passthrough = stream.PassThrough();

  try {
    const mimeDetector = new StreamFileType();
    const typePromise = mimeDetector.fileTypePromise();
    fileStream.pipe(mimeDetector).pipe(passthrough);
    type = await typePromise;
  } catch (err) {
    console.log('Mime err:', err);
    throw err;
  }

  let processedFilePath;
  if (type && type.ext === 'zip') {
    try {
      console.log('Processing zip file.');
      processedFilePath = await processZip(passthrough);
    } catch (err) {
      console.error(err);
      throw new Error('Error processing zip file.');
    }
  } else {
    console.log('Not a zip file.');
    try {
      processedFilePath = await processSingleFile(passthrough);
    } catch (err) {
      console.error(err);
      throw new Error('Error processing file.');
    }
  }
  return processedFilePath;
}

exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event, null, 2));
  let test = event.test;
  let srcBucket;
  let srcKey;
  if (event.queryStringParameters && event.queryStringParameters.srcBucket) {
    srcBucket = event.queryStringParameters.srcBucket;
    srcKey = event.queryStringParameters.srcKey;
    test = true;
  } else {
    srcBucket = event.Records[0].s3.bucket.name;
    // Object key may have spaces or unicode non-ASCII characters.
    srcKey = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, ' '));
  }

  try {
    const destKey = getDestKey(srcKey);
    let processedFilePath;

    console.log(`Processing file with key ${srcKey} from bucket ${srcBucket}.`);

    let fileStream;
    try {
      fileStream = s3
        .getObject({
          Bucket: srcBucket,
          Key: srcKey,
        })
        .createReadStream();
    } catch (err) {
      console.error(err);
      throw new Error('Error getting object from S3.');
    }

    try {
      processedFilePath = await processFile(fileStream);
      await s3
        .putObject({
          Bucket: srcBucket,
          Key: destKey,
          Body: fs.createReadStream(processedFilePath),
        })
        .promise();
      console.log('Success.');
      return {
        isBase64Encoded: false,
        statusCode: 200,
        headers: {},
        body: 'Success.',
      };
    } catch (err) {
      console.error('Error processing file:', err);
      return new Error('Error.');
    } finally {
      await fs.remove(processedFilePath);
    }
  } finally {
    // if not testing, delete the source (non-anonymized) file
    console.log('Testing?', test);
    if (!test) {
      await s3
        .deleteObject({
          Bucket: srcBucket,
          Key: srcKey,
        })
        .promise();
      console.log('Deleted source file.');
    }
  }
};

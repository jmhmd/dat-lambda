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
const outzip = new AdmZip();
outzip.addLocalFolder(__dirname + '/../test/tmp');
const entries = outzip.getEntries();
entries.forEach(entry => entry.header.method = 8);
outzip.writeZip(__dirname + '/../test/_output.zip');
fs.removeSync(__dirname + '/../test/tmp');

// 1m 4s, 53.5 MB

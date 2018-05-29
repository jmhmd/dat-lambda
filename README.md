# DicomAnonymizerTool - Lambda

Run the RSNA [DicomAnonymizerTool](https://github.com/johnperry/DicomAnonymizerTool) in an AWS Lambda function

## Usage
1. Send a `GET` request to an API-Gateway endpoint returning pre-signed S3 upload url.
2. Send a `POST` request to the pre-signed url containing a multipart/form-data encoded DICOM Part 10 file or zip archive, anonymize via Lambda, poll result bucket to get the anonymized DICOM file.

## Try it out
[https://jmhmd.github.io/dat-lambda/](https://jmhmd.github.io/dat-lambda/)

## Setup
// todo

## Helpful

- Subtree push /client to gh-pages for deployment: `git subtree push --prefix client origin gh-pages`

- Test display a DICOM file in the browser: [https://rawgit.com/chafey/cornerstoneWADOImageLoader/master/examples/dicomfile/index.html](https://rawgit.com/chafey/cornerstoneWADOImageLoader/master/examples/dicomfile/index.html)

# DicomAnonymizerTool - Lambda

Run the RSNA [DicomAnonymizerTool](https://github.com/johnperry/DicomAnonymizerTool) in an AWS Lambda function

## Usage
Send a `POST` request containing a multipart/form-data encoded DICOM Part 10 file to the Lambda function API endpoint, get the anonymized DICOM file in return.

### Try it out
[https://jmhmd.github.io/dat-lambda/]()

## Setup
// todo

## Helpful links

- Walkthrough for uploading binary data: [https://www.youtube.com/watch?v=BrYJlR0yRnw]()

- Some content type hints: [https://stackoverflow.com/a/41568664/910324]()

- Multipart parser: [https://github.com/freesoftwarefactory/parse-multipart]()

- Slightly helpful: [https://aws.amazon.com/blogs/compute/binary-support-for-api-integrations-with-amazon-api-gateway/]()

- Test display a DICOM file in the browser: [https://rawgit.com/chafey/cornerstoneWADOImageLoader/master/examples/dicomfile/index.html]()

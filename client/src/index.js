/* global cornerstone, cornerstoneWADOImageLoader, doT, dicomParser, saveAs */
/* exported uploadAsFormData, fileChange */

/**
 * Configure cornerstone image decoding codecs and web workers so we can show nice previews
 */
const config = {
  webWorkerPath: './lib/cornerstone/cornerstoneWADOImageLoaderWebWorker.min.js',
  taskConfiguration: {
    decodeTask: {
      codecsPath: './cornerstoneWADOImageLoaderCodecs.min.js',
    },
  },
};
cornerstoneWADOImageLoader.webWorkerManager.initialize(config);

/**
 * Define endpoint url for getting a pre-signed S3 upload form data and the bucket with result data.
 */
const s3SignerUrl = 'https://y7joeqvq80.execute-api.us-east-2.amazonaws.com/test/s3-upload-signer';
const s3ResultDir = 'https://s3.us-east-2.amazonaws.com/dicom-anonymizer/anonymized/';

/**
 * Get DOM handles
 */
const resultElement = document.getElementById('output-file-data');
const anonymizeButton = document.getElementById('anonymize-button');
const phiAttestation = document.getElementById('no-phi');
const progress = document.getElementById('progress');

/**
 * UUID v4 generator
 * https://gist.github.com/jed/982883
 *
 */
function uuid(a) {
  return a
    ? (a ^ ((Math.random() * 16) >> (a / 4))).toString(16)
    : ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, uuid);
}

// Reference to uploaded file, defining this here makes the filename available in our response
// handler
let fileToUpload;

async function handleFileResponse(response) {
  // Load the whole response into an arrayBuffer instead of dealing with streamed chunks
  response
    .arrayBuffer()
    .then(async (fileArrayBuffer) => {
      let previewFiles;
      let previewUint8Array;
      let info;
      let size = fileArrayBuffer.byteLength;

      // Parse the returned file with cornerstone
      const outputFileUint8Array = new Uint8Array(fileArrayBuffer);
      const outputFileType = fileType(outputFileUint8Array);

      // generate preview for zip or single files
      if (outputFileType && outputFileType.ext === 'zip') {
        previewFiles = await unzipFiles(fileArrayBuffer);
        // info = `Zip file (${size / 1000 / 1000} MB)`;
        const { fileUint8Array } = await readFile(previewFiles[0]);
        previewUint8Array = fileUint8Array;
      } else {
        previewFiles = [new File([fileArrayBuffer], { type: 'application/dicom' })];
        previewUint8Array = outputFileUint8Array;
      }

      // Generate our table of file info
      const dataset = dicomParser.parseDicom(previewUint8Array);
      const dicomTemplate = doT.template(document.getElementById('dicom-headers').innerHTML);
      info = dicomTemplate(dataset);
      // set DICOM header table
      const downloadLink = `<a href="#" id="download-output-file" class="button -blue center">Download anonymized file</a>`;
      resultElement.innerHTML = info + downloadLink;

      // load image preview
      loadStack(previewFiles, 'output-preview');

      // reset anonymize button
      anonymizeButton.innerHTML = 'Anonymize';
      anonymizeButton.disabled = false;

      // Set up file download link
      document.getElementById('download-output-file').addEventListener('click', (ev) => {
        ev.preventDefault();
        const blob = new Blob([fileArrayBuffer], { type: outputFileType.mime });
        saveAs(blob, `anonymized-${fileToUpload.name}`);
      });
    })
    .catch((error) => {
      resultElement.innerHTML = error;
    });
}

/**
 * Poll for completed file
 */
function checkForFile(fileKey) {
  function check() {
    fetch(s3ResultDir + fileKey, { method: 'HEAD' })
      .then((res) => {
        if (!res.ok) throw new Error(res.statusText);

        // res.ok, file exists, and processing is done. Stop polling.
        progress.querySelector('.progress-bar span').innerHTML =
          'Processing complete, downloading anonymized file...';
        resultElement.innerHTML = 'Downloading...';
        clearInterval(poll);

        // download the file
        fetch(s3ResultDir + fileKey, { method: 'GET' })
          .then((res) => {
            progress.querySelector('.progress-bar span').innerHTML = 'Processing complete.';
            handleFileResponse(res);
          })
          .catch((err) => {
            console.error(err);
            resultElement.innerHTML = 'Error downloading: ' + err;
          });
      })
      .catch((err) => {
        console.log('still processing');
      });
  }
  const poll = setInterval(check, 1000);
}

/**
 * Trigger upload of multipart/form-data asynchronously using the native fetch API for
 * asynchronous HTTP requests
 *
 * @param {Object} event
 */
async function uploadAsFormData(event) {
  event.preventDefault();

  if (!fileToUpload) {
    return false;
  }
  if (!phiAttestation.checked) {
    window.alert('Must confirm uploaded file contains no PHI');
    return false;
  }

  const fileKey = uuid();
  let s3UploadHeaders = await fetch(s3SignerUrl, { method: 'GET' })
    .then((response) => response.json())
    .then((data) => JSON.parse(data.body));
  const formData = new FormData();
  const uploadUrl = s3UploadHeaders.url;

  formData.append('key', 'uploads/' + fileKey);

  Object.keys(s3UploadHeaders.fields).forEach((field) => {
    formData.append(field, s3UploadHeaders.fields[field]);
  });

  formData.append('file', fileToUpload);

  resultElement.innerHTML = 'File uploading to S3...';
  anonymizeButton.innerHTML = 'Loading...';
  anonymizeButton.disabled = true;

  // Post the file to S3
  function progressHandler(e) {
    console.log('progress', e);
    const percentDone = Math.floor(e.loaded / e.total * 100);
    progress.querySelector('.progress-bar').style.cssText = `width: ${percentDone}%`;
    progress.querySelector('.progress-bar span').innerHTML =
      'Uploading to S3: ' + percentDone + '%';
  }
  function completeHandler(e) {
    console.log('complete', e);
    progress.querySelector('.progress-bar').style.cssText = 'width: 100%';
    progress.querySelector('.progress-bar span').innerHTML = 'Processing file in Lambda function...';
    resultElement.innerHTML = 'Processing file...';
    checkForFile(fileKey);
  }
  function errorHandler(e) {
    console.log('error', e);
  }
  function abortHandler(e) {
    console.log('abort', e);
  }
  const xhr = new XMLHttpRequest();
  xhr.upload.addEventListener('progress', progressHandler, false);
  xhr.addEventListener('load', completeHandler, false);
  xhr.addEventListener('error', errorHandler, false);
  xhr.addEventListener('abort', abortHandler, false);
  xhr.open('POST', uploadUrl);
  xhr.send(formData);

  // show progress bar
  progress.querySelector('.progress-bar').style.cssText = `width: ${0}%`;
  progress.querySelector('.progress-bar span').innerHTML = 'Uploading to S3: 0%';
  progress.style.cssText = 'display: block';
}

/**
 * Reset interface
 */
function resetAll() {
  myDropzone.previewsContainer.style.display = 'block';
  document.getElementById('previews').style.display = 'none';
  document.getElementById('reset-button').style.display = 'none';
  myDropzone.removeAllFiles();
  resultElement.innerHTML = '';
  document.getElementById('input-file-data').innerHTML = '';
  cornerstone.disable(document.getElementById('input-preview'));
  cornerstone.disable(document.getElementById('output-preview'));
  progress.style.cssText = 'display: none';
  cornerstoneWADOImageLoader.wadouri.fileManager.purge();
  cornerstoneWADOImageLoader.wadouri.dataSetCacheManager.purge();
  phiAttestation.checked = false;
  togglePHICheck(false);
}

async function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const inputFileArrayBuffer = e.target.result;

      // Parse the file in a try/catch block, in case this isn't a parseable DICOM file
      try {
        const fileUint8Array = new Uint8Array(inputFileArrayBuffer);
        return resolve({
          fileUint8Array,
          fileArrayBuffer: inputFileArrayBuffer,
          size: inputFileArrayBuffer.byteLength,
        });
      } catch (err) {
        reject(err);
      }
    };
    // Read the input file into an array buffer
    reader.readAsArrayBuffer(file);
  });
}

function loadStack(files, elementId) {
  const element = document.getElementById(elementId);
  // construct image stack
  const imageIds = files.map(cornerstoneWADOImageLoader.wadouri.fileManager.add);
  const stack = {
    currentImageIdIndex: 0,
    imageIds,
  };
  // enable preview element if not already
  try {
    cornerstone.getEnabledElement(element);
  } catch (e) {
    cornerstone.enable(element);
  }
  // enable basic tools
  cornerstoneTools.mouseInput.enable(element);
  cornerstoneTools.mouseWheelInput.enable(element);
  // load first image
  cornerstone.loadImage(imageIds[0]).then(function(image) {
    // Display the image
    cornerstone.displayImage(element, image);
    // Set the stack as tool state
    cornerstoneTools.addStackStateManager(element, ['stack']);
    cornerstoneTools.addToolState(element, 'stack', stack);
    // Enable all tools we want to use with this element
    cornerstoneTools.stackScroll.activate(element, 1);
    cornerstoneTools.stackScrollWheel.activate(element);
    cornerstoneTools.scrollIndicator.enable(element);
  });
}

/**
 * When a file is selected in the form, trigger parsing and display of preview info
 *
 */
async function fileChange(inputFiles) {
  let inputFileType;
  let previewInfo;
  let previewFiles;
  let previewUint8Array;

  try {
    // create zip of input files if necessary
    if (inputFiles.length > 1) {
      fileToUpload = await zipFiles(inputFiles);
    } else {
      fileToUpload = inputFiles[0];
    }

    // check input file type
    const { fileUint8Array, fileArrayBuffer, size } = await readFile(inputFiles[0]);
    inputFileType = fileType(fileUint8Array);

    // generate preview for zip or single files
    if (inputFileType && inputFileType.ext === 'zip') {
      previewFiles = await unzipFiles(fileArrayBuffer);
      // info = `Zip file (${size / 1000 / 1000} MB)`;
      const { fileUint8Array } = await readFile(previewFiles[0]);
      previewUint8Array = fileUint8Array;
    } else {
      previewFiles = inputFiles;
      previewUint8Array = fileUint8Array;
    }

    const dataset = dicomParser.parseDicom(previewUint8Array);
    // Generate our table of file info
    const dicomTemplate = doT.template(document.getElementById('dicom-headers').innerHTML);

    // show elements
    document.getElementById('reset-button').style.display = 'block';
    document.getElementById('previews').style.display = 'block';

    info = dicomTemplate(dataset);
    // load image preview
    loadStack(previewFiles, 'input-preview');
  } catch (err) {
    console.error(err);
    info = err;
  }

  document.getElementById('input-file-data').innerHTML = info;
}

// Handle background color hint for PHI attestation
function togglePHICheck(checked) {
  const element = document.getElementById('phi-checkbox');
  if (checked) {
    element.className = 'ok';
  } else {
    element.className = '';
  }
}
document.getElementById('no-phi').addEventListener('change', (e) => {
  const element = document.getElementById('phi-checkbox');
  togglePHICheck(e.target.checked);
});

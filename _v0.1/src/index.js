/* global cornerstone, cornerstoneWADOImageLoader, doT, dicomParser, saveAs */
/* exported uploadAsFormData, fileChange */

// Get the endpoint for our upload request (AWS API Gateway endpoint)
const uploadAction = document.getElementById('file-upload-form').getAttribute('action');

// Reference to uploaded file, defining this here makes the filename available in our response
// handler
let fileToUpload;

// configure cornerstone image decoding codecs and web workers so we can show nice previews
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
 * Take a File object and display it in the element with the given id, using cornerstone
 *
 * @param {string} elemId Id of the element to enable for cornerstone. No '#'
 * @param {Object} fileToDisplay File object containing the DICOM image to display
 */
function loadAndViewImage(elemId, fileToDisplay) {
  const imageId = cornerstoneWADOImageLoader.wadouri.fileManager.add(fileToDisplay);
  const element = document.getElementById(elemId);
  try {
    cornerstone.getEnabledElement(element);
  } catch (e) {
    cornerstone.enable(element);
  }
  cornerstone.loadImage(imageId).then(image => {
    console.log(image);
    const viewport = cornerstone.getDefaultViewportForImage(element, image);
    cornerstone.displayImage(element, image, viewport);
  });
}

/**
 * Trigger upload of multipart/form-data asynchronously using the native fetch API for
 * asynchronous HTTP requests
 *
 * @param {Object} event
 */
function uploadAsFormData(event) {
  event.preventDefault();
  const formData = new FormData();
  const resultElement = document.getElementById('output-file-data');
  const anonymizeButton = document.getElementById('anonymize-button');
  const phiAttestation = document.getElementById('no-phi').checked;

  if (!fileToUpload) {
    return false;
  }
  if (!phiAttestation) {
    window.alert('Must confirm uploaded file contains no PHI');
    return false;
  }

  formData.append('file', fileToUpload);

  resultElement.innerHTML = 'Request sent, loading...';
  anonymizeButton.innerHTML = 'Loading...';
  anonymizeButton.disabled = true;

  // Post the file to our Lambda function via the API Gateway endpoint
  fetch(uploadAction, {
    method: 'POST',
    body: formData,
  })
    .then(response => {

      // Load the whole response into an arrayBuffer instead of dealing with streamed chunks
      response
        .arrayBuffer()
        .then(fileBuffer => {

          // Parse the returned file with cornerstone
          const fileUint8Array = new Uint8Array(fileBuffer);
          const dataset = dicomParser.parseDicom(fileUint8Array);

          // Generate our table of file info
          const dicomTemplate = doT.template(document.getElementById('dicom-headers').innerHTML);
          const info = dicomTemplate(dataset);
          const downloadLink = `<a href="#" id="download-output-file">Download anonymized file</a`;
          resultElement.innerHTML = info + downloadLink;

          anonymizeButton.innerHTML = 'Anonymize';
          anonymizeButton.disabled = false;

          // Set up file download link
          document.getElementById('download-output-file').addEventListener('click', ev => {
            ev.preventDefault();
            const blob = new Blob([fileBuffer], { type: 'octet/stream' });
            saveAs(blob, `anonymized-${fileToUpload.name}`);
          });

          // Load image preview
          loadAndViewImage('output-preview', new File([fileBuffer], { type: 'octet/stream' }));
        })
        .catch(error => {
          resultElement.innerHTML = error;
        });
    })
    .catch(error => {
      resultElement.innerHTML = error;
    });
}

/**
 * When a file is selected in the form, trigger parsing and display of preview info
 *
 */
function fileChange() {
  fileToUpload = document.getElementById('file').files[0];
  const reader = new FileReader();
  const resultElement = document.getElementById('input-file-data');
  const outResultElement = document.getElementById('output-file-data');
  const outPreview = document.getElementById('output-preview');

  // Upon finishing the file, display info and preview
  reader.onload = e => {
    const inputFileArrayBuffer = e.target.result;

    // Parse the file in a try/catch block, in case this isn't a parseable DICOM file
    try {
      const fileUint8Array = new Uint8Array(inputFileArrayBuffer);
      const dataset = dicomParser.parseDicom(fileUint8Array);
      const dicomTemplate = doT.template(document.getElementById('dicom-headers').innerHTML);
      resultElement.innerHTML = dicomTemplate(dataset);

      // clear output info if we've done this before
      outResultElement.innerHTML = '';
      cornerstone.disable(outPreview);

      // load image preview
      loadAndViewImage('input-preview', fileToUpload);
    } catch (e) {
      resultElement.innerHTML = e;
    }
  };

  // Read the input file into an array buffer
  reader.readAsArrayBuffer(fileToUpload);
}

// Handle background color hint for PHI attestation
document.getElementById('no-phi').addEventListener('change', (e) => {
  const element = document.getElementById('phi-checkbox');
  if (e.target.checked) {
    element.className = 'ok';
  } else {
    element.className = '';
  }
})

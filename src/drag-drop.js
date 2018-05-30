const myDropzone = new Dropzone("div#file-drop", {
  autoQueue: false,
  url: '/',
  // acceptedFiles: 'application/zip,application/dicom,application/dcm,.zip,.dcm',
  previewTemplate: '<div style="display:none"></div>', // disable file previews
  init() {
    const sorter = natsort();

    // debounce the image load function so we only load once after all dropped images added
    const loadPreview = debounce(() => {
      // alphanum sort files on full path, this will get us basically a sequential file list,
      // depending on the naming scheme of the source
      const files = this.files.concat(); // make copy to sort
      fileChange(files.sort((a, b) => {
        return sorter(a.fullPath, b.fullPath);
      }));
    }, 100);

    // hide dropzone and load dropped files into preview
    this.on('addedfile', (file) => {
      file.previewElement = null;
      this.previewsContainer.style.display = 'none';
      document.getElementById('processing-message').style.display = 'block';
      loadPreview();
    })
  }
});

function loadTestFile(e) {
  e.preventDefault();
  e.stopPropagation();
  myDropzone.removeAllFiles();
  const url = e.target.href;
  fetch(url, { method: 'GET' })
  .then((response) => {
    response.blob().then(file => myDropzone.addFile(file));
    phiAttestation.checked = true;
    togglePHICheck(true);
  })
  .catch(console.error);
}
// const loadFileEls = document.querySelectorAll('.loadFile');
// loadFileEls.forEach(el => el.addEventListener('click', loadTestFile));

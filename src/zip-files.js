async function zipFiles(files) {
  return new Promise((resolve, reject) => {
    const zip = new JSZip();
    files.forEach((file) => {
      zip.file(file.fullPath, file);
    });
    zip
      .generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: {
          level: 2,
        },
      })
      .then(function(zipBlob) {
        // saveAs(zipBlob, "example.zip");
        const zipFile = new File([zipBlob], 'dicom-upload.zip', { type: zipBlob.type });
        return resolve(zipFile);
      })
      .catch(reject);
  });
}

async function unzipFiles(zipArrayBuffer) {
  return new Promise((resolve, reject) => {
    JSZip.loadAsync(zipArrayBuffer)
      .then((zip) => {
        let zipFiles = Object.keys(zip.files).map((filePath) => zip.files[filePath]);
        zipFiles = zipFiles.filter((f) => !f.dir); // remove directories
        // convert to File objects
        Promise.all(
          zipFiles.map((zf) => {
            return new Promise((resolve, reject) => {
              const filename = zf.name.replace(/^.*[\\\/]/, '');
              zf.async('arraybuffer').then((ab) => {
                return resolve(new File([ab], filename, { fullPath: zf.name }));
              });
            });
          })
        )
          .then(resolve)
          .catch(reject);
      })
      .catch(reject);
  });
}

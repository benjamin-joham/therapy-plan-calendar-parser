Bundled tesseract.js 5.1.1 (Apache-2.0) and tesseract.js-core 5.1.1 (Apache-2.0).
worker.min.js is patched in one place: initialize() maps language objects to their `code` (upstream maps them to `data`), so the German model can be passed as bytes.
deu-traineddata.js holds @tesseract.js-data/deu 4.0.0_best_int (deu.traineddata.gz, Apache-2.0) as base64, because artifacts do not serve .gz files.

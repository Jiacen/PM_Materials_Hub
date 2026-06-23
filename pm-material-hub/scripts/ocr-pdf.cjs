const fs = require('fs');
const path = require('path');
const { createCanvas } = require('@napi-rs/canvas');
const { createWorker } = require('tesseract.js');

async function extractScannedPdfText(filePath) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const document = await pdfjs.getDocument({
    data: new Uint8Array(fs.readFileSync(filePath)),
    disableWorker: true,
  }).promise;
  const cachePath = path.resolve(__dirname, '..', 'resources', 'ocr');
  const worker = await createWorker('eng', undefined, {
    cachePath,
    cacheMethod: 'readOnly',
  });
  const pages = [];

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await page.render({
        canvasContext: canvas.getContext('2d'),
        viewport,
      }).promise;
      const result = await worker.recognize(canvas.toBuffer('image/png'));
      pages.push(`--- Page ${pageNumber} ---\n${result.data.text || ''}`);
      page.cleanup();
    }
  } finally {
    await worker.terminate();
    await document.destroy();
  }

  return pages.join('\n\n');
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    throw new Error('PDF path is required');
  }
  process.stdout.write(await extractScannedPdfText(filePath));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

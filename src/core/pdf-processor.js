import { logger } from '../logger.js';

/**
 * Handles PDF rendering to images using pdf.js
 */
export class PDFProcessor {
    constructor() {
        // pdfjsLib is expected to be loaded via @require in the userscript
        if (typeof pdfjsLib === 'undefined') {
            logger.error('PDFProcessor: pdfjsLib is not loaded. Ensure @require matches.');
        } else {
            // Set worker path
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }
    }

    /**
     * Converts a PDF Blob into an array of JPEG Data URLs
     * @param {Blob} blob 
     * @returns {Promise<string[]>}
     */
    async pdfToImages(blob) {
        try {
            const arrayBuffer = await blob.arrayBuffer();
            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
            const pdf = await loadingTask.promise;
            const images = [];

            logger.info(`PDFProcessor: Starting conversion of ${pdf.numPages} pages.`);

            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const viewport = page.getViewport({ scale: 2.0 }); // High quality

                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;

                await page.render({
                    canvasContext: context,
                    viewport: viewport
                }).promise;

                // Convert to JPEG for better compression
                const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                images.push(dataUrl);
                
                logger.debug(`PDFProcessor: Rendered page ${i}/${pdf.numPages}`);
            }

            logger.info('PDFProcessor: Conversion complete.');
            return images;
        } catch (error) {
            logger.error('PDFProcessor: Error converting PDF:', error);
            throw error;
        }
    }
}

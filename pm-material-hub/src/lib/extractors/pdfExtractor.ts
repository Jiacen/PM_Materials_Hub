import fs from 'fs';
import pdfParse from 'pdf-parse';

/**
 * Extracts pure text from a PDF file.
 * Following the final implementation plan, we intentionally ignore images
 * to focus on technical parameters and text content.
 */
export async function extractPDFText(filePath: string): Promise<string> {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    
    // pdf-parse returns text content in data.text
    // We clean it up by removing excessive whitespace
    const cleanText = data.text
      .replace(/\n\s*\n/g, '\n\n')
      .trim();
      
    return cleanText;
  } catch (error) {
    console.error(`Error extracting PDF from ${filePath}:`, error);
    throw new Error(`PDF Extraction failed: ${error}`);
  }
}

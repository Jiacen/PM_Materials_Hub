import fs from 'fs';
import mammoth from 'mammoth';

/**
 * Extracts plain text from a DOCX file.
 * We use mammoth to convert the DOCX into raw text.
 */
export async function extractDOCXText(filePath: string): Promise<string> {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    
    // Extract raw text. (Mammoth also supports HTML extraction if we need headings later)
    const result = await mammoth.extractRawText({ buffer: dataBuffer });
    
    const cleanText = result.value
      .replace(/\n\s*\n/g, '\n\n')
      .trim();
      
    return cleanText;
  } catch (error) {
    console.error(`Error extracting DOCX from ${filePath}:`, error);
    throw new Error(`DOCX Extraction failed: ${error}`);
  }
}

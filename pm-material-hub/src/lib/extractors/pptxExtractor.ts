import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { parseStringPromise } from 'xml2js';

export interface PPTXSlide {
  slideNumber: number;
  text: string;
  images: string[]; // Paths to cached images
}

/**
 * Extracts text and embedded images from a PPTX file.
 */
export async function extractPPTX(filePath: string, cacheDir: string): Promise<PPTXSlide[]> {
  const slides: PPTXSlide[] = [];
  
  try {
    const zip = new AdmZip(filePath);
    const zipEntries = zip.getEntries();
    
    // Create cache dir for this file's images if it doesn't exist
    const baseFileName = path.basename(filePath, '.pptx');
    const fileCacheDir = path.join(cacheDir, baseFileName);
    if (!fs.existsSync(fileCacheDir)) {
      fs.mkdirSync(fileCacheDir, { recursive: true });
    }

    // 1. Extract Images
    const mediaEntries = zipEntries.filter(entry => entry.entryName.startsWith('ppt/media/') && !entry.isDirectory);
    const savedImages: Record<string, string> = {}; // map zip path to local cached path
    
    for (const entry of mediaEntries) {
      const imgName = path.basename(entry.entryName);
      const outPath = path.join(fileCacheDir, imgName);
      fs.writeFileSync(outPath, entry.getData());
      savedImages[entry.entryName] = outPath;
    }

    // 2. Extract Text from Slides
    const slideEntries = zipEntries.filter(entry => entry.entryName.match(/^ppt\/slides\/slide\d+\.xml$/));
    
    // Sort slides by number (slide1.xml, slide2.xml...)
    slideEntries.sort((a, b) => {
      const aNum = parseInt(a.entryName.match(/\d+/)?.[0] || '0');
      const bNum = parseInt(b.entryName.match(/\d+/)?.[0] || '0');
      return aNum - bNum;
    });

    for (const entry of slideEntries) {
      const slideNum = parseInt(entry.entryName.match(/\d+/)?.[0] || '0');
      const xmlData = entry.getData().toString('utf8');
      
      // Parse XML to JS object
      const result = await parseStringPromise(xmlData);
      
      // Extract text: <a:t> elements contain the text in PPTX
      let textContent = '';
      const extractText = (obj: any) => {
        if (!obj) return;
        if (typeof obj === 'string') return;
        
        // Find a:t nodes
        if (obj['a:t']) {
          const texts = Array.isArray(obj['a:t']) ? obj['a:t'] : [obj['a:t']];
          texts.forEach((t: any) => {
            if (typeof t === 'string') textContent += t + ' ';
            else if (t._) textContent += t._ + ' ';
          });
        }
        
        // Traverse deeper
        for (const key in obj) {
          if (typeof obj[key] === 'object') {
            extractText(obj[key]);
          }
        }
      };
      
      extractText(result);
      
      // Note: Mapping images exactly to slides requires parsing ppt/slides/_rels/slide*.xml.rels
      // For MVP, we will just return the text, and later map images properly.
      
      slides.push({
        slideNumber: slideNum,
        text: textContent.trim(),
        images: [] // To be populated by .rels parser
      });
    }

    return slides;
  } catch (error) {
    console.error(`Error extracting PPTX from ${filePath}:`, error);
    throw new Error(`PPTX Extraction failed: ${error}`);
  }
}

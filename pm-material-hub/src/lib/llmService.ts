import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

const SETTINGS_PATH = path.join(process.cwd(), 'config', 'settings.json');

function getLLMConfig() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
    }
  } catch (err) {
    console.error("Error reading settings.json:", err);
  }
  return { apiKey: '', llmBaseUrl: 'https://api.moonshot.cn/v1' };
}

export class LLMService {
  /**
   * Summarize or extract insights from raw text using a specific prompt.
   * Returns a parsed JSON object.
   */
  async extractInsights(systemPrompt: string, rawText: string): Promise<any> {
    const config = getLLMConfig();
    
    if (!config.apiKey || config.apiKey === '********') {
      throw new Error("LLM API Key is missing or invalid. Please configure it in the UI.");
    }

    const client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.llmBaseUrl || 'https://api.moonshot.cn/v1',
    });

    // Kimi moonshot-v1-128k handles up to 128k tokens (~100k Chinese characters, roughly 100-200 pages).
    // We increase the truncation limit so large manuals are fully read.
    const safeText = rawText.length > 100000 
      ? rawText.substring(0, 100000) + "\n...[CONTENT TRUNCATED FOR LENGTH]..." 
      : rawText;

    try {
      const response = await client.chat.completions.create({
        model: 'moonshot-v1-128k',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: safeText }
        ],
        temperature: 0.1,
        response_format: { type: "json_object" } // Enforce JSON
      });

      const content = response.choices[0]?.message?.content || '{}';
      
      try {
        return JSON.parse(content);
      } catch (parseError) {
        // Fallback regex extraction if the model wrapped it in markdown
        const match = content.match(/```(?:json)?\n([\s\S]*?)\n```/);
        if (match && match[1]) {
          return JSON.parse(match[1]);
        }
        console.error("Failed to parse LLM output as JSON:", content);
        throw new Error("LLM did not return valid JSON structure.");
      }
    } catch (error) {
      console.error("LLM API Error:", error);
      throw error;
    }
  }

  /**
   * Automatically handles massive texts using a sliding window chunking algorithm.
   * Maps each chunk to the LLM, then Reduces the responses by merging and deduplicating arrays.
   */
  async extractInsightsInChunks(systemPrompt: string, rawText: string): Promise<any> {
    const SAFE_LIMIT = 100000;
    const CHUNK_SIZE = 90000;
    const OVERLAP = 2000;
    
    if (rawText.length <= SAFE_LIMIT) {
      console.log(`Document is ${rawText.length} chars, processing in a single chunk.`);
      return this.extractInsights(systemPrompt, rawText);
    }
    
    console.log(`Document is ${rawText.length} chars, splitting into chunks (Map-Reduce)...`);
    const chunks = [];
    let start = 0;
    while (start < rawText.length) {
      const end = Math.min(start + CHUNK_SIZE, rawText.length);
      chunks.push(rawText.substring(start, end));
      if (end === rawText.length) break;
      start += (CHUNK_SIZE - OVERLAP);
    }
    
    console.log(`Total ${chunks.length} chunks generated. Processing sequentially to avoid rate limits...`);
    
    const results = [];
    for (let index = 0; index < chunks.length; index++) {
      const chunk = chunks[index];
      console.log(`Sending Chunk ${index + 1}/${chunks.length} to LLM...`);
      // Retry logic for individual chunks
      let chunkResult = null;
      const retryDelays = [5000, 15000, 30000]; // Exponential backoff: 5s, 15s, 30s
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          chunkResult = await this.extractInsights(systemPrompt, chunk);
          break; // Success, exit retry loop
        } catch (err: any) {
          const is429 = err?.status === 429 || err?.message?.includes('overloaded');
          if (attempt === 3) {
            console.error(`Chunk ${index + 1} failed after 3 attempts.`);
            chunkResult = { error: `Chunk ${index + 1} failed`, data: {} };
          } else {
            const waitTime = is429 ? retryDelays[attempt - 1] : 3000;
            console.log(`Chunk ${index + 1} failed (${is429 ? '429 rate limit' : 'other error'}), waiting ${waitTime/1000}s before retry ${attempt + 1}...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
        }
      }
      results.push(chunkResult);
      // Wait a bit between chunks to respect API rate limits
      if (index < chunks.length - 1) {
        console.log(`Cooling down 3s before next chunk...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    
    // Reduce: merge arrays and deduplicate by mlfb
    let mergedProducts: any[] = [];
    for (const res of results) {
       if (res && res.products && Array.isArray(res.products)) {
          mergedProducts = mergedProducts.concat(res.products);
       } else if (res && !res.error && !Array.isArray(res)) {
          // Fallback if the LLM didn't wrap in "products"
          const possibleArray = Object.values(res).find(v => Array.isArray(v));
          if (possibleArray && Array.isArray(possibleArray)) {
             mergedProducts = mergedProducts.concat(possibleArray);
          } else {
             mergedProducts.push(res);
          }
       }
    }
    
    // Deduplicate
    const uniqueProductsMap = new Map();
    for (const p of mergedProducts) {
      // Prioritize mlfb, then product_name, then a string hash
      const key = p.mlfb ? String(p.mlfb).trim() : (p.product_name ? String(p.product_name).trim() : JSON.stringify(p));
      if (!uniqueProductsMap.has(key)) {
        uniqueProductsMap.set(key, p);
      }
    }
    
    return {
      products: Array.from(uniqueProductsMap.values())
    };
  }
}

export const llmService = new LLMService();

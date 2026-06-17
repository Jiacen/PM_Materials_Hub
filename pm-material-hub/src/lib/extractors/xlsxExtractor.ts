import * as xlsx from 'xlsx';

export interface ExcelSheetData {
  sheetName: string;
  data: string; // CSV or JSON string representation of the sheet
}

/**
 * Extracts data from an Excel file (.xlsx, .xls, .csv).
 * Converts each sheet to a CSV-like text format which is highly tokens-efficient for LLMs.
 */
export async function extractExcelData(filePath: string): Promise<ExcelSheetData[]> {
  try {
    const workbook = xlsx.readFile(filePath);
    const sheetsData: ExcelSheetData[] = [];

    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      
      // Convert sheet to CSV format (very efficient for LLMs to read tabular data)
      const csvData = xlsx.utils.sheet_to_csv(worksheet);
      
      // Only add non-empty sheets
      if (csvData && csvData.trim().length > 0) {
        sheetsData.push({
          sheetName,
          data: csvData.trim()
        });
      }
    }

    return sheetsData;
  } catch (error) {
    console.error(`Error extracting Excel from ${filePath}:`, error);
    throw new Error(`Excel Extraction failed: ${error}`);
  }
}

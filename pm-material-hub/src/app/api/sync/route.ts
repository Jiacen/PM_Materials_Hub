import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { initWorkspace, scanWorkspaceFiles, getWorkspacePath } from '@/lib/fileSystem';
import { countLocalIndexes } from '@/lib/localIndexer';

export async function GET() {
  try {
    // 1. Check workspace and auto-initialize the 10 folders if missing
    initWorkspace();
    
    // 2. Scan all files currently inside the workspace
    const files = scanWorkspaceFiles();
    const wsPath = getWorkspacePath();
    
    // 3. Scan extracted indexes
    const indexesPath = path.join(process.cwd(), 'data', 'indexes');
    const extractedCounts: Record<string, number> = {};
    if (fs.existsSync(indexesPath)) {
      const folders = fs.readdirSync(indexesPath, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);
      
      for (const folder of folders) {
        const folderPath = path.join(indexesPath, folder);
        const metaFiles = fs.readdirSync(folderPath).filter(f => f.endsWith('.meta.json'));
        extractedCounts[folder] = metaFiles.length;
      }
    }
    
    return NextResponse.json({
      status: 'success',
      message: 'Workspace synced successfully',
      workspacePath: wsPath,
      totalFiles: files.length,
      files: files,
      extractedCounts,
      localIndexCounts: countLocalIndexes()
    });
  } catch (error: any) {
    console.error("Sync API Error:", error);
    return NextResponse.json({
      status: 'error',
      message: error.message || "Failed to scan workspace"
    }, { status: 500 });
  }
}

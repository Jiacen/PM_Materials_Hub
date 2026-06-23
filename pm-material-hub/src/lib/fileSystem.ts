import fs from 'fs';
import path from 'path';

export const STANDARD_FOLDERS = [
  "01_产品物料表格",
  "02_Catalogue_产品样本",
  "03_Manual_产品技术手册",
  "04_Slides_Technical&Sales",
  "05_Sales_Reference_成功案例",
  "06_Sales_Fighting_Guide",
  "07_文本资料",
  "08_产品图片素材",
  "09_认证证书",
  "10_FAQ_常见问题集"
];

const SETTINGS_PATH = path.join(process.cwd(), 'config', 'settings.json');

// Get current workspace path from settings
export function getWorkspacePath(): string | null {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
      if (settings.workspacePath) {
        return settings.workspacePath;
      }
    }
  } catch (err) {
    console.error("Error reading settings.json:", err);
  }
  return null;
}

// Initialize the 10 standard folders in the workspace
export function initWorkspace(): void {
  const wsPath = getWorkspacePath();
  
  if (!wsPath) {
    throw new Error("WORKSPACE_NOT_SET");
  }
  
  if (!fs.existsSync(wsPath)) {
    fs.mkdirSync(wsPath, { recursive: true });
    console.log(`Created workspace root: ${wsPath}`);
  }

  for (const folder of STANDARD_FOLDERS) {
    const folderPath = path.join(wsPath, folder);
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath);
      console.log(`Created standard folder: ${folderPath}`);
    }
  }
}

// Recursively scan files in the workspace
export function scanWorkspaceFiles(): any[] {
  const wsPath = getWorkspacePath();
  const results: any[] = [];
  
  if (!wsPath || !fs.existsSync(wsPath)) {
    return results;
  }

  function walk(currentPath: string, relativePath: string) {
    const items = fs.readdirSync(currentPath);
    for (const item of items) {
      const fullPath = path.join(currentPath, item);
      const itemRelative = path.join(relativePath, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        walk(fullPath, itemRelative);
      } else {
        if (item.toLowerCase() === 'prompt.txt') continue;
        results.push({
          absolutePath: fullPath,
          relativePath: itemRelative,
          size: stat.size,
          mtime: stat.mtimeMs,
          extension: path.extname(item).toLowerCase()
        });
      }
    }
  }

  walk(wsPath, "");
  return results;
}

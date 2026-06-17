import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const SETTINGS_PATH = path.join(process.cwd(), 'config', 'settings.json');

function getWorkspacePath() {
  if (fs.existsSync(SETTINGS_PATH)) {
    const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
    return settings.workspacePath;
  }
  return null;
}

export async function GET(req: Request) {
  const workspacePath = getWorkspacePath();
  if (!workspacePath) return NextResponse.json({});
  
  try {
    // If we want to return all prompts, we scan the workspace folders
    const folders = fs.readdirSync(workspacePath, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
      
    const prompts: Record<string, string> = {};
    for (const folder of folders) {
      const promptPath = path.join(workspacePath, folder, 'prompt.txt');
      if (fs.existsSync(promptPath)) {
        prompts[folder] = fs.readFileSync(promptPath, 'utf8');
      }
    }
    return NextResponse.json(prompts);
  } catch (err) {
    return NextResponse.json({});
  }
}

export async function POST(req: Request) {
  try {
    const { folderName, prompt } = await req.json();
    if (!folderName) {
      return NextResponse.json({ success: false, error: 'Folder name is required' }, { status: 400 });
    }

    const workspacePath = getWorkspacePath();
    if (!workspacePath) {
      return NextResponse.json({ success: false, error: 'Workspace path not configured' }, { status: 400 });
    }

    const targetFolderPath = path.join(workspacePath, folderName);
    if (!fs.existsSync(targetFolderPath)) {
      return NextResponse.json({ success: false, error: `Folder ${folderName} does not exist in workspace` }, { status: 404 });
    }

    const promptPath = path.join(targetFolderPath, 'prompt.txt');
    fs.writeFileSync(promptPath, prompt || '', 'utf8');

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: 'Failed to save prompt' }, { status: 500 });
  }
}

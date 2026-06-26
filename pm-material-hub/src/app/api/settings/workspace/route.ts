import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { initWorkspace } from '@/lib/fileSystem';

const SETTINGS_PATH = path.join(process.cwd(), 'config', 'settings.json');

export async function POST(req: Request) {
  try {
    const { workspacePath } = await req.json();
    
    let settings = { workspacePath: '', llmProvider: 'kimi', apiKey: '', llmBaseUrl: 'https://api.moonshot.cn/v1' };
    if (fs.existsSync(SETTINGS_PATH)) {
      settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
    }
    
    settings.workspacePath = workspacePath;
    
    fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf8');
    
    // Initialize the folders in the new workspace path immediately
    initWorkspace();
    
    return NextResponse.json({ success: true, workspacePath });
  } catch (error: any) {
    console.error("Settings API Error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

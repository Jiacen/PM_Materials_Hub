import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  let dirPath = searchParams.get('path');

  try {
    if (!dirPath) {
      dirPath = os.homedir();
    }

    let directories: string[] = [];
    
    // Check if path is valid
    if (fs.existsSync(dirPath)) {
      directories = fs.readdirSync(dirPath, { withFileTypes: true })
        .filter(dirent => {
          try {
            return dirent.isDirectory() && !dirent.name.startsWith('$') && !dirent.name.startsWith('.');
          } catch (e) { return false; }
        })
        .map(dirent => dirent.name);
    } else {
      return NextResponse.json({ error: "Directory not found" }, { status: 404 });
    }

    return NextResponse.json({
      currentPath: dirPath,
      parentPath: path.dirname(dirPath),
      directories: directories
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { parentPath, folderName } = await req.json();
    if (!parentPath || !folderName) {
      return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
    }
    
    const newPath = path.join(parentPath, folderName);
    if (!fs.existsSync(newPath)) {
      fs.mkdirSync(newPath);
      return NextResponse.json({ success: true, newPath });
    } else {
      return NextResponse.json({ error: "Folder already exists" }, { status: 400 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

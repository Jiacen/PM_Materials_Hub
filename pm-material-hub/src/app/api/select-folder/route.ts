import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import path from 'path';
import util from 'util';

const execAsync = util.promisify(exec);

export async function GET() {
  try {
    // This is a local MVP Windows-specific hack to overcome browser security restrictions.
    // The browser cannot pick absolute paths, so we make Node.js spawn a native Windows folder picker.
    const scriptPath = path.join(process.cwd(), 'src', 'app', 'api', 'select-folder', 'dialog.vbs');
    const { stdout } = await execAsync(`cscript //nologo "${scriptPath}"`);
    
    const selectedPath = stdout.trim();
    
    if (selectedPath) {
      return NextResponse.json({ success: true, path: selectedPath });
    } else {
      return NextResponse.json({ success: false, message: "User cancelled" });
    }
  } catch (error: unknown) {
    console.error("Select Folder API Error:", error);
    const message = error instanceof Error ? error.message : 'Failed to select folder';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

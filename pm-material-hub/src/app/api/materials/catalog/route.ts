import { NextResponse } from 'next/server';
import { buildFolderCatalog, readFolderCatalog } from '@/lib/materialCatalog';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const folderName = searchParams.get('folderName');
    const refresh = searchParams.get('refresh') === '1';
    if (!folderName) {
      return NextResponse.json({ success: false, error: 'folderName is required' }, { status: 400 });
    }
    const catalog = refresh ? buildFolderCatalog(folderName) : readFolderCatalog(folderName);
    return NextResponse.json({ success: true, catalog });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to read material catalog';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

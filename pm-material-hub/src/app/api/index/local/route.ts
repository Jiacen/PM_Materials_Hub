import { NextResponse } from 'next/server';
import { indexFolderLocally } from '@/lib/localIndexer';

export async function POST(req: Request) {
  try {
    const { folderName, force } = await req.json();
    if (!folderName) {
      return NextResponse.json({ success: false, error: 'folderName is required' }, { status: 400 });
    }

    const results = await indexFolderLocally(folderName, Boolean(force));
    return NextResponse.json({ success: true, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Local indexing failed';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

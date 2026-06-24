import { NextResponse } from 'next/server';
import fs from 'fs';
import { getPptSelectionImagePath } from '@/lib/pptSelectionFavorites';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id') || '';
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const imagePath = getPptSelectionImagePath(id);
    if (!imagePath) return NextResponse.json({ error: 'Selection image not found' }, { status: 404 });

    return new NextResponse(new Uint8Array(fs.readFileSync(imagePath)), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load PPT selection image';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

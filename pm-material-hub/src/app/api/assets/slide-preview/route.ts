import { NextResponse } from 'next/server';
import fs from 'fs';
import {
  ensurePresentationPreviews,
  getPresentationPreviewPath,
} from '@/lib/presentationPreview';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const folderName = searchParams.get('folderName') || '';
    const sourceFile = searchParams.get('sourceFile') || '';
    const slideNumber = Number(searchParams.get('slideNumber'));
    const slideCount = Number(searchParams.get('slideCount')) || 0;

    if (!folderName || !sourceFile || !Number.isInteger(slideNumber) || slideNumber < 1) {
      return NextResponse.json({ error: 'Invalid slide preview request' }, { status: 400 });
    }

    const previewPath = getPresentationPreviewPath(folderName, sourceFile, slideNumber);
    if (!fs.existsSync(previewPath)) {
      const result = await ensurePresentationPreviews(folderName, sourceFile, slideCount);
      if (!result.available || !fs.existsSync(previewPath)) {
        return NextResponse.json({
          error: 'Native PowerPoint preview is unavailable',
          detail: result.error,
        }, { status: 503 });
      }
    }

    return new NextResponse(new Uint8Array(fs.readFileSync(previewPath)), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load slide preview';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { createPptSelectionFavorite } from '@/lib/pptSelectionFavorites';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const card = await createPptSelectionFavorite({
      folderName: body.folderName,
      sourceFile: body.sourceFile,
      slideNumber: body.slideNumber,
      slideCount: body.slideCount,
      bbox: body.bbox,
    });
    return NextResponse.json({ success: true, card });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to favorite PPT selection';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

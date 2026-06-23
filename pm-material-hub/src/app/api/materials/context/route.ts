import { NextResponse } from 'next/server';
import { readMaterialContext } from '@/lib/materialCatalog';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body?.folderName) {
      return NextResponse.json({ success: false, error: 'folderName is required' }, { status: 400 });
    }
    const materials = readMaterialContext({
      folderName: body.folderName,
      sourceFile: body.sourceFile,
      evidenceIds: Array.isArray(body.evidenceIds) ? body.evidenceIds : [],
      slideNumbers: Array.isArray(body.slideNumbers) ? body.slideNumbers : [],
      query: String(body.query || ''),
      maxSlides: Number(body.maxSlides) || 8,
      maxMaterials: Number(body.maxMaterials) || 3,
      maxCards: Number(body.maxCards) || 12,
      includeRefined: body.includeRefined !== false,
    });
    return NextResponse.json({ success: true, materials });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load material context';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

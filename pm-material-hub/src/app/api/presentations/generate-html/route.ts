import { NextResponse } from 'next/server';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { generateHtmlPresentation } from '@/lib/htmlPresentationGenerator';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const result = await generateHtmlPresentation(
      body.pages || [],
      body.title || 'HTML Presentation',
      body.generationInstruction || '',
    );
    const previewId = crypto.randomUUID();
    const previewDir = path.join(process.cwd(), 'data', 'generated-html');
    fs.mkdirSync(previewDir, { recursive: true });
    fs.writeFileSync(path.join(previewDir, `${previewId}.html`), result.html, 'utf8');

    return NextResponse.json({
      success: true,
      ...result,
      previewId,
      previewUrl: `/api/presentations/preview/${previewId}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate HTML presentation';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

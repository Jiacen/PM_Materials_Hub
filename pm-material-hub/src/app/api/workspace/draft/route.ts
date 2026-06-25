import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const DRAFT_PATH = path.join(process.cwd(), 'data', 'workspace-draft.json');

function ensureDraftDir() {
  fs.mkdirSync(path.dirname(DRAFT_PATH), { recursive: true });
}

function sanitizeGeneratedPreview(value: any) {
  if (!value || typeof value !== 'object') return null;
  return {
    fileName: value.fileName || 'presentation.html',
    previewUrl: value.previewUrl || '',
    finalizedBy: value.finalizedBy || '',
    warnings: Array.isArray(value.warnings) ? value.warnings.slice(0, 20) : [],
    generatedAt: value.generatedAt || '',
    signature: value.signature || '',
  };
}

export async function GET() {
  try {
    if (!fs.existsSync(DRAFT_PATH)) {
      return NextResponse.json({ success: true, draft: null });
    }

    const raw = fs.readFileSync(DRAFT_PATH, 'utf8');
    try {
      return NextResponse.json({
        success: true,
        draft: JSON.parse(raw),
      });
    } catch {
      return NextResponse.json({
        success: true,
        draft: null,
        warning: 'Workspace draft is invalid and was ignored.',
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load workspace draft';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    ensureDraftDir();
    fs.writeFileSync(DRAFT_PATH, JSON.stringify({
      schemaVersion: 1,
      savedAt: new Date().toISOString(),
      deckPages: body.deckPages || [],
      activePageId: body.activePageId || '',
      generationInstruction: body.generationInstruction || '',
      generatedHtmlPreview: sanitizeGeneratedPreview(body.generatedHtmlPreview),
    }, null, 2), 'utf8');

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save workspace draft';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    if (fs.existsSync(DRAFT_PATH)) {
      fs.unlinkSync(DRAFT_PATH);
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to clear workspace draft';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

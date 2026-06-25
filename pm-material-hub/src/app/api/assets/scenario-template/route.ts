import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getScenarioTemplateLayout } from '@/lib/scenarioTemplateLayouts';

function contentType(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

export async function GET(request: NextRequest) {
  const templateId = request.nextUrl.searchParams.get('id');
  const template = getScenarioTemplateLayout(templateId);
  if (!template) {
    return NextResponse.json({ success: false, error: 'Unknown scenario template.' }, { status: 404 });
  }

  const templateDir = path.resolve(process.cwd(), '..', 'Slides_Template', 'Scenario_Layouts');
  const imagePath = path.resolve(templateDir, template.imageFile);
  if (!imagePath.startsWith(templateDir) || !fs.existsSync(imagePath)) {
    return NextResponse.json({ success: false, error: 'Scenario template preview image not found.' }, { status: 404 });
  }

  const buffer = fs.readFileSync(imagePath);
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': contentType(imagePath),
      'Cache-Control': 'no-store',
    },
  });
}

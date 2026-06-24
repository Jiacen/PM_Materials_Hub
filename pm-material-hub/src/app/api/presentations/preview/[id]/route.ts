import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

type Params = {
  params: Promise<{
    id: string;
  }>;
};

function extractTitle(html: string) {
  const match = html.match(/<title>(.*?)<\/title>/i);
  const title = (match?.[1] || 'presentation')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[\\/:*?"<>|]+/g, '-')
    .slice(0, 80);
  return title || 'presentation';
}

function withServerDownload(html: string) {
  return html.replace(
    /onclick="downloadCurrentPreview\(\)"/g,
    `onclick="window.location.href=window.location.pathname+'?download=1'"`,
  );
}

export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  if (!/^[a-f0-9-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'Invalid preview id' }, { status: 400 });
  }

  const previewPath = path.join(process.cwd(), 'data', 'generated-html', `${id}.html`);
  if (!fs.existsSync(previewPath)) {
    return NextResponse.json({ error: 'Preview not found' }, { status: 404 });
  }

  const html = fs.readFileSync(previewPath, 'utf8');
  const url = new URL(req.url);
  if (url.searchParams.get('download') === '1') {
    const fileName = `${extractTitle(html)}.html`;
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        'Cache-Control': 'no-store',
      },
    });
  }

  return new NextResponse(withServerDownload(html), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

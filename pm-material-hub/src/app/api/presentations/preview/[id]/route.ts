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

function exportScript(fileName: string) {
  return `<script>
    async function saveCurrentPreview() {
      const fileName = ${JSON.stringify(fileName)};
      const downloadUrl = window.location.pathname + '?download=1';
      try {
        const response = await fetch(downloadUrl, { cache: 'no-store' });
        if (!response.ok) throw new Error('download failed');
        const blob = await response.blob();

        if ('showSaveFilePicker' in window) {
          const handle = await window.showSaveFilePicker({
            suggestedName: fileName,
            types: [{
              description: 'HTML Presentation',
              accept: { 'text/html': ['.html'] }
            }]
          });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          alert('导出成功：HTML 文件已保存到你选择的位置。');
          return;
        }

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        alert('浏览器已开始下载。若没有弹出保存位置选择框，请在浏览器下载设置中开启“每次下载前询问保存位置”。');
      } catch (error) {
        if (error && error.name === 'AbortError') {
          alert('已取消导出。');
          return;
        }
        alert('导出失败，请稍后重试。');
      }
    }
  </script>`;
}

function withServerDownload(html: string) {
  const fileName = `${extractTitle(html)}.html`;
  const patched = html.replace(
    /onclick="downloadCurrentPreview\(\)"/g,
    `onclick="saveCurrentPreview()"`,
  );
  if (patched.includes('function saveCurrentPreview()')) return patched;
  return patched.replace('</body>', `${exportScript(fileName)}\n</body>`);
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

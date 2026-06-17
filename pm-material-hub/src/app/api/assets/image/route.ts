import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { getWorkspacePath } from '@/lib/fileSystem';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.tif', '.tiff', '.bmp']);

function contentType(format?: string) {
  if (format === 'png') return 'image/png';
  if (format === 'webp') return 'image/webp';
  if (format === 'gif') return 'image/gif';
  if (format === 'jpeg' || format === 'jpg') return 'image/jpeg';
  return 'image/jpeg';
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const folderName = searchParams.get('folderName');
    const fileName = searchParams.get('fileName');
    const mode = searchParams.get('mode') || 'thumb';

    if (!folderName || !fileName) {
      return NextResponse.json({ error: 'folderName and fileName are required' }, { status: 400 });
    }

    const workspacePath = getWorkspacePath();
    if (!workspacePath) {
      return NextResponse.json({ error: 'Workspace path not configured' }, { status: 400 });
    }

    const workspaceRoot = path.resolve(workspacePath);
    const filePath = path.resolve(workspacePath, folderName, fileName);
    if (!filePath.startsWith(workspaceRoot)) {
      return NextResponse.json({ error: 'Invalid image path' }, { status: 400 });
    }
    if (!fs.existsSync(filePath) || !IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }

    const image = sharp(filePath, { limitInputPixels: false });
    const metadata = await image.metadata();
    const shouldConvert = ['tiff', 'tif'].includes(String(metadata.format));
    const pipeline = mode === 'full'
      ? image.resize({ width: 1600, withoutEnlargement: true })
      : image.resize({ width: 420, height: 260, fit: 'inside', withoutEnlargement: true });

    const format = shouldConvert ? 'jpeg' : (metadata.format || 'jpeg');
    const buffer = shouldConvert
      ? await pipeline.jpeg({ quality: 82 }).toBuffer()
      : await pipeline.toBuffer();

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': contentType(format),
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to read image';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

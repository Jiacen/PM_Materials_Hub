import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getWorkspacePath } from '@/lib/fileSystem';

const execFileAsync = promisify(execFile);
const PREVIEW_ROOT = path.join(process.cwd(), 'data', 'slide-previews');
const inFlight = new Map<string, Promise<PresentationPreviewResult>>();

export type PresentationPreviewResult = {
  available: boolean;
  slideCount: number;
  outputDirectory?: string;
  error?: string;
};

function safeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9\u4e00-\u9fa5._-]+/g, '-').slice(0, 120);
}

export function getPresentationPreviewDirectory(folderName: string, sourceFile: string) {
  return path.join(PREVIEW_ROOT, safeSegment(folderName), safeSegment(sourceFile));
}

export function getPresentationPreviewPath(folderName: string, sourceFile: string, slideNumber: number) {
  return path.join(getPresentationPreviewDirectory(folderName, sourceFile), `slide-${slideNumber}.png`);
}

export async function ensurePresentationPreviews(
  folderName: string,
  sourceFile: string,
  expectedSlideCount = 0,
  force = false,
): Promise<PresentationPreviewResult> {
  const key = `${folderName}\0${sourceFile}`;
  if (!force && inFlight.has(key)) return inFlight.get(key)!;

  const task = (async () => {
    const workspacePath = getWorkspacePath();
    if (!workspacePath) return { available: false, slideCount: 0, error: 'Workspace path not configured' };

    const workspaceRoot = path.resolve(workspacePath);
    const sourcePath = path.resolve(workspacePath, folderName, sourceFile);
    if (!sourcePath.startsWith(workspaceRoot) || !fs.existsSync(sourcePath)) {
      return { available: false, slideCount: 0, error: 'Presentation source not found' };
    }

    const outputDirectory = getPresentationPreviewDirectory(folderName, sourceFile);
    fs.mkdirSync(outputDirectory, { recursive: true });
    const existing = fs.readdirSync(outputDirectory).filter(file => /^slide-\d+\.png$/i.test(file));
    if (!force && existing.length > 0 && (!expectedSlideCount || existing.length >= expectedSlideCount)) {
      return { available: true, slideCount: existing.length, outputDirectory };
    }

    if (process.platform !== 'win32') {
      return { available: false, slideCount: existing.length, outputDirectory, error: 'Native PowerPoint preview requires Windows and Microsoft PowerPoint' };
    }

    const scriptPath = path.join(process.cwd(), 'scripts', 'render-ppt-previews.ps1');
    try {
      await execFileAsync('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy', 'Bypass',
        '-File', scriptPath,
        '-InputPath', sourcePath,
        '-OutputDirectory', outputDirectory,
      ], {
        windowsHide: true,
        timeout: 120000,
        maxBuffer: 1024 * 1024,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'PowerPoint rendering failed';
      return { available: false, slideCount: existing.length, outputDirectory, error: message };
    }

    const rendered = fs.readdirSync(outputDirectory).filter(file => /^slide-\d+\.png$/i.test(file));
    return {
      available: rendered.length > 0 && (!expectedSlideCount || rendered.length >= expectedSlideCount),
      slideCount: rendered.length,
      outputDirectory,
      error: rendered.length ? undefined : 'PowerPoint did not export slide images',
    };
  })();

  inFlight.set(key, task);
  try {
    return await task;
  } finally {
    inFlight.delete(key);
  }
}

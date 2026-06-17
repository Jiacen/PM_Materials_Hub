import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const settingsPath = path.join(process.cwd(), 'config', 'settings.json');

function getSettings() {
  if (fs.existsSync(settingsPath)) {
    return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  }
  return {};
}

function saveSettings(settings: any) {
  if (!fs.existsSync(path.dirname(settingsPath))) {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  }
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
}

export async function GET() {
  const settings = getSettings();
  const apiKey = settings.apiKey;
  const baseUrl = settings.llmBaseUrl || 'https://api.moonshot.cn/v1';

  if (!apiKey) {
    return NextResponse.json({ status: 'unconfigured', baseUrl });
  }

  // Ping LLM
  try {
    const res = await fetch(`${baseUrl}/models`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });

    if (res.ok) {
      const data = await res.json();
      const models = data.data || [];
      // Prefer 32k or 128k model if available
      const preferredModel = models.find((m: any) => m.id === 'moonshot-v1-32k') 
        || models.find((m: any) => m.id === 'moonshot-v1-128k') 
        || (models.length > 0 ? models[0] : null);
        
      const defaultModel = preferredModel ? preferredModel.id : 'Kimi Connected';
      return NextResponse.json({
        status: 'connected',
        baseUrl,
        modelName: defaultModel,
        isConfigured: true
      });
    } else {
       return NextResponse.json({
        status: 'error',
        baseUrl,
        message: 'Invalid API Key or Base URL',
        isConfigured: true
      });
    }
  } catch (err: any) {
    return NextResponse.json({
      status: 'error',
      baseUrl,
      message: err.message || 'Network error connecting to LLM',
      isConfigured: true
    });
  }
}

export async function POST(req: Request) {
  try {
    const { apiKey, baseUrl } = await req.json();
    const settings = getSettings();
    if (apiKey !== undefined && apiKey !== '********') {
       settings.apiKey = apiKey;
    }
    if (baseUrl) {
       settings.llmBaseUrl = baseUrl;
    }
    saveSettings(settings);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: 'Failed to save LLM settings' }, { status: 500 });
  }
}

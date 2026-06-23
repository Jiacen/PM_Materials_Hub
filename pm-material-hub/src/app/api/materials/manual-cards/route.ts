import { NextResponse } from 'next/server';
import { generateManualCards } from '@/lib/manualCardGenerator';

export async function POST(req: Request) {
  try {
    const { folderName } = await req.json();
    if (!folderName?.startsWith('03_')) {
      return NextResponse.json({ success: false, error: 'A 03 technical-manual folder is required.' }, { status: 400 });
    }
    const result = await generateManualCards(folderName);
    return NextResponse.json({
      success: true,
      cardCount: result.cards.length,
      llmFinalized: result.cards.filter(card => card.finalizedBy === 'llm').length,
      validatedFallback: result.cards.filter(card => card.finalizedBy === 'validated-fallback').length,
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Generation failed.' }, { status: 500 });
  }
}

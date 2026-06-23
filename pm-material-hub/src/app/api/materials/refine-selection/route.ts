import { NextResponse } from 'next/server';
import { llmService } from '@/lib/llmService';

type Section = {
  id: string;
  label: string;
  type: string;
  items: string[];
};

function protectedTokens(text: string) {
  return [...new Set(
    text.match(/\b(?:6ES7[A-Z0-9-]+|\d+(?:\.\d+)?|V|DC|IP\d+|PROFINET|IO|CPU|RT|IRT|I&M\d*|STEP\s*7|HMI|MFCT|RUN|LED)\b/gi) || []
  )];
}

function validateRefinement(sourceSections: Section[], refinedSections: Section[]) {
  if (sourceSections.length !== refinedSections.length) {
    throw new Error('The LLM changed the number of information groups.');
  }

  return sourceSections.map((sourceSection, sectionIndex) => {
    const refinedSection = refinedSections[sectionIndex];
    if (
      refinedSection?.id !== sourceSection.id
      || refinedSection?.label !== sourceSection.label
      || !Array.isArray(refinedSection?.items)
      || refinedSection.items.length !== sourceSection.items.length
    ) {
      throw new Error(`The LLM changed the structure of group ${sourceSection.label}.`);
    }

    const items = sourceSection.items.map((sourceItem, itemIndex) => {
      const refinedItem = String(refinedSection.items[itemIndex] || '').trim();
      if (!refinedItem) throw new Error(`The LLM removed an item from ${sourceSection.label}.`);

      for (const token of protectedTokens(sourceItem)) {
        if (!refinedItem.toLowerCase().includes(token.toLowerCase())) {
          throw new Error(`The LLM changed or removed protected token "${token}".`);
        }
      }
      return refinedItem;
    });

    return { ...sourceSection, items };
  });
}

export async function POST(req: Request) {
  try {
    const { title, subtitle, sourceFile, chunkIds, sections } = await req.json();
    if (!title || !Array.isArray(sections) || sections.length === 0) {
      return NextResponse.json({ success: false, error: 'Card title and sections are required.' }, { status: 400 });
    }

    const systemPrompt = `你是工业自动化技术资料编辑器。你的任务仅是轻度整理措辞，不是重新提取事实。

严格规则：
1. 不得新增、删除、合并或拆分分组和条目。
2. 不得改变 MLFB、产品名称、数值、单位、协议、接口、端口、型号、适用范围或资料缺失声明。
3. 不得把系统级条件改写成模块自身参数。
4. 不得使用外部知识补充资料。
5. 只允许改善中文清晰度、去除重复表达、统一标点和字段句式。
6. 保留每个 section 的 id、label、type 和 items 数量。
7. 仅输出合法 JSON：{"sections":[{"id":"","label":"","type":"","items":[""]}]}`;

    const payload = JSON.stringify({
      card: { title, subtitle, sourceFile, chunkIds },
      sections,
    });
    let result: any = null;
    const retryDelays = [5000, 15000];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        result = await llmService.extractInsights(systemPrompt, payload);
        break;
      } catch (error: any) {
        const retryable = error?.status === 429 || error?.message?.includes('overloaded');
        if (!retryable || attempt === 2) throw error;
        await new Promise(resolve => setTimeout(resolve, retryDelays[attempt]));
      }
    }
    const refinedSections = validateRefinement(sections, result?.sections);

    return NextResponse.json({ success: true, sections: refinedSections });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to refine selected information.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

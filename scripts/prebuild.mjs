import fs from 'node:fs/promises';
import path from 'node:path';

const API_KEY = process.env.ZAI_API_KEY;
const BASE = 'https://api.z.ai/api/paas/v4/chat/completions';
const OUT = 'dict';
await fs.mkdir(OUT, { recursive: true });

const words = JSON.parse(await fs.readFile('scripts/common.json', 'utf8'));

const prompt = w => `你是新华字典编纂助手。请为汉字「${w}」生成规范词条。
注意：必须使用简体中文进行释义。
严格输出以下JSON格式，不要任何Markdown代码块：
{"word": "${w}","traditional": "该字对应的繁体字（如果无繁体或与简体相同，则留空）","pinyin": "带声调拼音","radical": "部首","strokes": 笔画数(必须是数字),"structure": "独体/上下/左右/包围/半包围/品字形","meaning": [{"pos":"词性","def":"释义","examples":["例句"]}],"phrases": ["组词"],"related": ["关联字"],"etymology": "50字以内字源"}`;

for (const w of words) {
  const file = path.join(OUT, `${w}.json`);
  try { await fs.access(file); continue; } catch {}

  try {
    const r = await fetch(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
      body: JSON.stringify({
        model: 'glm-4.7-flash',
        messages: [{ role: 'user', content: prompt(w) }],
        temperature: 0.1,
        response_format: { type: "json_object" }
      })
    });

    if (r.status === 429) { await new Promise(r => setTimeout(r, 5000)); continue; }

    const j = await r.json();
    let text = j.choices?.[0]?.message?.content || '';
    text = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    const data = JSON.parse(text);
    await fs.writeFile(file, JSON.stringify(data, null, 2));
    console.log(`✅ ${w}`);
  } catch (e) { console.error(`❌ ${w}: ${e.message}`); }
  await new Promise(r => setTimeout(r, 1500));
}
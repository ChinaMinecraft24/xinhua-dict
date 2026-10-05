import fs from 'node:fs/promises';
import path from 'node:path';

// 国际站配置
const API_KEY = process.env.ZAI_API_KEY;
const BASE = 'https://api.z.ai/api/paas/v4';
const OUT = 'dict';
await fs.mkdir(OUT, { recursive: true });

const words = JSON.parse(await fs.readFile('scripts/common.json', 'utf8'));

const prompt = w => `为汉字「${w}」生成新华字典词条，输出严格JSON（含word/pinyin/radical/strokes/structure/meaning/phrases/related/etymology）。只输出JSON，不要markdown。`;

for (const w of words) {
  const file = path.join(OUT, `${w}.json`);
  try { await fs.access(file); continue; } catch {} // 已生成则跳过

  try {
    const r = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: 'glm-4.7-flash',
        messages: [{ role: 'user', content: prompt(w) }],
        temperature: 0.3
      })
    });
    const j = await r.json();
    const text = j.choices[0].message.content;
    const m = text.match(/\{[\s\S]*\}/);
    const data = JSON.parse(m[0]);
    data._source = 'prebuild';
    data._ts = Math.floor(Date.now() / 1000);
    await fs.writeFile(file, JSON.stringify(data, null, 2));
    console.log('✓', w);
  } catch (e) {
    console.warn('✗', w, e.message);
  }
  // 智谱免费层并发限制为 1，必须间隔 1.2 秒
  await new Promise(r => setTimeout(r, 1200));
}

// 生成搜索索引
const files = (await fs.readdir(OUT)).filter(f => f.endsWith('.json'));
const index = [];
for (const f of files) {
  const d = JSON.parse(await fs.readFile(path.join(OUT, f), 'utf8'));
  index.push({ word: d.word, pinyin: d.pinyin, radical: d.radical });
}
await fs.writeFile('index.json', JSON.stringify(index));
console.log('索引条目:', index.length);

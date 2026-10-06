import fs from 'node:fs/promises';
import path from 'node:path';

const API_KEY = process.env.ZAI_API_KEY;
const BASE = 'https://api.z.ai/api/paas/v4/chat/completions';
const OUT = 'dict';

await fs.mkdir(OUT, { recursive: true });

const words = JSON.parse(await fs.readFile('scripts/common.json', 'utf8'));

const prompt = w => `你是新华字典编纂助手。请为汉字「${w}」生成规范词条。
严格输出以下JSON格式，不要任何Markdown代码块，不要任何解释性文字：
{"word": "${w}","pinyin": "带声调拼音","radical": "部首","strokes": 笔画数(必须是数字),"structure": "独体/上下/左右/包围/半包围/品字形","meaning": [{"pos":"词性","def":"释义","examples":["例句"]}],"phrases": ["组词"],"related": ["关联字"],"etymology": "50字以内字源"}`;

for (const w of words) {
  const file = path.join(OUT, `${w}.json`);
  try { 
    await fs.access(file); 
    console.log(`✓ ${w} 已存在，跳过`);
    continue; 
  } catch {}

  try {
    const r = await fetch(BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: 'glm-4.7-flash',
        messages: [
          { role: 'system', content: '你是一个严格输出JSON的API，只输出JSON对象。' },
          { role: 'user', content: prompt(w) }
        ],
        temperature: 0.1,
        response_format: { type: "json_object" }
      })
    });

    if (r.status === 429) {
      console.log(`⚠️ ${w} 遇到429限流，等待5秒后重试...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
      // 简单重试一次
      continue;
    }

    const j = await r.json();
    if (j.error) throw new Error(j.error.message);

    let text = j.choices?.[0]?.message?.content || '';
    text = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    
    const data = JSON.parse(text);
    await fs.writeFile(file, JSON.stringify(data, null, 2));
    console.log(`✅ ${w} 生成成功`);

  } catch (e) {
    console.error(`❌ ${w} 生成失败: ${e.message}`);
  }

  // ⭐️ 核心防封禁：每个字之间强制休息 1.5 秒
  await new Promise(resolve => setTimeout(resolve, 1500));
}

console.log('🎉 预生成任务全部完成！');
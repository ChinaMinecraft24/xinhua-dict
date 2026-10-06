import fs from 'node:fs/promises';
import path from 'node:path';

const API_KEY = process.env.ZAI_API_KEY;
const BASE = 'https://api.z.ai/api/paas/v4/chat/completions';
const OUT = 'dict';

await fs.mkdir(OUT, { recursive: true });
const words = JSON.parse(await fs.readFile('scripts/common.json', 'utf8'));

const prompt = w => `你是新华字典编纂助手。请为汉字「${w}」生成规范词条。
注意：必须使用简体中文进行释义。
严格输出以下JSON格式，不要任何Markdown代码块，不要任何解释性文字：
{"word": "${w}","traditional": "该字对应的繁体字（如果无繁体或与简体相同，则留空）","pinyin": "带声调拼音","radical": "部首","strokes": 笔画数(必须是数字),"structure": "独体/上下/左右/包围/半包围/品字形","meaning": [{"pos":"词性","def":"释义","examples":["例句"]}],"phrases": ["组词"],"related": ["关联字"],"etymology": "50字以内字源"}`;

console.log(`开始预生成任务，共 ${words.length} 个字...`);

for (let i = 0; i < words.length; i++) {
  const w = words[i];
  const file = path.join(OUT, `${w}.json`);

  try { await fs.access(file); continue; } catch {}

  let success = false;
  let attempts = 0;
  const maxAttempts = 3; // ⭐️ 核心：同一个字最多试 3 次，绝不死磕！

  while (attempts < maxAttempts && !success) {
    attempts++;
    try {
      const r = await fetch(BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
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
        console.log(`⚠️ 第 ${i+1}/${words.length} 个字 [${w}] 第 ${attempts} 次遇到 429，等待 10 秒...`);
        await new Promise(resolve => setTimeout(resolve, 10000)); // 等 10 秒
        continue; 
      }

      if (!r.ok) throw new Error(`HTTP ${r.status}`);

      const j = await r.json();
      if (j.error) throw new Error(j.error.message);

      let text = j.choices?.[0]?.message?.content || '';
      text = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      
      const data = JSON.parse(text);
      await fs.writeFile(file, JSON.stringify(data, null, 2));
      console.log(`✅ 第 ${i+1}/${words.length} 个字 [${w}] 生成成功`);
      success = true;

    } catch (e) {
      console.log(`❌ 第 ${i+1}/${words.length} 个字 [${w}] 第 ${attempts} 次失败: ${e.message}`);
      if (attempts < maxAttempts) await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  if (!success) {
    console.log(`⏭️ 跳过 [${w}]，交给以后在手表上实时生成。`);
  }

  // 每个字之间多休息一会儿，避让限流
  await new Promise(resolve => setTimeout(resolve, 3000));
}

console.log('🎉 预生成任务全部完成！');

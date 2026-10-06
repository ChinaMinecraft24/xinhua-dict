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

  try { 
    await fs.access(file); 
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

    // ⭐️ 核心防弹 1：拦截 429 限流
    if (r.status === 429) {
      console.log(`⚠️ 第 ${i+1}/${words.length} 个字 [${w}] 遇到 429 限流，等待 5 秒后重试...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
      i--; // 重新尝试当前字
      continue;
    }

    // ⭐️ 核心防弹 2：拦截其他 HTTP 错误
    if (!r.ok) {
      console.log(`❌ 第 ${i+1}/${words.length} 个字 [${w}] 请求失败，状态码: ${r.status}，跳过。`);
      continue;
    }

    const j = await r.json();
    
    // ⭐️ 核心防弹 3：拦截 API 返回的业务错误
    if (j.error) {
      console.log(`❌ 第 ${i+1}/${words.length} 个字 [${w}] API 报错: ${j.error.message}，跳过。`);
      continue;
    }

    // ⭐️ 核心防弹 4：拦截畸形响应
    if (!j.choices || !j.choices[0] || !j.choices[0].message) {
      console.log(`❌ 第 ${i+1}/${words.length} 个字 [${w}] 返回结构异常，跳过。`);
      continue;
    }

    let text = j.choices[0].message.content || '';
    text = text.replace(/```json/gi, '').replace(/```/g, '').trim();

    // ⭐️ 核心防弹 5：拦截 JSON 解析失败
    try {
      const data = JSON.parse(text);
      await fs.writeFile(file, JSON.stringify(data, null, 2));
      console.log(`✅ 第 ${i+1}/${words.length} 个字 [${w}] 生成成功`);
    } catch (parseError) {
      console.log(`❌ 第 ${i+1}/${words.length} 个字 [${w}] JSON 解析失败，跳过。原始内容前30字: ${text.substring(0, 30)}...`);
    }

  } catch (e) {
    console.log(`❌ 第 ${i+1}/${words.length} 个字 [${w}] 发生异常: ${e.message}，跳过。`);
  }

  // 稳妥起见，每个字间隔 1.5 秒
  await new Promise(resolve => setTimeout(resolve, 1500));
}

console.log('🎉 预生成任务全部完成！');

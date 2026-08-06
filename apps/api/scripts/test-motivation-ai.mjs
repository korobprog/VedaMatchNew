// Изолированная проверка провайдера Motivation AI (relay.fast) без БД и без Nest.
// Повторяет ровно тот же HTTP-контракт, что и MotivationGenerationService:
// chat/completions для текста, POST /images/generations для картинки.
// Удобно проверить ключ и модели до подъёма всего стека.
//
// Запуск: pnpm --filter @vedamatch/api test:ai
// Только текст (без картинки, быстрее): pnpm --filter @vedamatch/api test:ai -- --text-only

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const apiDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function loadEnvFile(filePath) {
  let content;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch {
    return;
  }
  for (const line of content.split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, '');
  }
}

// Тот же порядок приоритета, что у ConfigModule.forRoot в app.module.ts.
loadEnvFile(path.join(apiDir, '.env'));
loadEnvFile(path.join(apiDir, '..', '..', '.env'));

const apiKey = process.env.MOTIVATION_AI_API_KEY;
const baseUrl = (process.env.MOTIVATION_AI_BASE_URL || '').replace(/\/$/, '');
const textModel = process.env.MOTIVATION_TEXT_MODEL || 'deepseek-v4-flash';
const imageModel = process.env.MOTIVATION_IMAGE_MODEL || 'gpt-image-2';
const imageTimeoutMs = Number(process.env.MOTIVATION_IMAGE_TIMEOUT_MS || 180_000);
const textOnly = process.argv.includes('--text-only');

if (!apiKey || !baseUrl) {
  console.error(
    'MOTIVATION_AI_API_KEY / MOTIVATION_AI_BASE_URL не заданы. Впиши ключ в apps/api/.env и запусти снова.',
  );
  process.exitCode = 1;
} else {
  await main();
}

async function main() {
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Text model: ${textModel}`);
  console.log(`Image model: ${imageModel}\n`);

  const textOk = await testText();
  const imageOk = textOnly ? null : await testImage();

  console.log('—'.repeat(40));
  console.log(`Текст:    ${textOk ? 'OK' : 'ОШИБКА'}`);
  console.log(
    `Картинка: ${imageOk === null ? 'пропущено (--text-only)' : imageOk ? 'OK' : 'ОШИБКА'}`,
  );
  // Явный process.exit() здесь и раньше валил Node на Windows ассертом в libuv —
  // внутренний HTTP-клиент (undici) не успевает закрыть соединение. Даём циклу
  // событий завершиться самому и только выставляем код возврата.
  process.exitCode = textOk && imageOk !== false ? 0 : 1;
}

async function testText() {
  console.log('→ Проверяю текстовую генерацию (chat/completions)...');
  // Явный AbortController вместо AbortSignal.timeout: на Windows его внутренний
  // таймер переживает fetch и валит process.exit() ассертом в libuv (win/async.c).
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error('timeout')), 60_000);
  let raw, ok, status;
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        'user-agent': 'OpenAI-Python/1.0',
      },
      body: JSON.stringify({
        model: textModel,
        messages: [
          {
            role: 'user',
            content:
              'Придумай один короткий вдохновляющий статус для профиля знакомств вайшнава (до 15 слов, на русском). Ответь только текстом статуса, без кавычек.',
          },
        ],
      }),
    });
    ok = response.ok;
    status = response.status;
    raw = await response.text();
  } catch (error) {
    console.error(`✗ Текст: ${error instanceof Error ? error.message : error}`);
    return false;
  } finally {
    clearTimeout(timeout);
  }
  if (!ok) {
    console.error(`✗ Текст: провайдер вернул ${status}`);
    console.error(raw.slice(0, 500));
    return false;
  }
  const content = extractChatContent(raw);
  if (!content) {
    console.error('✗ Текст: ответ пришёл, но без содержимого. Сырой ответ:');
    console.error(raw.slice(0, 500));
    return false;
  }
  console.log(`✓ Текст получен: "${content.trim()}"\n`);
  return true;
}

function extractChatContent(raw) {
  try {
    const payload = JSON.parse(raw);
    return payload.choices?.[0]?.message?.content;
  } catch {
    const chunks = [];
    for (const line of raw.split(/\r?\n/)) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      try {
        const event = JSON.parse(data);
        const content =
          event.choices?.[0]?.delta?.content ??
          event.choices?.[0]?.message?.content;
        if (content) chunks.push(content);
      } catch {
        continue;
      }
    }
    return chunks.join('') || undefined;
  }
}

async function testImage() {
  console.log('→ Проверяю генерацию картинки (POST /images/generations)...');
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error('timeout')),
    imageTimeoutMs,
  );
  let response;
  try {
    response = await fetch(`${baseUrl}/images/generations`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        'user-agent': 'OpenAI-Python/1.0',
      },
      body: JSON.stringify({
        model: imageModel,
        prompt:
          'A peaceful sunrise over the Ganges river, spiritual watercolor style. ' +
          'Vertical 9:16 illustration, no text, respectful non-photorealistic spiritual art.',
        size: '1024x1536',
      }),
    });
  } catch (error) {
    console.error(`✗ Картинка: ${error instanceof Error ? error.message : error}`);
    return false;
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    console.error(`✗ Картинка: провайдер вернул ${response.status}`);
    console.error((await response.text()).slice(0, 500));
    return false;
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    console.error('✗ Картинка: ответ не является JSON.');
    return false;
  }
  const encoded = payload.data?.[0]?.b64_json;
  if (!encoded) {
    console.error('✗ Картинка: провайдер не вернул изображение. Ответ:');
    console.error(JSON.stringify(payload).slice(0, 500));
    return false;
  }
  const bytes = Buffer.from(encoded, 'base64');
  const isPng =
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (!isPng) {
    console.error('✗ Картинка: результат не является валидным PNG.');
    return false;
  }
  const outPath = path.join(apiDir, 'scripts', 'test-motivation-ai-output.png');
  writeFileSync(outPath, bytes);
  console.log(`✓ Картинка получена и сохранена: ${outPath}\n`);
  return true;
}

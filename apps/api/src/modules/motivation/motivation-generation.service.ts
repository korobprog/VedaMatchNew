import { BadGatewayException, BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

@Injectable()
export class MotivationGenerationService {
  private readonly s3: S3Client | null;
  constructor(private readonly config: ConfigService) {
    const region = config.get<string>('S3_REGION'), accessKeyId = config.get<string>('S3_ACCESS_KEY'), secretAccessKey = config.get<string>('S3_SECRET_KEY');
    this.s3 = region && accessKeyId && secretAccessKey ? new S3Client({ region, endpoint: config.get<string>('S3_ENDPOINT') || undefined, forcePathStyle: Boolean(config.get('S3_ENDPOINT')), credentials: { accessKeyId, secretAccessKey } }) : null;
  }

  async generateCopy(input: { profileType: string; audienceTrack: string; category: string }) {
    const apiKey = this.config.get<string>('MOTIVATION_AI_API_KEY');
    const baseUrl = this.config.get<string>('MOTIVATION_AI_BASE_URL')?.replace(/\/$/, '');
    const model = this.config.get<string>('MOTIVATION_TEXT_MODEL') || 'deepseek-v4-flash';
    if (!apiKey || !baseUrl) throw new ServiceUnavailableException('Motivation AI is not configured');
    const prompt = `Create one original motivational reflection for VedaMatch. Profile: ${input.profileType}. Stream: ${input.audienceTrack}. Category: ${input.category}. Never invent or quote a source. Return only JSON with translations ru, en, hi; each has title, text (2-4 short paragraphs), storyText (max 8 words). Vaishnava content must be respectful and non-sectarian.`;
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      signal: AbortSignal.timeout(60_000),
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', 'user-agent': 'OpenAI-Python/1.0' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' }, stream: true }),
    });
    if (!response.ok) throw new BadGatewayException(`Text provider error ${response.status}: ${(await response.text()).slice(0, 300)}`);
    const raw = await response.text();
    const content = this.extractChatContent(raw);
    if (!content) throw new BadGatewayException('Text provider returned no content');
    let parsed: unknown;
    try { parsed = JSON.parse(content); } catch { throw new BadGatewayException('Text provider returned invalid JSON'); }
    return this.validateCopy(parsed);
  }

  private extractChatContent(raw: string): string | undefined {
    try {
      const payload = JSON.parse(raw) as { choices?: Array<{ message?: { content?: string } }> };
      return payload.choices?.[0]?.message?.content;
    } catch {
      const chunks: string[] = [];
      for (const line of raw.split(/\r?\n/)) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        try {
          const event = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string }, message?: { content?: string } }> };
          const content = event.choices?.[0]?.delta?.content ?? event.choices?.[0]?.message?.content;
          if (content) chunks.push(content);
        } catch { continue; }
      }
      return chunks.join('') || undefined;
    }
  }

  async generateImage(prompt: string): Promise<Buffer> {
    const apiKey = this.config.get<string>('MOTIVATION_AI_API_KEY');
    const baseUrl = this.config.get<string>('MOTIVATION_AI_BASE_URL')?.replace(/\/$/, '');
    const model = this.config.get<string>('MOTIVATION_IMAGE_CONTROLLER_MODEL') || 'gpt-5.5';
    if (model.startsWith('gpt-image-')) throw new BadRequestException('Image controller model must be a Responses-capable language model');
    if (!apiKey || !baseUrl) throw new ServiceUnavailableException('Motivation AI is not configured');
    const imagePrompt = `${prompt}\nVertical 9:16 illustration, no text, respectful non-photorealistic spiritual art.`;
    const timeoutMs = Number(this.config.get<string>('MOTIVATION_IMAGE_TIMEOUT_MS') || 180_000);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error('Image generation timed out')), timeoutMs);
    let raw: string;
    try {
      const response = await fetch(`${baseUrl}/responses`, {
        method: 'POST',
        signal: controller.signal,
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', 'user-agent': 'OpenAI-Python/1.0' },
        body: JSON.stringify({
          model,
          instructions: 'You are an image generation assistant. Use the image_generation tool to create exactly one image that matches the user request.',
          input: [{ role: 'user', content: [{ type: 'input_text', text: imagePrompt }] }],
          tools: [{ type: 'image_generation', action: 'generate', output_format: 'png' }],
          tool_choice: { type: 'image_generation' },
          store: false,
          stream: true,
        }),
      });
      if (!response.ok) throw new BadGatewayException(`Image provider error ${response.status}: ${(await response.text()).slice(0, 300)}`);
      raw = await this.readResponseText(response, controller.signal);
    } finally {
      clearTimeout(timeout);
    }
    const events = raw.split(/\r?\n\r?\n/).flatMap((block) => {
      const data = block.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('\n');
      if (!data || data === '[DONE]') return [];
      try { return [JSON.parse(data) as unknown]; } catch { return []; }
    });
    const encoded = events.map((event) => this.findImageResult(event)).find(Boolean);
    if (!encoded) throw new BadGatewayException('Image provider returned no image');
    const bytes = Buffer.from(encoded, 'base64');
    if (bytes.length < 8 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new BadGatewayException('Image provider returned no valid PNG');
    return bytes;
  }

  private async readResponseText(response: Response, signal: AbortSignal): Promise<string> {
    if (!response.body) return '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let raw = '';
    const abort = new Promise<never>((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
    try {
      while (true) {
        const result = await Promise.race([reader.read(), abort]);
        if (result.done) return raw + decoder.decode();
        raw += decoder.decode(result.value, { stream: true });
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
  }

  async uploadStory(key: string, bytes: Buffer): Promise<string> {
    const bucket = this.config.get<string>('S3_BUCKET_NAME'), publicUrl = this.config.get<string>('S3_PUBLIC_URL');
    if (!this.s3 || !bucket || !publicUrl) throw new ServiceUnavailableException('S3 is not configured');
    await this.s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: 'image/png', CacheControl: 'public, max-age=31536000, immutable', ACL: 'public-read' }));
    return `${publicUrl.replace(/\/$/, '')}/${key}`;
  }

  private validateCopy(value: unknown) {
    if (!value || typeof value !== 'object') throw new BadGatewayException('Text provider returned invalid copy');
    const result = value as Record<string, unknown>;
    const translations = (result.translations && typeof result.translations === 'object' ? result.translations : result) as Record<string, unknown>;
    return ['ru', 'en', 'hi'].map((language) => {
      const item = translations[language] as Record<string, unknown> | undefined;
      if (!item || typeof item.title !== 'string' || typeof item.text !== 'string' || typeof item.storyText !== 'string') throw new BadGatewayException(`Text provider omitted ${language}`);
      return { language, title: item.title.trim().slice(0, 160), text: item.text.trim().slice(0, 4000), storyText: item.storyText.trim().slice(0, 120) };
    });
  }

  private findImageResult(value: unknown): string | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const item = value as Record<string, unknown>;
    if ((item.type === 'image_generation_call' && typeof item.result === 'string') || typeof item.b64_json === 'string') {
      const encoded = typeof item.result === 'string' ? item.result : item.b64_json as string;
      if (encoded.length > 1000) return encoded;
    }
    for (const child of Object.values(item)) {
      if (Array.isArray(child)) {
        for (const entry of child) { const found = this.findImageResult(entry); if (found) return found; }
      } else if (child && typeof child === 'object') {
        const found = this.findImageResult(child); if (found) return found;
      }
    }
    return undefined;
  }
}

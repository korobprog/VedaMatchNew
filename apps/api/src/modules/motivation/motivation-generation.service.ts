import { BadGatewayException, BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

export type VerifiedQuoteCopy = {
  originalText: string;
  profileTypes: string[];
  explanation: string;
  translations: Record<'ru' | 'en' | 'hi', {
    quoteText: string;
    translationKind: string;
    label: string | null;
    title: string;
    explanation: string;
    storyText: string;
  }>;
};

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

  async generateVerifiedQuoteCopy(input: { originalText: string; originalLanguage: string; author: string; work: string; locator: string; contextExcerpt: string }): Promise<VerifiedQuoteCopy> {
    const prompt = [
      'Prepare explanatory copy and translations for a verified quotation.',
      'Never alter originalText. Never add claims attributed to the speaker.',
      'Return profileTypes using only: user, in_goodness, yogi, devotee.',
      'Return explanation as one or two paragraphs. It must explain relevance without inventing facts.',
      'Return translations for ru, en, hi. Every language key is mandatory.',
      'Each translation must contain exactly these fields: quoteText, translationKind, label, title, explanation, storyText.',
      'The original language must repeat the exact originalText with translationKind "official" and label null.',
      'Every non-original translation must use translationKind "vedamatch" and label "Перевод VedaMatch".',
      'Return strict JSON with this shape: {"originalText":"...","profileTypes":["user"],"explanation":"...","translations":{"ru":{"quoteText":"...","translationKind":"official|vedamatch","label":null,"title":"...","explanation":"...","storyText":"..."},"en":{"quoteText":"...","translationKind":"official|vedamatch","label":"Перевод VedaMatch","title":"...","explanation":"...","storyText":"..."},"hi":{"quoteText":"...","translationKind":"official|vedamatch","label":"Перевод VedaMatch","title":"...","explanation":"...","storyText":"..."}}}.',
      `Verified originalText: ${JSON.stringify(input.originalText)}`,
      `Original language: ${input.originalLanguage}`,
      `Attribution: ${input.author}; ${input.work}; ${input.locator}`,
      `Verified context: ${input.contextExcerpt}`,
    ].join('\n');
    return this.requestStructuredChat(prompt) as Promise<VerifiedQuoteCopy>;
  }

  async extractQuotesFromSource(text: string, sourceUrl: string): Promise<Array<{
    originalText: string;
    author: string;
    work: string;
    locator: string;
    originalLanguage: string;
    contextExcerpt: string;
  }>> {
    const trimmed = text.slice(0, 12_000);
    const prompt = [
      'Extract verbatim quotations with clear author attribution from the following web page text.',
      'Only extract text that is explicitly present in the source; never invent, paraphrase, or translate.',
      'Skip any passage without a clearly named author.',
      'Return strict JSON with this shape: {"quotes":[{"originalText":"...","author":"...","work":"...","locator":"...","originalLanguage":"en","contextExcerpt":"..."}]}.',
      'contextExcerpt must contain originalText verbatim. Return at most 10 items. If nothing qualifies, return {"quotes":[]}.',
      `Source URL: ${sourceUrl}`,
      `Source text: ${JSON.stringify(trimmed)}`,
    ].join('\n');
    const parsed = await this.requestStructuredChat(prompt);
    return this.validateExtractedQuotes(parsed);
  }

  private validateExtractedQuotes(value: unknown): Array<{
    originalText: string;
    author: string;
    work: string;
    locator: string;
    originalLanguage: string;
    contextExcerpt: string;
  }> {
    if (!value || typeof value !== 'object') throw new BadGatewayException('Text provider returned invalid quotes payload');
    const quotes = (value as { quotes?: unknown }).quotes;
    if (!Array.isArray(quotes)) throw new BadGatewayException('Text provider returned no quotes array');
    return quotes.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const record = item as Record<string, unknown>;
      const originalText = typeof record.originalText === 'string' ? record.originalText.trim() : '';
      const author = typeof record.author === 'string' ? record.author.trim() : '';
      if (!originalText || !author) return [];
      return [{
        originalText,
        author,
        work: typeof record.work === 'string' ? record.work.trim() : '',
        locator: typeof record.locator === 'string' ? record.locator.trim() : '',
        originalLanguage: typeof record.originalLanguage === 'string' && record.originalLanguage.trim() ? record.originalLanguage.trim() : 'en',
        contextExcerpt: typeof record.contextExcerpt === 'string' && record.contextExcerpt.trim() ? record.contextExcerpt.trim() : originalText,
      }];
    }).slice(0, 10);
  }

  private async requestStructuredChat(prompt: string): Promise<unknown> {
    const apiKey = this.config.get<string>('MOTIVATION_AI_API_KEY');
    const baseUrl = this.config.get<string>('MOTIVATION_AI_BASE_URL')?.replace(/\/$/, '');
    const model = this.config.get<string>('MOTIVATION_TEXT_MODEL') || 'deepseek-v4-flash';
    if (!apiKey || !baseUrl) throw new ServiceUnavailableException('Motivation AI is not configured');
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      signal: AbortSignal.timeout(60_000),
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', 'user-agent': 'OpenAI-Python/1.0' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' }, stream: true }),
    });
    if (!response.ok) throw new BadGatewayException(`Text provider error ${response.status}: ${(await response.text()).slice(0, 300)}`);
    const content = this.extractChatContent(await response.text());
    if (!content) throw new BadGatewayException('Text provider returned no content');
    try { return JSON.parse(content); } catch { throw new BadGatewayException('Text provider returned invalid JSON'); }
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

  async generateApprovedImage(input: { imagePrompt: string | null; textApprovedAt: Date | null }): Promise<Buffer> {
    if (!input.textApprovedAt || Number.isNaN(input.textApprovedAt.getTime()) || !input.imagePrompt?.trim()) {
      throw new BadRequestException('Image generation requires approved text and a stored image prompt');
    }
    return this.generateImage(input.imagePrompt);
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

# Motivation Provider Integration Design

## Goal

Make VedaMatch Motivation reliably generate text and one vertical PNG through the OpenAI-compatible provider at `https://r-api.vibemod.pro/v1`, then publish the resulting unique post through the existing Motivation pipeline.

## Architecture

The existing NestJS `MotivationGenerationService` remains the only provider boundary. Text continues through Chat Completions. Images continue through the streaming Responses API with controller model `gpt-5.5` and hosted `image_generation`; no `gpt-image-*` model is sent in the `model` field.

Production configuration supplies `MOTIVATION_AI_BASE_URL`, `MOTIVATION_AI_API_KEY`, text model, and controller model. Secrets remain environment-only and are never committed or logged.

## Request Contract

Both provider calls send `User-Agent: OpenAI-Python/1.0`, because the provider's Cloudflare layer rejects the current default client with error 1010.

The image request sends:

- `model: gpt-5.5`
- `stream: true`
- message-list `input` containing `input_text`
- `instructions` requiring exactly one generated image
- tool `{ type: image_generation, action: generate, output_format: png }`
- `tool_choice: { type: image_generation }`
- `store: false`

## Streaming

The service parses SSE by event boundaries, joins multiple `data:` lines within an event, ignores `[DONE]`, and recursively extracts `image_generation_call.result` or `b64_json`. It rejects empty, malformed, or non-PNG output before upload.

## Job Safety

The image HTTP timeout remains 180 seconds. Expired-job recovery must not requeue an active generation before that timeout. The stale threshold becomes five minutes, preventing duplicate concurrent generation while still recovering abandoned jobs.

## Error Handling

Provider HTTP status and sanitized provider error codes are retained in existing diagnostics. API keys, authorization headers, and raw secret configuration are never logged. Failed generations remain retryable through the existing queue and do not publish incomplete posts.

## Verification

- Unit tests assert required headers, image request shape, multiline SSE parsing, and missing-image failure.
- Worker tests assert jobs younger than five minutes are not recovered.
- API tests and production build pass.
- Production environment uses the new base URL and rotated working key.
- A real generation produces a published post with a readable PNG and a public Motivation URL.

# Motivation Provider Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the production Motivation worker generate text and PNG images reliably through `r-api.vibemod.pro` and publish a complete post without duplicate concurrent jobs.

**Architecture:** Keep provider integration inside `MotivationGenerationService`, align its HTTP contract with the verified local Responses script, and strengthen SSE parsing. Extend the worker stale threshold beyond the provider timeout and update production configuration without committing secrets.

**Tech Stack:** NestJS, TypeScript, Jest, OpenAI-compatible Chat Completions and Responses APIs, Dokploy.

## Global Constraints

- Use controller model `gpt-5.5`; never put `gpt-image-*` in the Responses `model` field.
- Keep API keys only in environment configuration.
- Preserve existing post persistence, uniqueness, retry, S3 upload, and publishing flow.
- A post cannot publish without a valid PNG.

---

### Task 1: Provider request contract

**Files:**
- Modify: `apps/api/src/modules/motivation/motivation-generation.service.ts`
- Test: `apps/api/src/modules/motivation/motivation-generation.service.spec.ts`

**Interfaces:**
- Consumes: existing `ConfigService` Motivation environment variables.
- Produces: unchanged `generateText()` and `generateImage()` behavior with provider-compatible requests.

- [ ] Add failing tests that assert `User-Agent`, image tool options, `tool_choice`, and `store: false`.
- [ ] Run the focused Jest spec and confirm the new assertions fail.
- [ ] Add the minimal request headers and verified Responses payload.
- [ ] Run the focused Jest spec and confirm it passes.

### Task 2: Robust SSE image extraction

**Files:**
- Modify: `apps/api/src/modules/motivation/motivation-generation.service.ts`
- Test: `apps/api/src/modules/motivation/motivation-generation.service.spec.ts`

**Interfaces:**
- Consumes: streamed SSE response text.
- Produces: final base64 PNG bytes or a sanitized generation error.

- [ ] Add failing tests for multiline SSE data, `[DONE]`, nested `image_generation_call.result`, and missing images.
- [ ] Run the focused Jest spec and confirm failures.
- [ ] Parse SSE by blank-line event boundaries and recursively collect supported image results.
- [ ] Validate decoded PNG signature before returning bytes.
- [ ] Run the focused Jest spec and confirm it passes.

### Task 3: Duplicate-job prevention

**Files:**
- Modify: `apps/api/src/modules/motivation/motivation-worker.service.ts`
- Test: existing Motivation worker Jest spec or nearest worker test file.

**Interfaces:**
- Consumes: `generationStartedAt` timestamps.
- Produces: recovery only for jobs stale by at least five minutes.

- [ ] Add a failing test proving a three-minute active image generation is not requeued.
- [ ] Run the focused worker test and confirm failure.
- [ ] Change the stale threshold from two minutes to five minutes.
- [ ] Run the focused worker test and confirm it passes.

### Task 4: Local verification

**Files:**
- Verify: `apps/api`

**Interfaces:**
- Consumes: completed Tasks 1-3.
- Produces: test and build evidence.

- [ ] Run all Motivation API tests.
- [ ] Run the complete API Jest suite.
- [ ] Run the API production build.
- [ ] Review `git diff` for secrets and unrelated changes.

### Task 5: Production configuration and deployment

**Files:**
- Modify: `portal/docker-compose.dokploy.yml` fallback URL only if it is part of the deployed source.
- Configure: Dokploy `MOTIVATION_AI_BASE_URL=https://r-api.vibemod.pro/v1` and the working rotated key.

**Interfaces:**
- Consumes: verified branch revision and environment values.
- Produces: healthy production API and Motivation worker.

- [ ] Push the verified code revision to `codex/motivation-production`.
- [ ] Update the active Dokploy patch pin and Motivation environment configuration without exposing the key.
- [ ] Deploy and wait for healthy API, web, Postgres, and Redis containers.
- [ ] Inspect sanitized deployment and runtime logs.

### Task 6: End-to-end generation proof

**Files:**
- Verify: production Motivation API, S3 object, and public page.

**Interfaces:**
- Consumes: deployed worker and a test generation job.
- Produces: one published Motivation post with text and valid PNG.

- [ ] Trigger one Motivation generation through the existing supported endpoint or worker path.
- [ ] Confirm the job reaches `published` and has no generation error.
- [ ] Fetch the generated image and verify HTTP success plus PNG signature.
- [ ] Open the public post and verify image and text render.
- [ ] Record the public URL and sanitized evidence.

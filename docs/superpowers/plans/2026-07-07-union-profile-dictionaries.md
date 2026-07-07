# Union Profile Dictionaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace comma-separated Union profile fields with dictionary-backed chip/tag selection while preserving the current string-array API.

**Architecture:** Keep `UnionProfile.languages/skills/interests/values` as `String[]` and implement MVP dictionaries in frontend code. Add a reusable client `UnionTagPicker` component and wire it into the existing `UnionProfileForm`; `familyStatus` becomes a select with fixed values.

**Tech Stack:** Next.js App Router, React client components, TypeScript, Tailwind CSS, NestJS API accepting existing shared DTOs, Prisma unchanged for this MVP.

## Global Constraints

- Do not add Prisma dictionary models in this MVP; PLAN.md marks that as next version.
- Preserve existing `PUT /union/profile` payload shape: `languages`, `skills`, `interests`, `values` remain `string[]`.
- Custom options must be saved in the Union profile arrays.
- Do not break Union recommendations, privacy, connection requests, chat, or self-identification.
- Keep edits focused and do not revert existing dirty workspace changes.

---

### Task 1: Frontend dictionaries and tag picker

**Files:**
- Create: `apps/web/src/components/union/dictionaries.ts`
- Create: `apps/web/src/components/union/union-tag-picker.tsx`

**Interfaces:**
- Produces `UnionTagOption`, `UnionSkillCategory`, and exported constants for languages, skills, interests, values, family statuses.
- Produces `<UnionTagPicker label selected options onChange allowCustom placeholder helperText />`.

- [x] Create dictionary constants with values from PLAN.md 15.14.
- [x] Create a client chip/tag picker with popular options, search, selected chips, empty state, and custom add button.
- [x] Keep selected values as strings to preserve API compatibility.

### Task 2: Wire picker into Union profile form

**Files:**
- Modify: `apps/web/src/components/union/union-profile-form.tsx`

**Interfaces:**
- Consumes dictionaries and `UnionTagPicker` from Task 1.
- Produces unchanged `UnionProfileUpdateRequest` payload.

- [x] Replace comma-separated local text state with `Record<ListFieldKey, string[]>`.
- [x] Render languages/interests/values via `UnionTagPicker`.
- [x] Render skills by category through `UnionTagPicker` with grouped helper text.
- [x] Replace `familyStatus` free text input with select.
- [x] Submit arrays directly without `splitList`.

### Task 3: Plan status and verification

**Files:**
- Modify: `PLAN.md`

**Interfaces:**
- Checklist in section 15.14 reflects implemented MVP items.

- [x] Mark completed MVP checklist items that this patch satisfies.
- [x] Run `pnpm lint`.
- [x] Run `pnpm build`.
- [x] If API/shared touched unexpectedly, run Prisma validate/generate; otherwise note not needed.

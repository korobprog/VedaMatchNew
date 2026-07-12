# Motivation Admin Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add discoverable administrator controls for daily Motivation generation and per-post regeneration.

**Architecture:** Extend only the authenticated admin DTO with generation diagnostics. Render controls in a focused client component that calls existing API endpoints, refreshes server data, and polls while work is active.

**Tech Stack:** NestJS, Prisma, Next.js App Router, React, TypeScript, Jest, Vitest.

## Global Constraints

- Keep public Motivation DTOs and feed behavior unchanged.
- Permit `admin` and `service-admin` for Motivation administration.
- Never expose provider credentials.

---

### Task 1: Admin diagnostics DTO

**Files:**
- Modify: `packages/shared/src/motivation.ts`
- Modify: `apps/api/src/modules/motivation/motivation.service.ts`
- Test: `apps/api/src/modules/motivation/motivation.service.spec.ts`

- [ ] Add a failing test for status, stage, error, and attempts.
- [ ] Add `MotivationAdminPostDto` and map diagnostics in `adminList`.
- [ ] Run focused API tests.

### Task 2: Admin controls component

**Files:**
- Create: `apps/web/src/components/motivation/motivation-admin-controls.tsx`
- Create: `apps/web/src/components/motivation/motivation-admin-controls.spec.tsx`
- Modify: `apps/web/src/app/admin/motivation/page.tsx`

- [ ] Test daily generation and per-post regeneration requests.
- [ ] Test disabled state, inline errors, and active-work polling.
- [ ] Implement controls using credentialed fetch and `router.refresh()`.
- [ ] Render diagnostics and actions from the server page.

### Task 3: Admin navigation

**Files:**
- Modify: `apps/web/src/components/header.tsx`
- Test: `apps/web/src/components/header.spec.tsx`

- [ ] Test Motivation visibility for admin and service-admin.
- [ ] Add the `/admin/motivation` navigation link.
- [ ] Preserve `/admin/users` as admin-only.

### Task 4: Verification and deployment

**Files:**
- Verify: API and web workspaces.
- Configure: Dokploy API and web pins.

- [ ] Run focused tests, full suites, and production builds.
- [ ] Review diff and scan for secrets.
- [ ] Commit and push the production branch.
- [ ] Update Dokploy pins, redeploy, and verify controls in an authenticated browser.

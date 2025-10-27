# Repository Guidelines

## Project Structure & Module Organization
Source code lives under `src/`, with feature UI in `src/app`, domain logic in `src/domain`, and server utilities in `src/server`. Shared test helpers sit in `src/test`, and Playwright scenarios in `e2e/`. Supporting assets reside in `public/`, documentation drafts in `docs/`, experimentation notebooks in `metrics/`, and automation helpers in `scripts/` and `plans/`. The path alias `@` resolves to `src/`; prefer it over relative imports to keep layering explicit.

## Build, Test, and Development Commands
Use `pnpm dev` for the live Next.js server and `pnpm build` followed by `pnpm start` to exercise the production bundle. Run `pnpm lint` (wraps `eslint . --max-warnings=0`) before commits to satisfy the ESLint gate. `pnpm test` executes the Vitest suite headlessly, while `pnpm test:ui` opens the Vitest inspector for debugging. Spin up browser checks with `pnpm e2e` (Playwright). Workflow scripts include `pnpm plan:validate` for YAML plan sanity, `pnpm index:build` → `pnpm embed:build` to refresh retrieval assets, and `pnpm review:check` to compare new embeddings against what is already tracked.

## Coding Style & Naming Conventions
Write TypeScript and JSX with two-space indentation and prefer functional React components. ESLint inherits `eslint-config-next` plus repo rules that forbid `any`, reject `// @ts-ignore`, and block `console.log`—use structured loggers instead. Name files by feature (e.g., `todoCard.tsx`) and colocate tests next to the code or under `src/test` with `.test.ts` suffixes. Tailwind classes are acceptable in JSX; keep class lists ordered by layout → visual tweaks for readability.

## Testing Guidelines
Vitest runs in a JSDOM environment with `src/test/setup.ts` configuring globals; add mocks there when needed. Target high-value coverage and verify with `pnpm test -- --coverage` before merging critical changes. End-to-end flows belong in `e2e/` using Playwright test naming (`*.spec.ts`). Keep fixtures deterministic; reset data via helpers in `scripts/` when a scenario mutates shared state.

## Commit & Pull Request Guidelines
Follow the existing imperative, sentence-case commit style (e.g., "Add todo toggle handler"). Each pull request should describe the problem, highlight major code paths, and list validation commands run. Link related plans or issues, and attach screenshots or terminal excerpts when UI or CLI output changes. If RAG artifacts move, note the new index footprint and confirm `pnpm index:build`, `pnpm embed:build`, and `pnpm review:check` all pass locally.

## Agent-Specific Tips
Network access is restricted; prefer local assets and document any external data needs early. Default to replying in Japanese unless stakeholders request another language. Before destructive operations, call out the intent and wait for approval. When troubleshooting, share concise log excerpts and the next diagnostic step so collaborators can respond quickly.

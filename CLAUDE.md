# Flori prototype — Claude conventions

## Deploy

Cloudflare Pages, manual:

```bash
npx vite build && npx wrangler pages deploy dist --project-name flori-prototype
```

Only deploy when explicitly asked. "Push" by default means git commit + push only.

## Verification

Before each push: `npx tsc --noEmit` clean, `npx vite build` clean. No tests in this repo yet.

## Pointers

- **`docs/architecture.md`** — full system overview (STT → LLM → TTS pipeline, viseme mapping, emotion sync, Safari/iOS workarounds, future work). Always read first when touching unfamiliar areas.
- **Global style rules** — `~/.claude/CLAUDE.md` covers brace spacing, arrow-fn parens, ternary layout, JSX layout, props ordering, exports, section dividers, component + hook layout, lodash usage. This file only documents flori's project-specific bits.

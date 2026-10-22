---
name: haroteru-fullstack-delivery
description: Full-stack implementation guidance for サブスク払ろてる. Use when making code changes across Next.js and Supabase, deciding where logic belongs, updating auth or env handling, or checking repo-specific security and verification steps.
---

# Haroteru Fullstack Delivery

## Goal

`サブスク払ろてる` を Next.js + Supabase の既存構成に沿って安全に変更するための実装ガイドです。

## Boundaries

- Frontend routes / layouts: `frontend/src/app`
- Frontend feature UI / hooks / API calls: `frontend/src/features`
- Frontend shared base: `frontend/src/shared`, `frontend/src/providers`
- Supabase schema / policies / RPC: `supabase/migrations/`
- Runtime public env delivery: `frontend/src/app/api/runtime-config/route.ts`, `frontend/src/lib/public-env.ts`

新しい機能は、frontend ではまず `features` に閉じ込め、データ責務は Supabase の schema / RLS / RPC と client 実装に分けることを優先します。

## Change Rules

- Todo アプリ由来の概念を残さない
- サブスク管理ドメインに沿わない概念を持ち込まない
- 課金関連は削除ではなく「非表示かつ復帰しやすい状態」を優先する
- 実装や運用ルールを変えたら、必要に応じて `README.md`、`AGENTS.md`、関連 skill も更新する
- ローカル開発の env 変更は、可能な限り image rebuild ではなく container restart で反映できる構成を優先する

## Auth And Security

- Supabase Auth、`signInWithOAuth`、`callbackUrl` を触るなら open redirect を疑う
- `callbackUrl` はアプリ内相対パスだけを許可する
- `NEXT_PUBLIC_*` に秘密情報を入れない
- client component から server-only な auth 設定を直接 import しない
- Google OAuth callback、Supabase Auth の URL Configuration、`NEXT_PUBLIC_SITE_URL` を揃える
- OAuth callback や redirect の origin は `0.0.0.0` を公開 URL に使わず、ローカルでは `localhost` に正規化して扱う
- auth 失敗は「資格情報不正」と「到達不能」を分ける
- Google 連携変更時は `/privacy` とアプリ内 disclosure も更新する
- RLS と redirect URL 制限を security の中心に置く

## Env Handling

- server 側の env は `process.env` で扱ってよいが、client 側の `NEXT_PUBLIC_*` は build 時に埋め込まれる前提を意識する
- client で restart 反映を必要とする公開 env は runtime 配信を優先し、既存の `frontend/src/app/api/runtime-config/route.ts` と `frontend/src/lib/public-env.ts` に寄せる
- Docker では `.env.local` を build context にコピーして固定化するより、起動時読み込みや volume mount を優先する
- `NEXT_PUBLIC_SITE_URL` のローカル値は `http://localhost:3000` を基準に揃える

## Inspect First For Auth / Security Work

- `frontend/src/app/auth/signin/page.tsx`
- `frontend/src/components/auth/SignInButton.tsx`
- `frontend/src/lib/public-env.ts`
- `frontend/src/lib/utils.ts`
- `frontend/src/app/api/runtime-config/route.ts`
- `frontend/src/app/api/auth/callback/route.ts`
- `frontend/next.config.js`
- `frontend/Dockerfile`
- `docker-compose.yml`
- `supabase/migrations/`
- `.github/workflows/ci.yml`
- `README.md`

## Typical Workflow

1. 必要なら `haroteru-product` skill で前提を確認する
2. 影響範囲を `frontend` / `supabase` / `docs` で切り分ける
3. UI と Supabase schema / client 呼び出しを機能単位で揃える
4. auth / env / domain 変更では security を先に確認する
5. env 変更が client build-time 注入か runtime 注入かを先に切り分ける
6. 必要なら migration、`README.md`、`AGENTS.md`、関連 skill を更新する
7. `supabase/config.toml` を変えたら `npx supabase stop && npx supabase start` の必要性も案内する
8. frontend は `npm run type-check` と `npm test`、必要に応じて `npm run lint` と `docker compose build frontend` で確認する

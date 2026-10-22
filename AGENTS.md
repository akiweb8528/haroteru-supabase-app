# Haroteru Agents Guide

## Product Shape

- `サブスク払ろてる` は、登録なしですぐ使えるサブスク支出ダッシュボード
- 主役は「支出の把握」と「見直しのきっかけ作り」
- ログインは必須機能ではなく、同期のための追加価値
- 家計簿化しすぎず、軽さ・速さ・親しみやすさを保つ

## Architecture

- Frontend: Next.js App Router in `frontend/`
- Backend: Supabase (Auth + PostgreSQL + RLS + RPC)
- DB migrations: `supabase/migrations/`
- Frontend UI / hooks / feature API は `frontend/src/features` を優先
- `frontend/src/app` にはルーティングとページ entry を置く
- Supabase クライアント: `frontend/src/lib/supabase/` (client / server / middleware)
- public runtime env の配布は `frontend/src/app/api/runtime-config/route.ts` と `frontend/src/lib/public-env.ts` を起点に扱う

## Current Domain Rules

- subscription は管理対象のサブスク項目
- `locked` は継続前提で固定したい項目
- ゲスト利用時のデータはブラウザ保存
- Google ログイン時のみサーバー同期を有効化
- 課金機能は将来復帰しやすい形で非表示にしておく

## UX Rules

- 1 画面で状況把握しやすいことを優先
- 初見ユーザーでもすぐ入力できることを重視
- テキストは `simple` / `ossan` の 2 テイストを壊さない
- 似た役割の UI は見た目と見出しを明確に分ける

## Auth And Security

- `callbackUrl` は相対パスだけを許可する
- auth 失敗は「資格情報不正」と「到達不能」を分ける
- `NEXT_PUBLIC_*` に秘密情報を入れない（Supabase anon key は公開用のため OK）
- client component から server-only な auth 設定を直接 import しない
- Supabase Auth の Google OAuth callback と `NEXT_PUBLIC_SITE_URL` を揃える
- OAuth redirect や callback で `request.url` の `origin` を使うときは、開発環境の `0.0.0.0` をそのまま返さず `localhost` へ正規化する
- Google 連携変更時は `/privacy` とアプリ内 disclosure も更新する
- RLS ポリシーで `auth.uid()` によるデータアクセス制御を行う

## Env And Docker

- ローカル Docker では `.env.local` を build 時に焼き付けず、コンテナ起動時に読み込む
- `.env.local` を変更したら、通常は `docker compose restart frontend` で反映できる状態を保つ
- client component で参照する公開 env は `process.env.NEXT_PUBLIC_*` を直接増やさず、runtime 配信の設計を優先する
- `NEXT_PUBLIC_SITE_URL` はローカルでは `http://localhost:3000` を基準にし、`http://0.0.0.0:3000` を公開 URL として扱わない
- `supabase/config.toml` を変えた場合は `npx supabase stop && npx supabase start` が必要になることを前提に扱う

## Verification

- Frontend: `cd frontend && npm run lint && npm run type-check && npm test`
- UI 変更は mobile での見え方とスクロール位置も確認する
- env / Docker 変更時は `docker compose build frontend` が通ることと、`.env.local` 更新後に `docker compose restart frontend` で反映されることを確認する
- 実装や運用ルールを変えた場合は、必要に応じて `README.md`、`AGENTS.md`、関連 skill へ反映する

## Git Workflow

- デプロイ確認は `main` ブランチ連携の Vercel 本番 URL を基準にする
- ブランチ運用を追加する場合も、現時点では `staging` 前提を持ち込まない

## Skills

- `skills/haroteru-product`: プロダクト前提、用語、UX の判断基準
- `skills/haroteru-fullstack-delivery`: 実装配置、変更規律、認証とセキュリティ確認

## UI quality gate

For UI design, changes (including copy-only and small layout/CSS fixes), reviews, and UI work instructions, read [QUAL-002](https://github.com/akiweb8528/akiweb8528-knowledge/blob/main/knowledge/quality/interface-design.md) P2 / D7–D9 from current `main` through authorized GitHub access or a current checkout. This route does not require installed Global Skills.

Judge operation understanding together with the product's composition, presentation, world and information hierarchy. Remove redundant explanations; first improve visual hierarchy, placement, state and feedback where guidance is missing. When that conflicts with a more important product experience, use fitting assistance, including text. Preserve necessary labels, conditions and consequences. If the source is unavailable, report it unread and retain these acceptance conditions.

Check affected rendered states and real interactions, revise inadequate candidates and repeat the same path before adoption. For instruction authoring, use [PROMPT-001](https://github.com/akiweb8528/akiweb8528-knowledge/blob/main/knowledge/workflows/knowledge-to-instructions.md) to turn the product's priorities into completion criteria and verification; do not claim the UI was tested. Keep checks within the affected flow and exclude work with no UI impact.

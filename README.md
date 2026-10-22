# サブスク払ろてる with Supabase

https://github.com/akiweb8528/haroteru-app

サブスク払ろてるを Next.js + Supabase 構成で動かすためのリポジトリです。

サブスク払ろてるは、登録なしですぐ使える「サブスクの軽量ダッシュボード」です。

サブスクって、払いたいから払っている。
だから別に、悪いことじゃない。
でも、「結局いくら払ってるんだっけ？」と、ふと確認したくなる。

このアプリは、必要なサブスクも、なんとなく続いているサブスクも、まとめて把握するためのものです。
ロックして残しておきたいものと、見直し候補を同じ一覧で管理できます。

## 実装範囲

- 登録なしでローカル保存してすぐ使える
- Googleサインインで同期できる
- サブスクの追加、編集、削除ができる
- 月額 / 年額ベースで支出の目安を一覧できる
- ロック状態とカテゴリで整理できる
- テーマ設定、アバター設定を保持できる

課金機能は実装準備はしていますが、この段階では非表示です。

## アーキテクチャ

- Frontend: Next.js App Router + TypeScript
- Backend: Supabase (Auth + PostgreSQL + RLS + RPC)
- Auth: Supabase Auth (Google OAuth)
- DB migrations: `supabase/migrations/`
- Storage strategy:
  - ゲスト利用時はブラウザの localStorage
  - ログイン利用時は Supabase PostgreSQL（RLS でユーザーごとに分離）

### フロントエンド構成

- `frontend/src/app`: ルーティング、レイアウト、メタデータ
- `frontend/src/features/subscriptions`: サブスク管理の UI / hooks / API 呼び出し
- `frontend/src/features/account`: 設定画面、ユーザー情報取得
- `frontend/src/lib/supabase/`: Supabase クライアント (client / server / middleware)
- `frontend/src/providers`: セッション、テーマ、表示設定

### AI 開発構成

- `AGENTS.md`: このリポジトリ全体で共有する最小ルール。プロダクトの形、責務分離、UX / auth / security の判断基準を記載
- `CLAUDE.md`: `AGENTS.md` を指すシンボリックリンク。Claude Code 側から同じガイドを参照するために利用
- `skills/`: repo 専用 skill 群。各 skill の詳細は配下の `SKILL.md` を参照
- `.codex/skills`: `skills/` を指すシンボリックリンク。Codex 側から repo 専用 skill を読み込むために利用
- `.claude/skills`: `skills/` を指すシンボリックリンク。Claude Code 側から repo 専用 skill を読み込むために利用

## 開発用環境変数

`.env.example` をコピーして `.env.local` を作成・更新してください。

最低限必要なもの:

- `NEXT_PUBLIC_SUPABASE_URL`: http://127.0.0.1:54321
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: （起動時や `supabase status` で表示された sb_publishable_...）
- `NEXT_PUBLIC_SITE_URL`: フロントエンドの公開 URL（OAuth callback に使用）
- `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID`
- `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET`

## 起動

推奨の開発環境は Dev Container です。

1. Docker Desktop を起動する
2. VS Code で `Dev Containers: Reopen in Container` を実行する
3. 起動後は `.devcontainer/post-start.sh` が自動実行され、`.env.local` を `.env` に同期したうえで frontend に加えて `http://127.0.0.1:54321` のローカル Supabase Auth / DB も立ち上がる
4. マイグレーションは `npx supabase db push --local` まで自動適用される

主な起動先:

- Frontend: `http://localhost:3000`
- Supabase API / Auth: `http://127.0.0.1:54321`

## Supabase セットアップ

### ローカル開発

Dev Container では起動時に自動実行されます。手動でやり直す場合だけ、Supabase CLI を使ってローカル環境を起動します。

```bash
cp .env.local .env
npx supabase start
npx supabase db push --local
```

Google OAuth の client ID / secret や `supabase/config.toml` の auth 設定を変えた場合は、`npx supabase stop && npx supabase start` で Auth コンテナを再起動してください。

### 共有環境

Supabase ダッシュボードでプロジェクトを作成し、`supabase/migrations/` 配下のマイグレーションを適用してください。

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push
```

Google OAuth を使う場合は、Supabase の Authentication > Providers > Google で設定し、Google Cloud Console に以下を追加してください。

- Authorized JavaScript origins: frontend の公開 URL
- Authorized redirect URIs: `https://<supabase-project>.supabase.co/auth/v1/callback`

また、Supabase の Authentication > URL Configuration で `Site URL` と `Redirect URLs` を frontend の公開 URL に合わせてください。
ローカル開発では少なくとも以下を揃えてください。

- `Site URL`: `http://localhost:3000`
- `Redirect URLs`: `http://localhost:3000/api/auth/callback`
- `Authentication > Providers > Google`: `Enable sign in with Google` を ON

## デプロイ

### Frontend（Vercel）

frontend は Vercel にデプロイします。Vercel 側で設定する主な env は次のとおりです。

- `NEXT_PUBLIC_SUPABASE_URL`: Supabase プロジェクトの URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase の anon key
- `NEXT_PUBLIC_SITE_URL`: frontend の公開 URL
- `NEXT_PUBLIC_GA_MEASUREMENT_ID`: Google Analytics の Measurement ID（任意）
- `NEXT_PUBLIC_APP_ENV`: `production`

このリポジトリでは、`main` ブランチへの push をそのまま Vercel 本番デプロイに使う前提です。

- 確認先: `https://haroteru-supabase-app.vercel.app`
- OAuth の `Site URL` / `Redirect URLs` もこの URL に揃えてください

## CI / CD

GitHub Actions の CI は `.github/workflows/ci.yml` で管理しています。

- 対象ブランチ: `main`
- frontend: `npm ci`, `npm run type-check`, `npm test`

CD は Vercel の Git 連携を使い、`main` への反映後に本番 URL が更新される想定です。

基本運用:

1. ローカルで確認する
2. `main` に push する
3. Vercel で `https://haroteru-supabase-app.vercel.app` を確認する

## フロントエディタエラー解消

フロントエンドの依存関係は Dev Container 作成時に自動インストールされるため、`next` / `react` / `@types/*` 未導入が原因のエディタエラーは基本的に Dev Container で解消できます。

依存関係を入れ直したい場合だけ、Dev Container 内で次を実行してください。

```bash
cd frontend && npm install
```

## ライセンス

元のソースコードは MIT License です。詳細は `LICENSE` を参照してください。

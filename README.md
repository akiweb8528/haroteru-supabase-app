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

推奨の開発環境は Dev Container です。Node.js は **24.22.1** を基準に揃えています。Docker の builder / runner / 開発用イメージは `node:24.22.1-alpine`、Dev Container の Node feature と CI は `24.22.1` 固定です。`frontend/package.json` は Node.js `>=24.22.1 <25` を要求します。

既存の Dev Container は再作成し、`node --version` が `v24.22.1` であることを確認してください。ホストで実行する場合はリポジトリ直下の `.nvmrc` を読み、fnm なら `fnm install && fnm use`、nvm なら `nvm install && nvm use` で同じバージョンを使用します。

```bash
nvm install
nvm use
cd frontend
npm ci
npm run lint
npm run type-check
npm test
npm run build
```

1. `.env.example` から `.env.local` を作成し、ローカル Supabase 用の値を設定する
2. Docker Desktop を起動する
3. VS Code で `Dev Containers: Reopen in Container` を実行する
4. 起動後は `.devcontainer/post-start.sh` が自動実行され、`.env.local` を `.env` に同期したうえで frontend に加えて `http://127.0.0.1:54321` のローカル Supabase Auth / DB も立ち上がる
5. マイグレーションは `npx supabase db push --local` まで自動適用される

主な起動先:

- Frontend: `http://localhost:3000`
- Supabase API / Auth: `http://127.0.0.1:54321`

### Docker と環境変数

`docker compose build frontend` はリポジトリ直下を build context にして standalone 出力を作成します。`.dockerignore` でホストの依存・ビルド出力・環境変数ファイルを除外し、`.env.local` は起動時に読み取り専用でマウントします。ファイルを事前に作成してください。

```bash
docker compose build frontend
docker compose up -d frontend
docker compose exec frontend node --version
```

`.env.local` の変更後は `docker compose restart frontend` で entrypoint が読み直します。公開設定は `/api/runtime-config` から配信されるため、ブラウザを再読み込みして反映を確認してください。開発用の hot reload は `docker-compose.override.sample.yml` を `docker-compose.override.yml` にコピーして使用します。

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

OAuth の `callbackUrl` は、URL 正規化後も同じアプリの相対パスであることを検査します。`/.//evil.com` のように正規化で `//` 始まりになる入力は `/subscriptions` へ戻します。実際の Supabase URL Configuration と Google の設定は、デプロイ先で確認してください。

## デプロイ

### Frontend（Vercel）

frontend は Vercel にデプロイします。Vercel 側で設定する主な env は次のとおりです。

- `NEXT_PUBLIC_SUPABASE_URL`: Supabase プロジェクトの URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase の anon key
- `NEXT_PUBLIC_SITE_URL`: frontend の公開 URL
- `NEXT_PUBLIC_GA_MEASUREMENT_ID`: Google Analytics の Measurement ID（任意）
- `NEXT_PUBLIC_APP_ENV`: `production`

Vercel の Project Settings > Build and Deployment では、Root Directory が `frontend`（engine 宣言のある `package.json`）を参照することを確認し、Node.js Version も **24.x** に揃え、新規デプロイのビルドログで **24.22.1 以上の 24 系**が実際に選ばれたことを確認してください。Vercel が提供するパッチはプラットフォーム側で管理されます。リポジトリの更新だけで既存デプロイの実行時が置き換わるとは限らないため、設定確認後の再デプロイと本番 URL / OAuth callback の動作確認が必要です。

このリポジトリでは、`main` ブランチへの反映を Vercel 本番デプロイに使う前提です。

- 確認先: `https://haroteru-supabase-app.vercel.app`
- OAuth の `Site URL` / `Redirect URLs` もこの URL に揃えてください

## 認証済みの保存と同期

ログイン中の変更も、まず利用者別のブラウザ保存領域へ記録します。既存の `authenticated_subscriptions_sync_v1` と未送信操作を読み込み、データ消去を伴う移行は行いません。操作ごとに ID を付け、送信中の内容を変更せず、成功確認できた ID だけをキューから除きます。作成後のサーバー ID と後続の編集・削除は一度に保存します。

ゲストからの移行も、コピー先と元項目の対応を永続保存してこのキューへ渡します。コピー先の保存が成功した項目だけをゲスト保存から除き、途中の追加・編集・保存失敗では元データを保持します。

一覧取得は未同期の変更や個別操作の失敗があっても続けます。取得開始時のローカル revision を確認し、未同期の追加・編集・削除・並び替えを重ねて表示します。通信失敗時も一覧を残し、端末への保存済み件数と再試行を表示します。保存領域が使えない場合は保存成功として扱いません。

送信・一覧取得の待機は各 15 秒、自動送信は操作ごとに最大 5 回、待ち時間を空けて再試行します。上限後もデータを保持し、手動で再試行できます。同じ項目の後続操作は順番を守り、独立した項目は先行する個別失敗があっても同期します。サーバーが確実に拒否した操作は再編集・削除で修復し、結果不明の通信失敗は同じ操作 ID で再送します。

サーバー側は利用者・操作 ID ごとの実行済み台帳と変更を同じトランザクションで保存し、再送には初回の結果を返します。同じ ID で別の内容を送る要求は拒否します。台帳は削除済み項目への遅延再送にも必要なため、自動保持期限を設けず、アカウント削除時に削除します。容量は成功操作数に比例します。台帳を手動削除すると再送保護が失われます。

frontend の公開前に、対象 Supabase プロジェクトへ `20261022133855_authenticated_subscription_operations.sql` を適用してください。同期は新 RPC `apply_subscription_operation` を使用します。RPC が未配備でも直接 CRUD へ切り替えず、変更を端末に保持します。

検証範囲と移行時の限界は [認証・同期の検証記録](docs/auth-sync-validation.md) を参照してください。

## CI / CD

GitHub Actions の CI は `.github/workflows/ci.yml` で管理しています。

- 対象ブランチ: `main`
- frontend（Node.js 24.22.1）: `npm ci`, `npm run lint`, `npm run type-check`, `npm test`, `npm run build`

今回の Node.js 移行の実測結果と残確認は [検証記録](docs/node24-security-validation.md) を参照してください。

CD は Vercel の Git 連携を使い、`main` への反映後に本番 URL が更新される想定です。

基本運用:

1. ローカルで確認する
2. 作業ブランチを push し、`main` を base とする PR でレビューする
3. PR の merge 後に Vercel のデプロイ結果を確認する
4. Vercel で `https://haroteru-supabase-app.vercel.app` とログイン・同期を確認する

## フロントエディタエラー解消

フロントエンドの依存関係は Dev Container 作成時に自動インストールされるため、`next` / `react` / `@types/*` 未導入が原因のエディタエラーは基本的に Dev Container で解消できます。

依存関係を入れ直したい場合だけ、Dev Container 内で次を実行してください。

```bash
cd frontend && npm ci
```

## ライセンス

元のソースコードは MIT License です。詳細は `LICENSE` を参照してください。

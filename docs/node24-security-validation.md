# Node.js 24 セキュリティ更新の検証記録

確認日: 2026-10-22（JST）。対象は `origin/main` の `ca525e4a` から分離した作業ブランチ。

## バージョンと変更

- 基準: Node.js 24.22.1。Docker builder / runner / 開発イメージは `node:24.22.1-alpine`、Dev Container の Node feature と CI は `24.22.1` 固定。
- ホスト用 `.nvmrc` は `24.22.1`。`frontend/package.json` / lock の engine は `>=24.22.1 <25`。20.20.0 / 24.22.0 / 25.0.0 を拒否し、24.22.1 / 24.23.0 を許容することを確認。
- `@types/node` を 24 系へ更新。Next.js 14.2.35 / React 18 / Supabase SDK 2.103.0 は維持。
- standalone の画像最適化で必要な `sharp@0.35.5` を追加。ホストで native libvips 8.18.7 の読み込みと PNG resize を確認。
- Docker と CI のインストールは `npm ci --no-audit --no-fund` とし、応答しない npm audit endpoint に依存導入が左右されるのを避けた（監査結果は別記）。entrypoint に実行権を付与し、空の `public` ディレクトリを builder で作成。root の build context に `.dockerignore` を追加して、ホストの依存・出力・env 混入を防止。
- Compose に `.env.local` の読み取り専用 mount を追加し、開発 override の Dockerfile 参照を root context に揃えた。Dev Container の実行権なしスクリプトは `bash` 経由で起動。

## ホスト検証

WSL Linux x64、公式配布 Node.js v24.22.1 / npm 11.19.1（公式 SHASUMS と一致）を一時 toolchain で使用。

- `npm ci`、lint、型チェック、unit test（9 files / 60 tests）、production build 成功。
- production HTTP: `/` / `/api/runtime-config` は 200。公開 runtime 設定と no-store ヘッダーを確認。
- callback に code がない場合は、外部 `next` 値を与えても同一 origin のサインインエラーへ 307。未認証の `/subscriptions` はサインインへ 307。
- Chrome DevTools MCP の隔離ブラウザ context で、ゲストの追加（980円）→編集（1280円とメモ）→再読み込み後の保持→削除→再読み込み後の空配列を実入力で確認。公開 runtime env をブラウザで確認し、console error / warning は 0。使用ページを閉じてページ一覧で後片付けを確認。
- sharp を追加した最終 lock で `npm ci`、lint、型チェック、unit test（60件）、production build、native sharp の PNG resize とローカル Supabase の Auth / CRUD / RLS / RPC を再確認して成功。
- 最終依存で `npm run dev -- --port 3101` を起動し、`/` と `/api/runtime-config` の 200、公開 env の runtime 値を確認して停止。ホストに引き継がれた `DEBUG` で Next.js 14 が test mode となり registry 照会を待つ条件があったため、最終確認はこの検証プロセスだけ `DEBUG` / `NEXT_TEST_MODE` / `__NEXT_TEST_MODE` を除外した（global 設定は変更していない）。並列ビルド中の最終確認では Ready 15.1秒。

## Dev Container

宣言の読み取りだけでなく、設定から DevContainer CLI で実イメージをビルドし、そのイメージの `vscode` ユーザー・login shell で Node.js `v24.22.1` / npm `11.19.1` の実インストールを確認した。VS Code による全 postStart ライフサイクルの再現とは区別する。

## Docker / Compose

最終 lock / Dockerfile で builder・runner・開発イメージの build が成功。実際の `docker compose build frontend` と container 起動も成功し、HTTP `/` が 200。builder / runner / 開発イメージをそれぞれ実行して Node.js `v24.22.1` を確認。runner は非 root uid 1001、sharp 0.35.5 を実測した。画像最適化は `/_next/image?url=%2Ficon.png&w=64&q=75` が 64×64 の WebP を返すことまで確認した。

`.env.local` の APP_ENV と SITE_URL を変更し、image rebuild を行わず `docker compose restart frontend` だけで `/api/runtime-config` の新しい値と `no-store` を確認。entrypoint と公開 runtime 設定の読み込み経路が成立している。

ローカル callback は検証用 override の内部 PORT / 公開 port をともに 3100 に揃えた。既存 callback は request origin 由来のため、3100→3000 の異なる port マッピングでは内部 3000 へ戻る条件を確認した。通常の 3000→3000 契約は維持しており、callback 実装は変更していない。

## ローカル Supabase

Supabase CLI 2.121.0、PostgreSQL 17.11。`/tmp` の専用コピーと固有 project ID `haroteru-node24-verification` を使用。既存の 3 migration を適用し、ローカル発行キー・新規テストユーザーだけで確認した。Google provider はこの検証コピーで無効化した。

Node.js v24.22.1 から既存 SDK 2.103.0 で以下が成功:

- 2 ユーザーの signup / session / getUser / signOut
- profile 自動生成 trigger と own-profile の RLS
- subscription の追加・参照・編集・削除
- anon の行非表示、他ユーザーの read / update 非表示、偽 user_id の insert 拒否
- reorder RPC が自分の行だけを変更し、他ユーザーの行を変更しないこと
- テスト用 subscription / ユーザーは削除済み
- 最終 Docker Compose から、ローカル email OTP → Mailpit → PKCE code と verifier cookie → 実アプリ `/api/auth/callback` の code 交換 → session cookie 発行 → 認証済み `/subscriptions` HTTP 200 を確認。この専用 Auth ユーザーも削除済み

## 後片付け

SDK で Auth ユーザー・profiles・tracked_subscriptions がすべて 0 件であることを確認後、今回の専用 Compose project とローカル Supabase を停止し、専用 container / network / volume を削除した。Mailpit のローカルメールも専用 volume とともに除去。今回作成した `.env.local` と一時のキー・認可リンク情報を削除し、ホストの検証用サーバーは停止済み。既存プロジェクトや他セッションの container / データには操作していない。

## 既存の依存監査

sharp 追加前に実行した `npm audit --json` は critical 1 / high 23 / moderate 5（計29）を報告した。報告された全 package の該当バージョンが `origin/main` の lock と同じであることを機械照合した。Next.js 14 と既存の開発依存を含む警告は、この Node.js 更新だけで解消したとは扱わない。最終 lock の audit 再取得は npm registry の bulk advisory endpoint が timeout したため未取得。

追加した sharp 0.35.5 は、ホストと Alpine builder / 開発イメージで libheif 1.23.5 を読み込むことを確認。runner は standalone tracing により `versions.json` が省略されるため、同梱 `libvips.so` が builder / 開発イメージと同一 SHA-256 `979b625437190a1970b835164e0e30d47dc60159ce6a394ce78cc40cb9d59ab8` であることを照合した。[libheif の公式 advisory](https://github.com/strukturag/libheif/security/advisories/GHSA-g89c-p67h-r497) が示す修正版 1.23.2 以降であり、この native 原因の修正と Next.js の npm audit 残存警告は別に扱う。

## 既存の実行条件

`resolveSupabaseServerUrl` は loopback の Supabase URL を `host.docker.internal` に置き換える Docker 前提の実装であり、WSL ホストにこの DNS 名がない状態で server 側 Auth callback を実行すると到達できない。今回このルーティング実装は変更せず、callback は Compose の既存 `extra_hosts` 経路で検証する。ホストのゲスト利用と SDK の localhost 直結テストは上記の範囲で成功している。

## 本番に残る確認

- Vercel の実際の Project Settings の Node.js Version は未取得。Root Directory が engine 宣言のある `frontend` を参照することを確認し、設定を 24.x に揃え、反映後の build log / 実行時で 24.22.1 以上の 24 系を確認する必要がある。Vercel の patch はサービス側で管理される。
- 既存 deployment がリポジトリ更新だけで更新されるとは判断していない。本番設定確認・再デプロイ・公開 URL と Google OAuth callback / ログイン・同期の最終確認が必要。
- 本番設定の変更・本番デプロイ・main への push / merge は実施していない。
- 実 Google OAuth の成功往復は外部認証情報を使用しない条件のため未確認。ローカル Auth / session / RLS / DB は上記範囲で検証済み。

## 参照

- [Node.js 2026年10月セキュリティ修正](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases)
- [Node.js v24.22.1](https://nodejs.org/en/blog/release/v24.22.1/)
- [Vercel Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)
- [Next.js standalone image optimization / sharp](https://nextjs.org/docs/messages/sharp-missing-in-production)

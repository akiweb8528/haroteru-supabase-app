# 認証・同期の修正と検証

初回確認: 2026-10-22（JST）。台帳権限の追加確認: 2026-10-23（JST）。ローカル実行は Node.js 24.22.1、Go 版は Go 1.24.7、隔離 PostgreSQL 16 を使用しました。既存の保存データを消去せず、認証済みの同期キューと関連する認証経路を修正した記録です。

## 保持する条件

- 操作 ID と送信内容を固定し、成功確認した ID だけを除去する。送信中の編集・削除・並び替えを別操作として保持する。
- create の成功確認、仮 ID とサーバー ID の対応、後続操作の付け替えを同じブラウザ保存にまとめる。応答待ちの間に一覧へ現れたサーバー行は、保存した作成操作 ID と照合して仮項目との二重表示・二重集計を防ぐ。
- 一覧取得開始時の revision と現在値が違えば古い応答を採用しない。未同期操作は取得結果に重ね、失敗操作によって一覧取得を止めない。
- 同じ項目の操作と一覧全体の並び替えは順序を守る。独立した項目の失敗は別項目の同期を止めない。
- 送信時に所有者を固定し、ログイン変更後の利用者へ別ユーザーの操作を送らない。画面のローカル状態も利用者 ID に結び付ける。
- localStorage の既存 v1 キーを継続する。欠けている revision・再試行 metadata は既定値で読み、JSON 破損や保存失敗を空データ・保存成功に置き換えない。

再送は同じ ID を使います。サーバーは変更と実行済み台帳を同一トランザクションで保存し、同じ ID・同じ要求には初回結果を返します。異なる内容で同じ ID を使う要求は拒否します。成功応答の消失、部分成功、遅延した update/reorder の再送でも、後続の変更を再適用で巻き戻さない設計です。

自動送信は操作ごと最大 5 回、2 / 4 / 8 / 16 秒の間隔で再試行します。1 回の送信と一覧取得は各 15 秒で打ち切ります。1 回の処理は 100 操作までで区切り、残りは次の処理へ回します。待機中に再読み込みしても回数・時刻を保持し、上限後は一覧・変更・手動再試行を残します。明確なトランザクション拒否だけを識別し、訂正・削除で新しい操作に置き換えられます。通信結果が不明な操作を推測で削除・畳み込みしません。

Web Locks 対応ブラウザでは利用者別の送信ロックと、短時間の保存用ロックを分離します。ネットワーク待ち中も編集でき、別タブの保存・完了確認との競合を抑えます。非対応ブラウザでは同一タブ内の送信をまとめます。

## 再現テストと確認結果

修正前に URL 正規化、create 中の編集・削除、update 中の更新、reorder の書き換え、一覧応答による未同期変更の上書きで失敗を確認し、修正後に同じ経路が通ることを確認しました。

- storage: exact / 重複 / 先頭以外の完了確認、仮 ID 変換、後続編集・削除、一覧先行、古い drag snapshot、既存 v1、別ユーザー、破損・保存容量不足、確定拒否の訂正・削除。
- guest migration: queue への引き渡し、コピー先保存と source marker の同時保存、ack 後の再 import、コピー中の追加・編集、保存失敗・破損、ユーザー切替・別ユーザーへの再 import 拒否、移行待機中のログアウトと同アカウントへの再ログイン後の再開。
- runner / hook: 応答待ち中の編集・削除、個別失敗後の別項目、同 ID 再送、timeout、回数上限、再読み込み・オンライン復帰、認証変更、一覧取得中の新操作、一覧表示の継続。
- API / DB: mutation と台帳の atomic commit、rollback、別ユーザーの分離、同キー別内容の拒否、削除後の再送、後続更新後の古い再送、検証条件変更後の replay。

- Frontend: `npm run lint`、`npm run type-check`、`npm test`、`npm run build` を実行。全 156 件が通過。
- PostgreSQL 16: 最小 Auth fixture と全 4 migration を隔離 DB に適用。RPC・RLS の 28 確認（同一 create の並列 8 再送を含む）が通過。CI に同じ手順を追加。
- `supabase db advisors --type security` のローカル確認で新規対象の警告は 0 件。既存 `update_updated_at_column` / `reorder_subscriptions` の search_path 警告 2 件は今回の変更対象外。

## ブラウザで確認した範囲

Chrome DevTools MCP 1.11.0 の headless・isolated context で、実際の Dashboard / hook / storage を一時 Vite fixture から操作しました。認証状態と API 応答は fixture で置き換えており、実 Supabase Auth / PostgREST を通る E2E の確認ではありません。実入力で登録・編集し、応答保留・失敗を与え、mobile 390×844 の端末保存状態・カード継続・手動再試行・pending 0 / error null への回復を確認しました。横方向のはみ出しはありません。新規のアプリ例外はなく、既存フォームの name/id 指摘は別項目です。

作成した検証ページだけを閉じ、ページ一覧が既定の `about:blank` だけになったことを確認しました。画像の目視確認と、入力・状態遷移の確認は別に実施しています。

[390px 幅の同期失敗時の表示](evidence/auth-sync-mobile.png)では、失敗・端末内の保存・未同期件数・再試行を一覧の手前にまとめています。失敗後もカードと編集操作が残り、再試行で同じ内容が同期されることを確認しました。新しい画面は追加していません。

## デプロイと未確認事項

migration `20261022133855_authenticated_subscription_operations.sql` と `20261022161132_restrict_subscription_operation_receipts.sql` を、本番 frontend の切替前に対象プロジェクトへ順番に適用する必要があります。新 RPC がなければ端末の変更を保持して失敗を表示し、旧 API へ fallback しません。

2026-10-23 の再確認でも、認証済み Supabase 接続のプロジェクト一覧には対象がなく、`get_project(ygxzrboehkttznriemna)` は `Project not found` でした。本番 Vercel の `/api/runtime-config` が返す `https://ygxzrboehkttznriemna.supabase.co` も、Google / Cloudflare の DNS over HTTPS で NXDOMAIN となり、Auth / REST の読取確認に到達できませんでした。プロジェクトの削除・停止は断定していません。

本番スキーマ・migration 履歴・適用権限を確認できないため、本番への SQL 適用は実施していません。別プロジェクトへの代替適用も行わず、PR #3 は Draft のまま main への切替を保留しています。先行 migration の適用履歴が不明なため原本 SQL を変更せず、後続 migration を追加しました。

実際の Vercel / Render の環境変数・秘密鍵・Google OAuth 認証は、この確認だけでは検証できていません。コードや設定例の安全性から、本番の設定が正しいとは判断していません。

今回の E2E 全体再実行では、成功応答の消失後にサーバー行と仮項目が一時的に二重表示される失敗も検出しました。サーバーに作成操作 ID を保持し、ACK 前の一覧でも対応する仮項目を優先する修正と、編集・削除・集計・別操作の同内容項目を区別する回帰を追加しました。

旧実装がすでに送信して成功応答を失っていた create には、サーバーの実行済み台帳がありません。その履歴を新実装から遡って一意に照合することはできません。既存の未送信操作は保持しますが、この移行以前の不明な成功について重複防止を保証しません。旧版を開いたままの別タブも新しい保存ロックに参加しません。

RPC の新規要求は payload 128 KiB を上限とし、超過時は台帳を作らず拒否します。すでに成功した同じ操作は先に台帳を確認して返すため、後から検証条件が変わっても再適用しません。

台帳に自動 TTL は設けていません。無期限のオフライン再送と、削除後の遅延再送を保護するためです。容量は成功操作数に比例し、利用者削除時に cascade で削除します。ロールバック時も台帳・利用者データを消去しません。localStorage が上限に達した場合は新しい保存を失敗として返し、既存保存は保持します。料金・本番 CPU・本番 DB 容量は計測していません。

## 台帳権限の修正と追加検証（2026-10-23）

認証済み利用者が自身の操作 ID で成功台帳を直接 INSERT できる権限を撤回しました。台帳の直接 SELECT / INSERT / UPDATE / DELETE は `anon` / `authenticated` とも禁止しています。台帳を作る関数に任意の成功結果は渡せず、正規のデータ変更と生成した応答の保存が一つのトランザクションで成功した場合だけ確定します。

公開 `apply_subscription_operation` は `SECURITY INVOKER` の互換 wrapper とし、処理本体を公開対象外の `subscription_sync_private` に移しました。本体だけが専用の `haroteru_subscription_executor` を所有者とする `SECURITY DEFINER` です。このロールは NOLOGIN / NOINHERIT / NOBYPASSRLS / 非 superuser で、両テーブルを所有しません。台帳は SELECT / INSERT、サブスクは必要な列の INSERT / UPDATE と SELECT / DELETE だけを許可し、所有者の付け替え・台帳の改ざん・profile へのアクセスは許可しません。

処理中も `auth.uid()` と RLS が有効です。`search_path = pg_catalog, pg_temp`、`row_security = on`、既存の 5 秒 lock timeout を固定し、匿名の EXECUTE を禁止しました。`authenticated` に非公開処理の EXECUTE / schema USAGE は必要ですが、同じ所有者確認と原子的処理しか呼べず、PostgREST の公開 schema は `public` / `graphql_public` のままです。旧 `reorder_subscriptions` も同じ signature を保持して `SECURITY INVOKER`・固定 `search_path`・schema 修飾済みテーブル・認証済み利用者だけの EXECUTE に変更しました。

- Node.js 24.22.1: lint / type-check / 全 156 unit tests / production build が成功。PostgREST が `P0002` を HTTP 500 で返す場合も確定拒否に変換する fixture へ更新しました。
- PostgreSQL 16.15: 専用 cluster で全 5 migration を適用。非 superuser / CREATEROLE の migration runner でも所有者移譲と一時権限の撤回が成功しました。PostgreSQL 16 が作る admin-only membership は、その runner だけに許可し、SET / INHERIT がないこととクライアントからの直接・間接 membership がないことを検査しています。
- SQL 回帰: 認証・匿名の偽 INSERT / UPDATE / DELETE 拒否、他利用者の結果・データ分離、正規 CRUD / 並び替え、同 ID 再送・別内容拒否、データ変更途中と台帳 INSERT の失敗の rollback、アカウント削除の cascade を確認しました。
- 新規接続で、同名の TEMP テーブルと `uuid` / `jsonb` domain を先に作った状態でも、正規 RPC と旧並び替え API が本来のテーブルへだけ作用することを確認しました。
- create / update / reorder / delete ごとに 8 並列再送（計 32 要求）を実行し、作成 1 行、台帳 4 件、同じ作成 ID の保持と削除完了を確認しました。
- security advisors: 新規対象の警告は 0 件。既存 `public.update_updated_at_column` の search_path 警告 1 件が残ります。
- PostgREST 16.5: 公開 schema と署名 JWT を使った [HTTP 検証 30 項目](evidence/operation-receipts-http.json) が成功。台帳の POST / PATCH / DELETE / GET 拒否、非公開 schema の 406、正規 RPC・同 ID 再送・並列 8 create・他利用者分離・rollback・削除後の遅延再送を実測しました。これはローカル Auth schema fixture とテスト用署名 JWT による検証で、実 Supabase Auth / Google OAuth や本番 DB の検証ではありません。

CI にも非 superuser migration、移行前から存在するデータ・台帳の保持、一時オブジェクト対策と 32 並列要求を追加しました。先行 migration が既に配備されていた場合、権限撤回だけでは過去の偽台帳を正規台帳と区別できません。本番接続の復旧後は適用履歴と台帳の来歴を確認する必要があり、推測による台帳削除は行いません。

設計根拠は [Supabase の API 権限](https://supabase.com/docs/guides/api/securing-your-api)、[PostgreSQL の RLS](https://www.postgresql.org/docs/16/ddl-rowsecurity.html)、[安全な SECURITY DEFINER](https://www.postgresql.org/docs/current/sql-createfunction.html#SQL-CREATEFUNCTION-SECURITY)、[PostgREST の schema 公開範囲](https://docs.postgrest.org/en/stable/references/api/schemas.html)を参照しました。

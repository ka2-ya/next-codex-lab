# next-codex-lab

小規模なTodoアプリを題材に、Next.js 16とサーバーアクション、ASTベースのインデクサ、RAG補助スクリプトを組み合わせた検証用リポジトリです。アプリはインメモリストレージで動作し、RAG関連スクリプトは`.rag/`配下に生成物を出力します。

## 主な機能
- サーバーアクション経由でTodoの追加・完了を切り替え (`src/app/actions.ts`)
- Zodでスキーマ検証されたインメモリリポジトリ (`src/server/repos/todoRepo.ts`)
- ts-morphを用いたコードインデックス生成と簡易ベクトル埋め込み (`scripts/indexer.ts`, `scripts/embed.build.ts`)
- PlaywrightによるUIスモークテスト (`e2e/todo.spec.ts`)

## 必要条件
- Node.js 20 以上
- [pnpm](https://pnpm.io/) 9 系

## セットアップ
```bash
pnpm install
cp .env.example .env
# OPENAI_API_KEY などの値を編集
```

開発サーバーを起動するには次を実行します。

```bash
pnpm dev
```

本番ビルド確認は以下のコマンドで行えます。

```bash
pnpm build
pnpm start
```

## スクリプト一覧
- `pnpm lint` – ESLint (`eslint . --max-warnings=0`)
- `pnpm test` – Vitest (JSDOM)
- `pnpm e2e` – Playwright シナリオ
- `pnpm plan:validate` – YAML プラン検証 (`plans/*.yaml`)
- `pnpm index:build` / `pnpm embed:build` – RAG用インデックス＆埋め込み生成
- `pnpm graph:build` – ASTグラフ生成
- `pnpm rag:search:*` – 生成済みインデックスからの検索ユーティリティ
- `pnpm guard:alias` / `pnpm guard:api` – パブリックAPIの逸脱チェック

## 環境変数
`.env` に以下を設定します（実値は公開しないでください）。

| 変数名 | 説明 | 既定値 |
| --- | --- | --- |
| `OPENAI_API_KEY` | OpenAI API キー。密に扱うこと | なし |
| `OPENAI_EMBED_MODEL` | 埋め込み生成で利用するモデル名 | `text-embedding-3-small` |
| `OPENAI_EMBED_BATCH_SIZE` | 埋め込みAPI呼び出しのバッチサイズ | `16` |

## RAG生成物の扱い
- `.rag/index.json`, `.rag/graph.json` などは `pnpm index:build` / `pnpm graph:build` で再生成できます。
- `.rag/embed.json` は `.gitignore` 登録済みです。共有が必要な場合は生成手順と出力先をドキュメント化してください。
- 生成手順を再現する際は `OPENAI_API_KEY` を設定した上で `pnpm index:build && pnpm embed:build` を実行します。

## フォルダ構成
```
src/app      UI層 (Next.js App Router)
src/domain   Zodベースのドメインスキーマ
src/server   サーバーサイドユーティリティ
src/test     テストセットアップ
scripts      RAG/CI補助スクリプト
e2e          Playwright シナリオ
```

## コントリビューション
- PR 前に `pnpm lint && pnpm test && pnpm build` を実行してください。
- テスト補強が必要な場合は Vitest もしくは Playwright のシナリオを追加します。
- `.rag/` に変更がある場合は `pnpm index:build`, `pnpm embed:build`, `pnpm review:check` 実行結果をPR概要に追記してください。

## ライセンス
本リポジトリは MIT ライセンスで公開されます。詳細は `LICENSE` を参照してください。

---
name: haroteru-product
description: Product guidance for サブスク払ろてる. Use when deciding UX, wording, feature scope, guest-vs-sync behavior, or whether a change fits the product's lightweight subscription-dashboard direction.
---

# Haroteru Product

## Purpose

`サブスク払ろてる` は、登録なしですぐ使えるサブスク支出ダッシュボードです。必要なサブスクも、なんとなく続いているサブスクも、まとめて把握できることを重視します。

## Core Rules

- まずはゲスト利用を成立させる
- ログインは同期のための追加価値として扱う
- 支出の把握と見直し判断を支える
- 不要に家計簿化しない
- コピーは日本語を基本にし、軽さと親しみを保つ

## Domain Language

- `subscription`: 管理対象のサブスク項目
- `locked`: 継続前提で固定しておきたい状態
- `monthly estimate` / `yearly estimate`: 支出の目安

## Scope Guardrails

- 課金機能は将来復帰しやすい形で非表示にする
- 主役は「支払い導線」ではなく「支出の見える化」
- 重要な情報は総額、件数、ロック状態、見直しのきっかけ
- 重い入力や設定を要求しすぎない

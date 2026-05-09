# wind. — Paramotor Weather PWA

パラモーター向け風況モニター。気象庁 MSM (GPV) 実データを Open-Meteo 経由で取得し、7 日間 × 7 時刻の予報を表示します。

## 機能
- 風速・風向・突風・気温・天気の 7 日間予報
- 高度別風速プロファイル（10m / 90m / 300m / 480m / 780m / 980m）
- 観測地点の登録・切替（座標 + ズーム保存）
- 地図上の風の流れアニメーション
- 現在時刻に最も近い予報時刻を自動選択
- PWA: ホーム画面に追加可能、オフライン時もキャッシュから表示

## 含まれるファイル
- `index.html` — メインアプリ
- `manifest.json` — PWA マニフェスト
- `service-worker.js` — オフライン対応 + キャッシュ戦略
- `icon-192.png` / `icon-512.png` — PWA アイコン
- `apple-touch-icon.png` — iOS ホーム画面アイコン

## デプロイ方法

### GitHub Pages（推奨）
1. このフォルダの全ファイルを GitHub リポジトリにプッシュ
2. リポジトリ設定 → Pages → Branch: `main` / Folder: `/(root)` を選択
3. 数分後 `https://USERNAME.github.io/REPO-NAME/` でアクセス可能

### Cloudflare Pages
1. Cloudflare Pages で新規プロジェクト作成
2. このフォルダをアップロード（ビルドコマンド不要）
3. 即座に HTTPS で配信開始

### Netlify
1. このフォルダを drag & drop で https://app.netlify.com/drop へ
2. 即座にデプロイ完了

### 重要
- **HTTPS 必須**：Service Worker は HTTPS（または localhost）でのみ動作
- ファイル全部を**同じディレクトリ**に置くこと（パスは相対指定）

## モバイルでホーム画面に追加
- **iOS Safari**: 共有ボタン → 「ホーム画面に追加」
- **Android Chrome**: メニュー → 「アプリをインストール」

## 開発時のローカル確認
```bash
# 任意の HTTP サーバーで動作確認
cd wind-pwa
python3 -m http.server 8000
# → http://localhost:8000/ で開く
```

## キャッシュ戦略
- **App shell** (HTML/JS/CSS/icons): cache-first → オフラインでも起動
- **地図タイル** (CARTO): stale-while-revalidate → 最新化しつつオフライン対応、最大 200 タイル
- **予報 API** (Open-Meteo): network-first, fallback to cache → 最新を取得、圏外は最後の予報表示
- **ベンダーライブラリ** (Leaflet, Chart.js, Google Fonts): cache-first → 一度ロードすれば再ロード不要

## データ出典
- 気象庁 MSM (Meso-Scale Model) — Open-Meteo 経由
- https://www.jma.go.jp/jma/kishou/know/whitep/1-3-7.html

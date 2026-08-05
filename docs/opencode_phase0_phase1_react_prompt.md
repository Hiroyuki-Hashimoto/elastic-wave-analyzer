# 軽量React構成：要件整理とOpencode初期プロンプト

## 要件整理

### 開発・公開方針

- 新規の **private GitHub repository** を開発基盤とする。
- 最終リリースまでは外部公開しない。開発・確認はローカル環境だけで行う。
- GitHub Pages、公開URL、外部API、バックエンド、ログイン、データベースはPhase 0〜1の対象外。
- 最終リリース時に、repositoryをpublic化し、静的サイトとしてGitHub Pagesへ公開できる構成を目指す。ただし、その設定・デプロイは後続フェーズで行う。
- ユーザーが読み込むCSVはブラウザ内メモリだけで処理し、外部送信・永続保存を行わない。

### UI・技術方針

- UIの表示言語はすべて英語。
- 構成は **Vite + React + TypeScript + uPlot** とする。
- Next.js、React Router、Redux/Zustand、UIコンポーネントライブラリ、CSSフレームワーク、サーバーサイド機能は導入しない。
- Reactでは、`useState`、`useMemo`、`useRef`、`useEffect`だけを基本として使用する。グローバル状態管理は作らない。
- Reactコンポーネントは少数に保ち、解析ロジックはReactから切り離して`src/lib/`へ集約する。
- CSSは`src/styles.css`の1ファイルを基本とし、コンポーネントごとのCSS分割やデザインシステム導入は行わない。

### 3モジュール集約方針

解析の中核ロジックを次の3モジュールに集約する。

1. `src/lib/waveform.ts`
   - CSV文字列の解析と検証
   - 秒→µsの変換
   - Triggerの振幅ゲイン適用
   - Offset補正
   - Trim処理
   - 表示用配列の作成

2. `src/lib/picker.ts`
   - Phase 0〜1では型定義・空の拡張ポイントのみ
   - Phase 2でSTS/PTPピック、最近傍サンプルへのスナップ、ピーク検出、ズーム状態を追加する

3. `src/lib/exporter.ts`
   - Phase 0〜1では結果CSV/PNG出力の型定義・空の拡張ポイントのみ
   - Phase 2で全ファイル結果CSVダウンロード、解析図PNG出力を追加する

### Reactコンポーネント方針

コンポーネントは原則3つまでとする。

- `App.tsx`: 状態保持、ファイル読込、設定値、エラー表示、全体レイアウト
- `components/SettingsPanel.tsx`: 入力ファイル・Gain・Offset・Trim設定
- `components/WaveformChart.tsx`: uPlotの生成、更新、破棄。上下2段のグラフ表示

必要な型は`src/types.ts`へ集約する。Phase 0〜1の目安は、アプリ実装コード（依存パッケージ、テスト用データ、設定ファイルを除く）を**約700〜900行、最大1,100行**に抑えることとする。

### Phase 0〜1の対象

- 新形式CSVの1ファイル読込
- ファイル選択とドラッグ&ドロップ
- CSV検証
- Trigger/Receiverの2段波形表示
- Gain、Offset、Trim設定
- エラー表示
- 将来のSTS/PTP結果型の定義

### Phase 0〜1の対象外

- LPF
- クロスコリレーション
- MDF/MDF4入力
- STS/PTPの手動ピック
- 複数ファイルの逐次解析
- 結果CSVのダウンロード
- PNG出力
- 自動到達時刻推定
- GitHub Pagesの実デプロイ

---

## Opencode 初期プロンプト

以下をそのままOpencodeへ入力してください。

```text
あなたは、既存Python弾性波解析ツールを、ブラウザだけで動く静的Webアプリへ移植する開発エージェントです。

# 0. 最優先規則

1. リポジトリ直下の `agent.md` が存在する場合は、作業を始める前に必ず全文を読み、そこに書かれたコミット規則・開発規約・禁止事項に厳密に従ってください。このプロンプトと `agent.md` が矛盾する場合は、`agent.md` を優先してください。

2. このプロジェクトは、最終リリースまで private repository として開発します。このフェーズではGitHub Pages、公開URL、外部公開、repositoryのpublic化を実施しないでください。確認はローカル環境（`npm run dev` または `npm run preview`）だけで行ってください。

3. ユーザーが読み込むCSVデータは、ブラウザ内メモリだけで処理してください。アプリ実行時にCSV内容を外部サービスへ送信・アップロード・永続保存してはいけません。外部API、バックエンド、データベース、認証機能を実装しないでください。

4. ユーザーに表示するアプリUIの文言はすべて英語にしてください。ボタン、入力ラベル、グラフタイトル、軸ラベル、エラーメッセージ、空状態メッセージは英語に統一してください。このプロンプト自体は日本語です。

5. シンプルさを最優先してください。必要性がない抽象化、将来を見越した過剰な設計、状態管理ライブラリ、UIライブラリ、ルーティング、CSSフレームワークを追加しないでください。

# 1. Phase 0〜1のゴール

新規のWebプロジェクトを基盤として、CSV形式のオシロスコープ波形を1ファイル読み込み、TriggerとReceiverを2段のグラフに表示する英語UIの最小アプリを作成してください。

ユーザーは以下を変更できなければなりません。

- Trigger amplitude gain
- Offset correction on/off
- Time trimming on/off
- Trim start/end time in µs

このフェーズでは、STS/PTPの手動ピック、複数CSVの連続処理、結果CSV出力、PNG出力は実装しません。ただし、Phase 2でこれらを追加しやすいデータ型とモジュール境界を準備してください。

# 2. 固定技術構成

次の技術構成を使用してください。

- Vite
- React
- TypeScript
- uPlot（波形チャート）

以下は使用しないでください。

- Next.js / Svelte / Vue
- React Router
- Redux / Zustand / Jotai / Contextを用いたグローバル状態管理
- UI component library（MUI、Ant Design、shadcn等）
- Tailwind CSS、CSS framework
- Backend、serverless function、database

Reactは軽量に保ってください。標準Hooksの `useState`、`useMemo`、`useRef`、`useEffect`だけを基本として使い、状態は原則として `App.tsx` に保持してください。

# 3. 参照ファイルと構成

新規プロジェクトを基礎にしてください。既存PythonコードとサンプルCSVは参照専用データです。

推奨ディレクトリ構成:

```text
.
├─ agent.md
├─ README.md
├─ reference/
│  ├─ ELPlib.py
│  └─ 0004_Shh_SINE_7000Hz_1cycle.csv
├─ src/
│  ├─ App.tsx
│  ├─ main.tsx
│  ├─ types.ts
│  ├─ styles.css
│  ├─ components/
│  │  ├─ SettingsPanel.tsx
│  │  └─ WaveformChart.tsx
│  └─ lib/
│     ├─ waveform.ts
│     ├─ picker.ts
│     └─ exporter.ts
├─ index.html
├─ package.json
└─ vite.config.ts
```

- `reference/ELPlib.py` は既存Python実装の仕様確認だけに使用してください。アプリ本体から読み込んではいけません。
- `reference/0004_Shh_SINE_7000Hz_1cycle.csv` は開発中の手動テスト用です。アプリに埋め込まず、通常のファイル入力と同じ経路で読み込んでください。
- CSSは原則 `src/styles.css` の1ファイルだけに記述してください。
- Reactコンポーネントを増やしすぎないでください。Phase 0〜1では `App.tsx`、`SettingsPanel.tsx`、`WaveformChart.tsx` の3つで十分です。
- Phase 0〜1のアプリ実装コードは、可能なら700〜900行、最大でも1,100行程度に収めてください。行数達成のために可読性を犠牲にしてはいけませんが、不要な抽象化は避けてください。

# 4. 3つの中核モジュール

解析ロジックを次の3モジュールに集約してください。

## `src/lib/waveform.ts`（このフェーズで実装する）

以下をReact非依存の純粋関数として実装してください。

- CSV文字列の解析
- CSV形式の検証
- 時刻の秒[s]からマイクロ秒[µs]への変換
- Triggerのgain適用
- Trigger/Receiverのoffset補正
- 指定時間範囲によるtrim
- グラフに渡す表示用配列の作成

## `src/lib/picker.ts`（このフェーズでは最小限）

Phase 2のSTS/PTPピック用の型定義と、必要最小限のTODOコメントだけを置いてください。ピック処理、ピーク検出、ズーム処理は実装しないでください。

## `src/lib/exporter.ts`（このフェーズでは最小限）

Phase 2の結果CSVダウンロード・PNG出力用の型定義と、必要最小限のTODOコメントだけを置いてください。ダウンロード処理やPNG処理は実装しないでください。

# 5. 入力CSV仕様

受け付ける入力形式はCSVだけです。MDF/MDF4形式はサポートしません。

CSVの1行目はヘッダであり、次の3列を順番に含みます。

```csv
Time [s], Transmitter [V], Receiver [V]
```

入力例:

```csv
Time [s], Transmitter [V], Receiver [V],
-4.999999999999999562e-05,5.410156250000075495e-03,7.207031249999943517e-05
```

CSV処理の要件:

- `.csv` ファイルだけを受け付けてください。
- ヘッダやデータ行の余分な空白を許容してください。
- 行末の余分なカンマを許容してください。
- 空行を無視してください。
- 3列を超えるデータがあっても最初の3列だけを使ってください。
- 各データ行について最初の3値がすべて有限数値であることを検証してください。
- 少なくとも2つのデータ点が必要です。
- Time列は厳密な単調増加でなければなりません。
- ヘッダが不足または不正、列数不足、有限数値以外、データ点不足、時刻非単調の場合、アプリをクラッシュさせず英語でエラー表示してください。

エラーメッセージ例:

- `Unsupported CSV format. Expected: Time [s], Transmitter [V], Receiver [V].`
- `Each data row must contain three finite numeric values.`
- `At least two data points are required.`
- `The time column must be strictly increasing.`

# 6. データモデル

次の型を `src/types.ts` に定義してください。必要に応じて補助型を追加して構いませんが、型を細分化しすぎないでください。

```ts
export type RawWaveform = {
  fileName: string;
  timeUs: number[];
  transmitterVRaw: number[];
  receiverVRaw: number[];
};

export type DisplaySettings = {
  amplitudeGain: number;
  offsetEnabled: boolean;
  trimEnabled: boolean;
  trimStartUs: number;
  trimEndUs: number;
};

export type DisplayWaveform = {
  timeUs: number[];
  transmitterV: number[];
  receiverV: number[];
};

export type AnalysisResult = {
  fileName: string;
  stsStartUs: number | null;
  stsStartV: number | null;
  stsArrivalUs: number | null;
  stsArrivalV: number | null;
  ptpStartUs: number | null;
  ptpStartV: number | null;
  ptpArrivalUs: number | null;
  ptpArrivalV: number | null;
  stsDeltaTUs: number | null;
  ptpDeltaTUs: number | null;
};
```

処理規則:

- `timeUs` = `Time [s] * 1_000_000`
- `transmitterVRaw` = CSVの `Transmitter [V]`
- `receiverVRaw` = CSVの `Receiver [V]`。すでにV単位なので変換しない。
- `transmitterV` = `transmitterVRaw * amplitudeGain`
- `amplitudeGain` の初期値は `20`
- `offsetEnabled` の初期値は `true`
- offset補正が有効な場合、各表示系列の先頭値を、それぞれの系列全体から差し引く。
- `trimEnabled` の初期値は `false`
- `trimStartUs` の初期値は `-50`
- `trimEndUs` の初期値は `800`
- trim有効時は `trimStartUs <= timeUs <= trimEndUs` の点だけを表示する。
- trim有効かつ `trimStartUs >= trimEndUs` の場合は設定エラーとし、既存グラフを消去・破壊しないでください。英語のエラーを表示してください。

# 7. UI要件（すべて英語）

## `App.tsx`

`App.tsx`は、以下の状態と処理を保持してください。

- 現在読込中のRawWaveform
- DisplaySettings
- エラー一覧
- ファイル読込イベント
- ドラッグ&ドロップイベント
- waveform.tsを呼び出して得たDisplayWaveform

状態管理ライブラリやContextは使わないでください。

## `SettingsPanel.tsx`

次の英語UIを実装してください。

- ファイル選択ボタン: `Select CSV file`
- ドラッグ&ドロップ文言: `Drop a CSV file here`
- gain入力: `Amplitude gain`
- offsetチェックボックス: `Subtract initial value (offset correction)`
- trimチェックボックス: `Enable time trimming`
- trim開始入力: `Trim start (µs)`
- trim終了入力: `Trim end (µs)`
- エラー領域見出し: `Errors`

入力値変更は、読み込み済み波形に即時反映してください。

## `WaveformChart.tsx`

- uPlotを使い、上下に2つのグラフを表示してください。
- 上段タイトル: `Trigger (with gain)`
- 上段y軸: `Trigger (V)`
- 下段タイトル: `Receiver`
- 下段y軸: `Receiver (V)`
- 両方のx軸: `Time (µs)`
- グリッドを表示してください。
- 同じ表示用時間軸を使用してください。
- 現在のファイル名をページ上部またはチャート近傍に表示してください。
- データ未読込時は、`No data loaded. Please select a CSV file.` を表示してください。
- uPlotインスタンスはReact lifecycleに合わせて確実にdestroyしてください。二重生成やメモリリークを避けてください。

# 8. 明示的な非対象機能

次の機能はPhase 0〜1で実装しない・UIに露出しないでください。

- Low-pass filter
- Cross-correlation
- MDF/MDF4 parsing
- STS/PTP picking
- Peak detection
- Zoom keyboard shortcuts
- Multi-file queue
- Analysis result table
- CSV export
- PNG export
- Previous-waveform overlay
- Automatic arrival-time estimation
- GitHub Pages deployment

# 9. README

READMEは英語で作成してください。少なくとも以下を含めてください。

- Project purpose
- Current scope: Phase 0–1
- How to install and run locally
- Input CSV format
- Privacy statement: `CSV files are processed locally in the browser and are not uploaded to external servers.`
- Technology statement: `uPlot is used for waveform rendering because it is lightweight and performs well with dense time-series data.`
- Explicit note: `This repository is under private development and is not yet publicly released.`

# 10. 受入条件

作業完了前に、次を必ず検証してください。

1. `npm run build` が成功する。
2. `npm run dev` または `npm run preview` でローカル起動できる。
3. `reference/0004_Shh_SINE_7000Hz_1cycle.csv` を通常のファイル選択またはドラッグ&ドロップで読み込める。
4. 上記CSVで、横軸がµs単位で表示され、-50 µs付近から少なくとも+800 µsを含む範囲のデータを確認できる。
5. `Amplitude gain` を20から別値へ変えると、Trigger振幅だけが比例して変化し、Receiver振幅は変化しない。
6. offset correctionのON/OFFで、TriggerとReceiverの初期値差し引きが切り替わる。
7. time trimmingのON/OFFと開始・終了時刻変更で、表示範囲が更新される。
8. ヘッダ不正、列数不足、非数値、時刻非単調のCSVで、クラッシュせず英語エラーを表示する。
9. ブラウザ実行中にCSVデータを送信するネットワークリクエストをアプリが発生させない。

# 11. 作業完了時の報告

作業完了時には、次を簡潔に報告してください。

1. 追加・変更したファイル一覧と目的
2. 実装済み機能
3. 実行した検証コマンドと結果
4. 主要ソースコードの概算行数と、簡潔さを保つために採った方針
5. Phase 2で追加予定の機能（STS/PTPピック、複数ファイル逐次処理、全件結果CSV出力）と、それらを追加する場所
6. 残課題や設計上の注意点

コミットについては必ず `agent.md` の規則に従ってください。`agent.md` に明確な規則がない場合は、完了した機能単位で、簡潔で意味のある英語コミットメッセージを用いてください。
```

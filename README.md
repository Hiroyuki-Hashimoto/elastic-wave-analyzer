# Elastic Wave Analyzer

A lightweight, browser-only web app for analyzing elastic wave
measurement data. It was primarily designed for waveforms acquired
with bender elements and similar transducers during geotechnical
testing, and estimates elastic wave velocities in geomaterials by
identifying wave travel times from time-domain signals.

弾性波計測データを解析するための、軽量で完全にブラウザだけで動作する Web アプリです。主に、土質試験中にベンダーエレメントなどの圧電トランスデューサで取得した波形の解析用に設計されており、時刻歴信号から波動の到達時間を読み取って、地盤材料中の弾性波速度を推定します。

The interface renders Trigger (transmitter) and Receiver traces from
oscilloscope CSV exports on a shared microsecond time axis, with
adjustable amplitude gain, offset correction, time trimming, manual
or automatic Start/Peak picking with Start-to-Start (STS) /
Peak-to-Peak (PTP) travel times,
previous-waveform overlay, and wave velocity calculation.

オシロスコープから書き出した CSV の Trigger (送信側) と Receiver (受信側) の波形を、共通のマイクロ秒軸に並べて表示します。振幅ゲイン・オフセット補正・時間範囲のトリミング、手動/自動の Start/Peak 読み取りと Start-to-Start (STS) / Peak-to-Peak (PTP) 伝播時間、前回波形のオーバーレイ、弾性波速度の算出が可能です。

## Web app

<https://hiroyuki-hashimoto.github.io/elastic-wave-analyzer/>

CSV files are processed entirely in your browser — nothing is
uploaded to any server.

CSV の処理はすべてブラウザ内で行われ、サーバーには一切アップロードされません。

Intended for use on a Chromium-based browser (**Chrome**, **Edge**,
**Opera**), on a PC with a Full HD (1920 × 1080) or higher display.

Chromium 系のブラウザ (**Chrome**, **Edge**, **Opera**) で、フル HD (1920 × 1080) 以上のディスプレイを備えた PC での利用を想定しています。

## Features

| Feature | Description |
| --- | --- |
| CSV import | Select or drag-and-drop delimited waveform exports (CSV/TSV/TXT); parsing and validation run fully client-side with one generic format detector. |
| Import confirmation | Every new format is confirmed against the raw file head in a mapping popup with colorized Time/Transmitter/Receiver columns; the confirmed mapping is remembered per header. |
| Dual trace view | Trigger (transmitter) and Receiver traces on a shared microsecond time axis. |
| Display settings | Amplitude gain, offset correction, time trimming, zoom with per-chart pan scrollbars. |
| Low pass filter | Zero-phase Butterworth low-pass filter on the Receiver trace with adjustable cutoff (kHz). |
| Batch queue | Load multiple CSVs and determine wave travel time in sequence. |
| Manual picking | Left click sets the Start point (Peak auto-derived); right click overrides the Peak. |
| Trigger auto-detection | Threshold-based automatic Trigger Start pick with derived Peak. |
| CC receiver picking | Receiver Start estimated by cross-correlating against the last confirmed file inside a Before/After window; Peak derived from it. |
| Previous-waveform overlay | Faded reference traces, dashed pick guides, and Δ annotations versus the live picks. |
| Wave velocity | Propagation times with system-delay correction and distance-based wave velocity. |
| Results & export | Per-file results table, results CSV download, PNG chart export with auto-save on confirm. |
| Offline & installable | Service-worker precache for fully offline use; installable as a standalone app with an in-app Reload prompt on updates. |

| 機能 | 説明 |
| --- | --- |
| CSV インポート | 区切り文字付き波形エクスポート (CSV/TSV/TXT) を選択またはドラッグ&ドロップ。解析と検証は 1 つの汎用フォーマットの検出器だけで完全にクライアント側で実行されます。 |
| インポート確認 | 新しい形式は、生ファイルのヘッダに対してマッピングダイアログで必ず確認します。Time / Transmitter / Receiver の列は色付けされ、確認されたマッピングはヘッダごとに記憶されます。 |
| 2 波形同時表示 | Trigger (送信側) と Receiver (受信側) の波形を共通のマイクロ秒軸に表示。 |
| 表示設定 | 振幅ゲイン、オフセット補正、時間トリミング、チャートごとのズームとパン用スクロールバー。 |
| ローパスフィルタ | 受信波形へのゼロ位相 Butterworth ローパスフィルタ。カットオフ周波数 (kHz) は調整可能。 |
| バッチキュー | 複数の CSV を読み込み、波形到達時間を順番に決定。 |
| 手動ピッキング | 左クリックで立ち上がり点を設定 (ピークは自動算出)。右クリックでピークを上書き。 |
| Trigger 自動検出 | 閾値ベースの Trigger 立ち上がり自動検出。ピークはそこから算出。 |
| CC による Receiver 検出 | 直前に確認したファイルとの相互相関により、Before/After ウィンドウ内で Receiver の立ち上がりを推定。ピークはそこから算出。 |
| 前回波形のオーバーレイ | 半透明の参照波形、破線のピッキングガイド、現在値との Δ 注記を表示。 |
| 弾性波速度 | システム遅延補正付きの到達時間から、距離ベースの弾性波速度を算出。 |
| 結果とエクスポート | ファイル単位の結果表、結果 CSV のダウンロード、PNG チャート出力 (確認時の自動保存)。 |
| オフラインとインストール | Service Worker の precache により完全オフラインで動作。スタンドアロンアプリとしてインストール可能で、更新時はアプリ内 Reload 通知。 |

## License

Released under the [MIT License](./LICENSE).

[MIT ライセンス](./LICENSE) の下で公開しています。

# minimal-svg-editor
![image1](images/image-1.png)

## Recommended Environment
This tool is designed for use on a PC with the Google Chrome browser. Operation on other devices or browsers is not guaranteed.

## 推奨環境
このツールは、PC上のGoogle Chromeブラウザでの使用を想定しています。他のデバイスやブラウザでの動作は保証されていません。

## Demo
You can try this tool on the page below.

https://black-sesame-ice-cream.github.io/minimal-svg-editor/

## デモ
以下のページでこのツールを試すことができます。

https://black-sesame-ice-cream.github.io/minimal-svg-editor/

## Overview
A minimal, web-based SVG editor that runs entirely in the browser. It features a split-screen layout with a code editor and a real-time preview panel.

This tool is lightweight, requires no installation, and provides essential features such as live rendering, pan & zoom, auxiliary grid display, code minification, and file handling.

## 概要
ブラウザ上で完結する、最小限構成のWebベースSVGエディタです。コードエディタとリアルタイムプレビューパネルを備えた分割画面レイアウトが特徴です。

インストール不要の軽量設計でありながら、ライブレンダリング、パン＆ズーム、補助グリッド表示、コードの最小化、ファイル操作といった基本機能を提供します。

## Usage
- **Code Editing**: Edit the SVG code directly in the text area on the right (or bottom on mobile).
- **Live Preview**: Changes are instantly reflected in the preview panel on the left (or top on mobile).
- **Pan & Zoom**: Drag the preview area to pan, and use the mouse wheel to zoom.
- **Auxiliary Grid**: Use the preview control bar to set the number of grid divisions (horizontal/vertical), line color, and Z-index (front/back).
- **Theme Customization**: Change the background and text colors of the editor and preview panels using the color pickers in their respective control bars.
- **File Operations**:
    - **Open**: Click "SVGを開く" (Open SVG) to load a local SVG file.
    - **Save**: Click "SVGを保存" (Save SVG) to download the current code as an `.svg` file.
- **Minification**:
    - Check "最小化" (Minimize) to compress the SVG code (removes comments, extra whitespace).
    - Specify the number of decimal places to round to using the "小数点" (Decimal) input (-1 disables rounding).
    - **Note**: This process can be destructive and may break complex SVGs. Editing is disabled while in minification mode.
- **Snippets**: Type abbreviations like `<r`, `<c`, `<p`, etc., in the editor and press `Tab` or `Enter` to expand them into common SVG element templates.
- **Layout Resizing**: Drag the central resize bar to adjust the size ratio of the editor and preview panels.

## 使い方
- **コード編集**: 右側（モバイルでは下側）のテキストエリアでSVGコードを直接編集します。
- **ライブプレビュー**: 編集内容は即座に左側（モバイルでは上側）のプレビューパネルに反映されます。
- **パンとズーム**: プレビューエリアをドラッグしてパン（移動）、マウスホイールでズームが可能です。
- **補助線**: プレビューコントロールバーで、グリッドの分割数（横分割・縦分割）、線の色、前後関係（背面/前面）を設定できます。
- **テーマ変更**: 各パネルのコントロールバーにあるカラーピッカーで、エディタやプレビューの背景色・文字色を変更できます。
- **ファイル操作**:
    - **開く**: 「SVGを開く」ボタンでローカルのSVGファイルを読み込みます。
    - **保存**: 「SVGを保存」ボタンで現在のコードを `.svg` ファイルとしてダウンロードします。
- **最小化**:
    - 「最小化」チェックボックスをオンにすると、SVGコードが圧縮（コメント除去、余白削除）されます。
    - 「小数点」入力で、数値を丸める小数点以下の桁数を指定できます（-1で無効）。
    - **注意**: この処理は破壊的であり、複雑なSVGを壊す可能性があります。最小化モード中はエディタが読み取り専用になります。
- **スニペット**: エディタ内で `<r` や `<c`、`<p` などの短縮形を入力し `Tab` または `Enter` キーを押すと、SVG要素のテンプレートに展開されます。
- **レイアウト変更**: 中央のリサイズバーをドラッグすることで、エディタとプレビューのパネルサイズ比率を調整できます。

## Licenses
Please see below for details.

[License](LICENSE/)

[Third-Party Licenses](THIRD-PARTY-LICENSES.txt/)

## ライセンス
以下を参照してください。

[ライセンス](LICENSE/)

[第三者ライセンス](THIRD-PARTY-LICENSES.txt/)

## Tech Stack
- HTML5
- CSS3 (Flexbox)
- Vanilla JavaScript (ES6+)
- Tailwind CSS (via CDN)
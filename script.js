document.addEventListener('DOMContentLoaded', () => {

    // --- Constants ---
    const MIN_PANEL_SIZE = 200;
    const GRID_MAX_DIVISIONS = 32;
    const FONT_MIN_SIZE = 8;
    const FONT_MAX_SIZE = 64;
    const FONT_DEFAULT_SIZE = 14;
    const PAN_ZOOM_STEP = 0.1;
    const PAN_ZOOM_MIN = 0.1;

    // --- State Variables ---
    let scale = 1.0;
    let translateX = 0;
    let translateY = 0;
    let isPanning = false;
    let panStartX = 0;
    let panStartY = 0;
    let originalSvgContent = ''; // 最小化前のSVGを保持
    let isResizing = false;
    let lastSvgAttrs = null; // (変更) 最後に解析したSVG属性を保持

    // --- DOM Elements ---
    const editor = document.getElementById('svg-editor');
    const preview = document.getElementById('preview');
    const svgContainer = document.getElementById('svg-container');
    const userSvgWrapper = document.getElementById('user-svg-wrapper'); 
    const resizer = document.getElementById('resizer');
    
    // Editor Controls
    const editorContainer = document.getElementById('editor-container');
    const controlBar = document.getElementById('control-bar');
    const bgPicker = document.getElementById('bg-color-picker');
    const textColorPicker = document.getElementById('text-color-picker');
    const fontSizeInput = document.getElementById('font-size-input');
    const loadButton = document.getElementById('load-svg-button');
    const fileInput = document.getElementById('svg-file-input');
    const saveButton = document.getElementById('save-svg-button');
    const minimizeCheckbox = document.getElementById('minimize-svg-checkbox');
    const decimalPlacesInput = document.getElementById('decimal-places-input'); 

    // Preview Controls
    const previewContainer = document.getElementById('preview-container');
    const previewControlBar = document.getElementById('preview-control-bar');
    const previewBgPicker = document.getElementById('preview-bg-color-picker');
    const gridColsInput = document.getElementById('grid-cols-input');
    const gridRowsInput = document.getElementById('grid-rows-input');
    const gridZSelect = document.getElementById('grid-z-select');
    const gridColorPicker = document.getElementById('grid-color-picker');
    const coordsDecimalPlacesInput = document.getElementById('coords-decimal-places-input'); // (新規)
    
    // 補助線表示用のSVG要素を作成
    const gridSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    gridSvg.id = 'preview-grid-svg';
    Object.assign(gridSvg.style, {
        position: 'absolute',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        pointerEvents: 'none' // グリッドが操作を妨害しないように
    });
    svgContainer.appendChild(gridSvg); 

    // (新規) グリッド線用のグループを作成
    const gridGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    gridGroup.id = 'grid-lines-group';
    gridSvg.appendChild(gridGroup);
    
    // (新規) 選択ポイント用のSVGレイヤーを作成 (z-index: 20 で最前面に)
    const pointSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    pointSvg.id = 'preview-point-svg';
    Object.assign(pointSvg.style, {
        position: 'absolute',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        pointerEvents: 'none', // 操作を妨害しない
        zIndex: '20' // gridSvg (0 or 10) より手前
    });
    svgContainer.appendChild(pointSvg);

    // (新規) 選択ポイント用のグループを作成 (pointSvg の子)
    const selectionPointGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    selectionPointGroup.id = 'selection-point-group';
    pointSvg.appendChild(selectionPointGroup); 

    // (新規) カーソル座標表示用のグループを作成
    const cursorCoordsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    cursorCoordsGroup.id = 'cursor-coords-group';
    pointSvg.appendChild(cursorCoordsGroup); // selectionPointGroup の後に追加

    // (新規) updateSelectionPoint をDOMContentLoadedスコープに移動
    let updateSelectionPoint = () => {};
    // (新規) updateCursorCoords をDOMContentLoadedスコープに移動
    let updateCursorCoords = () => {};

    // --- Utility Functions ---

    /**
     * SVG文字列を最小化します。
     * (変更) 以下の順序で実行
     * 1. 保護なしで安全なコメント・空白を削除 (HTML, CSS, JSコメント対応)
     * 2. style/script/特定属性を保護
     * 3. 小数点を丸める
     * 4. 保護を解除
     */
    function minifySvg(svgString, digits) {
        if (typeof svgString !== 'string') return '';
        let minified = svgString;

        // --- ステップ1: 保護なしで安全な削除 ---

        // 1a. HTMLコメント削除
        minified = minified.replace(/<!--[\s\S]*?-->/g, '');

        // 1d. (変更) すべての改行を削除
        minified = minified.replace(/[\r\n]+/g, ''); // 改行を完全に削除

        // 1e. (変更) タグ間の空白を削除 (改行はステップ1dで削除済み)
        minified = minified.replace(/>\s+</g, '><');

        // 1f. (新規) 2個以上続くスペースを1個にする
        // (タブはスペースに変換してから圧縮)
        minified = minified.replace(/\t/g, ' '); // タブをスペースに
        minified = minified.replace(/[ ]{2,}/g, ' '); // 2個以上のスペースを1個に

        // --- ステップ2: 保護 ---
        
        const protectedParts = [];
        const placeholder = (index) => `__PROTECTED_${index}__`;

        // 保護関数
        const protect = (regex) => {
            minified = minified.replace(regex, (match) => {
                protectedParts.push(match);
                return placeholder(protectedParts.length - 1);
            });
        };

        // 2a. <style> と <script> タグ
        // (ステップ1で中のコメントが消えている可能性あり)
        protect(/<style[\s\S]*?<\/style>/gi);
        protect(/<script[\s\S]*?<\/script>/gi);
        
        // 2b. 破壊されると困る属性 (id, href, style, xmlns)
        // ダブルクォートの場合
        protect(/\s+(id|href|style|xmlns)\s*=\s*"[^"]*"/gi);
        // シングルクォートの場合
        protect(/\s+(id|href|style|xmlns)\s*=\s*'[^']*'/gi);

        // --- ステップ3: 小数点丸め (保護後) ---
        
        const digitsInt = parseInt(digits, 10);
        if (!isNaN(digitsInt) && digitsInt >= 0) {
            try {
                // 正規表現: オプションのマイナス記号 + 数字 + ドット + 数字
                // (変更) (?![eE]) を追加し、科学技術計算表記 (e.g., 1.23e-5) を除外
                minified = minified.replace(/([-+]?\d+\.\d+)(?![eE])/g, (match) => {
                    const num = parseFloat(match);
                    if (isNaN(num)) return match; // パース失敗時はそのまま
                    return String(parseFloat(num.toFixed(digitsInt)));
                });
            } catch (e) {
                console.error("Failed to round decimals during minify:", e);
                // エラーが発生した場合は、このステップをスキップして続行
            }
        }

        // --- ステップ4: 復元 ---
        
        // プレースホルダーを元の保護した内容に戻す
        for (let i = protectedParts.length - 1; i >= 0; i--) {
            // $& は マッチした文字列全体 を参照する
            minified = minified.replace(placeholder(i), () => protectedParts[i]);
        }

        return minified.trim();
    }


    /**
     * HEXコードを明るくする関数
     */
    function lightenHexColor(hex, percent) {
        let r = parseInt(hex.slice(1, 3), 16);
        let g = parseInt(hex.slice(3, 5), 16);
        let b = parseInt(hex.slice(5, 7), 16);
        r = Math.min(255, Math.floor(r + (255 - r) * (percent / 100)));
        g = Math.min(255, Math.floor(g + (255 - g) * (percent / 100)));
        b = Math.min(255, Math.floor(b + (255 - b) * (percent / 100)));
        const rHex = r.toString(16).padStart(2, '0');
        const gHex = g.toString(16).padStart(2, '0');
        const bHex = b.toString(16).padStart(2, '0');
        return `#${rHex}${gHex}${bHex}`;
    }

    /**
     * HEXカラーコードを指定された不透明度（アルファ）のRGBA文字列に変換します。
     */
    function hexToRgba(hex, alpha) {
        let shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
        hex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);

        let result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        if (!result) return null; // 不正なHEXコード

        const r = parseInt(result[1], 16);
        const g = parseInt(result[2], 16);
        const b = parseInt(result[3], 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    // --- Theme Functions ---

    /**
     * パネル（エディタまたはプレビュー）のテーマ（背景色、文字色、入力欄スタイル）を設定します。
     * @param {HTMLElement} container - 全体コンテナ (e.g., editorContainer)
     * @param {HTMLElement} controlBar - コントロールバー (e.g., controlBar)
     * @param {string} color - ベースとなるHEXカラーコード
     * @param {string} inputSelector - スタイルを適用する入力欄のCSSセレクタ
     * @param {string} labelSelector - スタイルを適用するラベルのCSSセレクタ
     * @param {string} baseElementStyleProp - ベース要素に適用するスタイルプロパティ ('backgroundColor' or 'color')
     * @param {HTMLElement} [baseElement=null] - ベースとなる要素 (e.g., editor, preview)
     */
    function setPanelTheme(container, controlBar, color, inputSelector, labelSelector, baseElementStyleProp, baseElement = null) {
        if (baseElement) {
            baseElement.style[baseElementStyleProp] = color;
        }

        try {
            const lighterColor = lightenHexColor(color, 20);
            controlBar.style.backgroundColor = lighterColor;
            container.style.backgroundColor = lighterColor;

            const labels = controlBar.querySelectorAll(labelSelector);
            const controls = controlBar.querySelectorAll(inputSelector); 

            let r = parseInt(lighterColor.slice(1, 3), 16);
            let g = parseInt(lighterColor.slice(3, 5), 16);
            let b = parseInt(lighterColor.slice(5, 7), 16);
            const brightness = (r * 299 + g * 587 + b * 114) / 1000;

            const [labelLight, labelDark] = (labelSelector === '#preview-control-bar label') 
                ? ['text-gray-700', 'text-gray-100'] 
                : ['text-gray-700', 'text-gray-300'];

            labels.forEach(label => {
                label.classList.remove(labelLight, labelDark); 
                label.classList.add(brightness < 128 ? labelDark : labelLight); 
            });

            controls.forEach(control => {
                control.classList.remove('preview-input-light', 'preview-input-dark');
                control.classList.add(brightness < 128 ? 'preview-input-dark' : 'preview-input-light');
            });

        } catch (e) {
            console.error("Failed to apply theme color: ", e);
            controlBar.style.backgroundColor = "#f3f4f6"; 
            container.style.backgroundColor = "#f3f4f6";
        }
    }

    function setEditorBackground(color) {
        setPanelTheme(editorContainer, controlBar, color, 
            '#control-bar .preview-input', '#control-bar label', 
            'backgroundColor', editor);
    }

    function setPreviewBackground(color) {
        setPanelTheme(previewContainer, previewControlBar, color, 
            '#preview-control-bar .preview-input, #preview-control-bar .zoom-btn', '#preview-control-bar label', 
            'backgroundColor', preview);
    }

    function setEditorTextColor(color) {
        editor.style.color = color;
    }

    // (追加 2) 状態に応じてエディタ文字色を更新する共通関数
    /**
     * 現在の状態 (最小化チェック) に応じてエディタの文字色を更新します。
     */
    function updateEditorTextColorBasedOnState() {
        const color = textColorPicker.value;
        if (minimizeCheckbox.checked) {
            try {
                // 最小化中は半透明にする
                editor.style.color = hexToRgba(color, 0.4); 
            } catch (err) {
                console.error("Failed to apply rgba color on minimize:", err);
                editor.style.color = color; // フォールバック
            }
        } else {
            // 通常時はそのままの色
            setEditorTextColor(color);
        }
    }


    function setEditorFontSize(size) {
        const safeSize = parseInt(size, 10);
        if (safeSize >= FONT_MIN_SIZE && safeSize <= FONT_MAX_SIZE) {
            editor.style.fontSize = `${safeSize}px`;
        } else if (!safeSize) {
             editor.style.fontSize = `${FONT_DEFAULT_SIZE}px`; // 空の場合のデフォルト
        }
    }

    // --- Preview Rendering ---

    /**
     * SVGコードを解析し、viewBoxやpreserveAspectRatioなどの属性情報を抽出・計算します。
     */
    function parseSvgAttributes(svgCode) {
        const attrs = {
            svgTagMatch: null,
            viewBoxValue: null,
            preserveAspectRatioValue: null,
            vbParts: null,
            newViewBoxValue: null
        };

        attrs.svgTagMatch = svgCode.match(/<svg([^>]*)>/i);
        if (!attrs.svgTagMatch) return attrs;

        const svgTagAttributes = attrs.svgTagMatch[1];
        const viewBoxMatch = svgTagAttributes.match(/viewBox="([^"]+)"/i);
        if (viewBoxMatch) {
            attrs.viewBoxValue = viewBoxMatch[1];
        }

        const preserveAspectRatioMatch = svgTagAttributes.match(/preserveAspectRatio="([^"]+)"/i);
        if (preserveAspectRatioMatch) {
            attrs.preserveAspectRatioValue = preserveAspectRatioMatch[1];
        }

        // viewBoxがない場合、width/heightから生成を試みる
        if (!attrs.viewBoxValue) {
            const widthMatch = svgTagAttributes.match(/width="([^"]+)"/i);
            const heightMatch = svgTagAttributes.match(/height="([^"]+)"/i);
            let vbWidth = null;
            let vbHeight = null;

            if (widthMatch && /^[0-9.]+p?x?$/.test(widthMatch[1])) {
                vbWidth = parseFloat(widthMatch[1]);
            }
            if (heightMatch && /^[0-9.]+p?x?$/.test(heightMatch[1])) {
                vbHeight = parseFloat(heightMatch[1]);
            }
            
            if (vbWidth && vbHeight) {
                attrs.viewBoxValue = `0 0 ${vbWidth} ${vbHeight}`;
            }
        }
        
        // viewBoxをグリッド表示用に拡張
        if (attrs.viewBoxValue) {
            attrs.vbParts = attrs.viewBoxValue.split(' ').map(Number);
            if (attrs.vbParts.length === 4 && !isNaN(attrs.vbParts[2]) && !isNaN(attrs.vbParts[3])) {
                const [vbX, vbY, vbWidth, vbHeight] = attrs.vbParts;
                const newWidth = vbWidth * 2; 
                const newHeight = vbHeight * 2;
                const newX = vbX - (vbWidth * 0.5); 
                const newY = vbY - (vbHeight * 0.5); 
                attrs.newViewBoxValue = `${newX} ${newY} ${newWidth} ${newHeight}`;
            } else {
                attrs.viewBoxValue = null; 
                attrs.vbParts = null;
            }
        }
        
        return attrs;
    }

    /**
     * 解析した属性に基づいて、SVGコードの<svg>タグを更新します。
     */
    function updateSvgAttributes(svgCode, attrs) {
        if (!attrs.svgTagMatch) return svgCode;

        let newAttributes = attrs.svgTagMatch[1];
        
        // width/height属性を削除
        newAttributes = newAttributes.replace(/width="[^"]+"/i, '');
        newAttributes = newAttributes.replace(/height="[^"]+"/i, '');

        // 拡張viewBoxを適用
        if (attrs.newViewBoxValue) { 
            if (attrs.svgTagMatch[1].match(/viewBox="[^"]+"/i)) { 
                newAttributes = newAttributes.replace(/viewBox="[^"]+"/i, `viewBox="${attrs.newViewBoxValue}"`);
            } else { 
                newAttributes += ` viewBox="${attrs.newViewBoxValue}"`;
            }
        } else if (attrs.viewBoxValue) {
             if (attrs.svgTagMatch[1].match(/viewBox="[^"]+"/i)) {
                newAttributes = newAttributes.replace(/viewBox="[^"]+"/i, `viewBox="${attrs.viewBoxValue}"`);
            } else {
                newAttributes += ` viewBox="${attrs.viewBoxValue}"`;
            }
        }
        
        // viewBoxがあり、preserveAspectRatioがない場合、デフォルトを追加
        if (attrs.viewBoxValue && !attrs.preserveAspectRatioValue) { 
            attrs.preserveAspectRatioValue = 'xMidYMid meet'; 
            newAttributes += ` preserveAspectRatio="${attrs.preserveAspectRatioValue}"`;
        }
        
        return svgCode.replace(/<svg[^>]*>/i, `<svg${newAttributes}>`);
    }

    /**
     * プレビューに補助線グリッドを描画します。
     */
    function drawGrid(svgElement, attrs, currentScale = 1.0) { // currentScale を引数に追加
        // (変更) 毎回グループを取得
        const gridGroup = gridSvg.querySelector('#grid-lines-group');
        if (!gridGroup) return; // 本来ありえないが、念のため

        if (!svgElement || !attrs) { // attrs もチェック
            gridGroup.innerHTML = '';
            return;
        }

        Object.assign(svgElement.style, {
            width: '100%',
            height: '100%',
        });
        gridSvg.style.width = '100%';
        gridSvg.style.height = '100%';

        try {
            const gridColor = gridColorPicker.value; 
            
            if (!attrs.viewBoxValue || !attrs.vbParts || !attrs.newViewBoxValue) { 
                gridGroup.innerHTML = '';
                return;
            }

            const [vbX, vbY, vbWidth, vbHeight] = attrs.vbParts;
            // (変更) newViewBoxValue をパースして newWidth/newHeight を取得
            const [newX, newY, newWidth, newHeight] = attrs.newViewBoxValue.split(' ').map(Number);


            gridSvg.setAttribute('viewBox', attrs.newViewBoxValue);
            pointSvg.setAttribute('viewBox', attrs.newViewBoxValue); // (新規) pointSvg にも設定
            
            if (attrs.preserveAspectRatioValue) {
                gridSvg.setAttribute('preserveAspectRatio', attrs.preserveAspectRatioValue);
                pointSvg.setAttribute('preserveAspectRatio', attrs.preserveAspectRatioValue); // (新規) pointSvg にも設定
                svgElement.setAttribute('preserveAspectRatio', attrs.preserveAspectRatioValue); 
            } else {
                gridSvg.removeAttribute('preserveAspectRatio'); 
                pointSvg.removeAttribute('preserveAspectRatio'); // (新規) pointSvg からも削除
                svgElement.removeAttribute('preserveAspectRatio');
            }

            const cols = Math.max(1, Math.min(GRID_MAX_DIVISIONS, parseInt(gridColsInput.value, 10) || 1));
            const rows = Math.max(1, Math.min(GRID_MAX_DIVISIONS, parseInt(gridRowsInput.value, 10) || 1));
            const zIndexOption = gridZSelect.value;
            
            // (★変更) zIndexOption が 'none' ならグリッドを消して終了
            if (zIndexOption === 'none') {
                gridGroup.innerHTML = ''; // グリッドの内容をクリア
                userSvgWrapper.style.zIndex = '10'; // ユーザーSVGを前面に
                gridSvg.style.zIndex = '0';      // グリッドSVGを背面に
                return; // これ以降の描画処理をスキップ
            }

            // (新規) コンテナサイズ取得
            const containerWidth = preview.clientWidth;
            const containerHeight = preview.clientHeight;

            // (新規) ゼロ除算防止
            if (containerWidth <= 0 || containerHeight <= 0 || newWidth <= 0 || newHeight <= 0) {
                gridGroup.innerHTML = ''; // (変更)
                return;
            }

            // (新規) 1ピクセルがviewBox単位でいくつに相当するかを計算
            const containerAspect = containerWidth / containerHeight;
            const viewBoxAspect = newWidth / newHeight; // (変更) newWidth/newHeight を使用

            let unitsPerPixel;
            // (変更) `preserveAspectRatio` の "meet" ロックに基づいて計算
            if (viewBoxAspect > containerAspect) {
                // ViewBox is wider than container, so width is the limiting dimension
                unitsPerPixel = newWidth / (containerWidth * currentScale);
            } else {
                // ViewBox is taller than container (or same aspect), so height is the limiting dimension
                unitsPerPixel = newHeight / (containerHeight * currentScale);
            }

            // (新規) 画面ピクセルベースでサイズを定義
            const desiredStrokeWidthPx = 1;
            const desiredFontSizePx = 10;
            const desiredGapPx = 2; // 線とテキストの隙間

            // (新規) viewBox単位に変換
            const dynamicStrokeWidth = desiredStrokeWidthPx * unitsPerPixel;
            const dynamicFontSize = desiredFontSizePx * unitsPerPixel;
            const textOffset = desiredGapPx * unitsPerPixel; // 隙間

            let pathD = '';
            let textElements = ''; // (変更) テキスト要素用の文字列を初期化
            
            // (削除) 以前の baseFontSize, baseStrokeWidth の計算を削除

            if (cols > 1) {
                for (let i = 1; i < cols; i++) {
                    const x = vbX + (vbWidth / cols) * i;
                    pathD += `M ${x} ${vbY} V ${vbY + vbHeight} `; 
                    
                    // (変更) dynamicFontSize, textOffset を使用し、dominant-baseline を調整
                    const yPos = vbY - textOffset; // 線の上側にオフセット
                    textElements += `<text x="${x}" y="${yPos}" 
                                          font-size="${dynamicFontSize}" fill="${gridColor}" 
                                          text-anchor="middle" dominant-baseline="text-after-edge">
                                        ${x.toFixed(0)}
                                    </text>`;
                }
            }
            if (rows > 1) {
                for (let j = 1; j < rows; j++) {
                    const y = vbY + (vbHeight / rows) * j;
                    pathD += `M ${vbX} ${y} H ${vbX + vbWidth} `; 

                    // (変更) dynamicFontSize, textOffset を使用
                    const xPos = vbX - textOffset; // 線の左側にオフセット
                    textElements += `<text x="${xPos}" y="${y}" 
                                          font-size="${dynamicFontSize}" fill="${gridColor}" 
                                          text-anchor="end" dominant-baseline="middle">
                                        ${y.toFixed(0)}
                                    </text>`;
                }
            }
            
            // (変更) strokeWidth を dynamicStrokeWidth に
            const borderPathD = `M ${vbX} ${vbY} H ${vbX + vbWidth} V ${vbY + vbHeight} H ${vbX} Z`;

            // (変更) gridGroup の innerHTML に <path> と <text> を設定 (<g> ラッパー削除)
            gridGroup.innerHTML = `<path d="${borderPathD} ${pathD}" 
                                          stroke="${gridColor}" stroke-width="${dynamicStrokeWidth}" 
                                          fill="none" />
                                     ${textElements}`;


            if (zIndexOption === 'back') {
                userSvgWrapper.style.zIndex = '10';
                gridSvg.style.zIndex = '0';
            } else { // 'front' の場合 ( 'none' は上で処理済み)
                userSvgWrapper.style.zIndex = '0';
                gridSvg.style.zIndex = '10';
            }

        } catch (e) {
            console.error("Failed to apply viewBox border or grid: ", e);
            gridGroup.innerHTML = ''; // (変更)
        }
    }
    
    /**
     * SVGを解析、更新、描画するメイン関数
     */
    function renderPreview() {
        const svgCodeRaw = editor.value;
        lastSvgAttrs = parseSvgAttributes(svgCodeRaw); // (変更) 属性をグローバルに保存
        const svgCodeUpdated = updateSvgAttributes(svgCodeRaw, lastSvgAttrs);

        userSvgWrapper.innerHTML = svgCodeUpdated; 
        const svgElement = userSvgWrapper.querySelector('svg'); 
        drawGrid(svgElement, lastSvgAttrs, scale); // (変更) scale を渡す
    }

    // --- Pan & Zoom ---

    function applyPanZoom() {
        svgContainer.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
    }

    function initPanZoom() {
        // ホイールズーム (マウスカーソル中心)
        preview.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -PAN_ZOOM_STEP : PAN_ZOOM_STEP;
            const newScale = parseFloat(Math.max(PAN_ZOOM_MIN, scale + delta).toFixed(2));
            
            const rect = preview.getBoundingClientRect();
            const mouseX = e.clientX - rect.left; 
            const mouseY = e.clientY - rect.top; 

            const targetX = (mouseX - translateX) / scale;
            const targetY = (mouseY - translateY) / scale;
            
            translateX = mouseX - targetX * newScale;
            translateY = mouseY - targetY * newScale;
            scale = newScale;
            
            applyPanZoom();

            // (新規) ズーム後にグリッドを再描画
            const svgElement = userSvgWrapper.querySelector('svg');
            drawGrid(svgElement, lastSvgAttrs, scale);

            // (新規) ズーム後、座標表示がONなら即時更新
            // (変更) チェックボックスの代わりに数値入力の値を確認
            if (coordsDecimalPlacesInput && parseInt(coordsDecimalPlacesInput.value, 10) >= 0) {
                updateCursorCoords(e); // DOMContentLoadedスコープの関数を呼ぶ
            }
        });

        // パン (ドラッグ)
        preview.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            isPanning = true;
            panStartX = e.clientX - translateX;
            panStartY = e.clientY - translateY;
            preview.style.cursor = 'grabbing';
        });
        preview.addEventListener('mousemove', (e) => {
            if (!isPanning) return;
            translateX = e.clientX - panStartX;
            translateY = e.clientY - panStartY;
            applyPanZoom();
            // (注) パンではスケールは変わらないのでグリッド再描画は不要
        });
        preview.addEventListener('mouseup', () => {
            isPanning = false;
            preview.style.cursor = 'default';
        });
        preview.addEventListener('mouseleave', () => {
            isPanning = false;
            preview.style.cursor = 'default';
        });
    }

    // --- スニペット(雛形) ---
    // (変更) $1 カーソルマーカーの導入、スニペットの追加
    const snippets = {
        // --- 基本・コンテナ ---
        '=': '="$1"',
        '.w': 'width="$1"',
        '.h': 'height="$1"',
        '.f': 'fill="$1"',
        '.s': 'stroke="$1"',
        'sw': 'stroke-width="$1"',
        'slc': 'stroke-linecap="$1"',
        'slj': 'stroke-linejoin="$1"',
        '.t': 'transform="$1"',
        'tl': 'translate($1,)',
        'rot': 'rotate($1, cx, cy)',
        '<svg': '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">\n\t$1\n</svg>',
        '<g': '<g>\n\t$1\n</g>',
        '<defs': '<defs>\n\t$1\n</defs>',
        '<def': '<defs>\n\t$1\n</defs>',

        // --- 基本図形 ---
        '<r': '<rect x="$1" y="" width="" height="" fill="#888"/>',
        '</r': '</rect>',
        '<c': '<circle cx="$1" cy="" r="" fill="#888"/>',
        '</c': '</circle>',
        '<e': '<ellipse cx="$1" cy="" rx="" ry="" fill="#888">',
        '</e': '</ellipse>',
        '<l': '<line x1="$1" y1="" x2="" y2="" stroke="#888" stroke-width=""/>',
        '</e': '</line>',
        '<pl': '<polyline points="$1" fill="none" stroke="#888" stroke-width=""/>',
        '</pl': '</polyline>',
        '<pg': '<polygon points="$1" fill="#888"/>',
        '</pg': '</polugon>',
        '<p': '<path d="$1" fill="none" stroke="#888" stroke-width=""/>',
        '</p': '</path>',

        // --- テキスト関連 ---
        '<t': '<text x="$1" y="" fill="#888" font-size="">text</text>',
        '<ts': '<tspan x="$1" y="" dy="">text</tspan>',
        '<tp': '<textPath href="#$1" startOffset="0%">text</textPath>',

        // --- 構造・再利用 ---
        '<use': '<use href="#$1" x="" y=""/>',
        '<sym': '<symbol id="$1" viewBox="0 0 100 100">\n\t\n</symbol>',

        // --- 塗り・線（Gradient, Pattern, Marker） ---
        '<lg': '<linearGradient id="$1" x1="0%" y1="0%" x2="100%" y2="0%">\n\t<stop offset="0%" stop-color="" />\n\t<stop offset="100%" stop-color="" />\n</linearGradient>',
        '<rg': '<radialGradient id="$1" cx="50%" cy="50%" r="50%">\n\t<stop offset="0%" stop-color="" />\n\t<stop offset="100%" stop-color="" />\n</radialGradient>',
        '<ptn': '<pattern id="$1" width="" height="" patternUnits="userSpaceOnUse">\n\t\n</pattern>',
        '<mrk': '<marker id="$1" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">\n\t<path d="M 0 0 L 10 5 L 0 10 z" fill="#000" />\n</marker>',

        // --- アニメーション (SMIL) ---
        '<anm': '<animate\n\tattributeName="$1"\n\tvalues=""\n\tkeyTimes=""\n\tdur="s"\n\trepeatCount="indefinite"\n\tcalcMode="spline"\n\tkeySplines=""\n/>',
        '<anmt': '<animateTransform\n\tattributeName="transform"\n\tattributeType="XML"\n\ttype="rotate"\n\tfrom="$1"\n\tto=""\n\tdur="s"\n\trepeatCount="indefinite"\n/>',
        '<anmm': '<animateMotion\n\tpath="$1"\n\tdur="s"\n\trepeatCount="indefinite"\n/>',
        '<set': '<set attributeName="$1" to="visible" begin="s"/>',

        // --- クリッピング・マスキング ---
        '<clp': '<clipPath id="$1">\n\t\n\t\n</clipPath>',
        '<msk': '<mask id="$1">\n\t\n\t\n</mask>',

        // --- フィルター効果 ---
        '<fil': '<filter id="$1" x="-20%" y="-20%" width="140%" height="140%">\n\t\n</filter>',
        '<fegb': '<feGaussianBlur in="SourceGraphic" stdDeviation="$1"/>',
        '<feo': '<feOffset dx="$1" dy=""/>',
        '<fem': '<feMerge>\n\t<feMergeNode in="$1"/>\n\t<feMergeNode in="SourceGraphic"/>\n</feMerge>',

        // --- その他（スタイル, リンク, アクセシビリティ） ---
        '<sty': '<style>\n\t.my-class {\n\t\tfill: #fff;\n\t\tstroke: #000;\n\t}\n</style>',
        '<a': '<a href="$1" target="_blank">\n\t\n</a>',
        '<title': '<title>$1</title>',
        '<desc': '<desc>$1</desc>'
        }

    // (変更) インデント機能を追加、スニペットトリガーを (Ctrl/Cmd + Enter) に変更
    // (変更) $1 カーソルマーカーに対応
    function initSnippets() {
        editor.addEventListener('keydown', (e) => {
            if (editor.readOnly) return;

            const start = editor.selectionStart;
            const end = editor.selectionEnd;
            const value = editor.value;

            // --- 1. スマートインデント (Enter) / スニペット (Ctrl+Enter) ---
            if (e.key === 'Enter') {
                
                // (A) スニペット判定 (Ctrl/Cmd + Enter)
                const textBeforeKey = value.substring(0, start);
                let triggerKey = Object.keys(snippets).find(key => textBeforeKey.endsWith(key));
                
                // (変更) e.ctrlKey (Win/Linux) または e.metaKey (Mac) が押されている場合のみ
                if (triggerKey && start === end && (e.ctrlKey || e.metaKey)) { 
                    e.preventDefault();
                    const snippetValue = snippets[triggerKey];
                    const newTextBefore = textBeforeKey.substring(0, textBeforeKey.length - triggerKey.length);
                    const textAfter = value.substring(end);
                    
                    // ▼▼▼ (変更) $1 カーソル位置特定ロジック ▼▼▼
                    let snippetFinalValue = snippetValue;
                    let newCursorPos;
                    const cursorMarkerIndex = snippetFinalValue.indexOf('$1');
                    
                    if (cursorMarkerIndex !== -1) {
                        snippetFinalValue = snippetFinalValue.replace('$1', ''); // マーカーを削除
                        newCursorPos = newTextBefore.length + cursorMarkerIndex;
                    } else {
                        // $1 がない場合、従来の "" を探す
                        const firstQuoteIndex = snippetFinalValue.indexOf('""');
                        if (firstQuoteIndex !== -1) {
                            newCursorPos = newTextBefore.length + firstQuoteIndex + 1;
                        } else {
                            // それもない場合は、スニペットの末尾
                            newCursorPos = newTextBefore.length + snippetFinalValue.length;
                        }
                    }
                    
                    editor.value = newTextBefore + snippetFinalValue + textAfter;
                    editor.selectionStart = editor.selectionEnd = newCursorPos;
                    // ▲▲▲ (変更) $1 カーソル位置特定ロジック ▲▲▲
                
                // (B) 通常の改行 (スマートインデント) 
                // (変更) Enterキー単体、またはスニペットが発動しない場合
                } else { 
                    e.preventDefault(); // デフォルトの改行をキャンセル

                    // 現在行のインデントを取得
                    const lastNewline = value.lastIndexOf('\n', start - 1);
                    const currentLineStart = lastNewline + 1;
                    // (変更) 現在行の全体を取得（カーソル位置までではなく）
                    const currentLineText = value.substring(currentLineStart, value.indexOf('\n', currentLineStart) === -1 ? value.length : value.indexOf('\n', currentLineStart));

                    const indentMatch = currentLineText.match(/^(\s*)/);
                    const indent = indentMatch ? indentMatch[1] : '';

                    // 改行とインデントを挿入
                    const textBefore = value.substring(0, start);
                    const textAfter = value.substring(end);
                    
                    editor.value = textBefore + '\n' + indent + textAfter;
                    // カーソル位置を更新
                    editor.selectionStart = editor.selectionEnd = start + 1 + indent.length;
                }
                
                renderPreview(); // プレビュー更新
                return; // Enterキーの処理はここで終了
            }

            // --- 2. インデント/アウトデント (Tab / Shift+Tab) ---
            // (変更なし。Tabキーによるスニペット起動は維持されます)
            if (e.key === 'Tab') {
                
                // (A) Shift + Tab (一括アウトデント)
                if (e.shiftKey) {
                    e.preventDefault(); // デフォルトのフォーカス移動をキャンセル
                    
                    // 選択範囲の開始行の頭を取得
                    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
                    
                    // 選択範囲の終了行の終わりを取得 (endが改行直後の場合はその行を含めない)
                    const lineEndTest = (end > lineStart && value[end - 1] === '\n') ? end - 1 : end;
                    // (変更) 終了行の末尾インデックスを取得
                    let lineEnd = value.indexOf('\n', lineEndTest);
                    if (lineEnd === -1) {
                        lineEnd = value.length; // 最終行の場合
                    }
                    
                    const selectedText = value.substring(lineStart, lineEnd);
                    
                    let removedCharsCount = 0;
                    let removedInFirstLine = 0;
                    let firstLine = true;

                    // 選択中の各行の先頭にあるタブまたはスペースを削除
                    const newSelectedText = selectedText.replace(/^(\t| {1,4})/gm, (match) => {
                        removedCharsCount += match.length;
                        if (firstLine) {
                            removedInFirstLine = match.length;
                        }
                        firstLine = false;
                        return ''; // 削除
                    });

                    if (removedCharsCount > 0) {
                        // テキストエリアの値を更新
                        editor.value = value.substring(0, lineStart) + newSelectedText + value.substring(lineEnd);
                        // 選択範囲を再設定
                        editor.selectionStart = Math.max(lineStart, start - removedInFirstLine);
                        editor.selectionEnd = Math.max(editor.selectionStart, end - removedCharsCount);
                    }

                // (B) Tab (一括インデント or スニペット or 通常タブ)
                } else {
                    
                    // (B-1) 範囲選択中のTab (一括インデント)
                    if (start !== end) {
                        e.preventDefault(); // デフォルトのタブ入力をキャンセル
                        
                        // (アウトデントと同じロジックで選択行を取得)
                        const lineStart = value.lastIndexOf('\n', start - 1) + 1;
                        const lineEndTest = (end > lineStart && value[end - 1] === '\n') ? end - 1 : end;
                        let lineEnd = value.indexOf('\n', lineEndTest);
                        if (lineEnd === -1) {
                            lineEnd = value.length;
                        }

                        const selectedText = value.substring(lineStart, lineEnd);

                        let addedCharsCount = 0;
                        // 選択中の各行の先頭にタブを追加
                        // (変更) 空行にはタブを追加しない
                        const newSelectedText = selectedText.replace(/^(.)/gm, (match, firstChar) => {
                            addedCharsCount++;
                            return '\t' + firstChar; // 行頭にタブを追加
                        });

                        if (addedCharsCount > 0) {
                            // テキストエリアの値を更新
                            editor.value = value.substring(0, lineStart) + newSelectedText + value.substring(lineEnd);
                            // 選択範囲を再設定
                            editor.selectionStart = start + 1; // 最初の行にタブが追加されたため
                            editor.selectionEnd = end + addedCharsCount;
                        }
                    
                    // (B-2) カーソルのみのTab (スニペット or 通常タブ)
                    } else {
                        // (既存のスニペット処理)
                        const textBeforeKey = value.substring(0, start);
                        let triggerKey = Object.keys(snippets).find(key => textBeforeKey.endsWith(key));

                        if (triggerKey) {
                            e.preventDefault();
                            const snippetValue = snippets[triggerKey];
                            const newTextBefore = textBeforeKey.substring(0, textBeforeKey.length - triggerKey.length);
                            const textAfter = value.substring(end);
                            
                            // ▼▼▼ (変更) $1 カーソル位置特定ロジック ▼▼▼
                            let snippetFinalValue = snippetValue;
                            let newCursorPos;
                            const cursorMarkerIndex = snippetFinalValue.indexOf('$1');
                            
                            if (cursorMarkerIndex !== -1) {
                                snippetFinalValue = snippetFinalValue.replace('$1', ''); // マーカーを削除
                                newCursorPos = newTextBefore.length + cursorMarkerIndex;
                            } else {
                                // $1 がない場合、従来の "" を探す
                                const firstQuoteIndex = snippetFinalValue.indexOf('""');
                                if (firstQuoteIndex !== -1) {
                                    newCursorPos = newTextBefore.length + firstQuoteIndex + 1;
                                } else {
                                    // それもない場合は、スニペットの末尾
                                    newCursorPos = newTextBefore.length + snippetFinalValue.length;
                                }
                            }
                            
                            editor.value = newTextBefore + snippetFinalValue + textAfter;
                            editor.selectionStart = editor.selectionEnd = newCursorPos;
                            // ▲▲▲ (変更) $1 カーソル位置特定ロジック ▲▲▲

                        } else {
                            // (変更) 通常のタブ挿入処理 (Undoスタックに対応)
                            e.preventDefault();
                            
                            // execCommandを使用してUndoスタックに登録する
                            // (これが失敗した場合のみフォールバック処理を行う)
                            if (!document.execCommand('insertText', false, '\t')) {
                                // フォールバック (従来の処理)
                                editor.value = value.substring(0, start) + '\t' + value.substring(end);
                                editor.selectionStart = editor.selectionEnd = start + 1;
                            }
                        }
                    }
                }
                renderPreview(); // Tabキーの処理はここでプレビュー更新
            }
        });
    }

    // --- Event Listeners Initialization ---

    function initEditorControls() {
        editor.addEventListener('input', () => {
            if (editor.readOnly) return;
            renderPreview();
        });

        bgPicker.addEventListener('input', (e) => setEditorBackground(e.target.value));

        textColorPicker.addEventListener('input', updateEditorTextColorBasedOnState);

        fontSizeInput.addEventListener('input', (e) => setEditorFontSize(e.target.value));

        minimizeCheckbox.addEventListener('change', () => {
            if (minimizeCheckbox.checked) {
                originalSvgContent = editor.value;
                // (変更) decimalPlacesInput.value から桁数を取得
                const digits = decimalPlacesInput.value; 
                editor.value = minifySvg(originalSvgContent, digits); // (変更) 桁数を渡す
                editor.readOnly = true;
            } else {
                editor.value = originalSvgContent;
                editor.readOnly = false;
            }
            // 状態変更後に文字色を更新
            updateEditorTextColorBasedOnState(); 
            renderPreview();
        });

        // (変更) 桁数入力が変更されたとき、最小化がチェックされていれば再実行
        decimalPlacesInput.addEventListener('input', () => {
            if (minimizeCheckbox.checked) {
                // (変更) decimalPlacesInput.value から桁数を取得
                const digits = decimalPlacesInput.value;
                editor.value = minifySvg(originalSvgContent, digits);
                renderPreview(); // プレビューを更新
            }
        });
    }

    function initPreviewControls() {
        previewBgPicker.addEventListener('input', (e) => {
            setPreviewBackground(e.target.value);
            renderPreview(); 
            updateSelectionPoint(); // (新規) 背景色が変わったらポイントのストロークも更新
        });
        gridColsInput.addEventListener('input', renderPreview);
        gridRowsInput.addEventListener('input', renderPreview);
        gridZSelect.addEventListener('change', renderPreview);
        gridColorPicker.addEventListener('input', () => { // (変更)
            renderPreview();
            updateSelectionPoint(); // (追加) 線色変更時もポイントを更新
        }); 
        // pointColorPicker.addEventListener('input', updateSelectionPoint); // (削除)
    }



    function initFileHandlers() {
        loadButton.addEventListener('click', () => fileInput.click());

        fileInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const svgContent = e.target.result;
                    editor.value = svgContent; 
                    
                    if (minimizeCheckbox.checked) {
                        minimizeCheckbox.checked = false;
                        editor.readOnly = false;
                        updateEditorTextColorBasedOnState(); 
                    }
                    renderPreview(); 
                };
                reader.readAsText(file);
            }
            event.target.value = null; 
        });
        
        saveButton.addEventListener('click', () => {
            const svgContent = editor.value;
            const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'edited.svg'; 
            document.body.appendChild(a); 
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
    }

    // --- Resizer ---
    function initResizer() {
        const parentContainer = resizer.parentElement;

        const handleResizeStart = (e) => {
            isResizing = true;
            document.body.classList.add('resizing'); // テキスト選択無効
            preview.style.pointerEvents = 'none'; 
            e.preventDefault(); 
        };

        const handleResizeMove = (e) => {
            if (!isResizing) return;

            const clientX = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
            const clientY = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
            if (clientX === 0 && clientY === 0) return; 

            const parentRect = parentContainer.getBoundingClientRect();
            const resizerRect = resizer.getBoundingClientRect();
            const isDesktop = window.innerWidth >= 768; // Tailwind md

            if (isDesktop) {
                // 左右リサイズ
                const gap = resizerRect.width;
                const totalWidth = parentRect.width - gap;
                let newPreviewWidth = clientX - parentRect.left - (gap / 2);

                if (newPreviewWidth < MIN_PANEL_SIZE) newPreviewWidth = MIN_PANEL_SIZE;
                
                const newEditorWidth = totalWidth - newPreviewWidth;
                if (newEditorWidth < MIN_PANEL_SIZE) {
                    newPreviewWidth = totalWidth - MIN_PANEL_SIZE;
                }

                previewContainer.style.flexBasis = `${(newPreviewWidth / totalWidth) * 100}%`;
                editorContainer.style.flexBasis = `${(newEditorWidth / totalWidth) * 100}%`;

            } else {
                // 上下リサイズ
                const gap = resizerRect.height;
                const totalHeight = parentRect.height - gap;
                let newPreviewHeight = clientY - parentRect.top - (gap / 2);

                if (newPreviewHeight < MIN_PANEL_SIZE) newPreviewHeight = MIN_PANEL_SIZE;

                const newEditorHeight = totalHeight - newPreviewHeight;
                if (newEditorHeight < MIN_PANEL_SIZE) {
                    newPreviewHeight = totalHeight - MIN_PANEL_SIZE;
                }
                
                previewContainer.style.flexBasis = `${(newPreviewHeight / totalHeight) * 100}%`;
                editorContainer.style.flexBasis = `${(newEditorHeight / totalHeight) * 100}%`;
            }
        };

        const handleResizeEnd = () => {
            isResizing = false;
            document.body.classList.remove('resizing');
            preview.style.pointerEvents = 'auto'; // 操作を元に戻す
        };

        // マウスイベント
        resizer.addEventListener('mousedown', handleResizeStart);
        document.addEventListener('mousemove', handleResizeMove);
        document.addEventListener('mouseup', handleResizeEnd);

        // タッチイベント
        resizer.addEventListener('touchstart', handleResizeStart, { passive: false });
        document.addEventListener('touchmove', handleResizeMove, { passive: false });
        document.addEventListener('touchend', handleResizeEnd);
        document.addEventListener('touchcancel', handleResizeEnd);
    }
    
    // (変更) エディタのテキスト選択を監視し、座標らしきものが選択されたらプレビューに点を描画します。
    function initSelectionHandler() {
        // (変更) pointColorPicker のチェックを削除
        if (!selectionPointGroup) { 
            console.error("Selection handler: Required elements (group) not found.");
            return;
        }

        // (変更) 関数を親スコープの変数に代入
        updateSelectionPoint = () => {
            
            // (2) 選択テキストを取得
            const selectionStart = editor.selectionStart;
            const selectionEnd = editor.selectionEnd;
            if (selectionStart === selectionEnd) {
                selectionPointGroup.innerHTML = '';
                return; // 選択範囲がない
            }

            const selectedText = editor.value.substring(selectionStart, selectionEnd).trim();

            // (3) テキストをパース (★ここから大幅に変更)
            // カンマ、スペース（改行含む）で数値を分割
            const numberStrings = selectedText.split(/[\s,]+/); 
            
            // 空の文字列を除外し、数値に変換
            const numbers = numberStrings
                .filter(s => s.trim() !== '') // 空文字列を除去
                .map(parseFloat);

            // パースした数値の配列 (points) を作成
            const points = [];
            // 数値が奇数個、またはNaNが含まれる場合は無効
            if (numbers.length % 2 !== 0 || numbers.some(isNaN)) {
                 // ただし、単一の数値（"50" など）が選択された場合は無視 (クリア)
                 selectionPointGroup.innerHTML = '';
                 return;
            }

            for (let i = 0; i < numbers.length; i += 2) {
                points.push({ x: numbers[i], y: numbers[i+1] });
            }

            // (4) パース失敗 or 座標情報がない場合はクリア
            if (points.length === 0 || !lastSvgAttrs || !lastSvgAttrs.newViewBoxValue) {
                selectionPointGroup.innerHTML = '';
                return;
            }

            // (5) 描画 (drawGridからロジックを拝借)
            try {
                // (変更) pointColor を削除し、previewBgColor を使用
                // const pointColor = pointColorPicker.value; // (削除)
                const previewBgColor = previewBgPicker.value;
                const gridColor = gridColorPicker.value; 

                const [newX, newY, newWidth, newHeight] = lastSvgAttrs.newViewBoxValue.split(' ').map(Number);
                
                const containerWidth = preview.clientWidth;
                const containerHeight = preview.clientHeight;
                
                if (containerWidth <= 0 || containerHeight <= 0 || newWidth <= 0 || newHeight <= 0) {
                    selectionPointGroup.innerHTML = '';
                    return;
                }
                
                const containerAspect = containerWidth / containerHeight;
                const viewBoxAspect = newWidth / newHeight;
                
                let unitsPerPixel;
                if (viewBoxAspect > containerAspect) {
                    unitsPerPixel = newWidth / (containerWidth * scale); // scale を考慮
                } else {
                    unitsPerPixel = newHeight / (containerHeight * scale); // scale を考慮
                }

                const radiusPx = 5;
                const strokePx = 1;
                const crosshairStrokePx = 1;
                
                const radius = radiusPx * unitsPerPixel;
                const strokeWidth = strokePx * unitsPerPixel;
                const crosshairStrokeWidth = crosshairStrokePx * unitsPerPixel;
                
                // (★ここからロジック分岐)
                let innerHtmlContent = '';

                if (points.length === 1) {
                    // --- ケース1: 単一の点 (既存ロジック) ---
                    const { x, y } = points[0];
                    innerHtmlContent = `
                        <circle cx="${x}" cy="${y}" r="${radius}" 
                                fill="${previewBgColor}" 
                                stroke="${gridColor}"
                                stroke-width="${strokeWidth}" 
                                style="pointer-events: none;" />
                        <line x1="${x - 2*radius}" y1="${y}" x2="${x + 2*radius}" y2="${y}"
                              stroke="${gridColor}"
                              stroke-width="${crosshairStrokeWidth}"
                              style="pointer-events: none;" />
                        <line x1="${x}" y1="${y - 2*radius}" x2="${x}" y2="${y + 2*radius}"
                              stroke="${gridColor}"
                              stroke-width="${crosshairStrokeWidth}"
                              style="pointer-events: none;" />
                        <text x="${x}" y="${y}" font-size="${2.5*radius}"
                              fill="${gridColor}"
                              stroke="${previewBgColor}"
                              stroke-width="${2*strokeWidth}"
                              paint-order="stroke">
                              　${x}, ${y}</text>
                    `;

                } else if (points.length > 1) {
                    // --- ケース2: 複数の点 (新機能) ---
                    
                    // 1. ポリラインの描画
                    const polylinePoints = points.map(p => `${p.x},${p.y}`).join(' ');
                    innerHtmlContent += `
                        <polyline points="${polylinePoints}"
                                  fill="none"
                                  stroke="${gridColor}"
                                  stroke-width="${crosshairStrokeWidth}" 
                                  style="pointer-events: none;" />
                    `;

                    // 2. 各点に小さな円と座標テキストを描画 (★変更箇所)
                    points.forEach((p, index) => {
                        // (★追加) 各点のx, yを取得
                        const { x, y } = p; 

                        // (★変更) ケース1（単一点）と全く同じ描画ロジックを適用
                        innerHtmlContent += `
                            <circle cx="${x}" cy="${y}" r="${radius}" 
                                    fill="${previewBgColor}" 
                                    stroke="${gridColor}"
                                    stroke-width="${strokeWidth}" 
                                    style="pointer-events: none;" />
                            <line x1="${x - 2*radius}" y1="${y}" x2="${x + 2*radius}" y2="${y}"
                                  stroke="${gridColor}"
                                  stroke-width="${crosshairStrokeWidth}"
                                  style="pointer-events: none;" />
                            <line x1="${x}" y1="${y - 2*radius}" x2="${x}" y2="${y + 2*radius}"
                                  stroke="${gridColor}"
                                  stroke-width="${crosshairStrokeWidth}"
                                  style="pointer-events: none;" />
                            <text x="${x}" y="${y}" font-size="${2.5*radius}"
                                  fill="${gridColor}"
                                  stroke="${previewBgColor}"
                                  stroke-width="${2*strokeWidth}"
                                  paint-order="stroke">
                                  　${x}, ${y}</text>
                        `;
                    });
                }
                
                selectionPointGroup.innerHTML = innerHtmlContent;

            } catch (e) {
                console.error("Failed to draw selection point:", e);
                selectionPointGroup.innerHTML = '';
            }
        };
        
        editor.addEventListener('mouseup', updateSelectionPoint);
        editor.addEventListener('keyup', updateSelectionPoint);
        
        // ズーム/パン操作 (スケール変更) が終わった時も再描画
        preview.addEventListener('wheel', updateSelectionPoint); // `wheel` イベントで `scale` が変わるので、再計算が必要
    }
    
    // (変更) プレビューエリアのマウス座標をSVG座標に変換してカーソル位置に表示します。
    function initCoordsDisplay() {
        // (変更) 必要なDOM要素をチェック
        if (!preview || !pointSvg || !cursorCoordsGroup || !coordsDecimalPlacesInput) { // (変更)
            console.error("Coords display: Missing required elements (preview, pointSvg, cursorCoordsGroup, or coordsDecimalPlacesInput)"); // (変更)
            return;
        }

        // (変更) 関数をグローバルスコープの変数に代入
        updateCursorCoords = (e) => {
            // (変更) 桁数を取得し、-1以下またはNaNならオフ
            const digits = parseInt(coordsDecimalPlacesInput.value, 10);
            if (isNaN(digits) || digits < 0) { // (変更)
                cursorCoordsGroup.innerHTML = '';
                return;
            }
            
            // (変更) パン（ドラッグ）中は（クリアせず）更新もしない
            if (isPanning) {
                // cursorCoordsGroup.innerHTML = ''; // クリア処理を削除
                return; // 更新せず、直前の表示を保持する
            }

            // pointSvg が viewBox 等でセットアップされている必要がある
            if (!lastSvgAttrs || !lastSvgAttrs.newViewBoxValue) {
                cursorCoordsGroup.innerHTML = '';
                return;
            }

            try {
                const ctm = pointSvg.getScreenCTM();
                if (!ctm) {
                    cursorCoordsGroup.innerHTML = '';
                    return; // CTMが取得できない
                }

                const svgPoint = pointSvg.createSVGPoint();
                svgPoint.x = e.clientX;
                svgPoint.y = e.clientY;
                
                // スクリーン座標をSVG座標に変換
                const transformedPoint = svgPoint.matrixTransform(ctm.inverse());
                
                const svgX = transformedPoint.x;
                const svgY = transformedPoint.y;

                // --- 座標テキストの描画ロジック (selectionHandlerから流用・変更) ---
                const gridColor = gridColorPicker.value;
                const previewBgColor = previewBgPicker.value;
                
                const [newX, newY, newWidth, newHeight] = lastSvgAttrs.newViewBoxValue.split(' ').map(Number);
                const containerWidth = preview.clientWidth;
                const containerHeight = preview.clientHeight;
                
                if (containerWidth <= 0 || containerHeight <= 0 || newWidth <= 0 || newHeight <= 0) {
                    cursorCoordsGroup.innerHTML = '';
                    return;
                }
                
                const containerAspect = containerWidth / containerHeight;
                const viewBoxAspect = newWidth / newHeight;
                
                let unitsPerPixel;
                if (viewBoxAspect > containerAspect) {
                    unitsPerPixel = newWidth / (containerWidth * scale); // scale を考慮
                } else {
                    unitsPerPixel = newHeight / (containerHeight * scale); // scale を考慮
                }

                const fontSizePx = 10;
                const strokePx = 2;
                const textOffsetPx = 3; // カーソルからのオフセット（ピクセル）

                const dynamicFontSize = fontSizePx * unitsPerPixel;
                const dynamicStrokeWidth = strokePx * unitsPerPixel;
                const dynamicTextOffset = textOffsetPx * unitsPerPixel;

                // (変更) digits を使ってフォーマット
                const displayText = `${svgX.toFixed(digits)}, ${svgY.toFixed(digits)}`;
                
                // (変更) カーソルの少し上（Y座標を減らす）に表示
                const textYPos = svgY - dynamicTextOffset; 

                cursorCoordsGroup.innerHTML = `
                    <text x="${svgX}" y="${textYPos}" 
                          font-size="${dynamicFontSize}"
                          fill="${gridColor}"
                          stroke="${previewBgColor}"
                          stroke-width="${dynamicStrokeWidth}"
                          paint-order="stroke"
                          text-anchor="middle"
                          dominant-baseline="text-after-edge"
                          style="pointer-events: none;">
                          ${displayText}
                    </text>
                `;
                // --- 描画ロジックここまで ---

            } catch (err) {
                // CTMが逆行列を持たない場合などにエラー
                console.error("Error transforming coordinates:", err);
                cursorCoordsGroup.innerHTML = '';
            }
        };

        const handlePreviewMouseLeave = () => {
            // マウスが外れたらリセット
            cursorCoordsGroup.innerHTML = '';
        };
        
        // (変更) 数値入力が変更されたら（-1になった場合など）クリア処理を実行
        coordsDecimalPlacesInput.addEventListener('input', () => { // (変更)
            if (parseInt(coordsDecimalPlacesInput.value, 10) < 0) { // (変更)
                cursorCoordsGroup.innerHTML = '';
            }
        });

        preview.addEventListener('mousemove', updateCursorCoords);
        preview.addEventListener('mouseleave', handlePreviewMouseLeave);
    }

    // --- Initialization ---

    // 初期スタイルの適用
    setEditorBackground(bgPicker.value);
    updateEditorTextColorBasedOnState(); 
    setEditorFontSize(fontSizeInput.value);
    setPreviewBackground(previewBgPicker.value); 

    // ページ読み込み時に最初のプレビューを実行
    renderPreview();

    // (変更) 各機能のイベントリスナーを初期化
    initEditorControls();
    initSelectionHandler(); 
    initPreviewControls();
    initCoordsDisplay(); // (変更) PanZoom より先に呼び出す
    initPanZoom();       // (変更) CoordsDisplay より後に呼び出す
    initFileHandlers();
    initSnippets();
    initResizer();

});
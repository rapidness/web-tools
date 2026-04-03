/**
 * PDF Annotator Web Component
 * 支持 PDF 和 JSON 数据的传入传出
 */

class PDFAnnotator extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    
    // 内部状态
    this.pdfDoc = null;
    this.currentPage = 1;
    this.scale = 1.5;
    this.rectangles = [];
    this.selectedRectId = null;
    this.isDrawing = false;
    this.isDragging = false;
    this.isResizing = false;
    this.resizeDirection = '';
    this.startX = 0;
    this.startY = 0;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.currentRect = null;
    this.RESIZE_HANDLE_SIZE = 8;
    
    // PDF.js 配置
    if (typeof pdfjsLib !== 'undefined') {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
  }

  static get observedAttributes() {
    return ['pdf-url', 'pdf-data', 'json-data', 'theme'];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    
    switch(name) {
      case 'pdf-url':
        if (newValue) this.loadPDFFromUrl(newValue);
        break;
      case 'pdf-data':
        if (newValue) this.loadPDFFromBase64(newValue);
        break;
      case 'json-data':
        if (newValue) this.loadAnnotations(JSON.parse(newValue));
        break;
    }
  }

  connectedCallback() {
    this.render();
    this.setupEventListeners();
  }

  render() {
    const style = `
      <style>
        :host {
          display: block;
          width: 100%;
          height: 100%;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          --bg-primary: #f8fafc;
          --bg-secondary: #ffffff;
          --bg-card: #f1f5f9;
          --bg-input: #ffffff;
          --border-color: #e2e8f0;
          --text-primary: #1e293b;
          --text-secondary: #64748b;
          --text-muted: #94a3b8;
          --accent: #6366f1;
          --accent-hover: #4f46e5;
          --accent-glow: rgba(99, 102, 241, 0.15);
          --success: #10b981;
          --danger: #ef4444;
          --radius: 12px;
          --transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .container {
          height: 100%;
          display: flex;
          flex-direction: column;
          background: var(--bg-primary);
        }

        .header {
          background: var(--bg-secondary);
          border-bottom: 1px solid var(--border-color);
          padding: 12px 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 0.8rem;
          font-weight: 500;
          cursor: pointer;
          transition: var(--transition);
          border: none;
          white-space: nowrap;
        }

        .btn-primary {
          background: var(--accent);
          color: white;
        }

        .btn-primary:hover {
          background: var(--accent-hover);
        }

        .btn-secondary {
          background: var(--bg-card);
          color: var(--text-secondary);
          border: 1px solid var(--border-color);
        }

        .btn-secondary:hover {
          border-color: var(--accent);
          color: var(--text-primary);
        }

        .main {
          flex: 1;
          display: flex;
          overflow: hidden;
        }

        .pdf-viewer {
          flex: 1;
          overflow: auto;
          padding: 16px;
          position: relative;
        }

        .canvas-wrapper {
          position: relative;
          display: inline-block;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
          border-radius: 6px;
          overflow: hidden;
          background: white;
        }

        #pdfCanvas, #drawCanvas {
          display: block;
        }

        #drawCanvas {
          position: absolute;
          top: 0;
          left: 0;
          cursor: crosshair;
        }

        .upload-prompt {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          text-align: center;
          color: var(--text-muted);
        }

        .sidebar {
          width: 320px;
          background: var(--bg-secondary);
          border-left: 1px solid var(--border-color);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .sidebar-header {
          padding: 12px 16px;
          border-bottom: 1px solid var(--border-color);
          background: var(--bg-card);
        }

        .page-selector {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .page-selector label {
          font-size: 0.8rem;
          color: var(--text-secondary);
        }

        .page-selector select {
          flex: 1;
          padding: 4px 8px;
          border: 1px solid var(--border-color);
          border-radius: 4px;
          font-size: 0.8rem;
          background: var(--bg-input);
          color: var(--text-primary);
        }

        .rectangles-list {
          flex: 1;
          overflow-y: auto;
          padding: 12px;
        }

        .rect-card {
          background: var(--bg-card);
          border: 2px solid var(--border-color);
          border-radius: 8px;
          padding: 12px;
          margin-bottom: 8px;
          cursor: pointer;
          transition: var(--transition);
        }

        .rect-card:hover {
          border-color: var(--accent);
        }

        .rect-card.selected {
          border-color: var(--accent);
          background: var(--accent-glow);
        }

        .rect-card-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 8px;
          gap: 6px;
        }

        .rect-name-input {
          font-weight: 600;
          font-size: 0.9rem;
          color: var(--text-primary);
          flex: 1;
          border: 1px solid transparent;
          background: transparent;
          padding: 3px 6px;
          border-radius: 4px;
          transition: var(--transition);
        }

        .rect-name-input:focus {
          outline: none;
          border-color: var(--accent);
          background: var(--bg-input);
        }

        .rect-actions {
          display: flex;
          gap: 4px;
        }

        .icon-btn {
          width: 24px;
          height: 24px;
          border-radius: 4px;
          border: none;
          background: transparent;
          color: var(--text-secondary);
          cursor: pointer;
          transition: var(--transition);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;
        }

        .icon-btn:hover {
          background: var(--bg-input);
          color: var(--accent);
        }

        .icon-btn.delete:hover {
          color: var(--danger);
        }

        .rect-coords {
          font-size: 0.7rem;
          color: var(--text-muted);
          font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
          margin-bottom: 8px;
          padding: 6px;
          background: var(--bg-input);
          border-radius: 4px;
        }

        .rect-metadata {
          border-top: 1px solid var(--border-color);
          padding-top: 8px;
        }

        .metadata-row {
          display: flex;
          gap: 4px;
          margin-bottom: 6px;
          align-items: center;
        }

        .metadata-key {
          flex: 0.8;
          padding: 4px 8px;
          border: 1px solid var(--border-color);
          border-radius: 4px;
          font-size: 0.75rem;
          background: var(--bg-input);
          color: var(--text-primary);
          min-width: 0;
        }

        .metadata-value {
          flex: 1;
          padding: 4px 8px;
          border: 1px solid var(--border-color);
          border-radius: 4px;
          font-size: 0.75rem;
          background: var(--bg-input);
          color: var(--text-primary);
          min-width: 0;
        }

        .delete-metadata {
          flex-shrink: 0;
          width: 24px;
          height: 24px;
        }

        .add-metadata-btn {
          width: 100%;
          padding: 4px;
          border: 1px dashed var(--border-color);
          border-radius: 4px;
          background: transparent;
          color: var(--text-muted);
          font-size: 0.75rem;
          cursor: pointer;
          transition: var(--transition);
          margin-top: 6px;
        }

        .add-metadata-btn:hover {
          border-color: var(--accent);
          color: var(--accent);
        }

        .empty-state {
          text-align: center;
          padding: 40px 16px;
          color: var(--text-muted);
        }

        .stats-bar {
          padding: 8px 16px;
          border-top: 1px solid var(--border-color);
          background: var(--bg-card);
          font-size: 0.75rem;
          color: var(--text-secondary);
          display: flex;
          justify-content: space-between;
        }

        .toast {
          position: fixed;
          bottom: 20px;
          right: 20px;
          padding: 10px 16px;
          background: var(--bg-secondary);
          border: 1px solid var(--success);
          border-radius: 6px;
          color: var(--success);
          font-size: 0.8rem;
          transform: translateY(100px);
          opacity: 0;
          transition: var(--transition);
          z-index: 10000;
        }

        .toast.show {
          transform: translateY(0);
          opacity: 1;
        }

        input[type="file"] {
          display: none;
        }
      </style>
    `;

    this.shadowRoot.innerHTML = `
      ${style}
      <div class="container">
        <div class="header">
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-primary" id="uploadBtn">📤 上传PDF</button>
            <button class="btn btn-secondary" id="importJsonBtn">📥 导入JSON</button>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-secondary" id="exportJsonBtn">💾 导出JSON</button>
          </div>
        </div>
        
        <input type="file" id="fileInput" accept=".pdf">
        <input type="file" id="jsonFileInput" accept=".json">
        
        <div class="main">
          <div class="pdf-viewer" id="pdfViewer">
            <div class="upload-prompt" id="uploadPrompt">
              <p>点击"上传PDF"或"导入JSON"加载文件</p>
            </div>
            <div class="canvas-wrapper" id="canvasWrapper" style="display: none;">
              <canvas id="pdfCanvas"></canvas>
              <canvas id="drawCanvas"></canvas>
            </div>
          </div>
          
          <div class="sidebar">
            <div class="sidebar-header">
              <div class="page-selector" id="pageSelector" style="display: none;">
                <label>页码：</label>
                <select id="pageSelect"></select>
              </div>
            </div>
            <div class="rectangles-list" id="rectanglesList">
              <div class="empty-state">
                <p>在PDF上拖拽绘制矩形</p>
              </div>
            </div>
            <div class="stats-bar" id="statsBar" style="display: none;">
              <span id="rectCount">0 个标注</span>
              <span id="pageInfo">第 1 页</span>
            </div>
          </div>
        </div>
      </div>
      
      <div class="toast" id="toast"></div>
    `;
  }

  setupEventListeners() {
    const shadow = this.shadowRoot;
    
    // 文件上传
    shadow.getElementById('uploadBtn').addEventListener('click', () => {
      shadow.getElementById('fileInput').click();
    });
    
    shadow.getElementById('fileInput').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file && file.type === 'application/pdf') {
        this.loadPDFFromFile(file);
      }
    });
    
    // JSON导入
    shadow.getElementById('importJsonBtn').addEventListener('click', () => {
      shadow.getElementById('jsonFileInput').click();
    });
    
    shadow.getElementById('jsonFileInput').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const data = JSON.parse(event.target.result);
            this.loadAnnotations(data);
          } catch (err) {
            this.showToast('JSON格式错误');
          }
        };
        reader.readAsText(file);
      }
    });
    
    // JSON导出
    shadow.getElementById('exportJsonBtn').addEventListener('click', () => {
      this.exportAnnotations();
    });
    
    // 页码选择
    shadow.getElementById('pageSelect').addEventListener('change', (e) => {
      this.currentPage = parseInt(e.target.value);
      this.renderPage(this.currentPage);
      this.updateRectanglesList();
    });
    
    // Canvas事件
    const drawCanvas = shadow.getElementById('drawCanvas');
    drawCanvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    drawCanvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    drawCanvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
  }

  // 公共API方法
  
  /**
   * 从URL加载PDF
   */
  async loadPDFFromUrl(url) {
    try {
      const loadingTask = pdfjsLib.getDocument(url);
      this.pdfDoc = await loadingTask.promise;
      this.currentPage = 1;
      this.rectangles = [];
      this.selectedRectId = null;
      
      this.setupPageSelector();
      await this.renderPage(this.currentPage);
      this.updateRectanglesList();
      this.showToast('PDF加载成功');
      this.dispatchEvent(new CustomEvent('pdf-loaded', { detail: { totalPages: this.pdfDoc.numPages } }));
    } catch (error) {
      this.showToast('PDF加载失败: ' + error.message);
      console.error('PDF加载失败:', error);
    }
  }

  /**
   * 从File对象加载PDF
   */
  async loadPDFFromFile(file) {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    this.pdfDoc = await loadingTask.promise;
    this.currentPage = 1;
    this.rectangles = [];
    this.selectedRectId = null;
    
    this.setupPageSelector();
    await this.renderPage(this.currentPage);
    this.updateRectanglesList();
    this.showToast('PDF加载成功');
    this.dispatchEvent(new CustomEvent('pdf-loaded', { detail: { totalPages: this.pdfDoc.numPages, fileName: file.name } }));
  }

  /**
   * 从Base64加载PDF
   */
  async loadPDFFromBase64(base64Data) {
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    const loadingTask = pdfjsLib.getDocument({ data: bytes.buffer });
    this.pdfDoc = await loadingTask.promise;
    this.currentPage = 1;
    this.rectangles = [];
    this.selectedRectId = null;
    
    this.setupPageSelector();
    await this.renderPage(this.currentPage);
    this.updateRectanglesList();
    this.showToast('PDF加载成功');
    this.dispatchEvent(new CustomEvent('pdf-loaded', { detail: { totalPages: this.pdfDoc.numPages } }));
  }

  /**
   * 加载标注数据（JSON）
   */
  loadAnnotations(data) {
    if (data.rectangles && Array.isArray(data.rectangles)) {
      this.rectangles = data.rectangles;
      
      // 如果有PDF数据，先加载PDF
      if (data.pdfBase64) {
        this.loadPDFFromBase64(data.pdfBase64).then(() => {
          this.updateRectanglesList();
          this.redrawRectangles();
          this.showToast('标注数据加载成功');
          this.dispatchEvent(new CustomEvent('annotations-loaded', { detail: { count: this.rectangles.length } }));
        });
      } else {
        this.updateRectanglesList();
        this.redrawRectangles();
        this.showToast('标注数据加载成功');
        this.dispatchEvent(new CustomEvent('annotations-loaded', { detail: { count: this.rectangles.length } }));
      }
    }
  }

  /**
   * 获取标注数据（JSON）
   */
  getAnnotations() {
    return {
      exportTime: new Date().toISOString(),
      totalPages: this.pdfDoc ? this.pdfDoc.numPages : 0,
      rectangles: this.rectangles
    };
  }

  /**
   * 导出标注为JSON文件
   */
  exportAnnotations() {
    if (this.rectangles.length === 0) {
      this.showToast('没有可导出的标注');
      return;
    }
    
    const data = this.getAnnotations();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pdf-annotations-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.showToast('导出成功');
    
    this.dispatchEvent(new CustomEvent('annotations-exported', { detail: data }));
  }

  /**
   * 获取PDF Base64
   */
  async getPDFBase64() {
    if (!this.pdfDoc) return null;
    // 需要原始PDF数据，这里返回null，建议在load时保存
    return this._originalPdfBase64 || null;
  }

  // 内部方法

  setupPageSelector() {
    const shadow = this.shadowRoot;
    const pageSelect = shadow.getElementById('pageSelect');
    pageSelect.innerHTML = '';
    
    for (let i = 1; i <= this.pdfDoc.numPages; i++) {
      const option = document.createElement('option');
      option.value = i;
      option.textContent = `第 ${i} 页`;
      pageSelect.appendChild(option);
    }
    
    shadow.getElementById('pageSelector').style.display = 'flex';
    shadow.getElementById('statsBar').style.display = 'flex';
    shadow.getElementById('uploadPrompt').style.display = 'none';
    shadow.getElementById('canvasWrapper').style.display = 'inline-block';
  }

  async renderPage(pageNum) {
    const page = await this.pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: this.scale });
    
    const shadow = this.shadowRoot;
    const pdfCanvas = shadow.getElementById('pdfCanvas');
    const drawCanvas = shadow.getElementById('drawCanvas');
    
    pdfCanvas.width = viewport.width;
    pdfCanvas.height = viewport.height;
    drawCanvas.width = viewport.width;
    drawCanvas.height = viewport.height;
    
    const pdfContext = pdfCanvas.getContext('2d');
    await page.render({
      canvasContext: pdfContext,
      viewport: viewport
    }).promise;
    
    shadow.getElementById('pageInfo').textContent = `第 ${pageNum} 页`;
    this.redrawRectangles();
  }

  handleMouseDown(e) {
    const rect = this.shadowRoot.getElementById('drawCanvas').getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const resizeHandle = this.getResizeHandle(mouseX, mouseY);
    if (resizeHandle) {
      this.isResizing = true;
      this.resizeDirection = resizeHandle.direction;
      this.startX = mouseX;
      this.startY = mouseY;
      this.currentRect = resizeHandle.rect;
      return;
    }
    
    const clickedRect = this.getRectAtPosition(mouseX, mouseY);
    if (clickedRect) {
      this.selectedRectId = clickedRect.id;
      this.isDragging = true;
      this.dragStartX = mouseX - clickedRect.x;
      this.dragStartY = mouseY - clickedRect.y;
      this.updateRectanglesList();
      this.redrawRectangles();
      return;
    }
    
    this.isDrawing = true;
    this.startX = mouseX;
    this.startY = mouseY;
  }

  handleMouseMove(e) {
    const rect = this.shadowRoot.getElementById('drawCanvas').getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    if (this.isResizing && this.currentRect) {
      this.handleResize(mouseX, mouseY);
      this.redrawRectangles();
      this.updateRectanglesList();
      return;
    }
    
    if (this.isDragging && this.selectedRectId) {
      const movingRect = this.rectangles.find(r => r.id === this.selectedRectId);
      if (movingRect) {
        movingRect.x = Math.max(0, Math.min(mouseX - this.dragStartX, this.shadowRoot.getElementById('drawCanvas').width - movingRect.width));
        movingRect.y = Math.max(0, Math.min(mouseY - this.dragStartY, this.shadowRoot.getElementById('drawCanvas').height - movingRect.height));
        this.redrawRectangles();
        this.updateRectanglesList();
      }
      return;
    }
    
    if (!this.isDrawing) {
      const resizeHandle = this.getResizeHandle(mouseX, mouseY);
      if (resizeHandle) {
        this.shadowRoot.getElementById('drawCanvas').style.cursor = resizeHandle.cursor;
      } else if (this.getRectAtPosition(mouseX, mouseY)) {
        this.shadowRoot.getElementById('drawCanvas').style.cursor = 'move';
      } else {
        this.shadowRoot.getElementById('drawCanvas').style.cursor = 'crosshair';
      }
      return;
    }
    
    this.redrawRectangles();
    this.drawRect(this.startX, this.startY, mouseX - this.startX, mouseY - this.startY, '#6366f1', 2, true);
  }

  handleMouseUp(e) {
    if (this.isResizing) {
      this.isResizing = false;
      this.resizeDirection = '';
      this.currentRect = null;
      this.updateRectanglesList();
      return;
    }
    
    if (this.isDragging) {
      this.isDragging = false;
      return;
    }
    
    if (!this.isDrawing) return;
    this.isDrawing = false;
    
    const rect = this.shadowRoot.getElementById('drawCanvas').getBoundingClientRect();
    const endX = e.clientX - rect.left;
    const endY = e.clientY - rect.top;
    
    const x = Math.min(this.startX, endX);
    const y = Math.min(this.startY, endY);
    const width = Math.abs(endX - this.startX);
    const height = Math.abs(endY - this.startY);
    
    if (width > 10 && height > 10) {
      const newRect = {
        id: Date.now(),
        page: this.currentPage,
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(width),
        height: Math.round(height),
        name: `标注 ${this.rectangles.length + 1}`,
        metadata: [{ key: '', value: '' }]
      };
      
      this.rectangles.push(newRect);
      this.selectedRectId = newRect.id;
      this.updateRectanglesList();
      this.redrawRectangles();
      this.showToast('标注已添加');
      
      this.emitAnnotationsChange();
    } else {
      this.redrawRectangles();
    }
  }

  getRectAtPosition(x, y) {
    const pageRects = this.rectangles.filter(r => r.page === this.currentPage);
    for (let i = pageRects.length - 1; i >= 0; i--) {
      const rect = pageRects[i];
      if (x >= rect.x && x <= rect.x + rect.width &&
          y >= rect.y && y <= rect.y + rect.height) {
        return rect;
      }
    }
    return null;
  }

  getResizeHandle(x, y) {
    if (!this.selectedRectId) return null;
    
    const rect = this.rectangles.find(r => r.id === this.selectedRectId);
    if (!rect) return null;
    
    const handles = [
      { direction: 'nw', cursor: 'nw-resize', hx: rect.x, hy: rect.y },
      { direction: 'ne', cursor: 'ne-resize', hx: rect.x + rect.width, hy: rect.y },
      { direction: 'sw', cursor: 'sw-resize', hx: rect.x, hy: rect.y + rect.height },
      { direction: 'se', cursor: 'se-resize', hx: rect.x + rect.width, hy: rect.y + rect.height },
      { direction: 'n', cursor: 'n-resize', hx: rect.x + rect.width / 2, hy: rect.y },
      { direction: 's', cursor: 's-resize', hx: rect.x + rect.width / 2, hy: rect.y + rect.height },
      { direction: 'w', cursor: 'w-resize', hx: rect.x, hy: rect.y + rect.height / 2 },
      { direction: 'e', cursor: 'e-resize', hx: rect.x + rect.width, hy: rect.y + rect.height / 2 }
    ];
    
    for (const handle of handles) {
      if (Math.abs(x - handle.hx) <= this.RESIZE_HANDLE_SIZE &&
          Math.abs(y - handle.hy) <= this.RESIZE_HANDLE_SIZE) {
        return { ...handle, rect };
      }
    }
    return null;
  }

  handleResize(mouseX, mouseY) {
    if (!this.currentRect) return;
    
    const dx = mouseX - this.startX;
    const dy = mouseY - this.startY;
    const minSize = 20;
    
    let newX = this.currentRect.x;
    let newY = this.currentRect.y;
    let newWidth = this.currentRect.width;
    let newHeight = this.currentRect.height;
    
    switch (this.resizeDirection) {
      case 'se':
        newWidth = Math.max(minSize, this.currentRect.width + dx);
        newHeight = Math.max(minSize, this.currentRect.height + dy);
        break;
      case 'nw':
        newWidth = Math.max(minSize, this.currentRect.width - dx);
        newHeight = Math.max(minSize, this.currentRect.height - dy);
        if (newWidth > minSize) newX = this.currentRect.x + dx;
        if (newHeight > minSize) newY = this.currentRect.y + dy;
        break;
      case 'ne':
        newWidth = Math.max(minSize, this.currentRect.width + dx);
        newHeight = Math.max(minSize, this.currentRect.height - dy);
        if (newHeight > minSize) newY = this.currentRect.y + dy;
        break;
      case 'sw':
        newWidth = Math.max(minSize, this.currentRect.width - dx);
        newHeight = Math.max(minSize, this.currentRect.height + dy);
        if (newWidth > minSize) newX = this.currentRect.x + dx;
        break;
      case 'n':
        newHeight = Math.max(minSize, this.currentRect.height - dy);
        if (newHeight > minSize) newY = this.currentRect.y + dy;
        break;
      case 's':
        newHeight = Math.max(minSize, this.currentRect.height + dy);
        break;
      case 'w':
        newWidth = Math.max(minSize, this.currentRect.width - dx);
        if (newWidth > minSize) newX = this.currentRect.x + dx;
        break;
      case 'e':
        newWidth = Math.max(minSize, this.currentRect.width + dx);
        break;
    }
    
    this.currentRect.x = Math.round(newX);
    this.currentRect.y = Math.round(newY);
    this.currentRect.width = Math.round(newWidth);
    this.currentRect.height = Math.round(newHeight);
    
    this.startX = mouseX;
    this.startY = mouseY;
  }

  drawRect(x, y, width, height, color, lineWidth, isDashed) {
    const ctx = this.shadowRoot.getElementById('drawCanvas').getContext('2d');
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.setLineDash(isDashed ? [5, 5] : []);
    ctx.strokeRect(x, y, width, height);
    ctx.setLineDash([]);
  }

  redrawRectangles() {
    const ctx = this.shadowRoot.getElementById('drawCanvas').getContext('2d');
    ctx.clearRect(0, 0, this.shadowRoot.getElementById('drawCanvas').width, this.shadowRoot.getElementById('drawCanvas').height);
    
    const pageRects = this.rectangles.filter(r => r.page === this.currentPage);
    pageRects.forEach(rect => {
      const isSelected = rect.id === this.selectedRectId;
      const color = isSelected ? '#6366f1' : '#10b981';
      const lineWidth = isSelected ? 3 : 2;
      this.drawRect(rect.x, rect.y, rect.width, rect.height, color, lineWidth, false);
      
      if (rect.name) {
        ctx.fillStyle = color;
        ctx.font = 'bold 12px Arial';
        const labelWidth = ctx.measureText(rect.name).width + 10;
        ctx.fillRect(rect.x, rect.y - 20, labelWidth, 20);
        ctx.fillStyle = 'white';
        ctx.fillText(rect.name, rect.x + 5, rect.y - 6);
      }
      
      if (rect.metadata && rect.metadata.length > 0) {
        const values = rect.metadata.filter(m => m.value).map(m => m.value);
        if (values.length > 0) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.fillRect(rect.x + 5, rect.y + 5, rect.width - 10, Math.min(100, rect.height - 10));
          
          ctx.fillStyle = color;
          ctx.font = '11px Arial';
          const startY = rect.y + 18;
          const lineHeight = 15;
          const maxLines = Math.floor((rect.height - 20) / lineHeight);
          
          values.slice(0, maxLines).forEach((text, index) => {
            let displayText = text;
            const maxWidth = rect.width - 20;
            if (ctx.measureText(text).width > maxWidth) {
              while (ctx.measureText(displayText + '...').width > maxWidth && displayText.length > 0) {
                displayText = displayText.slice(0, -1);
              }
              displayText += '...';
            }
            ctx.fillText(displayText, rect.x + 10, startY + index * lineHeight);
          });
        }
      }
      
      if (isSelected) {
        this.drawResizeHandles(ctx, rect);
      }
    });
  }

  drawResizeHandles(ctx, rect) {
    ctx.fillStyle = '#6366f1';
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    
    const handles = [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.width, y: rect.y },
      { x: rect.x, y: rect.y + rect.height },
      { x: rect.x + rect.width, y: rect.y + rect.height },
      { x: rect.x + rect.width / 2, y: rect.y },
      { x: rect.x + rect.width / 2, y: rect.y + rect.height },
      { x: rect.x, y: rect.y + rect.height / 2 },
      { x: rect.x + rect.width, y: rect.y + rect.height / 2 }
    ];
    
    handles.forEach(handle => {
      ctx.beginPath();
      ctx.arc(handle.x, handle.y, this.RESIZE_HANDLE_SIZE / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  }

  updateRectanglesList() {
    const shadow = this.shadowRoot;
    const pageRects = this.rectangles.filter(r => r.page === this.currentPage);
    const list = shadow.getElementById('rectanglesList');
    
    if (pageRects.length === 0) {
      list.innerHTML = '<div class="empty-state"><p>在PDF上拖拽绘制矩形</p></div>';
    } else {
      list.innerHTML = pageRects.map(rect => `
        <div class="rect-card ${rect.id === this.selectedRectId ? 'selected' : ''}" data-id="${rect.id}">
          <div class="rect-card-header">
            <input type="text" class="rect-name-input" value="${rect.name}" onchange="this.getRootNode().host.updateRectName(${rect.id}, this.value)" onclick="event.stopPropagation()">
            <div class="rect-actions">
              <button class="icon-btn delete" onclick="this.getRootNode().host.deleteRect(${rect.id})" title="删除">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
              </button>
            </div>
          </div>
          <div class="rect-coords">
            X: ${rect.x}, Y: ${rect.y}<br>
            宽: ${rect.width}, 高: ${rect.height}
          </div>
          <div class="rect-metadata">
            ${rect.metadata.map((meta, idx) => `
              <div class="metadata-row">
                <input type="text" class="metadata-key" placeholder="Key" value="${meta.key}" onchange="this.getRootNode().host.updateMetadata(${rect.id}, ${idx}, 'key', this.value)" onclick="event.stopPropagation()">
                <input type="text" class="metadata-value" placeholder="Value" value="${meta.value}" onchange="this.getRootNode().host.updateMetadata(${rect.id}, ${idx}, 'value', this.value)" onclick="event.stopPropagation()">
                <button class="icon-btn delete-metadata" onclick="this.getRootNode().host.deleteMetadata(${rect.id}, ${idx})" title="删除">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            `).join('')}
            <button class="add-metadata-btn" onclick="this.getRootNode().host.addMetadata(${rect.id})">+ 添加键值对</button>
          </div>
        </div>
      `).join('');
    }
    
    shadow.getElementById('rectCount').textContent = `${pageRects.length} 个标注`;
    
    list.querySelectorAll('.rect-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.icon-btn') || e.target.closest('input')) return;
        const id = parseInt(card.dataset.id);
        this.selectRect(id);
      });
    });
  }

  selectRect(id) {
    this.selectedRectId = id;
    this.updateRectanglesList();
    this.redrawRectangles();
  }

  deleteRect(id) {
    this.rectangles = this.rectangles.filter(r => r.id !== id);
    if (this.selectedRectId === id) {
      this.selectedRectId = null;
    }
    this.updateRectanglesList();
    this.redrawRectangles();
    this.showToast('标注已删除');
    this.emitAnnotationsChange();
  }

  addMetadata(rectId) {
    const rect = this.rectangles.find(r => r.id === rectId);
    if (rect) {
      rect.metadata.push({ key: '', value: '' });
      this.updateRectanglesList();
      this.emitAnnotationsChange();
    }
  }

  deleteMetadata(rectId, index) {
    const rect = this.rectangles.find(r => r.id === rectId);
    if (rect && rect.metadata[index]) {
      rect.metadata.splice(index, 1);
      if (rect.metadata.length === 0) {
        rect.metadata.push({ key: '', value: '' });
      }
      this.updateRectanglesList();
      this.redrawRectangles();
      this.emitAnnotationsChange();
    }
  }

  updateMetadata(rectId, index, field, value) {
    const rect = this.rectangles.find(r => r.id === rectId);
    if (rect && rect.metadata[index]) {
      rect.metadata[index][field] = value;
      this.redrawRectangles();
      this.emitAnnotationsChange();
    }
  }

  updateRectName(rectId, name) {
    const rect = this.rectangles.find(r => r.id === rectId);
    if (rect) {
      rect.name = name;
      this.redrawRectangles();
      this.emitAnnotationsChange();
    }
  }

  emitAnnotationsChange() {
    this.dispatchEvent(new CustomEvent('annotations-change', { 
      detail: this.getAnnotations() 
    }));
  }

  showToast(message) {
    const toast = this.shadowRoot.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 2000);
  }
}

// 注册自定义元素
customElements.define('pdf-annotator', PDFAnnotator);

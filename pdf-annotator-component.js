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
    
    // Key 预设列表
    this.keyPresets = [];
    this.keyUsageCount = {};
    
    // PDF.js 配置
    if (typeof pdfjsLib !== 'undefined') {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
  }

  static get observedAttributes() {
    return ['pdf-url', 'pdf-data', 'json-data', 'theme', 'key-presets'];
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
      case 'key-presets':
        if (newValue) this.setKeyPresets(JSON.parse(newValue));
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
          gap: 6px;
          margin-bottom: 8px;
          align-items: center;
          flex-wrap: nowrap;
          min-width: 0;
        }

        .metadata-key-wrapper {
          flex: 1 1 45%;
          min-width: 0;
          position: relative;
        }

        .metadata-key {
          width: 100%;
          padding: 4px 8px;
          border: 1px solid var(--border-color);
          border-radius: 4px;
          font-size: 0.75rem;
          background: var(--bg-input);
          color: var(--text-primary);
          box-sizing: border-box;
        }

        .metadata-key-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          width: 100%;
          min-width: 150px;
          max-width: 300px;
          background: var(--bg-input);
          border: 1px solid var(--border-color);
          border-radius: 4px;
          max-height: 200px;
          overflow-y: auto;
          z-index: 1000000;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          display: none;
          box-sizing: border-box;
        }

        .metadata-key-dropdown.show {
          display: block;
        }

        .key-option {
          padding: 6px 10px;
          cursor: pointer;
          font-size: 0.75rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid var(--border-color);
        }

        .key-option:last-child {
          border-bottom: none;
        }

        .key-option:hover {
          background: var(--accent-glow);
        }

        .key-option .key-name {
          color: var(--text-primary);
          font-weight: 500;
        }

        .key-option .key-count {
          color: var(--text-muted);
          font-size: 0.7rem;
          background: var(--bg-card);
          padding: 2px 6px;
          border-radius: 10px;
        }

        .key-option.used {
          background: rgba(99, 102, 241, 0.05);
        }

        .metadata-value {
          flex: 1 1 45%;
          min-width: 0;
          padding: 4px 8px;
          border: 1px solid var(--border-color);
          border-radius: 4px;
          font-size: 0.75rem;
          background: var(--bg-input);
          color: var(--text-primary);
          box-sizing: border-box;
        }

        .delete-metadata {
          flex: 0 0 26px;
          min-width: 26px;
          width: 26px;
          height: 26px;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--border-color);
          border-radius: 4px;
          background: transparent;
          color: var(--text-muted);
          cursor: pointer;
          font-size: 14px;
          line-height: 1;
        }

        .delete-metadata:hover {
          background: rgba(239, 68, 68, 0.1);
          color: var(--danger);
          border-color: var(--danger);
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

        .edit-overlay {
          position: absolute;
          background: white;
          border: 2px solid var(--accent);
          border-radius: 8px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
          z-index: 10001;
          min-width: 320px;
          max-width: 90%;
          max-height: 600px;
          display: none;
          overflow: visible;
        }

        .edit-overlay.show {
          display: block;
        }

        .edit-overlay-body {
          padding: 16px;
          max-height: 550px;
          overflow-y: auto;
          width: 100%;
          box-sizing: border-box;
        }

        .edit-overlay-header {
          padding: 10px 12px;
          background: var(--accent);
          color: white;
          border-radius: 6px 6px 0 0;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-weight: 600;
          font-size: 0.85rem;
        }

        .edit-overlay-close {
          width: 24px;
          height: 24px;
          border: none;
          background: rgba(255, 255, 255, 0.2);
          color: white;
          border-radius: 4px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.1rem;
        }

        .edit-overlay-close:hover {
          background: rgba(255, 255, 255, 0.3);
        }

        .edit-overlay-body {
          padding: 16px;
          max-height: 550px;
          overflow-y: auto;
          width: 100%;
          box-sizing: border-box;
        }

        .edit-overlay-row {
          margin-bottom: 12px;
        }

        .edit-overlay-row label {
          display: block;
          font-size: 0.75rem;
          color: var(--text-secondary);
          margin-bottom: 4px;
          font-weight: 500;
        }

        .edit-overlay-input {
          width: 100%;
          padding: 6px 10px;
          border: 1px solid var(--border-color);
          border-radius: 4px;
          font-size: 0.8rem;
          background: var(--bg-input);
          color: var(--text-primary);
        }

        .edit-overlay-input:focus {
          outline: none;
          border-color: var(--accent);
          box-shadow: 0 0 0 2px var(--accent-glow);
        }

        .edit-overlay-metadata {
          border-top: 1px solid var(--border-color);
          padding-top: 10px;
          margin-top: 10px;
        }

        .edit-overlay-metadata-title {
          font-size: 0.75rem;
          color: var(--text-secondary);
          margin-bottom: 8px;
          font-weight: 600;
        }

        .edit-overlay-meta-row {
          display: flex;
          gap: 6px;
          margin-bottom: 8px;
          align-items: center;
          flex-wrap: nowrap;
          width: 100%;
          box-sizing: border-box;
        }

        .edit-overlay-meta-key {
          flex: 1 1 35%;
          min-width: 80px;
          max-width: 120px;
          padding: 6px 8px;
          border: 1px solid var(--border-color);
          border-radius: 4px;
          font-size: 0.8rem;
          background: var(--bg-input);
          color: var(--text-primary);
          box-sizing: border-box;
        }

        .edit-overlay-meta-value {
          flex: 1 1 40%;
          min-width: 100px;
          padding: 6px 8px;
          border: 1px solid var(--border-color);
          border-radius: 4px;
          font-size: 0.8rem;
          background: var(--bg-input);
          color: var(--text-primary);
          box-sizing: border-box;
        }

        .edit-overlay-btn {
          padding: 6px 10px;
          border: 1px solid var(--border-color);
          border-radius: 4px;
          background: var(--bg-card);
          color: var(--text-secondary);
          font-size: 0.8rem;
          cursor: pointer;
          transition: var(--transition);
          flex: 0 0 28px;
          width: 28px;
          height: 28px;
          min-width: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .edit-overlay-btn.delete {
          font-size: 16px;
          color: var(--danger);
          border-color: var(--border-color);
        }

        .edit-overlay-btn.delete:hover {
          background: rgba(239, 68, 68, 0.1);
          border-color: var(--danger);
        }

        .edit-overlay-btn:hover {
          border-color: var(--accent);
          color: var(--accent);
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
      
      <div class="edit-overlay" id="editOverlay">
        <div class="edit-overlay-header">
          <span>编辑标注</span>
          <button class="edit-overlay-close" onclick="this.getRootNode().host.closeEditOverlay()">×</button>
        </div>
        <div class="edit-overlay-body" id="editOverlayBody">
        </div>
      </div>
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
    
    // 点击其他地方关闭下拉框和浮层
    document.addEventListener('click', (e) => {
      const shadow = this.shadowRoot;
      const overlay = shadow.getElementById('editOverlay');
      
      // 如果点击的是浮层内部，不关闭浮层
      if (overlay && overlay.classList.contains('show')) {
        if (e.target.closest('#editOverlay')) {
          return;
        }
      }
      
      if (!e.target.closest('.metadata-key-wrapper')) {
        const dropdowns = shadow.querySelectorAll('.metadata-key-dropdown');
        dropdowns.forEach(d => {
          d.style.display = 'none';
          d.classList.remove('show');
        });
      }
      
      // 如果点击的是画布空白处，关闭浮层
      if (e.target.closest('#pdfViewer') && !e.target.closest('#editOverlay') && !e.target.closest('#drawCanvas')) {
        if (overlay && overlay.classList.contains('show')) {
          this.closeEditOverlay();
        }
      }
    });
    
    // Canvas事件
    const drawCanvas = shadow.getElementById('drawCanvas');
    drawCanvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    drawCanvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    drawCanvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
    
    // 双击编辑
    drawCanvas.addEventListener('dblclick', (e) => this.handleDoubleClick(e));
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
      
      // 更新 key 使用次数统计
      this.updateKeyUsageCount();
      
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
   * 设置 key 预设列表
   */
  setKeyPresets(keys) {
    this.keyPresets = Array.isArray(keys) ? keys : [];
    this.updateKeyUsageCount();
  }

  /**
   * 更新 key 使用次数统计
   */
  updateKeyUsageCount() {
    this.keyUsageCount = {};
    
    // 统计所有已使用的 key
    this.rectangles.forEach(rect => {
      if (rect.metadata) {
        rect.metadata.forEach(meta => {
          if (meta.key) {
            this.keyUsageCount[meta.key] = (this.keyUsageCount[meta.key] || 0) + 1;
          }
        });
      }
    });
  }

  /**
   * 获取推荐的 key 列表（按使用次数排序）
   */
  getRecommendedKeys() {
    const allKeys = new Set([...this.keyPresets, ...Object.keys(this.keyUsageCount)]);
    const keysWithCount = Array.from(allKeys).map(key => ({
      key,
      count: this.keyUsageCount[key] || 0
    }));
    
    // 按使用次数降序排序
    keysWithCount.sort((a, b) => b.count - a.count);
    return keysWithCount;
  }

  /**
   * 获取PDF Base64
   */
  async getPDFBase64() {
    if (!this.pdfDoc) return null;
    // 需要原始PDF数据，这里返回null，建议在load时保存
    return this._originalPdfBase64 || null;
  }

  /**
   * 渲染 key 下拉选项
   */
  renderKeyOptions(rectId, index) {
    const recommendedKeys = this.getRecommendedKeys();
    
    if (recommendedKeys.length === 0) {
      return '';
    }
    
    const optionsHTML = recommendedKeys.map(item => {
      const safeKey = item.key.replace(/'/g, "\\'").replace(/"/g, '&quot;');
      return `
        <div class="key-option ${item.count > 0 ? 'used' : ''}" 
             onclick="event.stopPropagation(); this.getRootNode().host.selectKey(${rectId}, ${index}, '${safeKey}')">
          <span class="key-name">${item.key}</span>
          ${item.count > 0 ? `<span class="key-count">${item.count}次</span>` : ''}
        </div>
      `;
    }).join('');
    
    return `
      <div class="metadata-key-dropdown" id="key-dropdown-${rectId}-${index}">
        ${optionsHTML}
      </div>
    `;
  }

  /**
   * 选择 key
   */
  selectKey(rectId, index, key) {
    const rect = this.rectangles.find(r => r.id === rectId);
    if (rect && rect.metadata[index]) {
      const oldKey = rect.metadata[index].key;
      
      // 如果 key 没有变化，不做任何操作
      if (oldKey === key) {
        // 关闭下拉框
        const dropdown = this.shadowRoot.getElementById(`key-dropdown-${rectId}-${index}`);
        if (dropdown) {
          dropdown.style.display = 'none';
          dropdown.classList.remove('show');
        }
        return;
      }
      
      // 减少旧 key 的使用次数
      if (oldKey && this.keyUsageCount[oldKey]) {
        this.keyUsageCount[oldKey]--;
        if (this.keyUsageCount[oldKey] <= 0) {
          delete this.keyUsageCount[oldKey];
        }
      }
      
      // 设置新 key
      rect.metadata[index].key = key;
      
      // 增加新 key 的使用次数
      if (key) {
        this.keyUsageCount[key] = (this.keyUsageCount[key] || 0) + 1;
      }
      
      // 关闭下拉框
      const dropdown = this.shadowRoot.getElementById(`key-dropdown-${rectId}-${index}`);
      if (dropdown) {
        dropdown.style.display = 'none';
        dropdown.classList.remove('show');
      }
      
      this.updateRectanglesList();
      this.redrawRectangles();
      this.emitAnnotationsChange();
    }
  }

  /**
   * 切换 key 下拉框
   */
  toggleKeyDropdown(rectId, index) {
    const dropdown = this.shadowRoot.getElementById(`key-dropdown-${rectId}-${index}`);
    if (dropdown) {
      // 关闭其他下拉框
      this.shadowRoot.querySelectorAll('.metadata-key-dropdown').forEach(d => {
        if (d.id !== `key-dropdown-${rectId}-${index}`) {
          d.style.display = 'none';
          d.classList.remove('show');
        }
      });
      
      // 切换当前下拉框
      if (dropdown.style.display === 'block') {
        dropdown.style.display = 'none';
        dropdown.classList.remove('show');
      } else {
        dropdown.style.display = 'block';
        dropdown.classList.add('show');
      }
    }
  }

  /**
   * 处理 key 输入变化（手动修改时更新统计）
   */
  handleKeyInputChange(rectId, index, newValue) {
    const rect = this.rectangles.find(r => r.id === rectId);
    if (rect && rect.metadata[index]) {
      const oldKey = rect.metadata[index].key;
      
      // 如果 key 没有变化，不做任何操作
      if (oldKey === newValue) {
        // 关闭下拉框
        const dropdown = this.shadowRoot.getElementById(`key-dropdown-${rectId}-${index}`);
        if (dropdown) {
          dropdown.style.display = 'none';
          dropdown.classList.remove('show');
        }
        return;
      }
      
      // 减少旧 key 的使用次数
      if (oldKey && this.keyUsageCount[oldKey]) {
        this.keyUsageCount[oldKey]--;
        if (this.keyUsageCount[oldKey] <= 0) {
          delete this.keyUsageCount[oldKey];
        }
      }
      
      // 设置新 key
      rect.metadata[index].key = newValue;
      
      // 增加新 key 的使用次数
      if (newValue) {
        this.keyUsageCount[newValue] = (this.keyUsageCount[newValue] || 0) + 1;
      }
      
      // 关闭下拉框
      const dropdown = this.shadowRoot.getElementById(`key-dropdown-${rectId}-${index}`);
      if (dropdown) {
        dropdown.style.display = 'none';
        dropdown.classList.remove('show');
      }
      
      this.redrawRectangles();
      this.emitAnnotationsChange();
    }
  }

  /**
   * 双击矩形框打开编辑浮层
   */
  handleDoubleClick(e) {
    const rect = this.shadowRoot.getElementById('drawCanvas').getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const clickedRect = this.getRectAtPosition(mouseX, mouseY);
    if (clickedRect) {
      this.openEditOverlay(clickedRect, e.clientX, e.clientY);
    }
  }

  /**
   * 打开编辑浮层
   */
  openEditOverlay(rect, clientX, clientY) {
    const shadow = this.shadowRoot;
    const overlay = shadow.getElementById('editOverlay');
    const body = shadow.getElementById('editOverlayBody');
    const pdfViewer = shadow.getElementById('pdfViewer');
    
    // 固定尺寸
    const overlayWidth = 320;
    const overlayHeight = 450;
    
    // 获取 pdfViewer 的布局信息
    const viewerRect = pdfViewer.getBoundingClientRect();
    const viewerStyle = window.getComputedStyle(pdfViewer);
    
    // 解析 padding
    const paddingLeft = parseFloat(viewerStyle.paddingLeft) || 0;
    const paddingTop = parseFloat(viewerStyle.paddingTop) || 0;
    
    // 获取页面滚动位置
    const pageScrollX = window.pageXOffset || document.documentElement.scrollLeft || 0;
    const pageScrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
    
    // 计算滚动条宽度（如果有滚动条）
    const hasVerticalScrollbar = pdfViewer.scrollHeight > pdfViewer.clientHeight;
    const hasHorizontalScrollbar = pdfViewer.scrollWidth > pdfViewer.clientWidth;
    const scrollbarWidth = hasVerticalScrollbar ? 17 : 0;
    const scrollbarHeight = hasHorizontalScrollbar ? 17 : 0;
    
    // 计算内容区域的实际可用尺寸
    const contentWidth = viewerRect.width - paddingLeft - scrollbarWidth;
    const contentHeight = viewerRect.height - paddingTop - scrollbarHeight;
    
    // 获取 pdfViewer 的滚动位置
    const viewerScrollLeft = pdfViewer.scrollLeft;
    const viewerScrollTop = pdfViewer.scrollTop;
    
    // 计算鼠标相对于 pdfViewer 内容区域左上角的偏移
    // 坐标系转换：
    // clientX/Y (视口坐标) → 减去容器 border 内边缘位置 → 加上页面滚动/减去内容滚动
    // 
    // getBoundingClientRect() 返回的是元素 border-box 相对于视口的位置
    // 页面滚动 pageX/YOffset 会改变视口原点
    // 内容滚动 scrollLeft/Top 改变内容相对于容器的位置
    
    const offsetX = clientX - viewerRect.left + pageScrollX - viewerScrollLeft;
    const offsetY = clientY + pageScrollY ;
    
    // 计算浮层位置 - 基于鼠标点击位置
    let left = offsetX + 15;
    let top = offsetY - 10;
    
    // 如果右侧空间不够，放在鼠标左侧
    if (left + overlayWidth > contentWidth) {
      left = offsetX - overlayWidth - 15;
    }
    
    // 如果左侧也不够，放在下方
    if (left < 0) {
      left = paddingLeft + 15;
      top = offsetY + 20;
    }
    
    // 如果下方空间不够，放在上方
    if (top + overlayHeight > contentHeight) {
      top = offsetY - overlayHeight - 15;
    }
    
    // 确保不超出边界
    if (top < paddingTop) top = paddingTop + 10;
    if (left < paddingLeft) left = paddingLeft + 10;
    
    overlay.style.left = left + 'px';
    overlay.style.top = top + 'px';
    
    // 渲染编辑内容
    body.innerHTML = this.renderEditOverlayContent(rect);
    
    overlay.classList.add('show');
    this.selectedRectId = rect.id;
    this.redrawRectangles();
  }

  /**
   * 关闭编辑浮层
   */
  closeEditOverlay() {
    const overlay = this.shadowRoot.getElementById('editOverlay');
    overlay.classList.remove('show');
  }

  /**
   * 渲染编辑浮层内容
   */
  renderEditOverlayContent(rect) {
    const metadataHTML = rect.metadata.map((meta, idx) => {
      // 每个 metadata 生成自己的 key 选项
      const recommendedKeys = this.getRecommendedKeys();
      const keyOptionsHTML = recommendedKeys.length > 0 ? `
        <div style="position: relative;">
          ${recommendedKeys.map(item => {
            const safeKey = item.key.replace(/'/g, "\\'").replace(/"/g, '&quot;');
            return `
              <div class="key-option ${item.count > 0 ? 'used' : ''}" 
                   onclick="event.stopPropagation(); this.getRootNode().host.selectOverlayKey('${rect.id}', ${idx}, '${safeKey}')">
                <span class="key-name">${item.key}</span>
                ${item.count > 0 ? `<span class="key-count">${item.count}次</span>` : ''}
              </div>
            `;
          }).join('')}
        </div>
      ` : '';
      
      return `
        <div class="edit-overlay-meta-row">
          <div style="flex: 1; position: relative;">
            <input type="text" class="edit-overlay-meta-key" placeholder="Key" value="${meta.key}" 
              onclick="event.stopPropagation()"
              onchange="this.getRootNode().host.handleOverlayKeyChange('${rect.id}', ${idx}, this.value)"
              onfocus="this.getRootNode().host.showOverlayKeyDropdown('${rect.id}', ${idx})">
            <div class="metadata-key-dropdown" id="overlay-key-dropdown-${rect.id}-${idx}" style="display: none;">
              ${keyOptionsHTML}
            </div>
          </div>
          <input type="text" class="edit-overlay-meta-value" placeholder="Value" value="${meta.value}" 
            onclick="event.stopPropagation()"
            onchange="this.getRootNode().host.updateOverlayMetadata('${rect.id}', ${idx}, 'value', this.value)">
          <button class="edit-overlay-btn delete" onclick="event.stopPropagation(); this.getRootNode().host.deleteOverlayMetadata('${rect.id}', ${idx})">×</button>
        </div>
      `;
    }).join('');
    
    return `
      <div class="edit-overlay-row">
        <label>标注名称</label>
        <input type="text" class="edit-overlay-input" value="${rect.name}" 
          onclick="event.stopPropagation()"
          onchange="this.getRootNode().host.updateOverlayRectName('${rect.id}', this.value)">
      </div>
      
      <div class="edit-overlay-row">
        <label>坐标信息</label>
        <div style="font-size: 0.75rem; color: var(--text-muted); font-family: monospace; padding: 6px; background: var(--bg-card); border-radius: 4px;">
          X: ${rect.x}, Y: ${rect.y}<br>
          宽: ${rect.width}, 高: ${rect.height}
        </div>
      </div>
      
      <div class="edit-overlay-metadata">
        <div class="edit-overlay-metadata-title">Key/Value 对</div>
        ${metadataHTML}
        <button class="edit-overlay-btn" style="width: 100%; margin-top: 8px;" 
          onclick="this.getRootNode().host.addOverlayMetadata('${rect.id}')">
          + 添加键值对
        </button>
      </div>
    `;
  }

  /**
   * 显示浮层中的 key 下拉框
   */
  showOverlayKeyDropdown(rectId, index) {
    // 关闭其他下拉框
    this.shadowRoot.querySelectorAll('#editOverlay .metadata-key-dropdown').forEach(d => {
      d.style.display = 'none';
    });
    
    const dropdown = this.shadowRoot.getElementById(`overlay-key-dropdown-${rectId}-${index}`);
    if (dropdown) {
      dropdown.style.display = 'block';
    }
  }

  /**
   * 在浮层中选择 key
   */
  selectOverlayKey(rectId, index, key) {
    // 直接使用传入的 index，不再查找 activeElement
    this.handleOverlayKeyChange(rectId, index, key);
  }

  /**
   * 处理浮层中 key 的变化
   */
  handleOverlayKeyChange(rectId, index, newValue) {
    const rect = this.rectangles.find(r => r.id == rectId);
    if (rect && rect.metadata[index]) {
      const oldKey = rect.metadata[index].key;
      
      // 如果 key 没有变化，不做任何操作
      if (oldKey === newValue) {
        return;
      }
      
      // 减少旧 key 计数
      if (oldKey && this.keyUsageCount[oldKey]) {
        this.keyUsageCount[oldKey]--;
        if (this.keyUsageCount[oldKey] <= 0) {
          delete this.keyUsageCount[oldKey];
        }
      }
      
      // 设置新 key
      rect.metadata[index].key = newValue;
      
      // 增加新 key 计数
      if (newValue) {
        this.keyUsageCount[newValue] = (this.keyUsageCount[newValue] || 0) + 1;
      }
      
      this.redrawRectangles();
      this.emitAnnotationsChange();
      
      // 关闭下拉框
      const dropdown = this.shadowRoot.getElementById(`overlay-key-dropdown-${rectId}-${index}`);
      if (dropdown) {
        dropdown.style.display = 'none';
      }
      
      // 重新渲染浮层以更新显示
      const body = this.shadowRoot.getElementById('editOverlayBody');
      if (body) {
        body.innerHTML = this.renderEditOverlayContent(rect);
      }
    }
  }

  /**
   * 更新浮层中的 metadata
   */
  updateOverlayMetadata(rectId, index, field, value) {
    const rect = this.rectangles.find(r => r.id == rectId);
    if (rect && rect.metadata[index]) {
      rect.metadata[index][field] = value;
      this.redrawRectangles();
      this.emitAnnotationsChange();
    }
  }

  /**
   * 删除浮层中的 metadata
   */
  deleteOverlayMetadata(rectId, index) {
    const rect = this.rectangles.find(r => r.id == rectId);
    if (rect && rect.metadata[index]) {
      const meta = rect.metadata[index];
      
      // 减少 key 计数
      if (meta.key && this.keyUsageCount[meta.key]) {
        this.keyUsageCount[meta.key]--;
        if (this.keyUsageCount[meta.key] <= 0) {
          delete this.keyUsageCount[meta.key];
        }
      }
      
      rect.metadata.splice(index, 1);
      
      // 确保至少保留一个
      if (rect.metadata.length === 0) {
        rect.metadata.push({ key: '', value: '' });
      }
      
      // 重新渲染浮层
      this.openEditOverlay(rect, 
        parseFloat(this.shadowRoot.getElementById('editOverlay').style.left) + this.getBoundingClientRect().left - 10,
        parseFloat(this.shadowRoot.getElementById('editOverlay').style.top) + this.getBoundingClientRect().top + 50
      );
      
      this.redrawRectangles();
      this.updateRectanglesList();
      this.emitAnnotationsChange();
    }
  }

  /**
   * 在浮层中添加 metadata
   */
  addOverlayMetadata(rectId) {
    const rect = this.rectangles.find(r => r.id == rectId);
    if (rect) {
      rect.metadata.push({ key: '', value: '' });
      
      // 重新渲染浮层
      this.openEditOverlay(rect,
        parseFloat(this.shadowRoot.getElementById('editOverlay').style.left) + this.getBoundingClientRect().left - 10,
        parseFloat(this.shadowRoot.getElementById('editOverlay').style.top) + this.getBoundingClientRect().top + 50
      );
      
      this.updateRectanglesList();
      this.emitAnnotationsChange();
    }
  }

  /**
   * 更新浮层中的矩形名称
   */
  updateOverlayRectName(rectId, name) {
    const rect = this.rectangles.find(r => r.id == rectId);
    if (rect) {
      rect.name = name;
      this.redrawRectangles();
      this.updateRectanglesList();
      this.emitAnnotationsChange();
    }
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
                <div class="metadata-key-wrapper">
                  <input type="text" class="metadata-key" placeholder="Key" value="${meta.key}" 
                    onchange="this.getRootNode().host.handleKeyInputChange(${rect.id}, ${idx}, this.value)" 
                    onclick="event.stopPropagation(); this.getRootNode().host.toggleKeyDropdown(${rect.id}, ${idx})" 
                    onfocus="this.getRootNode().host.toggleKeyDropdown(${rect.id}, ${idx})">
                  ${this.renderKeyOptions(rect.id, idx)}
                </div>
                <input type="text" class="metadata-value" placeholder="Value" value="${meta.value}" onchange="this.getRootNode().host.updateMetadata(${rect.id}, ${idx}, 'value', this.value)" onclick="event.stopPropagation()">
                <button class="icon-btn delete-metadata" onclick="event.stopPropagation(); this.getRootNode().host.deleteMetadata(${rect.id}, ${idx})" title="删除">
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
    this.updateKeyUsageCount();
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
      // 减少被删除的 key 的使用次数
      const deletedMeta = rect.metadata[index];
      if (deletedMeta.key && this.keyUsageCount[deletedMeta.key]) {
        this.keyUsageCount[deletedMeta.key]--;
        if (this.keyUsageCount[deletedMeta.key] <= 0) {
          delete this.keyUsageCount[deletedMeta.key];
        }
      }
      
      // 删除 metadata
      rect.metadata.splice(index, 1);
      
      // 确保至少保留一个
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
      // 如果是 key 字段，需要正确处理计数
      if (field === 'key') {
        const oldKey = rect.metadata[index].key;
        
        // 如果 key 没有变化，不做任何操作
        if (oldKey === value) {
          return;
        }
        
        // 减少旧 key 的使用次数
        if (oldKey && this.keyUsageCount[oldKey]) {
          this.keyUsageCount[oldKey]--;
          if (this.keyUsageCount[oldKey] <= 0) {
            delete this.keyUsageCount[oldKey];
          }
        }
        
        // 设置新 key
        rect.metadata[index].key = value;
        
        // 增加新 key 的使用次数
        if (value) {
          this.keyUsageCount[value] = (this.keyUsageCount[value] || 0) + 1;
        }
      } else {
        // 其他字段直接更新
        rect.metadata[index][field] = value;
      }
      
      // 关闭下拉框
      const dropdown = this.shadowRoot.getElementById(`key-dropdown-${rectId}-${index}`);
      if (dropdown) {
        dropdown.style.display = 'none';
        dropdown.classList.remove('show');
      }
      
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

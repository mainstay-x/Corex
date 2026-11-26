(function () {
  "use strict";
  window.CorexScreens = window.CorexScreens || {};

  const MIN_ZOOM = 0.1;
  const MAX_ZOOM = 8;
  const ZOOM_STEPS = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 4, 8];
  const HISTORY_LIMIT = 200;
  const SAVE_DELAY = 1000;
  const STICKY_COLORS = [
    { id: "amarelo", label: "Amarelo", value: "#fff3a3" },
    { id: "azul", label: "Azul", value: "#cfe6ff" },
    { id: "rosa", label: "Rosa", value: "#ffd3e4" },
    { id: "verde", label: "Verde", value: "#d4f5d0" },
    { id: "laranja", label: "Laranja", value: "#ffdcb8" },
    { id: "roxo", label: "Roxo", value: "#e3d6ff" },
  ];
  const PALETTE = ["transparent", "#ffffff", "#0d1b2e", "#6b7a90", "#0878e8", "#1f9d55", "#f08c00", "#e03131", "#9c36b5", "#fff3a3", "#cfe6ff", "#d4f5d0"];
  const HIGHLIGHT_COLORS = [
    { id: "amarelo", label: "Amarelo", value: "#ffd400" },
    { id: "verde", label: "Verde", value: "#40c057" },
    { id: "azul", label: "Azul", value: "#339af0" },
    { id: "rosa", label: "Rosa", value: "#f06595" },
    { id: "laranja", label: "Laranja", value: "#ff922b" },
    { id: "vermelho", label: "Vermelho", value: "#fa5252" },
  ];
  const HIGHLIGHT_WIDTH = 18;
  const SHAPES = [
    { id: "rect", label: "Retângulo", icon: "▭" },
    { id: "ellipse", label: "Elipse", icon: "◯" },
    { id: "triangle", label: "Triângulo", icon: "△" },
    { id: "diamond", label: "Losango", icon: "◇" },
    { id: "arrow", label: "Seta", icon: "➜" },
  ];
  const TOOLS = [
    { id: "select", label: "Selecionar", key: "V", icon: "⬉" },
    { id: "hand", label: "Mover", key: "H", icon: "✋" },
    { id: "pen", label: "Desenhar", key: "P", icon: "✎" },
    { id: "sticky", label: "Nota adesiva", key: "N", icon: "▤" },
    { id: "shape", label: "Formas", key: "R", icon: "▭" },
    { id: "connector", label: "Conexão", key: "C", icon: "↗" },
    { id: "text", label: "Texto", key: "T", icon: "T" },
    { id: "image", label: "Imagem", key: "I", icon: "🖼" },
    { id: "stamp", label: "Carimbo", key: "S", icon: "★" },
  ];
  const MORE_TOOLS = [
    { id: "highlight", label: "Marca-texto", key: "M", icon: "🖍" },
    { id: "eraser", label: "Borracha", key: "E", icon: "⌫" },
  ];
  const PEN_COLORS = [
    { id: "#0d1b2e", label: "Preto" },
    { id: "#0878e8", label: "Azul" },
    { id: "#e03131", label: "Vermelho" },
    { id: "#2f9e44", label: "Verde" },
    { id: "#f08c00", label: "Laranja" },
    { id: "#9c36b5", label: "Roxo" },
  ];
  const PEN_WIDTHS = [2, 4, 8];
  const STAMPS = [
    { id: "like", label: "Curtir", glyph: "👍", color: "#0878e8" },
    { id: "check", label: "Check", glyph: "✓", color: "#2f9e44" },
    { id: "x", label: "X", glyph: "✕", color: "#e03131" },
    { id: "star", label: "Estrela", glyph: "★", color: "#f59f00" },
    { id: "question", label: "Interrogação", glyph: "?", color: "#7048e8" },
    { id: "exclamation", label: "Exclamação", glyph: "!", color: "#f76707" },
  ];
  const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/svg+xml", "image/webp"];
  const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
  const SYNC_LABELS = { saved: "Salvo", saving: "Salvando…", offline: "Offline", error: "Erro ao salvar" };

  let clipboard = null;

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function uuid() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function svgEl(tag, attrs) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.entries(attrs || {}).forEach(([key, value]) => node.setAttribute(key, value));
    return node;
  }

  function rotatePoint(px, py, cx, cy, deg) {
    const rad = (deg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const dx = px - cx;
    const dy = py - cy;
    return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
  }

  function objectCorners(obj) {
    const cx = obj.x + obj.width / 2;
    const cy = obj.y + obj.height / 2;
    return [
      [obj.x, obj.y], [obj.x + obj.width, obj.y],
      [obj.x + obj.width, obj.y + obj.height], [obj.x, obj.y + obj.height],
    ].map(([x, y]) => rotatePoint(x, y, cx, cy, obj.rotation || 0));
  }

  function objectBounds(obj) {
    if (!obj.rotation) return { x: obj.x, y: obj.y, width: obj.width, height: obj.height };
    const pts = objectCorners(obj);
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
  }

  function unionBounds(list) {
    if (!list.length) return null;
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    list.forEach((obj) => {
      const b = objectBounds(obj);
      minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.width); maxY = Math.max(maxY, b.y + b.height);
    });
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  function intersects(a, b) {
    return a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y;
  }

  function fromRow(row) {
    return {
      id: row.id, type: row.type, x: Number(row.x), y: Number(row.y),
      width: Number(row.width), height: Number(row.height), rotation: Number(row.rotation) || 0,
      zIndex: Number(row.z_index) || 0, locked: Boolean(row.locked), props: row.props || {},
      createdBy: row.created_by || null, createdAt: row.created_at || null, updatedAt: row.updated_at || null,
    };
  }

  function toRow(boardId, obj) {
    return {
      id: obj.id, board_id: boardId, type: obj.type, x: obj.x, y: obj.y,
      width: obj.width, height: obj.height, rotation: obj.rotation || 0,
      z_index: Math.round(obj.zIndex || 0), props: obj.props || {}, locked: Boolean(obj.locked),
      created_by: obj.createdBy || null,
    };
  }

  function formatDate(value) {
    if (!value) return "";
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
  }

  async function render(ctx, boardId) {
    if (boardId) return renderBoard(ctx, boardId);
    return renderList(ctx);
  }

  async function renderList(ctx) {
    const { workspace, make, clear, api, toast, navigate, setTopbarActions, currentProfile } = ctx;
    clear(workspace);
    const createButton = make("button", "button button-primary", "Novo quadro");
    createButton.type = "button";
    createButton.addEventListener("click", async () => {
      createButton.disabled = true;
      try {
        const board = await api.createBoard("Quadro sem título");
        navigate("boards", board.id);
      } catch (error) {
        toast(error.message, "error");
        createButton.disabled = false;
      }
    });
    setTopbarActions([createButton]);

    const loading = make("div", "loading-state", "Carregando quadros…");
    workspace.appendChild(loading);
    let boards;
    try {
      boards = await api.listBoards();
    } catch (error) {
      clear(workspace);
      workspace.appendChild(make("div", "empty-state", error.message));
      return;
    }
    clear(workspace);
    if (!boards.length) {
      const empty = make("div", "empty-state");
      empty.append(make("h3", "", "Nenhum quadro ainda"), make("p", "", "Crie um quadro para organizar ideias com notas, formas e textos."));
      workspace.appendChild(empty);
      return;
    }
    const grid = make("section", "wb-board-grid");
    boards.forEach((board) => {
      const card = make("article", "surface-card wb-board-card");
      const open = make("button", "wb-board-open");
      open.type = "button";
      open.append(make("span", "wb-board-thumb", "▤"), make("strong", "", board.name), make("span", "wb-board-date", "Atualizado em " + formatDate(board.updated_at)));
      open.addEventListener("click", () => navigate("boards", board.id));
      card.appendChild(open);
      const isOwner = currentProfile && board.owner_id === currentProfile.user_id;
      const footer = make("div", "wb-board-footer");
      footer.appendChild(make("span", "badge " + (isOwner ? "success" : "neutral"), isOwner ? "Seu quadro" : "Compartilhado"));
      if (isOwner) {
        const remove = make("button", "button button-secondary wb-board-delete", "Excluir");
        remove.type = "button";
        remove.addEventListener("click", async () => {
          if (!window.confirm("Excluir o quadro \"" + board.name + "\"? Esta ação não pode ser desfeita.")) return;
          remove.disabled = true;
          try {
            await api.deleteBoard(board.id);
            card.remove();
            toast("Quadro excluído.");
          } catch (error) {
            toast(error.message, "error");
            remove.disabled = false;
          }
        });
        footer.appendChild(remove);
      }
      card.appendChild(footer);
      grid.appendChild(card);
    });
    workspace.appendChild(grid);
  }

  async function renderBoard(ctx, boardId) {
    const { workspace, make, clear, api, toast, navigate, onLeave, currentProfile } = ctx;
    clear(workspace);
    workspace.appendChild(make("div", "loading-state", "Abrindo quadro…"));
    let data;
    try {
      data = await api.getBoard(boardId);
    } catch (error) {
      clear(workspace);
      const empty = make("div", "empty-state");
      const back = make("button", "button button-secondary", "Voltar aos quadros");
      back.type = "button";
      back.addEventListener("click", () => navigate("boards"));
      empty.append(make("p", "", error.message), back);
      workspace.appendChild(empty);
      return;
    }
    clear(workspace);
    workspace.classList.add("wb-mode");
    const board = new Board({ ctx, data, boardId, make, api, toast, navigate, currentProfile });
    workspace.appendChild(board.root);
    board.mount();
    onLeave(() => {
      board.destroy();
      workspace.classList.remove("wb-mode");
    });
  }

  function Board(options) {
    this.o = options;
    this.make = options.make;
    this.api = options.api;
    this.boardId = options.boardId;
    this.boardName = options.data.board.name;
    this.role = options.data.role || "viewer";
    this.canEdit = this.role === "owner" || this.role === "editor";
    this.userId = options.data.userId;
    this.authorName = (options.currentProfile && options.currentProfile.display_name) || "";
    this.objects = new Map();
    options.data.objects.forEach((row) => { const obj = fromRow(row); this.objects.set(obj.id, obj); });
    const vp = options.data.viewport;
    this.view = vp ? { x: Number(vp.x), y: Number(vp.y), zoom: clamp(Number(vp.zoom) || 1, MIN_ZOOM, MAX_ZOOM) } : null;
    this.selection = new Set();
    this.tool = "select";
    this.shapeKind = "rect";
    this.highlightColor = "amarelo";
    this.penColor = PEN_COLORS[0].id;
    this.penWidth = 4;
    this.stampKind = "like";
    this.imageUrls = new Map();
    this.imagePending = new Set();
    this.history = [];
    this.future = [];
    this.nodes = new Map();
    this.dirty = new Set();
    this.saveTimer = null;
    this.viewTimer = null;
    this.saving = false;
    this.sync = navigator.onLine ? "saved" : "offline";
    this.editing = null;
    this.gesture = null;
    this.pointers = new Map();
    this.spaceDown = false;
    this.pasteCount = 0;
    this.guides = [];
    this.listeners = [];
    this.pendingKey = "corex-board-pending-" + this.boardId;
    this.loadPending();
    this.build();
  }

  Board.prototype.on = function (target, type, handler, opts) {
    target.addEventListener(type, handler, opts);
    this.listeners.push(() => target.removeEventListener(type, handler, opts));
  };

  Board.prototype.loadPending = function () {
    let pending = null;
    try { pending = JSON.parse(window.localStorage.getItem(this.pendingKey) || "null"); } catch (_e) { pending = null; }
    if (!pending) return;
    Object.values(pending.upserts || {}).forEach((row) => {
      const obj = fromRow(row);
      this.objects.set(obj.id, obj);
      this.dirty.add(obj.id);
    });
    (pending.deletes || []).forEach((id) => { this.objects.delete(id); this.dirty.add(id); });
  };

  Board.prototype.storePending = function () {
    const upserts = {};
    const deletes = [];
    this.dirty.forEach((id) => {
      const obj = this.objects.get(id);
      if (obj) upserts[id] = toRow(this.boardId, obj);
      else deletes.push(id);
    });
    try {
      if (!deletes.length && !Object.keys(upserts).length) window.localStorage.removeItem(this.pendingKey);
      else window.localStorage.setItem(this.pendingKey, JSON.stringify({ upserts, deletes }));
    } catch (_e) {
      // Sem armazenamento local disponível, a fila fica apenas em memória.
    }
  };

  Board.prototype.build = function () {
    const make = this.make;
    this.root = make("div", "wb-root");
    this.stage = make("div", "wb-stage");
    this.stage.tabIndex = 0;
    this.world = make("div", "wb-world");
    this.overlay = make("div", "wb-overlay");
    this.stage.append(this.world, this.overlay);
    this.root.appendChild(this.stage);

    const header = make("div", "wb-panel wb-header");
    const back = make("button", "wb-icon-button", "←");
    back.type = "button";
    back.title = "Voltar aos quadros";
    back.addEventListener("click", () => this.o.navigate("boards"));
    this.nameButton = make("button", "wb-name", this.boardName);
    this.nameButton.type = "button";
    this.nameButton.title = this.canEdit ? "Renomear quadro" : this.boardName;
    if (this.canEdit) this.nameButton.addEventListener("click", () => this.editName());
    this.syncBadge = make("span", "wb-sync");
    header.append(back, this.nameButton, this.syncBadge);

    const historyPanel = make("div", "wb-panel wb-history");
    this.undoButton = this.iconButton("↶", "Desfazer (Ctrl+Z)", () => this.undo());
    this.redoButton = this.iconButton("↷", "Refazer (Ctrl+Shift+Z)", () => this.redo());
    historyPanel.append(this.undoButton, this.redoButton);
    if (!this.canEdit) historyPanel.hidden = true;

    this.toolbar = make("div", "wb-panel wb-toolbar");
    this.toolButtons = new Map();
    TOOLS.forEach((tool) => {
      if (!this.canEdit && tool.id !== "select" && tool.id !== "hand") return;
      const button = this.iconButton(tool.icon, tool.label + " (" + tool.key + ")", () => {
        if (tool.id === "image") { this.setTool("select"); this.pickImage(); return; }
        this.setTool(tool.id);
      });
      button.classList.add("wb-tool");
      button.dataset.tool = tool.id;
      this.toolButtons.set(tool.id, button);
      if (tool.id === "sticky") this.enableStickyDrag(button);
      this.toolbar.appendChild(button);
    });
    this.moreButton = this.iconButton("⋯", "Mais ferramentas", () => { this.moreMenu.hidden = !this.moreMenu.hidden; });
    this.moreButton.classList.add("wb-tool");
    this.moreMenu = make("div", "wb-panel wb-menu wb-more-menu");
    this.moreMenu.hidden = true;
    MORE_TOOLS.forEach((tool) => {
      const item = make("button", "wb-menu-item");
      item.type = "button";
      item.dataset.tool = tool.id;
      item.append(make("span", "", tool.icon + "  " + tool.label), make("kbd", "", tool.key));
      item.addEventListener("click", () => { this.moreMenu.hidden = true; this.setTool(tool.id); });
      this.moreMenu.appendChild(item);
    });
    if (this.canEdit) this.toolbar.appendChild(this.moreButton);
    this.toolOptions = make("div", "wb-panel wb-tool-options");
    this.toolOptions.hidden = true;
    this.fileInput = make("input", "");
    this.fileInput.type = "file";
    this.fileInput.accept = IMAGE_TYPES.join(",");
    this.fileInput.multiple = true;
    this.fileInput.hidden = true;
    this.fileInput.addEventListener("change", () => {
      const files = [...this.fileInput.files];
      this.fileInput.value = "";
      const rect = this.stage.getBoundingClientRect();
      const center = this.toWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
      this.insertImages(files, center);
    });

    const zoomPanel = make("div", "wb-panel wb-zoom");
    const zoomOut = this.iconButton("−", "Diminuir zoom (Ctrl+-)", () => this.stepZoom(-1));
    this.zoomLabel = make("button", "wb-zoom-label", "100%");
    this.zoomLabel.type = "button";
    this.zoomLabel.title = "Opções de zoom";
    this.zoomLabel.addEventListener("click", () => this.toggleZoomMenu());
    const zoomIn = this.iconButton("+", "Aumentar zoom (Ctrl+=)", () => this.stepZoom(1));
    zoomPanel.append(zoomOut, this.zoomLabel, zoomIn);
    this.zoomMenu = make("div", "wb-panel wb-menu wb-zoom-menu");
    this.zoomMenu.hidden = true;
    [["50%", () => this.zoomTo(0.5)], ["100%", () => this.zoomTo(1)], ["200%", () => this.zoomTo(2)], ["Enquadrar tudo", () => this.fitAll()]].forEach(([label, action]) => {
      const item = make("button", "wb-menu-item", label);
      item.type = "button";
      item.addEventListener("click", () => { this.zoomMenu.hidden = true; action(); });
      this.zoomMenu.appendChild(item);
    });

    this.propsBar = make("div", "wb-panel wb-props");
    this.propsBar.hidden = true;
    this.contextMenu = make("div", "wb-panel wb-menu wb-context");
    this.contextMenu.hidden = true;
    this.popover = make("div", "wb-panel wb-popover");
    this.popover.hidden = true;

    this.root.append(header, historyPanel, this.toolbar, this.toolOptions, this.moreMenu, this.fileInput, zoomPanel, this.zoomMenu, this.propsBar, this.contextMenu, this.popover);
  };

  Board.prototype.iconButton = function (icon, title, handler) {
    const button = this.make("button", "wb-icon-button", icon);
    button.type = "button";
    button.title = title;
    button.setAttribute("aria-label", title);
    button.addEventListener("click", handler);
    return button;
  };

  Board.prototype.mount = function () {
    if (!this.view) {
      const rect = this.stage.getBoundingClientRect();
      this.view = { x: -rect.width / 2, y: -rect.height / 2, zoom: 1 };
      if (this.objects.size) this.fitAll(true);
    }
    this.on(this.stage, "pointerdown", (e) => this.onPointerDown(e));
    this.on(window, "pointermove", (e) => this.onPointerMove(e));
    this.on(window, "pointerup", (e) => this.onPointerUp(e));
    this.on(window, "pointercancel", (e) => this.onPointerUp(e));
    this.on(this.stage, "wheel", (e) => this.onWheel(e), { passive: false });
    this.on(this.stage, "dblclick", (e) => this.onDoubleClick(e));
    this.on(this.stage, "contextmenu", (e) => this.onContextMenu(e));
    this.on(document, "keydown", (e) => this.onKeyDown(e));
    this.on(document, "keyup", (e) => this.onKeyUp(e));
    this.on(document, "paste", (e) => this.onPaste(e));
    this.on(this.stage, "dragover", (e) => {
      if (!this.canEdit || !e.dataTransfer || ![...e.dataTransfer.types].includes("Files")) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      this.stage.classList.add("is-dropping");
    });
    this.on(this.stage, "dragleave", () => this.stage.classList.remove("is-dropping"));
    this.on(this.stage, "drop", (e) => {
      this.stage.classList.remove("is-dropping");
      if (!this.canEdit || !e.dataTransfer || !e.dataTransfer.files.length) return;
      e.preventDefault();
      this.insertImages([...e.dataTransfer.files], this.toWorld(e.clientX, e.clientY));
    });
    this.on(window, "online", () => { this.setSync(this.dirty.size ? "saving" : "saved"); this.scheduleSave(0); });
    this.on(window, "offline", () => this.setSync("offline"));
    this.on(window, "resize", () => this.updateView());
    this.on(window, "beforeunload", () => this.storePending());
    this.on(document, "pointerdown", (e) => {
      if (!this.zoomMenu.contains(e.target) && e.target !== this.zoomLabel) this.zoomMenu.hidden = true;
      if (!this.contextMenu.contains(e.target)) this.contextMenu.hidden = true;
      if (!this.popover.contains(e.target) && !this.propsBar.contains(e.target)) this.popover.hidden = true;
      if (!this.moreMenu.contains(e.target) && e.target !== this.moreButton) this.moreMenu.hidden = true;
    });
    this.renderAll();
    this.updateView();
    this.updateTools();
    this.updateHistoryButtons();
    this.setSync(this.sync);
    if (this.dirty.size) this.scheduleSave(0);
    this.stage.focus({ preventScroll: true });
  };

  Board.prototype.destroy = function () {
    this.finishEditing();
    this.listeners.splice(0).forEach((off) => off());
    window.clearTimeout(this.viewTimer);
    this.saveViewport();
    window.clearTimeout(this.saveTimer);
    if (this.dirty.size) { this.storePending(); this.flush(); }
  };

  // Viewport

  Board.prototype.toWorld = function (clientX, clientY) {
    const rect = this.stage.getBoundingClientRect();
    return { x: (clientX - rect.left) / this.view.zoom + this.view.x, y: (clientY - rect.top) / this.view.zoom + this.view.y };
  };

  Board.prototype.toScreen = function (x, y) {
    return { x: (x - this.view.x) * this.view.zoom, y: (y - this.view.y) * this.view.zoom };
  };

  Board.prototype.updateView = function (skipSave) {
    const z = this.view.zoom;
    this.world.style.transform = "scale(" + z + ") translate(" + -this.view.x + "px, " + -this.view.y + "px)";
    let gap = 24;
    while (gap * z < 12) gap *= 4;
    while (gap * z > 96) gap /= 4;
    const size = gap * z;
    this.stage.style.backgroundSize = size + "px " + size + "px";
    this.stage.style.backgroundPosition = (-this.view.x * z % size) + "px " + (-this.view.y * z % size) + "px";
    this.zoomLabel.textContent = Math.round(z * 100) + "%";
    this.cull();
    this.renderOverlay();
    if (!skipSave) this.scheduleViewportSave();
  };

  Board.prototype.visibleRect = function () {
    const rect = this.stage.getBoundingClientRect();
    return { x: this.view.x, y: this.view.y, width: rect.width / this.view.zoom, height: rect.height / this.view.zoom };
  };

  Board.prototype.cull = function () {
    const vr = this.visibleRect();
    const margin = 200 / this.view.zoom;
    const area = { x: vr.x - margin, y: vr.y - margin, width: vr.width + margin * 2, height: vr.height + margin * 2 };
    this.objects.forEach((obj, id) => {
      const node = this.nodes.get(id);
      if (!node) return;
      const visible = intersects(objectBounds(obj), area) || (this.editing && this.editing.id === id);
      node.style.display = visible ? "" : "none";
    });
  };

  Board.prototype.zoomAt = function (zoom, sx, sy) {
    const next = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
    const wx = sx / this.view.zoom + this.view.x;
    const wy = sy / this.view.zoom + this.view.y;
    this.view.zoom = next;
    this.view.x = wx - sx / next;
    this.view.y = wy - sy / next;
    this.updateView();
  };

  Board.prototype.zoomTo = function (zoom) {
    const rect = this.stage.getBoundingClientRect();
    this.zoomAt(zoom, rect.width / 2, rect.height / 2);
  };

  Board.prototype.stepZoom = function (direction) {
    const z = this.view.zoom;
    let next;
    if (direction > 0) next = ZOOM_STEPS.find((step) => step > z + 0.001) || MAX_ZOOM;
    else next = ZOOM_STEPS.slice().reverse().find((step) => step < z - 0.001) || MIN_ZOOM;
    this.zoomTo(next);
  };

  Board.prototype.fitBounds = function (bounds, keepSave) {
    if (!bounds) return;
    const rect = this.stage.getBoundingClientRect();
    const pad = 80;
    const zoom = clamp(Math.min((rect.width - pad * 2) / Math.max(bounds.width, 1), (rect.height - pad * 2) / Math.max(bounds.height, 1)), MIN_ZOOM, Math.min(MAX_ZOOM, 1));
    this.view.zoom = zoom;
    this.view.x = bounds.x + bounds.width / 2 - rect.width / 2 / zoom;
    this.view.y = bounds.y + bounds.height / 2 - rect.height / 2 / zoom;
    this.updateView(keepSave);
  };

  Board.prototype.fitAll = function (initial) {
    this.fitBounds(unionBounds([...this.objects.values()]), initial);
  };

  Board.prototype.fitSelection = function () {
    this.fitBounds(unionBounds(this.selectedObjects()));
  };

  Board.prototype.toggleZoomMenu = function () {
    this.zoomMenu.hidden = !this.zoomMenu.hidden;
  };

  Board.prototype.scheduleViewportSave = function () {
    window.clearTimeout(this.viewTimer);
    this.viewTimer = window.setTimeout(() => this.saveViewport(), SAVE_DELAY);
  };

  Board.prototype.saveViewport = function () {
    if (!navigator.onLine) return;
    this.api.saveBoardViewport(this.boardId, this.view).catch(() => {});
  };

  // Tools

  Board.prototype.setTool = function (tool) {
    if (!this.canEdit && tool !== "select" && tool !== "hand") return;
    this.finishEditing();
    this.tool = tool;
    this.moreMenu.hidden = true;
    if (tool !== "select") this.setSelection([]);
    this.updateTools();
  };

  Board.prototype.updateTools = function () {
    this.toolButtons.forEach((button, id) => button.classList.toggle("active", id === this.tool));
    const shapeButton = this.toolButtons.get("shape");
    if (shapeButton) shapeButton.textContent = SHAPES.find((s) => s.id === this.shapeKind).icon;
    const moreActive = MORE_TOOLS.some((t) => t.id === this.tool);
    this.moreButton.classList.toggle("active", moreActive);
    if (moreActive) this.moreButton.textContent = MORE_TOOLS.find((t) => t.id === this.tool).icon;
    else this.moreButton.textContent = "⋯";
    this.moreMenu.querySelectorAll("[data-tool]").forEach((b) => b.classList.toggle("active", b.dataset.tool === this.tool));
    this.renderToolOptions();
    this.stage.dataset.tool = this.spaceDown ? "hand" : this.tool;
  };

  Board.prototype.renderToolOptions = function () {
    const panel = this.toolOptions;
    panel.textContent = "";
    const swatch = (value, label, active, onClick) => {
      const b = this.make("button", "wb-swatch" + (active ? " active" : ""));
      b.type = "button";
      b.title = label;
      b.style.background = value;
      b.addEventListener("click", onClick);
      panel.appendChild(b);
    };
    if (this.tool === "shape") {
      SHAPES.forEach((shape) => {
        const b = this.iconButton(shape.icon, shape.label, () => { this.shapeKind = shape.id; this.updateTools(); });
        if (shape.id === this.shapeKind) b.classList.add("active");
        panel.appendChild(b);
      });
    } else if (this.tool === "highlight") {
      HIGHLIGHT_COLORS.forEach((c) => swatch(c.value, c.label, c.id === this.highlightColor, () => { this.highlightColor = c.id; this.updateTools(); }));
    } else if (this.tool === "pen") {
      PEN_COLORS.forEach((c) => swatch(c.id, c.label, c.id === this.penColor, () => { this.penColor = c.id; this.updateTools(); }));
      panel.appendChild(this.make("span", "wb-sep"));
      PEN_WIDTHS.forEach((w) => {
        const b = this.iconButton("", "Espessura " + w, () => { this.penWidth = w; this.updateTools(); });
        const dot = this.make("span", "wb-width-dot");
        dot.style.width = w + 4 + "px";
        dot.style.height = w + 4 + "px";
        b.appendChild(dot);
        if (w === this.penWidth) b.classList.add("active");
        panel.appendChild(b);
      });
    } else if (this.tool === "stamp") {
      STAMPS.forEach((st) => {
        const b = this.iconButton(st.glyph, st.label, () => { this.stampKind = st.id; this.updateTools(); });
        b.style.color = st.color;
        if (st.id === this.stampKind) b.classList.add("active");
        panel.appendChild(b);
      });
    } else {
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
  };

  Board.prototype.enableStickyDrag = function (button) {
    let start = null;
    let ghost = null;
    button.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      start = { x: e.clientX, y: e.clientY };
      button.setPointerCapture(e.pointerId);
    });
    button.addEventListener("pointermove", (e) => {
      if (!start) return;
      if (!ghost && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6) {
        ghost = this.make("div", "wb-ghost");
        ghost.style.background = STICKY_COLORS[0].value;
        const size = 200 * this.view.zoom;
        ghost.style.width = size + "px";
        ghost.style.height = size + "px";
        document.body.appendChild(ghost);
      }
      if (ghost) {
        const size = 200 * this.view.zoom;
        ghost.style.left = e.clientX - size / 2 + "px";
        ghost.style.top = e.clientY - size / 2 + "px";
      }
    });
    const end = (e) => {
      if (!start) return;
      const dragged = Boolean(ghost);
      start = null;
      if (ghost) { ghost.remove(); ghost = null; }
      if (!dragged) return;
      button.dataset.suppressClick = "1";
      window.setTimeout(() => { delete button.dataset.suppressClick; }, 0);
      const rect = this.stage.getBoundingClientRect();
      if (e.type === "pointercancel" || e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return;
      const point = this.toWorld(e.clientX, e.clientY);
      this.createSticky(point.x, point.y);
    };
    button.addEventListener("pointerup", end);
    button.addEventListener("pointercancel", end);
    button.addEventListener("click", (e) => {
      if (button.dataset.suppressClick) { e.stopImmediatePropagation(); e.preventDefault(); }
    }, true);
  };

  // Objects

  Board.prototype.maxZ = function () {
    let max = 0;
    this.objects.forEach((obj) => { max = Math.max(max, obj.zIndex || 0); });
    return max;
  };

  Board.prototype.minZ = function () {
    let min = 0;
    let first = true;
    this.objects.forEach((obj) => { if (first || obj.zIndex < min) { min = obj.zIndex || 0; first = false; } });
    return min;
  };

  Board.prototype.baseObject = function (type, x, y, width, height, props) {
    const now = new Date().toISOString();
    return { id: uuid(), type, x, y, width, height, rotation: 0, zIndex: this.maxZ() + 1, locked: false, props, createdBy: this.userId, createdAt: now, updatedAt: now };
  };

  Board.prototype.addObjects = function (list, select) {
    const entry = this.beginChange(list.map((o) => o.id));
    list.forEach((obj) => this.objects.set(obj.id, obj));
    this.commitChange(entry);
    if (select) this.setSelection(list.map((o) => o.id));
  };

  Board.prototype.createSticky = function (cx, cy) {
    const obj = this.baseObject("sticky", cx - 100, cy - 100, 200, 200, { text: "", color: "amarelo", authorName: this.authorName });
    this.addObjects([obj], true);
    this.setTool("select");
    this.setSelection([obj.id]);
    return obj;
  };

  Board.prototype.createShape = function (x, y, w, h) {
    const obj = this.baseObject("shape", x, y, w, h, { shape: this.shapeKind, fill: "#ffffff", stroke: "#0d1b2e", strokeWidth: 2, strokeStyle: "solid", text: "" });
    this.addObjects([obj], true);
    return obj;
  };

  Board.prototype.createText = function (x, y) {
    const obj = this.baseObject("text", x, y - 18, 40, 36, { text: "", fontSize: 24, color: "#0d1b2e", align: "left", bold: false, italic: false, autoWidth: true });
    this.objects.set(obj.id, obj);
    this.renderObject(obj);
    this.setTool("select");
    this.setSelection([obj.id]);
    this.startEditing(obj.id, { createdEntry: true });
    return obj;
  };

  // History

  Board.prototype.beginChange = function (ids) {
    const before = new Map();
    this.withConnectors(ids).forEach((id) => before.set(id, clone(this.objects.get(id) || null)));
    return { before };
  };

  Board.prototype.commitChange = function (entry, mergeKey) {
    this.syncConnectors(entry.before.keys());
    const after = new Map();
    let changed = false;
    entry.before.forEach((value, id) => {
      const current = clone(this.objects.get(id) || null);
      after.set(id, current);
      if (JSON.stringify(value) !== JSON.stringify(current)) changed = true;
    });
    if (!changed) { this.refresh(entry.before.keys()); return false; }
    const now = new Date().toISOString();
    after.forEach((value, id) => {
      if (value) { const live = this.objects.get(id); live.updatedAt = now; value.updatedAt = now; }
    });
    const last = this.history[this.history.length - 1];
    if (mergeKey && last && last.mergeKey === mergeKey && Date.now() - last.time < 1000) {
      after.forEach((value, id) => last.after.set(id, value));
      last.time = Date.now();
    } else {
      this.history.push({ before: entry.before, after, mergeKey: mergeKey || null, time: Date.now() });
      if (this.history.length > HISTORY_LIMIT) this.history.shift();
    }
    this.future = [];
    this.markDirty(after.keys());
    this.refresh(after.keys());
    this.updateHistoryButtons();
    return true;
  };

  Board.prototype.applyStates = function (states) {
    states.forEach((value, id) => {
      if (value) this.objects.set(id, clone(value));
      else this.objects.delete(id);
    });
    this.markDirty(states.keys());
    this.refresh(states.keys());
    this.setSelection([...this.selection].filter((id) => this.objects.has(id)));
  };

  Board.prototype.undo = function () {
    if (!this.canEdit) return;
    this.finishEditing();
    const entry = this.history.pop();
    if (!entry) return;
    this.future.push(entry);
    this.applyStates(entry.before);
    this.updateHistoryButtons();
  };

  Board.prototype.redo = function () {
    if (!this.canEdit) return;
    this.finishEditing();
    const entry = this.future.pop();
    if (!entry) return;
    this.history.push(entry);
    this.applyStates(entry.after);
    this.updateHistoryButtons();
  };

  Board.prototype.updateHistoryButtons = function () {
    this.undoButton.disabled = !this.history.length;
    this.redoButton.disabled = !this.future.length;
  };

  // Persistence

  Board.prototype.markDirty = function (ids) {
    if (!this.canEdit) return;
    for (const id of ids) this.dirty.add(id);
    this.storePending();
    this.setSync(navigator.onLine ? "saving" : "offline");
    this.scheduleSave(SAVE_DELAY);
  };

  Board.prototype.scheduleSave = function (delay) {
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.flush(), delay);
  };

  Board.prototype.flush = async function () {
    if (this.saving || !this.dirty.size) return;
    if (!navigator.onLine) { this.setSync("offline"); return; }
    if (this.editing) { this.scheduleSave(SAVE_DELAY); return; }
    const ids = [...this.dirty];
    this.dirty.clear();
    const upserts = [];
    const deletes = [];
    ids.forEach((id) => {
      const obj = this.objects.get(id);
      if (obj) upserts.push(toRow(this.boardId, obj));
      else deletes.push(id);
    });
    this.saving = true;
    this.setSync("saving");
    try {
      await this.api.saveBoardObjects(upserts, deletes);
      this.saving = false;
      this.storePending();
      if (this.dirty.size) this.scheduleSave(SAVE_DELAY);
      else this.setSync("saved");
    } catch (_error) {
      this.saving = false;
      ids.forEach((id) => this.dirty.add(id));
      this.storePending();
      this.setSync(navigator.onLine ? "error" : "offline");
      this.scheduleSave(5000);
    }
  };

  Board.prototype.setSync = function (state) {
    this.sync = state;
    if (!this.canEdit) { this.syncBadge.textContent = "Somente leitura"; this.syncBadge.dataset.state = "readonly"; return; }
    this.syncBadge.textContent = SYNC_LABELS[state];
    this.syncBadge.dataset.state = state;
  };

  Board.prototype.editName = function () {
    const input = this.make("input", "wb-name-input");
    input.value = this.boardName;
    input.maxLength = 120;
    this.nameButton.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = async (save) => {
      if (done) return;
      done = true;
      const value = input.value.trim();
      input.replaceWith(this.nameButton);
      if (!save || !value || value === this.boardName) return;
      const previous = this.boardName;
      this.boardName = value;
      this.nameButton.textContent = value;
      try {
        await this.api.renameBoard(this.boardId, value);
      } catch (error) {
        this.boardName = previous;
        this.nameButton.textContent = previous;
        this.o.toast(error.message, "error");
      }
    };
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") finish(true);
      if (e.key === "Escape") finish(false);
    });
    input.addEventListener("blur", () => finish(true));
  };

  // Rendering

  Board.prototype.renderAll = function () {
    this.objects.forEach((obj) => this.renderObject(obj));
  };

  Board.prototype.refresh = function (ids) {
    for (const id of ids) {
      const obj = this.objects.get(id);
      if (obj) this.renderObject(obj);
      else {
        const node = this.nodes.get(id);
        if (node) node.remove();
        this.nodes.delete(id);
      }
    }
    this.cull();
    this.renderOverlay();
  };

  Board.prototype.renderObject = function (obj) {
    let node = this.nodes.get(obj.id);
    const key = JSON.stringify([obj.type, obj.width, obj.height, obj.props, obj.locked]);
    if (!node) {
      node = document.createElement("div");
      node.dataset.id = obj.id;
      this.nodes.set(obj.id, node);
      this.world.appendChild(node);
    }
    node.className = "wb-object wb-" + obj.type + (obj.locked ? " is-locked" : "");
    node.style.left = obj.x + "px";
    node.style.top = obj.y + "px";
    node.style.width = obj.width + "px";
    node.style.height = obj.type === "text" ? "auto" : obj.height + "px";
    node.style.minHeight = obj.type === "text" ? obj.height + "px" : "";
    node.style.transform = obj.rotation ? "rotate(" + obj.rotation + "deg)" : "";
    node.style.zIndex = String(obj.zIndex || 0);
    if (node.dataset.key === key && !(this.editing && this.editing.id === obj.id)) return;
    if (this.editing && this.editing.id === obj.id) return;
    node.dataset.key = key;
    node.textContent = "";
    const hidden = node.style.display === "none";
    if (hidden) node.style.display = "";
    if (obj.type === "sticky") this.renderSticky(node, obj);
    else if (obj.type === "shape") this.renderShape(node, obj);
    else if (obj.type === "text") this.renderText(node, obj);
    else if (obj.type === "draw") this.renderDraw(node, obj);
    else if (obj.type === "stamp") this.renderStamp(node, obj);
    else if (obj.type === "image") this.renderImage(node, obj);
    else if (obj.type === "connector") this.renderConnector(node, obj);
    if (hidden) node.style.display = "none";
  };

  Board.prototype.renderSticky = function (node, obj) {
    const color = STICKY_COLORS.find((c) => c.id === obj.props.color) || STICKY_COLORS[0];
    node.style.background = color.value;
    const text = this.make("div", "wb-sticky-text");
    text.textContent = obj.props.text || "";
    node.appendChild(text);
    if (obj.props.authorName) node.appendChild(this.make("span", "wb-sticky-author", obj.props.authorName));
    this.fitStickyText(text, obj);
  };

  Board.prototype.fitStickyText = function (text, obj) {
    let size = 32;
    text.style.fontSize = size + "px";
    const maxHeight = obj.height - 44;
    const maxWidth = obj.width - 28;
    while (size > 8 && (text.scrollHeight > maxHeight || text.scrollWidth > maxWidth)) {
      size -= 1;
      text.style.fontSize = size + "px";
    }
  };

  Board.prototype.renderShape = function (node, obj) {
    const p = obj.props;
    const w = Math.max(obj.width, 1);
    const h = Math.max(obj.height, 1);
    const sw = Number(p.strokeWidth) || 0;
    const s = sw / 2;
    const svg = svgEl("svg", { width: "100%", height: "100%", viewBox: "0 0 " + w + " " + h, preserveAspectRatio: "none" });
    const common = { fill: p.fill === "transparent" ? "none" : p.fill, stroke: p.stroke === "transparent" ? "none" : p.stroke, "stroke-width": sw, "stroke-linejoin": "round" };
    if (p.strokeStyle === "dashed") common["stroke-dasharray"] = Math.max(sw * 3, 6) + " " + Math.max(sw * 2, 4);
    let shape;
    if (p.shape === "ellipse") shape = svgEl("ellipse", Object.assign({ cx: w / 2, cy: h / 2, rx: Math.max(w / 2 - s, 0), ry: Math.max(h / 2 - s, 0) }, common));
    else if (p.shape === "triangle") shape = svgEl("polygon", Object.assign({ points: [w / 2, s, w - s, h - s, s, h - s].join(" ") }, common));
    else if (p.shape === "diamond") shape = svgEl("polygon", Object.assign({ points: [w / 2, s, w - s, h / 2, w / 2, h - s, s, h / 2].join(" ") }, common));
    else if (p.shape === "arrow") {
      const head = Math.min(w * 0.4, h);
      const top = h * 0.28;
      const bottom = h * 0.72;
      shape = svgEl("polygon", Object.assign({ points: [s, top, w - head, top, w - head, s, w - s, h / 2, w - head, h - s, w - head, bottom, s, bottom].join(" ") }, common));
    } else shape = svgEl("rect", Object.assign({ x: s, y: s, width: Math.max(w - sw, 0), height: Math.max(h - sw, 0), rx: 4 }, common));
    svg.appendChild(shape);
    node.appendChild(svg);
    const text = this.make("div", "wb-shape-text");
    text.textContent = p.text || "";
    text.style.color = p.textColor || "#0d1b2e";
    node.appendChild(text);
  };

  Board.prototype.strokePath = function (points) {
    if (!points.length) return "";
    if (points.length === 1) return "M" + points[0][0] + " " + points[0][1] + " l0.01 0";
    let d = "M" + points[0][0] + " " + points[0][1];
    for (let i = 1; i < points.length - 1; i += 1) {
      const mx = (points[i][0] + points[i + 1][0]) / 2;
      const my = (points[i][1] + points[i + 1][1]) / 2;
      d += " Q" + points[i][0] + " " + points[i][1] + " " + mx + " " + my;
    }
    const last = points[points.length - 1];
    return d + " L" + last[0] + " " + last[1];
  };

  Board.prototype.drawColor = function (props) {
    if (props.highlight) return (HIGHLIGHT_COLORS.find((c) => c.id === props.color) || HIGHLIGHT_COLORS[0]).value;
    return props.color || PEN_COLORS[0].id;
  };

  Board.prototype.renderDraw = function (node, obj) {
    const p = obj.props;
    node.classList.toggle("is-highlight", Boolean(p.highlight));
    const svg = svgEl("svg", { width: "100%", height: "100%", viewBox: "0 0 " + (p.vw || obj.width) + " " + (p.vh || obj.height), preserveAspectRatio: "none" });
    svg.appendChild(svgEl("path", { d: this.strokePath(p.points || []), fill: "none", stroke: this.drawColor(p), "stroke-width": p.strokeWidth || HIGHLIGHT_WIDTH, "stroke-linecap": "round", "stroke-linejoin": "round" }));
    node.appendChild(svg);
  };

  Board.prototype.createStroke = function (points, highlight) {
    const width = highlight ? HIGHLIGHT_WIDTH : this.penWidth;
    const half = width / 2 + 2;
    const xs = points.map((pt) => pt[0]);
    const ys = points.map((pt) => pt[1]);
    const x = Math.min(...xs) - half;
    const y = Math.min(...ys) - half;
    const w = Math.max(...xs) - x + half;
    const h = Math.max(...ys) - y + half;
    const rel = points.map((pt) => [Math.round((pt[0] - x) * 10) / 10, Math.round((pt[1] - y) * 10) / 10]);
    const props = highlight
      ? { points: rel, vw: w, vh: h, color: this.highlightColor, strokeWidth: HIGHLIGHT_WIDTH, highlight: true }
      : { points: rel, vw: w, vh: h, color: this.penColor, strokeWidth: width };
    const obj = this.baseObject("draw", x, y, w, h, props);
    this.addObjects([obj], false);
  };

  Board.prototype.renderText = function (node, obj) {
    const p = obj.props;
    const text = this.make("div", "wb-text-content");
    text.textContent = p.text || "";
    this.applyTextStyle(text, obj);
    node.appendChild(text);
    this.measureText(node, obj);
  };

  Board.prototype.applyTextStyle = function (el, obj) {
    const p = obj.props;
    el.style.fontSize = (p.fontSize || 24) + "px";
    el.style.color = p.color || "#0d1b2e";
    el.style.textAlign = p.align || "left";
    el.style.fontWeight = p.bold ? "700" : "400";
    el.style.fontStyle = p.italic ? "italic" : "normal";
    el.style.whiteSpace = p.autoWidth ? "pre" : "pre-wrap";
  };

  Board.prototype.measureText = function (node, obj) {
    const content = node && node.firstElementChild;
    if (!content || node.style.display === "none") return;
    let width = obj.width;
    if (obj.props.autoWidth) {
      const prevWidth = node.style.width;
      node.style.width = "max-content";
      width = Math.max(Math.ceil(content.scrollWidth) + 4, 24);
      node.style.width = prevWidth;
    }
    const height = Math.max(Math.ceil(content.scrollHeight), Math.ceil((obj.props.fontSize || 24) * 1.3));
    if (Math.abs(width - obj.width) > 0.5 || Math.abs(height - obj.height) > 0.5) {
      if (obj.props.autoWidth) obj.width = width;
      obj.height = height;
      node.style.width = obj.width + "px";
      node.style.minHeight = obj.height + "px";
    }
  };

  Board.prototype.syncTextHeight = function (obj) {
    if (obj.type !== "text") return;
    const node = this.nodes.get(obj.id);
    if (!node || node.style.display === "none") return;
    node.style.width = obj.width + "px";
    const content = node.firstElementChild;
    if (!content) return;
    obj.height = Math.max(Math.ceil(content.scrollHeight), Math.ceil((obj.props.fontSize || 24) * 1.3));
  };

  // Overlay

  Board.prototype.renderOverlay = function () {
    const overlay = this.overlay;
    overlay.textContent = "";
    const selected = this.selectedObjects();
    if (this.gesture && this.gesture.type === "marquee" && this.gesture.rect) {
      const r = this.gesture.rect;
      const a = this.toScreen(r.x, r.y);
      const box = this.make("div", "wb-marquee");
      box.style.left = a.x + "px";
      box.style.top = a.y + "px";
      box.style.width = r.width * this.view.zoom + "px";
      box.style.height = r.height * this.view.zoom + "px";
      overlay.appendChild(box);
    }
    if (this.gesture && this.gesture.type === "create-shape" && this.gesture.rect) {
      const r = this.gesture.rect;
      const a = this.toScreen(r.x, r.y);
      const box = this.make("div", "wb-marquee wb-create-preview");
      box.style.left = a.x + "px";
      box.style.top = a.y + "px";
      box.style.width = r.width * this.view.zoom + "px";
      box.style.height = r.height * this.view.zoom + "px";
      overlay.appendChild(box);
    }
    if (this.gesture && this.gesture.type === "draw") {
      const hl = this.gesture.highlight;
      const color = hl ? this.drawColor({ highlight: true, color: this.highlightColor }) : this.penColor;
      const rect = this.stage.getBoundingClientRect();
      const svg = svgEl("svg", { class: "wb-draw-preview" + (hl ? " is-highlight" : ""), width: rect.width, height: rect.height });
      const pts = this.gesture.points.map((pt) => { const sp = this.toScreen(pt[0], pt[1]); return [sp.x, sp.y]; });
      svg.appendChild(svgEl("path", { d: this.strokePath(pts), fill: "none", stroke: color, "stroke-width": (hl ? HIGHLIGHT_WIDTH : this.penWidth) * this.view.zoom, "stroke-linecap": "round", "stroke-linejoin": "round" }));
      overlay.appendChild(svg);
    }
    this.guides.forEach((g) => {
      const line = this.make("div", "wb-guide");
      if (g.axis === "x") {
        const a = this.toScreen(g.pos, g.from);
        line.style.left = a.x + "px";
        line.style.top = a.y + "px";
        line.style.width = "1px";
        line.style.height = (g.to - g.from) * this.view.zoom + "px";
      } else {
        const a = this.toScreen(g.from, g.pos);
        line.style.left = a.x + "px";
        line.style.top = a.y + "px";
        line.style.height = "1px";
        line.style.width = (g.to - g.from) * this.view.zoom + "px";
      }
      overlay.appendChild(line);
    });
    const g = this.gesture;
    if (g && (g.type === "create-connector" || g.type === "connector-end") && g.target) {
      const b = objectBounds(g.target);
      const a = this.toScreen(b.x, b.y);
      const box = this.make("div", "wb-attach-target");
      box.style.left = a.x + "px";
      box.style.top = a.y + "px";
      box.style.width = b.width * this.view.zoom + "px";
      box.style.height = b.height * this.view.zoom + "px";
      overlay.appendChild(box);
    }
    if (g && g.type === "create-connector") {
      const rect = this.stage.getBoundingClientRect();
      const svg = svgEl("svg", { class: "wb-draw-preview", width: rect.width, height: rect.height });
      const s0 = this.resolveEnd(g.start);
      const a = this.toScreen(s0.x, s0.y);
      const endPoint = g.target ? this.anchorFor(g.target, g.current) : g.current;
      const b = this.toScreen(endPoint.x, endPoint.y);
      svg.appendChild(svgEl("path", { d: "M" + a.x + " " + a.y + " L" + b.x + " " + b.y, stroke: "#0878e8", "stroke-width": 2, "stroke-dasharray": "6 4", fill: "none" }));
      overlay.appendChild(svg);
    }
    if (!selected.length) { this.propsBar.hidden = true; return; }
    const editable = this.canEdit && selected.every((o) => !o.locked);
    if (selected.length === 1 && selected[0].type === "connector") {
      const conn = selected[0];
      ["start", "end"].forEach((key) => {
        const r = this.resolveEnd(conn.props[key]);
        const sp = this.toScreen(r.x, r.y);
        const handle = this.make("div", "wb-handle wb-conn-handle" + (conn.props[key].id ? " is-attached" : "") + (editable && !this.editing ? "" : " is-static"));
        handle.dataset.handle = key === "start" ? "cstart" : "cend";
        handle.style.left = sp.x - 6 + "px";
        handle.style.top = sp.y - 6 + "px";
        overlay.appendChild(handle);
      });
      const b = objectBounds(conn);
      const c = this.toScreen(b.x + b.width / 2, b.y + b.height / 2);
      const frame = { cx: c.x, cy: c.y, w: b.width * this.view.zoom, h: b.height * this.view.zoom, rotation: 0 };
      this.selectionFrame = frame;
      this.renderPropsBar(selected, frame);
      return;
    }
    let frame;
    if (selected.length === 1) {
      const obj = selected[0];
      const c = this.toScreen(obj.x + obj.width / 2, obj.y + obj.height / 2);
      const w = obj.width * this.view.zoom;
      const h = obj.height * this.view.zoom;
      frame = { cx: c.x, cy: c.y, w, h, rotation: obj.rotation || 0 };
    } else {
      selected.forEach((obj) => {
        const b = objectBounds(obj);
        const a = this.toScreen(b.x, b.y);
        const item = this.make("div", "wb-select-item");
        item.style.left = a.x + "px";
        item.style.top = a.y + "px";
        item.style.width = b.width * this.view.zoom + "px";
        item.style.height = b.height * this.view.zoom + "px";
        overlay.appendChild(item);
      });
      const b = unionBounds(selected);
      const c = this.toScreen(b.x + b.width / 2, b.y + b.height / 2);
      frame = { cx: c.x, cy: c.y, w: b.width * this.view.zoom, h: b.height * this.view.zoom, rotation: 0 };
    }
    const box = this.make("div", "wb-selection" + (selected.some((o) => o.locked) ? " is-locked" : ""));
    box.style.left = frame.cx - frame.w / 2 + "px";
    box.style.top = frame.cy - frame.h / 2 + "px";
    box.style.width = frame.w + "px";
    box.style.height = frame.h + "px";
    box.style.transform = frame.rotation ? "rotate(" + frame.rotation + "deg)" : "";
    if (editable && !(this.editing)) {
      const handles = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
      const onlyText = selected.length === 1 && selected[0].type === "text";
      handles.forEach((h) => {
        if (onlyText && (h === "n" || h === "s")) return;
        const handle = this.make("div", "wb-handle wb-handle-" + h);
        handle.dataset.handle = h;
        box.appendChild(handle);
      });
      const rot = this.make("div", "wb-handle wb-rotate");
      rot.dataset.handle = "rotate";
      rot.title = "Girar";
      box.appendChild(rot);
    }
    overlay.appendChild(box);
    this.selectionFrame = frame;
    this.renderPropsBar(selected, frame);
  };

  Board.prototype.selectedObjects = function () {
    return [...this.selection].map((id) => this.objects.get(id)).filter(Boolean);
  };

  Board.prototype.setSelection = function (ids) {
    const prev = [...this.selection].join(",");
    this.selection = new Set(ids.filter((id) => this.objects.has(id)));
    if (prev !== [...this.selection].join(",")) this.popover.hidden = true;
    this.renderOverlay();
  };

  Board.prototype.expandGroups = function (ids) {
    const result = new Set(ids);
    const groups = new Set();
    ids.forEach((id) => { const obj = this.objects.get(id); if (obj && obj.props.groupId) groups.add(obj.props.groupId); });
    if (groups.size) this.objects.forEach((obj) => { if (obj.props.groupId && groups.has(obj.props.groupId)) result.add(obj.id); });
    return [...result];
  };

  // Properties bar

  Board.prototype.renderPropsBar = function (selected, frame) {
    const bar = this.propsBar;
    if (!this.canEdit || this.gesture || this.editing) { bar.hidden = true; return; }
    bar.textContent = "";
    const types = new Set(selected.map((o) => o.type));
    const locked = selected.some((o) => o.locked);
    const add = (node) => bar.appendChild(node);
    const sep = () => add(this.make("span", "wb-sep"));
    if (!locked) {
      if (types.size === 1 && types.has("sticky")) {
        STICKY_COLORS.forEach((color) => {
          const swatch = this.make("button", "wb-swatch" + (selected.every((o) => o.props.color === color.id) ? " active" : ""));
          swatch.type = "button";
          swatch.title = color.label;
          swatch.style.background = color.value;
          swatch.addEventListener("click", () => this.updateProps({ color: color.id }));
          add(swatch);
        });
        sep();
      }
      if (types.size === 1 && types.has("draw") && selected.every((o) => !o.props.highlight)) {
        PEN_COLORS.forEach((color) => {
          const swatch = this.make("button", "wb-swatch" + (selected.every((o) => o.props.color === color.id) ? " active" : ""));
          swatch.type = "button";
          swatch.title = color.label;
          swatch.style.background = color.id;
          swatch.addEventListener("click", () => this.updateProps({ color: color.id }));
          add(swatch);
        });
        sep();
        PEN_WIDTHS.forEach((w) => {
          const b = this.iconButton("", "Espessura " + w, () => this.updateProps({ strokeWidth: w }));
          const dot = this.make("span", "wb-width-dot");
          dot.style.width = w + 4 + "px";
          dot.style.height = w + 4 + "px";
          b.appendChild(dot);
          if (selected.every((o) => Number(o.props.strokeWidth) === w)) b.classList.add("active");
          add(b);
        });
        sep();
      }
      if (types.size === 1 && types.has("draw") && selected.every((o) => o.props.highlight)) {
        HIGHLIGHT_COLORS.forEach((color) => {
          const swatch = this.make("button", "wb-swatch" + (selected.every((o) => o.props.color === color.id) ? " active" : ""));
          swatch.type = "button";
          swatch.title = color.label;
          swatch.style.background = color.value;
          swatch.addEventListener("click", () => this.updateProps({ color: color.id }));
          add(swatch);
        });
        sep();
      }
      if (types.size === 1 && types.has("shape")) {
        const first = selected[0].props;
        add(this.popoverButton("◩", "Tipo de forma", () => this.shapeTypePicker()));
        add(this.colorButton("Preenchimento", first.fill, "fill"));
        add(this.colorButton("Borda", first.stroke, "stroke"));
        add(this.popoverButton("≡", "Espessura e estilo da borda", () => this.strokePicker()));
        add(this.colorButton("Cor do texto", first.textColor || "#0d1b2e", "textColor"));
        sep();
      }
      if (types.size === 1 && types.has("text")) {
        const first = selected[0].props;
        add(this.popoverButton(String(first.fontSize || 24), "Tamanho da fonte", () => this.fontSizePicker()));
        add(this.colorButton("Cor", first.color, "color"));
        ["left", "center", "right"].forEach((align) => {
          const icon = align === "left" ? "⇤" : align === "center" ? "↔" : "⇥";
          const label = align === "left" ? "Alinhar à esquerda" : align === "center" ? "Centralizar" : "Alinhar à direita";
          const b = this.iconButton(icon, label, () => this.updateProps({ align }));
          if (first.align === align) b.classList.add("active");
          add(b);
        });
        const bold = this.iconButton("B", "Negrito", () => this.updateProps({ bold: !first.bold }));
        bold.style.fontWeight = "700";
        if (first.bold) bold.classList.add("active");
        const italic = this.iconButton("I", "Itálico", () => this.updateProps({ italic: !first.italic }));
        italic.style.fontStyle = "italic";
        if (first.italic) italic.classList.add("active");
        add(bold);
        add(italic);
        sep();
      }
      if (types.size === 1 && types.has("connector")) {
        const first = selected[0].props;
        [["straight", "╱", "Reto"], ["curved", "∿", "Curvo"], ["orthogonal", "⌐", "Ortogonal"]].forEach(([id, icon, label]) => {
          const b = this.iconButton(icon, "Traçado " + label.toLowerCase(), () => this.updateProps({ routing: id }));
          if ((first.routing || "straight") === id) b.classList.add("active");
          add(b);
        });
        add(this.popoverButton("⇢", "Pontas e espessura", () => this.connectorPicker()));
        add(this.colorButton("Cor", first.color || "#0d1b2e", "color"));
        sep();
      }
      if (types.size === 1 && types.has("stamp")) {
        STAMPS.forEach((st) => {
          const b = this.iconButton(st.glyph, st.label, () => this.updateProps({ icon: st.id }));
          b.style.color = st.color;
          if (selected.every((o) => o.props.icon === st.id)) b.classList.add("active");
          add(b);
        });
        sep();
      }
      add(this.iconButton("⧉", "Duplicar (Ctrl+D)", () => this.duplicate()));
      add(this.iconButton("⤒", "Trazer para frente (Ctrl+])", () => this.reorder(1)));
      add(this.iconButton("⤓", "Enviar para trás (Ctrl+[)", () => this.reorder(-1)));
    }
    add(this.iconButton(locked ? "🔓" : "🔒", (locked ? "Desbloquear" : "Bloquear") + " (Ctrl+Shift+L)", () => this.toggleLock()));
    if (!locked) add(this.iconButton("🗑", "Excluir (Delete)", () => this.deleteSelection()));
    bar.hidden = false;
    const stageRect = this.stage.getBoundingClientRect();
    const rootRect = this.root.getBoundingClientRect();
    const barRect = bar.getBoundingClientRect();
    const halfH = Math.abs(frame.h / 2 * Math.cos((frame.rotation * Math.PI) / 180)) + Math.abs(frame.w / 2 * Math.sin((frame.rotation * Math.PI) / 180));
    let top = stageRect.top - rootRect.top + frame.cy - halfH - barRect.height - 40;
    if (top < 64) top = stageRect.top - rootRect.top + frame.cy + halfH + 16;
    const left = clamp(stageRect.left - rootRect.left + frame.cx - barRect.width / 2, 8, rootRect.width - barRect.width - 8);
    bar.style.left = left + "px";
    bar.style.top = clamp(top, 64, rootRect.height - barRect.height - 80) + "px";
  };

  Board.prototype.popoverButton = function (label, title, open) {
    const button = this.iconButton(label, title, () => {
      if (!this.popover.hidden && this.popover.dataset.owner === title) { this.popover.hidden = true; return; }
      this.popover.textContent = "";
      this.popover.dataset.owner = title;
      open();
      this.popover.hidden = false;
      const rootRect = this.root.getBoundingClientRect();
      const r = button.getBoundingClientRect();
      const pr = this.popover.getBoundingClientRect();
      this.popover.style.left = clamp(r.left - rootRect.left, 8, rootRect.width - pr.width - 8) + "px";
      this.popover.style.top = r.bottom - rootRect.top + 8 + "px";
    });
    return button;
  };

  Board.prototype.colorButton = function (title, value, prop) {
    const button = this.popoverButton("", title, () => {
      const grid = this.make("div", "wb-palette");
      PALETTE.forEach((color) => {
        const swatch = this.make("button", "wb-swatch" + (color === "transparent" ? " is-transparent" : "") + (color === value ? " active" : ""));
        swatch.type = "button";
        swatch.title = color === "transparent" ? "Sem cor" : color;
        if (color !== "transparent") swatch.style.background = color;
        swatch.addEventListener("click", () => { this.popover.hidden = true; this.updateProps({ [prop]: color }); });
        grid.appendChild(swatch);
      });
      this.popover.append(this.make("p", "wb-popover-title", title), grid);
    });
    const dot = this.make("span", "wb-color-dot" + (value === "transparent" ? " is-transparent" : ""));
    if (value !== "transparent") dot.style.background = value;
    button.appendChild(dot);
    return button;
  };

  Board.prototype.shapeTypePicker = function () {
    const row = this.make("div", "wb-popover-row");
    SHAPES.forEach((shape) => {
      const b = this.iconButton(shape.icon, shape.label, () => { this.popover.hidden = true; this.updateProps({ shape: shape.id }); });
      row.appendChild(b);
    });
    this.popover.append(this.make("p", "wb-popover-title", "Tipo de forma"), row);
  };

  Board.prototype.strokePicker = function () {
    const first = this.selectedObjects()[0].props;
    const widths = this.make("div", "wb-popover-row");
    [0, 1, 2, 4, 8].forEach((w) => {
      const b = this.make("button", "wb-chip" + (Number(first.strokeWidth) === w ? " active" : ""), w ? w + " px" : "Sem");
      b.type = "button";
      b.addEventListener("click", () => this.updateProps({ strokeWidth: w }));
      widths.appendChild(b);
    });
    const styles = this.make("div", "wb-popover-row");
    [["solid", "Sólido"], ["dashed", "Tracejado"]].forEach(([id, label]) => {
      const b = this.make("button", "wb-chip" + (first.strokeStyle === id ? " active" : ""), label);
      b.type = "button";
      b.addEventListener("click", () => this.updateProps({ strokeStyle: id }));
      styles.appendChild(b);
    });
    this.popover.append(this.make("p", "wb-popover-title", "Espessura"), widths, this.make("p", "wb-popover-title", "Estilo"), styles);
  };

  Board.prototype.fontSizePicker = function () {
    const row = this.make("div", "wb-popover-row wb-wrap");
    [12, 16, 20, 24, 32, 48, 64, 96].forEach((size) => {
      const b = this.make("button", "wb-chip", String(size));
      b.type = "button";
      b.addEventListener("click", () => { this.popover.hidden = true; this.updateProps({ fontSize: size }); });
      row.appendChild(b);
    });
    this.popover.append(this.make("p", "wb-popover-title", "Tamanho da fonte"), row);
  };

  Board.prototype.updateProps = function (changes) {
    const targets = this.selectedObjects().filter((o) => !o.locked);
    if (!targets.length) return;
    const entry = this.beginChange(targets.map((o) => o.id));
    targets.forEach((obj) => {
      Object.assign(obj.props, changes);
      if (obj.type === "text") {
        this.renderObject(obj);
        this.syncTextHeight(obj);
      }
    });
    this.commitChange(entry);
  };

  // Editing actions

  Board.prototype.editableSelection = function () {
    return this.selectedObjects().filter((o) => !o.locked);
  };

  Board.prototype.deleteSelection = function () {
    const targets = this.editableSelection();
    if (!targets.length) return;
    const entry = this.beginChange(targets.map((o) => o.id));
    targets.forEach((o) => this.objects.delete(o.id));
    this.commitChange(entry);
    this.setSelection([]);
  };

  Board.prototype.cloneObjects = function (list, offset) {
    const groupMap = new Map();
    const idMap = new Map(list.map((o) => [o.id, uuid()]));
    let z = this.maxZ();
    return list.slice().sort((a, b) => a.zIndex - b.zIndex).map((src) => {
      const copy = clone(src);
      copy.id = idMap.get(src.id);
      if (copy.type === "connector") {
        ["start", "end"].forEach((key) => {
          const ep = copy.props[key];
          if (ep.id && idMap.has(ep.id)) ep.id = idMap.get(ep.id);
          else { ep.id = null; ep.side = null; }
          ep.x += offset;
          ep.y += offset;
        });
      }
      copy.x += offset;
      copy.y += offset;
      copy.zIndex = ++z;
      copy.locked = false;
      copy.createdBy = this.userId;
      copy.createdAt = new Date().toISOString();
      if (copy.props.groupId) {
        if (!groupMap.has(copy.props.groupId)) groupMap.set(copy.props.groupId, uuid());
        copy.props.groupId = groupMap.get(copy.props.groupId);
      }
      return copy;
    });
  };

  Board.prototype.duplicate = function () {
    const source = this.selectedObjects();
    if (!source.length) return;
    const copies = this.cloneObjects(source, 20);
    this.addObjects(copies, true);
  };

  Board.prototype.copy = function () {
    const source = this.selectedObjects();
    if (!source.length) return;
    clipboard = clone(source);
    this.pasteCount = 0;
  };

  Board.prototype.cut = function () {
    this.copy();
    this.deleteSelection();
    this.pasteCount = -1;
  };

  Board.prototype.paste = function () {
    if (!clipboard || !clipboard.length || !this.canEdit) return;
    this.pasteCount += 1;
    const copies = this.cloneObjects(clipboard, 20 * this.pasteCount);
    this.addObjects(copies, true);
  };

  Board.prototype.reorder = function (direction) {
    const targets = this.editableSelection().sort((a, b) => a.zIndex - b.zIndex);
    if (!targets.length) return;
    const entry = this.beginChange(targets.map((o) => o.id));
    if (direction > 0) { let z = this.maxZ(); targets.forEach((o) => { o.zIndex = ++z; }); }
    else { let z = this.minZ() - targets.length; targets.forEach((o) => { o.zIndex = z++; }); }
    this.commitChange(entry);
  };

  Board.prototype.group = function () {
    const targets = this.editableSelection();
    if (targets.length < 2) return;
    const id = uuid();
    const entry = this.beginChange(targets.map((o) => o.id));
    targets.forEach((o) => { o.props.groupId = id; });
    this.commitChange(entry);
  };

  Board.prototype.ungroup = function () {
    const targets = this.editableSelection().filter((o) => o.props.groupId);
    if (!targets.length) return;
    const entry = this.beginChange(targets.map((o) => o.id));
    targets.forEach((o) => { delete o.props.groupId; });
    this.commitChange(entry);
  };

  Board.prototype.toggleLock = function () {
    const targets = this.selectedObjects();
    if (!targets.length || !this.canEdit) return;
    const lock = !targets.some((o) => o.locked);
    const entry = this.beginChange(targets.map((o) => o.id));
    targets.forEach((o) => { o.locked = lock; });
    this.commitChange(entry);
  };

  Board.prototype.nudge = function (dx, dy) {
    const targets = this.editableSelection();
    if (!targets.length) return;
    const entry = this.beginChange(targets.map((o) => o.id));
    targets.forEach((o) => { o.x += dx; o.y += dy; this.shiftFreeEnds(o, dx, dy); });
    this.commitChange(entry, "nudge:" + targets.map((o) => o.id).join(","));
  };

  Board.prototype.selectAll = function () {
    this.setSelection([...this.objects.keys()]);
  };

  // Text editing

  Board.prototype.startEditing = function (id, opts) {
    const obj = this.objects.get(id);
    if (!obj || obj.locked || !this.canEdit) return;
    this.finishEditing();
    const node = this.nodes.get(id);
    if (!node) return;
    const entry = opts && opts.createdEntry ? { before: new Map([[id, null]]) } : this.beginChange([id]);
    let el;
    if (obj.type === "sticky") el = node.querySelector(".wb-sticky-text");
    else if (obj.type === "shape") el = node.querySelector(".wb-shape-text");
    else if (obj.type === "connector") el = node.querySelector(".wb-connector-label");
    else if (obj.type === "text") el = node.querySelector(".wb-text-content");
    if (!el) return;
    this.editing = { id, entry, el };
    node.classList.add("is-editing");
    try { el.contentEditable = "plaintext-only"; } catch (_e) { el.contentEditable = "true"; }
    if (el.contentEditable !== "plaintext-only") el.contentEditable = "true";
    el.spellcheck = true;
    el.addEventListener("input", () => {
      if (obj.type === "sticky") this.fitStickyText(el, obj);
      if (obj.type === "text") {
        obj.props.text = el.innerText.replace(/\n$/, "");
        this.measureText(node, obj);
      }
      this.renderOverlay();
    });
    el.addEventListener("pointerdown", (e) => e.stopPropagation());
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    this.renderOverlay();
  };

  Board.prototype.finishEditing = function () {
    if (!this.editing) return;
    const { id, entry, el } = this.editing;
    this.editing = null;
    const obj = this.objects.get(id);
    const node = this.nodes.get(id);
    if (node) node.classList.remove("is-editing");
    el.contentEditable = "false";
    if (!obj) return;
    const value = el.innerText.replace(/\n$/, "");
    if (obj.type === "connector") obj.props.label = value.trim();
    else obj.props.text = value;
    if (obj.type === "text" && !value.trim()) {
      const existed = entry.before.get(id);
      this.objects.delete(id);
      if (!existed) {
        this.refresh([id]);
        this.setSelection([]);
        return;
      }
      this.commitChange(entry);
      this.setSelection([]);
      return;
    }
    if (node) delete node.dataset.key;
    this.renderObject(obj);
    if (obj.type === "text") this.measureText(node, obj);
    this.commitChange(entry);
    window.getSelection().removeAllRanges();
    this.stage.focus({ preventScroll: true });
  };

  // Carimbo

  Board.prototype.createStamp = function (cx, cy) {
    const obj = this.baseObject("stamp", cx - 32, cy - 32, 64, 64, { icon: this.stampKind });
    this.addObjects([obj], true);
    this.setTool("select");
    this.setSelection([obj.id]);
  };

  Board.prototype.renderStamp = function (node, obj) {
    const stamp = STAMPS.find((st) => st.id === obj.props.icon) || STAMPS[0];
    node.style.setProperty("--stamp-color", stamp.color);
    const glyph = this.make("span", "wb-stamp-glyph", stamp.glyph);
    glyph.style.fontSize = Math.min(obj.width, obj.height) * 0.52 + "px";
    node.appendChild(glyph);
  };

  // Imagem

  Board.prototype.pickImage = function () {
    if (!this.canEdit) return;
    this.fileInput.click();
  };

  Board.prototype.renderImage = function (node, obj) {
    const img = this.make("img", "wb-image-img");
    img.alt = obj.props.name || "Imagem";
    img.draggable = false;
    img.dataset.path = obj.props.path || "";
    const url = this.imageUrls.get(obj.props.path);
    if (url) img.src = url;
    else this.requestImageUrl(obj.props.path);
    node.appendChild(img);
  };

  Board.prototype.requestImageUrl = function (path) {
    if (!path || this.imagePending.has(path)) return;
    this.imagePending.add(path);
    window.clearTimeout(this.imageTimer);
    this.imageTimer = window.setTimeout(async () => {
      const paths = [...this.imagePending].filter((p) => !this.imageUrls.has(p));
      this.imagePending.clear();
      if (!paths.length) return;
      try {
        const urls = await this.api.signBoardImages(paths);
        Object.entries(urls).forEach(([p, url]) => {
          this.imageUrls.set(p, url);
          this.world.querySelectorAll("img.wb-image-img").forEach((img) => { if (img.dataset.path === p) img.src = url; });
        });
      } catch (_error) {
        // A imagem fica sem pré-visualização até a próxima abertura do quadro.
      }
    }, 30);
  };

  Board.prototype.imageSize = function (file) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { resolve({ width: img.naturalWidth || 300, height: img.naturalHeight || 300, url }); };
      img.onerror = () => resolve({ width: 300, height: 300, url });
      img.src = url;
    });
  };

  Board.prototype.insertImages = async function (files, point) {
    if (!this.canEdit || !files.length) return;
    const valid = [];
    files.forEach((file) => {
      if (!IMAGE_TYPES.includes(file.type)) this.o.toast("Formato não aceito: " + file.name + ". Use PNG, JPG, GIF, SVG ou WEBP.", "error");
      else if (file.size > IMAGE_MAX_BYTES) this.o.toast("A imagem " + file.name + " passa de 10 MB.", "error");
      else valid.push(file);
    });
    if (!valid.length) return;
    this.o.toast(valid.length === 1 ? "Enviando imagem…" : "Enviando " + valid.length + " imagens…");
    const created = [];
    for (let i = 0; i < valid.length; i += 1) {
      const file = valid[i];
      try {
        const size = await this.imageSize(file);
        const path = await this.api.uploadBoardImage(this.boardId, file);
        this.imageUrls.set(path, size.url);
        const scale = Math.min(1, 480 / size.width, 480 / size.height);
        const w = Math.max(16, size.width * scale);
        const h = Math.max(16, size.height * scale);
        const offset = i * 24;
        const obj = this.baseObject("image", point.x - w / 2 + offset, point.y - h / 2 + offset, w, h, { path, name: file.name, naturalWidth: size.width, naturalHeight: size.height });
        created.push(obj);
      } catch (error) {
        this.o.toast(error.message || "Não foi possível enviar a imagem.", "error");
      }
    }
    if (created.length) {
      this.addObjects(created, true);
      this.setTool("select");
      this.setSelection(created.map((o) => o.id));
    }
  };

  Board.prototype.onPaste = function (e) {
    if (!this.root.isConnected || this.editing || !this.canEdit) return;
    const target = e.target;
    if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
    if (document.activeElement && document.activeElement !== document.body && !this.root.contains(document.activeElement)) return;
    this.pasteHandled = true;
    const files = [...((e.clipboardData && e.clipboardData.files) || [])].filter((f) => f.type.startsWith("image/"));
    e.preventDefault();
    if (files.length) {
      const rect = this.stage.getBoundingClientRect();
      this.insertImages(files, this.toWorld(rect.left + rect.width / 2, rect.top + rect.height / 2));
      return;
    }
    this.paste();
  };

  // Conector

  Board.prototype.withConnectors = function (ids) {
    const list = [...ids];
    const set = new Set(list);
    this.objects.forEach((obj) => {
      if (obj.type !== "connector" || set.has(obj.id)) return;
      if ((obj.props.start && set.has(obj.props.start.id)) || (obj.props.end && set.has(obj.props.end.id))) { set.add(obj.id); list.push(obj.id); }
    });
    return list;
  };

  Board.prototype.isAttachable = function (obj) {
    return obj && obj.type !== "connector" && obj.type !== "draw";
  };

  Board.prototype.attachTargetAt = function (clientX, clientY, excludeId) {
    const els = document.elementsFromPoint(clientX, clientY);
    for (const el of els) {
      const node = el.closest && el.closest(".wb-object");
      if (!node || !this.world.contains(node)) continue;
      const obj = this.objects.get(node.dataset.id);
      if (this.isAttachable(obj) && obj.id !== excludeId) return obj;
    }
    return null;
  };

  Board.prototype.sidePoint = function (obj, side) {
    const cx = obj.x + obj.width / 2;
    const cy = obj.y + obj.height / 2;
    const local = side === "top" ? [cx, obj.y] : side === "bottom" ? [cx, obj.y + obj.height] : side === "left" ? [obj.x, cy] : [obj.x + obj.width, cy];
    const normalLocal = side === "top" ? [0, -1] : side === "bottom" ? [0, 1] : side === "left" ? [-1, 0] : [1, 0];
    const p = rotatePoint(local[0], local[1], cx, cy, obj.rotation || 0);
    const n = rotatePoint(normalLocal[0], normalLocal[1], 0, 0, obj.rotation || 0);
    return { x: p.x, y: p.y, nx: n.x, ny: n.y };
  };

  Board.prototype.anchorFor = function (obj, point) {
    let best = null;
    ["top", "right", "bottom", "left"].forEach((side) => {
      const sp = this.sidePoint(obj, side);
      const d = Math.hypot(sp.x - point.x, sp.y - point.y);
      if (!best || d < best.d) best = { d, side, x: sp.x, y: sp.y };
    });
    return { id: obj.id, side: best.side, x: best.x, y: best.y };
  };

  Board.prototype.resolveEnd = function (ep) {
    const obj = ep && ep.id ? this.objects.get(ep.id) : null;
    if (obj) return this.sidePoint(obj, ep.side || "right");
    return { x: ep.x, y: ep.y, nx: 0, ny: 0 };
  };

  Board.prototype.shiftFreeEnds = function (obj, dx, dy) {
    if (obj.type !== "connector") return;
    const props = clone(obj.props);
    ["start", "end"].forEach((key) => { if (!props[key].id) { props[key].x += dx; props[key].y += dy; } });
    obj.props = props;
  };

  Board.prototype.updateConnectorGeometry = function (conn) {
    const props = conn.props;
    let changed = false;
    ["start", "end"].forEach((key) => {
      const ep = props[key];
      if (ep.id && !this.objects.has(ep.id)) { ep.id = null; ep.side = null; changed = true; }
      const r = this.resolveEnd(ep);
      if (Math.abs(r.x - ep.x) > 0.01 || Math.abs(r.y - ep.y) > 0.01) { ep.x = r.x; ep.y = r.y; changed = true; }
    });
    const pad = 24 + (props.strokeWidth || 2) * 2;
    const x = Math.min(props.start.x, props.end.x) - pad;
    const y = Math.min(props.start.y, props.end.y) - pad;
    const w = Math.abs(props.start.x - props.end.x) + pad * 2;
    const h = Math.abs(props.start.y - props.end.y) + pad * 2;
    if (Math.abs(conn.x - x) > 0.01 || Math.abs(conn.y - y) > 0.01 || Math.abs(conn.width - w) > 0.01 || Math.abs(conn.height - h) > 0.01) changed = true;
    conn.x = x; conn.y = y; conn.width = w; conn.height = h; conn.rotation = 0;
    return changed;
  };

  Board.prototype.syncConnectors = function (ids, render) {
    for (const id of ids) {
      const obj = this.objects.get(id);
      if (!obj || obj.type !== "connector") continue;
      obj.props = clone(obj.props);
      this.updateConnectorGeometry(obj);
      if (render) this.renderObject(obj);
    }
  };

  Board.prototype.createConnector = function (start, end) {
    const props = { start: clone(start), end: clone(end), routing: "straight", startHead: "none", endHead: "arrow", color: "#0d1b2e", strokeWidth: 2, label: "" };
    const obj = this.baseObject("connector", 0, 0, 1, 1, props);
    this.updateConnectorGeometry(obj);
    this.addObjects([obj], true);
    this.setTool("select");
    this.setSelection([obj.id]);
  };

  Board.prototype.connectorPath = function (props, ox, oy) {
    const a = this.resolveEnd(props.start);
    const b = this.resolveEnd(props.end);
    const sx = a.x - ox; const sy = a.y - oy; const ex = b.x - ox; const ey = b.y - oy;
    const dist = Math.hypot(ex - sx, ey - sy) || 1;
    const dirOf = (r, fromX, fromY, toX, toY) => (r.nx || r.ny ? { x: r.nx, y: r.ny } : { x: (toX - fromX) / dist, y: (toY - fromY) / dist });
    const ns = dirOf(a, sx, sy, ex, ey);
    const ne = dirOf(b, ex, ey, sx, sy);
    if (props.routing === "curved") {
      const k = Math.max(40, dist * 0.4);
      return "M" + sx + " " + sy + " C" + (sx + ns.x * k) + " " + (sy + ns.y * k) + " " + (ex + ne.x * k) + " " + (ey + ne.y * k) + " " + ex + " " + ey;
    }
    if (props.routing === "orthogonal") {
      const horizontal = a.nx || a.ny ? Math.abs(ns.x) >= Math.abs(ns.y) : Math.abs(ex - sx) >= Math.abs(ey - sy);
      if (horizontal) {
        const mx = (sx + ex) / 2;
        return "M" + sx + " " + sy + " H" + mx + " V" + ey + " H" + ex;
      }
      const my = (sy + ey) / 2;
      return "M" + sx + " " + sy + " V" + my + " H" + ex + " V" + ey;
    }
    return "M" + sx + " " + sy + " L" + ex + " " + ey;
  };

  Board.prototype.renderConnector = function (node, obj) {
    const p = obj.props;
    const sw = Number(p.strokeWidth) || 2;
    const color = p.color || "#0d1b2e";
    const svg = svgEl("svg", { class: "wb-connector-svg", width: obj.width, height: obj.height });
    const defs = svgEl("defs");
    const marker = (id, kind) => {
      const m = svgEl("marker", { id, viewBox: "0 0 10 10", markerWidth: 4, markerHeight: 4, orient: "auto-start-reverse", markerUnits: "strokeWidth", refX: kind === "arrow" ? 8 : 5, refY: 5 });
      if (kind === "arrow") m.appendChild(svgEl("path", { d: "M0,0 L10,5 L0,10 z", fill: color }));
      else m.appendChild(svgEl("circle", { cx: 5, cy: 5, r: 4, fill: color }));
      defs.appendChild(m);
      return "url(#" + id + ")";
    };
    const d = this.connectorPath(p, obj.x, obj.y);
    const line = svgEl("path", { d, fill: "none", stroke: color, "stroke-width": sw, "stroke-linecap": "round", "stroke-linejoin": "round", class: "wb-connector-line" });
    if (p.startHead && p.startHead !== "none") line.setAttribute("marker-start", marker("wbm-" + obj.id + "-s", p.startHead));
    if (p.endHead && p.endHead !== "none") line.setAttribute("marker-end", marker("wbm-" + obj.id + "-e", p.endHead));
    const hit = svgEl("path", { d, fill: "none", stroke: "transparent", "stroke-width": Math.max(14, sw + 10), class: "wb-connector-hit" });
    svg.append(defs, line, hit);
    node.appendChild(svg);
    const label = this.make("div", "wb-connector-label");
    label.textContent = p.label || "";
    node.appendChild(label);
    let mid = { x: (p.start.x + p.end.x) / 2 - obj.x, y: (p.start.y + p.end.y) / 2 - obj.y };
    try {
      const total = line.getTotalLength();
      if (total) mid = line.getPointAtLength(total / 2);
    } catch (_e) {
      // Sem geometria calculada, o rótulo fica no ponto médio entre as pontas.
    }
    label.style.left = mid.x + "px";
    label.style.top = mid.y + "px";
  };

  Board.prototype.connectorPicker = function () {
    const first = this.selectedObjects()[0].props;
    const heads = [["none", "Nenhuma"], ["arrow", "Seta"], ["circle", "Círculo"]];
    const row = (title, prop) => {
      const r = this.make("div", "wb-popover-row");
      heads.forEach(([id, label]) => {
        const b = this.make("button", "wb-chip" + ((first[prop] || "none") === id ? " active" : ""), label);
        b.type = "button";
        b.addEventListener("click", () => { this.popover.hidden = true; this.updateProps({ [prop]: id }); });
        r.appendChild(b);
      });
      this.popover.append(this.make("p", "wb-popover-title", title), r);
    };
    row("Ponta inicial", "startHead");
    row("Ponta final", "endHead");
    const widths = this.make("div", "wb-popover-row");
    [1, 2, 4, 6].forEach((w) => {
      const b = this.make("button", "wb-chip" + (Number(first.strokeWidth) === w ? " active" : ""), w + " px");
      b.type = "button";
      b.addEventListener("click", () => { this.popover.hidden = true; this.updateProps({ strokeWidth: w }); });
      widths.appendChild(b);
    });
    this.popover.append(this.make("p", "wb-popover-title", "Espessura"), widths);
  };

  // Pointer handling

  Board.prototype.onPointerDown = function (e) {
    if (this.editing && this.editing.el.contains(e.target)) return;
    this.contextMenu.hidden = true;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      this.startPinch();
      return;
    }
    if (this.pointers.size > 2) return;
    if (this.editing) this.finishEditing();
    this.stage.focus({ preventScroll: true });
    const point = this.toWorld(e.clientX, e.clientY);
    const handleEl = e.target.closest && e.target.closest("[data-handle]");
    const objectEl = e.target.closest && e.target.closest(".wb-object");
    const hit = objectEl ? this.objects.get(objectEl.dataset.id) : null;

    if (e.button === 1 || this.spaceDown || this.tool === "hand") {
      e.preventDefault();
      this.gesture = { type: "pan", startX: e.clientX, startY: e.clientY, view: { ...this.view }, pointerId: e.pointerId };
      this.stage.classList.add("is-panning");
      return;
    }
    if (e.button === 2) return;
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.preventDefault();

    if (this.tool === "sticky") {
      this.createSticky(point.x, point.y);
      return;
    }
    if (this.tool === "text") {
      this.createText(point.x, point.y);
      return;
    }
    if (this.tool === "shape") {
      this.gesture = { type: "create-shape", start: point, rect: null, pointerId: e.pointerId };
      return;
    }
    if (this.tool === "eraser") {
      this.gesture = { type: "erase", ids: new Set(), last: { x: e.clientX, y: e.clientY }, pointerId: e.pointerId };
      this.eraseAt(e.clientX, e.clientY);
      return;
    }
    if (this.tool === "stamp") {
      this.createStamp(point.x, point.y);
      return;
    }
    if (this.tool === "connector") {
      const target = this.attachTargetAt(e.clientX, e.clientY, null);
      this.gesture = { type: "create-connector", start: target ? this.anchorFor(target, point) : { id: null, side: null, x: point.x, y: point.y }, current: point, target: null, pointerId: e.pointerId, startClient: { x: e.clientX, y: e.clientY } };
      this.renderOverlay();
      return;
    }
    if (handleEl && this.canEdit && (handleEl.dataset.handle === "cstart" || handleEl.dataset.handle === "cend")) {
      const conn = this.selectedObjects()[0];
      if (!conn || conn.type !== "connector" || conn.locked) return;
      this.gesture = { type: "connector-end", id: conn.id, key: handleEl.dataset.handle === "cstart" ? "start" : "end", entry: this.beginChange([conn.id]), target: null, pointerId: e.pointerId };
      return;
    }
    if (this.tool === "highlight" || this.tool === "pen") {
      this.gesture = { type: "draw", highlight: this.tool === "highlight", points: [[point.x, point.y]], pointerId: e.pointerId };
      this.renderOverlay();
      return;
    }

    if (handleEl && this.canEdit) {
      const selected = this.editableSelection();
      if (!selected.length) return;
      const entry = this.beginChange(selected.map((o) => o.id));
      const originals = new Map(selected.map((o) => [o.id, clone(o)]));
      const bounds = unionBounds(selected);
      if (handleEl.dataset.handle === "rotate") {
        const center = selected.length === 1 ? { x: selected[0].x + selected[0].width / 2, y: selected[0].y + selected[0].height / 2 } : { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
        this.gesture = { type: "rotate", entry, originals, center, startAngle: Math.atan2(point.y - center.y, point.x - center.x), pointerId: e.pointerId };
      } else {
        this.gesture = { type: "resize", handle: handleEl.dataset.handle, entry, originals, bounds, start: point, pointerId: e.pointerId };
      }
      this.renderOverlay();
      return;
    }

    if (hit) {
      const groupIds = this.expandGroups([hit.id]);
      if (e.shiftKey) {
        const next = new Set(this.selection);
        const isSelected = next.has(hit.id);
        groupIds.forEach((id) => { if (isSelected) next.delete(id); else next.add(id); });
        this.setSelection([...next]);
        return;
      }
      if (!this.selection.has(hit.id)) this.setSelection(groupIds);
      if (!this.canEdit) return;
      let targets = this.editableSelection();
      if (!targets.length) return;
      if (e.altKey) {
        const copies = this.cloneObjects(targets, 0);
        const entry = this.beginChange(copies.map((o) => o.id));
        copies.forEach((c) => { this.objects.set(c.id, c); this.renderObject(c); });
        this.setSelection(copies.map((c) => c.id));
        targets = copies;
        this.gesture = { type: "move", entry, start: point, originals: new Map(copies.map((o) => [o.id, clone(o)])), moved: true, pointerId: e.pointerId };
        return;
      }
      const entry = this.beginChange(targets.map((o) => o.id));
      this.gesture = { type: "move", entry, start: point, originals: new Map(targets.map((o) => [o.id, clone(o)])), moved: false, pointerId: e.pointerId };
      return;
    }

    if (!e.shiftKey) this.setSelection([]);
    this.gesture = { type: "marquee", start: point, rect: null, base: e.shiftKey ? [...this.selection] : [], pointerId: e.pointerId };
  };

  Board.prototype.onPointerMove = function (e) {
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = this.gesture;
    if (!g) return;
    if (g.type === "pinch") { this.updatePinch(); return; }
    if (g.pointerId !== e.pointerId) return;
    const point = this.toWorld(e.clientX, e.clientY);
    if (g.type === "pan") {
      this.view.x = g.view.x - (e.clientX - g.startX) / this.view.zoom;
      this.view.y = g.view.y - (e.clientY - g.startY) / this.view.zoom;
      this.updateView();
      return;
    }
    if (g.type === "marquee") {
      const rect = { x: Math.min(g.start.x, point.x), y: Math.min(g.start.y, point.y), width: Math.abs(point.x - g.start.x), height: Math.abs(point.y - g.start.y) };
      g.rect = rect;
      const ids = new Set(g.base);
      this.objects.forEach((obj) => { if (!obj.locked && intersects(objectBounds(obj), rect)) ids.add(obj.id); });
      this.selection = new Set(this.expandGroups([...ids]).filter((id) => !this.objects.get(id).locked || g.base.includes(id)));
      this.renderOverlay();
      return;
    }
    if (g.type === "erase") {
      const dist = Math.hypot(e.clientX - g.last.x, e.clientY - g.last.y);
      const steps = Math.max(1, Math.ceil(dist / 4));
      for (let i = 1; i <= steps; i += 1) this.eraseAt(g.last.x + ((e.clientX - g.last.x) * i) / steps, g.last.y + ((e.clientY - g.last.y) * i) / steps);
      g.last = { x: e.clientX, y: e.clientY };
      return;
    }
    if (g.type === "draw") {
      const last = g.points[g.points.length - 1];
      if (Math.hypot(point.x - last[0], point.y - last[1]) * this.view.zoom >= 2) {
        g.points.push([point.x, point.y]);
        this.renderOverlay();
      }
      return;
    }
    if (g.type === "create-shape") {
      let w = point.x - g.start.x;
      let h = point.y - g.start.y;
      if (e.shiftKey) { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m; }
      g.rect = { x: Math.min(g.start.x, g.start.x + w), y: Math.min(g.start.y, g.start.y + h), width: Math.abs(w), height: Math.abs(h) };
      this.renderOverlay();
      return;
    }
    if (g.type === "move") {
      let dx = point.x - g.start.x;
      let dy = point.y - g.start.y;
      if (!g.moved && Math.hypot(dx * this.view.zoom, dy * this.view.zoom) < 3) return;
      g.moved = true;
      const snap = this.snapMove(g.originals, dx, dy);
      dx = snap.dx;
      dy = snap.dy;
      this.guides = snap.guides;
      g.originals.forEach((orig, id) => {
        const obj = this.objects.get(id);
        obj.x = orig.x + dx;
        obj.y = orig.y + dy;
        if (obj.type === "connector") {
          obj.props = clone(orig.props);
          this.shiftFreeEnds(obj, dx, dy);
        }
        this.renderObject(obj);
      });
      this.syncConnectors(g.entry.before.keys(), true);
      this.renderOverlay();
      return;
    }
    if (g.type === "create-connector") {
      g.current = point;
      g.target = this.attachTargetAt(e.clientX, e.clientY, g.start.id);
      this.renderOverlay();
      return;
    }
    if (g.type === "connector-end") {
      const conn = this.objects.get(g.id);
      g.target = this.attachTargetAt(e.clientX, e.clientY, conn.props[g.key === "start" ? "end" : "start"].id);
      conn.props = Object.assign({}, conn.props, { [g.key]: g.target ? this.anchorFor(g.target, point) : { id: null, side: null, x: point.x, y: point.y } });
      this.syncConnectors([conn.id], true);
      this.renderOverlay();
      return;
    }
    if (g.type === "rotate") {
      const angle = Math.atan2(point.y - g.center.y, point.x - g.center.x);
      let delta = ((angle - g.startAngle) * 180) / Math.PI;
      g.originals.forEach((orig, id) => {
        const obj = this.objects.get(id);
        if (obj.type === "connector") {
          const props = clone(orig.props);
          ["start", "end"].forEach((key) => {
            if (props[key].id) return;
            const r = rotatePoint(props[key].x, props[key].y, g.center.x, g.center.y, e.shiftKey ? Math.round(delta / 15) * 15 : delta);
            props[key].x = r.x;
            props[key].y = r.y;
          });
          obj.props = props;
          return;
        }
        let rotation = (orig.rotation || 0) + delta;
        if (e.shiftKey) rotation = Math.round(rotation / 15) * 15;
        rotation = ((rotation % 360) + 360) % 360;
        const realDelta = rotation - (orig.rotation || 0);
        const oc = { x: orig.x + orig.width / 2, y: orig.y + orig.height / 2 };
        const nc = rotatePoint(oc.x, oc.y, g.center.x, g.center.y, realDelta);
        obj.x = nc.x - orig.width / 2;
        obj.y = nc.y - orig.height / 2;
        obj.rotation = Math.abs(rotation) < 0.01 ? 0 : rotation;
        this.renderObject(obj);
      });
      this.syncConnectors(g.entry.before.keys(), true);
      this.renderOverlay();
      return;
    }
    if (g.type === "resize") {
      this.applyResize(g, point, e.shiftKey);
      this.syncConnectors(g.entry.before.keys(), true);
      this.renderOverlay();
    }
  };

  Board.prototype.applyResize = function (g, point, keepRatio) {
    const h = g.handle;
    const minSize = 16;
    if (g.originals.size === 1) {
      const [id, orig] = [...g.originals.entries()][0];
      const obj = this.objects.get(id);
      const rot = orig.rotation || 0;
      const cx = orig.x + orig.width / 2;
      const cy = orig.y + orig.height / 2;
      const local = rotatePoint(point.x, point.y, cx, cy, -rot);
      let left = orig.x; let right = orig.x + orig.width; let top = orig.y; let bottom = orig.y + orig.height;
      if (h.includes("w")) left = Math.min(local.x, right - minSize);
      if (h.includes("e")) right = Math.max(local.x, left + minSize);
      if (h.includes("n")) top = Math.min(local.y, bottom - minSize);
      if (h.includes("s")) bottom = Math.max(local.y, top + minSize);
      const ratioLocked = keepRatio || obj.type === "sticky" || obj.type === "stamp" || obj.type === "image";
      if (ratioLocked && h.length === 2 && obj.type !== "text") {
        const ratio = orig.width / orig.height;
        let w = right - left; let hh = bottom - top;
        if (w / hh > ratio) w = hh * ratio; else hh = w / ratio;
        if (h.includes("w")) left = right - w; else right = left + w;
        if (h.includes("n")) top = bottom - hh; else bottom = top + hh;
      }
      const w = right - left;
      const hh = bottom - top;
      const localCenter = { x: left + w / 2, y: top + hh / 2 };
      const worldCenter = rotatePoint(localCenter.x, localCenter.y, cx, cy, rot);
      obj.x = worldCenter.x - w / 2;
      obj.y = worldCenter.y - hh / 2;
      obj.width = w;
      if (obj.type === "text") {
        if (h.includes("e") || h.includes("w")) obj.props = Object.assign({}, obj.props, { autoWidth: false });
        this.renderObject(obj);
        this.syncTextHeight(obj);
        this.renderObject(obj);
      } else {
        obj.height = hh;
        this.renderObject(obj);
      }
      return;
    }
    const b = g.bounds;
    let left = b.x; let right = b.x + b.width; let top = b.y; let bottom = b.y + b.height;
    if (h.includes("w")) left = Math.min(point.x, right - minSize);
    if (h.includes("e")) right = Math.max(point.x, left + minSize);
    if (h.includes("n")) top = Math.min(point.y, bottom - minSize);
    if (h.includes("s")) bottom = Math.max(point.y, top + minSize);
    let sx = (right - left) / b.width;
    let sy = (bottom - top) / b.height;
    if (h.length === 2) {
      const s = Math.min(sx, sy);
      sx = s; sy = s;
      if (h.includes("w")) left = right - b.width * s; else right = left + b.width * s;
      if (h.includes("n")) top = bottom - b.height * s; else bottom = top + b.height * s;
    }
    g.originals.forEach((orig, id) => {
      const obj = this.objects.get(id);
      if (obj.type === "connector") {
        const props = clone(orig.props);
        ["start", "end"].forEach((key) => {
          if (props[key].id) return;
          props[key].x = left + (props[key].x - b.x) * sx;
          props[key].y = top + (props[key].y - b.y) * sy;
        });
        obj.props = props;
        return;
      }
      const cx = orig.x + orig.width / 2;
      const cy = orig.y + orig.height / 2;
      const ncx = left + (cx - b.x) * sx;
      const ncy = top + (cy - b.y) * sy;
      const uniform = obj.type === "sticky" || obj.type === "stamp" || obj.type === "image" ? Math.min(sx, sy) : null;
      const w = Math.max(orig.width * (uniform || sx), 8);
      const hh = Math.max(orig.height * (uniform || sy), 8);
      obj.width = w;
      obj.x = ncx - w / 2;
      if (obj.type === "text") {
        obj.props = Object.assign({}, obj.props, { fontSize: Math.max(6, Math.round((orig.props.fontSize || 24) * Math.min(sx, sy))), autoWidth: orig.props.autoWidth });
        this.renderObject(obj);
        if (obj.props.autoWidth) this.measureText(this.nodes.get(id), obj); else this.syncTextHeight(obj);
        obj.x = ncx - obj.width / 2;
        obj.y = ncy - obj.height / 2;
        this.renderObject(obj);
      } else {
        obj.height = hh;
        obj.y = ncy - hh / 2;
        this.renderObject(obj);
      }
    });
  };

  Board.prototype.snapMove = function (originals, dx, dy) {
    const moving = [...originals.values()].map((o) => Object.assign({}, o, { x: o.x + dx, y: o.y + dy }));
    const b = unionBounds(moving);
    const threshold = 6 / this.view.zoom;
    const vr = this.visibleRect();
    const xs = [b.x, b.x + b.width / 2, b.x + b.width];
    const ys = [b.y, b.y + b.height / 2, b.y + b.height];
    let bestX = null; let bestY = null;
    this.objects.forEach((obj) => {
      if (originals.has(obj.id)) return;
      const ob = objectBounds(obj);
      if (!intersects(ob, vr)) return;
      const oxs = [ob.x, ob.x + ob.width / 2, ob.x + ob.width];
      const oys = [ob.y, ob.y + ob.height / 2, ob.y + ob.height];
      xs.forEach((x) => oxs.forEach((ox) => {
        const d = ox - x;
        if (Math.abs(d) <= threshold && (!bestX || Math.abs(d) < Math.abs(bestX.d))) bestX = { d, pos: ox, other: ob };
      }));
      ys.forEach((y) => oys.forEach((oy) => {
        const d = oy - y;
        if (Math.abs(d) <= threshold && (!bestY || Math.abs(d) < Math.abs(bestY.d))) bestY = { d, pos: oy, other: ob };
      }));
    });
    const guides = [];
    if (bestX) {
      dx += bestX.d;
      const from = Math.min(b.y, bestX.other.y);
      const to = Math.max(b.y + b.height, bestX.other.y + bestX.other.height);
      guides.push({ axis: "x", pos: bestX.pos, from, to });
    }
    if (bestY) {
      dy += bestY.d;
      const from = Math.min(b.x + (bestX ? bestX.d : 0), bestY.other.x);
      const to = Math.max(b.x + b.width + (bestX ? bestX.d : 0), bestY.other.x + bestY.other.width);
      guides.push({ axis: "y", pos: bestY.pos, from, to });
    }
    return { dx, dy, guides };
  };

  Board.prototype.onPointerUp = function (e) {
    this.pointers.delete(e.pointerId);
    const g = this.gesture;
    if (!g) return;
    if (g.type === "pinch") {
      if (this.pointers.size < 2) this.gesture = null;
      return;
    }
    if (g.pointerId !== e.pointerId) return;
    this.gesture = null;
    this.guides = [];
    this.stage.classList.remove("is-panning");
    if (g.type === "draw") {
      this.createStroke(g.points, g.highlight);
      return;
    }
    if (g.type === "erase") {
      if (!g.ids.size) return;
      const entry = this.beginChange([...g.ids]);
      g.ids.forEach((id) => this.objects.delete(id));
      this.commitChange(entry);
      this.setSelection([...this.selection].filter((id) => this.objects.has(id)));
      return;
    }
    if (g.type === "create-shape") {
      const r = g.rect && g.rect.width * this.view.zoom > 4 && g.rect.height * this.view.zoom > 4 ? g.rect : null;
      const size = this.shapeKind === "arrow" ? { w: 200, h: 100 } : { w: 160, h: 160 };
      if (r) this.createShape(r.x, r.y, Math.max(r.width, 8), Math.max(r.height, 8));
      else this.createShape(g.start.x - size.w / 2, g.start.y - size.h / 2, size.w, size.h);
      this.setTool("select");
      const last = this.history[this.history.length - 1];
      if (last) this.setSelection([...last.after.keys()]);
      return;
    }
    if (g.type === "create-connector") {
      const dist = Math.hypot(e.clientX - g.startClient.x, e.clientY - g.startClient.y);
      if (dist < 8) { this.renderOverlay(); return; }
      const point = this.toWorld(e.clientX, e.clientY);
      const end = g.target ? this.anchorFor(g.target, point) : { id: null, side: null, x: point.x, y: point.y };
      this.createConnector(g.start, end);
      return;
    }
    if (g.type === "connector-end") {
      this.commitChange(g.entry);
      return;
    }
    if (g.type === "move" || g.type === "resize" || g.type === "rotate") {
      if (g.type === "move" && !g.moved) { this.renderOverlay(); return; }
      this.commitChange(g.entry);
      return;
    }
    this.renderOverlay();
  };

  Board.prototype.eraseAt = function (clientX, clientY) {
    const g = this.gesture;
    document.elementsFromPoint(clientX, clientY).forEach((el) => {
      const node = el.closest && el.closest(".wb-draw");
      if (!node || !this.world.contains(node)) return;
      const obj = this.objects.get(node.dataset.id);
      if (!obj || obj.locked || g.ids.has(obj.id)) return;
      g.ids.add(obj.id);
      node.classList.add("is-erasing");
    });
  };

  Board.prototype.cancelGesture = function () {
    const g = this.gesture;
    if (!g) return false;
    if (g.type === "erase") g.ids.forEach((id) => { const node = this.nodes.get(id); if (node) node.classList.remove("is-erasing"); });
    this.gesture = null;
    this.guides = [];
    this.stage.classList.remove("is-panning");
    if (g.entry) {
      g.entry.before.forEach((value, id) => {
        if (value) this.objects.set(id, clone(value));
        else this.objects.delete(id);
      });
      this.refresh(g.entry.before.keys());
      this.setSelection([...this.selection].filter((id) => this.objects.has(id)));
    }
    this.renderOverlay();
    return true;
  };

  Board.prototype.startPinch = function () {
    if (this.gesture && this.gesture.entry) this.cancelGesture();
    const pts = [...this.pointers.values()];
    const rect = this.stage.getBoundingClientRect();
    const mid = { x: (pts[0].x + pts[1].x) / 2 - rect.left, y: (pts[0].y + pts[1].y) / 2 - rect.top };
    this.gesture = {
      type: "pinch",
      dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
      zoom: this.view.zoom,
      world: { x: mid.x / this.view.zoom + this.view.x, y: mid.y / this.view.zoom + this.view.y },
    };
  };

  Board.prototype.updatePinch = function () {
    const g = this.gesture;
    const pts = [...this.pointers.values()];
    if (pts.length < 2) return;
    const rect = this.stage.getBoundingClientRect();
    const mid = { x: (pts[0].x + pts[1].x) / 2 - rect.left, y: (pts[0].y + pts[1].y) / 2 - rect.top };
    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    const zoom = clamp(g.zoom * (dist / Math.max(g.dist, 1)), MIN_ZOOM, MAX_ZOOM);
    this.view.zoom = zoom;
    this.view.x = g.world.x - mid.x / zoom;
    this.view.y = g.world.y - mid.y / zoom;
    this.updateView();
  };

  Board.prototype.onWheel = function (e) {
    if (this.editing && this.editing.el.contains(e.target)) return;
    e.preventDefault();
    const rect = this.stage.getBoundingClientRect();
    const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? rect.height : 1;
    const dx = e.deltaX * scale;
    const dy = e.deltaY * scale;
    if (e.ctrlKey || e.metaKey) {
      const factor = Math.exp(-dy * 0.0025);
      this.zoomAt(this.view.zoom * factor, e.clientX - rect.left, e.clientY - rect.top);
      return;
    }
    if (e.shiftKey && !dx) {
      this.view.x += dy / this.view.zoom;
    } else {
      this.view.x += dx / this.view.zoom;
      this.view.y += dy / this.view.zoom;
    }
    this.updateView();
  };

  Board.prototype.onDoubleClick = function (e) {
    if (!this.canEdit || this.tool !== "select") return;
    const objectEl = e.target.closest && e.target.closest(".wb-object");
    if (objectEl) {
      this.setSelection([objectEl.dataset.id]);
      this.startEditing(objectEl.dataset.id);
    }
  };

  Board.prototype.onContextMenu = function (e) {
    e.preventDefault();
    if (this.editing) return;
    const objectEl = e.target.closest && e.target.closest(".wb-object");
    if (objectEl && !this.selection.has(objectEl.dataset.id)) this.setSelection(this.expandGroups([objectEl.dataset.id]));
    if (!objectEl && !(e.target.closest && e.target.closest(".wb-selection"))) this.setSelection([]);
    const menu = this.contextMenu;
    menu.textContent = "";
    const items = [];
    const hasSelection = this.selection.size > 0;
    const locked = this.selectedObjects().some((o) => o.locked);
    if (this.canEdit && hasSelection) {
      if (!locked) {
        items.push(["Duplicar", "Ctrl+D", () => this.duplicate()]);
        items.push(["Copiar", "Ctrl+C", () => this.copy()]);
        items.push(["Recortar", "Ctrl+X", () => this.cut()]);
      }
      if (clipboard) items.push(["Colar", "Ctrl+V", () => this.paste()]);
      if (!locked) {
        items.push(null);
        items.push(["Trazer para frente", "Ctrl+]", () => this.reorder(1)]);
        items.push(["Enviar para trás", "Ctrl+[", () => this.reorder(-1)]);
        items.push(null);
        if (this.selection.size > 1) items.push(["Agrupar", "Ctrl+G", () => this.group()]);
        if (this.selectedObjects().some((o) => o.props.groupId)) items.push(["Desagrupar", "Ctrl+Shift+G", () => this.ungroup()]);
      }
      items.push([locked ? "Desbloquear" : "Bloquear", "Ctrl+Shift+L", () => this.toggleLock()]);
      if (!locked) { items.push(null); items.push(["Excluir", "Delete", () => this.deleteSelection()]); }
    } else {
      if (this.canEdit && clipboard) items.push(["Colar", "Ctrl+V", () => this.paste()]);
      items.push(["Selecionar tudo", "Ctrl+A", () => this.selectAll()]);
      items.push(["Enquadrar tudo", "Shift+1", () => this.fitAll()]);
    }
    items.forEach((item) => {
      if (!item) { menu.appendChild(this.make("span", "wb-menu-sep")); return; }
      const [label, shortcut, action] = item;
      const button = this.make("button", "wb-menu-item");
      button.type = "button";
      button.append(this.make("span", "", label), this.make("kbd", "", shortcut));
      button.addEventListener("click", () => { menu.hidden = true; action(); });
      menu.appendChild(button);
    });
    menu.hidden = false;
    const rootRect = this.root.getBoundingClientRect();
    const mr = menu.getBoundingClientRect();
    menu.style.left = clamp(e.clientX - rootRect.left, 8, rootRect.width - mr.width - 8) + "px";
    menu.style.top = clamp(e.clientY - rootRect.top, 8, rootRect.height - mr.height - 8) + "px";
  };

  // Keyboard

  Board.prototype.onKeyDown = function (e) {
    const target = e.target;
    const typing = target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
    if (!this.root.isConnected) return;
    if (this.editing) {
      if (e.key === "Escape") { e.preventDefault(); this.finishEditing(); }
      return;
    }
    if (typing) return;
    if (document.activeElement && document.activeElement !== document.body && !this.root.contains(document.activeElement)) return;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();

    if (e.code === "Space") {
      e.preventDefault();
      if (!this.spaceDown) { this.spaceDown = true; this.updateTools(); }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      this.contextMenu.hidden = true;
      this.zoomMenu.hidden = true;
      this.popover.hidden = true;
      this.moreMenu.hidden = true;
      if (!this.cancelGesture()) {
        if (this.tool !== "select") this.setTool("select");
        else this.setSelection([]);
      }
      return;
    }
    if (mod && (key === "=" || key === "+")) { e.preventDefault(); this.stepZoom(1); return; }
    if (mod && (key === "-" || key === "_")) { e.preventDefault(); this.stepZoom(-1); return; }
    if (e.shiftKey && !mod && e.code === "Digit0") { e.preventDefault(); this.zoomTo(1); return; }
    if (e.shiftKey && !mod && e.code === "Digit1") { e.preventDefault(); this.fitAll(); return; }
    if (e.shiftKey && !mod && e.code === "Digit2") { e.preventDefault(); this.fitSelection(); return; }
    if (mod && key === "a") { e.preventDefault(); this.selectAll(); return; }

    if (!this.canEdit) return;
    if (this.gesture && this.gesture.type !== "pan") return;
    if (mod && key === "z" && !e.shiftKey) { e.preventDefault(); this.undo(); return; }
    if ((mod && key === "z" && e.shiftKey) || (mod && key === "y")) { e.preventDefault(); this.redo(); return; }
    if (mod && key === "d") { e.preventDefault(); this.duplicate(); return; }
    if (mod && key === "c") { e.preventDefault(); this.copy(); return; }
    if (mod && key === "x") { e.preventDefault(); this.cut(); return; }
    if (mod && key === "v") {
      this.pasteHandled = false;
      window.setTimeout(() => { if (!this.pasteHandled) this.paste(); }, 120);
      return;
    }
    if (mod && (e.key === "]" || e.code === "BracketRight")) { e.preventDefault(); this.reorder(1); return; }
    if (mod && (e.key === "[" || e.code === "BracketLeft")) { e.preventDefault(); this.reorder(-1); return; }
    if (mod && key === "g" && e.shiftKey) { e.preventDefault(); this.ungroup(); return; }
    if (mod && key === "g") { e.preventDefault(); this.group(); return; }
    if (mod && key === "l" && e.shiftKey) { e.preventDefault(); this.toggleLock(); return; }
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); this.deleteSelection(); return; }
    if (e.key.startsWith("Arrow") && this.selection.size) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
      const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
      this.nudge(dx, dy);
      return;
    }
    if (mod || e.altKey) return;
    if (key === "i") { e.preventDefault(); this.pickImage(); return; }
    const toolByKey = { v: "select", h: "hand", p: "pen", n: "sticky", r: "shape", c: "connector", t: "text", s: "stamp", m: "highlight", e: "eraser" };
    if (toolByKey[key]) { e.preventDefault(); this.setTool(toolByKey[key]); }
  };

  Board.prototype.onKeyUp = function (e) {
    if (e.code === "Space" && this.spaceDown) {
      this.spaceDown = false;
      this.updateTools();
    }
  };

  window.CorexScreens.whiteboard = Object.freeze({ render });
})();

export class LoadingOverlay {
  private host: HTMLElement;
  private root: HTMLDivElement;
  private labelEl: HTMLDivElement;

  constructor(host: HTMLElement) {
    this.host = host;

    // ensure parent can position absolute children
    if (this.host !== document.body) {
      const cs = window.getComputedStyle(this.host);
      if (cs.position === "static") this.host.style.position = "relative";
    }

    this.ensureGlobalStyle();

    this.root = document.createElement("div");
    this.root.style.position =
      this.host === document.body ? "fixed" : "absolute";
    this.root.style.inset = "0";
    this.root.style.zIndex = "10000";
    this.root.style.display = "grid";
    this.root.style.placeItems = "center";
    this.root.style.background = "rgba(0,0,0,0.55)";
    this.root.style.backdropFilter = "blur(6px)";

    const card = document.createElement("div");
    card.style.display = "flex";
    card.style.flexDirection = "column";
    card.style.alignItems = "center";
    card.style.gap = "14px";
    card.style.padding = "18px 18px";
    card.style.borderRadius = "14px";
    card.style.background = "rgba(0,0,0,0.35)";
    card.style.border = "1px solid rgba(255,255,255,0.12)";

    // Spinner row
    const spinnerRow = document.createElement("div");
    spinnerRow.style.display = "flex";
    spinnerRow.style.flexDirection = "column";
    spinnerRow.style.alignItems = "center";

    const spinner = document.createElement("div");
    spinner.style.width = "44px";
    spinner.style.height = "44px";
    spinner.style.borderRadius = "999px";
    spinner.style.border = "3px solid rgba(255,255,255,0.25)";
    spinner.style.borderTopColor = "white";
    spinner.style.animation = "loadingOverlaySpin 0.9s linear infinite";

    this.labelEl = document.createElement("div");
    this.labelEl.textContent = "Loading…";
    this.labelEl.style.marginTop = "10px";
    this.labelEl.style.color = "white";
    this.labelEl.style.fontFamily =
      "system-ui, -apple-system, Segoe UI, Roboto, Arial";
    this.labelEl.style.fontSize = "13px";
    this.labelEl.style.opacity = "0.92";
    this.labelEl.style.textAlign = "center";

    spinnerRow.appendChild(spinner);
    spinnerRow.appendChild(this.labelEl);

    // Instructions
    const instructions = document.createElement("div");
    instructions.style.display = "flex";
    instructions.style.gap = "18px";
    instructions.style.alignItems = "center";
    instructions.style.marginTop = "6px";

    const desktopWrap = document.createElement("div");
    desktopWrap.className = "loading-overlay__desktop";
    desktopWrap.style.display = "flex";
    desktopWrap.style.gap = "18px";
    desktopWrap.style.alignItems = "center";

    const keys = document.createElement("div");
    keys.style.display = "grid";
    keys.style.gridTemplateColumns = "repeat(3, 34px)";
    keys.style.gridTemplateRows = "repeat(2, 34px)";
    keys.style.gap = "6px";
    keys.style.placeItems = "center";

    const keyCell = (
      gridCol: string,
      gridRow: string,
      primary: string,
      alt: string,
    ) => {
      const k = document.createElement("div");
      k.style.gridColumn = gridCol;
      k.style.gridRow = gridRow;
      k.style.width = "34px";
      k.style.height = "34px";
      k.style.borderRadius = "8px";
      k.style.display = "grid";
      k.style.placeItems = "center";
      k.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, Arial";
      k.style.fontWeight = "700";
      k.style.fontSize = "12px";
      k.style.color = "rgba(255,255,255,0.95)";
      k.style.background = "rgba(255,255,255,0.06)";
      k.style.border = "1px solid rgba(255,255,255,0.18)";
      k.style.userSelect = "none";

      // animated label (W <-> ▲ etc.)
      const span = document.createElement("span");
      span.textContent = primary;

      let t = 0;
      const tick = () => {
        t = (t + 1) % 2;
        span.textContent = t === 0 ? primary : alt;
      };

      // switch every 2s (same idea as your Vue keyframes, but JS)
      const id = window.setInterval(tick, 2000);
      (k as unknown as { __intervalId?: number }).__intervalId = id;

      k.appendChild(span);
      return k;
    };

    keys.appendChild(keyCell("2", "1", "W", "▲"));
    keys.appendChild(keyCell("1", "2", "A", "◀"));
    keys.appendChild(keyCell("2", "2", "S", "▼"));
    keys.appendChild(keyCell("3", "2", "D", "▶"));

    const iconRow = document.createElement("div");
    iconRow.style.display = "flex";
    iconRow.style.gap = "8px";
    iconRow.style.alignItems = "center";
    iconRow.style.justifyContent = "center";

    const iconTile = (iconClass: string) => {
      const k = document.createElement("div");
      k.style.width = "34px";
      k.style.height = "34px";
      k.style.borderRadius = "8px";
      k.style.display = "grid";
      k.style.placeItems = "center";
      k.style.background = "rgba(255,255,255,0.06)";
      k.style.border = "1px solid rgba(255,255,255,0.18)";
      k.style.userSelect = "none";

      const i = document.createElement("i");
      i.className = iconClass;
      i.style.fontSize = "13px";
      i.style.color = "rgba(255,255,255,0.95)";
      k.appendChild(i);
      return k;
    };

    iconRow.appendChild(iconTile("fa-solid fa-computer-mouse"));
    iconRow.appendChild(iconTile("fa-solid fa-hand-pointer"));

    const helpKeyboard = document.createElement("div");
    helpKeyboard.style.display = "flex";
    helpKeyboard.style.flexDirection = "column";
    helpKeyboard.style.gap = "6px";
    helpKeyboard.style.alignItems = "center";
    helpKeyboard.style.color = "rgba(255,255,255,0.9)";
    helpKeyboard.style.fontFamily =
      "system-ui, -apple-system, Segoe UI, Roboto, Arial";
    helpKeyboard.style.fontSize = "12px";
    helpKeyboard.style.lineHeight = "1.2";
    helpKeyboard.style.userSelect = "none";
    helpKeyboard.style.textAlign = "center";

    const helpMouse = document.createElement("div");
    helpMouse.style.display = "flex";
    helpMouse.style.flexDirection = "column";
    helpMouse.style.gap = "6px";
    helpMouse.style.alignItems = "center";
    helpMouse.style.color = "rgba(255,255,255,0.9)";
    helpMouse.style.fontFamily =
      "system-ui, -apple-system, Segoe UI, Roboto, Arial";
    helpMouse.style.fontSize = "12px";
    helpMouse.style.lineHeight = "1.2";
    helpMouse.style.userSelect = "none";
    helpMouse.style.textAlign = "center";

    const line1 = document.createElement("div");
    line1.textContent = "Move: WASD or Arrow keys";
    const line2 = document.createElement("div");
    line2.textContent = "Drag horizontal: rotate view";
    const line3 = document.createElement("div");
    line3.textContent = "Drag vertical: look up/down";
    const line4 = document.createElement("div");
    line4.textContent = "Point: move to location";
    const line5 = document.createElement("div");
    line5.textContent = "Pinch in: move forward";
    const line6 = document.createElement("div");
    line6.textContent = "Pinch out: move backward";

    helpKeyboard.appendChild(line1);
    desktopWrap.style.flexDirection = "column";
    desktopWrap.style.alignItems = "center";
    desktopWrap.appendChild(keys);
    helpMouse.appendChild(line2);
    helpMouse.appendChild(line3);
    helpMouse.appendChild(line4);
    helpMouse.appendChild(line5);
    helpMouse.appendChild(line6);

    desktopWrap.appendChild(helpKeyboard);
    desktopWrap.appendChild(iconRow);
    desktopWrap.appendChild(helpMouse);

    const touchHelp = document.createElement("div");
    touchHelp.className = "loading-overlay__touch";
    touchHelp.style.display = "flex";
    touchHelp.style.flexDirection = "column";
    touchHelp.style.gap = "6px";
    touchHelp.style.color = "rgba(255,255,255,0.9)";
    touchHelp.style.fontFamily =
      "system-ui, -apple-system, Segoe UI, Roboto, Arial";
    touchHelp.style.fontSize = "12px";
    touchHelp.style.lineHeight = "1.2";
    touchHelp.style.userSelect = "none";
    touchHelp.style.textAlign = "center";

    const t1 = document.createElement("div");
    t1.textContent = "Drag horizontal: rotate view";
    const t2 = document.createElement("div");
    t2.textContent = "Drag vertical: look up/down";
    const t3 = document.createElement("div");
    t3.textContent = "Point: move to location";
    const t4 = document.createElement("div");
    t4.textContent = "Pinch in: move forward";
    const t5 = document.createElement("div");
    t5.textContent = "Pinch out: move backward";

    touchHelp.appendChild(t1);
    touchHelp.appendChild(t2);
    touchHelp.appendChild(t3);
    touchHelp.appendChild(t4);
    touchHelp.appendChild(t5);

    instructions.appendChild(desktopWrap);
    instructions.appendChild(touchHelp);

    card.appendChild(spinnerRow);
    card.appendChild(instructions);
    this.root.appendChild(card);

    const applyInputMode = () => {
      const isTouch =
        (window.matchMedia &&
          (window.matchMedia("(pointer: coarse)").matches ||
            window.matchMedia("(any-pointer: coarse)").matches ||
            window.matchMedia("(hover: none)").matches)) ||
        navigator.maxTouchPoints > 0;

      desktopWrap.style.display = isTouch ? "none" : "flex";
      touchHelp.style.display = isTouch ? "flex" : "none";
    };

    applyInputMode();
    if (window.matchMedia) {
      const mq = window.matchMedia("(pointer: coarse)");
      const mqAny = window.matchMedia("(any-pointer: coarse)");
      const mqHover = window.matchMedia("(hover: none)");
      const handler = () => applyInputMode();
      mq.addEventListener?.("change", handler);
      mqAny.addEventListener?.("change", handler);
      mqHover.addEventListener?.("change", handler);
    }
  }

  show(): void {
    if (!this.root.isConnected) this.host.appendChild(this.root);
  }

  setText(text: string): void {
    this.labelEl.textContent = text;
  }

  hide(): void {
    this.root.remove();
  }

  dispose(): void {
    // cleanup intervals in key cells
    const cells = this.root.querySelectorAll("div");
    for (const el of Array.from(cells)) {
      const id = (el as unknown as { __intervalId?: number }).__intervalId;
      if (typeof id === "number") window.clearInterval(id);
    }
    this.hide();
  }

  private ensureGlobalStyle(): void {
    const id = "loading-overlay-style";
    if (document.getElementById(id)) return;
    const st = document.createElement("style");
    st.id = id;
    st.textContent = `
      @keyframes loadingOverlaySpin { to { transform: rotate(360deg); } }
      .loading-overlay__touch { display: none; }
    `;
    document.head.appendChild(st);
  }
}

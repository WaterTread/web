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

    const help = document.createElement("div");
    help.style.display = "flex";
    help.style.flexDirection = "column";
    help.style.gap = "6px";
    help.style.color = "rgba(255,255,255,0.9)";
    help.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, Arial";
    help.style.fontSize = "12px";
    help.style.lineHeight = "1.2";
    help.style.userSelect = "none";

    const line1 = document.createElement("div");
    line1.textContent = "Move: WASD or Arrow keys";
    const line2 = document.createElement("div");
    line2.textContent = "Look: mouse / touchpad";
    const line3 = document.createElement("div");
    line3.textContent = "Jump: Space";

    help.appendChild(line1);
    help.appendChild(line2);
    help.appendChild(line3);

    instructions.appendChild(keys);
    instructions.appendChild(help);

    card.appendChild(spinnerRow);
    card.appendChild(instructions);
    this.root.appendChild(card);
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
    `;
    document.head.appendChild(st);
  }
}

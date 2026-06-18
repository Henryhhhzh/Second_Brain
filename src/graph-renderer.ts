import { App } from "obsidian";
import type { GraphData, GraphNode } from "./types";

const PROVIDER_COLORS: Record<string, string> = {
  chatgpt: "#74d7a4",
  openai: "#74d7a4",
  claude: "#e6a57e",
  anthropic: "#e6a57e",
  gemini: "#78a8ff",
  copilot: "#a58cff",
  perplexity: "#49c7c4",
  grok: "#d9dee8",
  note: "#8d9bff"
};

interface PointerState {
  mode: "none" | "pan" | "node";
  node: GraphNode | null;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  moved: boolean;
}

export class NeuralGraphRenderer {
  private canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;
  private tooltip: HTMLElement;
  private data: GraphData = { nodes: [], edges: [] };
  private nodesById = new Map<string, GraphNode>();
  private query = "";
  private width = 1;
  private height = 1;
  private scale = 1;
  private offsetX = 0;
  private offsetY = 0;
  private animationFrame = 0;
  private simulationHeat = 0;
  private hovered: GraphNode | null = null;
  private pointer: PointerState = {
    mode: "none",
    node: null,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    moved: false
  };
  private resizeObserver: ResizeObserver;

  constructor(private app: App, private host: HTMLElement) {
    host.addClass("neural-graph-host");
    this.canvas = host.createEl("canvas", {
      cls: "neural-graph-canvas",
      attr: { "aria-label": "Interactive neural knowledge graph" }
    });
    const context = this.canvas.getContext("2d");
    if (!context) throw new Error("Canvas rendering is unavailable.");
    this.context = context;
    this.tooltip = host.createDiv({ cls: "neural-graph-tooltip" });
    this.tooltip.hide();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("pointerleave", this.onPointerLeave);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.resize();
    this.animate();
  }

  setData(data: GraphData): void {
    this.data = data;
    this.nodesById = new Map(data.nodes.map((node) => [node.id, node]));
    this.simulationHeat = 1;
    this.resetView();
  }

  setQuery(query: string): void {
    this.query = query.trim().toLowerCase();
  }

  resetView(): void {
    this.scale = 1;
    this.offsetX = this.width / 2;
    this.offsetY = this.height / 2;
  }

  reheat(): void {
    this.simulationHeat = 0.8;
  }

  destroy(): void {
    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointerleave", this.onPointerLeave);
    this.canvas.removeEventListener("wheel", this.onWheel);
    this.host.empty();
  }

  private resize(): void {
    const rect = this.host.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.width * ratio);
    this.canvas.height = Math.round(this.height * ratio);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (!this.offsetX && !this.offsetY) this.resetView();
  }

  private animate = (): void => {
    if (this.simulationHeat > 0.002) this.stepSimulation();
    this.draw();
    this.animationFrame = requestAnimationFrame(this.animate);
  };

  private stepSimulation(): void {
    const heat = this.simulationHeat;
    const nodes = this.data.nodes;
    for (const edge of this.data.edges) {
      const source = this.nodesById.get(edge.source);
      const target = this.nodesById.get(edge.target);
      if (!source || !target) continue;
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const desired = 75 + Math.min(50, 25 / Math.max(1, edge.weight));
      const force = (distance - desired) * 0.0018 * heat;
      const fx = (dx / distance) * force;
      const fy = (dy / distance) * force;
      if (!source.fixed) {
        source.vx += fx;
        source.vy += fy;
      }
      if (!target.fixed) {
        target.vx -= fx;
        target.vy -= fy;
      }
    }

    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      if (node.fixed) continue;
      node.vx += -node.x * 0.00018 * heat;
      node.vy += -node.y * 0.00018 * heat;

      const comparisons = Math.min(nodes.length - 1, 12);
      for (let sample = 1; sample <= comparisons; sample += 1) {
        const other = nodes[(index + sample * 47) % nodes.length];
        if (other === node) continue;
        const dx = node.x - other.x;
        const dy = node.y - other.y;
        const distanceSquared = Math.max(100, dx * dx + dy * dy);
        const repulsion = (22 * heat) / distanceSquared;
        node.vx += dx * repulsion;
        node.vy += dy * repulsion;
      }

      node.vx *= 0.88;
      node.vy *= 0.88;
      node.x += node.vx;
      node.y += node.vy;
    }
    this.simulationHeat *= 0.985;
  }

  private draw(): void {
    const ctx = this.context;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.save();
    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.scale, this.scale);

    for (const edge of this.data.edges) {
      const source = this.nodesById.get(edge.source);
      const target = this.nodesById.get(edge.target);
      if (!source || !target) continue;
      const sourceVisible = this.matches(source);
      const targetVisible = this.matches(target);
      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      ctx.lineTo(target.x, target.y);
      ctx.strokeStyle =
        this.query && (!sourceVisible || !targetVisible)
          ? "rgba(120, 135, 170, 0.035)"
          : `rgba(118, 140, 255, ${Math.min(0.42, 0.1 + edge.weight * 0.045)})`;
      ctx.lineWidth = Math.min(2.2, 0.55 + edge.weight * 0.15) / this.scale;
      ctx.stroke();
    }

    for (const node of this.data.nodes) this.drawNode(node);
    ctx.restore();
  }

  private drawNode(node: GraphNode): void {
    const ctx = this.context;
    const color = PROVIDER_COLORS[node.provider] ?? PROVIDER_COLORS.note;
    const matched = this.matches(node);
    const opacity = this.query && !matched ? 0.12 : 1;
    const isHovered = this.hovered === node;
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.shadowColor = color;
    ctx.shadowBlur = isHovered ? 24 : 11;
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.radius + (isHovered ? 2.5 : 0), 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(node.x, node.y, Math.max(1.5, node.radius * 0.38), 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.78)";
    ctx.fill();

    if ((isHovered || this.scale > 1.35) && opacity > 0.2) {
      ctx.font = `${Math.max(10, 11 / this.scale)}px var(--font-interface)`;
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(240,244,255,0.92)";
      ctx.fillText(node.label.slice(0, 42), node.x, node.y + node.radius + 16 / this.scale);
    }
    ctx.restore();
  }

  private matches(node: GraphNode): boolean {
    if (!this.query) return true;
    return (
      node.label.toLowerCase().includes(this.query) ||
      node.provider.includes(this.query) ||
      node.tags.some((tag) => tag.toLowerCase().includes(this.query))
    );
  }

  private nodeAt(clientX: number, clientY: number): GraphNode | null {
    const rect = this.canvas.getBoundingClientRect();
    const x = (clientX - rect.left - this.offsetX) / this.scale;
    const y = (clientY - rect.top - this.offsetY) / this.scale;
    let selected: GraphNode | null = null;
    let closest = Number.POSITIVE_INFINITY;
    for (const node of this.data.nodes) {
      const distance = Math.hypot(node.x - x, node.y - y);
      if (distance <= node.radius + 7 / this.scale && distance < closest) {
        selected = node;
        closest = distance;
      }
    }
    return selected;
  }

  private showTooltip(node: GraphNode, clientX: number, clientY: number): void {
    const rect = this.host.getBoundingClientRect();
    this.tooltip.empty();
    this.tooltip.createDiv({ cls: "neural-tooltip-title", text: node.label });
    this.tooltip.createDiv({
      cls: "neural-tooltip-meta",
      text: `${node.provider} · ${node.degree} connection${node.degree === 1 ? "" : "s"}`
    });
    this.tooltip.style.left = `${clientX - rect.left + 14}px`;
    this.tooltip.style.top = `${clientY - rect.top + 14}px`;
    this.tooltip.show();
  }

  private onPointerDown = (event: PointerEvent): void => {
    this.canvas.setPointerCapture(event.pointerId);
    const node = this.nodeAt(event.clientX, event.clientY);
    this.pointer = {
      mode: node ? "node" : "pan",
      node,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      moved: false
    };
    if (node) node.fixed = true;
  };

  private onPointerMove = (event: PointerEvent): void => {
    const dx = event.clientX - this.pointer.lastX;
    const dy = event.clientY - this.pointer.lastY;
    if (Math.hypot(event.clientX - this.pointer.startX, event.clientY - this.pointer.startY) > 4) {
      this.pointer.moved = true;
    }
    if (this.pointer.mode === "pan") {
      this.offsetX += dx;
      this.offsetY += dy;
    } else if (this.pointer.mode === "node" && this.pointer.node) {
      this.pointer.node.x += dx / this.scale;
      this.pointer.node.y += dy / this.scale;
      this.pointer.node.vx = 0;
      this.pointer.node.vy = 0;
    } else {
      const hovered = this.nodeAt(event.clientX, event.clientY);
      this.hovered = hovered;
      this.canvas.style.cursor = hovered ? "pointer" : "grab";
      if (hovered) this.showTooltip(hovered, event.clientX, event.clientY);
      else this.tooltip.hide();
    }
    this.pointer.lastX = event.clientX;
    this.pointer.lastY = event.clientY;
  };

  private onPointerUp = (event: PointerEvent): void => {
    if (this.pointer.node) {
      this.pointer.node.fixed = false;
      if (!this.pointer.moved) {
        void this.app.workspace.openLinkText(this.pointer.node.path, "", false);
      }
    }
    this.pointer.mode = "none";
    this.pointer.node = null;
    this.simulationHeat = Math.max(this.simulationHeat, 0.15);
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
  };

  private onPointerLeave = (): void => {
    this.hovered = null;
    this.tooltip.hide();
  };

  private onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const worldX = (pointerX - this.offsetX) / this.scale;
    const worldY = (pointerY - this.offsetY) / this.scale;
    const nextScale = Math.min(4, Math.max(0.25, this.scale * Math.exp(-event.deltaY * 0.001)));
    this.offsetX = pointerX - worldX * nextScale;
    this.offsetY = pointerY - worldY * nextScale;
    this.scale = nextScale;
  };
}

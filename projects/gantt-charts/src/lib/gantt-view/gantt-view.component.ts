// gantt-chart.component.ts
import { AfterViewInit, Component, ElementRef, HostListener, Input, OnDestroy, ViewChild } from '@angular/core';

// Core Enums and Interfaces
export enum GanttRelationshipType {
  FS = 'Finish to Start',
  SS = 'Start to Start',
  FF = 'Finish to Finish',
  SF = 'Start to Finish'
}

export interface GanttTask {
  id: string;
  name: string;
  start: Date;
  end: Date;
  progress?: number;
  color?: string;
  dependencies?: string[];
  [key: string]: any; // Allow custom properties
}

export interface GanttRelationship {
  id: string;
  sourceId: string;
  targetId: string;
  type: GanttRelationshipType;
  lag?: number;
}

interface RelationshipLine {
  id: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  type: GanttRelationshipType;
  sourceTask: GanttTask;
  targetTask: GanttTask;
  lag?: number;
  path: Path2D;
}

interface UnitWidthConfig {
  min: number;
  max: number;
  optimal: number;
}

interface ThemeColors {
  backgroundColor: string;
  textColor: string;
  gridColor: string;
  barColor: string;
  barProgressColor: string;
  relationshipColors: Record<GanttRelationshipType, string>;
}

@Component({
  selector: 'lib-gantt-view',
  templateUrl: './gantt-view.component.html',
  styleUrls: ['./gantt-view.component.css']
})
export class GanttViewComponent implements AfterViewInit, OnDestroy {
  // Input Properties
  @Input() tasks: GanttTask[] = [];
  @Input() relationships: GanttRelationship[] = [];
  @Input() viewMode: 'day' | 'week' | 'month' | 'year' = 'day';
  @Input() theme: 'light' | 'dark' = 'light';
  @Input() rowHeight: number = 40;
  @Input() barHeight: number = 20;
  @Input() showTooltips: boolean = true;
  @Input() showRelationships: boolean = true;

  // View Children
  @ViewChild('ganttCanvas', { static: false }) canvasRef!: ElementRef<HTMLCanvasElement>;

  // Private Properties
  private ctx: CanvasRenderingContext2D | null = null;
  private headerHeight = 100;
  private startDate!: Date;
  private endDate!: Date;
  private relationshipLines: RelationshipLine[] = [];
  private hoveredRelationship: RelationshipLine | null = null;
  private relationshipTooltip: HTMLDivElement | null = null;
  private tooltip: HTMLDivElement | null = null;
  private hoveredTask: GanttTask | null = null;

  // Constants
  private readonly RELATIONSHIP_WIDTH = 2;
  private readonly UNIT_WIDTHS: Record<string, UnitWidthConfig> = {
    day: { min: 20, max: 40, optimal: 30 },
    week: { min: 60, max: 120, optimal: 80 },
    month: { min: 80, max: 150, optimal: 100 },
    year: { min: 150, max: 300, optimal: 200 }
  };

  // Theme configurations
  private readonly THEMES: Record<string, ThemeColors> = {
    light: {
      backgroundColor: '#ffffff',
      textColor: '#333333',
      gridColor: '#e0e0e0',
      barColor: '#42a5f5',
      barProgressColor: '#1976d2',
      relationshipColors: {
        [GanttRelationshipType.FS]: '#2196F3',
        [GanttRelationshipType.SS]: '#4CAF50',
        [GanttRelationshipType.FF]: '#FF9800',
        [GanttRelationshipType.SF]: '#9C27B0'
      }
    },
    dark: {
      backgroundColor: '#2D3D43',
      textColor: '#ffffff',
      gridColor: '#404040',
      barColor: '#64b5f6',
      barProgressColor: '#42a5f5',
      relationshipColors: {
        [GanttRelationshipType.FS]: '#64B5F6',
        [GanttRelationshipType.SS]: '#81C784',
        [GanttRelationshipType.FF]: '#FFB74D',
        [GanttRelationshipType.SF]: '#BA68C8'
      }
    }
  };

  // Lifecycle Hooks
  ngAfterViewInit(): void {
    this.initializeDateRange();
    this.setupCanvas();
    this.drawChart();
  }

  ngOnDestroy(): void {
    this.removeTooltips();
  }

  // Host Listeners
  @HostListener('window:resize')
  onResize() {
    this.setupCanvas();
    this.drawChart();
  }

  @HostListener('mousemove', ['$event'])
  onMouseMove(event: MouseEvent): void {
    if (!this.canvasRef) return;

    const { x, y } = this.getMousePosition(event);
    this.handleRelationshipHover(event, x, y);
    this.handleTaskHover(event, x, y);
  }

  @HostListener('mouseleave')
  onMouseLeave(): void {
    this.hideTooltip();
    this.hideRelationshipTooltip();
    if (this.canvasRef) {
      this.canvasRef.nativeElement.style.cursor = 'default';
    }
  }

  // Public Methods
  public refresh(): void {
    this.initializeDateRange();
    this.setupCanvas();
    this.drawChart();
  }

  // Private Methods
  private initializeDateRange(): void {
    if (this.tasks.length === 0) {
      // Default to current year if no tasks
      const now = new Date();
      this.startDate = new Date(now.getFullYear(), 0, 1);
      this.endDate = new Date(now.getFullYear() + 1, 0, 1);
      return;
    }

    // Calculate date range from tasks
    const starts = this.tasks.map(t => t.start.getTime());
    const ends = this.tasks.map(t => t.end.getTime());
    this.startDate = new Date(Math.min(...starts));
    this.endDate = new Date(Math.max(...ends));

    // Add padding to date range
    const paddingDays = this.getTotalDays() * 0.05;
    this.startDate.setDate(this.startDate.getDate() - paddingDays);
    this.endDate.setDate(this.endDate.getDate() + paddingDays);
  }

  private setupCanvas(): void {
    if (!this.canvasRef) return;

    const canvas = this.canvasRef.nativeElement;
    const container = canvas.parentElement;

    if (!container) return;

    canvas.width = container.clientWidth;
    canvas.height = this.calculateCanvasHeight();
    this.ctx = canvas.getContext('2d');
  }

  private drawChart(): void {
    if (!this.ctx) return;

    const canvas = this.canvasRef.nativeElement;
    this.ctx.clearRect(0, 0, canvas.width, canvas.height);

    this.drawHeader();
    this.drawGrid();
    this.drawTasks();

    if (this.showRelationships) {
      this.drawRelationships();
    }
  }

  private drawHeader(): void {
    if (!this.ctx) return;

    const ctx = this.ctx;
    const canvas = this.canvasRef.nativeElement;
    const theme = this.THEMES[this.theme];

    // Draw header background
    ctx.fillStyle = theme.backgroundColor;
    ctx.fillRect(0, 0, canvas.width, this.headerHeight);

    // Draw header content based on view mode
    ctx.fillStyle = theme.textColor;
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const unitWidth = this.getOptimalUnitWidth();
    let x = 0;
    let current = new Date(this.startDate);

    while (current <= this.endDate) {
      const label = this.getDateLabel(current);
      const labelX = x + unitWidth / 2;

      ctx.fillText(label, labelX, this.headerHeight / 2);

      // Draw vertical line
      ctx.strokeStyle = theme.gridColor;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.headerHeight);
      ctx.stroke();

      // Move to next unit
      x += unitWidth;
      current = this.getNextDate(current);
    }

    // Draw final line
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, this.headerHeight);
    ctx.stroke();

    // Draw bottom border
    ctx.beginPath();
    ctx.moveTo(0, this.headerHeight);
    ctx.lineTo(x, this.headerHeight);
    ctx.stroke();
  }

  private drawGrid(): void {
    if (!this.ctx) return;

    const ctx = this.ctx;
    const canvas = this.canvasRef.nativeElement;
    const theme = this.THEMES[this.theme];
    const unitWidth = this.getOptimalUnitWidth();
    const gridStartY = this.headerHeight;
    const gridHeight = canvas.height - this.headerHeight;
    const totalWidth = this.calculateCanvasWidth();

    // Draw vertical grid lines
    ctx.strokeStyle = theme.gridColor;
    ctx.lineWidth = 1;

    let x = 0;
    while (x <= totalWidth) {
      ctx.beginPath();
      ctx.moveTo(x, gridStartY);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
      x += unitWidth;
    }

    // Draw horizontal grid lines
    for (let i = 0; i <= this.tasks.length; i++) {
      const y = gridStartY + (i * this.rowHeight);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(totalWidth, y);
      ctx.stroke();
    }

    // Draw today line
    const today = new Date();
    if (today >= this.startDate && today <= this.endDate) {
      const todayX = this.getXPositionForDate(today);
      ctx.strokeStyle = theme.relationshipColors[GanttRelationshipType.FS];
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(todayX, gridStartY);
      ctx.lineTo(todayX, canvas.height);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw today label
      ctx.fillStyle = theme.textColor;
      ctx.font = 'bold 10px Arial';
      ctx.fillText('TODAY', todayX, gridStartY + 20);
    }
  }

  private drawTasks(): void {
    if (!this.ctx || this.tasks.length === 0) return;

    const ctx = this.ctx;
    const theme = this.THEMES[this.theme];
    const startY = this.headerHeight;

    this.tasks.forEach((task, index) => {
      const y = startY + (index * this.rowHeight) + (this.rowHeight - this.barHeight) / 2;

      // Calculate positions
      const startX = this.getXPositionForDate(task.start);
      const endX = this.getXPositionForDate(task.end);
      const width = Math.max(endX - startX, 2);

      // Draw task bar background
      ctx.fillStyle = task.color || theme.barColor;
      ctx.fillRect(startX, y, width, this.barHeight);

      // Draw progress
      if (task.progress && task.progress > 0) {
        const progressWidth = (width * task.progress) / 100;
        ctx.fillStyle = theme.barProgressColor;
        ctx.fillRect(startX, y, progressWidth, this.barHeight);

        // Draw progress text
        if (width > 40) {
          ctx.fillStyle = theme.textColor;
          ctx.font = '10px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(
            `${Math.round(task.progress)}%`,
            startX + width / 2,
            y + this.barHeight / 2
          );
        }
      }

      // Draw task name
      if (width > 60) {
        ctx.fillStyle = theme.textColor;
        ctx.font = '10px Arial';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const name = task.name.length > 15 ?
          task.name.substring(0, 15) + '...' : task.name;
        ctx.fillText(name, startX + 5, y + this.barHeight / 2);
      }
    });
  }

  private drawRelationships(): void {
    if (!this.ctx || this.relationships.length === 0) return;

    // Calculate relationship lines
    this.relationshipLines = this.calculateRelationshipLines();

    // Draw relationships
    this.relationshipLines.forEach(line => {
      this.drawRelationshipLine(line);
    });
  }

  // Helper Methods
  private getTotalDays(): number {
    return Math.ceil((this.endDate.getTime() - this.startDate.getTime()) / (1000 * 60 * 60 * 24));
  }

  private getOptimalUnitWidth(): number {
    const config = this.UNIT_WIDTHS[this.viewMode];
    const totalUnits = this.getTotalUnits();
    return Math.max(config.min, Math.min(config.max,
      this.calculateCanvasWidth() / totalUnits));
  }

  private getTotalUnits(): number {
    switch (this.viewMode) {
      case 'day': return this.getTotalDays();
      case 'week': return Math.ceil(this.getTotalDays() / 7);
      case 'month':
        return (this.endDate.getFullYear() - this.startDate.getFullYear()) * 12 +
          (this.endDate.getMonth() - this.startDate.getMonth()) + 1;
      case 'year':
        return this.endDate.getFullYear() - this.startDate.getFullYear() + 1;
      default: return this.getTotalDays();
    }
  }

  private calculateCanvasWidth(): number {
    return this.canvasRef?.nativeElement.width || 800;
  }

  private calculateCanvasHeight(): number {
    return this.headerHeight + (this.tasks.length * this.rowHeight) + 50;
  }

  private getXPositionForDate(date: Date): number {
    const daysDiff = (date.getTime() - this.startDate.getTime()) / (1000 * 60 * 60 * 24);
    const unitWidth = this.getOptimalUnitWidth();

    switch (this.viewMode) {
      case 'day': return daysDiff * unitWidth;
      case 'week': return (daysDiff / 7) * unitWidth;
      case 'month':
        const monthsDiff = (date.getFullYear() - this.startDate.getFullYear()) * 12 +
          (date.getMonth() - this.startDate.getMonth());
        return monthsDiff * unitWidth;
      case 'year':
        return (date.getFullYear() - this.startDate.getFullYear()) * unitWidth;
      default: return daysDiff * unitWidth;
    }
  }

  private getDateLabel(date: Date): string {
    switch (this.viewMode) {
      case 'day': return date.getDate().toString();
      case 'week':
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        return `${weekStart.getDate()}-${weekStart.getDate() + 6}`;
      case 'month': return date.toLocaleString('default', { month: 'short' });
      case 'year': return date.getFullYear().toString();
      default: return date.toLocaleDateString();
    }
  }

  private getNextDate(current: Date): Date {
    const next = new Date(current);
    switch (this.viewMode) {
      case 'day': next.setDate(next.getDate() + 1); break;
      case 'week': next.setDate(next.getDate() + 7); break;
      case 'month': next.setMonth(next.getMonth() + 1); break;
      case 'year': next.setFullYear(next.getFullYear() + 1); break;
    }
    return next;
  }

  private calculateRelationshipLines(): RelationshipLine[] {
    const lines: RelationshipLine[] = [];
    const taskMap = new Map<string, GanttTask>(this.tasks.map(t => [t.id, t]));
    const startY = this.headerHeight;

    this.relationships.forEach(rel => {
      const sourceTask = taskMap.get(rel.sourceId);
      const targetTask = taskMap.get(rel.targetId);

      if (!sourceTask || !targetTask) return;

      const sourceIndex = this.tasks.findIndex(t => t.id === sourceTask.id);
      const targetIndex = this.tasks.findIndex(t => t.id === targetTask.id);

      if (sourceIndex === -1 || targetIndex === -1) return;

      const fromY = startY + (sourceIndex * this.rowHeight) + (this.rowHeight / 2);
      const toY = startY + (targetIndex * this.rowHeight) + (this.rowHeight / 2);

      let fromX: number, toX: number;

      // Calculate connection points based on relationship type
      switch (rel.type) {
        case GanttRelationshipType.FS: // Finish to Start
          fromX = this.getXPositionForDate(sourceTask.end);
          toX = this.getXPositionForDate(targetTask.start);
          break;
        case GanttRelationshipType.SS: // Start to Start
          fromX = this.getXPositionForDate(sourceTask.start);
          toX = this.getXPositionForDate(targetTask.start);
          break;
        case GanttRelationshipType.FF: // Finish to Finish
          fromX = this.getXPositionForDate(sourceTask.end);
          toX = this.getXPositionForDate(targetTask.end);
          break;
        case GanttRelationshipType.SF: // Start to Finish
          fromX = this.getXPositionForDate(sourceTask.start);
          toX = this.getXPositionForDate(targetTask.end);
          break;
        default:
          return;
      }

      // Apply lag if present
      if (rel.lag) {
        const lagOffset = rel.lag * this.getOptimalUnitWidth();
        toX += lagOffset;
      }

      // Create path
      const path = this.createRelationshipPath(fromX, fromY, toX, toY);

      lines.push({
        id: rel.id,
        fromX,
        fromY,
        toX,
        toY,
        type: rel.type,
        sourceTask,
        targetTask,
        lag: rel.lag,
        path
      });
    });

    return lines;
  }

  private createRelationshipPath(fromX: number, fromY: number, toX: number, toY: number): Path2D {
    const path = new Path2D();
    const midX = (fromX + toX) / 2;

    path.moveTo(fromX, fromY);
    path.bezierCurveTo(midX, fromY, midX, toY, toX, toY);
    return path;
  }

  private drawRelationshipLine(line: RelationshipLine): void {
    if (!this.ctx) return;

    const ctx = this.ctx;
    const theme = this.THEMES[this.theme];
    const isHovered = line === this.hoveredRelationship;
    const color = theme.relationshipColors[line.type];

    ctx.strokeStyle = isHovered ? this.darkenColor(color, 0.3) : color;
    ctx.lineWidth = isHovered ? this.RELATIONSHIP_WIDTH + 1 : this.RELATIONSHIP_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke(line.path);

    // Draw arrowhead
    this.drawArrowhead(line.toX, line.toY, line.fromX < line.toX ? 0 : Math.PI);

    // Draw relationship label
    if (Math.abs(line.toX - line.fromX) > 40) {
      const labelX = (line.fromX + line.toX) / 2;
      const labelY = (line.fromY + line.toY) / 2;

      ctx.fillStyle = theme.backgroundColor;
      ctx.font = 'bold 10px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Draw background
      const text = line.type.substring(0, 2);
      const textWidth = ctx.measureText(text).width + 8;
      ctx.fillRect(labelX - textWidth / 2, labelY - 10, textWidth, 20);

      // Draw text
      ctx.fillStyle = color;
      ctx.fillText(text, labelX, labelY);
    }
  }

  private drawArrowhead(x: number, y: number, angle: number): void {
    if (!this.ctx) return;

    const ctx = this.ctx;
    const size = 8;
    const x1 = x - size * Math.cos(angle - Math.PI / 6);
    const y1 = y - size * Math.sin(angle - Math.PI / 6);
    const x2 = x - size * Math.cos(angle + Math.PI / 6);
    const y2 = y - size * Math.sin(angle + Math.PI / 6);

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x1, y1);
    ctx.moveTo(x, y);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  private darkenColor(color: string, amount: number): string {
    // Simplified color darkening for demo purposes
    return color.replace(/\d+/g, num =>
      Math.max(0, parseInt(num) - Math.floor(255 * amount)).toString()
    );
  }

  private handleRelationshipHover(event: MouseEvent, x: number, y: number): void {
    if (!this.showRelationships || !this.showTooltips) return;

    const hovered = this.relationshipLines.find(line =>
      this.ctx?.isPointInStroke(line.path, x, y)
    );

    if (hovered) {
      this.hoveredRelationship = hovered;
      this.drawChart();
      this.showRelationshipTooltip(event, hovered);
      this.canvasRef.nativeElement.style.cursor = 'pointer';
      return;
    }

    if (this.hoveredRelationship) {
      this.hoveredRelationship = null;
      this.drawChart();
    }
    this.hideRelationshipTooltip();
  }

  private handleTaskHover(event: MouseEvent, x: number, y: number): void {
    if (!this.showTooltips) return;

    const canvas = this.canvasRef.nativeElement;
    const hoveredTask = this.getTaskAtPosition(x, y);

    if (hoveredTask) {
      this.showTooltip(event, hoveredTask);
      canvas.style.cursor = 'pointer';
    } else {
      this.hideTooltip();
      canvas.style.cursor = 'default';
    }
  }

  private getTaskAtPosition(x: number, y: number): GanttTask | null {
    const startY = this.headerHeight;

    if (y < startY) return null;

    const rowIndex = Math.floor((y - startY) / this.rowHeight);
    if (rowIndex >= 0 && rowIndex < this.tasks.length) {
      const task = this.tasks[rowIndex];
      const taskStartX = this.getXPositionForDate(task.start);
      const taskEndX = this.getXPositionForDate(task.end);

      if (x >= taskStartX && x <= taskEndX) {
        return task;
      }
    }

    return null;
  }

  private showTooltip(event: MouseEvent, task: GanttTask): void {
    if (!this.showTooltips || this.hoveredTask === task) return;

    this.hoveredTask = task;
    this.createTooltipElement();

    if (!this.tooltip) return;

    // Format dates
    const startDate = task.start.toLocaleDateString();
    const endDate = task.end.toLocaleDateString();
    const duration = Math.ceil(
      (task.end.getTime() - task.start.getTime()) / (1000 * 60 * 60 * 24)
    );

    this.tooltip.innerHTML = `
      <div class="gantt-tooltip-title">${task.name}</div>
      <div class="gantt-tooltip-row">
        <span>Start:</span> ${startDate}
      </div>
      <div class="gantt-tooltip-row">
        <span>End:</span> ${endDate}
      </div>
      <div class="gantt-tooltip-row">
        <span>Duration:</span> ${duration} days
      </div>
      ${task.progress ? `
      <div class="gantt-tooltip-row">
        <span>Progress:</span> ${task.progress}%
      </div>
      <div class="gantt-tooltip-progress">
        <div class="gantt-tooltip-progress-bar" style="width: ${task.progress}%"></div>
      </div>` : ''}
    `;

    // Position tooltip
    this.positionTooltip(event);
  }

  private showRelationshipTooltip(event: MouseEvent, rel: RelationshipLine): void {
    this.createRelationshipTooltipElement();

    if (!this.relationshipTooltip) return;

    this.relationshipTooltip.innerHTML = `
      <div class="gantt-relationship-tooltip-title">
        ${rel.type}
      </div>
      <div class="gantt-relationship-tooltip-row">
        <span>From:</span> ${rel.sourceTask.name}
      </div>
      <div class="gantt-relationship-tooltip-row">
        <span>To:</span> ${rel.targetTask.name}
      </div>
      ${rel.lag ? `
      <div class="gantt-relationship-tooltip-row">
        <span>Lag:</span> ${rel.lag} days
      </div>` : ''}
    `;

    // Position tooltip
    const x = event.clientX + 15;
    const y = event.clientY - 15;
    this.relationshipTooltip.style.left = `${x}px`;
    this.relationshipTooltip.style.top = `${y}px`;
  }

  private createTooltipElement(): void {
    if (this.tooltip) return;

    this.tooltip = document.createElement('div');
    this.tooltip.className = 'gantt-tooltip';
    document.body.appendChild(this.tooltip);
  }

  private createRelationshipTooltipElement(): void {
    if (this.relationshipTooltip) return;

    this.relationshipTooltip = document.createElement('div');
    this.relationshipTooltip.className = 'gantt-relationship-tooltip';
    document.body.appendChild(this.relationshipTooltip);
  }

  private positionTooltip(event: MouseEvent): void {
    if (!this.tooltip) return;

    const x = event.clientX + 15;
    const y = event.clientY - 15;
    const rightEdge = window.innerWidth - this.tooltip.offsetWidth - 20;

    this.tooltip.style.left = `${Math.min(x, rightEdge)}px`;
    this.tooltip.style.top = `${y}px`;
    this.tooltip.style.display = 'block';
  }

  private hideTooltip(): void {
    if (this.tooltip) {
      this.tooltip.style.display = 'none';
    }
  }

  private hideRelationshipTooltip(): void {
    if (this.relationshipTooltip) {
      this.relationshipTooltip.style.display = 'none';
    }
  }

  private removeTooltips(): void {
    if (this.tooltip) {
      document.body.removeChild(this.tooltip);
      this.tooltip = null;
    }
    if (this.relationshipTooltip) {
      document.body.removeChild(this.relationshipTooltip);
      this.relationshipTooltip = null;
    }
  }

  private getMousePosition(event: MouseEvent): { x: number; y: number } {
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }
}

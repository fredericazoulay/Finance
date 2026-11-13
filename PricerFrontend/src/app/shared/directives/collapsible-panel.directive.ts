import { AfterViewInit, Directive, ElementRef, Input, OnDestroy, Renderer2 } from '@angular/core';

let nextPanelId = 0;

@Directive({
  selector: '[appCollapsiblePanel]',
  standalone: true
})
export class CollapsiblePanelDirective implements AfterViewInit, OnDestroy {
  @Input('appCollapsiblePanel') panelLabel = 'Panneau';
  @Input() appCollapsiblePanelHeader = '.section-heading';

  private readonly panelId = ++nextPanelId;
  private readonly host: HTMLElement;
  private contentElements: HTMLElement[] = [];
  private toggleButton?: HTMLButtonElement;
  private expandedIcon?: HTMLSpanElement;
  private expandedLabel?: HTMLSpanElement;
  private removeClickListener?: () => void;
  private collapsed = false;

  constructor(
    elementRef: ElementRef<HTMLElement>,
    private readonly renderer: Renderer2
  ) {
    this.host = elementRef.nativeElement;
  }

  ngAfterViewInit(): void {
    const header = this.host.querySelector<HTMLElement>(this.appCollapsiblePanelHeader);
    if (!header) {
      throw new Error(`Collapsible panel "${this.panelLabel}" requires a header matching "${this.appCollapsiblePanelHeader}".`);
    }

    let headerContainer = header;
    while (headerContainer.parentElement && headerContainer.parentElement !== this.host) {
      headerContainer = headerContainer.parentElement;
    }
    if (headerContainer.parentElement !== this.host) {
      throw new Error(`Collapsible panel "${this.panelLabel}" has no direct header child.`);
    }

    this.contentElements = Array.from(this.host.children)
      .filter((child): child is HTMLElement => child instanceof HTMLElement && child !== headerContainer);
    if (this.contentElements.length === 0) return;

    this.contentElements.forEach((element, index) => {
      if (!element.id) element.id = `collapsible-panel-${this.panelId}-content-${index}`;
    });

    this.createToggleButton(headerContainer);
    this.updatePanel();
  }

  ngOnDestroy(): void {
    this.removeClickListener?.();
  }

  private createToggleButton(header: HTMLElement): void {
    this.toggleButton = this.renderer.createElement('button') as HTMLButtonElement;
    this.expandedIcon = this.renderer.createElement('span') as HTMLSpanElement;
    this.expandedLabel = this.renderer.createElement('span') as HTMLSpanElement;

    this.renderer.addClass(this.toggleButton, 'app-collapsible-panel-toggle');
    this.renderer.setAttribute(this.toggleButton, 'type', 'button');
    this.renderer.setAttribute(this.expandedIcon, 'aria-hidden', 'true');
    this.renderer.appendChild(this.toggleButton, this.expandedIcon);
    this.renderer.appendChild(this.toggleButton, this.expandedLabel);
    this.renderer.appendChild(header, this.toggleButton);
    this.removeClickListener = this.renderer.listen(this.toggleButton, 'click', () => {
      this.collapsed = !this.collapsed;
      this.updatePanel();
    });
  }

  private updatePanel(): void {
    if (!this.toggleButton || !this.expandedIcon || !this.expandedLabel) return;

    const action = this.collapsed ? 'Développer' : 'Réduire';
    this.renderer.setAttribute(this.toggleButton, 'aria-expanded', String(!this.collapsed));
    this.renderer.setAttribute(this.toggleButton, 'aria-label', `${action} ${this.panelLabel}`);
    this.renderer.setAttribute(this.toggleButton, 'aria-controls', this.contentElements.map(element => element.id).join(' '));
    this.renderer.setProperty(this.expandedIcon, 'textContent', this.collapsed ? '▸' : '▾');
    this.renderer.setProperty(this.expandedLabel, 'textContent', action);

    for (const element of this.contentElements) {
      if (this.collapsed) this.renderer.addClass(element, 'app-collapsible-panel-content-hidden');
      else this.renderer.removeClass(element, 'app-collapsible-panel-content-hidden');
    }
  }
}

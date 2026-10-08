/** The part of Hairline's kernel Beacon calls itself; the figures use the rest. */
export declare const HL: {
  /** Adds the figures' stylesheet to the document, once. */
  inject(root: Document): void
  /** One svg element: the only way a figure makes a node. */
  mk(tag: string, attrs: Record<string, string>, parent: Element): SVGElement
}

/** Where a figure draws and writes its caption. */
export interface KitStage {
  stage: HTMLElement
  svg: SVGElement
  read: { textContent: string | null }
}

/** A figure in the shape the hairline-create skill writes. */
export interface KitFigure {
  name: string
  means: string
  rules: readonly number[]
  /** The figure's own number at intensity 0, 0.5 and 1. */
  range: readonly [number, number, number]
  mount(stage: KitStage, value: number): { set(value: number): void; destroy(): void }
}

export declare const hairline: (figure: KitFigure) => KitFigure

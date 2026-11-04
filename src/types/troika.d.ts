declare module 'troika-three-text' {
  import { Mesh, Material } from 'three';
  export class Text extends Mesh {
    text: string;
    font: string | null;
    fontSize: number;
    color: string | number;
    fillOpacity: number;
    outlineWidth: number | string;
    outlineBlur: number | string;
    outlineColor: string | number;
    outlineOpacity: number;
    anchorX: number | string;
    anchorY: number | string;
    letterSpacing: number;
    lineHeight: number | string;
    maxWidth: number;
    textAlign: 'left' | 'right' | 'center' | 'justify';
    whiteSpace: 'normal' | 'nowrap';
    overflowWrap: 'normal' | 'break-word';
    material: Material;
    textRenderInfo: { blockBounds: [number, number, number, number] } | null;
    sync(cb?: () => void): void;
    dispose(): void;
  }
  export function preloadFont(opts: { font: string; characters?: string }, cb: () => void): void;
}

declare module '@barba/core' {
  interface PageData {
    container: HTMLElement;
    namespace: string;
    url: { href: string; path: string };
  }
  interface TransitionData {
    current: PageData;
    next: PageData;
  }
  interface Transition {
    name?: string;
    leave?: (data: TransitionData) => Promise<void> | void;
    enter?: (data: TransitionData) => Promise<void> | void;
  }
  interface Options {
    preventRunning?: boolean;
    prevent?: (data: { el: HTMLElement; event: Event; href: string }) => boolean;
    transitions?: Transition[];
  }
  const barba: { init(options: Options): void; go(href: string): Promise<void> };
  export default barba;
}

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { useSectionScrollSpy } from '@/features/application/composables/useSectionScrollSpy';

/** jsdom 里没有布局：手动控制视口尺寸与每个 section 的 top。 */
const originalDescriptors = {
  scrollY: Object.getOwnPropertyDescriptor(window, 'scrollY'),
  innerHeight: Object.getOwnPropertyDescriptor(window, 'innerHeight'),
  scrollHeight: Object.getOwnPropertyDescriptor(document.documentElement, 'scrollHeight'),
  scrollTo: window.scrollTo,
  requestAnimationFrame: window.requestAnimationFrame,
};

function setViewport(options: { scrollY?: number; innerHeight?: number; scrollHeight?: number }): void {
  Object.defineProperty(window, 'scrollY', {
    configurable: true,
    value: options.scrollY ?? 0,
  });
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: options.innerHeight ?? 768,
  });
  Object.defineProperty(document.documentElement, 'scrollHeight', {
    configurable: true,
    value: options.scrollHeight ?? 5000,
  });
}

function addSection(code: string, top: number): HTMLElement {
  const element = document.createElement('section');
  element.dataset.sectionCode = code;
  element.getBoundingClientRect = () =>
    ({
      top,
      bottom: top + 100,
      left: 0,
      right: 0,
      width: 100,
      height: 100,
      x: 0,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect;
  document.body.appendChild(element);
  return element;
}

function mountSpy(codes: string[], navHeight = 50) {
  const codesRef = ref(codes);
  const navRef = ref<HTMLElement | null>({ offsetHeight: navHeight } as HTMLElement);
  let spy!: ReturnType<typeof useSectionScrollSpy>;
  const wrapper = mount(
    defineComponent({
      setup() {
        spy = useSectionScrollSpy(codesRef, navRef);
        return () => h('div');
      },
    }),
  );
  mountedWrappers.push(wrapper);
  return { codesRef, navRef, spy, wrapper };
}

const mountedWrappers: Array<{ unmount: () => void; vm: unknown }> = [];
const unmountedWrappers = new WeakSet<object>();

function unmountAll(): void {
  for (const wrapper of mountedWrappers.splice(0)) {
    if (unmountedWrappers.has(wrapper)) continue;
    unmountedWrappers.add(wrapper);
    wrapper.unmount();
  }
}

describe('useSectionScrollSpy', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    setViewport({});
  });

  afterEach(() => {
    unmountAll();
    document.body.innerHTML = '';
    if (originalDescriptors.scrollY) {
      Object.defineProperty(window, 'scrollY', originalDescriptors.scrollY);
    }
    if (originalDescriptors.innerHeight) {
      Object.defineProperty(window, 'innerHeight', originalDescriptors.innerHeight);
    }
    if (originalDescriptors.scrollHeight) {
      Object.defineProperty(
        document.documentElement,
        'scrollHeight',
        originalDescriptors.scrollHeight,
      );
    }
    window.scrollTo = originalDescriptors.scrollTo;
    window.requestAnimationFrame = originalDescriptors.requestAnimationFrame;
  });

  it('initialises the active code to the first section', () => {
    addSection('A', 0);
    addSection('B', 900);

    const { spy } = mountSpy(['A', 'B']);

    expect(spy.active.value).toBe('A');
  });

  it('selects the last section that has crossed the nav threshold', () => {
    addSection('A', 0);
    addSection('B', 60);
    addSection('C', 400);

    const { spy } = mountSpy(['A', 'B', 'C'], 50);

    spy.update();
    // threshold = navHeight(50) + 24 = 74：A 与 B 都过了线，C 还没到
    expect(spy.active.value).toBe('B');
  });

  it('stops at the first section below the threshold', () => {
    addSection('A', 0);
    addSection('B', 300);
    addSection('C', 320);

    const { spy } = mountSpy(['A', 'B', 'C'], 50);

    spy.update();
    expect(spy.active.value).toBe('A');
  });

  it('forces the last section when the page is scrolled to the bottom', () => {
    addSection('A', 0);
    addSection('B', 300);
    setViewport({ scrollY: 4240, innerHeight: 768, scrollHeight: 5000 });

    const { spy } = mountSpy(['A', 'B'], 50);

    spy.update();
    expect(spy.active.value).toBe('B');
  });

  it('does nothing when there are no section elements in the DOM', () => {
    const { spy } = mountSpy(['A']);

    spy.update();
    expect(spy.active.value).toBe('A');
  });

  it('scrolls the target section below the sticky nav', () => {
    addSection('A', 0);
    addSection('B', 500);
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;

    const { spy } = mountSpy(['A', 'B'], 50);

    spy.scrollTo('B');

    expect(spy.active.value).toBe('B');
    expect(scrollTo).toHaveBeenCalledWith({ top: 434, behavior: 'smooth' });
  });

  it('never scrolls to a negative offset', () => {
    addSection('A', 10);
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;

    const { spy } = mountSpy(['A'], 50);

    spy.scrollTo('A');

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });

  it('uses instant scrolling when the user prefers reduced motion', () => {
    addSection('A', 500);
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    window.matchMedia = vi.fn(() => ({
      matches: true,
      media: '',
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;

    const { spy } = mountSpy(['A'], 50);

    spy.scrollTo('A');

    expect(scrollTo).toHaveBeenCalledWith({ top: 434, behavior: 'auto' });
  });

  it('ignores clicks on an unknown section code', () => {
    addSection('A', 500);
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;

    const { spy } = mountSpy(['A'], 50);

    spy.scrollTo('MISSING');

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('keeps the clicked section during the smooth-scroll lock window', () => {
    addSection('A', 0);
    addSection('B', 500);
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;

    const { spy } = mountSpy(['A', 'B'], 50);

    spy.scrollTo('B');
    // 位置仍然指向 A，但滚动动画期间不应把高亮切回去
    spy.update();
    expect(spy.active.value).toBe('B');
  });

  it('releases the lock after 800ms', () => {
    addSection('A', 0);
    addSection('B', 500);
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;

    const { spy } = mountSpy(['A', 'B'], 50);
    const now = Date.now();
    const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(now);

    spy.scrollTo('B');
    dateSpy.mockReturnValue(now + 900);
    spy.update();

    expect(spy.active.value).toBe('A');
  });

  it('resets the active code when the section list no longer contains it', async () => {
    addSection('A', 0);

    const { spy, codesRef } = mountSpy(['A']);

    document.body.innerHTML = '';
    codesRef.value = ['X', 'Y'];
    await nextTick();

    expect(spy.active.value).toBe('X');
  });

  it('keeps the active code when the section list still contains it', async () => {
    addSection('A', 0);

    const { spy, codesRef } = mountSpy(['A']);

    codesRef.value = ['A', 'B'];
    await nextTick();

    expect(spy.active.value).toBe('A');
  });

  it('coalesces scroll events into one animation frame and removes listeners on unmount', () => {
    const frames: FrameRequestCallback[] = [];
    window.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    }) as unknown as typeof window.requestAnimationFrame;

    const { wrapper } = mountSpy(['A']);

    window.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('scroll'));
    expect(frames).toHaveLength(1);

    frames[0](0);
    window.dispatchEvent(new Event('scroll'));
    expect(frames).toHaveLength(2);

    wrapper.unmount();
    unmountedWrappers.add(wrapper);
    window.dispatchEvent(new Event('scroll'));
    expect(frames).toHaveLength(2);
  });
});

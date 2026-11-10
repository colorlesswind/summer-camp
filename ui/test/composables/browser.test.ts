// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { useCountdown, type Countdown } from '@/composables/useCountdown';
import { useMediaQuery } from '@/composables/useMediaQuery';

function mountCountdown(defaultSeconds = 60) {
  let countdown!: Countdown;
  const wrapper = mount(
    defineComponent({
      setup() {
        countdown = useCountdown(defaultSeconds);
        return () => h('div');
      },
    }),
  );
  return { wrapper, countdown };
}

describe('useCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts idle with remaining = 0 and active = false', () => {
    const { countdown } = mountCountdown();

    expect(countdown.remaining.value).toBe(0);
    expect(countdown.active.value).toBe(false);
  });

  it('counts down once per second from the default duration', () => {
    const { countdown } = mountCountdown(60);

    countdown.start();
    expect(countdown.remaining.value).toBe(60);
    expect(countdown.active.value).toBe(true);

    vi.advanceTimersByTime(1000);
    expect(countdown.remaining.value).toBe(59);

    vi.advanceTimersByTime(59_000);
    expect(countdown.remaining.value).toBe(0);
    expect(countdown.active.value).toBe(false);
  });

  it('accepts an explicit duration and stops the timer at zero', () => {
    const { countdown } = mountCountdown(60);

    countdown.start(3);
    expect(countdown.remaining.value).toBe(3);

    vi.advanceTimersByTime(3000);
    expect(countdown.remaining.value).toBe(0);

    // 已经 clearInterval，继续走时间不应变成负数
    vi.advanceTimersByTime(5000);
    expect(countdown.remaining.value).toBe(0);
  });

  it('floors fractional seconds and clamps negative input to zero', () => {
    const { countdown } = mountCountdown();

    countdown.start(2.9);
    expect(countdown.remaining.value).toBe(2);

    countdown.start(-5);
    expect(countdown.remaining.value).toBe(0);
    expect(countdown.active.value).toBe(false);
  });

  it('does not schedule a timer when started with 0 seconds', () => {
    const { countdown } = mountCountdown();

    countdown.start(0);
    vi.advanceTimersByTime(1000);

    expect(countdown.remaining.value).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stop() freezes the current value', () => {
    const { countdown } = mountCountdown();

    countdown.start(10);
    vi.advanceTimersByTime(3000);
    expect(countdown.remaining.value).toBe(7);

    countdown.stop();
    vi.advanceTimersByTime(5000);
    expect(countdown.remaining.value).toBe(7);
  });

  it('restarting replaces the previous timer instead of stacking them', () => {
    const { countdown } = mountCountdown();

    countdown.start(10);
    vi.advanceTimersByTime(2000);
    countdown.start(5);

    vi.advanceTimersByTime(1000);
    // 如果旧定时器没被清掉，这里会先被旧定时器减 1 再被新定时器减 1
    expect(countdown.remaining.value).toBe(4);
  });

  it('clears the timer when the owning component unmounts', () => {
    const { wrapper, countdown } = mountCountdown();

    countdown.start(10);
    wrapper.unmount();

    vi.advanceTimersByTime(5000);
    expect(countdown.remaining.value).toBe(10);
    expect(vi.getTimerCount()).toBe(0);
  });
});

type ChangeListener = (event: MediaQueryListEvent) => void;

/** 可手动触发 change 的 matchMedia 替身，用于观察监听器的注册/注销。 */
function installMatchMedia(initialMatches: boolean) {
  const listeners = new Set<ChangeListener>();
  const removeEventListener = vi.fn((_type: string, listener: ChangeListener) => {
    listeners.delete(listener);
  });

  const media = {
    matches: initialMatches,
    media: '',
    onchange: null,
    addEventListener: vi.fn((_type: string, listener: ChangeListener) => {
      listeners.add(listener);
    }),
    removeEventListener,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };

  const matchMedia = vi.fn((query: string) => {
    media.media = query;
    return media;
  });

  window.matchMedia = matchMedia as unknown as typeof window.matchMedia;

  return {
    matchMedia,
    media,
    emit(matches: boolean) {
      for (const listener of listeners) listener({ matches } as MediaQueryListEvent);
    },
    get listenerCount() {
      return listeners.size;
    },
  };
}

function mountQuery(query: string) {
  let matches!: ReturnType<typeof useMediaQuery>;
  const wrapper = mount(
    defineComponent({
      setup() {
        matches = useMediaQuery(query);
        return () => h('div');
      },
    }),
  );
  return { wrapper, matches };
}

describe('useMediaQuery', () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('passes the query to matchMedia and reflects the initial match', () => {
    const stub = installMatchMedia(true);

    const { matches } = mountQuery('(max-width: 640px)');

    expect(stub.matchMedia).toHaveBeenCalledWith('(max-width: 640px)');
    expect(matches.value).toBe(true);
  });

  it('starts false when the media query does not match', () => {
    installMatchMedia(false);

    const { matches } = mountQuery('(max-width: 640px)');

    expect(matches.value).toBe(false);
  });

  it('updates reactively on change events', () => {
    const stub = installMatchMedia(false);
    const { matches } = mountQuery('(max-width: 640px)');

    stub.emit(true);
    expect(matches.value).toBe(true);

    stub.emit(false);
    expect(matches.value).toBe(false);
  });

  it('removes the change listener when the component unmounts', () => {
    const stub = installMatchMedia(false);
    const { wrapper } = mountQuery('(max-width: 640px)');

    expect(stub.listenerCount).toBe(1);
    wrapper.unmount();

    expect(stub.listenerCount).toBe(0);
    expect(stub.media.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('degrades to false when matchMedia is unavailable (SSR / old browsers)', () => {
    window.matchMedia = undefined as unknown as typeof window.matchMedia;

    const { matches } = mountQuery('(max-width: 640px)');

    expect(matches.value).toBe(false);
  });
});

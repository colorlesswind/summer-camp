/**
 * jsdom 缺失的浏览器 API 兜底（仅测试用，不参与构建）。
 *
 * 只实现被测代码真正用到的部分：
 * - `matchMedia`：useMediaQuery / useSectionScrollSpy 读取；
 * - `scrollTo`：useSectionScrollSpy 调用（jsdom 默认抛 "not implemented"）。
 */

interface MediaQueryListStub extends MediaQueryList {
  readonly matches: boolean;
}

export function createMatchMedia(matches = false): (query: string) => MediaQueryListStub {
  return (query: string): MediaQueryListStub => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  });
}

if (typeof window !== 'undefined') {
  if (typeof window.matchMedia !== 'function') {
    window.matchMedia = createMatchMedia(false);
  }

  // jsdom 实现了 scrollTo 但会打 "Not implemented" 日志，这里用空实现替换；
  // 需要断言的测试自己 vi.spyOn(window, 'scrollTo')。
  window.scrollTo = (() => undefined) as typeof window.scrollTo;
}

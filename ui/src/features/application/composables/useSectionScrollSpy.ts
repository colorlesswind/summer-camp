import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';

/**
 * 分节导航的 scroll-spy：
 * - 页面滚动时取「已经滚过导航栏下沿」的最后一节作为 active；
 * - 点击导航时先锁定 active，避免平滑滚动过程中来回跳；
 * - 到底部时强制最后一节，短小节也能被选中。
 */
export function useSectionScrollSpy(codes: Ref<string[]>, navRef: Ref<HTMLElement | null>) {
  const active = ref(codes.value[0] ?? '');
  let ticking = false;
  let lockUntil = 0;

  const sectionElements = (): HTMLElement[] =>
    Array.from(document.querySelectorAll<HTMLElement>('[data-section-code]'));

  function update(): void {
    const elements = sectionElements();
    if (elements.length === 0) return;
    if (Date.now() < lockUntil) return;

    const navHeight = navRef.value?.offsetHeight ?? 0;

    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
      active.value = elements[elements.length - 1]?.dataset.sectionCode ?? active.value;
      return;
    }

    const threshold = navHeight + 24;
    let current = elements[0]?.dataset.sectionCode ?? '';
    for (const element of elements) {
      if (element.getBoundingClientRect().top <= threshold) {
        current = element.dataset.sectionCode ?? current;
      } else {
        break;
      }
    }
    active.value = current;
  }

  function onScroll(): void {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      update();
    });
  }

  function scrollTo(code: string): void {
    const element = sectionElements().find((item) => item.dataset.sectionCode === code);
    if (!element) return;

    const navHeight = navRef.value?.offsetHeight ?? 0;
    const top = element.getBoundingClientRect().top + window.scrollY - navHeight - 16;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    lockUntil = Date.now() + 800;
    active.value = code;
    window.scrollTo({ top: Math.max(0, top), behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  watch(
    codes,
    (list) => {
      if (!list.includes(active.value)) active.value = list[0] ?? '';
      update();
    },
    { flush: 'post' },
  );

  onMounted(() => {
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();
  });

  onBeforeUnmount(() => {
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onScroll);
  });

  return { active, scrollTo, update };
}

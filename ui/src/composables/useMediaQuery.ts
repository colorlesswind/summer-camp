import { onBeforeUnmount, ref, type Ref } from 'vue';

/** 响应式媒体查询，用于登录表单在窄屏切换为上下堆叠布局 */
export function useMediaQuery(query: string): Ref<boolean> {
  const matches = ref(false);

  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return matches;
  }

  const media = window.matchMedia(query);
  matches.value = media.matches;

  const update = (event: MediaQueryListEvent): void => {
    matches.value = event.matches;
  };

  media.addEventListener('change', update);
  onBeforeUnmount(() => media.removeEventListener('change', update));

  return matches;
}

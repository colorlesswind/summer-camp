import { computed, onBeforeUnmount, ref, type ComputedRef, type Ref } from 'vue';

export interface Countdown {
  remaining: Ref<number>;
  active: ComputedRef<boolean>;
  start: (seconds?: number) => void;
  stop: () => void;
}

/** 验证码重发倒计时；组件卸载时自动清理定时器 */
export function useCountdown(defaultSeconds: number): Countdown {
  const remaining = ref(0);
  let timer: ReturnType<typeof setInterval> | null = null;

  const stop = (): void => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };

  const start = (seconds = defaultSeconds): void => {
    stop();
    remaining.value = Math.max(0, Math.floor(seconds));
    if (remaining.value === 0) return;

    timer = setInterval(() => {
      remaining.value = Math.max(0, remaining.value - 1);
      if (remaining.value === 0) stop();
    }, 1000);
  };

  onBeforeUnmount(stop);

  return {
    remaining,
    active: computed(() => remaining.value > 0),
    start,
    stop,
  };
}

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { applicationApi } from '@/api/application';
import { ApiError } from '@/api/problem';
import { isEditableStatus } from '@/constants/application';

const router = useRouter();
const error = ref<string | null>(null);
const loading = ref(true);

/**
 * 登录后的学生分流：
 * - 没有申请，或 Draft / Returned（还没提交 / 被退回）→ 直接去填表；
 * - 其余状态（审核中 / 已发 Offer / 已接受 / 已拒绝）→ Application Status。
 */
async function routeStudent(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const application = await applicationApi.mine();
    if (!application || isEditableStatus(application.status)) {
      await router.replace({ name: 'student-application-new' });
      return;
    }
    await router.replace({ name: 'student-applications' });
  } catch (loadError) {
    error.value = loadError instanceof ApiError ? loadError.message : 'Unable to load your application.';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void routeStudent();
});
</script>

<template>
  <div class="entry-state">
    <template v-if="error">
      <a-result status="error" title="Unable to load your application" :sub-title="error">
        <template #extra>
          <a-button type="primary" @click="routeStudent">Try again</a-button>
        </template>
      </a-result>
    </template>
    <template v-else>
      <a-spin v-if="loading" size="large" />
      <p v-if="loading">Loading your application…</p>
    </template>
  </div>
</template>

<style scoped>
.entry-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 360px;
  color: var(--color-text-secondary);
}
</style>

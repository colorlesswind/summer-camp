<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import BrandHeader from '@/components/BrandHeader.vue';
import { ROLE_LABELS } from '@/constants/roles';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();
const loggingOut = ref(false);

const roleLabel = computed(() => (auth.role ? ROLE_LABELS[auth.role] : ''));

async function handleLogout(): Promise<void> {
  loggingOut.value = true;
  try {
    await auth.logout();
  } catch {
    // store 已在 finally 中清空本地会话，忽略登出请求失败
  } finally {
    loggingOut.value = false;
  }
  await router.replace({ name: 'login' });
}
</script>

<template>
  <div class="main-layout">
    <BrandHeader>
      <template #actions>
        <div class="main-layout__account">
          <span class="main-layout__email">{{ auth.user?.email }}</span>
          <a-tag v-if="roleLabel" color="blue">{{ roleLabel }}</a-tag>
          <a-button type="link" size="small" :loading="loggingOut" @click="handleLogout">
            Log out
          </a-button>
        </div>
      </template>
    </BrandHeader>

    <main class="main-layout__content">
      <router-view />
    </main>
  </div>
</template>

<style scoped>
.main-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: #f5f6f8;
}

.main-layout__account {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.main-layout__email {
  max-width: 240px;
  overflow: hidden;
  color: var(--color-text-secondary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.main-layout__content {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  padding: 24px 32px 40px;
}

@media (max-width: 640px) {
  .main-layout__content {
    padding: 16px 16px 32px;
  }

  .main-layout__email {
    max-width: 160px;
  }
}
</style>

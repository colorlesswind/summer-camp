<script setup lang="ts">
import { computed, ref } from 'vue';
import AuthCard from '@/components/AuthCard.vue';
import StaffLoginForm from '../components/StaffLoginForm.vue';
import StudentLoginForm from '../components/StudentLoginForm.vue';
import { loginCopy as copy } from '../messages';
import '@/features/auth/styles/login.css';

type LoginMode = 'student' | 'staff';

const mode = ref<LoginMode>('student');

const description = computed(() =>
  mode.value === 'student' ? copy.studentDescription : copy.staffDescription,
);

function toggleMode(): void {
  mode.value = mode.value === 'student' ? 'staff' : 'student';
}
</script>

<template>
  <div class="login-view">
    <AuthCard :title="copy.title" :description="description">
      <StudentLoginForm v-if="mode === 'student'" />
      <StaffLoginForm v-else />

      <div class="login-view__switch">
        <a-button type="link" size="small" @click="toggleMode">
          {{ mode === 'student' ? copy.staffEntry : copy.studentEntry }}
        </a-button>
      </div>
    </AuthCard>
  </div>
</template>

<style scoped>
.login-view {
  display: flex;
  justify-content: center;
  width: 100%;
}

.login-view__switch {
  display: flex;
  justify-content: center;
  margin-top: 8px;
}
</style>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import type { Rule } from 'ant-design-vue/es/form';
import { toApiError } from '@/api/problem';
import { useMediaQuery } from '@/composables/useMediaQuery';
import { useAuthStore } from '@/stores/auth';
import { resolveRedirect } from '@/utils/redirect';
import LoginActions from './LoginActions.vue';
import { loginCopy as copy } from '../messages';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const form = reactive({ email: '', password: '' });
const submitting = ref(false);

const isNarrow = useMediaQuery('(max-width: 640px)');
const formLayout = computed<'horizontal' | 'vertical'>(() =>
  isNarrow.value ? 'vertical' : 'horizontal',
);
const labelCol = computed(() => (isNarrow.value ? undefined : { span: 6 }));
const wrapperCol = computed(() => (isNarrow.value ? undefined : { span: 18 }));

const rules: Record<string, Rule[]> = {
  email: [
    { required: true, message: copy.emailRequired, trigger: 'blur' },
    { type: 'email', message: copy.emailInvalid, trigger: 'blur' },
  ],
  password: [{ required: true, message: copy.passwordRequired, trigger: 'blur' }],
};

const normalizedEmail = (): string => form.email.trim().toLowerCase();

async function handleSubmit(): Promise<void> {
  submitting.value = true;
  try {
    await auth.loginWithPassword(normalizedEmail(), form.password);
    await router.replace(resolveRedirect(route.query.redirect, auth.homePath));
  } catch (error) {
    const problem = toApiError(error);
    message.error(problem.code === 'invalid_grant' ? copy.staffInvalidCredentials : problem.message);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <a-form
    class="login-form"
    :layout="formLayout"
    :label-col="labelCol"
    :wrapper-col="wrapperCol"
    :model="form"
    :rules="rules"
    :required-mark="false"
    :colon="false"
    label-align="left"
    @finish="handleSubmit"
  >
    <a-form-item name="email" :label="copy.emailLabel">
      <a-input
        v-model:value="form.email"
        :placeholder="copy.emailPlaceholder"
        autocomplete="username"
        inputmode="email"
      />
    </a-form-item>

    <a-form-item name="password" :label="copy.passwordLabel">
      <a-input-password
        v-model:value="form.password"
        :placeholder="copy.passwordPlaceholder"
        autocomplete="current-password"
      />
    </a-form-item>

    <LoginActions :loading="submitting" />
  </a-form>
</template>

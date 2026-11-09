<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import type { FormInstance, Rule } from 'ant-design-vue/es/form';
import { authApi } from '@/api/auth';
import { toApiError } from '@/api/problem';
import { useCountdown } from '@/composables/useCountdown';
import { useMediaQuery } from '@/composables/useMediaQuery';
import { OTP_RESEND_SECONDS } from '@/constants/app';
import { useAuthStore } from '@/stores/auth';
import { resolveRedirect } from '@/utils/redirect';
import LoginActions from './LoginActions.vue';
import { loginCopy as copy } from '../messages';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const formRef = ref<FormInstance>();
const form = reactive({ email: '', passcode: '' });
const submitting = ref(false);
const sendingCode = ref(false);

const { remaining, active: countdownActive, start: startCountdown } = useCountdown(
  OTP_RESEND_SECONDS,
);

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
  passcode: [
    { required: true, message: copy.passcodeRequired, trigger: 'blur' },
    { pattern: /^\d{6}$/, message: copy.passcodeInvalid, trigger: 'blur' },
  ],
};

const normalizedEmail = (): string => form.email.trim().toLowerCase();

async function handleSendCode(): Promise<void> {
  try {
    await formRef.value?.validateFields(['email']);
  } catch {
    return;
  }

  sendingCode.value = true;
  try {
    const response = await authApi.requestLogonOtp(normalizedEmail());
    const validMinutes = Math.max(1, Math.round(response.expiresInSeconds / 60));
    startCountdown();
    message.success(`${copy.otpSent} ${copy.otpValidFor(validMinutes)}`);
  } catch (error) {
    const problem = toApiError(error);
    message.error(problem.message);
  } finally {
    sendingCode.value = false;
  }
}

async function handleSubmit(): Promise<void> {
  submitting.value = true;
  try {
    await auth.loginWithOtp(normalizedEmail(), form.passcode.trim());
    await router.replace(resolveRedirect(route.query.redirect, auth.homePath));
  } catch (error) {
    const problem = toApiError(error);
    message.error(
      problem.code === 'invalid_grant' ? copy.studentInvalidCredentials : problem.message,
    );
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <a-form
    ref="formRef"
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
      <div class="login-form__inline">
        <div class="login-form__input">
          <a-input
            v-model:value="form.email"
            :placeholder="copy.emailPlaceholder"
            autocomplete="email"
            inputmode="email"
          />
        </div>
        <a-button
          class="login-form__send"
          html-type="button"
          :disabled="countdownActive || sendingCode"
          :loading="sendingCode"
          @click="handleSendCode"
        >
          {{ countdownActive ? copy.resendIn(remaining) : copy.sendCode }}
        </a-button>
      </div>
    </a-form-item>

    <a-form-item name="passcode" :label="copy.passcodeLabel">
      <a-input
        v-model:value="form.passcode"
        :placeholder="copy.passcodePlaceholder"
        autocomplete="one-time-code"
        inputmode="numeric"
        :maxlength="6"
      />
    </a-form-item>

    <LoginActions :loading="submitting" />
  </a-form>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { applicationApi } from '@/api/application';
import { ApiError } from '@/api/problem';
import { isEditableStatus, STUDENT_STATUS_META } from '@/constants/application';
import { useAuthStore } from '@/stores/auth';
import type { ApplicationDetail, FormSchema } from '@/types/application';
import { formatDateTime, APPLICATION_MESSAGES } from '@/features/application/messages';

const router = useRouter();
const auth = useAuthStore();

const loading = ref(true);
const error = ref<string | null>(null);
const application = ref<ApplicationDetail | null>(null);
const schema = ref<FormSchema | null>(null);

const statusMeta = computed(() =>
  application.value ? STUDENT_STATUS_META[application.value.status] : null,
);

const displayName = computed(() => {
  const item = application.value;
  if (!item) return '';
  return item.nameEn || item.fullNameZh || item.email;
});

const firstProgramLabel = computed(() =>
  programLabel(application.value?.firstProgramCode ?? null),
);

const secondProgramLabel = computed(() =>
  programLabel(application.value?.secondProgramCode ?? null),
);

const actionLabel = computed(() =>
  application.value && isEditableStatus(application.value.status)
    ? APPLICATION_MESSAGES.continueApplication
    : APPLICATION_MESSAGES.openApplication,
);

function programLabel(code: string | null): string {
  if (!code) return '—';
  const match = schema.value?.enums.programs.find((program) => program.value === code);
  return match?.labelEn ?? code;
}

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const [detail, loadedSchema] = await Promise.all([applicationApi.mine(), applicationApi.schema()]);
    application.value = detail;
    schema.value = loadedSchema;
  } catch (loadError) {
    error.value = loadError instanceof ApiError ? loadError.message : 'Unable to load your application.';
  } finally {
    loading.value = false;
  }
}

function openApplication(): void {
  if (!application.value) return;
  void router.push({
    name: 'student-application-detail',
    params: { id: application.value.id },
  });
}

function startApplication(): void {
  void router.push({ name: 'student-application-new' });
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div class="status-page">
    <header class="status-header">
      <div>
        <h1 class="status-header__title">APPLICATION STATUS</h1>
        <p class="status-header__subtitle">Signed in as {{ auth.user?.email }}</p>
      </div>
    </header>

    <div v-if="loading" class="status-state">
      <a-spin size="large" />
      <p>Loading application…</p>
    </div>

    <a-result
      v-else-if="error"
      status="error"
      title="Unable to load your application"
      :sub-title="error"
    >
      <template #extra>
        <a-button type="primary" @click="load">Try again</a-button>
      </template>
    </a-result>

    <a-result
      v-else-if="!application"
      status="info"
      title="No application yet"
      sub-title="Start a new application to apply for the Summer Camp."
    >
      <template #extra>
        <a-button type="primary" @click="startApplication">
          {{ APPLICATION_MESSAGES.startApplication }}
        </a-button>
      </template>
    </a-result>

    <section v-else class="status-card">
      <div class="status-card__top">
        <div>
          <p class="status-card__label">Application No.</p>
          <p class="status-card__number">{{ application.applicationNumber }}</p>
        </div>
        <a-tag v-if="statusMeta" :color="statusMeta.color">{{ application.displayStatus }}</a-tag>
      </div>

      <dl class="status-grid">
        <div class="status-grid__item">
          <dt>Name</dt>
          <dd>{{ displayName }}</dd>
        </div>
        <div class="status-grid__item">
          <dt>Email</dt>
          <dd>{{ application.email }}</dd>
        </div>
        <div class="status-grid__item">
          <dt>First Choice</dt>
          <dd>
            {{ firstProgramLabel }}
            <span v-if="application.firstSupervisorName">
              · {{ application.firstSupervisorName }}
            </span>
          </dd>
        </div>
        <div class="status-grid__item">
          <dt>Second Choice</dt>
          <dd>
            {{ secondProgramLabel }}
            <span v-if="application.secondSupervisorName">
              · {{ application.secondSupervisorName }}
            </span>
          </dd>
        </div>
        <div class="status-grid__item">
          <dt>Last Updated</dt>
          <dd>{{ formatDateTime(application.updatedAt) }}</dd>
        </div>
        <div class="status-grid__item">
          <dt>Submitted</dt>
          <dd>{{ application.submittedAt ? formatDateTime(application.submittedAt) : 'Not submitted yet' }}</dd>
        </div>
      </dl>

      <a-alert
        v-if="application.status === 'Returned'"
        class="status-card__alert"
        type="warning"
        show-icon
        message="Your application needs updates."
        :description="application.returnReason ?? 'Please update the requested information and resubmit.'"
      />

      <div class="status-card__actions">
        <a-button type="primary" @click="openApplication">{{ actionLabel }}</a-button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.status-page {
  width: 100%;
  max-width: 980px;
  margin: 0 auto;
}

.status-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}

.status-header__title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.status-header__subtitle {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.status-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 64px 0;
  color: var(--color-text-secondary);
}

.status-card {
  padding: 24px;
  background: #ffffff;
  border: 1px solid var(--color-divider);
  border-radius: 2px;
}

.status-card__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--color-divider);
}

.status-card__label {
  margin: 0 0 4px;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.status-card__number {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px 24px;
  margin: 20px 0 0;
}

.status-grid__item {
  min-width: 0;
}

.status-grid__item dt {
  margin-bottom: 4px;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.status-grid__item dd {
  margin: 0;
  font-size: 14px;
  color: var(--color-text);
  overflow-wrap: anywhere;
}

.status-card__alert {
  margin-top: 20px;
}

.status-card__actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 24px;
}

@media (max-width: 640px) {
  .status-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .status-card {
    padding: 18px;
  }
}
</style>

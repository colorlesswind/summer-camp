<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';
import { STUDENT_STATUS_META } from '@/constants/application';
import type { FormSectionConfig } from '@/types/application';
import { groupFields, type FieldGroup } from '../field-groups';
import FormFieldGroup from '../components/FormFieldGroup.vue';
import RepeatableSection from '../components/RepeatableSection.vue';
import SectionNav from '../components/SectionNav.vue';
import StatementSection from '../components/StatementSection.vue';
import { useApplicationForm, type RepeatableRow } from '../composables/useApplicationForm';
import { useSectionScrollSpy } from '../composables/useSectionScrollSpy';
import { APPLICATION_MESSAGES, formatDateTime } from '../messages';
import '../styles/application-form.css';

interface StatusAlert {
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  description?: string;
}

const route = useRoute();
const router = useRouter();
const form = useApplicationForm();

const navWrap = ref<HTMLElement | null>(null);
const hydrating = ref(false);
let loadSeq = 0;

const isNewRoute = computed(() => route.name === 'student-application-new');
const applicationId = computed<string | null>(() => {
  if (isNewRoute.value) return null;
  return typeof route.params.id === 'string' ? route.params.id : null;
});

const sectionCodes = computed(() => form.schema.value?.sections.map((section) => section.code) ?? []);
const { active, scrollTo, update: updateSpy } = useSectionScrollSpy(sectionCodes, navWrap);

const groupsBySection = computed(() => {
  const map = new Map<string, FieldGroup[]>();
  for (const section of form.schema.value?.sections ?? []) {
    map.set(section.code, groupFields(section.fields));
  }
  return map;
});

const statusMeta = computed(() => STUDENT_STATUS_META[form.status.value]);

const statusAlert = computed<StatusAlert | null>(() => {
  const schema = form.schema.value;
  const detail = form.detail.value;

  if (!detail) {
    if (schema && !schema.meta.canSaveDraft) {
      return {
        type: 'error',
        message: 'The submission period has closed.',
        description: 'You can no longer create or save an application.',
      };
    }
    if (schema && !schema.meta.submissionWindow.isOpen && schema.meta.submissionWindow.opensAt) {
      return {
        type: 'info',
        message: 'You can save your draft now.',
        description: `Submission opens on ${formatDateTime(schema.meta.submissionWindow.opensAt)}.`,
      };
    }
    return null;
  }

  if (detail.status === 'Returned') {
    return {
      type: 'warning',
      message: 'Your application needs updates.',
      description: detail.returnReason ?? 'Please update the requested information and resubmit.',
    };
  }

  if (detail.status === 'Draft') {
    if (schema && !schema.meta.canSaveDraft) {
      return {
        type: 'error',
        message: 'The submission period has closed.',
        description: 'This draft is now read-only.',
      };
    }
    if (schema && !schema.meta.submissionWindow.isOpen && schema.meta.submissionWindow.opensAt) {
      return {
        type: 'info',
        message: 'You can save your draft now.',
        description: `Submissions open on ${formatDateTime(schema.meta.submissionWindow.opensAt)}.`,
      };
    }
    return null;
  }

  if (
    detail.status === 'PendingForPreliminaryScreening' ||
    detail.status === 'PendingSupervisorReview' ||
    detail.status === 'SupervisorRecommended'
  ) {
    return {
      type: 'info',
      message: 'Your application is under review.',
      description: detail.submittedAt ? `Submitted on ${formatDateTime(detail.submittedAt)}.` : undefined,
    };
  }

  if (detail.status === 'SupervisorRejected') {
    return {
      type: 'error',
      message: 'Your application was not successful at the supervisor review stage.',
    };
  }

  if (detail.status === 'OfferSent') {
    return {
      type: 'success',
      message: 'An offer has been sent.',
      description: 'Please check the Application Status page for next steps.',
    };
  }

  if (detail.status === 'OfferAccepted') {
    return { type: 'success', message: 'You have accepted the offer.' };
  }

  if (detail.status === 'OfferDeclined') {
    return { type: 'warning', message: 'You have declined the offer.' };
  }

  return null;
});

function groupsFor(section: FormSectionConfig): FieldGroup[] {
  return groupsBySection.value.get(section.code) ?? [];
}

function groupRequired(group: FieldGroup): boolean {
  return group.fields.some((field) => form.isFieldRequired(field));
}

function rowsFor(section: FormSectionConfig): RepeatableRow[] {
  const key = section.payloadKey;
  if (!key) return [];
  const rows = form.values[key];
  return Array.isArray(rows) ? (rows as RepeatableRow[]) : [];
}

const makeRowKey = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

function addRow(section: FormSectionConfig): void {
  const key = section.payloadKey;
  if (!key) return;
  const current = form.values[key];
  const rows = Array.isArray(current) ? (current as RepeatableRow[]) : [];
  const row: RepeatableRow = { _key: makeRowKey() };
  for (const field of section.fields) row[field.code] = null;
  rows.push(row);
  form.values[key] = rows;
}

function removeRow(section: FormSectionConfig, index: number): void {
  const key = section.payloadKey;
  if (!key) return;
  const rows = form.values[key];
  if (Array.isArray(rows)) rows.splice(index, 1);
}

async function load(): Promise<void> {
  const seq = ++loadSeq;
  hydrating.value = true;
  try {
    const result = await form.initialize(applicationId.value);
    if (seq !== loadSeq) return;

    if (result.redirectTo) {
      await router.replace({
        name: 'student-application-detail',
        params: { id: result.redirectTo },
      });
      return;
    }

    await nextTick();
    updateSpy();
  } finally {
    if (seq === loadSeq) hydrating.value = false;
  }
}

async function scrollToFirstError(): Promise<void> {
  await nextTick();
  const errorElement = document.querySelector<HTMLElement>('.form-field__error');
  if (!errorElement) return;
  // 滚到整个字段（label + control），而不是只滚到错误文字，避免 label 被吸顶导航挡住
  const target =
    errorElement.closest<HTMLElement>('.form-field, .repeat-cell__item, .statement-item') ??
    errorElement;
  const navHeight = navWrap.value?.offsetHeight ?? 0;
  const top = target.getBoundingClientRect().top + window.scrollY - navHeight - 24;
  window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
}

async function handleSave(): Promise<void> {
  const ok = await form.save();
  if (!ok) await scrollToFirstError();
}

async function handleSubmit(): Promise<void> {
  const ok = await form.submit();
  if (!ok) await scrollToFirstError();
}

async function handleResubmit(): Promise<void> {
  const ok = await form.resubmit();
  if (!ok) await scrollToFirstError();
}

function goStatus(): void {
  void router.push({ name: 'student-applications' });
}

function handleBeforeUnload(event: BeforeUnloadEvent): void {
  if (!form.dirty.value || !form.editable.value) return;
  event.preventDefault();
  event.returnValue = '';
}

watch(
  applicationId,
  (id) => {
    // 首次 Save 后 URL 从 /new 变成 /:id；data 已经在内存里，不必重新请求
    if (id !== null && form.detail.value?.id === id) {
      void nextTick(updateSpy);
      return;
    }
    void load();
  },
);

watch(
  () => form.detail.value?.id,
  (id) => {
    if (!id || route.name !== 'student-application-new') return;
    void router.replace({ name: 'student-application-detail', params: { id } });
  },
);

// 用户开始改字段时收起顶部错误汇总；行内错误由各字段自己清除
watch(
  () => form.values,
  () => {
    if (form.formError.value) form.clearSummary();
  },
  { deep: true },
);

// 换 Program 时清空对应 Supervisor；同时避免两个志愿选同一个 Program
watch(
  () => form.values['programFirstId'],
  (value, previous) => {
    if (hydrating.value || value === previous) return;
    form.values['supervisorFirstId'] = null;
    if (
      value !== null &&
      value !== undefined &&
      String(value) === String(form.values['programSecondId'] ?? '')
    ) {
      form.values['programSecondId'] = null;
      form.values['supervisorSecondId'] = null;
    }
  },
  { flush: 'post' },
);

watch(
  () => form.values['programSecondId'],
  (value, previous) => {
    if (hydrating.value || value === previous) return;
    form.values['supervisorSecondId'] = null;
  },
  { flush: 'post' },
);

watch(
  () => form.values['supervisorFirstId'],
  (value) => {
    if (hydrating.value) return;
    const second = form.values['supervisorSecondId'];
    if (value !== null && value !== undefined && second !== null && second !== undefined) {
      if (Number(value) === Number(second)) form.values['supervisorSecondId'] = null;
    }
  },
  { flush: 'post' },
);

onMounted(() => {
  window.addEventListener('beforeunload', handleBeforeUnload);
  void load();
});

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload);
});

onBeforeRouteLeave(() => {
  if (!form.dirty.value || !form.editable.value) return true;
  return window.confirm(APPLICATION_MESSAGES.leaveConfirm);
});
</script>

<template>
  <div class="application-page">
    <aside class="application-sidebar">
      <div class="application-sidebar__sticky">
        <div class="application-sidebar__brand">{{ APPLICATION_MESSAGES.sidebarTitle }}</div>
        <nav class="application-sidebar__nav" aria-label="Summer Camp">
          <span class="application-sidebar__item is-active">{{ APPLICATION_MESSAGES.sidebarMenu }}</span>
        </nav>
      </div>
    </aside>

    <div class="application-main">
      <div v-if="form.loading.value" class="application-state">
        <a-spin size="large" />
        <p class="application-state__text">{{ APPLICATION_MESSAGES.loading }}</p>
      </div>

      <a-result
        v-else-if="form.loadError.value"
        status="error"
        :title="APPLICATION_MESSAGES.loadFailedTitle"
        :sub-title="form.loadError.value"
      >
        <template #extra>
          <a-button type="primary" @click="goStatus">
            {{ APPLICATION_MESSAGES.backToStatus }}
          </a-button>
        </template>
      </a-result>

      <template v-else-if="form.schema.value">
        <header class="application-header">
          <div class="application-header__number">
            {{ APPLICATION_MESSAGES.applicationNumber }}:
            <strong>{{ form.applicationNumber.value }}</strong>
          </div>
          <h1 class="application-header__title">{{ APPLICATION_MESSAGES.pageTitle }}</h1>
          <div class="application-header__status">
            {{ APPLICATION_MESSAGES.status }}:
            <a-tag :color="statusMeta.color">{{ form.displayStatus.value }}</a-tag>
          </div>
        </header>

        <div v-if="statusAlert || form.formError.value" class="application-alerts">
          <a-alert
            v-if="statusAlert"
            :type="statusAlert.type"
            :message="statusAlert.message"
            :description="statusAlert.description"
            show-icon
          />
          <a-alert
            v-if="form.formError.value"
            type="error"
            :message="form.formError.value"
            show-icon
          >
            <template v-if="form.errorSummary.value.length" #description>
              <ul class="application-alerts__list">
                <li v-for="(item, index) in form.errorSummary.value" :key="index">{{ item }}</li>
              </ul>
            </template>
          </a-alert>
        </div>

        <div class="application-body">
          <div ref="navWrap" class="section-nav-wrap">
            <SectionNav
              :sections="form.schema.value.sections"
              :active-code="active"
              @select="scrollTo"
            />
          </div>

          <form class="application-form" novalidate @submit.prevent>
            <template v-for="section in form.schema.value.sections" :key="section.code">
              <StatementSection
                v-if="section.code === 'STATEMENT'"
                :section="section"
                :schema="form.schema.value"
                :values="form.values"
                :disabled="form.isReadonly.value"
                :errors="form.fieldErrors"
              />

              <RepeatableSection
                v-else-if="section.isRepeatable"
                :section="section"
                :schema="form.schema.value"
                :rows="rowsFor(section)"
                :disabled="form.isReadonly.value"
                :row-errors="form.rowErrors"
                @add="addRow(section)"
                @remove="removeRow(section, $event)"
              />

              <section v-else class="form-section" :data-section-code="section.code">
                <h2 class="form-section__title">{{ section.titleEn }}</h2>
                <FormFieldGroup
                  v-for="group in groupsFor(section)"
                  :key="group.key"
                  :group="group"
                  :values="form.values"
                  :schema="form.schema.value"
                  :disabled="form.isReadonly.value"
                  :errors="form.fieldErrors"
                  :required="groupRequired(group)"
                />
              </section>
            </template>
          </form>

          <footer class="application-footer">
            <div class="application-footer__meta">
              <span v-if="!form.editable.value">{{ 'Read-only' }}</span>
              <span v-else-if="form.dirty.value">{{ APPLICATION_MESSAGES.unsaved }}</span>
              <span v-else>{{ APPLICATION_MESSAGES.allSaved }}</span>
              <span v-if="form.lastSavedAt.value">
                {{ APPLICATION_MESSAGES.lastUpdated }}:
                {{ formatDateTime(form.lastSavedAt.value) }}
              </span>
            </div>

            <div class="application-footer__actions">
              <a-button @click="goStatus">{{ APPLICATION_MESSAGES.previous }}</a-button>

              <a-button
                v-if="form.canSubmit.value"
                type="primary"
                :loading="form.submitting.value"
                :disabled="form.saving.value"
                @click="handleSubmit"
              >
                {{ APPLICATION_MESSAGES.submit }}
              </a-button>

              <a-button
                v-if="form.canResubmit.value"
                type="primary"
                :loading="form.submitting.value"
                :disabled="form.saving.value"
                @click="handleResubmit"
              >
                {{ APPLICATION_MESSAGES.resubmit }}
              </a-button>

              <a-button
                v-if="form.canSave.value"
                :loading="form.saving.value"
                :disabled="form.submitting.value"
                @click="handleSave"
              >
                {{ APPLICATION_MESSAGES.save }}
              </a-button>
            </div>
          </footer>
        </div>
      </template>
    </div>
  </div>
</template>

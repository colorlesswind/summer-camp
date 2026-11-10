import { defineComponent, h } from 'vue';

/**
 * ant-design-vue 组件的轻量替身。
 *
 * 测试只关心「组件怎么用这些控件」，不关心 Ant Design 的渲染细节：
 * 使用真实 antd 需要 CSS-in-JS、matchMedia、ResizeObserver 等大量环境，
 * 既慢又容易和业务断言无关地失败。这里的替身保留 props / 事件契约。
 */

export const AInputStub = defineComponent({
  name: 'AInputStub',
  inheritAttrs: false,
  props: {
    value: { type: [String, Number], default: '' },
    disabled: { type: Boolean, default: false },
    maxlength: { type: [Number, String], default: undefined },
    placeholder: { type: String, default: undefined },
  },
  emits: ['update:value'],
  setup(props, { emit }) {
    return () =>
      h('input', {
        class: 'stub-input',
        value: props.value,
        disabled: props.disabled,
        maxlength: props.maxlength,
        placeholder: props.placeholder,
        onInput: (event: Event) =>
          emit('update:value', (event.target as HTMLInputElement).value),
      });
  },
});

export const ATextareaStub = defineComponent({
  name: 'ATextareaStub',
  props: {
    value: { type: [String, Number], default: '' },
    disabled: { type: Boolean, default: false },
    maxlength: { type: [Number, String], default: undefined },
  },
  emits: ['update:value'],
  setup(props, { emit }) {
    return () =>
      h('textarea', {
        class: 'stub-textarea',
        value: props.value,
        disabled: props.disabled,
        onInput: (event: Event) =>
          emit('update:value', (event.target as HTMLTextAreaElement).value),
      });
  },
});

export const AInputNumberStub = defineComponent({
  name: 'AInputNumberStub',
  props: {
    value: { type: [Number, String], default: null },
    disabled: { type: Boolean, default: false },
  },
  emits: ['update:value'],
  setup(props, { emit }) {
    return () =>
      h('input', {
        class: 'stub-input-number',
        value: props.value ?? '',
        disabled: props.disabled,
        onInput: (event: Event) =>
          emit('update:value', (event.target as HTMLInputElement).value),
      });
  },
});

export const ASelectStub = defineComponent({
  name: 'ASelectStub',
  props: {
    value: { type: [String, Number], default: undefined },
    options: { type: Array as () => unknown[], default: () => [] },
    disabled: { type: Boolean, default: false },
    loading: { type: Boolean, default: false },
    placeholder: { type: String, default: undefined },
  },
  emits: ['update:value', 'search', 'focus'],
  setup(props, { emit }) {
    return () =>
      h(
        'div',
        {
          class: 'stub-select',
          'data-value': props.value === undefined ? '' : String(props.value),
          'data-disabled': String(props.disabled),
          'data-placeholder': props.placeholder ?? '',
        },
        [
          h(
            'button',
            {
              type: 'button',
              class: 'stub-select__focus',
              onClick: () => emit('focus'),
            },
            'focus',
          ),
        ],
      );
  },
});

export const ADatePickerStub = defineComponent({
  name: 'ADatePickerStub',
  props: {
    value: { type: Object, default: null },
    disabled: { type: Boolean, default: false },
    format: { type: String, default: '' },
  },
  emits: ['update:value'],
  setup(props) {
    return () =>
      h('div', {
        class: 'stub-date-picker',
        'data-value': props.value && typeof props.value === 'object' && 'format' in props.value
          ? String((props.value as { format: (pattern: string) => string }).format('YYYY-MM-DD'))
          : '',
        'data-disabled': String(props.disabled),
      });
  },
});

export const ACheckboxStub = defineComponent({
  name: 'ACheckboxStub',
  props: {
    checked: { type: Boolean, default: false },
    disabled: { type: Boolean, default: false },
    indeterminate: { type: Boolean, default: false },
    title: { type: String, default: undefined },
    ariaLabel: { type: String, default: undefined },
  },
  emits: ['change'],
  setup(props, { emit }) {
    return () =>
      h('input', {
        class: 'stub-checkbox',
        type: 'checkbox',
        checked: props.checked,
        disabled: props.disabled,
        title: props.title,
        'aria-label': props.ariaLabel,
        onChange: (event: Event) => emit('change', event),
      });
  },
});

export const AButtonStub = defineComponent({
  name: 'AButtonStub',
  props: {
    disabled: { type: Boolean, default: false },
    loading: { type: Boolean, default: false },
  },
  emits: ['click'],
  setup(props, { emit, slots }) {
    return () =>
      h(
        'button',
        {
          class: 'stub-button',
          disabled: props.disabled,
          onClick: (event: MouseEvent) => emit('click', event),
        },
        slots.default ? slots.default() : [],
      );
  },
});

export const ATagStub = defineComponent({
  name: 'ATagStub',
  props: { color: { type: String, default: '' } },
  setup(props, { slots }) {
    return () => h('span', { class: 'stub-tag', 'data-color': props.color }, slots.default?.());
  },
});

export const ASpinStub = defineComponent({
  name: 'ASpinStub',
  props: { size: { type: String, default: 'default' } },
  setup() {
    return () => h('div', { class: 'stub-spin' });
  },
});

/** 一次性注册全部 antd 替身（mount 的 global.stubs）。 */
export const antdStubs = {
  'a-input': AInputStub,
  'a-textarea': ATextareaStub,
  'a-input-number': AInputNumberStub,
  'a-select': ASelectStub,
  'a-date-picker': ADatePickerStub,
  'a-checkbox': ACheckboxStub,
  'a-button': AButtonStub,
  'a-tag': ATagStub,
  'a-spin': ASpinStub,
} as const;

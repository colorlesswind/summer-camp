import { createApp } from 'vue';
import {
  Alert,
  Button,
  Checkbox,
  ConfigProvider,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Pagination,
  Result,
  Select,
  Spin,
  Tag,
} from 'ant-design-vue';
import 'ant-design-vue/dist/reset.css';
import '@/assets/styles/reset.css';
import '@/assets/styles/tokens.css';
import '@/assets/styles/index.css';
import App from './App.vue';
import { setSessionExpiredHandler } from './api/http';
import { router } from './router';
import { pinia } from './stores';
import { useAuthStore } from './stores/auth';

const app = createApp(App);

app.use(pinia);
// 只注册当前用到的组件；新增页面时按需补充，避免全量引入
app.use(ConfigProvider);
app.use(Alert);
app.use(Button);
app.use(Checkbox);
app.use(DatePicker);
app.use(Form);
app.use(Input);
app.use(InputNumber);
app.use(Modal);
app.use(Pagination);
app.use(Result);
app.use(Select);
app.use(Spin);
app.use(Tag);
app.use(router);

// 会话彻底失效时（刷新也失败）由这里统一清状态并回登录页
setSessionExpiredHandler(() => {
  const auth = useAuthStore(pinia);
  auth.reset();

  const current = router.currentRoute.value;
  if (current.meta.requiresAuth) {
    void router.replace({ name: 'login', query: { redirect: current.fullPath } });
  }
});

app.mount('#app');

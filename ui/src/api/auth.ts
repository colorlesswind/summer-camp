import type { LogonRequest, LogonResponse, MeResponse, OtpAcceptedResponse } from '@/types/user';
import { http } from './http';

export const authApi = {
  /** POST /user/otp —— 发送登录验证码（学生首次登录会自动开户） */
  async requestLogonOtp(email: string): Promise<OtpAcceptedResponse> {
    const { data } = await http.post<OtpAcceptedResponse>('/user/otp', {
      email,
      purpose: 'logon',
    });
    return data;
  },

  /** POST /user/logon —— grant_type: otp | password */
  async logon(payload: LogonRequest): Promise<LogonResponse> {
    const { data } = await http.post<LogonResponse>('/user/logon', payload);
    return data;
  },

  /** GET /user/me —— 页面刷新后恢复会话；失败由 store 当作未登录处理 */
  async me(): Promise<MeResponse> {
    const { data } = await http.get<MeResponse>('/user/me', { skipSessionExpired: true });
    return data;
  },

  /** POST /user/logout —— 吊销会话并清 Cookie */
  async logout(): Promise<void> {
    await http.post<void>('/user/logout');
  },
};

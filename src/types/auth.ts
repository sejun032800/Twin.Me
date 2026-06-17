export type LinkedProvider = 'GOOGLE' | 'KAKAO' | 'NAVER' | 'APPLE';

export interface UserAccount {
  id: string;
  email: string;
  nickname: string;
  linkedProviders: LinkedProvider[];
  syncTimestamp: string; // ISO 8601
}

export const DEFAULT_USER_ACCOUNT: UserAccount = {
  id: 'guest-local',
  email: '',
  nickname: '게스트',
  linkedProviders: [],
  syncTimestamp: '',
};

// Supabase Auth 는 이메일 기반이라, 아이디를 내부용 이메일 주소로 변환해서 사용합니다.
// 예) studyking -> studyking@users.localtest.me
// 이 주소로는 메일이 발송되지 않습니다. (Supabase 에서 "Confirm email" 을 꺼야 합니다)
// Supabase 는 실제로 DNS 조회가 되는 도메인만 허용하므로, 배포 후에는 본인 도메인으로 바꿔도 됩니다.
// 단, 가입자가 생긴 뒤에 도메인을 바꾸면 기존 계정으로 로그인할 수 없게 되니 주의하세요.
const EMAIL_DOMAIN = process.env.AUTH_EMAIL_DOMAIN || "users.localtest.me";

export const USERNAME_PATTERN = /^[a-z0-9_]{4,20}$/;
export const PASSWORD_MIN_LENGTH = 8;

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

export function usernameToEmail(username: string) {
  return `${normalizeUsername(username)}@${EMAIL_DOMAIN}`;
}

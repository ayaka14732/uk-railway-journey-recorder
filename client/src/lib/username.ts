const USERNAME_RE = /^[A-Za-z][A-Za-z0-9]+$/;

export function isValidUsername(username: string): boolean {
  return USERNAME_RE.test(username);
}

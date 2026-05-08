const USERNAME_RE = /^[a-z][a-z0-9]+$/;

export function isValidUsername(username: string): boolean {
  return USERNAME_RE.test(username);
}

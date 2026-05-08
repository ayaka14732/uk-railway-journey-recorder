export const auth = {
  token: () => localStorage.getItem("auth_token") as string,
  user: () => localStorage.getItem("auth_user") as string,
  displayName: () => localStorage.getItem("auth_display") as string,
  set: (token: string, username: string, displayName: string) => {
    localStorage.setItem("auth_token", token);
    localStorage.setItem("auth_user", username);
    localStorage.setItem("auth_display", displayName);
  },
  clear: () => {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
    localStorage.removeItem("auth_display");
  },
};

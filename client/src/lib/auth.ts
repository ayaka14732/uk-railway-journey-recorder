export const auth = {
  token: () => localStorage.getItem("auth_token"),
  user: () => localStorage.getItem("auth_user"),
  set: (token: string, username: string) => {
    localStorage.setItem("auth_token", token);
    localStorage.setItem("auth_user", username);
  },
  clear: () => {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
  },
};

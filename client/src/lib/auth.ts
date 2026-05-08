export const auth = {
  token: () => localStorage.getItem("auth_token") as string,
  user: () => localStorage.getItem("auth_user") as string,
  set: (token: string, username: string) => {
    localStorage.setItem("auth_token", token);
    localStorage.setItem("auth_user", username);
  },
  clear: () => {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
  },
};

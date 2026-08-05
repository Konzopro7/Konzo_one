import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:4000/api"
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("kz_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const code = error?.response?.data?.code;

    if (
      typeof window !== "undefined" &&
      status === 402 &&
      code === "SUBSCRIPTION_REQUIRED"
    ) {
      const base = import.meta.env.BASE_URL || "/";
      const target = `${base.replace(/\/?$/, "/")}billing`;
      if (!window.location.pathname.includes("/billing")) {
        window.location.assign(target);
      }
    }

    return Promise.reject(error);
  }
);

export default api;

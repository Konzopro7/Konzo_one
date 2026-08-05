import { createContext, useContext, useEffect, useMemo, useState } from "react";
import api from "../lib/api.js";

const AuthContext = createContext(null);

const TOKEN_KEY = "kz_token";
const USER_KEY = "kz_user";

function readStoredUser() {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    localStorage.removeItem(USER_KEY);
    return null;
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState(() => readStoredUser());
  const [isBooting, setIsBooting] = useState(true);

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  }

  function storeSession(nextToken, nextUser) {
    localStorage.setItem(TOKEN_KEY, nextToken);
    localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    setToken(nextToken);
    setUser(nextUser);
  }

  async function login(payload) {
    const { data } = await api.post("/auth/login", payload);
    storeSession(data.token, data.user);
    return data;
  }

  async function register(payload) {
    const { data } = await api.post("/auth/register", payload);
    storeSession(data.token, data.user);
    return data;
  }

  function logout() {
    clearSession();
  }

  useEffect(() => {
    if (!token) {
      setIsBooting(false);
      return;
    }

    let active = true;
    api
      .get("/auth/me")
      .then(({ data }) => {
        if (!active) {
          return;
        }
        setUser(data.user);
        localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      })
      .catch(() => {
        if (active) {
          clearSession();
        }
      })
      .finally(() => {
        if (active) {
          setIsBooting(false);
        }
      });

    return () => {
      active = false;
    };
  }, [token]);

  const value = useMemo(
    () => ({
      token,
      user,
      isAuthenticated: Boolean(token),
      isAdmin: user?.role === "admin",
      isFinance: user?.role === "finance",
      isCommercial: user?.role === "commercial",
      isReadOnly: user?.role === "readonly",
      isPlatformAdmin: Boolean(user?.isPlatformAdmin),
      isBooting,
      login,
      register,
      logout
    }),
    [token, user, isBooting]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth doit être utilisé dans AuthProvider.");
  }
  return context;
}

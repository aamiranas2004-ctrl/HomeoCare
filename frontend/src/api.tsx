/**
 * Backend API client + Auth context for Agrawal Homeo Hall app.
 * Stores session_token in expo-secure-store (native) / localStorage (web).
 */
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL || "";
export const API = `${BASE_URL}/api`;

const TOKEN_KEY = "ahh_session_token";

let inMemoryToken: string | null = null;

async function getToken(): Promise<string | null> {
  if (inMemoryToken) return inMemoryToken;
  if (Platform.OS === "web") {
    try {
      inMemoryToken = window.localStorage.getItem(TOKEN_KEY);
    } catch {}
  } else {
    try {
      inMemoryToken = await SecureStore.getItemAsync(TOKEN_KEY);
    } catch {}
  }
  return inMemoryToken;
}

async function setToken(token: string | null) {
  inMemoryToken = token;
  if (Platform.OS === "web") {
    try {
      if (token) window.localStorage.setItem(TOKEN_KEY, token);
      else window.localStorage.removeItem(TOKEN_KEY);
    } catch {}
  } else {
    if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  }
}

export async function apiFetch(path: string, opts: RequestInit = {}) {
  const token = await getToken();
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...((opts.headers as Record<string, string>) || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body && !(opts.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${API}${path}`, { ...opts, headers });
  if (res.status === 401) {
    await setToken(null);
  }
  return res;
}

export async function apiJson<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, opts);
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      msg = body.detail || body.message || msg;
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}

export type User = {
  user_id: string;
  email?: string;
  phone?: string;
  name: string;
  picture?: string;
  role: "patient" | "doctor";
  uhid?: string;
  age?: number;
  gender?: string;
  address?: string;
  specialization?: string;
  qualification?: string;
};

type AuthState = {
  user: User | null;
  loading: boolean;
  refresh: () => Promise<void>;
  loginWithToken: (token: string, user: User) => Promise<void>;
  logout: () => Promise<void>;
  updateRole: (role: "patient" | "doctor", extras?: { age?: number; gender?: string }) => Promise<User>;
  getStoredToken: () => Promise<string | null>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const token = await getToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const me = await apiJson<User>("/auth/me");
      setUser(me);
    } catch {
      setUser(null);
      await setToken(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const loginWithToken = useCallback(async (token: string, u: User) => {
    await setToken(token);
    setUser(u);
    setLoading(false);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } catch {}
    await setToken(null);
    setUser(null);
  }, []);

  const updateRole = useCallback(async (role: "patient" | "doctor", extras?: any) => {
    const updated = await apiJson<User>("/auth/role", {
      method: "POST",
      body: JSON.stringify({ role, ...(extras || {}) }),
    });
    setUser(updated);
    return updated;
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, refresh, loginWithToken, logout, updateRole, getStoredToken: getToken }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth used outside AuthProvider");
  return ctx;
}

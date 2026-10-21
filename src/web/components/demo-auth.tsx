"use client";

import { createContext, useContext, useEffect, useState } from "react";

type DemoAuth = {
  email: string | null;
  learnerId: string | null;
  displayName: string | null;
  signedIn: boolean;
  mode: "mock" | "canvas" | null;
  configured: boolean;
  ready: boolean;
  signIn: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
};
const AuthContext = createContext<DemoAuth | null>(null);
async function session(method: string, email?: string) {
  const response = await fetch("/api/demo-session", {
    method,
    headers: { "Content-Type": "application/json" },
    body: email === undefined ? undefined : JSON.stringify({ email }),
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      Array.isArray(data.message)
        ? data.message.join(". ")
        : data.message || "Sign-in failed.",
    );
  return data;
}
export function DemoAuthProvider({ children }: { children: React.ReactNode }) {
  const [email, setEmail] = useState<string | null>(null);
  const [learnerId, setLearnerId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [mode, setMode] = useState<"mock" | "canvas" | null>(null);
  const [configured, setConfigured] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    // Retire the old shared-account browser state.
    try {
      localStorage.removeItem("ce-demo-email");
    } catch {}
    session("GET")
      .then((data) => {
        if (active) {
          setEmail(data.email);
          setLearnerId(data.id || null);
          setSignedIn(Boolean(data.id));
          setDisplayName(data.display_name || data.email || null);
          setMode(data.auth?.mode || null);
          setConfigured(data.auth?.configured === true);
        }
      })
      .catch(() => {
        if (active) setEmail(null);
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);
  async function signIn(value: string) {
    const user = await session("POST", value.trim().toLowerCase());
    setEmail(user.email);
    setLearnerId(user.id);
    setDisplayName(user.display_name || user.email);
    setSignedIn(Boolean(user.id));
  }
  async function signOut() {
    await session("DELETE");
    setEmail(null);
    setLearnerId(null);
    setDisplayName(null);
    setSignedIn(false);
  }
  return (
    <AuthContext.Provider
      value={{
        email,
        learnerId,
        displayName,
        signedIn,
        mode,
        configured,
        ready,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useDemoAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("DemoAuthProvider is required.");
  return auth;
}

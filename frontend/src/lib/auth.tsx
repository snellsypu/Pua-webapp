// Emergent-managed Google sign-in for the whole app.
// - AuthGate: checks /auth/me before rendering anything; signed out → SignIn.
// - AuthCallback: the redirect lands on <page>#session_id=… → exchange it for the cookie.
// - A 401 from any later request (session expired / removed from the list) → back to SignIn.
// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
import { useEffect, useRef, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { apiGet, apiPost, ApiError } from "@/lib/api";
import type { AuthUser } from "@/lib/types";
import SignIn from "@/pages/SignIn";

export const AUTH_ERROR_KEY = "pua:auth-error";

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => apiGet<AuthUser>("/auth/me"),
    retry: false,
    staleTime: 5 * 60_000,
  });
}

/** Start Google sign-in, returning to the page the user is on (wake links keep working). */
export function signIn() {
  // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
  const redirectUrl = window.location.origin + window.location.pathname + window.location.search;
  window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
}

function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center" data-testid="auth-loading">
      <Loader2 className="size-6 animate-spin text-primary" />
    </div>
  );
}

function AuthCallback() {
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const sessionId = new URLSearchParams(location.hash.slice(1)).get("session_id") ?? "";
    const back = location.pathname + location.search;
    apiPost<AuthUser>("/auth/session", { session_id: sessionId })
      .then((user) => {
        qc.setQueryData(["me"], user);
        sessionStorage.removeItem(AUTH_ERROR_KEY);
      })
      .catch((e) => {
        const detail = e instanceof ApiError && e.body && typeof e.body === "object" && "detail" in e.body
          ? String((e.body as { detail: unknown }).detail) : "Sign-in failed — please try again";
        sessionStorage.setItem(AUTH_ERROR_KEY, detail);
        qc.setQueryData(["me"], null);
        qc.invalidateQueries({ queryKey: ["me"] });
      })
      .finally(() => navigate(back, { replace: true })); // drops the #session_id fragment
  }, [location, navigate, qc]);

  return <Splash />;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const location = useLocation(); // hash read here (reactive), not window.location.hash
  const qc = useQueryClient();
  const callback = location.hash.includes("session_id=");
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => apiGet<AuthUser>("/auth/me"),
    retry: false,
    staleTime: 5 * 60_000,
    enabled: !callback, // let AuthCallback create the session first
  });

  // Any 401 elsewhere means the session ended → re-check, which shows SignIn.
  useEffect(
    () =>
      qc.getQueryCache().subscribe((ev) => {
        const err = ev.query.state.error;
        if (ev.type === "updated" && ev.query.queryKey[0] !== "me" && err instanceof ApiError && err.status === 401) {
          qc.invalidateQueries({ queryKey: ["me"] });
        }
      }),
    [qc],
  );

  if (callback) return <AuthCallback />;
  if (me.isLoading) return <Splash />;
  if (!me.data) return <SignIn />;
  return <>{children}</>;
}

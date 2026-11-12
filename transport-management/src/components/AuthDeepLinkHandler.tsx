import { useEffect } from "react";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { useNavigate } from "react-router-dom";
import supabase from "../supabase/supabase";

const callbackScheme = "br.com.gestaodefrota.app:";

export default function AuthDeepLinkHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let disposed = false;
    const handledUrls = new Set<string>();
    let listener: { remove: () => Promise<void> } | undefined;

    const handleUrl = async (url: string) => {
      if (disposed || handledUrls.has(url)) return;
      handledUrls.add(url);

      let callback: URL;
      try { callback = new URL(url); } catch { return; }
      if (callback.protocol !== callbackScheme || callback.hostname !== "auth" || callback.pathname !== "/callback") return;

      const hash = new URLSearchParams(callback.hash.replace(/^#/, ""));
      const flow = callback.searchParams.get("flow");
      const code = callback.searchParams.get("code");
      const errorDescription = callback.searchParams.get("error_description") ?? hash.get("error_description");

      if (errorDescription) {
        sessionStorage.setItem("auth-deep-link-error", errorDescription);
      } else if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) sessionStorage.setItem("auth-deep-link-error", "O link expirou ou já foi usado. Solicite um novo.");
      } else {
        const access_token = hash.get("access_token");
        const refresh_token = hash.get("refresh_token");
        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({ access_token, refresh_token });
          if (error) sessionStorage.setItem("auth-deep-link-error", "O link expirou ou já foi usado. Solicite um novo.");
        }
      }

      if (flow === "recovery") sessionStorage.setItem("auth-password-recovery", "true");
      navigate(flow === "recovery" ? "/recovery" : "/", { replace: true });
    };

    const start = async () => {
      listener = await App.addListener("appUrlOpen", ({ url }) => { void handleUrl(url); });
      const launch = await App.getLaunchUrl();
      if (launch?.url) await handleUrl(launch.url);
    };
    void start();

    return () => {
      disposed = true;
      void listener?.remove();
    };
  }, [navigate]);

  return null;
}

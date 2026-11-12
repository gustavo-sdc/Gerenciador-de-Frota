import { Component, useEffect, type ReactNode } from "react";
import { Capacitor } from "@capacitor/core";
import { useContext } from "react";
import { AuthContext } from "../hooks/authContextValue";
import { captureAppError } from "../lib/adminSupport";

export function AppErrorReporter() {
  const { isAuthenticated } = useContext(AuthContext);
  useEffect(() => {
    if (!isAuthenticated) return;
    const platform = Capacitor.getPlatform();
    const onError = (event: ErrorEvent) => {
      void captureAppError(event.error ?? new Error(event.message || "Erro não identificado"), platform);
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      void captureAppError(event.reason, platform);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, [isAuthenticated]);
  return null;
}

interface BoundaryProps { children: ReactNode }
interface BoundaryState { failed: boolean }
export class AppErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  componentDidCatch(error: Error) {
    void captureAppError(error, Capacitor.getPlatform());
  }

  render() {
    if (this.state.failed) return <main className="grid min-h-screen place-items-center bg-[#f7f8f7] p-5 text-slate-900"><section className="max-w-lg rounded-2xl border border-slate-200 bg-white p-7 text-center shadow-sm"><h1 className="text-2xl font-bold">O aplicativo encontrou um erro</h1><p className="mt-3 text-base text-slate-700">O erro foi registrado. Recarregue a página para continuar.</p><button type="button" onClick={() => window.location.reload()} className="mt-5 min-h-14 rounded-xl bg-slate-800 px-6 text-base font-semibold text-white">Recarregar aplicativo</button></section></main>;
    return this.props.children;
  }
}

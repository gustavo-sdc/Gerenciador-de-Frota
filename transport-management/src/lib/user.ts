import supabase from "../supabase/supabase";
import { isValidCnpj, isValidCpf, normalizeDocument } from "./cnpj";
import { Capacitor } from "@capacitor/core";

const nativeAuthCallback = "br.com.gestaodefrota.app://auth/callback";
function authRedirect(flow: "signup" | "recovery") {
  if (Capacitor.isNativePlatform()) return `${nativeAuthCallback}?flow=${flow}`;
  const path = flow === "recovery" ? "/recovery" : "/";
  return new URL(path, window.location.origin).toString();
}

export interface NewUser {
  email: string;
  password: string;
}

export interface TenantDetails {
  document_type: "cpf" | "cnpj";
  document_number: string;
  nome_empresa: string;
}

export const registerUser = async (user: NewUser) => {
  const email = user.email.trim().toLowerCase();
  if (!email) throw new Error("Informe um e-mail válido.");
  if (user.password.length < 10) throw new Error("A senha precisa ter pelo menos 10 caracteres.");

  const { data, error } = await supabase.auth.signUp({
    email,
    password: user.password,
    options: { emailRedirectTo: authRedirect("signup") },
  });
  if (error) {
    if (error.code === "user_already_exists") throw new Error("Não foi possível criar a conta. Confira o e-mail ou faça login.");
    throw new Error("Não foi possível criar a conta. Confira os dados e tente novamente.");
  }
  if (!data.user) throw new Error("Não foi possível criar a conta. Tente novamente.");
  return { user: data.user, hasSession: Boolean(data.session) };
};

export const createTenant = async (details: TenantDetails) => {
  const document = normalizeDocument(details.document_number, details.document_type);
  const isValid = details.document_type === "cpf" ? isValidCpf(document) : isValidCnpj(document);
  if (!isValid) throw new Error(details.document_type === "cpf" ? "Informe um CPF válido." : "Informe um CNPJ válido.");
  if (!details.nome_empresa.trim()) throw new Error("Informe o nome da empresa ou responsável.");

  const { data, error } = await supabase.functions.invoke("create-tenant", {
    body: { document_type: details.document_type, document_number: document, nome_empresa: details.nome_empresa.trim() },
  });
  if (error || !data?.tenant_id) {
    throw new Error(typeof data?.error === "string" ? data.error : "Não foi possível vincular a empresa a esta conta.");
  }
  return data as { tenant_id: string; role: "admin" | "gestor" | "motorista" };
};

export const login = async (user: NewUser) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: user.email.trim().toLowerCase(),
    password: user.password,
  });
  if (error) {
    if (error.code === "email_not_confirmed") throw new Error("Confirme seu e-mail antes de entrar.");
    throw new Error("E-mail ou senha inválidos.");
  }
  return data;
};

export const requestPasswordReset = async (email: string) => {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: authRedirect("recovery"),
  });
  if (error) throw new Error("Não foi possível solicitar a recuperação. Confira o e-mail e tente novamente.");
};

export const updatePassword = async (password: string) => {
  if (password.length < 10) throw new Error("A senha precisa ter pelo menos 10 caracteres.");
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new Error("Não foi possível atualizar a senha. Solicite um novo link de recuperação.");
};

export const signOut = async () => {
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) throw new Error("Não foi possível sair. Tente novamente.");
};

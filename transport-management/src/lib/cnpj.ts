export function normalizeCnpj(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 14);
}

export function isValidCnpj(value: string) {
  const cnpj = normalizeCnpj(value);
  if (!/^[A-Z0-9]{12}\d{2}$/.test(cnpj) || /^([A-Z0-9])\1{13}$/.test(cnpj)) return false;

  const calculateDigit = (base: string, weights: number[]) => {
    const sum = [...base].reduce((total, char, index) => total + (char.charCodeAt(0) - 48) * weights[index], 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const first = calculateDigit(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = calculateDigit(`${cnpj.slice(0, 12)}${first}`, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return cnpj.endsWith(`${first}${second}`);
}

export function normalizeCpf(value: string) {
  return value.replace(/\D/g, "").slice(0, 11);
}

export function isValidCpf(value: string) {
  const cpf = normalizeCpf(value);
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (base: string, firstWeight: number) => {
    const sum = [...base].reduce((total, char, index) => total + Number(char) * (firstWeight - index), 0);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  const first = digit(cpf.slice(0, 9), 10);
  const second = digit(cpf.slice(0, 9) + first, 11);
  return cpf.endsWith(`${first}${second}`);
}

export function normalizeDocument(value: string, type: "cpf" | "cnpj") {
  return type === "cpf" ? normalizeCpf(value) : normalizeCnpj(value);
}

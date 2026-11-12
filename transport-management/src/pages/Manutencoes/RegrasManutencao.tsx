import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Download, FileSpreadsheet, Pencil, Plus, Save, Trash2, Upload } from "lucide-react";
import Header from "../../components/Header/Header";
import { deleteMaintenanceQuestion, getDeveloperRules, importMaintenanceCategoryRules, saveMaintenanceCategoryRule, saveMaintenanceQuestion, saveMaintenanceSystem } from "../../lib/maintenanceRules";
import { vehicleCategoryLabels, type MaintenanceCategorySystemRule, type MaintenanceRuleQuestion, type MaintenanceSystemRule, type VehicleCategory } from "../../lib/controller";

type SystemForm = {
  system_code: string; name: string; base_life_km: string; replacement_cost: string;
  formula_adjusted_life: string; formula_cpk: string; formula_route_cost: string; basis_note: string; is_active: boolean;
};
type QuestionForm = {
  id?: string; system_code: string; answer_key: string; question: string; answer_type: "select" | "number";
  options_text: string; required: boolean; display_order: string; is_active: boolean;
};
type CategoryRuleForm = {
  system_code: string; vehicle_category: VehicleCategory; base_life_km: string; replacement_cost: string;
  formula_adjusted_life: string; formula_cpk: string; formula_route_cost: string; basis_note: string; is_active: boolean;
};
const blankSystem = (): SystemForm => ({
  system_code: "", name: "", base_life_km: "", replacement_cost: "",
  formula_adjusted_life: "base_life_km / factor_product",
  formula_cpk: "replacement_cost / adjusted_life_km",
  formula_route_cost: "cpk * route_km", basis_note: "", is_active: true,
});
const blankQuestion = (): QuestionForm => ({
  system_code: "", answer_key: "", question: "", answer_type: "select",
  options_text: "", required: true, display_order: "0", is_active: true,
});
const blankCategoryRule = (system_code = "", vehicle_category: VehicleCategory = "moto"): CategoryRuleForm => ({
  system_code, vehicle_category, base_life_km: "", replacement_cost: "",
  formula_adjusted_life: "base_life_km / factor_product", formula_cpk: "replacement_cost / adjusted_life_km",
  formula_route_cost: "cpk * route_km", basis_note: "", is_active: true,
});
const money = (value: number | null | undefined) => value == null ? "Não informado" : value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function optionsToText(question: MaintenanceRuleQuestion) {
  return question.options.map((option) => question.answer_type === "number"
    ? `${option.min ?? ""}:${option.max ?? ""}|${option.label}|${option.multiplier}`
    : `${option.value ?? ""}|${option.label}|${option.multiplier}`).join("\n");
}

function parseOptions(text: string, answerType: "select" | "number") {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const [value, label, rawMultiplier] = line.split("|").map((part) => part.trim());
    const multiplier = Number(rawMultiplier);
    if (answerType === "number") {
      const [rawMin, rawMax] = (value ?? "").split(":");
      return { min: Number(rawMin), max: Number(rawMax), label: label ?? "", multiplier };
    }
    return { value: value ?? "", label: label ?? "", multiplier };
  });
}

function FormulaVariablesHelp({ systemCode, questions }: { systemCode: string; questions: MaintenanceRuleQuestion[] }) {
  const systemQuestions = questions.filter((question) => question.system_code === systemCode && question.is_active);
  return <details className="rounded-lg border border-blue-100 bg-white p-3 text-sm sm:col-span-2">
    <summary className="cursor-pointer font-semibold text-blue-800">O que significam os nomes das fórmulas?</summary>
    <div className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
      <p><code className="font-semibold">base_life_km</code> — vida útil base desta categoria, em km.</p>
      <p><code className="font-semibold">factor_product</code> — produto dos multiplicadores das respostas deste sistema.</p>
      <p><code className="font-semibold">replacement_cost</code> — custo de troca preenchido acima, em reais.</p>
      <p><code className="font-semibold">route_km</code> — distância da rota informada na previsão.</p>
      <p><code className="font-semibold">adjusted_life_km</code> — resultado da fórmula de vida ajustada.</p>
      <p><code className="font-semibold">cpk</code> — resultado da fórmula de custo por quilômetro.</p>
      {systemQuestions.map((question) => <p key={question.id}><code className="font-semibold">{question.answer_key}_multiplier</code> — multiplicador da resposta: {question.question}</p>)}
    </div>
    <p className="mt-3 text-xs text-slate-500">Use os nomes exatamente como aparecem. Operadores disponíveis: +, −, ×, ÷ e parênteses. Exemplo: <code>base_life_km / factor_product</code>.</p>
  </details>;
}

function CategoryRuleInlineRow({ rule, systemName, questions, onSaved }: {
  rule: MaintenanceCategorySystemRule;
  systemName: string;
  questions: MaintenanceRuleQuestion[];
  onSaved: (rule: MaintenanceCategorySystemRule) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<CategoryRuleForm>(() => ({
    system_code: rule.system_code, vehicle_category: rule.vehicle_category,
    base_life_km: rule.base_life_km == null ? "" : String(rule.base_life_km),
    replacement_cost: rule.replacement_cost == null ? "" : String(rule.replacement_cost),
    formula_adjusted_life: rule.formula_adjusted_life, formula_cpk: rule.formula_cpk,
    formula_route_cost: rule.formula_route_cost, basis_note: rule.basis_note ?? "", is_active: rule.is_active,
  }));
  const beginEdit = () => {
    setForm({
      system_code: rule.system_code, vehicle_category: rule.vehicle_category,
      base_life_km: rule.base_life_km == null ? "" : String(rule.base_life_km),
      replacement_cost: rule.replacement_cost == null ? "" : String(rule.replacement_cost),
      formula_adjusted_life: rule.formula_adjusted_life, formula_cpk: rule.formula_cpk,
      formula_route_cost: rule.formula_route_cost, basis_note: rule.basis_note ?? "", is_active: rule.is_active,
    });
    setError(""); setEditing(true);
  };
  const save = async () => {
    setSaving(true); setError("");
    const result = await saveMaintenanceCategoryRule({
      ...form, base_life_km: form.base_life_km ? Number(form.base_life_km) : null,
      replacement_cost: form.replacement_cost ? Number(form.replacement_cost) : null,
    });
    setSaving(false);
    if (result.error || !result.data) { setError(result.error?.message ?? "Não foi possível salvar a regra."); return; }
    onSaved(result.data); setEditing(false);
  };
  const inputClass = "h-9 w-full min-w-24 rounded-lg border border-slate-200 bg-white px-2 text-sm";
  return <>
    <tr className="align-top">
      <td className="px-3 py-3 font-medium">{vehicleCategoryLabels[rule.vehicle_category]}</td>
      <td className="px-3 py-3">{systemName}</td>
      <td className="px-3 py-2">{editing ? <input aria-label="Vida útil base em quilômetros" type="number" min="1" step="1" value={form.base_life_km} onChange={event=>setForm({...form,base_life_km:event.target.value})} className={inputClass}/> : <>{rule.base_life_km?.toLocaleString("pt-BR")??"—"} km</>}</td>
      <td className="px-3 py-2">{editing ? <input aria-label="Custo de troca em reais" type="number" min="0" step="0.01" value={form.replacement_cost} onChange={event=>setForm({...form,replacement_cost:event.target.value})} className={inputClass}/> : money(rule.replacement_cost)}</td>
      <td className="px-3 py-3">{editing ? <label className="inline-flex items-center gap-2"><input type="checkbox" checked={form.is_active} onChange={event=>setForm({...form,is_active:event.target.checked})}/>Ativa</label> : rule.is_active?"Ativa":"Pausada"}</td>
      <td className="whitespace-nowrap px-3 py-2">{editing ? <div className="flex gap-2"><button type="button" onClick={()=>void save()} disabled={saving} className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-medium text-white disabled:opacity-50">{saving?"Salvando…":"Salvar"}</button><button type="button" onClick={()=>{setEditing(false);setError("")}} disabled={saving} className="rounded-lg border border-slate-200 px-3 py-2 text-xs">Cancelar</button></div> : <button type="button" onClick={beginEdit} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700">Editar</button>}</td>
    </tr>
    {editing && <tr><td colSpan={6} className="border-t border-blue-100 bg-blue-50/40 px-4 py-4"><div className="grid gap-3 sm:grid-cols-2"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500 sm:col-span-2">Regras adicionais — {vehicleCategoryLabels[rule.vehicle_category]} / {systemName}</p><label className="flex flex-col gap-1 text-xs font-medium text-slate-700 sm:col-span-2">Fórmula da vida ajustada<input value={form.formula_adjusted_life} onChange={event=>setForm({...form,formula_adjusted_life:event.target.value})} className={`${inputClass} font-mono`}/></label><label className="flex flex-col gap-1 text-xs font-medium text-slate-700">Fórmula do CPK<input value={form.formula_cpk} onChange={event=>setForm({...form,formula_cpk:event.target.value})} className={`${inputClass} font-mono`}/></label><label className="flex flex-col gap-1 text-xs font-medium text-slate-700">Fórmula do custo da rota<input value={form.formula_route_cost} onChange={event=>setForm({...form,formula_route_cost:event.target.value})} className={`${inputClass} font-mono`}/></label><FormulaVariablesHelp systemCode={rule.system_code} questions={questions}/><label className="flex flex-col gap-1 text-xs font-medium text-slate-700 sm:col-span-2">Fonte / observação<textarea value={form.basis_note} onChange={event=>setForm({...form,basis_note:event.target.value})} maxLength={500} rows={2} className="rounded-lg border border-slate-200 bg-white p-3 text-sm"/></label>{error&&<p role="alert" className="text-sm text-rose-700 sm:col-span-2">{error}</p>}</div></td></tr>}
  </>;
}

export default function RegrasManutencao() {
  const [systems, setSystems] = useState<MaintenanceSystemRule[]>([]);
  const [questions, setQuestions] = useState<MaintenanceRuleQuestion[]>([]);
  const [categoryRules, setCategoryRules] = useState<MaintenanceCategorySystemRule[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<VehicleCategory | "all">("moto");
  const importFileRef = useRef<HTMLInputElement>(null);
  const [systemForm, setSystemForm] = useState<SystemForm>(blankSystem);
  const [categoryRuleForm, setCategoryRuleForm] = useState<CategoryRuleForm>(blankCategoryRule);
  const [questionForm, setQuestionForm] = useState<QuestionForm>(blankQuestion);
  const [systemEditorOpen, setSystemEditorOpen] = useState(false);
  const [categoryRuleEditorOpen, setCategoryRuleEditorOpen] = useState(false);
  const [questionEditorOpen, setQuestionEditorOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const reload = useCallback(async () => {
    setLoading(true); setError("");
    const result = await getDeveloperRules();
    setLoading(false);
    if (result.error) { setError(result.error.message); return; }
    setSystems(result.data?.systems ?? []);
    setCategoryRules(result.data?.category_rules ?? []);
    setQuestions(result.data?.questions ?? []);
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  const systemNames = useMemo(() => new Map(systems.map((item) => [item.system_code, item.name])), [systems]);
  const filteredCategoryRules = useMemo(() => categoryFilter === "all" ? categoryRules : categoryRules.filter((rule) => rule.vehicle_category === categoryFilter), [categoryRules, categoryFilter]);

  async function submitSystem(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const result = await saveMaintenanceSystem({
      system_code: systemForm.system_code.trim().toLowerCase(), name: systemForm.name.trim(),
      base_life_km: systemForm.base_life_km ? Number(systemForm.base_life_km) : null,
      replacement_cost: systemForm.replacement_cost ? Number(systemForm.replacement_cost) : null,
      formula_adjusted_life: systemForm.formula_adjusted_life,
      formula_cpk: systemForm.formula_cpk, formula_route_cost: systemForm.formula_route_cost,
      basis_note: systemForm.basis_note, is_active: systemForm.is_active,
    });
    setBusy(false);
    if (result.error) { setError(result.error.message); return; }
    setNotice("Sistema e fórmulas salvos para todos os usuários."); setSystemEditorOpen(false); await reload();
  }

  async function submitCategoryRule(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const result = await saveMaintenanceCategoryRule({
      ...categoryRuleForm,
      base_life_km: categoryRuleForm.base_life_km ? Number(categoryRuleForm.base_life_km) : null,
      replacement_cost: categoryRuleForm.replacement_cost ? Number(categoryRuleForm.replacement_cost) : null,
    });
    setBusy(false);
    if (result.error) { setError(result.error.message); return; }
    setNotice("Regra de CPK salva para esta categoria em todos os tenants."); setCategoryRuleEditorOpen(false); await reload();
  }

  async function submitQuestion(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const result = await saveMaintenanceQuestion({
      ...(questionForm.id ? { id: questionForm.id } : {}),
      system_code: questionForm.system_code, answer_key: questionForm.answer_key.trim().toLowerCase(),
      question: questionForm.question.trim(), answer_type: questionForm.answer_type,
      options: parseOptions(questionForm.options_text, questionForm.answer_type),
      required: questionForm.required, display_order: Number(questionForm.display_order), is_active: questionForm.is_active,
    });
    setBusy(false);
    if (result.error) { setError(result.error.message); return; }
    setNotice("Pergunta salva para todos os usuários."); setQuestionEditorOpen(false); setQuestionForm(blankQuestion()); await reload();
  }

  async function removeQuestion(question: MaintenanceRuleQuestion) {
    if (!window.confirm(`Excluir a pergunta “${question.question}”?`)) return;
    setBusy(true); setError("");
    const result = await deleteMaintenanceQuestion(question.id);
    setBusy(false);
    if (result.error) { setError(result.error.message); return; }
    setNotice("Pergunta removida."); await reload();
  }

  function editSystem(system: MaintenanceSystemRule) {
    setSystemForm({
      system_code: system.system_code, name: system.name,
      base_life_km: system.base_life_km == null ? "" : String(system.base_life_km),
      replacement_cost: system.replacement_cost == null ? "" : String(system.replacement_cost),
      formula_adjusted_life: system.formula_adjusted_life, formula_cpk: system.formula_cpk,
      formula_route_cost: system.formula_route_cost, basis_note: system.basis_note ?? "", is_active: system.is_active,
    });
    setSystemEditorOpen(true);
  }

  function editQuestion(question: MaintenanceRuleQuestion) {
    setQuestionForm({ ...question, options_text: optionsToText(question), display_order: String(question.display_order) });
    setQuestionEditorOpen(true);
  }

  async function exportCategoryRules(format: "csv" | "xlsx") {
    const headers = ["vehicle_category", "system_code", "base_life_km", "replacement_cost", "formula_adjusted_life", "formula_cpk", "formula_route_cost", "basis_note", "is_active"];
    const values = filteredCategoryRules.map((rule) => [rule.vehicle_category, rule.system_code, rule.base_life_km ?? "", rule.replacement_cost ?? "", rule.formula_adjusted_life, rule.formula_cpk, rule.formula_route_cost, rule.basis_note ?? "", rule.is_active]);
    const textColumns = new Set([0, 1, 4, 5, 6, 7]);
    const safeRows = values.map((row) => row.map((value, index) => {
      if (!textColumns.has(index)) return value;
      const text = String(value ?? "");
      return /^[=+\-@]/.test(text) ? `'${text}` : text;
    }));
    const name = categoryFilter === "all" ? "todas" : categoryFilter;
    if (format === "xlsx") {
      const XLSX = await import("xlsx");
      const workbook = XLSX.utils.book_new();
      const sheet = XLSX.utils.aoa_to_sheet([headers, ...safeRows]);
      XLSX.utils.book_append_sheet(workbook, sheet, "Regras CPK");
      XLSX.writeFile(workbook, `regras-cpk-${name}.xlsx`);
      return;
    }
    const csv = [headers, ...safeRows].map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
    link.download = `regras-cpk-${name}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  async function importCategoryRules(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(""); setNotice("");
    if (file.size > 5 * 1024 * 1024) { setError("O arquivo deve ter até 5 MB."); return; }
    if (!/\.(csv|xlsx|xls)$/i.test(file.name)) { setError("Use um arquivo CSV, XLSX ou XLS."); return; }
    setBusy(true);
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", raw: false, bookVBA: false });
      const sheetName = workbook.SheetNames[0];
      const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
      if (!sheet) throw new Error("Não encontrei uma planilha com dados no arquivo.");
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
      if (!rows.length) throw new Error("A planilha está vazia.");
      if (rows.length > 500) throw new Error("Importe até 500 regras por arquivo.");
      const normalizeHeader = (value: string) => value.replace(/^\uFEFF/, "").trim().toLowerCase();
      const normalizedRows = rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [normalizeHeader(key), value])));
      const requiredHeaders = ["vehicle_category", "system_code", "base_life_km", "replacement_cost", "formula_adjusted_life", "formula_cpk", "formula_route_cost", "basis_note", "is_active"];
      const absent = requiredHeaders.filter((header) => !Object.hasOwn(normalizedRows[0], header));
      if (absent.length) throw new Error(`Faltam colunas: ${absent.join(", ")}. Exporte um arquivo-modelo antes de importar.`);
      const categoryByLabel = new Map<string, VehicleCategory>();
      Object.entries(vehicleCategoryLabels).forEach(([key, label]) => { categoryByLabel.set(key, key as VehicleCategory); categoryByLabel.set(label.toLowerCase(), key as VehicleCategory); });
      const systemCodes = new Set(systems.map((system) => system.system_code));
      const seen = new Set<string>();
      const errors: string[] = [];
      const parsed: Partial<MaintenanceCategorySystemRule>[] = [];
      const decimal = (value: unknown): number | null | undefined => {
        if (value === null || value === undefined || String(value).trim() === "") return null;
        if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
        let text = String(value).trim().replace(/\s/g, "");
        if (text.includes(",") && text.includes(".")) text = text.lastIndexOf(",") > text.lastIndexOf(".") ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
        else if (text.includes(",")) text = text.replace(",", ".");
        const number = Number(text);
        return Number.isFinite(number) ? number : undefined;
      };
      const textValue = (value: unknown) => String(value ?? "").trim().replace(/^'(?=[=+\-@])/, "");
      normalizedRows.forEach((row, index) => {
        const line = index + 2;
        const categoryCell = textValue(row.vehicle_category).toLowerCase();
        const vehicle_category = categoryByLabel.get(categoryCell);
        const system_code = textValue(row.system_code).toLowerCase();
        const base_life_km = decimal(row.base_life_km);
        const replacement_cost = decimal(row.replacement_cost);
        const formula_adjusted_life = textValue(row.formula_adjusted_life);
        const formula_cpk = textValue(row.formula_cpk);
        const formula_route_cost = textValue(row.formula_route_cost);
        const activeText = textValue(row.is_active).toLowerCase();
        const is_active = ["true", "1", "sim", "yes", "ativo"].includes(activeText) ? true : ["false", "0", "não", "nao", "no", "inativo"].includes(activeText) ? false : activeText === "" ? true : undefined;
        if (!vehicle_category || !systemCodes.has(system_code)) errors.push(`Linha ${line}: categoria ou código do sistema inválido.`);
        if (base_life_km === undefined || (base_life_km !== null && base_life_km <= 0) || replacement_cost === undefined || (replacement_cost !== null && replacement_cost < 0)) errors.push(`Linha ${line}: vida útil ou custo inválido.`);
        if (!formula_adjusted_life || !formula_cpk || !formula_route_cost || [formula_adjusted_life, formula_cpk, formula_route_cost].some((formula) => formula.length > 240)) errors.push(`Linha ${line}: preencha as fórmulas (até 240 caracteres).`);
        if (is_active === undefined) errors.push(`Linha ${line}: is_active deve ser true ou false.`);
        if (textValue(row.basis_note).length > 500) errors.push(`Linha ${line}: a observação pode ter até 500 caracteres.`);
        const key = `${system_code}:${vehicle_category}`;
        if (seen.has(key)) errors.push(`Linha ${line}: sistema e categoria duplicados.`);
        seen.add(key);
        if (vehicle_category && systemCodes.has(system_code) && base_life_km !== undefined && replacement_cost !== undefined && formula_adjusted_life && formula_cpk && formula_route_cost && is_active !== undefined) {
          parsed.push({ system_code, vehicle_category, base_life_km, replacement_cost, formula_adjusted_life, formula_cpk, formula_route_cost, basis_note: textValue(row.basis_note), is_active });
        }
      });
      if (errors.length) throw new Error(`Arquivo inválido: ${errors.slice(0, 6).join(" ")}${errors.length > 6 ? ` (+${errors.length - 6} erros)` : ""}`);
      const categories = [...new Set(parsed.map((rule) => vehicleCategoryLabels[rule.vehicle_category!]))].join(", ");
      if (!window.confirm(`Importar ${parsed.length} regras para ${categories}? As regras correspondentes serão atualizadas para todos os usuários.`)) return;
      const result = await importMaintenanceCategoryRules(parsed);
      if (result.error) throw result.error;
      setNotice(`${result.data?.count ?? parsed.length} regras importadas.`);
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível importar o arquivo.");
    } finally { setBusy(false); }
  }

  return <div className="min-h-screen bg-slate-50"><Header/><main className="px-4 pb-24 pt-6 md:ml-64 md:px-5 md:pb-10">
    <div className="mx-auto max-w-none">
      <Link to="/manutencoes" className="inline-flex items-center gap-2 text-sm font-medium text-blue-700"><ArrowLeft size={17}/> Manutenções</Link>
      <div className="mb-6 mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-medium text-blue-700">Administração global</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">Regras de manutenção</h1><p className="mt-2 max-w-3xl text-sm text-slate-600">Perguntas, multiplicadores e fórmulas abaixo são aplicados a todos os tenants. Use referências verificadas e registre a origem da regra.</p></div><button onClick={()=>{setSystemForm(blankSystem());setSystemEditorOpen(true)}} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 font-medium text-white"><Plus size={17}/> Novo sistema</button></div>
      {notice && <p role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      {error && <p role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      {loading ? <p className="rounded-xl bg-white p-5 text-sm text-slate-600">Carregando regras…</p> : error.includes("desenvolvedores") ? <p className="rounded-xl bg-white p-5 text-sm text-slate-600">Esta área é exclusiva da equipe de desenvolvimento.</p> : <>
        <section className="mb-7 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><h2 className="font-semibold text-slate-900">Sistemas e fórmulas</h2><p className="mt-1 text-sm text-slate-500">A fórmula aceita números, parênteses e +, −, ×, ÷. Variáveis: base_life_km, factor_product, replacement_cost, route_km, adjusted_life_km, cpk e cada chave de resposta seguida de _multiplier.</p><div className="mt-4 overflow-x-auto rounded-xl border border-slate-200"><table className="min-w-[800px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-3">Sistema</th><th className="px-3 py-3">Vida base</th><th className="px-3 py-3">Custo de troca</th><th className="px-3 py-3">Estado</th><th className="px-3 py-3">Fórmula custo/rota</th><th className="px-3 py-3">Ação</th></tr></thead><tbody className="divide-y divide-slate-100">{systems.map(system=><tr key={system.system_code}><td className="px-3 py-3 font-medium text-slate-900">{system.name}<span className="ml-2 text-xs text-slate-400">{system.system_code}</span></td><td className="px-3 py-3">{system.base_life_km?.toLocaleString("pt-BR") ?? "—"} km</td><td className="px-3 py-3">{money(system.replacement_cost)}</td><td className="px-3 py-3">{system.is_active?"Ativo":"Pausado"}</td><td className="px-3 py-3 font-mono text-xs">{system.formula_route_cost}</td><td className="px-3 py-3"><button onClick={()=>editSystem(system)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700">Editar</button></td></tr>)}</tbody></table></div>
          {systemEditorOpen && <form onSubmit={event=>void submitSystem(event)} className="mt-5 grid gap-3 rounded-xl border border-blue-100 bg-blue-50/40 p-4 sm:grid-cols-2"><h3 className="font-semibold sm:col-span-2">{systems.some(item=>item.system_code===systemForm.system_code)?"Editar sistema":"Novo sistema"}</h3><label className="flex flex-col gap-1 text-sm">Código único<input required pattern="[a-z][a-z0-9_]{1,49}" disabled={systems.some(item=>item.system_code===systemForm.system_code)} value={systemForm.system_code} onChange={event=>setSystemForm({...systemForm,system_code:event.target.value})} placeholder="ex.: suspensao" className="h-10 rounded-lg border border-slate-200 bg-white px-3"/></label><label className="flex flex-col gap-1 text-sm">Nome<input required minLength={2} maxLength={100} value={systemForm.name} onChange={event=>setSystemForm({...systemForm,name:event.target.value})} className="h-10 rounded-lg border border-slate-200 bg-white px-3"/></label><label className="flex flex-col gap-1 text-sm">Vida útil base (km)<input type="number" min="1" value={systemForm.base_life_km} onChange={event=>setSystemForm({...systemForm,base_life_km:event.target.value})} className="h-10 rounded-lg border border-slate-200 bg-white px-3"/></label><label className="flex flex-col gap-1 text-sm">Custo da troca (R$)<input type="number" min="0" step="0.01" value={systemForm.replacement_cost} onChange={event=>setSystemForm({...systemForm,replacement_cost:event.target.value})} className="h-10 rounded-lg border border-slate-200 bg-white px-3"/></label><label className="flex flex-col gap-1 text-sm sm:col-span-2">Fórmula da vida ajustada<input required value={systemForm.formula_adjusted_life} onChange={event=>setSystemForm({...systemForm,formula_adjusted_life:event.target.value})} className="h-10 rounded-lg border border-slate-200 bg-white px-3 font-mono text-xs"/></label><label className="flex flex-col gap-1 text-sm">Fórmula do CPK<input required value={systemForm.formula_cpk} onChange={event=>setSystemForm({...systemForm,formula_cpk:event.target.value})} className="h-10 rounded-lg border border-slate-200 bg-white px-3 font-mono text-xs"/></label><label className="flex flex-col gap-1 text-sm">Fórmula do custo da rota<input required value={systemForm.formula_route_cost} onChange={event=>setSystemForm({...systemForm,formula_route_cost:event.target.value})} className="h-10 rounded-lg border border-slate-200 bg-white px-3 font-mono text-xs"/></label><label className="flex flex-col gap-1 text-sm sm:col-span-2">Origem / observação da regra<textarea value={systemForm.basis_note} onChange={event=>setSystemForm({...systemForm,basis_note:event.target.value})} maxLength={500} rows={2} className="rounded-lg border border-slate-200 bg-white p-3"/></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={systemForm.is_active} onChange={event=>setSystemForm({...systemForm,is_active:event.target.checked})}/> Regra ativa para os tenants</label><div className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={()=>setSystemEditorOpen(false)} className="h-10 rounded-lg border border-slate-200 px-4 text-sm">Cancelar</button><button disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-700 px-4 text-sm font-medium text-white"><Save size={16}/> Salvar</button></div></form>}
        </section>

        <section className="mb-7 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold text-slate-900">CPK por categoria de veículo</h2><p className="mt-1 max-w-3xl text-sm text-slate-500">Cada categoria tem vida útil, custo de troca e fórmulas próprias. Importe CSV ou Excel; o arquivo pode ter regras de uma ou mais categorias.</p></div><button onClick={()=>{setCategoryRuleForm(blankCategoryRule(systems[0]?.system_code??"",categoryFilter==="all"?"moto":categoryFilter));setCategoryRuleEditorOpen(true)}} disabled={!systems.length} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 text-sm font-medium text-white disabled:opacity-40"><Plus size={16}/> Nova regra de categoria</button></div><div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><label className="flex max-w-sm flex-1 flex-col gap-1.5 text-sm font-medium text-slate-700">Filtrar por categoria<select value={categoryFilter} onChange={event=>setCategoryFilter(event.target.value as VehicleCategory|"all")} className="h-10 rounded-lg border border-slate-200 bg-white px-3"><option value="all">Todas as categorias</option>{Object.entries(vehicleCategoryLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><div className="flex flex-wrap gap-2"><button type="button" onClick={()=>void exportCategoryRules("csv")} disabled={!filteredCategoryRules.length} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 disabled:opacity-40"><Download size={16}/> Exportar CSV</button><button type="button" onClick={()=>void exportCategoryRules("xlsx")} disabled={!filteredCategoryRules.length} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 disabled:opacity-40"><FileSpreadsheet size={16}/> Exportar Excel</button><input ref={importFileRef} type="file" accept=".csv,.xlsx,.xls" onChange={event=>void importCategoryRules(event)} className="hidden"/><button type="button" onClick={()=>importFileRef.current?.click()} disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-900 px-3 text-sm font-medium text-white disabled:opacity-40"><Upload size={16}/> Importar arquivo</button></div></div><p className="mt-2 text-xs text-slate-500">Exporta a categoria filtrada ou todas. A importação aceita até 500 linhas e atualiza regras globais para todos os tenants.</p><div className="mt-3 overflow-x-auto rounded-xl border border-slate-200"><table className="min-w-[760px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-3">Categoria</th><th className="px-3 py-3">Sistema</th><th className="px-3 py-3">Vida base</th><th className="px-3 py-3">Custo de troca</th><th className="px-3 py-3">Estado</th><th className="px-3 py-3">Ação</th></tr></thead><tbody className="divide-y divide-slate-100">{filteredCategoryRules.map(rule=><CategoryRuleInlineRow key={`${rule.vehicle_category}-${rule.system_code}`} rule={rule} systemName={systemNames.get(rule.system_code)??rule.system_code} questions={questions} onSaved={updated=>{setCategoryRules(current=>current.map(item=>item.system_code===updated.system_code&&item.vehicle_category===updated.vehicle_category?updated:item));setNotice("Regra de CPK salva para esta categoria em todos os tenants.")}} />)}</tbody></table></div>
          {categoryRuleEditorOpen && <form onSubmit={event=>void submitCategoryRule(event)} className="mt-5 grid gap-3 rounded-xl border border-blue-100 bg-blue-50/40 p-4 sm:grid-cols-2"><h3 className="font-semibold sm:col-span-2">Configurar CPK por categoria</h3><label className="flex flex-col gap-1 text-sm">Sistema<select required value={categoryRuleForm.system_code} onChange={event=>setCategoryRuleForm({...categoryRuleForm,system_code:event.target.value})} className="h-10 rounded-lg border border-slate-200 bg-white px-3">{systems.map(system=><option key={system.system_code} value={system.system_code}>{system.name}</option>)}</select></label><label className="flex flex-col gap-1 text-sm">Categoria<select required value={categoryRuleForm.vehicle_category} onChange={event=>setCategoryRuleForm({...categoryRuleForm,vehicle_category:event.target.value as VehicleCategory})} className="h-10 rounded-lg border border-slate-200 bg-white px-3">{Object.entries(vehicleCategoryLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label className="flex flex-col gap-1 text-sm">Vida útil base (km)<input type="number" min="1" value={categoryRuleForm.base_life_km} onChange={event=>setCategoryRuleForm({...categoryRuleForm,base_life_km:event.target.value})} className="h-10 rounded-lg border border-slate-200 bg-white px-3"/></label><label className="flex flex-col gap-1 text-sm">Custo real da troca (R$)<input type="number" min="0" step="0.01" value={categoryRuleForm.replacement_cost} onChange={event=>setCategoryRuleForm({...categoryRuleForm,replacement_cost:event.target.value})} className="h-10 rounded-lg border border-slate-200 bg-white px-3"/></label><label className="flex flex-col gap-1 text-sm sm:col-span-2">Fórmula da vida ajustada<input required value={categoryRuleForm.formula_adjusted_life} onChange={event=>setCategoryRuleForm({...categoryRuleForm,formula_adjusted_life:event.target.value})} className="h-10 rounded-lg border border-slate-200 bg-white px-3 font-mono text-xs"/></label><label className="flex flex-col gap-1 text-sm">Fórmula do CPK<input required value={categoryRuleForm.formula_cpk} onChange={event=>setCategoryRuleForm({...categoryRuleForm,formula_cpk:event.target.value})} className="h-10 rounded-lg border border-slate-200 bg-white px-3 font-mono text-xs"/></label><label className="flex flex-col gap-1 text-sm">Fórmula do custo da rota<input required value={categoryRuleForm.formula_route_cost} onChange={event=>setCategoryRuleForm({...categoryRuleForm,formula_route_cost:event.target.value})} className="h-10 rounded-lg border border-slate-200 bg-white px-3 font-mono text-xs"/></label><FormulaVariablesHelp systemCode={categoryRuleForm.system_code} questions={questions}/><label className="flex flex-col gap-1 text-sm sm:col-span-2">Fonte / observação<textarea value={categoryRuleForm.basis_note} onChange={event=>setCategoryRuleForm({...categoryRuleForm,basis_note:event.target.value})} maxLength={500} rows={2} className="rounded-lg border border-slate-200 bg-white p-3"/></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={categoryRuleForm.is_active} onChange={event=>setCategoryRuleForm({...categoryRuleForm,is_active:event.target.checked})}/> Regra ativa</label><div className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={()=>setCategoryRuleEditorOpen(false)} className="h-10 rounded-lg border border-slate-200 px-4 text-sm">Cancelar</button><button disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-700 px-4 text-sm font-medium text-white"><Save size={16}/> Salvar regra</button></div></form>}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold text-slate-900">Perguntas e fatores de desgaste</h2><p className="mt-1 text-sm text-slate-500">Multiplicadores maiores reduzem a vida ajustada pela fórmula.</p></div><button onClick={()=>{setQuestionForm({...blankQuestion(),system_code:systems[0]?.system_code??""});setQuestionEditorOpen(true)}} disabled={!systems.length} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-medium text-white disabled:opacity-40"><Plus size={16}/> Nova pergunta</button></div><div className="mt-4 overflow-x-auto rounded-xl border border-slate-200"><table className="min-w-[760px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-3">Sistema</th><th className="px-3 py-3">Pergunta</th><th className="px-3 py-3">Resposta e multiplicador</th><th className="px-3 py-3">Estado</th><th className="px-3 py-3">Ações</th></tr></thead><tbody className="divide-y divide-slate-100">{questions.map(question=><tr key={question.id} className="align-top"><td className="px-3 py-3 font-medium">{systemNames.get(question.system_code) ?? question.system_code}</td><td className="max-w-sm px-3 py-3">{question.question}<p className="mt-1 font-mono text-xs text-slate-400">{question.answer_key}</p></td><td className="px-3 py-3">{question.options.map(option=><div key={`${option.value}-${option.min}`} className="whitespace-nowrap text-xs text-slate-600">{option.label}: <b>{option.multiplier}×</b></div>)}</td><td className="px-3 py-3">{question.is_active?"Ativa":"Pausada"}</td><td className="px-3 py-3"><div className="flex gap-2"><button type="button" onClick={()=>editQuestion(question)} className="inline-flex min-h-14 items-center gap-2 rounded-lg border border-slate-300 px-3 text-slate-900"><Pencil aria-hidden="true" size={18}/> Editar</button><button type="button" disabled={busy} onClick={()=>void removeQuestion(question)} className="inline-flex min-h-14 items-center gap-2 rounded-lg border border-rose-300 px-3 text-rose-800"><Trash2 aria-hidden="true" size={18}/> Excluir</button></div></td></tr>)}</tbody></table></div>
          {questionEditorOpen && <form onSubmit={event=>void submitQuestion(event)} className="mt-5 grid gap-3 rounded-xl border border-blue-100 bg-blue-50/40 p-4 sm:grid-cols-2"><h3 className="font-semibold sm:col-span-2">{questionForm.id?"Editar pergunta":"Nova pergunta"}</h3><label className="flex flex-col gap-1 text-sm">Sistema<select required value={questionForm.system_code} onChange={event=>setQuestionForm({...questionForm,system_code:event.target.value})} className="h-10 rounded-lg border border-slate-200 bg-white px-3">{systems.map(system=><option key={system.system_code} value={system.system_code}>{system.name}</option>)}</select></label><label className="flex flex-col gap-1 text-sm">Chave de resposta<input required pattern="[a-z][a-z0-9_]{1,59}" value={questionForm.answer_key} onChange={event=>setQuestionForm({...questionForm,answer_key:event.target.value})} placeholder="ex.: condicao_via" className="h-10 rounded-lg border border-slate-200 bg-white px-3"/></label><label className="flex flex-col gap-1 text-sm sm:col-span-2">Pergunta<input required minLength={5} maxLength={300} value={questionForm.question} onChange={event=>setQuestionForm({...questionForm,question:event.target.value})} className="h-10 rounded-lg border border-slate-200 bg-white px-3"/></label><label className="flex flex-col gap-1 text-sm">Tipo de resposta<select value={questionForm.answer_type} onChange={event=>setQuestionForm({...questionForm,answer_type:event.target.value as "select"|"number"})} className="h-10 rounded-lg border border-slate-200 bg-white px-3"><option value="select">Opções</option><option value="number">Faixas numéricas</option></select></label><label className="flex flex-col gap-1 text-sm">Ordem<input type="number" value={questionForm.display_order} onChange={event=>setQuestionForm({...questionForm,display_order:event.target.value})} className="h-10 rounded-lg border border-slate-200 bg-white px-3"/></label><label className="flex flex-col gap-1 text-sm sm:col-span-2">Opções — uma por linha: {questionForm.answer_type==="number"?"mínimo:máximo|rótulo|multiplicador":"valor|rótulo|multiplicador"}<textarea required rows={5} value={questionForm.options_text} onChange={event=>setQuestionForm({...questionForm,options_text:event.target.value})} placeholder={questionForm.answer_type==="number"?"0:30|Até 30%|1\n31:70|31% a 70%|1.15":"cidade|Cidade|1.3\nrodovia|Rodovia|1"} className="rounded-lg border border-slate-200 bg-white p-3 font-mono text-xs"/></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={questionForm.required} onChange={event=>setQuestionForm({...questionForm,required:event.target.checked})}/> Resposta obrigatória</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={questionForm.is_active} onChange={event=>setQuestionForm({...questionForm,is_active:event.target.checked})}/> Pergunta ativa</label><div className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={()=>{setQuestionEditorOpen(false);setQuestionForm(blankQuestion())}} className="h-10 rounded-lg border border-slate-200 px-4 text-sm">Cancelar</button><button disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-700 px-4 text-sm font-medium text-white"><Save size={16}/> Salvar</button></div></form>}
        </section>
      </>}
    </div>
  </main></div>;
}

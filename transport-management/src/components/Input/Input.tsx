import React from "react";

interface InputData {
  label: string;
  name: string;
  theme?: "light" | "dark";
  type: string;
  value?: string;
  autocomplete?: string;
  required?: boolean;
  min?: number | string;
  step?: number | string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

function Input(data: InputData) {
  return (
    <div className="flex flex-col gap-2 my-4 w-full">
      <label
        htmlFor={data.name}
        className="mb-0 text-base font-semibold text-slate-900"
      >
        {data.label}
      </label>

      <input
        type={data.type}
      required={data.required}
        min={data.min}
        step={data.step}
        name={data.name}
        id={data.name}
        className="min-h-14 w-full rounded-xl border border-slate-400 bg-white px-3 py-3 text-base text-slate-900 outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-200"
        value={data.value}
        onChange={data.onChange}
        autoComplete={data.autocomplete}
      />
    </div>
  );
}

export default Input;

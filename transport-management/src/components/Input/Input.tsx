import React from "react";

interface InputData {
  label: string;
  name: string;
  theme?: "light" | "dark";
  type: string;
  value?: string;
  autocomplete?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

function Input(data: InputData) {
  const themeColors = {
    light: "text-gray-100",
    dark: "text-gray-200",
  };

  return (
    <div className="flex flex-col gap-2 my-4 w-full">
      <label
        htmlFor={data.name}
        className={`font-normal mb-0 text-gray-700 ${
          themeColors[data.theme ? data.theme : "light"]
        }`}
      >
        {data.label}
      </label>

      <input
        type={data.type}
        name={data.name}
        id={data.name}
        className={`bg-gray-100 rounded-sm w-full p-2 outline-0 m-0 text-gray-900${
          themeColors[data.theme ? data.theme : "light"]
        }`}
        value={data.value}
        onChange={data.onChange}
        autoComplete={data.autocomplete}
      />
    </div>
  );
}

export default Input;

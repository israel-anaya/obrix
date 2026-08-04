import { useState } from "react";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Select } from "@/components/Select";
import type { NuevoInsumo, TipoInsumo } from "@/lib/types";

const TIPOS: { value: TipoInsumo; label: string }[] = [
  { value: "material", label: "Material" },
  { value: "mano_obra", label: "Mano de obra" },
  { value: "equipo_herramienta", label: "Equipo/herramienta" },
];

const vacio: NuevoInsumo = {
  clave: "",
  tipo: "material",
  descripcion: "",
  unidad: "",
  precio_base: "",
};

export function InsumoForm({ onSubmit }: { onSubmit: (insumo: NuevoInsumo) => Promise<void> }) {
  const [form, setForm] = useState<NuevoInsumo>(vacio);
  const [enviando, setEnviando] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    try {
      await onSubmit(form);
      setForm(vacio);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-6 gap-2 border-b border-border p-3">
      <Input
        placeholder="Clave"
        value={form.clave}
        onChange={(e) => setForm({ ...form, clave: e.target.value })}
        required
      />
      <Select
        value={form.tipo}
        onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoInsumo })}
      >
        {TIPOS.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </Select>
      <Input
        className="col-span-2"
        placeholder="Descripción"
        value={form.descripcion}
        onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
        required
      />
      <Input
        placeholder="Unidad"
        value={form.unidad}
        onChange={(e) => setForm({ ...form, unidad: e.target.value })}
        required
      />
      <div className="flex gap-2">
        <Input
          className="num"
          placeholder="Precio"
          inputMode="decimal"
          value={form.precio_base}
          onChange={(e) => setForm({ ...form, precio_base: e.target.value })}
          required
        />
        <Button type="submit" disabled={enviando}>
          +
        </Button>
      </div>
    </form>
  );
}

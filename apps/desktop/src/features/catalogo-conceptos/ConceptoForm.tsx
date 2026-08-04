import { useState } from "react";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Select } from "@/components/Select";
import type { Concepto, NuevoConcepto } from "@/lib/types";

const vacio: NuevoConcepto = {
  clave: "",
  descripcion: "",
  unidad: "",
  cantidad: "",
  parent_id: null,
};

export function ConceptoForm({
  conceptos,
  onSubmit,
}: {
  conceptos: Concepto[];
  onSubmit: (concepto: NuevoConcepto) => Promise<void>;
}) {
  const [form, setForm] = useState<NuevoConcepto>(vacio);
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
        value={form.parent_id ?? ""}
        onChange={(e) => setForm({ ...form, parent_id: e.target.value || null })}
      >
        <option value="">— sin capítulo padre —</option>
        {conceptos.map((c) => (
          <option key={c.id} value={c.id}>
            {c.clave} · {c.descripcion}
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
          placeholder="Cantidad"
          inputMode="decimal"
          value={form.cantidad}
          onChange={(e) => setForm({ ...form, cantidad: e.target.value })}
          required
        />
        <Button type="submit" disabled={enviando}>
          +
        </Button>
      </div>
    </form>
  );
}

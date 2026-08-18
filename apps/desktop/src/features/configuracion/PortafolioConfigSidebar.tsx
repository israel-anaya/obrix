import { Building2, CircleDollarSign, Contact, Layers, MapPin, Ruler, Store, type LucideIcon, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { CATALOGOS_GENERALES } from "@/features/configuracion/catalogosGenerales";

const ICONOS: Record<string, LucideIcon> = {
  organizaciones: Building2,
  usuarios: Users,
  proveedores: Store,
  clientes: Contact,
  "unidades-medida": Ruler,
  regiones: MapPin,
  "familias-insumo": Layers,
  monedas: CircleDollarSign,
};

const CONTACTOS = [
  { id: "proveedores", titulo: "Proveedores" },
  { id: "clientes", titulo: "Clientes" },
];

/**
 * Catálogos del archivo `.obx` (organización, usuarios, unidades, etc.) —
 * viven aquí y no en el engrane de la app, porque sin portafolio abierto no
 * hay nada que configurar.
 */
export function PortafolioConfigSidebar({
  onOpenCatalogo,
}: {
  onOpenCatalogo: (id: string, label: string, icon?: LucideIcon) => void;
}) {
  const items = [
    ...CATALOGOS_GENERALES.filter((d) => d.id === "organizaciones" || d.id === "usuarios"),
    ...CONTACTOS,
    ...CATALOGOS_GENERALES.filter((d) => d.id !== "organizaciones" && d.id !== "usuarios"),
  ];

  return (
    <div className="flex h-full flex-col gap-0.5 overflow-auto px-1 py-1">
      {items.map((item) => {
        const Icono = ICONOS[item.id];
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onOpenCatalogo(item.id, item.titulo, Icono)}
            className={cn(
              "flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-[13px] text-muted-foreground hover:bg-background/80 hover:text-foreground",
            )}
          >
            {Icono && <Icono size={16} className="shrink-0" />}
            <span className="truncate">{item.titulo}</span>
          </button>
        );
      })}
    </div>
  );
}

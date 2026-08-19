import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Building2, Calculator, Check, Layers, Mail, MapPinned, Moon, Sun } from "lucide-react";
import { AuthModal } from "@/components/AuthModal";
import { DescargasPage } from "@/components/DescargasPage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTheme } from "@/hooks/useTheme";
import { cerrarSesion, sesionActual } from "@/lib/auth";
import type { AccountInfo } from "@/lib/types";

// Correo de contacto general (ventas Enterprise, dudas) — ajusta antes de publicar.
const CONTACTO_EMAIL = "hola@obrix.mx";

const FEATURES: { icon: LucideIcon; titulo: string; descripcion: string }[] = [
  {
    icon: Calculator,
    titulo: "Precios unitarios completos",
    descripcion:
      "Catálogo de materiales, mano de obra, herramienta y equipo, con matrices APU listas para presupuestar.",
  },
  {
    icon: MapPinned,
    titulo: "Costeo por región",
    descripcion:
      "Cuadrillas y equipos con costo horario regionalizado; salarios y factor de salario real por zona.",
  },
  {
    icon: Building2,
    titulo: "Multi-organización",
    descripcion:
      "Organiza proyectos, catálogos y presupuestos por organización, cada una con su propia configuración.",
  },
  {
    icon: Layers,
    titulo: "100% open source",
    descripcion: "Licencia Apache-2.0, sin vendor lock-in — el código es tuyo desde el día uno.",
  },
];

type Plan = {
  nombre: string;
  precio: string;
  descripcion: string;
  capacidades: string[];
  destacado?: boolean;
  ctaEnterprise?: boolean;
};

const PLANES: Plan[] = [
  {
    nombre: "Free",
    precio: "Gratis",
    descripcion: "Para empezar a presupuestar sin fricción.",
    capacidades: ["Portafolios ilimitados", "1 organización", "3 proyectos"],
  },
  {
    nombre: "Profesional",
    precio: "Próximamente",
    descripcion: "Para despachos y constructoras que crecen.",
    capacidades: ["3 organizaciones", "Proyectos ilimitados", "Todo lo de Free"],
    destacado: true,
  },
  {
    nombre: "Enterprise",
    precio: "A cotizar",
    descripcion: "Para operaciones grandes, en la nube o on-premise.",
    capacidades: ["Organizaciones ilimitadas", "Multi-usuario", "Todo lo de Profesional"],
    ctaEnterprise: true,
  },
];

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <Button variant="ghost" size="sm" onClick={toggle} aria-label="Cambiar tema">
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </Button>
  );
}

export function App() {
  const [cuenta, setCuenta] = useState<AccountInfo | null>(null);
  const [cargandoSesion, setCargandoSesion] = useState(true);
  const [modalAbierto, setModalAbierto] = useState<"login" | "registro" | null>(null);

  useEffect(() => {
    sesionActual()
      .then(setCuenta)
      .finally(() => setCargandoSesion(false));
  }, []);

  const handleCerrarSesion = async () => {
    await cerrarSesion();
    setCuenta(null);
  };

  if (cargandoSesion) {
    return <div className="min-h-screen bg-background" />;
  }

  if (cuenta) {
    return <DescargasPage cuenta={cuenta} onCerrarSesion={handleCerrarSesion} />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <span className="text-lg font-semibold">Obrix</span>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground sm:flex">
            <a href="#caracteristicas" className="hover:text-foreground">
              Características
            </a>
            <a href="#planes" className="hover:text-foreground">
              Planes
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={() => setModalAbierto("login")}>
              Iniciar sesión
            </Button>
            <Button size="sm" onClick={() => setModalAbierto("registro")}>
              Crear cuenta
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-3xl px-6 py-24 text-center sm:py-32">
          <Badge variant="muted" className="mb-4">
            Software open source · Apache-2.0
          </Badge>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Precios unitarios, sin fricción.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-muted-foreground">
            Obrix es el software para presupuestar, costear cuadrillas y controlar catálogos de
            precios unitarios en México — por región, por organización, sin ataduras.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Button size="lg" onClick={() => setModalAbierto("registro")}>
              Crear cuenta gratis
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a href="#planes">Ver planes</a>
            </Button>
          </div>
        </section>

        <section id="caracteristicas" className="border-t border-border bg-muted/30 py-20">
          <div className="mx-auto max-w-6xl px-6">
            <h2 className="text-center text-2xl font-semibold sm:text-3xl">
              Todo lo que necesita un presupuesto de obra
            </h2>
            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map(({ icon: Icon, titulo, descripcion }) => (
                <Card key={titulo}>
                  <CardHeader>
                    <Icon className="mb-2 text-primary" size={24} />
                    <CardTitle>{titulo}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">{descripcion}</CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section id="planes" className="py-20">
          <div className="mx-auto max-w-6xl px-6">
            <h2 className="text-center text-2xl font-semibold sm:text-3xl">
              Un plan para cada etapa
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-center text-muted-foreground">
              Empieza gratis. Crece cuando lo necesites.
            </p>
            <div className="mt-12 grid gap-6 sm:grid-cols-3">
              {PLANES.map((plan) => (
                <Card
                  key={plan.nombre}
                  className={plan.destacado ? "border-primary shadow-sm" : undefined}
                >
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>{plan.nombre}</CardTitle>
                      {plan.destacado && <Badge>Más popular</Badge>}
                    </div>
                    <p className="text-2xl font-semibold">{plan.precio}</p>
                    <p className="text-sm text-muted-foreground">{plan.descripcion}</p>
                  </CardHeader>
                  <CardContent>
                    <ul className="flex flex-col gap-2 text-sm">
                      {plan.capacidades.map((c) => (
                        <li key={c} className="flex items-center gap-2">
                          <Check size={16} className="shrink-0 text-success" />
                          {c}
                        </li>
                      ))}
                    </ul>
                    {plan.ctaEnterprise ? (
                      <Button className="mt-6 w-full" variant="outline" asChild>
                        <a href={`mailto:${CONTACTO_EMAIL}`}>Hablar con ventas</a>
                      </Button>
                    ) : (
                      <Button
                        className="mt-6 w-full"
                        variant={plan.destacado ? "default" : "outline"}
                        onClick={() => setModalAbierto("registro")}
                      >
                        Crear cuenta gratis
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-border py-20">
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-6 text-center">
            <h2 className="text-2xl font-semibold sm:text-3xl">¿Listo para presupuestar mejor?</h2>
            <p className="max-w-md text-muted-foreground">
              Crea tu cuenta gratis y empieza con tu primera organización.
            </p>
            <Button size="lg" onClick={() => setModalAbierto("registro")}>
              Crear cuenta gratis
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-6 text-sm text-muted-foreground sm:flex-row sm:justify-between">
          <span>© {new Date().getFullYear()} Obrix — Licencia Apache-2.0</span>
          <a
            href={`mailto:${CONTACTO_EMAIL}`}
            className="flex items-center gap-1.5 hover:text-foreground"
          >
            <Mail size={14} />
            {CONTACTO_EMAIL}
          </a>
        </div>
      </footer>

      {modalAbierto && (
        <AuthModal
          modoInicial={modalAbierto}
          onClose={() => setModalAbierto(null)}
          onAutenticado={(c) => {
            setCuenta(c);
            setModalAbierto(null);
          }}
        />
      )}
    </div>
  );
}

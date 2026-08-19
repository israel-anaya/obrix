import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { LoginPage } from "@/pages/LoginPage";
import { Dashboard } from "@/pages/Dashboard";

export function App() {
  const [username, setUsername] = useState<string | null>(null);
  const [verificando, setVerificando] = useState(true);

  useEffect(() => {
    api
      .me()
      .then((r) => setUsername(r.username))
      .catch(() => setUsername(null))
      .finally(() => setVerificando(false));
  }, []);

  if (verificando) return null;

  if (!username) {
    return <LoginPage onLogin={() => window.location.reload()} />;
  }

  return <Dashboard username={username} onLogout={() => setUsername(null)} />;
}

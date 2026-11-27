import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@juninmd/sonido/styles.css";
import App from "./App.tsx";
import "./index.css";

// O painel é escuro por padrão; o Sonido pinta os componentes com o mesmo token do `data-theme`.
document.documentElement.dataset.theme = "dark";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

import { useState, useCallback } from "react";
import ButtonPage from "./pages/ButtonPage.jsx";
import FormPage from "./pages/FormPage.jsx";
import ResultsPage from "./pages/ResultsPage.jsx";

const ALL_PAGES = {
  buttons: { label: "Botões", component: ButtonPage },
  form:    { label: "Formulário", component: FormPage },
  results: { label: "Matriz de Detecção", component: ResultsPage },
};

// Hide the results page when running under WebDriver (Playwright / Selenium).
// navigator.webdriver is true automatically in any automated browser session.
const PAGES = navigator.webdriver
  ? { buttons: ALL_PAGES.buttons, form: ALL_PAGES.form }
  : ALL_PAGES;

// TC-B-xx → buttons, TC-F-xx → form
const tabForCase = (id) => id.startsWith("TC-B") ? "buttons" : "form";

export default function App() {
  const [current, setCurrent] = useState("buttons");
  const Page = PAGES[current].component;

  const navigateTo = useCallback((caseId) => {
    const tab = tabForCase(caseId);
    setCurrent(tab);
    // Scroll after React re-renders the target page
    setTimeout(() => {
      const el = document.getElementById(caseId);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.style.transition = "background 0.15s";
      el.style.background = "#fff3cd";
      setTimeout(() => { el.style.background = ""; }, 1200);
    }, 80);
  }, []);

  return (
    <>
      <nav style={{
        background: "#1351b4",
        padding: "0 2rem",
        display: "flex",
        gap: "0.25rem",
        alignItems: "center",
      }}>
        <span style={{ color: "#fff", fontFamily: "Rawline, Raleway, sans-serif", fontWeight: 700, marginRight: "2rem" }}>
          gov.br DS Validator PoC
        </span>
        {Object.entries(PAGES).map(([key, { label }]) => (
          <button
            key={key}
            onClick={() => setCurrent(key)}
            style={{
              background: current === key ? "#fff" : "transparent",
              color: current === key ? "#1351b4" : "#fff",
              border: "none",
              padding: "0.75rem 1.25rem",
              cursor: "pointer",
              fontFamily: "Rawline, Raleway, sans-serif",
              fontWeight: current === key ? 700 : 400,
              fontSize: "14px",
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      <Page navigateTo={navigateTo} />
    </>
  );
}

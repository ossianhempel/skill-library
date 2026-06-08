import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SkillLibraryApp } from "./ui.js";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SkillLibraryApp />
  </StrictMode>
);

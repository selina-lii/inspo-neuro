import { createRoot } from "react-dom/client";
import { store } from "./core/store";
import { App } from "./ui/App";
import "./ui/styles.css";

if (import.meta.env.DEV) Object.assign(window, { neuromapStore: store });   // for UI tests and the console

createRoot(document.getElementById("root")!).render(<App />);

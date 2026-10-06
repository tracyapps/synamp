import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import PartyGuest from "./party/PartyGuest";
import PartyScreen from "./party/PartyScreen";
import "./styles/tokens.css";
import "./styles/ui.css";
import "./styles/app.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

// /party/CODE is a guest's phone; /party/CODE/screen is the TV. Everything else is the app.
const party = window.location.pathname.match(/^\/party\/([A-Za-z0-9]{4,12})(\/screen)?\/?$/);

createRoot(root).render(
  <StrictMode>
    {party ? (party[2] ? <PartyScreen code={party[1]!.toUpperCase()} /> : <PartyGuest code={party[1]!.toUpperCase()} />) : <App />}
  </StrictMode>
);

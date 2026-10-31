// First of all: style elements made by the page carry the one-time number
// the page's security policy asks for (see styleNonce.ts).
import "./styleNonce";
// Fonts live with the page, not at Google: otherwise every visit would tell
// Google the visitor's address.
import "@fontsource-variable/manrope";
import "@fontsource-variable/jetbrains-mono";
import "./styles/tokens.css";
import "./styles/app.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { Connect } from "./Connect";
import { browserLanguage, rememberedLanguage, showLanguage } from "./i18n";

const root = document.getElementById("root");
if (root) {
  // /connect: tTerm for the computer signs in with this browser (0.1.6), a
  // page of its own, without the terminals.
  const connect = /^\/connect\/?$/.test(location.pathname);
  // The first paint in the language shown here last, else in the
  // browser's (0.1.16); the account's comes with the state (App.tsx).
  void showLanguage(rememberedLanguage() ?? browserLanguage() ?? "en").finally(() => {
    createRoot(root).render(
      <StrictMode>
        {connect ? <Connect /> : <App />}
      </StrictMode>,
    );
  });
}

document.getElementById("year").textContent = new Date().getFullYear();

const menuToggle = document.getElementById("menuToggle");
const navLinks = document.getElementById("navLinks");

menuToggle.addEventListener("click", () => {
  const isOpen = navLinks.classList.toggle("open");
  menuToggle.setAttribute("aria-expanded", isOpen);
});

navLinks.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    navLinks.classList.remove("open");
    menuToggle.setAttribute("aria-expanded", "false");
  });
});

// Verificação anti-robô na primeira visita (Cloudflare Turnstile): enquanto <html> tiver a classe
// `gated` (aplicada por um script inline no <head>), o conteúdo fica em blur e inerte atrás de
// #humanGate. O token é validado no servidor pelo Worker (pasta worker/), que também devolve os
// links sensíveis (ex.: perfil do LinkedIn), mantidos fora do HTML. Aprovado, a liberação e os
// links ficam salvos no localStorage por VERIFIED_DAYS dias.
const VERIFIED_KEY = "personalsite:humanVerifiedUntil";
const LINKS_KEY = "personalsite:links";
const VERIFIED_DAYS = 30;
const root = document.documentElement;

// Preenche os <a data-link="nome"> com as URLs recebidas do Worker (só aceita LinkedIn).
function applyLinks(links) {
  document.querySelectorAll("a[data-link]").forEach((a) => {
    const url = links && links[a.dataset.link];
    if (typeof url === "string" && url.startsWith("https://www.linkedin.com/")) a.href = url;
  });
}

if (!root.classList.contains("gated")) {
  try {
    applyLinks(JSON.parse(localStorage.getItem(LINKS_KEY)));
  } catch {
    // Links indisponíveis: os botões ficam sem destino até a próxima verificação.
  }
} else {
  const gate = document.getElementById("humanGate");
  const gateStatus = document.getElementById("gateStatus");
  const { sitekey, endpoint, msgLoading, msgError } = gate.dataset;
  const content = [...document.body.children].filter((el) => el !== gate && el.tagName !== "SCRIPT");

  content.forEach((el) => (el.inert = true));

  const unlock = (links) => {
    applyLinks(links);
    try {
      // Sem links (Worker desatualizado), não memoriza: a próxima visita verifica de novo.
      if (links && Object.keys(links).length) {
        localStorage.setItem(LINKS_KEY, JSON.stringify(links));
        localStorage.setItem(VERIFIED_KEY, String(Date.now() + VERIFIED_DAYS * 864e5));
      }
    } catch {
      // Sem localStorage (ex.: modo privado restrito): a verificação vale só para esta página.
    }
    content.forEach((el) => (el.inert = false));
    root.classList.remove("gated");
  };

  const showError = () => {
    gateStatus.textContent = msgError;
  };

  window.onTurnstileLoad = () => {
    const widgetId = turnstile.render("#turnstileWidget", {
      sitekey,
      size: window.innerWidth < 360 ? "compact" : "normal",
      language: (root.lang || "auto").toLowerCase(),
      callback: async (token) => {
        gateStatus.textContent = msgLoading;
        try {
          const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token }),
          });
          if (!res.ok) throw new Error(res.status);
          unlock((await res.json()).links);
        } catch {
          showError();
          turnstile.reset(widgetId);
        }
      },
      "error-callback": showError,
      "expired-callback": () => turnstile.reset(widgetId),
    });
  };

  const script = document.createElement("script");
  script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileLoad";
  script.async = true;
  script.onerror = showError;
  document.head.appendChild(script);
}

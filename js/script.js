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

// Contatos protegidos por Cloudflare Turnstile: o token é validado pelo Worker (pasta worker/),
// que só então devolve e-mail/telefone. O bloco fica oculto enquanto não estiver configurado.
const contactReveal = document.getElementById("contactReveal");
const { sitekey, endpoint, msgLoading, msgError } = contactReveal.dataset;

if (sitekey && endpoint) {
  const contactStatus = document.getElementById("contactStatus");
  const contactData = document.getElementById("contactData");

  const showContact = (data) => {
    const items = [
      data.email && { href: `mailto:${data.email}`, text: data.email },
      data.phone && { href: `tel:${data.phone.replace(/[^\d+]/g, "")}`, text: data.phone },
    ].filter(Boolean);
    if (!items.length) throw new Error("empty");
    items.forEach(({ href, text }) => {
      const a = document.createElement("a");
      a.href = href;
      a.textContent = text;
      const li = document.createElement("li");
      li.appendChild(a);
      contactData.appendChild(li);
    });
    contactData.hidden = false;
  };

  window.onTurnstileLoad = () => {
    turnstile.render("#turnstileWidget", {
      sitekey,
      language: (document.documentElement.lang || "auto").toLowerCase(),
      callback: async (token) => {
        contactStatus.textContent = msgLoading;
        try {
          const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token }),
          });
          if (!res.ok) throw new Error(res.status);
          showContact(await res.json());
          contactStatus.textContent = "";
          document.getElementById("turnstileWidget").hidden = true;
        } catch {
          contactStatus.textContent = msgError;
        }
      },
      "error-callback": () => {
        contactStatus.textContent = msgError;
      },
    });
  };

  const script = document.createElement("script");
  script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileLoad";
  script.async = true;
  document.head.appendChild(script);
  contactReveal.hidden = false;
}

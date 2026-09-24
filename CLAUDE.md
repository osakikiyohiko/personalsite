# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Sobre o projeto

Site pessoal de portfólio/CV de André Osaki. Site simples, sem build system, feito em
HTML/CSS/JS puro (sem framework, sem dependências, sem gerenciador de pacotes) — mesmo estilo do
projeto irmão `pesopesasosite`.

## Executar localmente

Não há build. Basta servir os arquivos estáticos:

```bash
python3 -m http.server 8000
```

Depois acesse `http://localhost:8000`. Também é possível abrir `index.html` diretamente no
navegador.

## Deploy

Publicado via GitHub Pages a partir da branch `main` (raiz do repositório), sem etapa de build:
qualquer `git push` para `main` já republica o site.

- Repositório: https://github.com/osakikiyohiko/personalsite
- URL publicada: https://osakikiyohiko.github.io/personalsite/

## Estrutura

- `index.html` — página principal (português), dividida em seções por `id` (`#inicio`, `#sobre`,
  `#habilidades`, `#experiencia`, `#projetos`, `#contato`) referenciadas pelo menu de navegação.
- `css/style.css` — todo o estilo, usando variáveis CSS em `:root` para cores e largura máxima do
  conteúdo. Breakpoint responsivo único em `720px` para o menu mobile.
- `js/script.js` — comportamentos da página: ano do rodapé, toggle do menu mobile (`.open` em
  `#navLinks`) e o widget Turnstile de `#contactReveal` (ver política de privacidade abaixo).
- `en/index.html` — versão em inglês da mesma página, com os mesmos `id`s de seção (mantidos em
  português) e referenciando `../css`, `../js` e `../img`. Cada versão tem o seletor de idioma
  `.lang-switch` no cabeçalho (dentro de `.nav-actions`), **fora** do `<nav>`/menu hamburguer (visível também no mobile, como
  no `pesopesasosite`): as duas bandeiras sempre aparecem, a do idioma atual com
  `aria-current="page"` (destacada pelo CSS), e `<link rel="alternate" hreflang>` no `<head>`. **Qualquer mudança de
  conteúdo em `index.html` deve ser replicada, traduzida, em `en/index.html`.**
- `img/` — imagens usadas pelo site: `andre-osaki.jpg` (avatar exibido em `#inicio`, `.avatar`
  no CSS), `favicon.svg` (ícone oficial do FortiGate — ver nota abaixo) e `flag-br.svg` /
  `flag-us.svg` (bandeiras do seletor de idioma, `.lang-switch`/`.flag` no CSS; desenhadas à mão
  em SVG, simplificadas — não usar emoji de bandeira, que não renderiza no Windows).

### Pegadinha do menu mobile

Em `.nav-container` (flex com `justify-content: space-between`), o `<nav>` fica com largura zero
no mobile porque seu `<ul>` interno vira `position: absolute` — mas o `<nav>` continua ocupando
um item no flex. Por isso o seletor de idioma e o botão hamburguer ficam juntos num único bloco
`.nav-actions`, colocado **depois** do `<nav>` no HTML, e o `nav` tem `margin-left: auto`: assim
bandeiras e hamburguer ficam sempre colados à direita (no desktop, logo após os links do menu),
sem depender de `order`. Separar bandeiras e botão em itens flex independentes faz as bandeiras
"flutuarem" no meio do cabeçalho no mobile.

O link do CSS usa `?v=N` (`css/style.css?v=3`; o `js/script.js` também) para furar o cache do navegador (GitHub Pages
serve com `max-age=600`); incrementar em ambas as páginas ao mudar o layout do cabeçalho.

## Fonte do conteúdo

O texto de `#sobre`, `#habilidades` e `#experiencia` foi extraído do CV em
`CV/André_Kiyohiko_Osaki_CV(2026) ESPECIALISTA DE REDES (1).pdf` (não versionado — ver
`.gitignore`). A seção `#projetos` (rotulada "Artigos Publicados" na página) usa os artigos do
LinkedIn listados no CV em vez de projetos de software, já que é o que existe de conteúdo real.

A foto usada em `img/andre-osaki.jpg` foi processada a partir do original em
`foto/20240910_211452.jpg` (não versionado — ver `.gitignore`): metadados EXIF removidos
(incluía modelo do aparelho, data/hora e ID único do arquivo) e redimensionada para 600px de
largura. Ao trocar a foto, repetir esse processo — nunca publicar a imagem original da câmera
sem remover o EXIF antes.

## Política de privacidade do conteúdo

**Não incluir no site** nenhum dado pessoal sensível presente no CV: telefone, endereço/CEP,
idade, estado civil ou e-mail. O único contato exposto é o link do LinkedIn
(`https://www.linkedin.com/in/aosaki/`), usado tanto no botão de `#contato` quanto nos links de
`#projetos`. Ao atualizar conteúdo a partir do CV, manter essa restrição.

**Exceção controlada:** e-mail e telefone podem ser exibidos **somente** pelo bloco
`#contactReveal` em `#contato`, protegido por Cloudflare Turnstile (anti-robô). Esses dados
**nunca** vão para o HTML/JS/repositório: ficam como secrets de um Cloudflare Worker
(`worker/worker.js`), que valida o token do Turnstile no servidor (`siteverify`, conferindo também
o `hostname`) e só então devolve os dados, via CORS restrito a `ALLOWED_ORIGINS`.

Configuração (uma vez, fora do repositório):

1. Painel Cloudflare → Turnstile → criar widget com os hostnames `osakikiyohiko.github.io` e
   `localhost`; anotar *site key* (pública) e *secret key*.
2. Em `worker/`: `npx wrangler deploy`, depois `npx wrangler secret put TURNSTILE_SECRET_KEY`,
   `... CONTACT_EMAIL` e `... CONTACT_PHONE` (os dois últimos são opcionais).
3. Preencher `data-sitekey` e `data-endpoint` (URL do Worker) em `#contactReveal` nas **duas**
   páginas. Com esses atributos vazios o bloco fica oculto (`hidden`) e o script do Turnstile nem
   é carregado.

A pasta `worker/` também é servida pelo GitHub Pages — por isso não pode conter nenhum segredo
(`.dev.vars` está no `.gitignore`).

## Favicon

`img/favicon.svg` é o ícone oficial do FortiGate, baixado de `icons.fortinet.com/icons/FortiGate.svg`
a pedido do usuário (referência técnica à especialização em Fortinet/FortiGate do CV). Usado
diretamente como SVG (`<link rel="icon" type="image/svg+xml">` em `index.html`), sem fallback
PNG — não havia ferramenta de conversão SVG→PNG disponível no ambiente sem instalar pacotes via
`apt`/`pip`. Se precisar de um fallback PNG (ex.: suporte a navegadores muito antigos ou ícone de
atalho no celular), gerar com `rsvg-convert`, `inkscape` ou `cairosvg`.

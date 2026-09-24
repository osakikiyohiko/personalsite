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
- `js/script.js` — comportamentos da página: ano do rodapé e toggle do menu mobile (`.open` em
  `#navLinks`).
- `en/index.html` — versão em inglês da mesma página, com os mesmos `id`s de seção (mantidos em
  português) e referenciando `../css`, `../js` e `../img`. Cada versão tem o seletor de idioma
  `.lang-switch` no cabeçalho, **fora** do `<nav>`/menu hamburguer (visível também no mobile, como
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
um item no flex. Por isso `nav`, `.lang-switch` e `.menu-toggle` recebem `order` explícito (1, 2, 3) dentro do
`@media (max-width: 720px)` em `css/style.css`, com `margin-left: auto` no `.lang-switch` (e
`margin-left: 0` no `nav`, que no desktop usa `auto`), garantindo que bandeiras e botão
hamburguer fiquem colados à direita em vez de "flutuar" no meio do cabeçalho. Remover esse
`order`/margens reintroduz o bug.

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

## Favicon

`img/favicon.svg` é o ícone oficial do FortiGate, baixado de `icons.fortinet.com/icons/FortiGate.svg`
a pedido do usuário (referência técnica à especialização em Fortinet/FortiGate do CV). Usado
diretamente como SVG (`<link rel="icon" type="image/svg+xml">` em `index.html`), sem fallback
PNG — não havia ferramenta de conversão SVG→PNG disponível no ambiente sem instalar pacotes via
`apt`/`pip`. Se precisar de um fallback PNG (ex.: suporte a navegadores muito antigos ou ícone de
atalho no celular), gerar com `rsvg-convert`, `inkscape` ou `cairosvg`.

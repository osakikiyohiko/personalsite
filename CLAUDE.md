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
  `#navLinks`) e a verificação anti-robô `#humanGate` (ver seção própria abaixo).
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

O link do CSS usa `?v=N` (`css/style.css?v=4`; o `js/script.js` também, `?v=4`) para furar o cache do navegador (GitHub Pages
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
idade, estado civil ou e-mail. Ao atualizar conteúdo a partir do CV, manter essa restrição.

O **link do perfil do LinkedIn também é tratado como sensível**: não pode aparecer no HTML, no
JS nem em nenhum arquivo do repositório (inclusive este). O botão de `#contato` é um
`<a data-link="linkedin">` sem `href`; a URL fica na variável `LINKEDIN_URL` do Worker, que só a
devolve (`{ ok, links }`) após validar o Turnstile, e `js/script.js` preenche o `href` (aceitando
apenas `https://www.linkedin.com/`), guardando-a no localStorage (`personalsite:links`) junto com
a liberação. Novos links sensíveis seguem o mesmo padrão (`data-link` + variável no Worker). Os
links dos artigos em `#projetos` (`/pulse/...`) continuam diretos no HTML.

## Verificação anti-robô na entrada

Na primeira visita, o site inteiro fica em blur (e `inert`) atrás do popup `#humanGate`, com um
Cloudflare Turnstile. A classe `gated` é aplicada em `<html>` por um script inline no `<head>` de
cada página (antes da primeira pintura, para não "piscar" o conteúdo) e removida por
`js/script.js` quando a verificação passa; a liberação fica em
`localStorage["personalsite:humanVerifiedUntil"]` por 30 dias. Sem JavaScript, o site aparece
normalmente (sem bloqueio).

O token do Turnstile é validado no servidor por um Cloudflare Worker (`worker/worker.js`,
publicado em `https://personalsite-contato.andre-osaki.workers.dev`), que chama o `siteverify`,
confere o `hostname` e só aceita chamadas das origens em `ALLOWED_ORIGINS` (CORS). O Worker é
criado e editado pelo painel da Cloudflare (o código é colado no editor web; não há Node/wrangler
no ambiente), com as variáveis `ALLOWED_ORIGINS` e `LINKEDIN_URL` e o secret `TURNSTILE_SECRET_KEY`. `data-sitekey`
(pública) e `data-endpoint` ficam em `#humanGate` nas **duas** páginas.

Limitação: o conteúdo continua no HTML estático, então o bloqueio é visual/para interação — um
robô que lê o HTML direto não é barrado. A pasta `worker/` também é servida pelo GitHub Pages,
por isso não pode conter nenhum segredo (`.dev.vars` está no `.gitignore`).

## Favicon

`img/favicon.svg` é o ícone oficial do FortiGate, baixado de `icons.fortinet.com/icons/FortiGate.svg`
a pedido do usuário (referência técnica à especialização em Fortinet/FortiGate do CV). Usado
diretamente como SVG (`<link rel="icon" type="image/svg+xml">` em `index.html`), sem fallback
PNG — não havia ferramenta de conversão SVG→PNG disponível no ambiente sem instalar pacotes via
`apt`/`pip`. Se precisar de um fallback PNG (ex.: suporte a navegadores muito antigos ou ícone de
atalho no celular), gerar com `rsvg-convert`, `inkscape` ou `cairosvg`.

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
  `#habilidades`, `#experiencia`, `#projetos`, `#portfolios`, `#contato`) referenciadas pelo menu
  de navegação. A aba "Ferramentas" do menu leva à página própria `ferramentas/`.
- `#portfolios` ("Portfólios Web"/"Web Portfolios") — cards com miniatura de sites feitos pelo
  André (`belaspatas`, `peso-pesado-team`). As miniaturas são capturas estáticas da página inicial
  em `img/portfolio-<slug>.jpg` (800×500, 16:10), geradas com
  `firefox --headless --window-size=1280,800 --screenshot` e recortadas sem a barra de rolagem (os
  ~16px da direita) com PIL; ao mudar um desses sites, refazer a captura.
- `ferramentas/index.html` e `en/ferramentas/index.html` — página da ferramenta "Firewall
  Multivendor Configurator" (ver seção própria abaixo), fora do `index.html`. Reaproveitam o
  cabeçalho (links do menu apontam para `../#secao`, aba atual com `aria-current="page"`), a
  verificação `#humanGate` e o rodapé; assets com `../` (pt) ou `../../` (en). **Mudanças no
  cabeçalho, no `<head>` ou na verificação precisam ser replicadas nas quatro páginas.**
- `css/style.css` — todo o estilo, usando variáveis CSS em `:root` para cores e largura máxima do
  conteúdo. O cabeçalho usa `--max-width-nav` (1120px), mais largo que o conteúdo, para caber o
  menu completo. Breakpoint do menu mobile em `940px` (com as abas Ferramentas e Portfólios Web,
  os links não cabem abaixo disso; entre 941–1100px o espaçamento do menu é reduzido); a topologia da ferramenta
  empilha abaixo de `720px`.
- `js/script.js` — comportamentos da página: ano do rodapé, toggle do menu mobile (`.open` em
  `#navLinks`) e a verificação anti-robô `#humanGate` (ver seção própria abaixo).
- `js/fwconfig.js` — o "Firewall Multivendor Configurator" de `#ferramentas` (ver seção própria
  abaixo).
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

O link do CSS usa `?v=N` (`css/style.css?v=11`; o `js/script.js` também, `?v=5`; e `js/fwconfig.js?v=8`) para furar o cache do navegador (GitHub Pages
serve com `max-age=600`); incrementar em ambas as páginas ao mudar o layout do cabeçalho.

## Ferramentas: Firewall Multivendor Configurator

Página `ferramentas/` (aba "Ferramentas"/"Tools"; em inglês `en/ferramentas/`), lógica em
`js/fwconfig.js`. A página usa `.section-wide` (1280px) para a comparação lado a lado. Topologia com
Site A e Site B (ISP com IP público/gateway e interface WAN do firewall, slot de firewall, LAN
com IP e interface LAN do firewall — interfaces opcionais: vazias usam o padrão do fabricante,
mostrado como placeholder e definido em `VENDORS`); o usuário arrasta (ou
clica/toca, alternativa para celular) um firewall da paleta — Juniper SRX, FortiGate, Palo Alto, Cisco ASA —
para cada slot, e **Deploy** valida os dados e gera a configuração de cada lado (interfaces, rota
default, NAT de saída, políticas e VPN IPsec site-to-site com a suíte mais forte comum aos quatro fabricantes: IKEv2, AES-256-GCM, PRF SHA-384, ECDH P-384/DH 20, PFS, DPD — ver comentário no topo do JS), com
botões "Copiar configuração do Site A/B". Cada gerador devolve a configuração em blocos
(`{ chave: texto }`), exibidos em linhas na ordem de `BLOCK_ORDER` (sistema, interfaces, zonas,
objetos, fase 1, fase 2, roteamento, políticas, NAT — roteamento depois da VPN porque no FortiOS
a interface do túnel só existe após a fase 1): cada linha tem título, descrição curta (dicionário
`BLOCK_TEXT`, pt/en pelo `lang` da página) e as células do Site A e do Site B lado a lado, cada
uma com botão "Copiar bloco"; bloco que o fabricante não usa aparece como "não se aplica". O SRX sai em comandos `set`; o Cisco ASA usa VPN por crypto map (policy-based, sem
interface de túnel), com `vpn-filter` para o tráfego vindo da VPN e NAT de isenção para LAN ↔ LAN. Os demais textos
dinâmicos vêm dos `data-msg-*` de `#fwTool`, traduzidos em cada página; os ícones são `<symbol>`
SVG inline (genéricos, sem logos dos fabricantes). Os defaults usam faixas de documentação
(203.0.113.0/24, 198.51.100.0/24). Tudo roda no navegador; nada é enviado a servidor.

### Deploy Terraform

O botão **Deploy Terraform** gera, com os mesmos dados, um projeto Terraform por site (um
`main.tf` por firewall), nos mesmos blocos da CLI mais o bloco `provider` (required_providers,
variáveis de acesso sensíveis e a PSK como variável sensível). Geradores `fortigateTf`,
`paloaltoTf` e `srxTf` (campo `tf` em `VENDORS`), com atributos conferidos na documentação oficial
dos providers `fortinetdev/fortios` (~> 1.26), `PaloAltoNetworks/panos` (~> 2.0, sintaxe v2 com
`location`; regras via `*_policy_rules` para não apagar as existentes; o provider não faz commit)
e `jeremmfr/junos` (~> 2.20; commit a cada alteração; hostname e tcp-mss ficam como comentário
com o comando CLI, porque `junos_system`/`junos_security` gerenciam o bloco inteiro). O Cisco ASA
não tem provider com VPN IPsec (`CiscoDevNet/ciscoasa` cobre só interfaces, objetos, ACLs e rotas),
então `tf: null` e a coluna dele aparece como "não suportado". Comentários do HCL vêm de `TF_TEXT`
(pt/en). No modo Terraform aparece também o tutorial `#fwTfGuide` (HTML estático em cada
página, `<details>`): credenciais por fabricante, `TF_VAR_*`, init/validate/plan/apply, commit do
Palo Alto, verificação do túnel e cuidados com o `terraform.tfstate`. Nada disso foi testado com `terraform plan` em equipamento real.

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
normalmente (sem bloqueio). O bloqueio só é aplicado no domínio publicado
(`osakikiyohiko.github.io`): aberto localmente (`file://`, `localhost`), o Turnstile e o Worker
recusam a origem e o popup travaria o site com erro de conexão, então ele não aparece — os
links sensíveis (LinkedIn) ficam sem destino nesse caso.

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

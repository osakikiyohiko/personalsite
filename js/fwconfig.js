// Firewall Multivendor Configurator (#ferramentas): o usuário arrasta um firewall (Juniper SRX,
// FortiGate ou Palo Alto) para o Site A e para o Site B, informa os IPs públicos (ISP) e as LANs,
// e "Deploy" gera a configuração de cada lado, separada em blocos com título e descrição
// (interfaces, zonas, roteamento, fase 1, fase 2, políticas, NAT…), com a VPN IPsec site-to-site
// entre os dois sites. Os textos da interface vêm dos atributos data-msg-*
// de #fwTool, traduzidos em cada página.
//
// Criptografia do túnel: a mais forte suportada pelos três fabricantes, alinhada à suíte CNSA
// (NSA) e às recomendações do NIST — IKEv2; IKE com AES-256-GCM + PRF SHA-384 e ECDH P-384
// (grupo 20); ESP com AES-256-GCM (AEAD, sem HMAC separado) e PFS no grupo 20; SA do IKE de 8 h e
// do IPsec de 1 h; DPD ativo. Exige FortiOS 6.2+, PAN-OS 10.0+ e Junos 15.1X49+ (SRX).
(() => {
  const tool = document.getElementById("fwTool");
  if (!tool) return;

  const msg = tool.dataset;
  const $ = (id) => document.getElementById(id);
  const palette = tool.querySelectorAll(".fw-item");
  const slotEls = { a: $("fwSlotA"), b: $("fwSlotB") };
  const slots = { a: null, b: null };
  const tunnel = $("fwTunnel");
  const status = $("fwStatus");
  let picked = null; // firewall escolhido por clique/toque (alternativa ao arrastar, ex.: celular)

  // Endereçamento IPv4

  const MASK = (p) => (p === 0 ? 0 : (0xffffffff << (32 - p)) >>> 0);
  const toIp = (n) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");

  function parseIp(s) {
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s.trim());
    if (!m) return null;
    const o = m.slice(1).map(Number);
    if (o.some((n) => n > 255)) return null;
    return o[0] * 16777216 + o[1] * 65536 + o[2] * 256 + o[3];
  }

  // Endereço de interface em CIDR (ex.: 203.0.113.2/30): não pode ser o de rede nem o de broadcast.
  function parseIface(s) {
    const [ipStr, lenStr, extra] = s.trim().split("/");
    if (extra !== undefined || !/^\d{1,2}$/.test(lenStr || "")) return null;
    const ip = parseIp(ipStr);
    const prefix = Number(lenStr);
    if (ip === null || prefix < 8 || prefix > 30) return null;
    const mask = MASK(prefix);
    const net = (ip & mask) >>> 0;
    const bcast = (net | ~mask) >>> 0;
    if (ip === net || ip === bcast) return null;
    return {
      ip: toIp(ip),
      cidr: `${toIp(ip)}/${prefix}`,
      mask: toIp(mask),
      net: toIp(net),
      netCidr: `${toIp(net)}/${prefix}`,
      raw: { ip, net, prefix },
    };
  }

  const sameNet = (a, b) => {
    const mask = MASK(Math.min(a.prefix, b.prefix));
    return ((a.net & mask) >>> 0) === ((b.net & mask) >>> 0);
  };

  function randomPsk() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    const bytes = crypto.getRandomValues(new Uint8Array(40));
    return [...bytes].map((b) => chars[b % chars.length]).join("");
  }

  // Geradores de configuração. `c` = { site, peer, L (local), P (peer), psk }. Cada gerador devolve
  // os blocos da configuração ({ chave: texto }), na ordem de aplicação; o título e a descrição de
  // cada bloco vêm de BLOCK_TEXT, no idioma da página.

  const BLOCK_TEXT = {
    pt: {
      system: ["Sistema", "Nome do equipamento (hostname), que identifica o firewall em logs e na gerência."],
      interfaces: ["Interfaces", "Endereços da WAN (IP público do ISP) e da LAN, além da interface de túnel usada pela VPN."],
      zones: ["Zonas de segurança", "Agrupa as interfaces em zonas (untrust, trust e vpn), usadas como origem e destino das políticas."],
      addresses: ["Objetos de endereço", "Dá nome às LANs dos dois sites, para uso nas políticas de segurança."],
      routing: ["Roteamento", "Rota default para o gateway do ISP e rota para a LAN remota através do túnel IPsec."],
      phase1: ["VPN — Fase 1 (IKE)", "Estabelece o canal seguro entre os firewalls: IKEv2, AES-256-GCM, PRF SHA-384, ECDH P-384 (grupo 20), chave pré-compartilhada e DPD."],
      phase2: ["VPN — Fase 2 (IPsec)", "Define como o tráfego entre as LANs é cifrado: ESP com AES-256-GCM, PFS no grupo 20 e seletores de tráfego LAN local ↔ LAN remota."],
      policies: ["Políticas de segurança", "Libera o tráfego entre as LANs pela VPN, nos dois sentidos, e a saída da LAN para a Internet."],
      nat: ["NAT de saída", "Traduz a LAN para o IP público da WAN no acesso à Internet; o tráfego da VPN segue sem NAT."],
    },
    en: {
      system: ["System", "Device name (hostname), which identifies the firewall in logs and management."],
      interfaces: ["Interfaces", "WAN (ISP public IP) and LAN addresses, plus the tunnel interface used by the VPN."],
      zones: ["Security zones", "Groups the interfaces into zones (untrust, trust and vpn), used as source and destination in policies."],
      addresses: ["Address objects", "Names the LANs of both sites for use in the security policies."],
      routing: ["Routing", "Default route to the ISP gateway and a route to the remote LAN through the IPsec tunnel."],
      phase1: ["VPN — Phase 1 (IKE)", "Sets up the secure channel between the firewalls: IKEv2, AES-256-GCM, PRF SHA-384, ECDH P-384 (group 20), pre-shared key and DPD."],
      phase2: ["VPN — Phase 2 (IPsec)", "Defines how traffic between the LANs is encrypted: ESP with AES-256-GCM, PFS with group 20 and local LAN ↔ remote LAN traffic selectors."],
      policies: ["Security policies", "Allows traffic between the LANs over the VPN in both directions, and LAN access to the Internet."],
      nat: ["Outbound NAT", "Translates the LAN to the WAN public IP for Internet access; VPN traffic is not translated."],
    },
  };
  const blockText = BLOCK_TEXT[document.documentElement.lang.startsWith("pt") ? "pt" : "en"];

  // Junos (SRX): comandos `set`, colados em modo de configuração.
  function srx({ site, peer, L, P, psk }) {
    const ike = "set security ike";
    const ipsec = "set security ipsec";
    const gw = `gateway GW-SITE-${peer}`;
    const vpn = `vpn VPN-SITE-${peer}`;
    const zone = "set security zones security-zone";
    const nat = "set security nat source rule-set TRUST-TO-UNTRUST";
    const pol = "set security policies from-zone";
    const policy = (from, to, name, src, dst) => [
      `${pol} ${from} to-zone ${to} policy ${name} match source-address ${src}`,
      `${pol} ${from} to-zone ${to} policy ${name} match destination-address ${dst}`,
      `${pol} ${from} to-zone ${to} policy ${name} match application any`,
      `${pol} ${from} to-zone ${to} policy ${name} then permit`,
    ];
    const blocks = {
      system: [`set system host-name FW-SITE-${site}`],
      interfaces: [
        `set interfaces ge-0/0/0 unit 0 family inet address ${L.wan.cidr}`,
        `set interfaces ge-0/0/1 unit 0 family inet address ${L.lan.cidr}`,
        "set interfaces st0 unit 0 family inet",
      ],
      zones: [
        `${zone} untrust interfaces ge-0/0/0.0 host-inbound-traffic system-services ike`,
        `${zone} untrust interfaces ge-0/0/0.0 host-inbound-traffic system-services ping`,
        `${zone} trust interfaces ge-0/0/1.0 host-inbound-traffic system-services ping`,
        `${zone} trust interfaces ge-0/0/1.0 host-inbound-traffic system-services ssh`,
        `${zone} vpn interfaces st0.0`,
      ],
      addresses: [
        `${zone} trust address-book address LAN-SITE-${site} ${L.lan.netCidr}`,
        `${zone} vpn address-book address LAN-SITE-${peer} ${P.lan.netCidr}`,
      ],
      routing: [
        `set routing-options static route 0.0.0.0/0 next-hop ${L.gw}`,
        `set routing-options static route ${P.lan.netCidr} next-hop st0.0`,
      ],
      phase1: [
        `${ike} proposal IKE-AES256GCM-P384 authentication-method pre-shared-keys`,
        `${ike} proposal IKE-AES256GCM-P384 dh-group group20`,
        // Com AES-GCM no IKEv2, o authentication-algorithm é usado como PRF.
        `${ike} proposal IKE-AES256GCM-P384 authentication-algorithm sha-384`,
        `${ike} proposal IKE-AES256GCM-P384 encryption-algorithm aes-256-gcm`,
        `${ike} proposal IKE-AES256GCM-P384 lifetime-seconds 28800`,
        `${ike} policy IKE-POL-SITE-${peer} proposals IKE-AES256GCM-P384`,
        `${ike} policy IKE-POL-SITE-${peer} pre-shared-key ascii-text "${psk}"`,
        `${ike} ${gw} ike-policy IKE-POL-SITE-${peer}`,
        `${ike} ${gw} address ${P.wan.ip}`,
        `${ike} ${gw} external-interface ge-0/0/0.0`,
        `${ike} ${gw} local-address ${L.wan.ip}`,
        `${ike} ${gw} version v2-only`,
        `${ike} ${gw} dead-peer-detection probe-idle-tunnel`,
      ],
      phase2: [
        `${ipsec} proposal IPSEC-AES256GCM protocol esp`,
        // AES-GCM já autentica (AEAD): o ESP não leva authentication-algorithm.
        `${ipsec} proposal IPSEC-AES256GCM encryption-algorithm aes-256-gcm`,
        `${ipsec} proposal IPSEC-AES256GCM lifetime-seconds 3600`,
        `${ipsec} policy IPSEC-POL-SITE-${peer} perfect-forward-secrecy keys group20`,
        `${ipsec} policy IPSEC-POL-SITE-${peer} proposals IPSEC-AES256GCM`,
        `${ipsec} ${vpn} bind-interface st0.0`,
        `${ipsec} ${vpn} ike ${gw}`,
        `${ipsec} ${vpn} ike ipsec-policy IPSEC-POL-SITE-${peer}`,
        `${ipsec} ${vpn} ike proxy-identity local ${L.lan.netCidr}`,
        `${ipsec} ${vpn} ike proxy-identity remote ${P.lan.netCidr}`,
        `${ipsec} ${vpn} ike proxy-identity service any`,
        `${ipsec} ${vpn} establish-tunnels immediately`,
        "set security flow tcp-mss ipsec-vpn mss 1350",
      ],
      policies: [
        ...policy("trust", "vpn", "LAN-TO-VPN", `LAN-SITE-${site}`, `LAN-SITE-${peer}`),
        ...policy("vpn", "trust", "VPN-TO-LAN", `LAN-SITE-${peer}`, `LAN-SITE-${site}`),
        ...policy("trust", "untrust", "LAN-TO-INTERNET", `LAN-SITE-${site}`, "any"),
      ],
      nat: [
        `${nat} from zone trust`,
        `${nat} to zone untrust`,
        `${nat} rule SNAT-INTERNET match source-address ${L.lan.netCidr}`,
        `${nat} rule SNAT-INTERNET match destination-address 0.0.0.0/0`,
        `${nat} rule SNAT-INTERNET then source-nat interface`,
      ],
    };
    return Object.fromEntries(Object.entries(blocks).map(([k, lines]) => [k, lines.join("\n")]));
  }

  function fortigate({ site, peer, L, P, psk }) {
    const vpn = `VPN-SITE-${peer}`;
    return {
      system: `config system global
    set hostname "FW-SITE-${site}"
end`,
      interfaces: `config system interface
    edit "wan1"
        set mode static
        set ip ${L.wan.ip} ${L.wan.mask}
        set allowaccess ping
    next
    edit "internal"
        set ip ${L.lan.ip} ${L.lan.mask}
        set allowaccess ping https ssh
    next
end`,
      addresses: `config firewall address
    edit "LAN-SITE-${site}"
        set subnet ${L.lan.net} ${L.lan.mask}
    next
    edit "LAN-SITE-${peer}"
        set subnet ${P.lan.net} ${P.lan.mask}
    next
end`,
      phase1: `config vpn ipsec phase1-interface
    edit "${vpn}"
        set interface "wan1"
        set ike-version 2
        set peertype any
        set net-device disable
        set proposal aes256gcm-prfsha384
        set dhgrp 20
        set keylife 28800
        set dpd on-idle
        set remote-gw ${P.wan.ip}
        set psksecret "${psk}"
    next
end`,
      phase2: `config vpn ipsec phase2-interface
    edit "${vpn}"
        set phase1name "${vpn}"
        set proposal aes256gcm
        set pfs enable
        set dhgrp 20
        set replay enable
        set keylifeseconds 3600
        set auto-negotiate enable
        set src-subnet ${L.lan.net} ${L.lan.mask}
        set dst-subnet ${P.lan.net} ${P.lan.mask}
    next
end`,
      // No FortiOS a interface de túnel só existe depois da fase 1, por isso as rotas vêm depois dela.
      routing: `config router static
    edit 0
        set gateway ${L.gw}
        set device "wan1"
    next
    edit 0
        set dst ${P.lan.net} ${P.lan.mask}
        set device "${vpn}"
    next
    edit 0
        set dst ${P.lan.net} ${P.lan.mask}
        set blackhole enable
        set distance 254
    next
end`,
      policies: `config firewall policy
    edit 0
        set name "LAN-TO-VPN"
        set srcintf "internal"
        set dstintf "${vpn}"
        set srcaddr "LAN-SITE-${site}"
        set dstaddr "LAN-SITE-${peer}"
        set action accept
        set schedule "always"
        set service "ALL"
    next
    edit 0
        set name "VPN-TO-LAN"
        set srcintf "${vpn}"
        set dstintf "internal"
        set srcaddr "LAN-SITE-${peer}"
        set dstaddr "LAN-SITE-${site}"
        set action accept
        set schedule "always"
        set service "ALL"
    next
    edit 0
        set name "LAN-TO-INTERNET"
        set srcintf "internal"
        set dstintf "wan1"
        set srcaddr "LAN-SITE-${site}"
        set dstaddr "all"
        set action accept
        set schedule "always"
        set service "ALL"
        set nat enable
    next
end`,
    };
  }

  function paloalto({ site, peer, L, P, psk }) {
    const gw = `GW-SITE-${peer}`;
    const tun = `VPN-SITE-${peer}`;
    const vr = "set network virtual-router default";
    const ikeP = "set network ike crypto-profiles ike-crypto-profiles IKE-AES256GCM-P384";
    const espP = "set network ike crypto-profiles ipsec-crypto-profiles IPSEC-AES256GCM";
    const rule = "set rulebase security rules";
    return {
      system: `set deviceconfig system hostname FW-SITE-${site}`,
      interfaces: `set network interface ethernet ethernet1/1 layer3 ip ${L.wan.cidr}
set network interface ethernet ethernet1/2 layer3 ip ${L.lan.cidr}
set network interface tunnel units tunnel.1 comment "VPN to Site ${peer}"`,
      zones: `set zone untrust network layer3 ethernet1/1
set zone trust network layer3 ethernet1/2
set zone vpn network layer3 tunnel.1`,
      addresses: `set address LAN-SITE-${site} ip-netmask ${L.lan.netCidr}
set address LAN-SITE-${peer} ip-netmask ${P.lan.netCidr}`,
      routing: `${vr} interface [ ethernet1/1 ethernet1/2 tunnel.1 ]
${vr} routing-table ip static-route DEFAULT destination 0.0.0.0/0
${vr} routing-table ip static-route DEFAULT interface ethernet1/1
${vr} routing-table ip static-route DEFAULT nexthop ip-address ${L.gw}
${vr} routing-table ip static-route TO-SITE-${peer} destination ${P.lan.netCidr}
${vr} routing-table ip static-route TO-SITE-${peer} interface tunnel.1`,
      phase1: `${ikeP} encryption aes-256-gcm
${ikeP} hash sha384
${ikeP} dh-group group20
${ikeP} lifetime seconds 28800
set network ike gateway ${gw} authentication pre-shared-key key "${psk}"
set network ike gateway ${gw} protocol version ikev2
set network ike gateway ${gw} protocol ikev2 ike-crypto-profile IKE-AES256GCM-P384
set network ike gateway ${gw} protocol ikev2 dpd enable
set network ike gateway ${gw} local-address interface ethernet1/1
set network ike gateway ${gw} local-address ip ${L.wan.cidr}
set network ike gateway ${gw} peer-address ip ${P.wan.ip}`,
      phase2: `${espP} esp encryption aes-256-gcm
${espP} esp authentication none
${espP} dh-group group20
${espP} lifetime seconds 3600
set network tunnel ipsec ${tun} tunnel-interface tunnel.1
set network tunnel ipsec ${tun} auto-key ike-gateway ${gw}
set network tunnel ipsec ${tun} auto-key ipsec-crypto-profile IPSEC-AES256GCM
set network tunnel ipsec ${tun} auto-key proxy-id PROXY-1 local ${L.lan.netCidr}
set network tunnel ipsec ${tun} auto-key proxy-id PROXY-1 remote ${P.lan.netCidr}
set network tunnel ipsec ${tun} auto-key proxy-id PROXY-1 protocol any`,
      policies: `${rule} LAN-TO-VPN from trust to vpn source LAN-SITE-${site} destination LAN-SITE-${peer} source-user any category any application any service any action allow
${rule} VPN-TO-LAN from vpn to trust source LAN-SITE-${peer} destination LAN-SITE-${site} source-user any category any application any service any action allow
${rule} LAN-TO-INTERNET from trust to untrust source LAN-SITE-${site} destination any source-user any category any application any service application-default action allow`,
      nat: `set rulebase nat rules SNAT-INTERNET from trust to untrust source LAN-SITE-${site} destination any service any
set rulebase nat rules SNAT-INTERNET source-translation dynamic-ip-and-port interface-address interface ethernet1/1`,
    };
  }

  const VENDORS = {
    srx: { build: srx, wan: "ge-0/0/0", lan: "ge-0/0/1" },
    fortigate: { build: fortigate, wan: "wan1", lan: "internal" },
    paloalto: { build: paloalto, wan: "ethernet1/1", lan: "ethernet1/2" },
  };
  const vendorLabel = (v) => tool.querySelector(`.fw-item[data-vendor="${v}"]`).dataset.label;

  // Topologia: arrastar e soltar (ou clicar/tocar) firewalls nos sites

  function setStatus(text, kind) {
    status.textContent = text;
    status.className = "tool-status" + (kind ? " " + kind : "");
  }

  function markChanged() {
    tunnel.classList.remove("up");
  }

  function renderSlot(site) {
    const el = slotEls[site];
    const vendor = slots[site];
    el.classList.toggle("filled", !!vendor);
    el.draggable = !!vendor;
    el.querySelectorAll(".fw-placed").forEach((n) => n.remove());
    el.querySelector(".fw-slot-empty").hidden = !!vendor;
    if (!vendor) return;

    const placed = document.createElement("span");
    placed.className = `fw-placed v-${vendor}`;
    const icon = tool.querySelector(`.fw-item[data-vendor="${vendor}"] svg`).cloneNode(true);
    const name = document.createElement("strong");
    name.textContent = `${el.dataset.name} · ${vendorLabel(vendor)}`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "fw-remove";
    remove.setAttribute("aria-label", msg.msgRemove);
    remove.title = msg.msgRemove;
    remove.textContent = "×";
    remove.addEventListener("click", (e) => {
      e.stopPropagation();
      setSlot(site, null);
    });
    placed.append(icon, name, remove);
    el.appendChild(placed);
  }

  function setSlot(site, vendor) {
    slots[site] = vendor;
    renderSlot(site);
    markChanged();
  }

  function pick(vendor) {
    picked = picked === vendor ? null : vendor;
    palette.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.vendor === picked)));
    Object.values(slotEls).forEach((el) => el.classList.toggle("pick", !!picked));
  }

  palette.forEach((btn) => {
    btn.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", btn.dataset.vendor);
      e.dataTransfer.effectAllowed = "copyMove";
    });
    btn.addEventListener("click", () => pick(btn.dataset.vendor));
  });

  Object.entries(slotEls).forEach(([site, el]) => {
    el.addEventListener("dragstart", (e) => {
      // Firewall já posicionado: pode ser arrastado para o outro site.
      e.dataTransfer.setData("text/plain", `${slots[site]}|${site}`);
      e.dataTransfer.effectAllowed = "move";
    });
    el.addEventListener("dragover", (e) => {
      e.preventDefault();
      el.classList.add("over");
    });
    el.addEventListener("dragleave", () => el.classList.remove("over"));
    el.addEventListener("drop", (e) => {
      e.preventDefault();
      el.classList.remove("over");
      const [vendor, from] = e.dataTransfer.getData("text/plain").split("|");
      if (!VENDORS[vendor] || from === site) return;
      if (from && slotEls[from]) setSlot(from, null);
      setSlot(site, vendor);
      setStatus("");
    });
    const place = () => {
      if (!picked) return;
      setSlot(site, picked);
      pick(null);
      setStatus("");
    };
    el.addEventListener("click", place);
    el.addEventListener("keydown", (e) => {
      if (e.target === el && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        place();
      }
    });
  });

  tool.querySelectorAll(".topology input, #fwPsk").forEach((input) =>
    input.addEventListener("input", () => {
      input.removeAttribute("aria-invalid");
      markChanged();
    })
  );

  $("fwPsk").value = randomPsk();
  $("fwPskGen").addEventListener("click", () => {
    $("fwPsk").value = randomPsk();
    markChanged();
  });

  // Deploy: valida os dados e gera a configuração dos dois sites

  function fail(input, text) {
    if (input) {
      input.setAttribute("aria-invalid", "true");
      input.focus();
    }
    setStatus(text, "error");
    return null;
  }

  function readSite(site) {
    const S = site.toUpperCase();
    const wanIn = $(`fwWan${S}`);
    const gwIn = $(`fwGw${S}`);
    const lanIn = $(`fwLan${S}`);
    const invalid = (input) => fail(input, msg.msgInvalid.replace("{field}", input.dataset.name));

    const wan = parseIface(wanIn.value);
    if (!wan) return invalid(wanIn);
    const gw = parseIp(gwIn.value);
    if (gw === null) return invalid(gwIn);
    if (!sameNet(wan.raw, { net: gw, prefix: wan.raw.prefix }) || gw === wan.raw.ip) {
      return fail(gwIn, msg.msgGw.replace("{site}", `Site ${S}`));
    }
    const lan = parseIface(lanIn.value);
    if (!lan) return invalid(lanIn);
    if (sameNet(lan.raw, wan.raw)) return fail(lanIn, msg.msgLanWan.replace("{site}", `Site ${S}`));
    return { wan, gw: toIp(gw), lan, inputs: { wanIn, lanIn } };
  }

  // Um bloco por etapa da configuração: título numerado, descrição curta, código e botão de copiar.
  function renderBlocks(container, blocks) {
    container.replaceChildren(
      ...Object.entries(blocks).map(([key, text], i) => {
        const [title, desc] = blockText[key];
        const block = document.createElement("section");
        block.className = "fw-block";
        const head = document.createElement("div");
        head.className = "fw-block-head";
        const h = document.createElement("h5");
        h.textContent = `${i + 1}. ${title}`;
        const copy = document.createElement("button");
        copy.type = "button";
        copy.className = "btn-secondary btn-copy btn-copy-block";
        copy.textContent = msg.msgCopyBlock;
        copy.setAttribute("aria-label", `${msg.msgCopyBlock}: ${title}`);
        head.append(h, copy);
        const p = document.createElement("p");
        p.className = "fw-block-desc";
        p.textContent = desc;
        const pre = document.createElement("pre");
        const code = document.createElement("code");
        code.textContent = text;
        pre.appendChild(code);
        block.append(head, p, pre);
        return block;
      })
    );
  }

  function deploy() {
    if (!slots.a || !slots.b) {
      Object.entries(slotEls).forEach(([site, el]) => !slots[site] && el.classList.add("missing"));
      setTimeout(() => Object.values(slotEls).forEach((el) => el.classList.remove("missing")), 1200);
      return setStatus(msg.msgNeedFw, "error");
    }
    const A = readSite("a");
    if (!A) return;
    const B = readSite("b");
    if (!B) return;
    if (A.wan.ip === B.wan.ip) return fail(B.inputs.wanIn, msg.msgSameIp);
    if (sameNet(A.lan.raw, B.lan.raw)) return fail(B.inputs.lanIn, msg.msgOverlap);
    const pskIn = $("fwPsk");
    const psk = pskIn.value.trim();
    if (!/^[A-Za-z0-9!@#$%&*_+=.,:-]{20,64}$/.test(psk)) return fail(pskIn, msg.msgPsk);

    const sites = { a: { L: A, P: B, peer: "b" }, b: { L: B, P: A, peer: "a" } };
    Object.entries(sites).forEach(([site, { L, P, peer }]) => {
      const S = site.toUpperCase();
      const v = VENDORS[slots[site]];
      renderBlocks($(`fwCfg${S}`), v.build({ site: S, peer: peer.toUpperCase(), L, P, psk }));
      $(`fwTitle${S}`).textContent = `Site ${S} · ${vendorLabel(slots[site])}`;
      $(`fwNote${S}`).textContent = msg.msgIfaces.replace("{wan}", v.wan).replace("{lan}", v.lan);
    });

    const output = $("fwOutput");
    output.hidden = false;
    tunnel.classList.add("up");
    setStatus(msg.msgOk, "ok");
    output.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  $("fwDeploy").addEventListener("click", deploy);

  // Copiar configuração

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback para navegadores sem Clipboard API (ou página fora de contexto seguro).
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      if (!ok) throw new Error("copy");
    }
  }

  // "Copiar configuração" copia todos os blocos do site; "Copiar bloco", só o bloco dele.
  tool.addEventListener("click", async (e) => {
    const btn = e.target.closest(".btn-copy");
    if (!btn) return;
    const scope = btn.dataset.target ? $(btn.dataset.target) : btn.closest(".fw-block");
    const text = [...scope.querySelectorAll("code")].map((code) => code.textContent).join("\n\n");
    btn.dataset.label ??= btn.textContent;
    try {
      await copyText(text);
      btn.textContent = msg.msgCopied;
    } catch {
      btn.textContent = msg.msgCopyError;
    }
    clearTimeout(btn.resetTimer);
    btn.resetTimer = setTimeout(() => (btn.textContent = btn.dataset.label), 1800);
  });
})();

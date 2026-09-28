// Firewall Multivendor Configurator (ferramentas/): o usuário arrasta um firewall (Juniper SRX,
// FortiGate, Palo Alto ou Cisco ASA) para o Site A e para o Site B, informa os IPs públicos (ISP) e as LANs,
// e "Deploy" gera a configuração de cada lado (CLI; "Deploy Terraform" gera um projeto Terraform), separada em blocos com título e descrição
// (interfaces, zonas, roteamento, fase 1, fase 2, políticas, NAT…), com a VPN IPsec site-to-site
// entre os dois sites. Os textos da interface vêm dos atributos data-msg-*
// de #fwTool, traduzidos em cada página.
//
// Criptografia do túnel: a mais forte suportada pelos quatro fabricantes, alinhada à suíte CNSA
// (NSA) e às recomendações do NIST — IKEv2; IKE com AES-256-GCM + PRF SHA-384 e ECDH P-384
// (grupo 20); ESP com AES-256-GCM (AEAD, sem HMAC separado) e PFS no grupo 20; SA do IKE de 8 h e
// do IPsec de 1 h; DPD ativo. Exige FortiOS 6.2+, PAN-OS 10.0+, Junos 15.1X49+ (SRX) e ASA 9.0+.
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

  // Geradores de configuração. `c` = { site, peer, L (local), P (peer), psk, wan, lan }, sendo
  // wan/lan os nomes das interfaces do firewall local (informados ou o padrão do fabricante). Cada gerador devolve
  // os blocos da configuração ({ chave: texto }), na ordem de aplicação; o título e a descrição de
  // cada bloco vêm de BLOCK_TEXT, no idioma da página.

  const BLOCK_TEXT = {
    pt: {
      provider: ["Provider Terraform", "Declara o provider do fabricante, a conexão com o firewall (credenciais em variáveis sensíveis) e a PSK da VPN. Cada site é um projeto separado: rode terraform init e terraform apply em cada um."],
      system: ["Sistema", "Nome do equipamento (hostname), que identifica o firewall em logs e na gerência."],
      interfaces: ["Interfaces", "Endereços da WAN (IP público do ISP) e da LAN, além da interface de túnel nas VPNs baseadas em rota."],
      zones: ["Zonas de segurança", "Agrupa as interfaces em zonas (untrust, trust e vpn), usadas como origem e destino das políticas."],
      addresses: ["Objetos de endereço", "Dá nome às LANs dos dois sites, para uso nas políticas de segurança."],
      routing: ["Roteamento", "Rota default para o gateway do ISP e, nas VPNs baseadas em rota, rota para a LAN remota pelo túnel IPsec (no ASA, a crypto map cifra o tráfego que segue a rota default)."],
      phase1: ["VPN — Fase 1 (IKE)", "Estabelece o canal seguro entre os firewalls: IKEv2, AES-256-GCM, PRF SHA-384, ECDH P-384 (grupo 20), chave pré-compartilhada e DPD."],
      phase2: ["VPN — Fase 2 (IPsec)", "Define como o tráfego entre as LANs é cifrado: ESP com AES-256-GCM, PFS no grupo 20 e seletores de tráfego LAN local ↔ LAN remota."],
      policies: ["Políticas de segurança", "Libera o tráfego entre as LANs pela VPN, nos dois sentidos, e a saída da LAN para a Internet."],
      nat: ["NAT de saída", "Traduz a LAN para o IP público da WAN no acesso à Internet; o tráfego da VPN segue sem NAT."],
    },
    en: {
      provider: ["Terraform provider", "Declares the vendor provider, the firewall connection (credentials in sensitive variables) and the VPN PSK. Each site is a separate project: run terraform init and terraform apply in each one."],
      system: ["System", "Device name (hostname), which identifies the firewall in logs and management."],
      interfaces: ["Interfaces", "WAN (ISP public IP) and LAN addresses, plus the tunnel interface on route-based VPNs."],
      zones: ["Security zones", "Groups the interfaces into zones (untrust, trust and vpn), used as source and destination in policies."],
      addresses: ["Address objects", "Names the LANs of both sites for use in the security policies."],
      routing: ["Routing", "Default route to the ISP gateway and, on route-based VPNs, a route to the remote LAN through the IPsec tunnel (on the ASA, the crypto map encrypts traffic following the default route)."],
      phase1: ["VPN — Phase 1 (IKE)", "Sets up the secure channel between the firewalls: IKEv2, AES-256-GCM, PRF SHA-384, ECDH P-384 (group 20), pre-shared key and DPD."],
      phase2: ["VPN — Phase 2 (IPsec)", "Defines how traffic between the LANs is encrypted: ESP with AES-256-GCM, PFS with group 20 and local LAN ↔ remote LAN traffic selectors."],
      policies: ["Security policies", "Allows traffic between the LANs over the VPN in both directions, and LAN access to the Internet."],
      nat: ["Outbound NAT", "Translates the LAN to the WAN public IP for Internet access; VPN traffic is not translated."],
    },
  };
  const blockText = BLOCK_TEXT[document.documentElement.lang.startsWith("pt") ? "pt" : "en"];

  // Junos (SRX): comandos `set`, colados em modo de configuração.
  function srx({ site, peer, L, P, psk, wan, lan }) {
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
        `set interfaces ${wan} unit 0 family inet address ${L.wan.cidr}`,
        `set interfaces ${lan} unit 0 family inet address ${L.lan.cidr}`,
        "set interfaces st0 unit 0 family inet",
      ],
      zones: [
        `${zone} untrust interfaces ${wan}.0 host-inbound-traffic system-services ike`,
        `${zone} untrust interfaces ${wan}.0 host-inbound-traffic system-services ping`,
        `${zone} trust interfaces ${lan}.0 host-inbound-traffic system-services ping`,
        `${zone} trust interfaces ${lan}.0 host-inbound-traffic system-services ssh`,
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
        `${ike} ${gw} external-interface ${wan}.0`,
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

  function fortigate({ site, peer, L, P, psk, wan, lan }) {
    const vpn = `VPN-SITE-${peer}`;
    return {
      system: `config system global
    set hostname "FW-SITE-${site}"
end`,
      interfaces: `config system interface
    edit "${wan}"
        set mode static
        set ip ${L.wan.ip} ${L.wan.mask}
        set allowaccess ping
    next
    edit "${lan}"
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
        set interface "${wan}"
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
      routing: `config router static
    edit 0
        set gateway ${L.gw}
        set device "${wan}"
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
        set srcintf "${lan}"
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
        set dstintf "${lan}"
        set srcaddr "LAN-SITE-${peer}"
        set dstaddr "LAN-SITE-${site}"
        set action accept
        set schedule "always"
        set service "ALL"
    next
    edit 0
        set name "LAN-TO-INTERNET"
        set srcintf "${lan}"
        set dstintf "${wan}"
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

  function paloalto({ site, peer, L, P, psk, wan, lan }) {
    // Interfaces agregadas (aeN) ficam em outro ramo da árvore de configuração do PAN-OS.
    const ifType = (name) => (/^ae\d/.test(name) ? "aggregate-ethernet" : "ethernet");
    const gw = `GW-SITE-${peer}`;
    const tun = `VPN-SITE-${peer}`;
    const vr = "set network virtual-router default";
    const ikeP = "set network ike crypto-profiles ike-crypto-profiles IKE-AES256GCM-P384";
    const espP = "set network ike crypto-profiles ipsec-crypto-profiles IPSEC-AES256GCM";
    const rule = "set rulebase security rules";
    return {
      system: `set deviceconfig system hostname FW-SITE-${site}`,
      interfaces: `set network interface ${ifType(wan)} ${wan} layer3 ip ${L.wan.cidr}
set network interface ${ifType(lan)} ${lan} layer3 ip ${L.lan.cidr}
set network interface tunnel units tunnel.1 comment "VPN to Site ${peer}"`,
      zones: `set zone untrust network layer3 ${wan}
set zone trust network layer3 ${lan}
set zone vpn network layer3 tunnel.1`,
      addresses: `set address LAN-SITE-${site} ip-netmask ${L.lan.netCidr}
set address LAN-SITE-${peer} ip-netmask ${P.lan.netCidr}`,
      routing: `${vr} interface [ ${wan} ${lan} tunnel.1 ]
${vr} routing-table ip static-route DEFAULT destination 0.0.0.0/0
${vr} routing-table ip static-route DEFAULT interface ${wan}
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
set network ike gateway ${gw} local-address interface ${wan}
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
set rulebase nat rules SNAT-INTERNET source-translation dynamic-ip-and-port interface-address interface ${wan}`,
    };
  }

  // Cisco ASA (9.0+): VPN por crypto map (policy-based), com os mesmos seletores LAN ↔ LAN dos
  // demais fabricantes. Com AES-GCM, o integrity do IKEv2 e do ESP fica "null" (o GCM já autentica).
  function asa({ site, peer, L, P, psk, wan, lan }) {
    const map = "crypto map OUTSIDE-MAP 10";
    return {
      system: `hostname FW-SITE-${site}`,
      interfaces: `interface ${wan}
 nameif outside
 security-level 0
 ip address ${L.wan.ip} ${L.wan.mask}
 no shutdown
interface ${lan}
 nameif inside
 security-level 100
 ip address ${L.lan.ip} ${L.lan.mask}
 no shutdown`,
      addresses: `object network LAN-SITE-${site}
 subnet ${L.lan.net} ${L.lan.mask}
object network LAN-SITE-${peer}
 subnet ${P.lan.net} ${P.lan.mask}`,
      phase1: `crypto ikev2 policy 10
 encryption aes-gcm-256
 integrity null
 group 20
 prf sha384
 lifetime seconds 28800
crypto ikev2 enable outside
tunnel-group ${P.wan.ip} type ipsec-l2l
tunnel-group ${P.wan.ip} ipsec-attributes
 ikev2 remote-authentication pre-shared-key ${psk}
 ikev2 local-authentication pre-shared-key ${psk}
 isakmp keepalive threshold 10 retry 2`,
      phase2: `access-list VPN-SITE-${peer} extended permit ip object LAN-SITE-${site} object LAN-SITE-${peer}
crypto ipsec ikev2 ipsec-proposal AES256GCM
 protocol esp encryption aes-gcm-256
 protocol esp integrity null
${map} match address VPN-SITE-${peer}
${map} set peer ${P.wan.ip}
${map} set ikev2 ipsec-proposal AES256GCM
${map} set pfs group20
${map} set security-association lifetime seconds 3600
crypto map OUTSIDE-MAP interface outside
sysopt connection tcpmss 1350`,
      routing: `route outside 0.0.0.0 0.0.0.0 ${L.gw}`,
      // Tráfego vindo da VPN é filtrado pelo vpn-filter (origem = LAN remota, destino = LAN local).
      policies: `access-list INSIDE-IN extended permit ip object LAN-SITE-${site} object LAN-SITE-${peer}
access-list INSIDE-IN extended permit ip object LAN-SITE-${site} any
access-group INSIDE-IN in interface inside
access-list VPN-FILTER-SITE-${peer} extended permit ip object LAN-SITE-${peer} object LAN-SITE-${site}
group-policy GP-SITE-${peer} internal
group-policy GP-SITE-${peer} attributes
 vpn-tunnel-protocol ikev2
 vpn-filter value VPN-FILTER-SITE-${peer}
tunnel-group ${P.wan.ip} general-attributes
 default-group-policy GP-SITE-${peer}`,
      nat: `nat (inside,outside) source static LAN-SITE-${site} LAN-SITE-${site} destination static LAN-SITE-${peer} LAN-SITE-${peer} no-proxy-arp route-lookup
object network LAN-SITE-${site}
 nat (inside,outside) dynamic interface`,
    };
  }

  // Geradores Terraform ("Deploy Terraform"): um projeto por site (main.tf), com os mesmos blocos
  // da CLI mais o bloco "provider". Atributos conferidos na documentação oficial de cada provider:
  // fortinetdev/fortios 1.26, PaloAltoNetworks/panos 2.0 e jeremmfr/junos 2.20. O Cisco ASA não
  // tem provider com suporte a VPN IPsec (CiscoDevNet/ciscoasa cobre só interfaces, objetos, ACLs e
  // rotas, pela REST API descontinuada), então fica sem geração Terraform.

  const TF_TEXT = {
    pt: {
      host: "Endereço de gerência do firewall",
      user: "Usuário SSH/NETCONF",
      psk: "Chave pré-compartilhada da VPN (a mesma nos dois sites). Prefira definir por TF_VAR_vpn_psk ou terraform.tfvars em vez de deixar no código.",
      insecure: "Certificado autoassinado; use false com certificado válido.",
      fgtImport: "As interfaces físicas já existem no FortiGate: se o apply falhar ao criá-las, importe-as antes (terraform import fortios_system_interface.wan <nome>).",
      panCommit: "O provider não faz commit: depois do apply, faça commit no firewall (GUI, CLI ou a action panos_commit).",
      panVr: 'Usa o virtual router "default", que já existe no firewall.',
      junosCommit: "O provider faz commit no equipamento a cada alteração.",
      junosSystem: 'Hostname fora do Terraform: o recurso junos_system gerencia todo o bloco "system" e poderia sobrescrever outras opções. Configure pela CLI:',
      junosMss: 'Ajuste de MSS fora do Terraform (o recurso junos_security gerencia todo o bloco "security"). Configure pela CLI:',
    },
    en: {
      host: "Firewall management address",
      user: "SSH/NETCONF user",
      psk: "VPN pre-shared key (the same on both sites). Prefer setting it via TF_VAR_vpn_psk or terraform.tfvars instead of keeping it in code.",
      insecure: "Self-signed certificate; use false with a valid certificate.",
      fgtImport: "Physical interfaces already exist on the FortiGate: if apply fails to create them, import them first (terraform import fortios_system_interface.wan <name>).",
      panCommit: "The provider does not commit: after apply, commit on the firewall (GUI, CLI or the panos_commit action).",
      panVr: 'Uses the "default" virtual router, which already exists on the firewall.',
      junosCommit: "The provider commits on the device after each change.",
      junosSystem: 'Hostname outside Terraform: the junos_system resource manages the whole "system" block and could overwrite other options. Configure it via CLI:',
      junosMss: 'MSS adjustment outside Terraform (the junos_security resource manages the whole "security" block). Configure it via CLI:',
    },
  };
  const tfText = TF_TEXT[document.documentElement.lang.startsWith("pt") ? "pt" : "en"];

  const tfId = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_");

  // Cabeçalho comum: required_providers, variáveis de acesso e a PSK (sensível).
  function tfHeader(provider, source, version, vars, providerBody) {
    const varBlocks = vars
      .map(([name, desc, sensitive]) =>
        sensitive
          ? `variable "${name}" {\n  type      = string\n  sensitive = true\n}`
          : `variable "${name}" {\n  description = "${desc}"\n  type        = string\n}`
      )
      .join("\n\n");
    return `terraform {
  required_providers {
    ${provider} = {
      source  = "${source}"
      version = "${version}"
    }
  }
}

${varBlocks}

provider "${provider}" {
${providerBody}
}`;
  }

  const tfPsk = (psk) => `# ${tfText.psk}
variable "vpn_psk" {
  type      = string
  sensitive = true
  default   = "${psk}"
}`;

  function fortigateTf({ site, peer, L, P, psk, wan, lan }) {
    const vpn = `VPN-SITE-${peer}`;
    const id = tfId(vpn);
    const lanL = `lan_site_${site.toLowerCase()}`;
    const lanP = `lan_site_${peer.toLowerCase()}`;
    const policy = (name, src, dst, srcaddr, dstaddr, extra = "") => `resource "fortios_firewall_policy" "${tfId(name)}" {
  name     = "${name}"
  action   = "accept"
  schedule = "always"${extra}

  srcintf {
    name = ${src}
  }
  dstintf {
    name = ${dst}
  }
  srcaddr {
    name = ${srcaddr}
  }
  dstaddr {
    name = ${dstaddr}
  }
  service {
    name = "ALL"
  }
}`;
    return {
      provider: `${tfHeader("fortios", "fortinetdev/fortios", "~> 1.26", [
        ["fortigate_host", `${tfText.host} FW-SITE-${site}`],
        ["fortigate_token", "", true],
      ], `  hostname = var.fortigate_host
  token    = var.fortigate_token
  insecure = true # ${tfText.insecure}`)}

${tfPsk(psk)}`,
      system: `resource "fortios_system_global" "global" {
  hostname = "FW-SITE-${site}"
}`,
      interfaces: `# ${tfText.fgtImport}
resource "fortios_system_interface" "wan" {
  name        = "${wan}"
  vdom        = "root"
  mode        = "static"
  ip          = "${L.wan.ip} ${L.wan.mask}"
  allowaccess = "ping"
}

resource "fortios_system_interface" "lan" {
  name        = "${lan}"
  vdom        = "root"
  mode        = "static"
  ip          = "${L.lan.ip} ${L.lan.mask}"
  allowaccess = "ping https ssh"
}`,
      addresses: `resource "fortios_firewall_address" "${lanL}" {
  name   = "LAN-SITE-${site}"
  type   = "ipmask"
  subnet = "${L.lan.net} ${L.lan.mask}"
}

resource "fortios_firewall_address" "${lanP}" {
  name   = "LAN-SITE-${peer}"
  type   = "ipmask"
  subnet = "${P.lan.net} ${P.lan.mask}"
}`,
      phase1: `resource "fortios_vpnipsec_phase1interface" "${id}" {
  name        = "${vpn}"
  interface   = fortios_system_interface.wan.name
  ike_version = "2"
  peertype    = "any"
  net_device  = "disable"
  proposal    = "aes256gcm-prfsha384"
  dhgrp       = "20"
  keylife     = 28800
  dpd         = "on-idle"
  remote_gw   = "${P.wan.ip}"
  psksecret   = var.vpn_psk
}`,
      phase2: `resource "fortios_vpnipsec_phase2interface" "${id}" {
  name           = "${vpn}"
  phase1name     = fortios_vpnipsec_phase1interface.${id}.name
  proposal       = "aes256gcm"
  pfs            = "enable"
  dhgrp          = "20"
  replay         = "enable"
  keylifeseconds = 3600
  auto_negotiate = "enable"
  src_addr_type  = "subnet"
  src_subnet     = "${L.lan.net} ${L.lan.mask}"
  dst_addr_type  = "subnet"
  dst_subnet     = "${P.lan.net} ${P.lan.mask}"
}`,
      routing: `resource "fortios_router_static" "default" {
  dst     = "0.0.0.0 0.0.0.0"
  gateway = "${L.gw}"
  device  = fortios_system_interface.wan.name
}

resource "fortios_router_static" "to_site_${peer.toLowerCase()}" {
  dst    = "${P.lan.net} ${P.lan.mask}"
  device = fortios_vpnipsec_phase1interface.${id}.name
}

resource "fortios_router_static" "to_site_${peer.toLowerCase()}_blackhole" {
  dst       = "${P.lan.net} ${P.lan.mask}"
  blackhole = "enable"
  distance  = 254
}`,
      policies: [
        policy("LAN-TO-VPN", "fortios_system_interface.lan.name", `fortios_vpnipsec_phase1interface.${id}.name`, `fortios_firewall_address.${lanL}.name`, `fortios_firewall_address.${lanP}.name`),
        policy("VPN-TO-LAN", `fortios_vpnipsec_phase1interface.${id}.name`, "fortios_system_interface.lan.name", `fortios_firewall_address.${lanP}.name`, `fortios_firewall_address.${lanL}.name`),
        policy("LAN-TO-INTERNET", "fortios_system_interface.lan.name", "fortios_system_interface.wan.name", `fortios_firewall_address.${lanL}.name`, '"all"', '\n  nat      = "enable"'),
      ].join("\n\n"),
    };
  }

  function paloaltoTf({ site, peer, L, P, psk, wan, lan }) {
    const ifRes = (name) => (/^ae\d/.test(name) ? "panos_aggregate_interface" : "panos_ethernet_interface");
    const gw = `GW-SITE-${peer}`;
    const tun = `VPN-SITE-${peer}`;
    const lanL = `lan_site_${site.toLowerCase()}`;
    const lanP = `lan_site_${peer.toLowerCase()}`;
    const rule = (name, from, to, src, dst, service) => `    {
      name                  = "${name}"
      source_zones          = [panos_zone.${from}.name]
      destination_zones     = [panos_zone.${to}.name]
      source_addresses      = [${src}]
      destination_addresses = [${dst}]
      applications          = ["any"]
      services              = ["${service}"]
      action                = "allow"
    },`;
    const vri = (name, ref) => `resource "panos_virtual_router_interface" "${name}" {
  location       = local.ngfw
  virtual_router = "default"
  interface      = ${ref}
}`;
    return {
      provider: `${tfHeader("panos", "PaloAltoNetworks/panos", "~> 2.0", [
        ["panos_host", `${tfText.host} FW-SITE-${site}`],
        ["panos_api_key", "", true],
      ], `  hostname                = var.panos_host
  api_key                 = var.panos_api_key
  skip_verify_certificate = true # ${tfText.insecure}`)}

# ${tfText.panCommit}

${tfPsk(psk)}

locals {
  ngfw = { ngfw = { ngfw_device = "localhost.localdomain" } }
  vsys = { vsys = { name = "vsys1", ngfw_device = "localhost.localdomain" } }
}`,
      system: `resource "panos_general_settings" "system" {
  location = { system = { device = "localhost.localdomain" } }
  hostname = "FW-SITE-${site}"
}`,
      interfaces: `resource "${ifRes(wan)}" "wan" {
  location = local.ngfw
  name     = "${wan}"
  layer3 = {
    ips = [{ name = "${L.wan.cidr}" }]
  }
}

resource "${ifRes(lan)}" "lan" {
  location = local.ngfw
  name     = "${lan}"
  layer3 = {
    ips = [{ name = "${L.lan.cidr}" }]
  }
}

resource "panos_tunnel_interface" "vpn" {
  location = local.ngfw
  name     = "tunnel.1"
  comment  = "VPN to Site ${peer}"
}`,
      zones: ["untrust:wan", "trust:lan"]
        .map((z) => z.split(":"))
        .map(([zone, iface]) => `resource "panos_zone" "${zone}" {
  location = local.vsys
  name     = "${zone}"
  network = {
    layer3 = [${ifRes(iface === "wan" ? wan : lan)}.${iface}.name]
  }
}`)
        .concat(`resource "panos_zone" "vpn" {
  location = local.vsys
  name     = "vpn"
  network = {
    layer3 = [panos_tunnel_interface.vpn.name]
  }
}`)
        .join("\n\n"),
      addresses: `resource "panos_address" "${lanL}" {
  location   = local.vsys
  name       = "LAN-SITE-${site}"
  ip_netmask = "${L.lan.netCidr}"
}

resource "panos_address" "${lanP}" {
  location   = local.vsys
  name       = "LAN-SITE-${peer}"
  ip_netmask = "${P.lan.netCidr}"
}`,
      phase1: `resource "panos_ike_crypto_profile" "ike" {
  location   = local.ngfw
  name       = "IKE-AES256GCM-P384"
  encryption = ["aes-256-gcm"]
  hash       = ["sha384"]
  dh_group   = ["group20"]
  lifetime   = { seconds = 28800 }
}

resource "panos_ike_gateway" "${tfId(gw)}" {
  location = local.ngfw
  name     = "${gw}"
  authentication = {
    pre_shared_key = { key = var.vpn_psk }
  }
  local_address = {
    interface = ${ifRes(wan)}.wan.name
    ip        = "${L.wan.cidr}"
  }
  peer_address = { ip = "${P.wan.ip}" }
  protocol = {
    version = "ikev2"
    ikev2 = {
      ike_crypto_profile = panos_ike_crypto_profile.ike.name
      dpd                = { enable = true }
    }
  }
}`,
      phase2: `resource "panos_ipsec_crypto_profile" "ipsec" {
  location = local.ngfw
  name     = "IPSEC-AES256GCM"
  esp = {
    encryption     = ["aes-256-gcm"]
    authentication = ["none"]
  }
  dh_group = "group20"
  lifetime = { seconds = 3600 }
}

resource "panos_ipsec_tunnel" "${tfId(tun)}" {
  location         = local.ngfw
  name             = "${tun}"
  tunnel_interface = panos_tunnel_interface.vpn.name
  anti_replay      = true
  auto_key = {
    ike_gateway          = [{ name = panos_ike_gateway.${tfId(gw)}.name }]
    ipsec_crypto_profile = panos_ipsec_crypto_profile.ipsec.name
    proxy_id = [{
      name     = "PROXY-1"
      local    = "${L.lan.netCidr}"
      remote   = "${P.lan.netCidr}"
      protocol = { any = {} }
    }]
  }
}`,
      routing: `# ${tfText.panVr}
${vri("wan", `${ifRes(wan)}.wan.name`)}

${vri("lan", `${ifRes(lan)}.lan.name`)}

${vri("vpn", "panos_tunnel_interface.vpn.name")}

resource "panos_virtual_router_static_route_ipv4" "default" {
  location       = local.ngfw
  virtual_router = "default"
  name           = "DEFAULT"
  destination    = "0.0.0.0/0"
  interface      = ${ifRes(wan)}.wan.name
  nexthop        = { ip_address = "${L.gw}" }
}

resource "panos_virtual_router_static_route_ipv4" "to_site_${peer.toLowerCase()}" {
  location       = local.ngfw
  virtual_router = "default"
  name           = "TO-SITE-${peer}"
  destination    = "${P.lan.netCidr}"
  interface      = panos_tunnel_interface.vpn.name
}`,
      policies: `resource "panos_security_policy_rules" "vpn_site_${peer.toLowerCase()}" {
  location = local.vsys
  position = { where = "last" }
  rules = [
${rule("LAN-TO-VPN", "trust", "vpn", `panos_address.${lanL}.name`, `panos_address.${lanP}.name`, "any")}
${rule("VPN-TO-LAN", "vpn", "trust", `panos_address.${lanP}.name`, `panos_address.${lanL}.name`, "any")}
${rule("LAN-TO-INTERNET", "trust", "untrust", `panos_address.${lanL}.name`, '"any"', "application-default")}
  ]
}`,
      nat: `resource "panos_nat_policy_rules" "snat_internet" {
  location = local.vsys
  position = { where = "last" }
  rules = [{
    name                  = "SNAT-INTERNET"
    source_zones          = [panos_zone.trust.name]
    destination_zone      = [panos_zone.untrust.name]
    source_addresses      = [panos_address.${lanL}.name]
    destination_addresses = ["any"]
    service               = "any"
    source_translation = {
      dynamic_ip_and_port = {
        interface_address = { interface = ${ifRes(wan)}.wan.name }
      }
    }
  }]
}`,
    };
  }

  function srxTf({ site, peer, L, P, psk, wan, lan }) {
    const gw = `GW-SITE-${peer}`;
    const policy = (res, from, to, name, src, dst) => `resource "junos_security_policy" "${res}" {
  from_zone = junos_security_zone.${from}.name
  to_zone   = junos_security_zone.${to}.name
  policy {
    name                      = "${name}"
    match_source_address      = ["${src}"]
    match_destination_address = ["${dst}"]
    match_application         = ["any"]
  }
}`;
    const logical = (res, name, zone, cidr, services) => `resource "junos_interface_logical" "${res}" {
  name                      = "${name}"
  security_zone             = junos_security_zone.${zone}.name${services ? `\n  security_inbound_services = [${services}]` : ""}
  family_inet {${cidr ? `\n    address {\n      cidr_ip = "${cidr}"\n    }\n  ` : ""}}
}`;
    return {
      provider: `${tfHeader("junos", "jeremmfr/junos", "~> 2.20", [
        ["junos_host", `${tfText.host} FW-SITE-${site}`],
        ["junos_username", tfText.user],
        ["junos_password", "", true],
      ], `  ip       = var.junos_host
  username = var.junos_username
  password = var.junos_password`)}

# ${tfText.junosCommit}

${tfPsk(psk)}`,
      system: `# ${tfText.junosSystem}
#   set system host-name FW-SITE-${site}`,
      interfaces: `resource "junos_interface_physical" "wan" {
  name        = "${wan}"
  description = "WAN - ISP ${site}"
}

resource "junos_interface_physical" "lan" {
  name        = "${lan}"
  description = "LAN ${site}"
}

${logical("wan", `${wan}.0`, "untrust", L.wan.cidr, '"ike", "ping"')}

${logical("lan", `${lan}.0`, "trust", L.lan.cidr, '"ping", "ssh"')}

${logical("st0", "st0.0", "vpn", "", "")}`,
      zones: ["untrust", "trust", "vpn"]
        .map((z) => `resource "junos_security_zone" "${z}" {\n  name = "${z}"${
          z === "trust" ? `\n  address_book {\n    name    = "LAN-SITE-${site}"\n    network = "${L.lan.netCidr}"\n  }` :
          z === "vpn" ? `\n  address_book {\n    name    = "LAN-SITE-${peer}"\n    network = "${P.lan.netCidr}"\n  }` : ""
        }\n}`)
        .join("\n\n"),
      phase1: `resource "junos_security_ike_proposal" "ike" {
  name                     = "IKE-AES256GCM-P384"
  authentication_method    = "pre-shared-keys"
  dh_group                 = "group20"
  authentication_algorithm = "sha-384"
  encryption_algorithm     = "aes-256-gcm"
  lifetime_seconds         = 28800
}

resource "junos_security_ike_policy" "ike" {
  name                = "IKE-POL-SITE-${peer}"
  proposals           = [junos_security_ike_proposal.ike.name]
  pre_shared_key_text = var.vpn_psk
}

resource "junos_security_ike_gateway" "${tfId(gw)}" {
  name               = "${gw}"
  address            = ["${P.wan.ip}"]
  policy             = junos_security_ike_policy.ike.name
  external_interface = junos_interface_logical.wan.name
  local_address      = "${L.wan.ip}"
  version            = "v2-only"
  dead_peer_detection {
    send_mode = "probe-idle-tunnel"
  }
}`,
      phase2: `resource "junos_security_ipsec_proposal" "ipsec" {
  name                 = "IPSEC-AES256GCM"
  protocol             = "esp"
  encryption_algorithm = "aes-256-gcm"
  lifetime_seconds     = 3600
}

resource "junos_security_ipsec_policy" "ipsec" {
  name      = "IPSEC-POL-SITE-${peer}"
  proposals = [junos_security_ipsec_proposal.ipsec.name]
  pfs_keys  = "group20"
}

resource "junos_security_ipsec_vpn" "vpn_site_${peer.toLowerCase()}" {
  name              = "VPN-SITE-${peer}"
  bind_interface    = junos_interface_logical.st0.name
  establish_tunnels = "immediately"
  ike {
    gateway          = junos_security_ike_gateway.${tfId(gw)}.name
    policy           = junos_security_ipsec_policy.ipsec.name
    identity_local   = "${L.lan.netCidr}"
    identity_remote  = "${P.lan.netCidr}"
    identity_service = "any"
  }
}

# ${tfText.junosMss}
#   set security flow tcp-mss ipsec-vpn mss 1350`,
      routing: `resource "junos_static_route" "default" {
  destination = "0.0.0.0/0"
  next_hop    = ["${L.gw}"]
}

resource "junos_static_route" "to_site_${peer.toLowerCase()}" {
  destination = "${P.lan.netCidr}"
  next_hop    = [junos_interface_logical.st0.name]
}`,
      policies: [
        policy("trust_to_vpn", "trust", "vpn", "LAN-TO-VPN", `LAN-SITE-${site}`, `LAN-SITE-${peer}`),
        policy("vpn_to_trust", "vpn", "trust", "VPN-TO-LAN", `LAN-SITE-${peer}`, `LAN-SITE-${site}`),
        policy("trust_to_untrust", "trust", "untrust", "LAN-TO-INTERNET", `LAN-SITE-${site}`, "any"),
      ].join("\n\n"),
      nat: `resource "junos_security_nat_source" "trust_to_untrust" {
  name = "TRUST-TO-UNTRUST"
  from {
    type  = "zone"
    value = [junos_security_zone.trust.name]
  }
  to {
    type  = "zone"
    value = [junos_security_zone.untrust.name]
  }
  rule {
    name = "SNAT-INTERNET"
    match {
      source_address      = ["${L.lan.netCidr}"]
      destination_address = ["0.0.0.0/0"]
    }
    then {
      type = "interface"
    }
  }
}`,
    };
  }

  const VENDORS = {
    srx: { build: srx, tf: srxTf, wan: "ge-0/0/0", lan: "ge-0/0/1" },
    fortigate: { build: fortigate, tf: fortigateTf, wan: "wan1", lan: "internal" },
    paloalto: { build: paloalto, tf: paloaltoTf, wan: "ethernet1/1", lan: "ethernet1/2" },
    asa: { build: asa, tf: null, wan: "GigabitEthernet0/0", lan: "GigabitEthernet0/1" },
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
    // Campos de interface vazios usam o padrão do fabricante, mostrado como placeholder.
    const S = site.toUpperCase();
    $(`fwIfWan${S}`).placeholder = vendor ? VENDORS[vendor].wan : msg.msgIfDefault;
    $(`fwIfLan${S}`).placeholder = vendor ? VENDORS[vendor].lan : msg.msgIfDefault;
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

    // Nome da interface física, sem espaços nem subinterface/unidade (o gerador acrescenta a
    // unidade .0 no Junos); vazio = padrão do fabricante.
    const ifaces = {};
    for (const [key, input] of [["wan", $(`fwIfWan${S}`)], ["lan", $(`fwIfLan${S}`)]]) {
      const name = input.value.trim();
      if (name && !/^[A-Za-z][A-Za-z0-9/_:-]{0,39}$/.test(name)) {
        return fail(input, msg.msgIfInvalid.replace("{field}", input.dataset.name));
      }
      ifaces[key] = name || VENDORS[slots[site]][key];
    }
    if (ifaces.wan.toLowerCase() === ifaces.lan.toLowerCase()) {
      return fail($(`fwIfLan${S}`), msg.msgIfSame.replace("{site}", `Site ${S}`));
    }
    return { wan, gw: toIp(gw), lan, ifaces, inputs: { wanIn, lanIn } };
  }

  // Ordem de aplicação, comum aos quatro fabricantes (no FortiOS a interface do túnel só existe
  // depois da fase 1, por isso o roteamento vem depois das fases da VPN).
  const BLOCK_ORDER = ["provider", "system", "interfaces", "zones", "addresses", "phase1", "phase2", "routing", "policies", "nat"];

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  // Uma linha por bloco: título numerado e descrição curta, com a configuração do Site A e a do
  // Site B lado a lado (cada uma com botão de copiar). Bloco que um fabricante não usa (ex.: zonas
  // e NAT no FortiGate) aparece como "não se aplica".
  function renderBlocks(configs, labels, naText) {
    const keys = BLOCK_ORDER.filter((key) => configs.a[key] || configs.b[key]);
    $("fwBlocks").replaceChildren(
      ...keys.map((key, i) => {
        const [title, desc] = blockText[key];
        const row = el("section", "fw-row");
        const head = el("div", "fw-row-head");
        head.append(el("h5", "", `${i + 1}. ${title}`), el("p", "fw-block-desc", desc));
        const cols = el("div", "fw-row-cols");
        ["a", "b"].forEach((site) => {
          const cell = el("div", "fw-cell");
          cell.dataset.site = site;
          const cellHead = el("div", "fw-cell-head");
          cellHead.appendChild(el("span", "fw-cell-site", labels[site]));
          const text = configs[site][key];
          if (text) {
            const copy = el("button", "btn-secondary btn-copy btn-copy-block", msg.msgCopyBlock);
            copy.type = "button";
            copy.setAttribute("aria-label", `${msg.msgCopyBlock}: ${title} · ${labels[site]}`);
            cellHead.appendChild(copy);
            const pre = el("pre");
            pre.appendChild(el("code", "", text));
            cell.append(cellHead, pre);
          } else {
            cell.append(cellHead, el("p", "fw-na", naText[site]));
          }
          cols.appendChild(cell);
        });
        row.append(head, cols);
        return row;
      })
    );
  }

  // mode: "cli" (comandos do equipamento) ou "tf" (projeto Terraform por site).
  function deploy(mode) {
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

    // Terraform: o ASA não tem provider com VPN; se nenhum dos dois sites tiver, não há o que gerar.
    if (mode === "tf" && !VENDORS[slots.a].tf && !VENDORS[slots.b].tf) return setStatus(msg.msgTfNone, "error");

    const sites = { a: { L: A, P: B, peer: "b" }, b: { L: B, P: A, peer: "a" } };
    const configs = {};
    const labels = {};
    const naText = {};
    Object.entries(sites).forEach(([site, { L, P, peer }]) => {
      const S = site.toUpperCase();
      const v = VENDORS[slots[site]];
      const { wan, lan } = L.ifaces;
      const build = mode === "tf" ? v.tf : v.build;
      configs[site] = build ? build({ site: S, peer: peer.toUpperCase(), L, P, psk, wan, lan }) : {};
      naText[site] = build ? msg.msgNa : msg.msgTfNaShort;
      tool.querySelector(`.btn-copy[data-site="${site}"]`).hidden = !build;
      labels[site] = `Site ${S} · ${vendorLabel(slots[site])}`;
      $(`fwTitle${S}`).textContent = `${labels[site]} · ${mode === "tf" ? "Terraform" : "CLI"}`;
      $(`fwNote${S}`).textContent = build
        ? msg.msgIfaces.replace("{wan}", wan).replace("{lan}", lan)
        : msg.msgTfUnsupported;
    });
    renderBlocks(configs, labels, naText);
    $("fwTfGuide").hidden = mode !== "tf";

    const output = $("fwOutput");
    output.hidden = false;
    tunnel.classList.add("up");
    setStatus(msg.msgOk, "ok");
    output.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  $("fwDeploy").addEventListener("click", () => deploy("cli"));
  $("fwDeployTf").addEventListener("click", () => deploy("tf"));

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

  // "Copiar configuração do Site X" copia todos os blocos daquele site; "Copiar bloco", só um.
  tool.addEventListener("click", async (e) => {
    const btn = e.target.closest(".btn-copy");
    if (!btn) return;
    const codes = btn.dataset.site
      ? $("fwBlocks").querySelectorAll(`.fw-cell[data-site="${btn.dataset.site}"] code`)
      : btn.closest(".fw-cell").querySelectorAll("code");
    const text = [...codes].map((code) => code.textContent).join("\n\n");
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

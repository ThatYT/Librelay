# Hysteria 2 audit (2026-10-27)

## Architecture verified in source

Librelay 1.2.0 uses its Go GOST agent (local `go-gost/x` fork, based on
v0.5.3/core v0.3.1) to manage an external sing-box process. The download pin is
**sing-box 1.13.12**. An already installed executable is reused if `version`
succeeds; the pin does not prove the version currently installed on any VPS.
HY2 and TUIC are both implemented by sing-box, not GOST's own QUIC transport.

| Property | HY2 | TUIC |
| --- | --- | --- |
| sing-box inbound type | `hysteria2` | `tuic` |
| Transport | QUIC/UDP | QUIC/UDP |
| New public inbound | `::`, selected public UDP port | Same |
| Legacy inbound | `127.0.0.1`, internal UDP port | Same |
| Auth | Stored per-user password | Stored UUID + password |
| Meter identity on public inbounds | User UUID in `users[].name` / `auth_user` | Same |
| TLS | Shared self-signed certificate, client skips verification | Same, explicit `h3` ALPN |
| Congestion | sing-box HY2 default when no bandwidth specified | Explicit BBR |

Source: `SingboxUtil`, `InboundServiceImpl`, `GostUtil`, and
`go-gost/x/socket/{singbox,service}.go`.

New public path:

```text
client --QUIC/UDP--> sing-box public protocol port
  --authenticated user route--> GOST private per-user SOCKS meter
  --SOCKS chain--> sing-box loopback SOCKS gateway --> direct/landing outbound
```

Legacy path:

```text
client --QUIC/UDP--> GOST per-user public UDP forward
  --> sing-box 127.0.0.1 protocol port --> direct/landing outbound
```

Legacy GOST service configuration includes TCP and UDP forwarding services;
only UDP carries HY2/TUIC. Public mode uses a loopback TCP SOCKS service with
UDP association support; GOST does not own the public protocol port.
`publicListen` is persisted per inbound; existing legacy entries are not
silently migrated. Subscription port selection follows that flag.

Port conflict validation distinguishes TCP from UDP. HY2 and TUIC both reserve
UDP: they cannot share one UDP address/port, while a TCP service may use the
same numeric port. A public `::` UDP socket serves IPv4 and IPv6 on tested
platforms, subject to the host's IPv6/dual-stack policy. Loopback is intentional
for GOST forwarding. No global binding changes are justified.

## Findings and fix

`buildHysteria2Link` previously concatenated raw passwords/SNI and unbracketed
IPv6 literals. Reserved characters such as `@`, `?`, `#`, `%`, `+`, and spaces
could change URI structure or credentials. The fix percent-encodes individual
components using UTF-8 and brackets IPv6 exactly once. Unreserved credentials,
IPv4/DNS endpoints, query names, scheme and `insecure=1` remain compatible.
Fragments now encode spaces as `%20` instead of form-style `+`.

The URI requirement is documented in the [official HY2 URI specification](https://v2.hysteria.network/docs/developers/URI-Scheme/).
The [v2rayN importer](https://github.com/2dust/v2rayN/blob/master/v2rayN/ServiceLib/Handler/Fmt/Hysteria2Fmt.cs)
uses a URI parser and decodes userinfo/query components; this was source-reviewed,
not exercised through the user's v2rayN profile/UI. Existing subscriptions using
panel-generated hexadecimal passwords on IPv4/DNS are unaffected by this defect.
It therefore does **not** establish the cause of the reported DMIT outage.

Mihomo exports already have the correct type, integer port, raw password, SNI
and `skip-cert-verify: true`; YAML quoting preserves special characters. No
exporter change is needed. No new obfuscation fields are emitted. See
[Mihomo's HY2 documentation](https://wiki.metacubex.one/en/config/proxies/hysteria2/).
TUIC generation, credentials and export code are unchanged.

Authentication skips disabled/empty-password HY2 users. Public routing uses the
same UUID identity as the inbound user name and rejects unmatched traffic.
Revocation removes credentials in the next successful sing-box config push.
Account/line quotas and expiry additionally pause GOST services. Shared user
rate limiters remain attached to the same GOST meters/forwarders. Config rebuilds
read stored credentials; they do not generate replacements. Node configuration
updates validate a candidate with `sing-box check` before replacing the file,
restart via systemd, and attempt restoration on restart failure.

TLS paths are `/etc/gost/certs/self.crt` and `self.key`. The agent generates a
`www.bing.com` certificate for 120 months if the certificate is absent; configured
SNI defaults to that name. Client verification is disabled by design for these
self-signed nodes. Runtime tests use disposable certificates. Production cert
expiry, missing/mismatched keys, actual installed core, firewalls, MTU and routing
remain host-side checks, not proven defects in the generated config.

## Salamander: supported, deferred

The [1.13.12 option definitions](https://github.com/SagerNet/sing-box/blob/v1.13.12/option/hysteria2.go)
and [HY2 inbound documentation](https://sing-box.sagernet.org/configuration/inbound/hysteria2/)
support `obfs: {"type":"salamander","password":"..."}`. Librelay currently has
no inbound DTO/UI controls for it and its URI/YAML export APIs receive no
obfuscation setting. A complete feature needs panel controls, validation, stored
configuration (the existing `config_json` could avoid a schema migration),
creation/edit persistence, and both export paths. This is deferred to keep this
fix small. Existing HY2 nodes remain unobfuscated; no credentials are regenerated.
A future optional feature must default off and export the exact same nonempty
obfuscation password in the server, URI and Mihomo settings. Do not enable it
only on the server.

## Focused validation

Java `Hysteria2AuditTest` covers URI round trips (IPv4, DNS, bare/bracketed IPv6),
reserved and Unicode credentials/SNI/fragments, ordinary link compatibility,
server/export agreement, YAML round trips, disabled credentials and deterministic
config generation. `RealityPortTest` covers existing protocol configs, transport
port conflicts and preservation of credentials during port edits.

Go `TestQUICProtocolPaths` consumes configs emitted by those actual Java builders
and uses sing-box 1.13.12 server/client processes plus real GOST services. It tests
HY2/TUIC public and legacy paths, valid/invalid/revoked credentials, restore and
restart with unchanged credentials, public IPv4/IPv6, and GOST byte accounting.
`TestMihomoHY2Export` optionally loads the actual Java YAML export into an installed
Mihomo binary and transfers local HTTP traffic over HY2. All targets are local;
no VPS is contacted. Process checks suppress secret-bearing config/log output.
The existing GOST private-egress and user-limit tests cover TCP/UDP accounting,
pause/resume and shared rate bucket persistence. These do not benchmark throughput
or emulate packet filtering on the mainland-China-to-DMIT route.

Reproduce with Java 21, Maven, Go 1.23.4, OpenSSL and the 1.13.12 release executable:

```sh
fixture_dir=$(mktemp -d)
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=www.bing.com \
  -keyout "$fixture_dir/self.key" -out "$fixture_dir/self.crt"
mvn -B -f springboot-backend/pom.xml \
  -Dtest=Hysteria2AuditTest,RealityPortTest \
  -Dlibrelay.quic.fixtures="$fixture_dir/quic" \
  -Dtms.singbox.cert="$fixture_dir/self.crt" \
  -Dtms.singbox.key="$fixture_dir/self.key" test
# Use absolute paths to the local test executables.
export LIBRELAY_SINGBOX_TEST_BIN=/path/to/sing-box
export LIBRELAY_QUIC_FIXTURES="$fixture_dir/quic"
export LIBRELAY_MIHOMO_TEST_BIN=/path/to/mihomo  # optional
(cd go-gost/x && go test ./socket -count=1 -v \
  -run 'TestQUICProtocolPaths|TestMihomoHY2Export|TestSingboxSelfCertificate|TestPrivateRealityEgressAndLifecycle|TestUserLimit|TestRuntimeRepairPreservesProtocolsAndAvoidsRestart')
```

Local results: **36 focused Java tests passed** (HY2 audit, protocol ports,
protocol-access lifecycle and user limits). All four generated configs passed
`sing-box check` with **1.13.12**. The four QUIC path subtests and the real
**Mihomo 1.19.32** import/traffic test passed together three consecutive times
after allowing client initialization to complete. The exact agent certificate
generation command and PEM parser passed certificate/key, SAN and expiry checks.
Existing GOST private-egress, shared-user-limit, runtime-preservation and real
idle-runtime tests also passed. This local run used macOS arm64; no production
systemd reload or real DMIT traffic was exercised.

CI runs the Java fixture builder, certificate generation and four QUIC path
checks on Linux with the pinned sing-box release. The Mihomo test is optional because CI does not install it.

## Production follow-up (read only; no deployment performed)

Only the **panel/backend** needs updating for the URI fix. No agent update is
required by this change. Refresh HY2 subscriptions after updating the panel if
using IPv6 or reserved-character credentials/remarks. Normal hexadecimal-password
IPv4 links need no refresh for connectivity. Stored users, credentials, quotas,
ports and limits do not change.

Run these on DMIT through the existing overseas SSH access. Do not print or
share the complete config, private key, passwords or subscription tokens.

```sh
/etc/gost/sing-box version
sudo systemctl is-active sing-box gost
sudo ss -lnup
sudo ss -lntp
sudo openssl x509 -in /etc/gost/certs/self.crt -noout -subject -dates
sysctl net.ipv6.bindv6only
```

Inspect `journalctl -u sing-box -u gost --since '-10 min' --no-pager` locally for
startup/bind/TLS errors and redact secrets before sharing. GOST unit names may
differ on old installations. `sing-box check -c /etc/gost/sing-box.json` is read
only but error messages may include invalid values; inspect locally.

For a sanitized listener-only view (requires jq):

```sh
sudo jq '[.inbounds[] | {type, tag, listen, listen_port}]' /etc/gost/sing-box.json
```

Compare the HY2 client endpoint with the appropriate public sing-box or legacy
GOST port. During one client attempt, use a bounded header-only capture:

```sh
# Replace 443 with the actual HY2 public port; no -A/-X payload dump.
sudo timeout 15 tcpdump -ni any -c 30 'udp port 443'
```

For legacy mode include the internal loopback UDP port in the filter. Verify
inbound packets, forwarding to loopback, and outbound replies independently.
Then compare the working TUIC port from the same client network. Local success
cannot distinguish provider filtering, path interference, firewall rules or a
client mismatch on the real DMIT route.

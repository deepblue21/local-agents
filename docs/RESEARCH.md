# Local_Agents — Project Research & Best-Practice Notes

**Date:** 2026-06-22
**Purpose:** situate Local_Agents against current practice for the stack it uses — local
model serving, agent sandboxing, mobile pairing, and tunnel exposure — and turn that into
concrete, prioritized recommendations. Pairs with `docs/SECURITY_AUDIT.md`.

---

## 1. What this project is, and how it compares

Local_Agents is a **phone-as-controller** for an LLM agent that runs on the operator's own
PC. The Android app never holds provider credentials; it drives a companion API that owns
auth, persistence, run orchestration, model adapters, and event streaming, while tools run in
a separate no-network runner. That separation is the project's distinguishing idea.

How it sits relative to neighbours in the ecosystem:

- **Ollama + a chat UI (Open WebUI, Lobe, Enchanted, etc.)** give you mobile/desktop *chat*
  over local models. They generally do **not** ship an isolated tool-execution runner with a
  resumable, event-sourced run lifecycle. Local_Agents is closer to an *agent control plane*
  than a chat client.
- **Hosted coding-agent sandboxes (E2B, Modal, Daytona)** focus on the isolation layer.
  Local_Agents hand-rolls the equivalent with a hardened Docker container + Unix-socket RPC —
  appropriate for a single-PC self-hosted tool, and the right scope.
- **The resumable, replayable run model** (monotonic event sequence + `Last-Event-ID`
  reconnect, `running → paused` on restart) mirrors durable-execution patterns and is more
  rigorous than most hobby agent projects. It is the strongest part of the design.

Net: the architecture is coherent and security-aware. The work left is **hardening the edges**
(exposure, pairing, sandbox depth), not re-architecting.

---

## 2. Local model serving — Ollama tool calling

The agent loop streams from Ollama's `/api/chat` with `tools` and reads `message.tool_calls`.
Two practical caveats from current Ollama practice:

- **Streaming + tool calls is the newer, less battle-tested path.** Ollama added streaming
  *with* tool calling relatively recently, and client integrations still report rough edges and
  inconsistencies versus OpenAI/Anthropic streaming semantics. Keep the adapter tolerant of
  partial/duplicated `tool_calls` across chunks (today `agent.py` concatenates content and
  extends `tool_calls` per chunk, which is reasonable, but add defensive de-duplication if a
  model emits the same call across deltas).
- **Tool support is model-dependent.** Only tool-capable models (e.g. Llama 3.1, Mistral
  Nemo, Qwen with tool support) will emit `tool_calls`; others silently never call tools.
  Surfacing model capabilities to the phone (the `/capabilities` and `/models` endpoints
  already do some of this) is the right instinct — extend it to flag tool support per model.

**Recommendation:** add adapter-level tests with recorded Ollama NDJSON fixtures (happy path,
tool call split across chunks, `done` handling) so streaming-parser regressions are caught
without a live model. The new suite covers the agent loop with fakes; the adapter byte-parsing
is the remaining untested seam.

---

## 3. Agent sandboxing — where Local_Agents sits

Current practice converges on four isolation tiers, in increasing depth/overhead:

1. **Hardened containers** (namespaces + cgroups + seccomp-bpf + `cap_drop`) — fast, but share
   the host kernel.
2. **gVisor (runsc)** — a user-space syscall reimplementation (Sentry) intercepts guest
   syscalls before the host kernel; an escape must beat two independent layers.
3. **Firecracker / Kata microVMs** — hardware (KVM) isolation, own guest kernel, ~125 ms boot.
4. **WebAssembly** — capability-first, near-zero overhead, but a constrained runtime.

Local_Agents is firmly in tier 1, and does tier 1 **well**: `network_mode: none`,
`read_only: true`, `cap_drop: ALL`, `no-new-privileges`, non-root UID, `pids_limit`,
`mem_limit`, `cpus`, and a workspace-only bind mount. The standard guidance is that tier-1 is
acceptable **when paired with a hardened seccomp/AppArmor profile**, because the default Docker
profile only blocks ~44 syscalls and leaves `ptrace`, `unshare`, `mount`, `keyctl`, `bpf`,
`perf_event_open` reachable.

**Recommendations, in order of effort/return:**

- Add a **custom seccomp profile** (and/or AppArmor) to the `runner` service blocking the
  syscalls above. Low effort, meaningful depth.
- Consider **gVisor** (`runtime: runsc`) for the runner if the host supports it — the single
  biggest isolation upgrade without a microVM.
- Keep the image **minimal**; `python3` in the runner image means the model can script freely.
  If tools don't need Python at runtime, drop it to shrink the blast radius.
- Document the runner threat model explicitly: *prompt-injected model = attacker with code
  execution confined to the workspace + tmpfs*.

---

## 4. FastAPI exposure hardening

Standard 2025 production guidance for a tunnel-exposed FastAPI app, mapped to this repo:

- **Disable interactive docs in production** (`/docs`, `/redoc`, `/openapi.json`) or gate them
  — see audit M1. The runner already does this; the companion does not.
- **Security headers** (`nosniff`, `X-Frame-Options`/CSP, `Referrer-Policy`, HSTS) via
  middleware — audit M2. The all-inline admin page makes a strict CSP easy.
- **Rate limiting** on auth-adjacent routes (`slowapi` or a token bucket) — audit H2.
- **Never wildcard CORS**; this app is same-origin (no CORS middleware) which is fine — keep it
  that way and don't add `allow_origins=["*"]`.
- **Don't leak internals in errors** — audit L5.
- **Dependency hygiene**: `pip-audit` + a lockfile — audit L2.

The auth core is already strong: hashed one-use pairing codes, rotating refresh tokens,
constant-time admin comparison, short access-token TTL, AES-GCM token storage in Android
Keystore. The gaps are *exposure surface* and *operational controls* (revocation), not crypto.

---

## 5. Android pairing — custom scheme vs App Links

Custom URL schemes (`localagents://`) are **unverified**: any app can register the same scheme
and any web page can invoke it with arbitrary parameters, enabling link hijacking, token theft,
and redirect-to-attacker. Android 12+ tightened web-intent handling, and the platform fix is
**Android App Links** — an `https` scheme verified by hosting a Digital Asset Links
(`assetlinks.json`) file on the domain with the app's SHA-256 fingerprint and
`android:autoVerify="true"`. Verified App Links cannot be hijacked by another app.

Two caveats from the research: App Links have their *own* failure modes (wrong fingerprint,
missing/!misconfigured `assetlinks.json`, silent fallback to the browser), and real-world
verification pass rates are low — so **test the verification end-to-end**.

**Recommendations:** see audit H3 — confirm the host before pairing, migrate to verified App
Links on the tunnel domain, and validate/allowlist the host. Even before App Links land, the
*pairing confirmation screen* is a cheap, high-value mitigation.

---

## 6. ReDoS in untrusted regex

Python's `re` is a backtracking engine and is inherently ReDoS-prone; `search_files` accepts an
untrusted pattern (audit M3). Standard mitigations, best first:

- **Use a linear-time engine** — `google-re2` (`re2` on PyPI) guarantees linear matching by
  forbidding backtracking (no backreferences/lookarounds, which a code-search tool rarely
  needs). This removes the DoS primitive structurally.
- **Bound inputs and time** — input length caps (already partly present) plus a wall-clock
  budget per search.
- Or **shell out to `ripgrep`** (already in the runner image) and skip the Python engine for
  untrusted patterns entirely.

---

## 7. Cloudflare Tunnel exposure model

Using a remotely-managed tunnel with **outbound-only** connections and no router port-forwarding
is a good exposure choice — there is no inbound listener to scan, and TLS terminates at
Cloudflare's edge. The repo's stance "keep API authentication enabled even though Cloudflare
terminates TLS" is exactly right: the tunnel is transport, **not** an auth boundary. Two
additions worth considering: put **Cloudflare Access** (or at least a WAF rule / rate limit) in
front of `/admin` and the auth endpoints for defense-in-depth, and ensure the `cloudflared`
token in `.env` is treated as a secret (it is gitignored — good).

---

## 8. Persistence & concurrency note

SQLite with WAL and a single write-lock is appropriate for a single-PC, single-active-run
service, and the `running → paused` recovery on restart is a nice durability touch. As event
volume grows, the SSE **polling** loop (§M9) and the lack of **retention** (§M6) will be the
first things to feel slow — both are cheap to address before they bite.

---

## 9. Prioritized recommendation roadmap

| Priority | Action | Refs |
|----------|--------|------|
| 1 | Gate the default admin token + add rate limiting before any public exposure | H1, H2 |
| 2 | Disable public OpenAPI docs; add security headers | M1, M2 |
| 3 | Android: pairing confirmation now, verified App Links next; tighten cleartext policy | H3, M7 |
| 4 | Add device/token revocation + listing API | M4 |
| 5 | Runner: ReDoS-safe search (`re2`/ripgrep) + clean `run_command` errors | M3, M8 |
| 6 | Runner: seccomp/AppArmor profile; evaluate gVisor; trim the image | H4 |
| 7 | Authorization scoping, data retention, SSE caps | M5, M6, M9 |
| 8 | Build/CI hygiene: drop unused langgraph, lockfile + pip-audit, CI, healthchecks | L1–L4 |
| 9 | Adapter-level streaming tests with recorded Ollama fixtures | §2 |

---

## Sources

- Android Developers — [Unsafe use of deep links](https://developer.android.com/privacy-and-security/risks/unsafe-use-of-deeplinks)
- OWASP MASTG — [Testing Deep Links](https://mas.owasp.org/MASTG/tests/android/MASVS-PLATFORM/MASTG-TEST-0028/)
- Oversecured — [Android deep link vulnerabilities](https://oversecured.com/blog/android-deep-link-vulnerabilities)
- Ollama — [Tool calling](https://docs.ollama.com/capabilities/tool-calling) · [Streaming responses with tool calling](https://ollama.com/blog/streaming-tool)
- ikangai — [The Complete Guide to Sandboxing Autonomous Agents](https://www.ikangai.com/the-complete-guide-to-sandboxing-autonomous-agents-tools-frameworks-and-safety-essentials/)
- CodeAnt — [How to Sandbox LLMs & AI Shell Tools (Docker, gVisor, Firecracker)](https://www.codeant.ai/blogs/agentic-rag-shell-sandboxing)
- Zylos Research — [AI Agent Sandboxing and Security Isolation: MicroVMs, gVisor, WASM](https://zylos.ai/research/2026-04-04-ai-agent-sandboxing-security-isolation/)
- OneUptime — [Secure FastAPI Against OWASP Top 10](https://oneuptime.com/blog/post/2025-01-06-fastapi-owasp-security/view)
- David Muraya — [A Practical Guide to FastAPI Security](https://davidmuraya.com/blog/fastapi-security-guide/)
- The GitHub Blog — [What is ReDoS, and how do you fix it?](https://github.blog/security/how-to-fix-a-redos/)
- HackTricks — [Regular expression Denial of Service (ReDoS)](https://hacktricks.wiki/en/pentesting-web/regular-expression-denial-of-service-redos.html)

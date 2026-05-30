# Local AI Dashboard

Kendi makinelerinizde çalışan **dağıtık (distributed) bir local AI cluster**'ı
yönetmek için modern bir web kontrol paneli. Birden fazla bilgisayarın
(workstation, Mac Studio, sunucu) belleğini ve GPU'sunu birleştirip büyük
modelleri (DeepSeek-V3 67B, Llama 3.1 70B vb.) tek bir cihaza
sığmayacak ölçekte yerel olarak çalıştırabilmenizi sağlar.

> **Durum:** Tasarım hazır, backend yazılıyor. Frontend mock veriyle çalışır.

---

## Bu proje ne yapar?

| Ekran             | Ne işe yarar                                                                 |
|-------------------|------------------------------------------------------------------------------|
| **Dashboard**     | Cluster genel görünümü, canlı log stream, agent durumları, KPI strip.        |
| **Nodes & Network** | Topology, latency, her node için CPU/GPU/RAM monitör, layer placement.     |
| **Chat playground** | Anthropic Claude ile streaming chat, prompt template'leri, metric badges.  |
| **Model Hub**     | Ollama ile yüklü modelleri listele/sil; HF/Ollama registry'den `pull`.       |
| **Knowledge Base**| RAG — markdown/PDF ingest, Obsidian vault, Qdrant vector store, bge-large.   |
| **Energy & cost** | Watt/kWh/CO₂ ölçümü; her node için maliyet ve karbon ayak izi.               |
| **Settings**      | Inference parametreleri (temp, top-p, ctx), system config, advanced cluster. |
| **Deployment dialog** | Cluster'da hangi modelin nasıl (shard / pin / per-node) çalışacağı.      |

## Mimari özet

```
  Browser  ←—  FastAPI master (host:7878)
                ├── /api/* + /ws/* (frontend buradan tek backend ile konuşur)
                ├── Ollama  (localhost:11434)   ← model çalıştırma
                ├── Anthropic API               ← chat playground
                ├── Qdrant  (localhost:6333)    ← RAG vector store
                └── HTTP polling →  Worker agents (her node :7879)
```

Aynı Python kodtabanı iki modda çalışır:

- `uvicorn app.main:app` — tam **master** (UI, tüm API'ler, websocket, aggregator).
- `python -m app.worker.agent` — minimal **worker** (sadece `/agent/telemetry`).

Detay için: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Hızlı başlangıç (sadece master)

```bash
cd backend
python -m venv .venv && source .venv/bin/activate    # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                  # ANTHROPIC_API_KEY'i girin

# Yan servisler (Docker yoksa kendiniz kurun)
docker run -d -p 6333:6333 -v $(pwd)/data/qdrant:/qdrant/storage qdrant/qdrant
ollama serve &                                        # localhost:11434

# Master'ı çalıştır
uvicorn app.main:app --host 0.0.0.0 --port 7878 --reload
```

Tarayıcıdan: <http://localhost:7878>

## Çoklu node ekleme

Worker olacak her bilgisayarda:

```bash
git clone <repo> && cd local-ai-dashboard/backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m app.worker.agent --host 0.0.0.0 --port 7879
```

Sonra master'ın `.env` dosyasına şu node'u ekleyin (`NODES_JSON`):

```json
{"id":"n2","role":"worker","name":"studio.local","host":"10.0.4.34","port":7879,"icon":"Apple","os":"macOS"}
```

Master yeniden başladığında yeni node otomatik olarak topology'de görünür.

## Klasör yapısı

```
local-ai-dashboard/
├── README.md                ← bu dosya
├── backend/
│   ├── requirements.txt
│   ├── .env.example
│   └── app/
│       ├── main.py          ← FastAPI giriş noktası
│       ├── config.py        ← Ayarlar (.env'den)
│       ├── db.py            ← SQLite şema + yardımcılar
│       ├── schemas.py       ← Pydantic modelleri
│       ├── ws.py            ← WebSocket fan-out
│       ├── routers/         ← Tüm /api ve /ws route'ları
│       ├── services/        ← Telemetry, Ollama, Anthropic, RAG, energy
│       └── worker/agent.py  ← Her node'da çalışan minimal worker
├── frontend/
│   ├── index.html
│   └── src/                 ← React (Babel standalone) tasarım dosyaları
└── docs/
    ├── ARCHITECTURE.md      ← API listesi + akış diyagramı
    ├── design-handoff-README.md
    └── design-chat-transcript.md
```

## Masaüstü uygulaması (PyWebView)

`desktop/` klasörü, web uygulamasını native bir pencerede açan ince bir
shell barındırır. Backend aynı process'in içinde arka planda çalışır,
sistem tray simgesi vardır, "boot'ta başlat" seçeneği Windows registry
ve Linux `autostart` dizinine kendisi yazar.

```bash
# Geliştirme modu
pip install -r backend/requirements.txt
pip install -r desktop/requirements.txt
python -m desktop.launcher
```

Tek-binary build (Windows .exe veya Linux ELF):

```bash
python desktop/build.py
# → dist/local-ai-dashboard/local-ai-dashboard(.exe)
```

Detay: [`desktop/README.md`](desktop/README.md).

Sonra Tauri'ye geçmek istenirse backend ve frontend hiç değişmez — sadece
shell katmanı Rust'a taşınır (HTTP API kontratı aynı kaldığı için).

## Tasarım kaynağı

Bu proje [Claude Design](https://claude.ai/design)'da tasarlanan UI'ın
canlı backend'e bağlanmış hâlidir. Orijinal handoff bundle'ı ve tasarımcı
chat transcript'i `docs/` altında durur — fikirleri kim, nasıl, neden
o şekilde aldığını oradan okuyabilirsiniz.

## Lisans

MIT — istediğiniz gibi kullanın.

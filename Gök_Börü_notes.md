# Gök Börü — Proje Notları & Yol Haritası

Bu doküman, **Gök Börü (Local AI Dashboard)** projesini tek bir noktadan anlamak, hızlıca ayağa kaldırmak ve canlıya (üretime) almak için rehber olarak hazırlanmıştır. Projeyi her seferinde yeniden okumak yerine bu referans kullanılacaktır.

---

## 🚀 1. Projenin Amacı (Kısa Özet)
**Gök Börü (Local AI Dashboard)**, evinizde veya yerel ağınızda (LAN) çalışan **dağıtık bir yerel yapay zeka kümesini (Distributed Local AI Cluster)** yönetmek için tasarlanmış modern bir web kontrol panelidir.

*   **Temel Vizyon:** Birden fazla bilgisayarın (Örn: WSL2 Workstation, Mac Studio, yerel sunucular) RAM ve GPU güçlerini birleştirerek, tek bir makineye sığmayacak kadar büyük modelleri (DeepSeek-V3 67B, Llama 3.1 70B vb.) dağıtık/shard olarak çalıştırabilmeyi sağlamak.
*   **Ana Ekranlar & İşlevler:**
    *   **Dashboard:** Canlı log yayını, küme durumu, etkin agent listesi ve KPI verileri.
    *   **Nodes & Network:** Küme topolojisi, gecikme (latency) süreleri ve her bir node'un anlık CPU/GPU/RAM durumları.
    *   **Chat Playground:** Streaming chat, sistem promptları ve performans ölçüm etiketleri.
    *   **Model Hub:** Ollama ile model indirme (pull), silme ve listeleme.
    *   **Knowledge Base (RAG):** PDF/Markdown ve Obsidian entegrasyonu ile yerel Qdrant vektör veritabanı eşleştirmesi.
    *   **Energy & Cost:** Watt tüketimi, maliyet ve karbon ayak izi hesaplayıcı.

---

## 🛠️ 2. Mimari ve Bileşenler
Sistem tek bir Python kod tabanının iki farklı rolde çalışması prensibine dayanır:

1.  **Master Mode:** (`uvicorn app.main:app`) — Tam yetkili sunucu. Web arayüzünü sunar, API'leri yönetir, WebSocket bağlantılarını koordine eder ve worker'lardan veri toplar.
2.  **Worker Mode:** (`python -m app.worker.agent`) — Sadece telemetri verisi üreten ve master node'a raporlayan hafif aracı servis.

### Teknolojik Altyapı
*   **Backend:** FastAPI (Python 3.12+), SQLite (Metadata veri tabanı), Uvicorn.
*   **Yapay Zeka Servisleri:** Ollama (Yerel model çalıştırma), Anthropic API (Playground entegrasyonu).
*   **Vektör Veri Tabanı:** Qdrant (Docker üzerinde).
*   **Arayüz (Frontend):** React (Babel Standalone ile tarayıcı içi derleme - **npm/node derleme adımı gerektirmez**, doğrudan FastAPI üzerinden statik olarak sunulur), Tailwind CSS, Lucide Icons.
*   **Masaüstü Katmanı:** PyWebView (desktop penceresi ve sistem tepsisi kontrolü).

---

## 🎨 3. Tasarım ve Kod Eşleşmesi Analizi
`design/` klasörü ile `local-ai-dashboard/frontend/src/` kodlarının eşleşme durumu incelenmiştir:

*   **Sonuç: TAM UYUM ve EVRİM.**
*   `design/` klasöründekiler, projenin **Claude Design** üzerinde yapılmış ilk statik React (JSX) prototipleridir (Mayıs 17 tarihli).
*   `local-ai-dashboard/frontend/src/` içindekiler ise projenin **aktif geliştirme aşamasındaki** güncel kodlarıdır (Mayıs 20 tarihli).
*   **Farklar:** Aktif kod klasöründe dosyalar API entegrasyonu, dinamik veri bağlantıları ve ekstra sayfalar (`api.jsx`, `chat.jsx`, `deployment.jsx`, `energy.jsx`) eklenerek genişletilmiştir.
*   **Özet:** `design/` referans tasarımdır; `frontend/src/` ise bu tasarımın çalışan canlı kod halidir. Tasarım birebir koda dökülmüş ve arka planla bağlanmıştır.

---

## 🎯 4. Projeyi Çalıştırılabilir Hale Getirme Durumu

Şu ana kadar sisteminizde yapılan hazırlıklar:
*   [x] **Ollama:** Sisteminizde aktif ve çalışıyor (Port: 11434).
*   [x] **Qdrant:** Docker üzerinde başarıyla ayağa kaldırıldı (Port: 6333, 6334).
*   [x] **.env Dosyası:** `.env.example` üzerinden otomatik olarak oluşturuldu.
*   [x] **Python Bağımlılıkları:** Python 3.12 sanal ortamı (.venv) oluşturuldu ve `requirements.txt` içindeki tüm paketlerin (FastAPI, PyTorch vb.) kurulumu başlatıldı (kurulum devam ediyor).

---

## 🚀 5. Canlıya Alma ve İlerleme Yol Haritası

1.  **Yerel Kurulumun Tamamlanması:** Bağımlılıklar bittiğinde Master sunucusunu başlatıp tarayıcıdan test edeceğiz.
2.  **Model Entegrasyonu:** Ollama üzerinden hafif bir model (örneğin `llama3` veya `qwen2.5`) indirip arayüzle konuşmasını test edeceğiz.
3.  **Çoklu Node (Cluster) Simülasyonu:** Eğer elinizde başka bir cihaz yoksa, kendi makinenizde 1 Master ve 1 Worker agent'ı yan yana çalıştırarak küme topolojisini simüle edeceğiz.
4.  **Canlıya Alma / Dağıtım (Production):**
    *   Hizmetin yerel ağdaki diğer cihazlara açılması (Host IP bağlamaları).
    *   Gerekirse bir systemd servisi yazarak arka planda sürekli çalışmasını sağlama.
    *   PyWebView ile masaüstü `.exe` veya Linux ELF paketini oluşturma.

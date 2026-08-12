/**
 * Console strings. Turkish is the source language (matching the Android app);
 * English is provided so the console is usable outside a Turkish-speaking setup.
 * `t()` falls back to Turkish, then to the key itself, so a missing translation
 * degrades to readable text instead of blank UI.
 */

const STRINGS = {
  tr: {
    appName: 'Local_Agents',
    tagline: 'PC ajan konsolu',
    loading: 'Yükleniyor…',

    navSessions: 'Oturumlar',
    navChat: 'Sohbet',
    navRuns: 'Çalışmalar',
    navModels: 'Modeller',
    navSettings: 'Ayarlar',

    pairTitle: 'Tarayıcıyı PC companion\'a bağla',
    pairBody: 'Web konsolu de kontrol yüzeyidir. Model anahtarları, dosyalar ve çalışmalar PC\'de kalır.',
    pairStep1Title: 'Yönetim ekranından kod üret',
    pairStep1Detail: 'PC\'de /admin sayfasını aç, yönetim anahtarını gir ve tek kullanımlık eşleştirme kodu üret.',
    pairStep2Title: 'Kodu buraya gir',
    pairStep2Detail: 'Kod tek kullanımlıktır ve kısa sürede geçersiz olur. Büyük/küçük harf ve ayraçlar önemsizdir.',
    pairStep3Title: 'Modeli seç ve çalıştır',
    pairStep3Detail: 'Yanıtı PC\'deki yerel model üretir. Tarayıcı kapansa bile çalışma PC\'de sürer.',
    pairCodeLabel: 'Eşleştirme kodu',
    pairNameLabel: 'Bu tarayıcının adı',
    pairAction: 'Bağlan',
    pairing: 'Bağlanılıyor…',
    pairCodeRequired: 'Eşleştirme kodunu gir.',
    adminLink: 'Yönetim ekranını aç',

    hostChecking: 'Kontrol ediliyor…',
    hostOnline: 'çevrimiçi',
    hostOffline: 'çevrimdışı',
    hostCompanion: 'PC companion',
    hostModelReady: '%1 hazır',
    hostModelMissing: '%1 yüklü değil',
    hostWebOn: 'web araştırma açık',
    hostWebOff: 'web araştırma kapalı',
    hostModelCount: '%1 model',

    sessionsTitle: 'Oturumlar',
    sessionsEmpty: 'Henüz oturum yok.',
    sessionsEmptyHint: 'Yeni bir sohbet başlat ve ilk görevi ver.',
    newChat: 'Yeni sohbet',
    rename: 'Yeniden adlandır',
    renameTitle: 'Oturumu yeniden adlandır',
    delete: 'Sil',
    deleteTitle: 'Oturumu sil',
    deleteBody: '“%1” ve tüm mesajları, çalışmaları ve olayları kalıcı olarak silinecek. Bu işlem geri alınamaz.',
    cancel: 'Vazgeç',
    save: 'Kaydet',
    toolCount: '%1 araç',

    chatEmpty: 'İlk görevi yaz.',
    chatEmptyHint: 'Ajan PC\'de çalışır; araç etkinliğini burada canlı izlersin.',
    chatNoSession: 'Önce bir oturum seç veya yeni sohbet başlat.',
    composerPlaceholder: 'Görevi yaz…',
    send: 'Gönder',
    you: 'sen',
    assistant: 'ajan',
    thinking: 'düşünüyor…',
    working: 'çalışıyor…',

    pause: 'Duraklat',
    resume: 'Sürdür',
    stop: 'Durdur',
    steer: 'Yönlendir',
    steerPlaceholder: 'Ek yönlendirme…',
    steerSend: 'Yönlendirmeyi gönder',

    toolsTitle: 'Araç etkinliği',
    sourcesTitle: 'Kaynaklar',
    toolArguments: 'Argüman',
    toolResult: 'Sonuç',
    toolError: 'Hata',
    toolRunning: 'çalışıyor',
    toolDone: 'tamam',
    toolFailed: 'başarısız',

    contextUsage: 'Bağlam · %1 / %2 token · %3%',
    contextMemory: '%1 mesaj özetlendi',
    contextNoMemory: 'Özet yok',
    compress: 'Özetle & sürdür',
    compressing: 'Özetleniyor…',

    runsTitle: 'Çalışmalar',
    runsEmpty: 'Kayıtlı çalışma yok.',

    modelsTitle: 'Modeller',
    modelsEmpty: 'Model listelenemedi. Companion Ollama\'ya ulaşamıyor olabilir.',
    modelsProviderCount: '%1 sağlayıcı · PC companion',
    modelUnavailable: 'kullanılamıyor',
    modelSelected: 'seçili',

    settingsTitle: 'Ayarlar',
    settingsConnection: 'Bağlantı',
    settingsCompanion: 'Companion',
    settingsStatus: 'Durum',
    settingsDevice: 'Cihaz',
    settingsDeviceId: 'Cihaz kimliği',
    settingsSession: 'Oturum güvenliği',
    settingsRefreshToken: 'Yenileme anahtarı',
    settingsRefreshTokenValue: 'HttpOnly çerez',
    settingsAccessToken: 'Erişim anahtarı',
    settingsAccessTokenValue: 'yalnız bellekte',
    settingsTheme: 'Tema',
    settingsLanguage: 'Dil',
    settingsNotifications: 'Bildirimler',
    settingsNotificationsEnable: 'Bildirimlere izin ver',
    settingsNotificationsOn: 'açık',
    settingsNotificationsOff: 'kapalı',
    settingsNotificationsBlocked: 'tarayıcı engelledi',
    themeHint: 'Tema yalnız bu tarayıcıda saklanır.',
    logout: 'Bağlantıyı kes',
    logoutHint: 'Bu tarayıcının oturumu kapanır. PC\'deki çalışmalar ve geçmiş silinmez.',
    install: 'Uygulama olarak kur',

    statusOnline: 'çevrimiçi',
    statusOffline: 'bağlantı kesildi',
    offlineBanner: 'Companion bağlantısı kesildi · çalışmalar PC\'de sürer',
    reconnectBanner: 'Yeniden bağlanılıyor… (%1/%2) · çalışma host\'ta sürer, kaybolmaz',
    sessionExpired: 'Oturum süresi doldu. Yeni bir eşleştirme kodu gir.',
    genericError: 'Beklenmeyen bir hata oluştu.',
    dismiss: 'Kapat',

    notifyCompleted: 'Çalışma tamamlandı',
    notifyFailed: 'Çalışma başarısız',
    notifyCompletedBody: 'Ajan sonucu hazır.',
    notifyFailedBody: 'Ayrıntılar için oturumu aç.',

    statusQueued: 'kuyrukta',
    statusRunning: 'çalışıyor',
    statusPaused: 'duraklatıldı',
    statusCompleted: 'tamamlandı',
    statusFailed: 'başarısız',
    statusCancelled: 'iptal edildi',
  },

  en: {
    appName: 'Local_Agents',
    tagline: 'PC agent console',
    loading: 'Loading…',

    navSessions: 'Sessions',
    navChat: 'Chat',
    navRuns: 'Runs',
    navModels: 'Models',
    navSettings: 'Settings',

    pairTitle: 'Connect this browser to the PC companion',
    pairBody: 'The web console is a control surface too. Model keys, files, and runs stay on the PC.',
    pairStep1Title: 'Create a code in the admin page',
    pairStep1Detail: 'Open /admin on the PC, enter the admin token, and generate a one-time pairing code.',
    pairStep2Title: 'Enter the code here',
    pairStep2Detail: 'The code is single-use and expires quickly. Case and separators do not matter.',
    pairStep3Title: 'Pick a model and run',
    pairStep3Detail: 'A local model on the PC produces the answer. Runs continue even if you close the browser.',
    pairCodeLabel: 'Pairing code',
    pairNameLabel: 'Name for this browser',
    pairAction: 'Connect',
    pairing: 'Connecting…',
    pairCodeRequired: 'Enter the pairing code.',
    adminLink: 'Open the admin page',

    hostChecking: 'Checking…',
    hostOnline: 'online',
    hostOffline: 'offline',
    hostCompanion: 'PC companion',
    hostModelReady: '%1 ready',
    hostModelMissing: '%1 not installed',
    hostWebOn: 'web research on',
    hostWebOff: 'web research off',
    hostModelCount: '%1 models',

    sessionsTitle: 'Sessions',
    sessionsEmpty: 'No sessions yet.',
    sessionsEmptyHint: 'Start a new chat and give it the first task.',
    newChat: 'New chat',
    rename: 'Rename',
    renameTitle: 'Rename session',
    delete: 'Delete',
    deleteTitle: 'Delete session',
    deleteBody: '“%1” and all of its messages, runs, and events will be permanently deleted. This cannot be undone.',
    cancel: 'Cancel',
    save: 'Save',
    toolCount: '%1 tools',

    chatEmpty: 'Write the first task.',
    chatEmptyHint: 'The agent runs on the PC; tool activity streams here live.',
    chatNoSession: 'Select a session or start a new chat first.',
    composerPlaceholder: 'Describe the task…',
    send: 'Send',
    you: 'you',
    assistant: 'agent',
    thinking: 'thinking…',
    working: 'working…',

    pause: 'Pause',
    resume: 'Resume',
    stop: 'Stop',
    steer: 'Steer',
    steerPlaceholder: 'Additional direction…',
    steerSend: 'Send direction',

    toolsTitle: 'Tool activity',
    sourcesTitle: 'Sources',
    toolArguments: 'Arguments',
    toolResult: 'Result',
    toolError: 'Error',
    toolRunning: 'running',
    toolDone: 'done',
    toolFailed: 'failed',

    contextUsage: 'Context · %1 / %2 tokens · %3%',
    contextMemory: '%1 messages summarized',
    contextNoMemory: 'No summary',
    compress: 'Summarize & continue',
    compressing: 'Summarizing…',

    runsTitle: 'Runs',
    runsEmpty: 'No recorded runs.',

    modelsTitle: 'Models',
    modelsEmpty: 'No models listed. The companion may not be reaching Ollama.',
    modelsProviderCount: '%1 providers · PC companion',
    modelUnavailable: 'unavailable',
    modelSelected: 'selected',

    settingsTitle: 'Settings',
    settingsConnection: 'Connection',
    settingsCompanion: 'Companion',
    settingsStatus: 'Status',
    settingsDevice: 'Device',
    settingsDeviceId: 'Device ID',
    settingsSession: 'Session security',
    settingsRefreshToken: 'Refresh token',
    settingsRefreshTokenValue: 'HttpOnly cookie',
    settingsAccessToken: 'Access token',
    settingsAccessTokenValue: 'memory only',
    settingsTheme: 'Theme',
    settingsLanguage: 'Language',
    settingsNotifications: 'Notifications',
    settingsNotificationsEnable: 'Allow notifications',
    settingsNotificationsOn: 'on',
    settingsNotificationsOff: 'off',
    settingsNotificationsBlocked: 'blocked by browser',
    themeHint: 'The theme is stored in this browser only.',
    logout: 'Disconnect',
    logoutHint: 'Ends this browser session. Runs and history on the PC are not deleted.',
    install: 'Install as an app',

    statusOnline: 'online',
    statusOffline: 'disconnected',
    offlineBanner: 'Companion disconnected · runs continue on the PC',
    reconnectBanner: 'Reconnecting… (%1/%2) · the run continues on the host and is not lost',
    sessionExpired: 'Session expired. Enter a new pairing code.',
    genericError: 'Something went wrong.',
    dismiss: 'Dismiss',

    notifyCompleted: 'Run completed',
    notifyFailed: 'Run failed',
    notifyCompletedBody: 'The agent result is ready.',
    notifyFailedBody: 'Open the session for details.',

    statusQueued: 'queued',
    statusRunning: 'running',
    statusPaused: 'paused',
    statusCompleted: 'completed',
    statusFailed: 'failed',
    statusCancelled: 'cancelled',
  },
};

export const LANGUAGES = [
  { id: 'tr', label: 'Türkçe' },
  { id: 'en', label: 'English' },
];

const STORAGE_KEY = 'local-agents.lang';

export function detectLanguage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && STRINGS[stored]) return stored;
  } catch {
    /* private-mode browsers deny storage; fall back to the browser locale */
  }
  const preferred = (navigator.languages || [navigator.language || 'tr'])
    .map((value) => String(value).slice(0, 2).toLowerCase())
    .find((value) => STRINGS[value]);
  return preferred || 'tr';
}

export function storeLanguage(lang) {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* ignore: language choice simply will not persist */
  }
}

let current = 'tr';

export function setLanguage(lang) {
  current = STRINGS[lang] ? lang : 'tr';
  document.documentElement.lang = current;
  return current;
}

export function language() {
  return current;
}

/** Look up a string and substitute %1, %2, … placeholders. */
export function t(key, ...args) {
  const table = STRINGS[current] || STRINGS.tr;
  const raw = table[key] ?? STRINGS.tr[key] ?? key;
  return args.reduce((text, value, index) => text.split(`%${index + 1}`).join(String(value)), raw);
}

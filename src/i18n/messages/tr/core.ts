import type { Messages } from "../en";

export const nav: Messages["nav"] = {
  home: "Ana sayfa",
  dashboard: "Pano",
  certifications: "Sertifikalar",
  learn: "Öğren",
  practice: "Alıştırma",
  labs: "Laboratuvarlar",
  plan: "Çalışma Planı",
  progress: "İlerleme",
  tutor: "Yapay Zekâ Eğitmeni",
  bookmarks: "Yer işaretleri",
  admin: "Yönetici",
  settings: "Ayarlar",
  profile: "Profil ve ayarlar",
  glossary: "Sözlük",
  compare: "Karşılaştır",
  concepts: "Kavram haritası",
  flashcards: "Bilgi kartları",
  search: "Ara",
  reminders: "Anımsatıcılar",
  noReminders: "Tüm işleriniz tamam.",
  mainNavigation: "Ana gezinti",
  userMenu: "Hesap menüsü",
  signedInAs: "{email} olarak giriş yapıldı",
};

export const legal: Messages["legal"] = {
  disclaimer:
    "Microsoft Fundamentals Academy bağımsız bir öğrenme ve alıştırma platformudur. Resmî bir Microsoft ürünü değildir ve gerçek Microsoft sertifika sınavı soruları içermez.",
  trademarks:
    "Microsoft, Azure, Microsoft 365, Dynamics 365, Power Platform, Copilot ve GitHub, Microsoft şirketler grubunun ticari markalarıdır. Burada yalnızca bu platformun çalışmanıza yardımcı olduğu sertifikaları tanımlamak için kullanılır ve onay, sponsorluk veya ortaklık anlamına gelmez.",
  originalQuestions:
    "Tüm alıştırma soruları özgündür ve öğrenme amacıyla yazılmıştır. Gerçek sertifika sınavı soruları değildir.",
  readinessNotice:
    "Hazır olma durumu, kendi etkinliğinize dayalı iç bir tahmindir. Resmî bir öngörü değildir ve geçme sonucunu garanti etmez.",
  aiNotice:
    "Yapay zekâ tarafından oluşturulan içerik etiketlenir, onaylı kurs materyaline dayandırılır ve insan incelemesi olmadan asla yayımlanmaz.",
  sourcesNotice:
    "Resmî Microsoft Learn sayfaları, sınav hedefleri için yetkili kaynaktır. Sınavınızdan önce bunları mutlaka kontrol edin.",
  privacyTitle: "Gizlilik",
  privacyBody:
    "Yalnızca öğrenme deneyiminizi yürütmek için gerekenleri toplarız: e-posta adresiniz, isteğe bağlı görünen adınız, tercihleriniz ve öğrenme etkinliğiniz. Verilerinizi Ayarlar bölümünden istediğiniz zaman dışarı aktarabilir veya silebilirsiniz.",
};

export const errors: Messages["errors"] = {
  password_too_short: "En az 10 karakter kullanın.",
  password_too_long: "En fazla 128 karakter kullanın.",
  password_needs_letter_and_digit: "En az bir harf ve bir sayı ekleyin.",
  password_too_common: "Bu parola çok yaygın. Başka bir parola seçin.",
  passwords_do_not_match: "Parolalar eşleşmiyor.",
  terms_required: "Devam etmek için lütfen onaylayın.",
  email_invalid: "Geçerli bir e-posta adresi girin.",
  email_taken: "Bu e-posta adresiyle zaten bir hesap var.",
  registration_disabled: "Kayıt şu anda devre dışı.",
  invalid_credentials: "E-posta veya parola hatalı.",
  account_suspended: "Bu hesap askıya alınmış. Bir yöneticiyle iletişime geçin.",
  current_password_invalid: "Geçerli parolanız hatalı.",
  confirmation_mismatch: "Onay metnini gösterildiği gibi aynen yazın.",
  not_found: "İstenen öğe bulunamadı.",
  invalid_input: "Bazı değerler geçersiz.",
  attempt_closed: "Bu deneme zaten kapatılmış.",
  attempt_expired: "Süre doldu. Cevaplarınız otomatik olarak gönderildi.",
  no_questions: "Bu seçim için henüz yeterli sayıda yayımlanmış soru yok.",
  forbidden: "Bunu yapma izniniz yok.",
  rate_limited: "Çok fazla istek gönderildi. Lütfen yavaşlayın.",
  comment_required: "Bu eylem için yorum gerekir.",
  invalid_transition: "Bu eyleme geçerli durum için izin verilmiyor.",
  publish_date_required: "Gelecekte bir yayın tarihi seçin.",
  self_demotion: "Kendi yönetici rolünüzü kaldıramazsınız.",
  cannot_self_suspend: "Kendi hesabınızı askıya alamazsınız.",
  last_admin: "En az bir etkin yönetici kalmalıdır.",
  change_note_required: "Kaydetmeden önce neyin değiştiğini açıklayın.",
  disabled: "Bu özellik şu anda devre dışı.",
  invalid_lab_config: "Laboratuvar yapılandırması geçersiz. Vurgulanan alanları kontrol edin.",
  invalid_question: "Soru geçersiz. Cevap anahtarını ve seçenekleri kontrol edin.",
  tutor_daily_limit: "Bugünkü eğitmen mesajı sınırına ulaştınız. Lütfen yarın tekrar deneyin.",
  tutor_disabled: "Yapay zekâ eğitmeni şu anda bir yönetici tarafından kapatılmış.",
  event_log_limit: "Bu laboratuvar denemesinde çok fazla eylem var. Devam etmek için laboratuvarı sıfırlayın.",
  future_date: "Gelecekte bir tarih seçin.",
  reasoning_required: "Cevabı göstermek için kısa bir açıklama yazın (en az 15 karakter).",
  unknown: "Bir şeyler ters gitti. Lütfen tekrar deneyin.",
};

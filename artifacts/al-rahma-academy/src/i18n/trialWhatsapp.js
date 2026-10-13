// Copy for the optional "send the details on WhatsApp too" follow-up shown
// after a SUCCESSFUL free-trial request (Trial, QuickTrialModal,
// ExitIntentPopup). The labels go into the pre-filled WhatsApp message built
// by utils/whatsapp.js (buildTrialWhatsappLink); `intro` is its first line.
// Kept in its own module so the shared locale files are untouched.
const TEXT = {
  en: {
    button: 'Send details via WhatsApp',
    hint: 'Optional: you can also send us these details on WhatsApp.',
    intro: 'Hello, I just requested a free trial lesson on Al-Rahma Academy.',
    labels: { name: 'Name', course: 'Course', email: 'Email', phone: 'Phone / WhatsApp', message: 'Message' },
  },
  ar: {
    button: 'إرسال التفاصيل عبر WhatsApp',
    hint: 'اختياري: يمكنك أيضًا إرسال هذه التفاصيل إلينا عبر WhatsApp.',
    intro: 'السلام عليكم، أرسلت للتو طلب حصة تجريبية مجانية في أكاديمية الرحمة.',
    labels: { name: 'الاسم', course: 'الكورس', email: 'البريد الإلكتروني', phone: 'الهاتف / WhatsApp', message: 'الرسالة' },
  },
  fr: {
    button: 'Envoyer les détails via WhatsApp',
    hint: 'Facultatif : vous pouvez aussi nous envoyer ces informations sur WhatsApp.',
    intro: "Bonjour, je viens de demander un cours d'essai gratuit sur Al-Rahma Academy.",
    labels: { name: 'Nom', course: 'Cours', email: 'E-mail', phone: 'Téléphone / WhatsApp', message: 'Message' },
  },
  it: {
    button: 'Invia i dettagli su WhatsApp',
    hint: 'Facoltativo: puoi inviarci questi dati anche su WhatsApp.',
    intro: 'Salve, ho appena richiesto una lezione di prova gratuita su Al-Rahma Academy.',
    labels: { name: 'Nome', course: 'Corso', email: 'Email', phone: 'Telefono / WhatsApp', message: 'Messaggio' },
  },
  de: {
    button: 'Details per WhatsApp senden',
    hint: 'Optional: Sie können uns diese Angaben auch per WhatsApp senden.',
    intro: 'Hallo, ich habe gerade eine kostenlose Probestunde bei der Al-Rahma Academy angefragt.',
    labels: { name: 'Name', course: 'Kurs', email: 'E-Mail', phone: 'Telefon / WhatsApp', message: 'Nachricht' },
  },
  es: {
    button: 'Enviar los datos por WhatsApp',
    hint: 'Opcional: también puedes enviarnos estos datos por WhatsApp.',
    intro: 'Hola, acabo de solicitar una clase de prueba gratuita en Al-Rahma Academy.',
    labels: { name: 'Nombre', course: 'Curso', email: 'Correo electrónico', phone: 'Teléfono / WhatsApp', message: 'Mensaje' },
  },
};

export const TRIAL_WHATSAPP_LANGS = Object.freeze(Object.keys(TEXT));

export function getTrialWhatsappText(lang) {
  return TEXT[lang] || TEXT.en;
}

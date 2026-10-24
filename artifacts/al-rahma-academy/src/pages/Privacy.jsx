import PageBar from '../components/layout/PageBar';
import { site } from '../data';
import useSEO from '../hooks/useSEO';
import Breadcrumbs from '../components/ui/Breadcrumbs';
import { useLang } from '../context/LangContext';
import CookieSettingsButton from '../components/ui/CookieSettingsButton';
import { getMeasurementId } from '../analytics/ga';

// Google Analytics disclosure, shown only while GA is actually configured.
// Owner-approved scope (EN/AR). French (Batch 1C) is translated from the
// English only, owner review recommended (see
// docs/french-localization-registry.md). Other locales fall back to English
// until their translation is approved.
// Italian mirrors the English and quotes the Italian banner buttons verbatim
// (CONSENT_COPY.it; a test keeps the two in step).
export const ANALYTICS_PRIVACY_COPY = {
  en: {
    title: 'Analytics cookies',
    what: 'With your permission, we use Google Analytics 4 to understand how visitors use our website so we can improve it.',
    when: 'Google Analytics is loaded only after you choose “Accept analytics” in the cookie banner. If you choose “Reject” or make no choice, it is not loaded.',
    forms: 'We do not send the information you enter in our forms — such as your name, email address or phone number — to Google Analytics.',
    change: 'You can change or withdraw your choice at any time from',
    google: 'How Google uses information from sites that use its services',
  },
  ar: {
    title: 'ملفات تعريف الارتباط الخاصة بالتحليلات',
    what: 'بعد موافقتك، نستخدم Google Analytics 4 لفهم كيفية استخدام الزوار لموقعنا حتى نتمكن من تحسينه.',
    when: 'لا يتم تحميل Google Analytics إلا بعد اختيارك «السماح بالتحليلات» في شريط ملفات تعريف الارتباط. إذا اخترت «رفض» أو لم تختر شيئًا، فلن يتم تحميله.',
    forms: 'لا نرسل المعلومات التي تُدخلها في نماذجنا — مثل اسمك أو بريدك الإلكتروني أو رقم هاتفك — إلى Google Analytics.',
    change: 'يمكنك تغيير اختيارك أو سحبه في أي وقت من',
    google: 'كيف تستخدم Google المعلومات من المواقع التي تستخدم خدماتها',
  },
  fr: {
    title: 'Cookies d’analyse',
    what: 'Avec votre autorisation, nous utilisons Google Analytics 4 pour comprendre comment les visiteurs utilisent notre site web, afin de pouvoir l’améliorer.',
    when: 'Google Analytics n’est chargé qu’après que vous avez choisi « Accepter les cookies d’analyse » dans le bandeau des cookies. Si vous choisissez « Refuser » ou ne faites aucun choix, il n’est pas chargé.',
    forms: 'Nous n’envoyons pas à Google Analytics les informations que vous saisissez dans nos formulaires — comme votre nom, votre adresse e-mail ou votre numéro de téléphone.',
    change: 'Vous pouvez modifier ou retirer votre choix à tout moment depuis',
    google: 'Comment Google utilise les informations des sites qui utilisent ses services',
  },
  it: {
    title: 'Cookie analitici',
    what: 'Con il tuo consenso, utilizziamo Google Analytics 4 per capire come i visitatori usano il nostro sito web, così da poterlo migliorare.',
    when: 'Google Analytics viene caricato solo dopo che scegli «Accetta i cookie analitici» nel banner dei cookie. Se scegli «Rifiuta» o non fai alcuna scelta, non viene caricato.',
    forms: 'Non inviamo a Google Analytics le informazioni che inserisci nei nostri moduli, come il tuo nome, il tuo indirizzo email o il tuo numero di telefono.',
    change: 'Puoi modificare o revocare la tua scelta in qualsiasi momento da',
    google: 'Come Google utilizza le informazioni dei siti che usano i suoi servizi',
  },
};

function AnalyticsSection({ lang }) {
  if (!getMeasurementId()) return null;
  const ga = ANALYTICS_PRIVACY_COPY[lang] || ANALYTICS_PRIVACY_COPY.en;
  return (
    <section id="analytics-cookies">
      <h2>{ga.title}</h2>
      <p>{ga.what}</p>
      <p>{ga.when}</p>
      <p>{ga.forms}</p>
      <p>{ga.change} <CookieSettingsButton />.</p>
      <p>
        <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener noreferrer">
          {ga.google}
        </a>
      </p>
    </section>
  );
}

// YouTube API Services disclosure (YouTube API Services Developer Policies:
// say the API is used, link the Google Privacy Policy and the Google
// permissions page). The English text is the owner-approved wording; the
// other locales translate it. Text and links only: nothing here loads YouTube.
export const YOUTUBE_API_PRIVACY_COPY = {
  en: {
    title: 'YouTube API Services',
    uses: "Al-Rahma Academy uses YouTube API Services to upload the academy's own videos to its own YouTube channel.",
    googlePolicy: "Google's handling of data is described in the Google Privacy Policy:",
    scope: "Our publishing tool accesses only the academy's own YouTube channel. It uses the API to upload videos and to confirm that each upload reached our channel. It stores only our channel ID, the IDs of the videos it uploaded and their upload status. It never collects data about viewers or other channels, and it never shares YouTube data with third parties.",
    revoke: "You can revoke the tool's access to a Google account at any time from the Google security settings page:",
    deleteData: 'To ask us to delete stored data, write to',
  },
  ar: {
    title: 'خدمات YouTube API',
    uses: 'تستخدم أكاديمية الرحمة خدمات YouTube API لرفع مقاطع الفيديو الخاصة بالأكاديمية إلى قناتها الخاصة على YouTube.',
    googlePolicy: 'وتوضح سياسة خصوصية Google كيفية تعامل Google مع البيانات:',
    scope: 'لا تصل أداة النشر الخاصة بنا إلا إلى قناة YouTube الخاصة بالأكاديمية. وتستخدم الواجهة البرمجية لرفع مقاطع الفيديو وللتأكد من وصول كل مقطع مرفوع إلى قناتنا. ولا تخزّن سوى مُعرّف قناتنا ومُعرّفات مقاطع الفيديو التي رفعتها وحالة رفعها. ولا تجمع أبدًا أي بيانات عن المشاهدين أو عن قنوات أخرى، ولا تشارك بيانات YouTube مطلقًا مع أطراف ثالثة.',
    revoke: 'يمكنك إلغاء وصول الأداة إلى حساب Google في أي وقت من صفحة إعدادات الأمان في Google:',
    deleteData: 'ولطلب حذف البيانات المخزّنة، راسلنا على',
  },
  it: {
    title: 'Servizi API di YouTube',
    uses: 'Al-Rahma Academy utilizza i Servizi API di YouTube per caricare i video dell’accademia sul canale YouTube dell’accademia stessa.',
    googlePolicy: 'Il modo in cui Google tratta i dati è descritto nelle Norme sulla privacy di Google:',
    scope: 'Il nostro strumento di pubblicazione accede soltanto al canale YouTube dell’accademia. Utilizza l’API per caricare i video e per verificare che ogni caricamento sia arrivato sul nostro canale. Conserva soltanto l’ID del nostro canale, gli ID dei video che ha caricato e il loro stato di caricamento. Non raccoglie mai dati sugli spettatori o su altri canali e non condivide mai i dati di YouTube con terze parti.',
    revoke: 'Puoi revocare in qualsiasi momento l’accesso dello strumento a un account Google dalla pagina delle impostazioni di sicurezza di Google:',
    deleteData: 'Per chiederci di eliminare i dati conservati, scrivici a',
  },
  es: {
    title: 'Servicios de la API de YouTube',
    uses: 'Al-Rahma Academy utiliza los Servicios de la API de YouTube para subir los vídeos propios de la academia a su propio canal de YouTube.',
    googlePolicy: 'La forma en que Google trata los datos se describe en la Política de Privacidad de Google:',
    scope: 'Nuestra herramienta de publicación solo accede al canal de YouTube de la propia academia. Utiliza la API para subir vídeos y para confirmar que cada vídeo subido ha llegado a nuestro canal. Solo almacena el ID de nuestro canal, los ID de los vídeos que ha subido y su estado de subida. Nunca recopila datos sobre los espectadores ni sobre otros canales, y nunca comparte datos de YouTube con terceros.',
    revoke: 'Puedes revocar en cualquier momento el acceso de la herramienta a una cuenta de Google desde la página de configuración de seguridad de Google:',
    deleteData: 'Para pedirnos que eliminemos los datos almacenados, escríbenos a',
  },
  de: {
    title: 'YouTube-API-Dienste',
    uses: 'Die Al-Rahma Academy nutzt die YouTube-API-Dienste, um die eigenen Videos der Akademie auf ihren eigenen YouTube-Kanal hochzuladen.',
    googlePolicy: 'Wie Google mit Daten umgeht, ist in der Datenschutzerklärung von Google beschrieben:',
    scope: 'Unser Veröffentlichungstool greift ausschließlich auf den eigenen YouTube-Kanal der Akademie zu. Es nutzt die API, um Videos hochzuladen und um zu bestätigen, dass jedes hochgeladene Video unseren Kanal erreicht hat. Es speichert nur unsere Kanal-ID, die IDs der hochgeladenen Videos und deren Upload-Status. Es erhebt niemals Daten über Zuschauer oder andere Kanäle und gibt YouTube-Daten niemals an Dritte weiter.',
    revoke: 'Sie können den Zugriff des Tools auf ein Google-Konto jederzeit auf der Seite mit den Google-Sicherheitseinstellungen widerrufen:',
    deleteData: 'Wenn Sie die Löschung gespeicherter Daten wünschen, schreiben Sie uns an',
  },
  fr: {
    title: 'Services d’API YouTube',
    uses: 'Al-Rahma Academy utilise les Services d’API YouTube pour mettre en ligne les vidéos de l’académie sur sa propre chaîne YouTube.',
    googlePolicy: 'La manière dont Google traite les données est décrite dans les Règles de confidentialité de Google :',
    scope: 'Notre outil de publication n’accède qu’à la chaîne YouTube de l’académie. Il utilise l’API pour mettre en ligne des vidéos et pour confirmer que chaque vidéo mise en ligne a bien atteint notre chaîne. Il ne conserve que l’identifiant de notre chaîne, les identifiants des vidéos qu’il a mises en ligne et leur état de mise en ligne. Il ne collecte jamais de données sur les spectateurs ou sur d’autres chaînes, et ne partage jamais de données YouTube avec des tiers.',
    revoke: 'Vous pouvez révoquer à tout moment l’accès de l’outil à un compte Google depuis la page des paramètres de sécurité de Google :',
    deleteData: 'Pour nous demander de supprimer les données conservées, écrivez-nous à',
  },
};

const GOOGLE_PRIVACY_POLICY_URL = 'https://policies.google.com/privacy';
const GOOGLE_PERMISSIONS_URL = 'https://myaccount.google.com/permissions';

function YouTubeApiSection({ lang }) {
  const yt = YOUTUBE_API_PRIVACY_COPY[lang] || YOUTUBE_API_PRIVACY_COPY.en;
  return (
    <section id="youtube-api-services">
      <h2>{yt.title}</h2>
      <p>
        {yt.uses} {yt.googlePolicy}{' '}
        <a href={GOOGLE_PRIVACY_POLICY_URL} target="_blank" rel="noopener noreferrer" dir="ltr">{GOOGLE_PRIVACY_POLICY_URL}</a>
      </p>
      <p>{yt.scope}</p>
      <p>
        {yt.revoke}{' '}
        <a href={GOOGLE_PERMISSIONS_URL} target="_blank" rel="noopener noreferrer" dir="ltr">{GOOGLE_PERMISSIONS_URL}</a>.{' '}
        {yt.deleteData}{' '}
        <a href={`mailto:${site.email}`}>{site.email}</a>.
      </p>
    </section>
  );
}

export default function Privacy() {
  const { lang } = useLang();
  const copy = {
    ar: {
        seoTitle: 'سياسة الخصوصية',
        seoDescription: 'اقرأ سياسة خصوصية أكاديمية الرحمة لتعرف كيف نجمع بياناتك الشخصية ونستخدمها ونحميها.',
        academy: 'الأكاديمية',
        title: 'سياسة الخصوصية',
        updated: 'آخر تحديث: أكتوبر 2026',
        intro: 'في أكاديمية',
        introEnd: 'نحترم خصوصيتك. توضح هذه الصفحة المعلومات التي نجمعها وكيف نستخدمها.',
        collectTitle: 'المعلومات التي نجمعها',
        collect: 'عند حجز درس تجريبي مجاني أو الاشتراك في نشرتنا الإخبارية، نجمع التفاصيل التي تقدمها — مثل اسمك وبريدك الإلكتروني ورقم هاتفك والدورة التي تهتم بها.',
        useTitle: 'كيف نستخدمها',
        uses: [
          'للتواصل معك وتحديد مواعيد دروسك.',
          'لتحسين دوراتنا وخدماتنا.',
          'لإرسال التحديثات والمقالات الإسلامية (فقط إذا اشتركت).',
        ],
        rightsTitle: 'حقوقك',
        rightsStart: 'يمكنك أن تطلب منا تحديث بياناتك أو حذفها في أي وقت عبر مراسلتنا على البريد الإلكتروني',
        contactTitle: 'تواصل معنا',
        contactStart: 'لأي أسئلة حول هذه السياسة، تواصل معنا على',
        or: 'أو',
    },
    en: {
        seoTitle: 'Privacy Policy',
        seoDescription: 'Read the AL-Rahma Academy privacy policy to understand how we collect, use and protect your personal data.',
        academy: 'Academy',
        title: 'Privacy Policy',
        updated: 'Last updated: October 2026',
        intro: 'At',
        introEnd: 'Academy we respect your privacy. This page explains what information we collect and how we use it.',
        collectTitle: 'Information we collect',
        collect: 'When you book a free trial or subscribe to our newsletter, we collect the details you provide — such as your name, email, phone number and the course you’re interested in.',
        useTitle: 'How we use it',
        uses: [
          'To contact you and schedule your lessons.',
          'To improve our courses and services.',
          'To send updates and Islamic articles (only if you subscribe).',
        ],
        rightsTitle: 'Your rights',
        rightsStart: 'You can ask us to update or delete your data at any time by emailing',
        contactTitle: 'Contact',
        contactStart: 'For any questions about this policy, reach us at',
        or: 'or',
    },
    it: {
      seoTitle: 'Informativa sulla privacy', seoDescription: 'Leggi l’informativa sulla privacy di Al-Rahma Academy per capire come raccogliamo, utilizziamo e proteggiamo i tuoi dati personali.',
      academy: 'Accademia', title: 'Informativa sulla privacy', updated: 'Ultimo aggiornamento: ottobre 2026',
      intro: 'Presso', introEnd: 'Academy rispettiamo la tua privacy. Questa pagina spiega quali informazioni raccogliamo e come le utilizziamo.',
      collectTitle: 'Informazioni che raccogliamo', collect: 'Quando prenoti una prova gratuita o ti iscrivi alla nostra newsletter, raccogliamo i dati che fornisci, quali nome, e-mail, numero di telefono e corso di tuo interesse.',
      useTitle: 'Come le utilizziamo', uses: ['Per contattarti e programmare le tue lezioni.', 'Per migliorare i nostri corsi e servizi.', 'Per inviare aggiornamenti e articoli islamici (solo se ti iscrivi).'],
      rightsTitle: 'I tuoi diritti', rightsStart: 'Puoi chiederci di aggiornare o eliminare i tuoi dati in qualsiasi momento scrivendoci a', contactTitle: 'Contatti', contactStart: 'Per qualsiasi domanda su questa informativa, contattaci a', or: 'oppure',
    },
    es: {
      seoTitle: 'Política de privacidad', seoDescription: 'Lee la política de privacidad de Al-Rahma Academy para saber cómo recopilamos, usamos y protegemos tus datos personales.',
      academy: 'Academia', title: 'Política de privacidad', updated: 'Última actualización: octubre de 2026',
      intro: 'En', introEnd: 'Academy respetamos tu privacidad. Esta página explica qué información recopilamos y cómo la usamos.',
      collectTitle: 'Información que recopilamos', collect: 'Cuando reservas una clase de prueba gratuita o te suscribes a nuestro boletín, recopilamos los datos que proporcionas, como tu nombre, correo electrónico, número de teléfono y el curso que te interesa.',
      useTitle: 'Cómo la usamos', uses: ['Para contactarte y programar tus clases.', 'Para mejorar nuestros cursos y servicios.', 'Para enviar actualizaciones y artículos islámicos (solo si te suscribes).'],
      rightsTitle: 'Tus derechos', rightsStart: 'Puedes pedirnos que actualicemos o eliminemos tus datos en cualquier momento escribiéndonos a', contactTitle: 'Contacto', contactStart: 'Para cualquier pregunta sobre esta política, contáctanos en', or: 'o',
    },
    de: {
      seoTitle: 'Datenschutzerklärung', seoDescription: 'Lesen Sie die Datenschutzerklärung der Al-Rahma Academy, um zu erfahren, wie wir Ihre personenbezogenen Daten erheben, verwenden und schützen.',
      academy: 'Akademie', title: 'Datenschutzerklärung', updated: 'Zuletzt aktualisiert: Oktober 2026',
      intro: 'Bei der', introEnd: 'Academy respektieren wir Ihre Privatsphäre. Auf dieser Seite erklären wir, welche Informationen wir erheben und wie wir sie verwenden.',
      collectTitle: 'Informationen, die wir erheben', collect: 'Wenn Sie eine kostenlose Probestunde buchen oder unseren Newsletter abonnieren, erheben wir die von Ihnen angegebenen Daten – etwa Ihren Namen, Ihre E-Mail-Adresse, Telefonnummer und den Kurs, für den Sie sich interessieren.',
      useTitle: 'Wie wir sie verwenden', uses: ['Um Sie zu kontaktieren und Ihre Unterrichtsstunden zu planen.', 'Um unsere Kurse und Dienstleistungen zu verbessern.', 'Um Updates und islamische Artikel zu versenden (nur wenn Sie sie abonnieren).'],
      rightsTitle: 'Ihre Rechte', rightsStart: 'Sie können uns jederzeit per E-Mail bitten, Ihre Daten zu aktualisieren oder zu löschen:', contactTitle: 'Kontakt', contactStart: 'Bei Fragen zu dieser Erklärung erreichen Sie uns unter', or: 'oder',
    },
    fr: {
      seoTitle: 'Politique de confidentialité', seoDescription: 'Lisez la politique de confidentialité d’Al-Rahma Academy pour comprendre comment nous recueillons, utilisons et protégeons vos données personnelles.',
      academy: 'Académie', title: 'Politique de confidentialité', updated: 'Dernière mise à jour : octobre 2026',
      intro: 'Chez', introEnd: 'Academy, nous respectons votre vie privée. Cette page explique quelles informations nous recueillons et comment nous les utilisons.',
      collectTitle: 'Informations que nous recueillons', collect: 'Lorsque vous réservez un essai gratuit ou vous inscrivez à notre newsletter, nous recueillons les informations que vous fournissez, telles que votre nom, votre e-mail, votre numéro de téléphone et le cours qui vous intéresse.',
      useTitle: 'Comment nous les utilisons', uses: ['Pour vous contacter et planifier vos leçons.', 'Pour améliorer nos cours et services.', 'Pour envoyer des mises à jour et des articles islamiques (uniquement si vous vous inscrivez).'],
      rightsTitle: 'Vos droits', rightsStart: 'Vous pouvez nous demander de mettre à jour ou de supprimer vos données à tout moment en nous écrivant à', contactTitle: 'Contact', contactStart: 'Pour toute question concernant cette politique, contactez-nous à', or: 'ou',
    },
  };
  const content = copy[lang] || copy.en;

  useSEO({ title: content.seoTitle, description: content.seoDescription });
  // PageBar's own default label ("← Back to site") is English-only, so the
  // Arabic page must pass a real Arabic label explicitly. The "← " prefix
  // matches the same convention already used for this exact pattern on
  // FAQ/Blog/PaymentResult (src/i18n/ar.js's backToSite keys) rather than
  // inventing a new arrow direction here. French (Batch 1C) passes the same
  // "← Retour au site" label its other pages use (fr.js backToSite). Every
  // other language still gets PageBar's own default, unchanged.
  return (
    <div className="legal">
      <PageBar to="/" label={lang === 'ar' ? '← العودة إلى الموقع' : lang === 'fr' ? '← Retour au site' : undefined} />

      <Breadcrumbs items={[{ label: content.academy, to: '/academy' }, { label: content.title }]} />

      <main id="main-content" className="container legal__main">
        <h1>{content.title}</h1>
        <p className="legal__updated">{content.updated}</p>

        <p>
          {content.intro} {site.name} {content.introEnd}
        </p>

        <h2>{content.collectTitle}</h2>
        <p>{content.collect}</p>

        <h2>{content.useTitle}</h2>
        <ul>
          {content.uses.map((use) => <li key={use}>{use}</li>)}
        </ul>

        <AnalyticsSection lang={lang} />

        <h2>{content.rightsTitle}</h2>
        <p>
          {content.rightsStart}{' '}
          <a href={`mailto:${site.email}`}>{site.email}</a>.
        </p>

        <YouTubeApiSection lang={lang} />

        <h2>{content.contactTitle}</h2>
        <p>
          {content.contactStart}{' '}
          <a href={`mailto:${site.email}`}>{site.email}</a>{' '}
          {content.or}{' '}
          <a href={site.phoneHref}>{site.phoneInternationalDisplay}</a>.
        </p>
      </main>
    </div>
  );
}

import PageBar from '../components/layout/PageBar';
import { site } from '../data';
import useSEO from '../hooks/useSEO';
import Breadcrumbs from '../components/ui/Breadcrumbs';
import { useLang } from '../context/LangContext';

export default function Privacy() {
  const { lang } = useLang();
  const copy = {
    ar: {
        seoTitle: 'سياسة الخصوصية',
        seoDescription: 'اقرأ سياسة خصوصية أكاديمية الرحمة لتعرف كيف نجمع بياناتك الشخصية ونستخدمها ونحميها.',
        academy: 'الأكاديمية',
        title: 'سياسة الخصوصية',
        updated: 'آخر تحديث: يونيو 2026',
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
        updated: 'Last updated: June 2026',
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
      academy: 'Accademia', title: 'Informativa sulla privacy', updated: 'Ultimo aggiornamento: giugno 2026',
      intro: 'Presso', introEnd: 'Academy rispettiamo la tua privacy. Questa pagina spiega quali informazioni raccogliamo e come le utilizziamo.',
      collectTitle: 'Informazioni che raccogliamo', collect: 'Quando prenoti una prova gratuita o ti iscrivi alla nostra newsletter, raccogliamo i dati che fornisci, quali nome, e-mail, numero di telefono e corso di tuo interesse.',
      useTitle: 'Come le utilizziamo', uses: ['Per contattarti e programmare le tue lezioni.', 'Per migliorare i nostri corsi e servizi.', 'Per inviare aggiornamenti e articoli islamici (solo se ti iscrivi).'],
      rightsTitle: 'I tuoi diritti', rightsStart: 'Puoi chiederci di aggiornare o eliminare i tuoi dati in qualsiasi momento scrivendoci a', contactTitle: 'Contatti', contactStart: 'Per qualsiasi domanda su questa informativa, contattaci a', or: 'oppure',
    },
    es: {
      seoTitle: 'Política de privacidad', seoDescription: 'Lee la política de privacidad de Al-Rahma Academy para saber cómo recopilamos, usamos y protegemos tus datos personales.',
      academy: 'Academia', title: 'Política de privacidad', updated: 'Última actualización: junio de 2026',
      intro: 'En', introEnd: 'Academy respetamos tu privacidad. Esta página explica qué información recopilamos y cómo la usamos.',
      collectTitle: 'Información que recopilamos', collect: 'Cuando reservas una clase de prueba gratuita o te suscribes a nuestro boletín, recopilamos los datos que proporcionas, como tu nombre, correo electrónico, número de teléfono y el curso que te interesa.',
      useTitle: 'Cómo la usamos', uses: ['Para contactarte y programar tus clases.', 'Para mejorar nuestros cursos y servicios.', 'Para enviar actualizaciones y artículos islámicos (solo si te suscribes).'],
      rightsTitle: 'Tus derechos', rightsStart: 'Puedes pedirnos que actualicemos o eliminemos tus datos en cualquier momento escribiéndonos a', contactTitle: 'Contacto', contactStart: 'Para cualquier pregunta sobre esta política, contáctanos en', or: 'o',
    },
    de: {
      seoTitle: 'Datenschutzerklärung', seoDescription: 'Lesen Sie die Datenschutzerklärung der Al-Rahma Academy, um zu erfahren, wie wir Ihre personenbezogenen Daten erheben, verwenden und schützen.',
      academy: 'Akademie', title: 'Datenschutzerklärung', updated: 'Zuletzt aktualisiert: Juni 2026',
      intro: 'Bei der', introEnd: 'Academy respektieren wir Ihre Privatsphäre. Auf dieser Seite erklären wir, welche Informationen wir erheben und wie wir sie verwenden.',
      collectTitle: 'Informationen, die wir erheben', collect: 'Wenn Sie eine kostenlose Probestunde buchen oder unseren Newsletter abonnieren, erheben wir die von Ihnen angegebenen Daten – etwa Ihren Namen, Ihre E-Mail-Adresse, Telefonnummer und den Kurs, für den Sie sich interessieren.',
      useTitle: 'Wie wir sie verwenden', uses: ['Um Sie zu kontaktieren und Ihre Unterrichtsstunden zu planen.', 'Um unsere Kurse und Dienstleistungen zu verbessern.', 'Um Updates und islamische Artikel zu versenden (nur wenn Sie sie abonnieren).'],
      rightsTitle: 'Ihre Rechte', rightsStart: 'Sie können uns jederzeit per E-Mail bitten, Ihre Daten zu aktualisieren oder zu löschen:', contactTitle: 'Kontakt', contactStart: 'Bei Fragen zu dieser Erklärung erreichen Sie uns unter', or: 'oder',
    },
    fr: {
      seoTitle: 'Politique de confidentialité', seoDescription: 'Lisez la politique de confidentialité d’Al-Rahma Academy pour comprendre comment nous recueillons, utilisons et protégeons vos données personnelles.',
      academy: 'Académie', title: 'Politique de confidentialité', updated: 'Dernière mise à jour : juin 2026',
      intro: 'Chez', introEnd: 'Academy, nous respectons votre vie privée. Cette page explique quelles informations nous recueillons et comment nous les utilisons.',
      collectTitle: 'Informations que nous recueillons', collect: 'Lorsque vous réservez un essai gratuit ou vous inscrivez à notre newsletter, nous recueillons les informations que vous fournissez, telles que votre nom, votre e-mail, votre numéro de téléphone et le cours qui vous intéresse.',
      useTitle: 'Comment nous les utilisons', uses: ['Pour vous contacter et planifier vos leçons.', 'Pour améliorer nos cours et services.', 'Pour envoyer des mises à jour et des articles islamiques (uniquement si vous vous inscrivez).'],
      rightsTitle: 'Vos droits', rightsStart: 'Vous pouvez nous demander de mettre à jour ou de supprimer vos données à tout moment en nous écrivant à', contactTitle: 'Contact', contactStart: 'Pour toute question concernant cette politique, contactez-nous à', or: 'ou',
    },
  };
  const content = copy[lang] || copy.en;

  useSEO({ title: content.seoTitle, description: content.seoDescription });
  return (
    <div className="legal">
      <PageBar to="/" />

      <Breadcrumbs items={[{ label: content.academy, to: '/academy' }, { label: content.title }]} />

      <main className="container legal__main">
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

        <h2>{content.rightsTitle}</h2>
        <p>
          {content.rightsStart}{' '}
          <a href={`mailto:${site.email}`}>{site.email}</a>.
        </p>

        <h2>{content.contactTitle}</h2>
        <p>
          {content.contactStart}{' '}
          <a href={`mailto:${site.email}`}>{site.email}</a>{' '}
          {content.or}{' '}
          <a href={`tel:${site.phoneHref}`}>{site.phoneDisplay}</a>.
        </p>
      </main>
    </div>
  );
}

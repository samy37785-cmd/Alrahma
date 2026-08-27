import PageBar from '../components/layout/PageBar';
import { site } from '../data';
import useSEO from '../hooks/useSEO';
import Breadcrumbs from '../components/ui/Breadcrumbs';
import { useLang } from '../context/LangContext';

export default function Privacy() {
  const { lang } = useLang();
  const isArabic = lang === 'ar';

  const content = isArabic
    ? {
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
      }
    : {
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
      };

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

import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import Breadcrumbs from '../components/ui/Breadcrumbs';
import useSEO from '../hooks/useSEO';
import { useLang } from '../context/LangContext';
import { site } from '../data/site';

export default function RefundPolicy() {
  const { lang } = useLang();
  const isArabic = lang === 'ar';
  const content = isArabic
    ? {
        seoTitle: 'سياسة الاسترداد',
        seoDescription:
          'ضمان استرداد الأموال لمدة 14 يومًا. إذا لم تكن راضيًا عن أكاديمية الرحمة، نرد لك 100% من المبلغ — دون طرح أسئلة.',
        academy: 'الأكاديمية',
        breadcrumb: 'سياسة الاسترداد',
        guarantee: 'ضمان استرداد الأموال لمدة 14 يومًا',
        hero:
          'نحن واثقون من جودة معلمينا وتعليمنا. إذا لم تكن راضيًا تمامًا خلال 14 يومًا، فسنعيد لك كامل المبلغ — دون طرح أسئلة ودون نماذج لملئها.',
        lastUpdated: 'آخر تحديث: 28 يونيو 2026',
        howItWorks: 'كيف يعمل الضمان',
        purchase: 'اشترِ أي خطة اشتراك.',
        purchaseText: ' تبدأ مهلة الـ14 يومًا في تاريخ دفعتك الأولى.',
        tryLessons: 'جرّب الدروس.',
        tryLessonsText: ' احضر الجلسات، وتعرّف إلى معلمك، واختبر المنصة بالكامل.',
        notSatisfied: 'لست راضيًا؟',
        notSatisfiedText:
          ' تواصل معنا خلال 14 يومًا عبر البريد الإلكتروني أو واتساب. أخبرنا بما حدث — أو لا تفعل. في كلتا الحالتين، سنرد لك المبلغ.',
        receiveRefund: 'استلم المبلغ المسترد',
        receiveRefundText: ' خلال 5–10 أيام عمل إلى وسيلة الدفع الأصلية (البطاقة أو PayPal).',
        covered: 'ما يشمله الضمان',
        coveredItems: [
          '✅ جميع خطط الاشتراك (Starter وStandard وPremium)',
          '✅ فترة الفوترة الأولى فقط',
          '✅ لا يشترط حضور حد أدنى من الدروس للتأهل',
          '✅ لا تُخصم قيمة الدروس التي تم حضورها بالفعل',
          '✅ استرداد كامل بنسبة 100% — لا توجد استردادات جزئية ولا «رصيد متجر»',
        ],
        notCovered: 'ما لا يشمله الضمان',
        notCoveredItems: [
          '❌ طلبات الاسترداد المقدمة بعد مرور 14 يومًا من الدفعة الأولى',
          '❌ التجديدات الشهرية اللاحقة (الدفعة الأولى فقط مشمولة بالضمان)',
          '❌ دروس التجربة المجانية (مجاني = لا توجد دفعة = لا ينطبق الاسترداد)',
        ],
        cancellation: 'الإلغاء دون استرداد',
        cancellationText:
          'بعد انتهاء مهلة الـ14 يومًا، يمكنك إلغاء اشتراكك في أي وقت من صفحة الفوترة الخاصة بك. يوقف الإلغاء التجديدات المستقبلية، لكنه لا يتيح استردادًا للفترة الحالية. ويظل بإمكانك الوصول إلى دروسك المجدولة حتى نهاية الفترة المدفوعة.',
        request: 'كيفية طلب استرداد',
        requestText: 'تواصل معنا عبر أيٍّ من الوسائل التالية — لا حاجة إلى نموذج:',
        email: 'البريد الإلكتروني',
        whatsapp: 'واتساب',
        response:
          'نرد عادةً خلال ساعتين (السبت–الخميس، 08:00–23:00 بتوقيت القاهرة). يتم تأكيد عمليات الاسترداد كتابيًا ومعالجتها خلال 5–10 أيام عمل.',
        promise: 'وعدنا',
        promiseText:
          'وضعنا سياسة الاسترداد هذه لأننا نؤمن بأن معلمينا وتعليمنا يتحدثان عن نفسيهما. إذا لم يلبّيا توقعاتك، فأنت تستحق استعادة أموالك. بهذه البساطة.',
      }
    : {
        seoTitle: 'Refund Policy',
        seoDescription:
          '14-day money-back guarantee. If you are not satisfied with Al-Rahma Academy, we refund 100% — no questions asked.',
        academy: 'Academy',
        breadcrumb: 'Refund Policy',
        guarantee: '14-Day Money-Back Guarantee',
        hero:
          'We are confident in the quality of our tutors and teaching. If you are not completely satisfied within 14 days, we will refund every cent — no questions asked, no forms to fill.',
        lastUpdated: 'Last updated: 28 June 2026',
        howItWorks: 'How the Guarantee Works',
        purchase: 'Purchase any subscription plan.',
        purchaseText: ' Your 14-day window begins on the date of your first payment.',
        tryLessons: 'Try the lessons.',
        tryLessonsText: ' Attend sessions, meet your tutor, experience the platform fully.',
        notSatisfied: 'Not satisfied?',
        notSatisfiedText:
          " Contact us within 14 days by email or WhatsApp. Tell us what happened — or don't. Either way, we refund you.",
        receiveRefund: 'Receive your refund',
        receiveRefundText:
          ' within 5–10 business days to your original payment method (card or PayPal).',
        covered: 'What Is Covered',
        coveredItems: [
          '✅ All subscription plans (Starter, Standard, Premium)',
          '✅ First billing period only',
          '✅ No minimum number of lessons required to qualify',
          '✅ No deductions for lessons already attended',
          '✅ Full 100% refund — no partial refunds, no "store credit"',
        ],
        notCovered: 'What Is Not Covered',
        notCoveredItems: [
          '❌ Refund requests made after 14 days from the initial payment',
          '❌ Subsequent monthly renewals (only the first payment is guaranteed)',
          '❌ Free trial lessons (free = no payment = no refund applicable)',
        ],
        cancellation: 'Cancellation Without Refund',
        cancellationText:
          'After the 14-day window, you may cancel your subscription at any time from your Billing page. Cancellation stops future renewals but does not issue a refund for the current period. You retain access to your scheduled lessons until the end of the paid period.',
        request: 'How to Request a Refund',
        requestText: 'Contact us through any of the following — no form needed:',
        email: 'Email',
        whatsapp: 'WhatsApp',
        response:
          'We typically respond within 2 hours (Sat–Thu, 08:00–23:00 Cairo time). Refunds are confirmed in writing and processed within 5–10 business days.',
        promise: 'Our Promise',
        promiseText:
          "We built this refund policy because we believe our tutors and teaching speak for themselves. If they don't meet your expectations, you deserve your money back. Simple as that.",
      };

  useSEO({
    title: content.seoTitle,
    description: content.seoDescription,
  });

  return (
    <>
      <Header />
      <main>
        <Breadcrumbs
          items={[{ label: content.academy, to: '/academy' }, { label: content.breadcrumb }]}
        />
        <section className="legal-page">
          <div className="container legal-page__inner">

            {/* Hero guarantee badge */}
            <div className="refund-hero">
              <div className="refund-hero__shield">🛡️</div>
              <h1>{content.guarantee}</h1>
              <p className="refund-hero__sub">{content.hero}</p>
            </div>

            <p className="legal-page__meta">{content.lastUpdated}</p>

            <h2>{content.howItWorks}</h2>
            <ol>
              <li>
                <strong>{content.purchase}</strong>
                {content.purchaseText}
              </li>
              <li>
                <strong>{content.tryLessons}</strong>
                {content.tryLessonsText}
              </li>
              <li>
                <strong>{content.notSatisfied}</strong>
                {content.notSatisfiedText}
              </li>
              <li>
                <strong>{content.receiveRefund}</strong>
                {content.receiveRefundText}
              </li>
            </ol>

            <h2>{content.covered}</h2>
            <ul>
              {content.coveredItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>

            <h2>{content.notCovered}</h2>
            <ul>
              {content.notCoveredItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>

            <h2>{content.cancellation}</h2>
            <p>{content.cancellationText}</p>

            <h2>{content.request}</h2>
            <p>{content.requestText}</p>
            <div className="refund-contacts">
              <a href={`mailto:${site.email}`} className="refund-contact">
                <span className="refund-contact__icon">✉️</span>
                <div>
                  <strong>{content.email}</strong>
                  <span>{site.email}</span>
                </div>
              </a>
              <a
                href={`https://wa.me/${site.whatsapp}?text=Hi%2C%20I%20would%20like%20to%20request%20a%20refund`}
                target="_blank"
                rel="noopener noreferrer"
                className="refund-contact"
              >
                <span className="refund-contact__icon">💬</span>
                <div>
                  <strong>{content.whatsapp}</strong>
                  <span>{site.whatsappDisplay}</span>
                </div>
              </a>
            </div>
            <p>{content.response}</p>

            <h2>{content.promise}</h2>
            <p>{content.promiseText}</p>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

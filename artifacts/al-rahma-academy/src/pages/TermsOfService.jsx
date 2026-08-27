import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import Breadcrumbs from '../components/ui/Breadcrumbs';
import useSEO from '../hooks/useSEO';
import { useLang } from '../context/LangContext';
import { site } from '../data/site';

const LAST_UPDATED = '28 June 2026';

export default function TermsOfService() {
  const { lang } = useLang();
  const isArabic = lang === 'ar';
  const updatedDate = isArabic ? '٢٨ يونيو ٢٠٢٦' : LAST_UPDATED;

  useSEO({
    title: isArabic ? 'شروط الخدمة' : 'Terms of Service',
    description: isArabic
      ? 'الشروط والأحكام التي تحكم استخدامك لخدمات أكاديمية الرحمة التعليمية عبر الإنترنت للقرآن الكريم والدراسات الإسلامية.'
      : 'Terms and conditions governing your use of Al-Rahma Academy\'s online Quran and Islamic education services.',
    noindex: false,
  });

  return (
    <>
      <Header />
      <main>
        <Breadcrumbs items={[{ label: isArabic ? 'الأكاديمية' : 'Academy', to: '/academy' }, { label: isArabic ? 'شروط الخدمة' : 'Terms of Service' }]} />
        <section className="legal-page">
          <div className="container legal-page__inner">
            <h1>{isArabic ? 'شروط الخدمة' : 'Terms of Service'}</h1>
            <p className="legal-page__meta">{isArabic ? 'آخر تحديث:' : 'Last updated:'} {updatedDate}</p>

            <p>
              {isArabic
                ? 'تحكم شروط الخدمة هذه ("الشروط") وصولك إلى منصة أكاديمية الرحمة التعليمية عبر الإنترنت واستخدامك لها، بما في ذلك جميع الدروس والدورات والأدوات والخدمات ذات الصلة (ويشار إليها مجتمعةً باسم "الخدمات"). بتسجيلك أو استخدامك للخدمات، فإنك توافق على الالتزام بهذه الشروط.'
                : 'These Terms of Service ("Terms") govern your access to and use of Al-Rahma Academy\'s online education platform, including all lessons, courses, tools, and related services (collectively, the "Services"). By registering or using the Services, you agree to be bound by these Terms.'}
            </p>

            <h2>{isArabic ? '١. الخدمات' : '1. Services'}</h2>
            <p>
              {isArabic
                ? 'تقدم أكاديمية الرحمة دروسًا فردية عبر الإنترنت في القرآن الكريم واللغة العربية والدراسات الإسلامية، تُقدَّم مباشرةً عبر مكالمات الفيديو (Zoom أو Skype). ويحمل جميع المدرسين مؤهلات موثقة من جامعة الأزهر وإجازة بسند متصل.'
                : 'Al-Rahma Academy provides one-to-one online Quran, Arabic, and Islamic Studies lessons delivered live via video call (Zoom or Skype). All tutors hold verified Al-Azhar University qualifications and an Ijazah with a continuous chain of transmission (sanad).'}
            </p>

            <h2>{isArabic ? '٢. الاشتراكات والدفع' : '2. Subscriptions & Payment'}</h2>
            <ul>
              <li>{isArabic ? 'تُحتسب الاشتراكات شهريًا عن كل طالب مسجل.' : 'Subscriptions are billed monthly per student enrolled.'}</li>
              <li>{isArabic ? 'تُعالَج المدفوعات بأمان عبر Stripe (البطاقة) أو PayPal.' : 'Payment is processed securely via Stripe (card) or PayPal.'}</li>
              <li>{isArabic ? 'تُعرض الأسعار باليورو (€) وتشمل أي ضريبة قيمة مضافة واجبة التطبيق.' : 'Prices are displayed in Euros (€) and are inclusive of any applicable VAT.'}</li>
              <li>{isArabic ? 'يتجدد اشتراكك تلقائيًا كل شهر ما لم يُلغَ قبل موعد التجديد بما لا يقل عن ٢٤ ساعة.' : 'Your subscription renews automatically each month unless cancelled at least 24 hours before the renewal date.'}</li>
              <li>{isArabic ? 'تسري الأسعار الترويجية المخفضة فقط خلال الفترة المذكورة وقت الشراء.' : 'Discounted promotional prices apply only to the period stated at the time of purchase.'}</li>
            </ul>

            <h2>{isArabic ? '٣. ضمان استرداد الأموال خلال ١٤ يومًا' : '3. 14-Day Money-Back Guarantee'}</h2>
            <p>
              {isArabic ? 'إذا لم تكن راضيًا عن فترة اشتراكك الأولى لأي سبب، فيمكنك طلب استرداد كامل المبلغ خلال ' : 'If you are not satisfied with your first subscription period for any reason, you may request a full refund within '}
              <strong>{isArabic ? '١٤ يومًا تقويميًا' : '14 calendar days'}</strong>
              {isArabic ? ' من دفعتك الأولى. لطلب استرداد المبلغ، تواصل معنا عبر ' : ' of your initial payment. To request a refund, contact us at '}
              <a href={`mailto:${site.email}`}>{site.email}</a>{isArabic ? ' أو عبر واتساب على ' : ' or via WhatsApp at '}
              <a href={`https://wa.me/${site.whatsapp}`}>{site.whatsappDisplay}</a>.
              {isArabic ? ' وتُعالَج عمليات الاسترداد خلال ٥–١٠ أيام عمل وتُعاد إلى وسيلة الدفع الأصلية.' : ' Refunds are processed within 5–10 business days to your original payment method.'}
            </p>
            <p>
              {isArabic ? 'يسري ضمان استرداد الأموال على فترة الاشتراك ' : 'The money-back guarantee applies to the '}
              <em>{isArabic ? 'الأولى' : 'first'}</em>
              {isArabic ? ' فقط. ويمكن إلغاء التجديدات اللاحقة مقابل رصيد تناسبي وفقًا لتقديرنا.' : ' subscription period only. Subsequent renewals may be cancelled for a pro-rated credit at our discretion.'}
            </p>

            <h2>{isArabic ? '٤. الإلغاء' : '4. Cancellation'}</h2>
            <p>
              {isArabic
                ? 'يمكنك إلغاء اشتراكك في أي وقت من صفحة الفوترة الخاصة بك أو بالتواصل مع الدعم. يسري الإلغاء في نهاية فترة الفوترة الحالية؛ وتحتفظ بإمكانية الوصول إلى الدروس المجدولة حتى ذلك الحين. لا تُصدر عمليات استرداد جزئية للأيام غير المستخدمة بعد مهلة الضمان البالغة ١٤ يومًا.'
                : 'You may cancel your subscription at any time from your Billing page or by contacting support. Cancellation takes effect at the end of the current billing period; you retain access to scheduled lessons until then. No partial refunds are issued for unused days beyond the 14-day guarantee window.'}
            </p>

            <h2>{isArabic ? '٥. التجربة المجانية' : '5. Free Trial'}</h2>
            <p>
              {isArabic
                ? 'يحصل الطلاب الجدد على درسين تجريبيين مجانيين دون الحاجة إلى دفع. تتاح التجربة المجانية مرة واحدة لكل طالب. بعد التجربة، يمكنك اختيار أي خطة اشتراك أو عدم الاستمرار — ولا يوجد أي التزام.'
                : 'New students receive two complimentary trial lessons with no payment required. The free trial is available once per student. After the trial, you may choose any subscription plan or opt not to continue — there is no obligation.'}
            </p>

            <h2>{isArabic ? '٦. جدولة الدروس وإعادة جدولتها' : '6. Lesson Scheduling & Rescheduling'}</h2>
            <ul>
              <li>{isArabic ? 'يجب إعادة جدولة الدروس قبل موعدها بما لا يقل عن ' : 'Lessons must be rescheduled at least '}<strong>{isArabic ? '٢٤ ساعة مسبقًا' : '24 hours in advance'}</strong>.</li>
              <li>{isArabic ? 'تُعد الدروس الملغاة خلال ٢٤ ساعة مُفوَّتة ما لم يكن الإلغاء بسبب حالة طارئة.' : 'Lessons cancelled within 24 hours are forfeited unless due to an emergency.'}</li>
              <li>{isArabic ? 'يجوز للمدرسين إعادة الجدولة بإشعار قبل ٢٤ ساعة؛ وتؤهلك إعادة الجدولة المتكررة لتغيير المدرس دون تكلفة.' : 'Tutors may reschedule with 24-hour notice; persistent rescheduling qualifies you for a tutor change at no cost.'}</li>
            </ul>

            <h2>{isArabic ? '٧. مواءمة المدرسين وتغييرهم' : '7. Tutor Matching & Changes'}</h2>
            <p>
              {isArabic
                ? 'نوفّق بين كل طالب ومدرس مناسب بناءً على أهدافه ولغته وجدوله. إذا لم تكن راضيًا عن المدرس المعيّن لك لأي سبب، فيمكنك طلب تغييره دون تكلفة — ما عليك سوى التواصل مع الدعم عبر البريد الإلكتروني أو واتساب. نهدف إلى إتمام جميع تغييرات المدرسين خلال ٤٨ ساعة.'
                : 'We match each student with a suitable tutor based on their goals, language, and schedule. If you are unhappy with your assigned tutor for any reason, you may request a change at no cost — simply contact support via email or WhatsApp. We aim to complete all tutor changes within 48 hours.'}
            </p>

            <h2>{isArabic ? '٨. السلوك والسلامة' : '8. Conduct & Safety'}</h2>
            <p>
              {isArabic
                ? 'تُعقد جميع الدروس في بيئة محترمة ومهنية. يتطلب تسجيل الدروس من قبل الطلاب أو أولياء الأمور موافقة خطية مسبقة من المدرس. وتتطلب الدروس التي تشمل أطفالًا دون سن ١٣ عامًا حضور أحد الوالدين أو الوصي أو إمكانية الوصول إليه فورًا أثناء الجلسة.'
                : 'All lessons are conducted in a respectful, professional environment. Recording of lessons by students or parents requires prior written consent from the tutor. Lessons involving children under 13 require a parent or guardian to be present or immediately accessible during the session.'}
            </p>

            <h2>{isArabic ? '٩. الملكية الفكرية' : '9. Intellectual Property'}</h2>
            <p>
              {isArabic
                ? 'تظل جميع مواد الدورات والتسجيلات (حيثما تُوفَّر) والمحتوى الذي أنشأته أكاديمية الرحمة ملكيتنا الفكرية. لا يجوز لك نسخ موادنا أو توزيعها أو إعادة بيعها دون إذن خطي مسبق.'
                : 'All course materials, recordings (where provided), and content created by Al-Rahma Academy remain our intellectual property. You may not reproduce, distribute, or resell our materials without prior written permission.'}
            </p>

            <h2>{isArabic ? '١٠. حماية البيانات (GDPR)' : '10. Data Protection (GDPR)'}</h2>
            <p>
              {isArabic ? 'نعالج بياناتك الشخصية وفقًا للائحة العامة لحماية البيانات في الاتحاد الأوروبي (GDPR). ولا نبيع بياناتك مطلقًا لأطراف ثالثة. للاطلاع على التفاصيل كاملةً، راجع ' : 'We process your personal data in accordance with the EU General Data Protection Regulation (GDPR). We never sell your data to third parties. For full details, see our '}
              <a href="/academy/privacy">{isArabic ? 'سياسة الخصوصية' : 'Privacy Policy'}</a>.
            </p>

            <h2>{isArabic ? '١١. تحديد المسؤولية' : '11. Limitation of Liability'}</h2>
            <p>
              {isArabic
                ? 'لا تتجاوز المسؤولية الإجمالية لأكاديمية الرحمة تجاهك عن أي مطالبة ناشئة عن هذه الشروط المبلغ الذي دفعته لنا خلال الثلاثين يومًا السابقة للمطالبة. ولا نتحمل المسؤولية عن الأضرار غير المباشرة أو العرضية أو التبعية.'
                : 'Al-Rahma Academy\'s total liability to you for any claim arising from these Terms shall not exceed the amount you paid us in the 30 days preceding the claim. We are not liable for indirect, incidental, or consequential damages.'}
            </p>

            <h2>{isArabic ? '١٢. القانون الحاكم' : '12. Governing Law'}</h2>
            <p>
              {isArabic
                ? 'تخضع هذه الشروط لقوانين جمهورية مصر العربية. ويُعرض أي نزاع على المحاكم المختصة في القاهرة، مصر، دون إخلال بأي حقوق إلزامية لحماية المستهلك قد تتمتع بها بموجب قانون الاتحاد الأوروبي.'
                : 'These Terms are governed by the laws of the Arab Republic of Egypt. Any disputes shall be submitted to the competent courts of Cairo, Egypt, without prejudice to any mandatory consumer protection rights you may have under EU law.'}
            </p>

            <h2>{isArabic ? '١٣. التواصل' : '13. Contact'}</h2>
            <p>
              {isArabic ? 'لأي استفسارات بشأن هذه الشروط، يُرجى التواصل معنا:' : 'For any questions about these Terms, please contact us:'}
            </p>
            <ul>
              <li>{isArabic ? 'البريد الإلكتروني:' : 'Email:'} <a href={`mailto:${site.email}`}>{site.email}</a></li>
              <li>{isArabic ? 'واتساب:' : 'WhatsApp:'} <a href={`https://wa.me/${site.whatsapp}`}>{site.whatsappDisplay}</a></li>
              <li>{isArabic ? 'وقت الاستجابة: خلال ساعتين في أيام العمل (السبت–الخميس، ٠٨:٠٠–٢٣:٠٠ بتوقيت القاهرة)' : 'Response time: within 2 hours during business days (Sat–Thu, 08:00–23:00 Cairo time)'}</li>
            </ul>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import Breadcrumbs from '../components/ui/Breadcrumbs';
import useSEO from '../hooks/useSEO';
import { useLang } from '../context/LangContext';
import { site } from '../data/site';

export default function RefundPolicy() {
  const { lang } = useLang();
  const policies = {
    ar: {
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
    },
    en: {
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
    },
    it: {
      seoTitle: 'Politica di rimborso', seoDescription: 'Garanzia di rimborso di 14 giorni. Se non sei soddisfatto di Al-Rahma Academy, rimborsiamo il 100%, senza domande.',
      academy: 'Accademia', breadcrumb: 'Politica di rimborso', guarantee: 'Garanzia di rimborso di 14 giorni', hero: 'Siamo sicuri della qualità dei nostri tutor e del nostro insegnamento. Se non sei completamente soddisfatto entro 14 giorni, ti rimborseremo ogni centesimo, senza domande e senza moduli da compilare.', lastUpdated: 'Ultimo aggiornamento: 28 giugno 2026',
      howItWorks: 'Come funziona la garanzia', purchase: 'Acquista un qualsiasi piano di abbonamento.', purchaseText: ' Il periodo di 14 giorni inizia alla data del primo pagamento.', tryLessons: 'Prova le lezioni.', tryLessonsText: ' Partecipa alle sessioni, conosci il tuo tutor, prova pienamente la piattaforma.', notSatisfied: 'Non sei soddisfatto?', notSatisfiedText: ' Contattaci entro 14 giorni via e-mail o WhatsApp. Dicci cosa è successo, oppure no. In ogni caso, ti rimborseremo.', receiveRefund: 'Ricevi il rimborso', receiveRefundText: ' entro 5–10 giorni lavorativi sul metodo di pagamento originale (carta o PayPal).',
      covered: 'Cosa è coperto', coveredItems: ['✅ Tutti i piani di abbonamento (Starter, Standard, Premium)', '✅ Solo il primo periodo di fatturazione', '✅ Nessun numero minimo di lezioni richiesto', '✅ Nessuna detrazione per le lezioni già frequentate', '✅ Rimborso completo del 100% — nessun rimborso parziale né “credito del negozio”'], notCovered: 'Cosa non è coperto', notCoveredItems: ['❌ Richieste di rimborso effettuate dopo 14 giorni dal pagamento iniziale', '❌ Rinnovi mensili successivi (è garantito solo il primo pagamento)', '❌ Lezioni di prova gratuite (gratis = nessun pagamento = nessun rimborso applicabile)'],
      cancellation: 'Cancellazione senza rimborso', cancellationText: 'Dopo il periodo di 14 giorni, puoi annullare l’abbonamento in qualsiasi momento dalla pagina Fatturazione. La cancellazione interrompe i rinnovi futuri, ma non genera un rimborso per il periodo corrente. Mantieni l’accesso alle lezioni programmate fino alla fine del periodo pagato.', request: 'Come richiedere un rimborso', requestText: 'Contattaci con uno dei seguenti metodi: non è necessario alcun modulo:', email: 'E-mail', whatsapp: 'WhatsApp', response: 'Di norma rispondiamo entro 2 ore (sab–gio, 08:00–23:00, ora del Cairo). I rimborsi vengono confermati per iscritto ed elaborati entro 5–10 giorni lavorativi.', promise: 'La nostra promessa', promiseText: 'Abbiamo creato questa politica di rimborso perché crediamo che i nostri tutor e il nostro insegnamento parlino da sé. Se non soddisfano le tue aspettative, meriti di riavere i tuoi soldi. Semplice così.',
    },
    es: {
      seoTitle: 'Política de reembolso', seoDescription: 'Garantía de devolución de dinero de 14 días. Si no estás satisfecho con Al-Rahma Academy, reembolsamos el 100 %, sin preguntas.', academy: 'Academia', breadcrumb: 'Política de reembolso', guarantee: 'Garantía de devolución de dinero de 14 días', hero: 'Confiamos en la calidad de nuestros tutores y nuestra enseñanza. Si no estás completamente satisfecho en un plazo de 14 días, te devolveremos hasta el último céntimo, sin preguntas y sin formularios que rellenar.', lastUpdated: 'Última actualización: 28 de junio de 2026',
      howItWorks: 'Cómo funciona la garantía', purchase: 'Compra cualquier plan de suscripción.', purchaseText: ' Tu plazo de 14 días comienza en la fecha de tu primer pago.', tryLessons: 'Prueba las clases.', tryLessonsText: ' Asiste a sesiones, conoce a tu tutor y experimenta plenamente la plataforma.', notSatisfied: '¿No estás satisfecho?', notSatisfiedText: ' Contáctanos dentro de los 14 días por correo electrónico o WhatsApp. Cuéntanos qué ocurrió, o no. De cualquier manera, te reembolsaremos.', receiveRefund: 'Recibe tu reembolso', receiveRefundText: ' en un plazo de 5–10 días laborables en tu método de pago original (tarjeta o PayPal).',
      covered: 'Qué está cubierto', coveredItems: ['✅ Todos los planes de suscripción (Starter, Standard, Premium)', '✅ Solo el primer período de facturación', '✅ No se exige un número mínimo de clases', '✅ No hay deducciones por las clases ya asistidas', '✅ Reembolso completo del 100 % — sin reembolsos parciales ni “crédito de tienda”'], notCovered: 'Qué no está cubierto', notCoveredItems: ['❌ Solicitudes de reembolso realizadas después de 14 días desde el pago inicial', '❌ Renovaciones mensuales posteriores (solo se garantiza el primer pago)', '❌ Clases de prueba gratuitas (gratis = sin pago = no se aplica reembolso)'],
      cancellation: 'Cancelación sin reembolso', cancellationText: 'Después del plazo de 14 días, puedes cancelar tu suscripción en cualquier momento desde tu página de Facturación. La cancelación detiene las renovaciones futuras, pero no emite un reembolso por el período actual. Conservas el acceso a tus clases programadas hasta el final del período pagado.', request: 'Cómo solicitar un reembolso', requestText: 'Contáctanos por cualquiera de los siguientes medios; no se necesita formulario:', email: 'Correo electrónico', whatsapp: 'WhatsApp', response: 'Normalmente respondemos en un plazo de 2 horas (sáb–jue, 08:00–23:00, hora de El Cairo). Los reembolsos se confirman por escrito y se procesan en 5–10 días laborables.', promise: 'Nuestra promesa', promiseText: 'Creamos esta política de reembolso porque creemos que nuestros tutores y nuestra enseñanza hablan por sí mismos. Si no cumplen tus expectativas, mereces recuperar tu dinero. Así de simple.',
    },
    de: {
      seoTitle: 'Rückerstattungsrichtlinie', seoDescription: '14-tägige Geld-zurück-Garantie. Wenn Sie mit der Al-Rahma Academy nicht zufrieden sind, erstatten wir 100 % – ohne Fragen.', academy: 'Akademie', breadcrumb: 'Rückerstattungsrichtlinie', guarantee: '14-tägige Geld-zurück-Garantie', hero: 'Wir sind von der Qualität unserer Lehrkräfte und unseres Unterrichts überzeugt. Wenn Sie innerhalb von 14 Tagen nicht vollständig zufrieden sind, erstatten wir Ihnen jeden Cent – ohne Fragen und ohne Formulare.', lastUpdated: 'Zuletzt aktualisiert: 28. Juni 2026',
      howItWorks: 'So funktioniert die Garantie', purchase: 'Erwerben Sie einen beliebigen Abonnementplan.', purchaseText: ' Ihr 14-Tage-Zeitraum beginnt am Tag Ihrer ersten Zahlung.', tryLessons: 'Testen Sie die Unterrichtsstunden.', tryLessonsText: ' Nehmen Sie an Sitzungen teil, lernen Sie Ihre Lehrkraft kennen und erleben Sie die Plattform vollständig.', notSatisfied: 'Nicht zufrieden?', notSatisfiedText: ' Kontaktieren Sie uns innerhalb von 14 Tagen per E-Mail oder WhatsApp. Schildern Sie uns, was passiert ist – oder auch nicht. In jedem Fall erstatten wir Ihnen den Betrag.', receiveRefund: 'Erhalten Sie Ihre Rückerstattung', receiveRefundText: ' innerhalb von 5–10 Werktagen auf Ihre ursprüngliche Zahlungsmethode (Karte oder PayPal).',
      covered: 'Was abgedeckt ist', coveredItems: ['✅ Alle Abonnementpläne (Starter, Standard, Premium)', '✅ Nur der erste Abrechnungszeitraum', '✅ Keine Mindestanzahl an Unterrichtsstunden erforderlich', '✅ Keine Abzüge für bereits besuchte Unterrichtsstunden', '✅ Vollständige Rückerstattung von 100 % – keine Teilrückerstattungen, kein „Guthaben“'], notCovered: 'Was nicht abgedeckt ist', notCoveredItems: ['❌ Erstattungsanfragen nach 14 Tagen ab der ersten Zahlung', '❌ Spätere monatliche Verlängerungen (nur die erste Zahlung ist garantiert)', '❌ Kostenlose Probestunden (kostenlos = keine Zahlung = keine Rückerstattung)'],
      cancellation: 'Kündigung ohne Rückerstattung', cancellationText: 'Nach Ablauf des 14-Tage-Zeitraums können Sie Ihr Abonnement jederzeit auf Ihrer Abrechnungsseite kündigen. Die Kündigung stoppt zukünftige Verlängerungen, führt jedoch nicht zu einer Rückerstattung für den laufenden Zeitraum. Sie behalten bis zum Ende des bezahlten Zeitraums Zugriff auf Ihre geplanten Unterrichtsstunden.', request: 'So beantragen Sie eine Rückerstattung', requestText: 'Kontaktieren Sie uns auf einem der folgenden Wege – ein Formular ist nicht erforderlich:', email: 'E-Mail', whatsapp: 'WhatsApp', response: 'Wir antworten in der Regel innerhalb von 2 Stunden (Sa–Do, 08:00–23:00 Uhr Kairoer Zeit). Rückerstattungen werden schriftlich bestätigt und innerhalb von 5–10 Werktagen bearbeitet.', promise: 'Unser Versprechen', promiseText: 'Wir haben diese Rückerstattungsrichtlinie erstellt, weil wir überzeugt sind, dass unsere Lehrkräfte und unser Unterricht für sich sprechen. Wenn sie Ihre Erwartungen nicht erfüllen, verdienen Sie Ihr Geld zurück. So einfach ist das.',
    },
    fr: {
      seoTitle: 'Politique de remboursement', seoDescription: 'Garantie satisfait ou remboursé de 14 jours. Si vous n’êtes pas satisfait d’Al-Rahma Academy, nous remboursons 100 % — sans poser de questions.', academy: 'Académie', breadcrumb: 'Politique de remboursement', guarantee: 'Garantie satisfait ou remboursé de 14 jours', hero: 'Nous avons confiance dans la qualité de nos tuteurs et de notre enseignement. Si vous n’êtes pas entièrement satisfait dans les 14 jours, nous vous rembourserons chaque centime — sans poser de questions ni formulaire à remplir.', lastUpdated: 'Dernière mise à jour : 28 juin 2026',
      howItWorks: 'Comment fonctionne la garantie', purchase: 'Achetez n’importe quel abonnement.', purchaseText: ' Votre délai de 14 jours commence à la date de votre premier paiement.', tryLessons: 'Essayez les leçons.', tryLessonsText: ' Participez aux séances, rencontrez votre tuteur et découvrez pleinement la plateforme.', notSatisfied: 'Pas satisfait ?', notSatisfiedText: ' Contactez-nous dans les 14 jours par e-mail ou WhatsApp. Dites-nous ce qui s’est passé — ou non. Dans tous les cas, nous vous rembourserons.', receiveRefund: 'Recevez votre remboursement', receiveRefundText: ' sous 5 à 10 jours ouvrés sur votre moyen de paiement d’origine (carte ou PayPal).',
      covered: 'Ce qui est couvert', coveredItems: ['✅ Tous les abonnements (Starter, Standard, Premium)', '✅ Premier cycle de facturation uniquement', '✅ Aucun nombre minimum de leçons n’est requis', '✅ Aucune déduction pour les leçons déjà suivies', '✅ Remboursement intégral de 100 % — aucun remboursement partiel ni « avoir »'], notCovered: 'Ce qui n’est pas couvert', notCoveredItems: ['❌ Demandes de remboursement faites plus de 14 jours après le paiement initial', '❌ Renouvellements mensuels ultérieurs (seul le premier paiement est garanti)', '❌ Leçons d’essai gratuites (gratuit = aucun paiement = aucun remboursement applicable)'],
      cancellation: 'Annulation sans remboursement', cancellationText: 'Après le délai de 14 jours, vous pouvez annuler votre abonnement à tout moment depuis votre page de facturation. L’annulation arrête les renouvellements futurs mais ne donne pas lieu à un remboursement pour la période en cours. Vous conservez l’accès à vos leçons programmées jusqu’à la fin de la période payée.', request: 'Comment demander un remboursement', requestText: 'Contactez-nous par l’un des moyens suivants — aucun formulaire n’est nécessaire :', email: 'E-mail', whatsapp: 'WhatsApp', response: 'Nous répondons généralement dans les 2 heures (sam.–jeu., 08:00–23:00, heure du Caire). Les remboursements sont confirmés par écrit et traités sous 5 à 10 jours ouvrés.', promise: 'Notre promesse', promiseText: 'Nous avons créé cette politique de remboursement parce que nous pensons que nos tuteurs et notre enseignement parlent d’eux-mêmes. S’ils ne répondent pas à vos attentes, vous méritez de récupérer votre argent. C’est aussi simple que cela.',
    },
  };
  const content = policies[lang] || policies.en;

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

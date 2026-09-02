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
          'يمكنك طلب استرداد المبلغ خلال 24 يومًا من الدفع. راجع سياسة الاسترداد لمعرفة كيفية عملها.',
        academy: 'الأكاديمية',
        breadcrumb: 'سياسة الاسترداد',
        guarantee: 'نافذة استرداد لمدة 24 يومًا',
        hero:
          'نريدك أن تكون راضيًا عن معلمك ودروسك. إذا لم تكن كذلك، يمكنك طلب استرداد المبلغ خلال 24 يومًا من دفعتك الأولى.',
        lastUpdated: 'آخر تحديث: 2 سبتمبر 2026',
        howItWorks: 'كيف تعمل السياسة',
        purchase: 'اشترِ أي خطة اشتراك.',
        purchaseText: ' تبدأ مهلة الـ24 يومًا في تاريخ دفعتك الأولى.',
        tryLessons: 'جرّب الدروس.',
        tryLessonsText: ' احضر الجلسات، وتعرّف إلى معلمك، واختبر المنصة بالكامل.',
        notSatisfied: 'لست راضيًا؟',
        notSatisfiedText:
          ' تواصل معنا خلال 24 يومًا عبر البريد الإلكتروني أو واتساب لطلب استرداد المبلغ.',
        receiveRefund: 'نراجع طلبك',
        receiveRefundText: ' تتم معالجة طلبات الاسترداد المعتمدة خلال 5–10 أيام عمل إلى وسيلة الدفع الأصلية (البطاقة أو PayPal).',
        covered: 'ما يشمله الاسترداد',
        coveredItems: [
          '✅ جميع خطط الاشتراك (نوراني، حُفّاظ، إجازة)',
          '✅ فترة الفوترة الأولى فقط',
          '✅ لا يشترط حضور حد أدنى من الدروس للتأهل',
          '✅ لا تُخصم قيمة الدروس التي تم حضورها بالفعل',
          '✅ يُصرف الاسترداد المعتمد إلى وسيلة الدفع الأصلية — لا يوجد «رصيد متجر»',
        ],
        notCovered: 'ما لا يشمله الاسترداد',
        notCoveredItems: [
          '❌ طلبات الاسترداد المقدمة بعد مرور 24 يومًا من الدفعة الأولى',
          '❌ التجديدات الشهرية اللاحقة (الدفعة الأولى فقط مؤهلة)',
          '❌ دروس التجربة المجانية (مجاني = لا توجد دفعة = لا ينطبق الاسترداد)',
        ],
        cancellation: 'الإلغاء دون استرداد',
        cancellationText:
          'بعد انتهاء مهلة الـ24 يومًا، يمكنك إلغاء اشتراكك في أي وقت من صفحة الفوترة الخاصة بك. يوقف الإلغاء التجديدات المستقبلية، لكنه لا يتيح استردادًا للفترة الحالية. ويظل بإمكانك الوصول إلى دروسك المجدولة حتى نهاية الفترة المدفوعة.',
        request: 'كيفية طلب استرداد',
        requestText: 'تواصل معنا عبر أيٍّ من الوسائل التالية — لا حاجة إلى نموذج:',
        email: 'البريد الإلكتروني',
        whatsapp: 'واتساب',
        response:
          'نرد عادةً خلال 24 ساعة. يتم تأكيد عمليات الاسترداد المعتمدة كتابيًا ومعالجتها خلال 5–10 أيام عمل.',
        promise: 'وعدنا',
        promiseText:
          'وضعنا سياسة الاسترداد هذه لأننا نؤمن بأن معلمينا وتعليمنا يتحدثان عن نفسيهما. إذا لم يلبّيا توقعاتك، فأنت تستحق أن تتمكن من طلب استعادة أموالك. بهذه البساطة.',
    },
    en: {
        seoTitle: 'Refund Policy',
        seoDescription:
          'You may request a refund within 24 days of payment. See our Refund Policy for how it works.',
        academy: 'Academy',
        breadcrumb: 'Refund Policy',
        guarantee: '24-Day Refund Window',
        hero:
          'We want you to be happy with your tutor and lessons. If you are not, you may request a refund within 24 days of your first payment.',
        lastUpdated: 'Last updated: 2 September 2026',
        howItWorks: 'How It Works',
        purchase: 'Purchase any subscription plan.',
        purchaseText: ' Your 24-day window begins on the date of your first payment.',
        tryLessons: 'Try the lessons.',
        tryLessonsText: ' Attend sessions, meet your tutor, experience the platform fully.',
        notSatisfied: 'Not satisfied?',
        notSatisfiedText:
          ' Contact us within 24 days by email or WhatsApp to request a refund.',
        receiveRefund: 'We review your request',
        receiveRefundText:
          ' Approved refunds are processed within 5–10 business days to your original payment method (card or PayPal).',
        covered: 'What Is Covered',
        coveredItems: [
          '✅ All subscription plans (Noorani, Huffaz, Ijazah)',
          '✅ First billing period only',
          '✅ No minimum number of lessons required to qualify',
          '✅ No deductions for lessons already attended',
          '✅ Approved refunds go to your original payment method — no "store credit"',
        ],
        notCovered: 'What Is Not Covered',
        notCoveredItems: [
          '❌ Refund requests made after 24 days from the initial payment',
          '❌ Subsequent monthly renewals (only the first payment is eligible)',
          '❌ Free trial lessons (free = no payment = no refund applicable)',
        ],
        cancellation: 'Cancellation Without Refund',
        cancellationText:
          'After the 24-day window, you may cancel your subscription at any time from your Billing page. Cancellation stops future renewals but does not issue a refund for the current period. You retain access to your scheduled lessons until the end of the paid period.',
        request: 'How to Request a Refund',
        requestText: 'Contact us through any of the following — no form needed:',
        email: 'Email',
        whatsapp: 'WhatsApp',
        response:
          'We typically respond within 24 hours. Approved refunds are confirmed in writing and processed within 5–10 business days.',
        promise: 'Our Promise',
        promiseText:
          "We built this refund policy because we believe our tutors and teaching speak for themselves. If they don't meet your expectations, you deserve to be able to request your money back. Simple as that.",
    },
    it: {
      seoTitle: 'Politica di rimborso', seoDescription: 'Puoi richiedere un rimborso entro 24 giorni dal pagamento. Consulta la nostra politica di rimborso per i dettagli.',
      academy: 'Accademia', breadcrumb: 'Politica di rimborso', guarantee: 'Finestra di rimborso di 24 giorni', hero: 'Vogliamo che tu sia soddisfatto del tuo tutor e delle tue lezioni. In caso contrario, puoi richiedere un rimborso entro 24 giorni dal tuo primo pagamento.', lastUpdated: 'Ultimo aggiornamento: 2 settembre 2026',
      howItWorks: 'Come funziona', purchase: 'Acquista un qualsiasi piano di abbonamento.', purchaseText: ' Il periodo di 24 giorni inizia alla data del primo pagamento.', tryLessons: 'Prova le lezioni.', tryLessonsText: ' Partecipa alle sessioni, conosci il tuo tutor, prova pienamente la piattaforma.', notSatisfied: 'Non sei soddisfatto?', notSatisfiedText: ' Contattaci entro 24 giorni via e-mail o WhatsApp per richiedere un rimborso.', receiveRefund: 'Esaminiamo la tua richiesta', receiveRefundText: ' I rimborsi approvati vengono elaborati entro 5–10 giorni lavorativi sul metodo di pagamento originale (carta o PayPal).',
      covered: 'Cosa è coperto', coveredItems: ['✅ Tutti i piani di abbonamento (Noorani, Huffaz, Ijazah)', '✅ Solo il primo periodo di fatturazione', '✅ Nessun numero minimo di lezioni richiesto', '✅ Nessuna detrazione per le lezioni già frequentate', '✅ I rimborsi approvati vengono accreditati sul metodo di pagamento originale — nessun “credito del negozio”'], notCovered: 'Cosa non è coperto', notCoveredItems: ['❌ Richieste di rimborso effettuate dopo 24 giorni dal pagamento iniziale', '❌ Rinnovi mensili successivi (solo il primo pagamento è idoneo)', '❌ Lezioni di prova gratuite (gratis = nessun pagamento = nessun rimborso applicabile)'],
      cancellation: 'Cancellazione senza rimborso', cancellationText: 'Dopo il periodo di 24 giorni, puoi annullare l’abbonamento in qualsiasi momento dalla pagina Fatturazione. La cancellazione interrompe i rinnovi futuri, ma non genera un rimborso per il periodo corrente. Mantieni l’accesso alle lezioni programmate fino alla fine del periodo pagato.', request: 'Come richiedere un rimborso', requestText: 'Contattaci con uno dei seguenti metodi: non è necessario alcun modulo:', email: 'E-mail', whatsapp: 'WhatsApp', response: 'Di norma rispondiamo entro 24 ore. I rimborsi approvati vengono confermati per iscritto ed elaborati entro 5–10 giorni lavorativi.', promise: 'La nostra promessa', promiseText: 'Abbiamo creato questa politica di rimborso perché crediamo che i nostri tutor e il nostro insegnamento parlino da sé. Se non soddisfano le tue aspettative, meriti di poter richiedere indietro i tuoi soldi. Semplice così.',
    },
    es: {
      seoTitle: 'Política de reembolso', seoDescription: 'Puedes solicitar un reembolso dentro de los 24 días posteriores al pago. Consulta nuestra política de reembolso para más detalles.', academy: 'Academia', breadcrumb: 'Política de reembolso', guarantee: 'Ventana de reembolso de 24 días', hero: 'Queremos que estés satisfecho con tu tutor y tus clases. Si no lo estás, puedes solicitar un reembolso dentro de los 24 días posteriores a tu primer pago.', lastUpdated: 'Última actualización: 2 de septiembre de 2026',
      howItWorks: 'Cómo funciona', purchase: 'Compra cualquier plan de suscripción.', purchaseText: ' Tu plazo de 24 días comienza en la fecha de tu primer pago.', tryLessons: 'Prueba las clases.', tryLessonsText: ' Asiste a sesiones, conoce a tu tutor y experimenta plenamente la plataforma.', notSatisfied: '¿No estás satisfecho?', notSatisfiedText: ' Contáctanos dentro de los 24 días por correo electrónico o WhatsApp para solicitar un reembolso.', receiveRefund: 'Revisamos tu solicitud', receiveRefundText: ' Los reembolsos aprobados se procesan en un plazo de 5–10 días laborables en tu método de pago original (tarjeta o PayPal).',
      covered: 'Qué está cubierto', coveredItems: ['✅ Todos los planes de suscripción (Noorani, Huffaz, Ijazah)', '✅ Solo el primer período de facturación', '✅ No se exige un número mínimo de clases', '✅ No hay deducciones por las clases ya asistidas', '✅ Los reembolsos aprobados se devuelven a tu método de pago original — sin “crédito de tienda”'], notCovered: 'Qué no está cubierto', notCoveredItems: ['❌ Solicitudes de reembolso realizadas después de 24 días desde el pago inicial', '❌ Renovaciones mensuales posteriores (solo el primer pago es elegible)', '❌ Clases de prueba gratuitas (gratis = sin pago = no se aplica reembolso)'],
      cancellation: 'Cancelación sin reembolso', cancellationText: 'Después del plazo de 24 días, puedes cancelar tu suscripción en cualquier momento desde tu página de Facturación. La cancelación detiene las renovaciones futuras, pero no emite un reembolso por el período actual. Conservas el acceso a tus clases programadas hasta el final del período pagado.', request: 'Cómo solicitar un reembolso', requestText: 'Contáctanos por cualquiera de los siguientes medios; no se necesita formulario:', email: 'Correo electrónico', whatsapp: 'WhatsApp', response: 'Normalmente respondemos en un plazo de 24 horas. Los reembolsos aprobados se confirman por escrito y se procesan en 5–10 días laborables.', promise: 'Nuestra promesa', promiseText: 'Creamos esta política de reembolso porque creemos que nuestros tutores y nuestra enseñanza hablan por sí mismos. Si no cumplen tus expectativas, mereces poder solicitar que te devuelvan tu dinero. Así de simple.',
    },
    de: {
      seoTitle: 'Rückerstattungsrichtlinie', seoDescription: 'Du kannst innerhalb von 24 Tagen nach der Zahlung eine Erstattung beantragen. Details findest du in unserer Rückerstattungsrichtlinie.', academy: 'Akademie', breadcrumb: 'Rückerstattungsrichtlinie', guarantee: '24-Tage-Erstattungsfenster', hero: 'Wir möchten, dass du mit deiner Lehrkraft und deinen Unterrichtsstunden zufrieden bist. Falls nicht, kannst du innerhalb von 24 Tagen nach deiner ersten Zahlung eine Erstattung beantragen.', lastUpdated: 'Zuletzt aktualisiert: 2. September 2026',
      howItWorks: 'So funktioniert es', purchase: 'Erwerben Sie einen beliebigen Abonnementplan.', purchaseText: ' Ihr 24-Tage-Zeitraum beginnt am Tag Ihrer ersten Zahlung.', tryLessons: 'Testen Sie die Unterrichtsstunden.', tryLessonsText: ' Nehmen Sie an Sitzungen teil, lernen Sie Ihre Lehrkraft kennen und erleben Sie die Plattform vollständig.', notSatisfied: 'Nicht zufrieden?', notSatisfiedText: ' Kontaktieren Sie uns innerhalb von 24 Tagen per E-Mail oder WhatsApp, um eine Erstattung zu beantragen.', receiveRefund: 'Wir prüfen deine Anfrage', receiveRefundText: ' Genehmigte Erstattungen werden innerhalb von 5–10 Werktagen auf Ihre ursprüngliche Zahlungsmethode (Karte oder PayPal) verarbeitet.',
      covered: 'Was abgedeckt ist', coveredItems: ['✅ Alle Abonnementpläne (Noorani, Huffaz, Ijazah)', '✅ Nur der erste Abrechnungszeitraum', '✅ Keine Mindestanzahl an Unterrichtsstunden erforderlich', '✅ Keine Abzüge für bereits besuchte Unterrichtsstunden', '✅ Genehmigte Erstattungen gehen an Ihre ursprüngliche Zahlungsmethode – kein „Guthaben“'], notCovered: 'Was nicht abgedeckt ist', notCoveredItems: ['❌ Erstattungsanfragen nach 24 Tagen ab der ersten Zahlung', '❌ Spätere monatliche Verlängerungen (nur die erste Zahlung ist erstattungsfähig)', '❌ Kostenlose Probestunden (kostenlos = keine Zahlung = keine Rückerstattung)'],
      cancellation: 'Kündigung ohne Rückerstattung', cancellationText: 'Nach Ablauf des 24-Tage-Zeitraums können Sie Ihr Abonnement jederzeit auf Ihrer Abrechnungsseite kündigen. Die Kündigung stoppt zukünftige Verlängerungen, führt jedoch nicht zu einer Rückerstattung für den laufenden Zeitraum. Sie behalten bis zum Ende des bezahlten Zeitraums Zugriff auf Ihre geplanten Unterrichtsstunden.', request: 'So beantragen Sie eine Rückerstattung', requestText: 'Kontaktieren Sie uns auf einem der folgenden Wege – ein Formular ist nicht erforderlich:', email: 'E-Mail', whatsapp: 'WhatsApp', response: 'Wir antworten in der Regel innerhalb von 24 Stunden. Genehmigte Erstattungen werden schriftlich bestätigt und innerhalb von 5–10 Werktagen bearbeitet.', promise: 'Unser Versprechen', promiseText: 'Wir haben diese Rückerstattungsrichtlinie erstellt, weil wir überzeugt sind, dass unsere Lehrkräfte und unser Unterricht für sich sprechen. Wenn sie Ihre Erwartungen nicht erfüllen, verdienen Sie es, Ihr Geld zurückfordern zu können. So einfach ist das.',
    },
    fr: {
      seoTitle: 'Politique de remboursement', seoDescription: 'Vous pouvez demander un remboursement dans les 24 jours suivant le paiement. Consultez notre politique de remboursement pour en savoir plus.', academy: 'Académie', breadcrumb: 'Politique de remboursement', guarantee: 'Fenêtre de remboursement de 24 jours', hero: 'Nous voulons que vous soyez satisfait de votre tuteur et de vos leçons. Si ce n’est pas le cas, vous pouvez demander un remboursement dans les 24 jours suivant votre premier paiement.', lastUpdated: 'Dernière mise à jour : 2 septembre 2026',
      howItWorks: 'Comment ça marche', purchase: 'Achetez n’importe quel abonnement.', purchaseText: ' Votre délai de 24 jours commence à la date de votre premier paiement.', tryLessons: 'Essayez les leçons.', tryLessonsText: ' Participez aux séances, rencontrez votre tuteur et découvrez pleinement la plateforme.', notSatisfied: 'Pas satisfait ?', notSatisfiedText: ' Contactez-nous dans les 24 jours par e-mail ou WhatsApp pour demander un remboursement.', receiveRefund: 'Nous examinons votre demande', receiveRefundText: ' Les remboursements approuvés sont traités sous 5 à 10 jours ouvrés sur votre moyen de paiement d’origine (carte ou PayPal).',
      covered: 'Ce qui est couvert', coveredItems: ['✅ Tous les abonnements (Noorani, Huffaz, Ijazah)', '✅ Premier cycle de facturation uniquement', '✅ Aucun nombre minimum de leçons n’est requis', '✅ Aucune déduction pour les leçons déjà suivies', '✅ Les remboursements approuvés sont reversés sur votre moyen de paiement d’origine — aucun « avoir »'], notCovered: 'Ce qui n’est pas couvert', notCoveredItems: ['❌ Demandes de remboursement faites plus de 24 jours après le paiement initial', '❌ Renouvellements mensuels ultérieurs (seul le premier paiement est éligible)', '❌ Leçons d’essai gratuites (gratuit = aucun paiement = aucun remboursement applicable)'],
      cancellation: 'Annulation sans remboursement', cancellationText: 'Après le délai de 24 jours, vous pouvez annuler votre abonnement à tout moment depuis votre page de facturation. L’annulation arrête les renouvellements futurs mais ne donne pas lieu à un remboursement pour la période en cours. Vous conservez l’accès à vos leçons programmées jusqu’à la fin de la période payée.', request: 'Comment demander un remboursement', requestText: 'Contactez-nous par l’un des moyens suivants — aucun formulaire n’est nécessaire :', email: 'E-mail', whatsapp: 'WhatsApp', response: 'Nous répondons généralement dans les 24 heures. Les remboursements approuvés sont confirmés par écrit et traités sous 5 à 10 jours ouvrés.', promise: 'Notre promesse', promiseText: 'Nous avons créé cette politique de remboursement parce que nous pensons que nos tuteurs et notre enseignement parlent d’eux-mêmes. S’ils ne répondent pas à vos attentes, vous méritez de pouvoir demander à récupérer votre argent. C’est aussi simple que cela.',
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

/**
 * HomeworkPage — assignments, submissions, grading, and feedback.
 * Teachers: create assignments, view submissions, grade, leave comments.
 * Students: view assignments, upload submissions, track deadlines.
 * Parents: view-only.
 */

import { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '../components/layout/DashboardLayout';
import PreviewBanner from '../components/ui/PreviewBanner';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import {
  FileText, Plus, Clock, Check, X, Upload, Download, MessageSquare,
  AlertCircle, ChevronDown, ChevronUp, Star, BookOpen, Filter,
  Paperclip, Send, Calendar,
} from 'lucide-react';

/* ── Status config ──────────────────────────────────────────────── */
const COPY = {
  en: {
    statuses: { all: 'All', pending: 'Pending', submitted: 'Submitted', graded: 'Graded', late: 'Late', overdue: 'Overdue' },
    subjects: { Quran: 'Quran', Arabic: 'Arabic', Tajweed: 'Tajweed', Hifz: 'Hifz', 'Islamic Studies': 'Islamic Studies' },
    types: { written: 'Written', memorization: 'Memorization', essay: 'Essay', quiz: 'Quiz', project: 'Project' },
    overdue: (days) => `${days}d overdue`, today: 'Due today', tomorrow: 'Due tomorrow', dueIn: (days) => `Due in ${days}d`,
    createDialog: 'Create assignment', newAssignment: 'New Assignment', close: 'Close', title: 'Title', titlePlaceholder: 'Assignment title', description: 'Description', descriptionPlaceholder: 'Instructions for students…', subject: 'Subject', type: 'Type', deadline: 'Deadline', points: 'Points', cancel: 'Cancel', assign: 'Assign',
    submitDialog: 'Submit homework', submit: 'Submit', notes: 'Notes (optional)', notesPlaceholder: 'Add any notes for your teacher…', attach: 'Click to attach a file',
    pointsShort: 'pts', submittedCount: (submitted, total) => `${submitted}/${total} submitted`, score: (grade, points) => `Score: ${grade}/${points}`, teacherFeedback: 'Teacher Feedback', submitWork: 'Submit Work', awaitingGrading: 'Submitted — awaiting grading', scoreLabel: (points) => `Score (/${points})`, feedback: 'Feedback', feedbackPlaceholder: 'Optional feedback…', grade: 'Grade', studentsSubmitted: (submitted, total) => `${submitted} / ${total} students submitted`,
    preview: 'Preview — assignments shown here are illustrative. Creating, submitting, and grading aren’t connected to a real backend yet, so nothing is actually saved.', actionError: 'That action wasn’t saved — this page is a preview.', dismiss: 'Dismiss',
    assignments: 'Assignments', homework: 'Homework', teacherSubtitle: 'Manage and grade student assignments', studentSubtitle: 'View and submit your homework', newAssignmentButton: 'New Assignment',
    total: 'Total', filterSubject: 'Filter by subject', allSubjects: 'All Subjects', noAssignments: 'No assignments found', changeFilter: 'Try changing the filter', createFirst: 'Create your first assignment above', caughtUp: 'You’re all caught up!',
  },
  ar: {
    statuses: { all: 'الكل', pending: 'قيد الانتظار', submitted: 'تم التسليم', graded: 'تم التقييم', late: 'متأخر', overdue: 'فات الموعد' },
    subjects: { Quran: 'القرآن', Arabic: 'العربية', Tajweed: 'التجويد', Hifz: 'الحفظ', 'Islamic Studies': 'الدراسات الإسلامية' },
    types: { written: 'كتابي', memorization: 'حفظ', essay: 'مقال', quiz: 'اختبار', project: 'مشروع' },
    overdue: (days) => `متأخر ${days} يوم`, today: 'موعده اليوم', tomorrow: 'موعده غدًا', dueIn: (days) => `موعده بعد ${days} يوم`,
    createDialog: 'إنشاء واجب', newAssignment: 'واجب جديد', close: 'إغلاق', title: 'العنوان', titlePlaceholder: 'عنوان الواجب', description: 'الوصف', descriptionPlaceholder: 'تعليمات للطلاب…', subject: 'المادة', type: 'النوع', deadline: 'الموعد النهائي', points: 'الدرجات', cancel: 'إلغاء', assign: 'تعيين',
    submitDialog: 'تسليم الواجب', submit: 'تسليم', notes: 'ملاحظات (اختياري)', notesPlaceholder: 'أضف أي ملاحظات لمعلمك…', attach: 'انقر لإرفاق ملف',
    pointsShort: 'درجة', submittedCount: (submitted, total) => `تم تسليم ${submitted}/${total}`, score: (grade, points) => `النتيجة: ${grade}/${points}`, teacherFeedback: 'ملاحظات المعلم', submitWork: 'تسليم العمل', awaitingGrading: 'تم التسليم — بانتظار التقييم', scoreLabel: (points) => `النتيجة (/${points})`, feedback: 'ملاحظات', feedbackPlaceholder: 'ملاحظات اختيارية…', grade: 'تقييم', studentsSubmitted: (submitted, total) => `سلّم ${submitted} من ${total} طالبًا`,
    preview: 'معاينة — الواجبات المعروضة هنا توضيحية. الإنشاء والتسليم والتقييم غير متصلة بخادم فعلي بعد، لذا لن يُحفظ شيء.', actionError: 'لم يتم حفظ هذا الإجراء — هذه الصفحة للمعاينة.', dismiss: 'إخفاء',
    assignments: 'الواجبات', homework: 'الواجب المنزلي', teacherSubtitle: 'إدارة واجبات الطلاب وتقييمها', studentSubtitle: 'عرض واجباتك وتسليمها', newAssignmentButton: 'واجب جديد',
    total: 'الإجمالي', filterSubject: 'تصفية حسب المادة', allSubjects: 'كل المواد', noAssignments: 'لم يتم العثور على واجبات', changeFilter: 'جرّب تغيير التصفية', createFirst: 'أنشئ واجبك الأول أعلاه', caughtUp: 'أنت منجز لكل واجباتك!',
  },
  it: {
    statuses: { all: 'Tutti', pending: 'In attesa', submitted: 'Consegnato', graded: 'Valutato', late: 'In ritardo', overdue: 'Scaduto' }, subjects: { Quran: 'Corano', Arabic: 'Arabo', Tajweed: 'Tajwid', Hifz: 'Memorizzazione', 'Islamic Studies': 'Studi islamici' }, types: { written: 'Scritto', memorization: 'Memorizzazione', essay: 'Tema', quiz: 'Quiz', project: 'Progetto' },
    overdue: (days) => `${days} g di ritardo`, today: 'Scade oggi', tomorrow: 'Scade domani', dueIn: (days) => `Scade tra ${days} g`,
    createDialog: 'Crea compito', newAssignment: 'Nuovo compito', close: 'Chiudi', title: 'Titolo', titlePlaceholder: 'Titolo del compito', description: 'Descrizione', descriptionPlaceholder: 'Istruzioni per gli studenti…', subject: 'Materia', type: 'Tipo', deadline: 'Scadenza', points: 'Punti', cancel: 'Annulla', assign: 'Assegna',
    submitDialog: 'Consegna compito', submit: 'Consegna', notes: 'Note (facoltative)', notesPlaceholder: 'Aggiungi note per il tuo insegnante…', attach: 'Fai clic per allegare un file',
    pointsShort: 'pt', submittedCount: (submitted, total) => `${submitted}/${total} consegnati`, score: (grade, points) => `Punteggio: ${grade}/${points}`, teacherFeedback: "Commento dell'insegnante", submitWork: 'Consegna lavoro', awaitingGrading: 'Consegnato — in attesa di valutazione', scoreLabel: (points) => `Punteggio (/${points})`, feedback: 'Commento', feedbackPlaceholder: 'Commento facoltativo…', grade: 'Valuta', studentsSubmitted: (submitted, total) => `${submitted} / ${total} studenti hanno consegnato`,
    preview: 'Anteprima — i compiti mostrati sono illustrativi. La creazione, consegna e valutazione non sono ancora collegate a un backend reale, quindi nulla viene salvato.', actionError: 'L’azione non è stata salvata — questa pagina è un’anteprima.', dismiss: 'Ignora',
    assignments: 'Compiti', homework: 'Compiti a casa', teacherSubtitle: 'Gestisci e valuta i compiti degli studenti', studentSubtitle: 'Visualizza e consegna i tuoi compiti', newAssignmentButton: 'Nuovo compito', total: 'Totale', filterSubject: 'Filtra per materia', allSubjects: 'Tutte le materie', noAssignments: 'Nessun compito trovato', changeFilter: 'Prova a modificare il filtro', createFirst: 'Crea il tuo primo compito qui sopra', caughtUp: 'Hai completato tutto!',
  },
  es: {
    statuses: { all: 'Todos', pending: 'Pendiente', submitted: 'Entregado', graded: 'Calificado', late: 'Tarde', overdue: 'Vencido' }, subjects: { Quran: 'Corán', Arabic: 'Árabe', Tajweed: 'Taywid', Hifz: 'Memorización', 'Islamic Studies': 'Estudios islámicos' }, types: { written: 'Escrito', memorization: 'Memorización', essay: 'Ensayo', quiz: 'Cuestionario', project: 'Proyecto' },
    overdue: (days) => `${days} d de retraso`, today: 'Vence hoy', tomorrow: 'Vence mañana', dueIn: (days) => `Vence en ${days} d`,
    createDialog: 'Crear tarea', newAssignment: 'Nueva tarea', close: 'Cerrar', title: 'Título', titlePlaceholder: 'Título de la tarea', description: 'Descripción', descriptionPlaceholder: 'Instrucciones para estudiantes…', subject: 'Materia', type: 'Tipo', deadline: 'Fecha límite', points: 'Puntos', cancel: 'Cancelar', assign: 'Asignar',
    submitDialog: 'Entregar tarea', submit: 'Entregar', notes: 'Notas (opcional)', notesPlaceholder: 'Añade notas para tu profesor…', attach: 'Haz clic para adjuntar un archivo',
    pointsShort: 'pts', submittedCount: (submitted, total) => `${submitted}/${total} entregadas`, score: (grade, points) => `Puntuación: ${grade}/${points}`, teacherFeedback: 'Comentarios del profesor', submitWork: 'Entregar trabajo', awaitingGrading: 'Entregado — pendiente de calificación', scoreLabel: (points) => `Puntuación (/${points})`, feedback: 'Comentarios', feedbackPlaceholder: 'Comentarios opcionales…', grade: 'Calificar', studentsSubmitted: (submitted, total) => `${submitted} / ${total} estudiantes entregaron`,
    preview: 'Vista previa: las tareas mostradas son ilustrativas. La creación, entrega y calificación aún no están conectadas a un backend real, por lo que no se guarda nada.', actionError: 'La acción no se guardó; esta página es una vista previa.', dismiss: 'Descartar',
    assignments: 'Tareas', homework: 'Deberes', teacherSubtitle: 'Gestiona y califica las tareas de los estudiantes', studentSubtitle: 'Consulta y entrega tus deberes', newAssignmentButton: 'Nueva tarea', total: 'Total', filterSubject: 'Filtrar por materia', allSubjects: 'Todas las materias', noAssignments: 'No se encontraron tareas', changeFilter: 'Intenta cambiar el filtro', createFirst: 'Crea tu primera tarea arriba', caughtUp: '¡Estás al día!',
  },
  de: {
    statuses: { all: 'Alle', pending: 'Ausstehend', submitted: 'Eingereicht', graded: 'Bewertet', late: 'Verspätet', overdue: 'Überfällig' }, subjects: { Quran: 'Koran', Arabic: 'Arabisch', Tajweed: 'Tadschwīd', Hifz: 'Auswendiglernen', 'Islamic Studies': 'Islamische Studien' }, types: { written: 'Schriftlich', memorization: 'Auswendiglernen', essay: 'Aufsatz', quiz: 'Quiz', project: 'Projekt' },
    overdue: (days) => `${days} T überfällig`, today: 'Heute fällig', tomorrow: 'Morgen fällig', dueIn: (days) => `Fällig in ${days} T`,
    createDialog: 'Aufgabe erstellen', newAssignment: 'Neue Aufgabe', close: 'Schließen', title: 'Titel', titlePlaceholder: 'Aufgabentitel', description: 'Beschreibung', descriptionPlaceholder: 'Anweisungen für Schüler…', subject: 'Fach', type: 'Art', deadline: 'Frist', points: 'Punkte', cancel: 'Abbrechen', assign: 'Zuweisen',
    submitDialog: 'Hausaufgabe einreichen', submit: 'Einreichen', notes: 'Notizen (optional)', notesPlaceholder: 'Notizen für deine Lehrkraft…', attach: 'Klicken, um eine Datei anzuhängen',
    pointsShort: 'Pkt.', submittedCount: (submitted, total) => `${submitted}/${total} eingereicht`, score: (grade, points) => `Punktzahl: ${grade}/${points}`, teacherFeedback: 'Feedback der Lehrkraft', submitWork: 'Arbeit einreichen', awaitingGrading: 'Eingereicht — wartet auf Bewertung', scoreLabel: (points) => `Punktzahl (/${points})`, feedback: 'Feedback', feedbackPlaceholder: 'Optionales Feedback…', grade: 'Bewerten', studentsSubmitted: (submitted, total) => `${submitted} / ${total} Schüler haben eingereicht`,
    preview: 'Vorschau — die gezeigten Aufgaben sind beispielhaft. Erstellen, Einreichen und Bewerten sind noch nicht mit einem echten Backend verbunden, daher wird nichts gespeichert.', actionError: 'Die Aktion wurde nicht gespeichert — diese Seite ist eine Vorschau.', dismiss: 'Schließen',
    assignments: 'Aufgaben', homework: 'Hausaufgaben', teacherSubtitle: 'Schüleraufgaben verwalten und bewerten', studentSubtitle: 'Hausaufgaben ansehen und einreichen', newAssignmentButton: 'Neue Aufgabe', total: 'Gesamt', filterSubject: 'Nach Fach filtern', allSubjects: 'Alle Fächer', noAssignments: 'Keine Aufgaben gefunden', changeFilter: 'Versuche, den Filter zu ändern', createFirst: 'Erstelle oben deine erste Aufgabe', caughtUp: 'Du bist auf dem Laufenden!',
  },
  fr: {
    statuses: { all: 'Tous', pending: 'En attente', submitted: 'Remis', graded: 'Noté', late: 'En retard', overdue: 'En retard' }, subjects: { Quran: 'Coran', Arabic: 'Arabe', Tajweed: 'Tajwid', Hifz: 'Mémorisation', 'Islamic Studies': 'Études islamiques' }, types: { written: 'Écrit', memorization: 'Mémorisation', essay: 'Dissertation', quiz: 'Quiz', project: 'Projet' },
    overdue: (days) => `${days} j de retard`, today: "À rendre aujourd’hui", tomorrow: 'À rendre demain', dueIn: (days) => `À rendre dans ${days} j`,
    createDialog: 'Créer un devoir', newAssignment: 'Nouveau devoir', close: 'Fermer', title: 'Titre', titlePlaceholder: 'Titre du devoir', description: 'Description', descriptionPlaceholder: 'Instructions pour les élèves…', subject: 'Matière', type: 'Type', deadline: 'Échéance', points: 'Points', cancel: 'Annuler', assign: 'Assigner',
    submitDialog: 'Remettre le devoir', submit: 'Remettre', notes: 'Notes (facultatif)', notesPlaceholder: 'Ajoutez des notes pour votre enseignant…', attach: 'Cliquez pour joindre un fichier',
    pointsShort: 'pts', submittedCount: (submitted, total) => `${submitted}/${total} remis`, score: (grade, points) => `Score : ${grade}/${points}`, teacherFeedback: "Commentaire de l’enseignant", submitWork: 'Remettre le travail', awaitingGrading: 'Remis — en attente de notation', scoreLabel: (points) => `Score (/${points})`, feedback: 'Commentaire', feedbackPlaceholder: 'Commentaire facultatif…', grade: 'Noter', studentsSubmitted: (submitted, total) => `${submitted} / ${total} élèves ont remis leur travail`,
    preview: 'Aperçu — les devoirs affichés sont fournis à titre indicatif. La création, la remise et la notation ne sont pas encore reliées à un véritable backend, donc rien n’est enregistré.', actionError: 'Cette action n’a pas été enregistrée — cette page est un aperçu.', dismiss: 'Ignorer',
    assignments: 'Devoirs', homework: 'Devoirs à la maison', teacherSubtitle: 'Gérez et notez les devoirs des élèves', studentSubtitle: 'Consultez et remettez vos devoirs', newAssignmentButton: 'Nouveau devoir', total: 'Total', filterSubject: 'Filtrer par matière', allSubjects: 'Toutes les matières', noAssignments: 'Aucun devoir trouvé', changeFilter: 'Essayez de modifier le filtre', createFirst: 'Créez votre premier devoir ci-dessus', caughtUp: 'Vous êtes à jour !',
  },
};

const LOCALES = { en: 'en-US', ar: 'ar-EG', it: 'it-IT', es: 'es-ES', de: 'de-DE', fr: 'fr-FR' };

const HW_STATUS = {
  pending:   { color: '#d97706', bg: '#fef3c7' },
  submitted: { color: '#2563eb', bg: '#dbeafe' },
  graded:    { color: '#16a34a', bg: '#dcfce7' },
  late:      { color: '#dc2626', bg: '#fee2e2' },
  overdue:   { color: '#dc2626', bg: '#fee2e2' },
};

function statusBadge(status, copy) {
  const s = HW_STATUS[status] || { color: 'var(--text-secondary)', bg: 'var(--bg-page)' };
  return (
    <span style={{ display: 'inline-block', background: s.bg, color: s.color, padding: '3px 9px', borderRadius: 99, fontSize: '0.72rem', fontWeight: 700, border: `1px solid ${s.color}33` }}>
       {copy.statuses[status] || status}
    </span>
  );
}

function deadlineColor(deadline) {
  const diff = (new Date(deadline) - Date.now()) / (1000 * 60 * 60 * 24);
  if (diff < 0)  return '#dc2626';
  if (diff < 1)  return '#dc2626';
  if (diff < 3)  return '#d97706';
  return 'var(--text-secondary)';
}

function formatDeadline(iso, copy, lang) {
  const d = new Date(iso);
  const diff = Math.ceil((d - Date.now()) / (1000 * 60 * 60 * 24));
  const abs = Math.abs(diff);
  const number = new Intl.NumberFormat(LOCALES[lang] || LOCALES.en).format(abs);
  const futureNumber = new Intl.NumberFormat(LOCALES[lang] || LOCALES.en).format(diff);
  if (diff < 0) return copy.overdue(number);
  if (diff === 0) return copy.today;
  if (diff === 1) return copy.tomorrow;
  return copy.dueIn(futureNumber);
}

/* ── API ────────────────────────────────────────────────────────── */
const DEMO_HOMEWORK = {
  ar: [
    ['سورة البقرة، الآيات 1–10', 'احفظ الآيات ورتلها بأحكام التجويد الصحيحة.', ''],
    ['تمرين تصريف الأفعال العربية', 'أكمل ورقة عمل تصريف الأفعال للفصول 3–5.', 'جهد رائع! ركّز على صيغة المثنى.'],
    ['مقال عن أحكام التجويد', 'اكتب مقالًا من 300 كلمة عن أحكام المد.', ''],
    ['تأمل في التاريخ الإسلامي', 'اكتب تأملًا شخصيًا عن الفترة الإسلامية المبكرة.', ''],
    ['مراجعة صفحة الحفظ 12', 'راجع الصفحة 12 وتدرّب على تلاوتها غيبًا.', ''],
  ],
  it: [
    ['Sura Al-Baqara, versetti 1–10', 'Memorizza e recita con il corretto tajwid.', ''],
    ['Esercizio di coniugazione dei verbi arabi', 'Completa il foglio di lavoro sulla coniugazione dei verbi per i capitoli 3–5.', 'Ottimo impegno! Lavora sulla forma duale.'],
    ['Tema sulle regole del tajwid', 'Scrivi un tema di 300 parole sulle regole del Madd.', ''],
    ['Riflessione sulla storia islamica', 'Scrivi una riflessione personale sul primo periodo islamico.', ''],
    ['Ripasso della pagina 12 di Hifz', 'Ripassa ed esercitati a recitare a memoria la pagina 12.', ''],
  ],
  es: [
    ['Sura Al-Báqara, versículos 1–10', 'Memoriza y recita con el taywid adecuado.', ''],
    ['Ejercicio de conjugación de verbos árabes', 'Completa la hoja de ejercicios de conjugación verbal de los capítulos 3–5.', '¡Gran esfuerzo! Trabaja en la forma dual.'],
    ['Ensayo sobre las reglas del taywid', 'Escribe un ensayo de 300 palabras sobre las reglas del Madd.', ''],
    ['Reflexión sobre la historia islámica', 'Escribe una reflexión personal sobre el período islámico temprano.', ''],
    ['Repaso de la página 12 de Hifz', 'Repasa y practica recitar de memoria la página 12.', ''],
  ],
  de: [
    ['Sure Al-Baqara, Verse 1–10', 'Lerne sie auswendig und rezitiere sie mit korrektem Tadschwīd.', ''],
    ['Übung zur Konjugation arabischer Verben', 'Bearbeite das Arbeitsblatt zur Verbkonjugation für die Kapitel 3–5.', 'Großartige Leistung! Arbeite an der Dualform.'],
    ['Aufsatz über die Tadschwīd-Regeln', 'Schreibe einen 300-Wörter-Aufsatz über die Regeln des Madd.', ''],
    ['Reflexion über die islamische Geschichte', 'Schreibe eine persönliche Reflexion über die frühe islamische Zeit.', ''],
    ['Wiederholung von Hifz Seite 12', 'Wiederhole Seite 12 und übe, sie auswendig zu rezitieren.', ''],
  ],
  fr: [
    ['Sourate Al-Baqara, versets 1 à 10', 'Mémorisez et récitez avec un tajwid correct.', ''],
    ['Exercice de conjugaison des verbes arabes', 'Complétez la fiche de conjugaison des verbes pour les chapitres 3 à 5.', 'Excellent effort ! Travaillez la forme du duel.'],
    ['Dissertation sur les règles du tajwid', 'Rédigez une dissertation de 300 mots sur les règles du Madd.', ''],
    ['Réflexion sur l’histoire islamique', 'Rédigez une réflexion personnelle sur la première période islamique.', ''],
    ['Révision de la page 12 de Hifz', 'Révisez et entraînez-vous à réciter la page 12 de mémoire.', ''],
  ],
};

function localizeDemoHomework(assignments, lang) {
  const translations = DEMO_HOMEWORK[lang];
  return translations
    ? assignments.map((assignment, index) => {
      const [title, description, feedback] = translations[index];
      return { ...assignment, title, description, feedback };
    })
    : assignments;
}

async function fetchHomework(role, lang) {
  try {
    const { default: http } = await import('../api/http');
    const res = await http.get(role === 'teacher' ? '/api/homework/assigned' : '/api/homework/mine');
    return res.data?.assignments ?? res.data ?? [];
  } catch {
    const now = Date.now();
    const DAY = 86400000;
    return localizeDemoHomework([
      { _id: 'hw1', title: 'Surah Al-Baqarah verses 1–10', subject: 'Quran', type: 'memorization', deadline: new Date(now + 2 * DAY).toISOString(), status: 'pending', points: 10, description: 'Memorize and recite with proper tajweed.', submissions: 3, totalStudents: 5, grade: null, feedback: '' },
      { _id: 'hw2', title: 'Arabic Verb Conjugation Exercise', subject: 'Arabic', type: 'written', deadline: new Date(now - 1 * DAY).toISOString(), status: 'graded', points: 20, description: 'Complete the verb conjugation worksheet for chapters 3–5.', submissions: 5, totalStudents: 5, grade: 17, feedback: 'Great effort! Work on the dual form.' },
      { _id: 'hw3', title: 'Tajweed Rules Essay', subject: 'Tajweed', type: 'written', deadline: new Date(now + 5 * DAY).toISOString(), status: 'submitted', points: 15, description: 'Write a 300-word essay on the rules of Madd.', submissions: 2, totalStudents: 5, grade: null, feedback: '' },
      { _id: 'hw4', title: 'Islamic History Reflection', subject: 'Islamic Studies', type: 'essay', deadline: new Date(now + 0.3 * DAY).toISOString(), status: 'pending', points: 25, description: 'Write a personal reflection on the early Islamic period.', submissions: 1, totalStudents: 5, grade: null, feedback: '' },
      { _id: 'hw5', title: 'Hifz Page 12 Review', subject: 'Hifz', type: 'memorization', deadline: new Date(now - 3 * DAY).toISOString(), status: 'late', points: 10, description: 'Review and be able to recite page 12 from memory.', submissions: 0, totalStudents: 5, grade: null, feedback: '' },
    ], lang);
  }
}

/* ── Create Assignment modal ────────────────────────────────────── */
function CreateModal({ onClose, onSave }) {
  const { lang } = useLang();
  const copy = COPY[lang] || COPY.en;
  const [form, setForm] = useState({
    title: '', subject: 'Quran', type: 'written', deadline: '',
    points: 10, description: '',
  });

  const fieldStyle = {
    width: '100%', padding: '8px 10px', border: '1px solid var(--border-default)',
    borderRadius: 8, background: 'var(--bg-page)', color: 'var(--text-primary)',
    fontSize: '0.85rem', fontFamily: 'var(--font-sans)', boxSizing: 'border-box',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} role="dialog" aria-modal="true" aria-label={copy.createDialog}>
      <div style={{ background: 'var(--bg-surface)', borderRadius: 14, padding: 24, width: '100%', maxWidth: 500, boxShadow: 'var(--shadow-xl)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontWeight: 800, fontSize: '1.1rem', color: 'var(--text-primary)' }}>{copy.newAssignment}</h2>
          <button onClick={onClose} aria-label={copy.close} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={18} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[
            { label: copy.title, key: 'title', type: 'text', placeholder: copy.titlePlaceholder },
            { label: copy.description, key: 'description', type: 'textarea', placeholder: copy.descriptionPlaceholder },
          ].map(({ label, key, type, placeholder }) => (
            <div key={key}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</label>
              {type === 'textarea' ? (
                <textarea
                  rows={3}
                  value={form[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  style={{ ...fieldStyle, resize: 'vertical' }}
                />
              ) : (
                <input
                  type={type}
                  value={form[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  style={fieldStyle}
                />
              )}
            </div>
          ))}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
               <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>{copy.subject}</label>
              <select value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} style={fieldStyle}>
                {['Quran','Arabic','Tajweed','Hifz','Islamic Studies'].map(s => <option key={s} value={s}>{copy.subjects[s]}</option>)}
              </select>
            </div>
            <div>
               <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>{copy.type}</label>
              <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} style={fieldStyle}>
                {['written','memorization','essay','quiz','project'].map(t => <option key={t} value={t}>{copy.types[t]}</option>)}
              </select>
            </div>
            <div>
               <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>{copy.deadline}</label>
              <input type="datetime-local" value={form.deadline} onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))} style={fieldStyle} />
            </div>
            <div>
               <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>{copy.points}</label>
              <input type="number" min={1} max={100} value={form.points} onChange={(e) => setForm((f) => ({ ...f, points: Number(e.target.value) }))} style={fieldStyle} />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
           <button onClick={onClose} style={{ flex: 1, padding: '9px', border: '1px solid var(--border-default)', borderRadius: 8, background: 'var(--bg-surface)', color: 'var(--text-primary)', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>{copy.cancel}</button>
           <button onClick={() => { onSave(form); onClose(); }} disabled={!form.title || !form.deadline} style={{ flex: 1, padding: '9px', border: 'none', borderRadius: 8, background: 'var(--color-primary)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-sans)', opacity: !form.title || !form.deadline ? 0.5 : 1 }}>{copy.assign}</button>
        </div>
      </div>
    </div>
  );
}

/* ── Submit homework modal (student) ────────────────────────────── */
function SubmitModal({ hw, onClose, onSubmit }) {
  const { lang } = useLang();
  const copy = COPY[lang] || COPY.en;
  const [notes, setNotes] = useState('');
  const fileRef = useRef();
  const [file, setFile] = useState(null);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} role="dialog" aria-modal="true" aria-label={copy.submitDialog}>
      <div style={{ background: 'var(--bg-surface)', borderRadius: 14, padding: 24, width: '100%', maxWidth: 440, boxShadow: 'var(--shadow-xl)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-primary)' }}>{copy.submit}: {hw.title}</h2>
          <button onClick={onClose} aria-label={copy.close} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={18} /></button>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>{copy.notes}</label>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={copy.notesPlaceholder}
            style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: 8, background: 'var(--bg-page)', color: 'var(--text-primary)', fontSize: '0.85rem', fontFamily: 'var(--font-sans)', resize: 'vertical', boxSizing: 'border-box' }}
          />
        </div>

        <div
          onClick={() => fileRef.current?.click()}
          style={{ border: '2px dashed var(--border-default)', borderRadius: 10, padding: '20px', textAlign: 'center', cursor: 'pointer', marginBottom: 16, background: file ? 'var(--bg-page)' : 'transparent' }}
        >
          <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={(e) => setFile(e.target.files[0])} />
          {file ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--color-primary)', fontWeight: 600, fontSize: '0.85rem' }}>
              <Paperclip size={15} aria-hidden="true" /> {file.name}
            </div>
          ) : (
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
              <Upload size={20} style={{ margin: '0 auto 6px', display: 'block', opacity: 0.5 }} aria-hidden="true" />
               {copy.attach}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '9px', border: '1px solid var(--border-default)', borderRadius: 8, background: 'var(--bg-surface)', color: 'var(--text-primary)', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>{copy.cancel}</button>
          <button
            onClick={() => { onSubmit({ hwId: hw._id, notes, file }); onClose(); }}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px', border: 'none', borderRadius: 8, background: 'var(--color-primary)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
          >
             <Send size={13} aria-hidden="true" /> {copy.submit}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Assignment card ────────────────────────────────────────────── */
function AssignmentCard({ hw, isTeacher, onSubmit, onGrade }) {
  const { lang } = useLang();
  const copy = COPY[lang] || COPY.en;
  const [expanded, setExpanded] = useState(false);
  const [gradeVal, setGradeVal] = useState(hw.grade ?? '');
  const [feedbackVal, setFeedbackVal] = useState(hw.feedback ?? '');
  const isOverdue = hw.status !== 'graded' && hw.status !== 'submitted' && new Date(hw.deadline) < new Date();
  const effectiveStatus = isOverdue ? 'overdue' : hw.status;

  return (
    <div className="ds-card" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Card header */}
      <button
        onClick={() => setExpanded((e) => !e)}
         style={{ width: '100%', textAlign: 'start', background: 'none', border: 'none', cursor: 'pointer', padding: '16px 20px', fontFamily: 'var(--font-sans)' }}
        aria-expanded={expanded}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--bg-page)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <FileText size={18} style={{ color: 'var(--color-primary)' }} aria-hidden="true" />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.95rem' }}>{hw.title}</span>
               {statusBadge(effectiveStatus, copy)}
            </div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 5 }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 3 }}>
                 <BookOpen size={11} aria-hidden="true" /> {copy.subjects[hw.subject] || hw.subject}
              </span>
              <span style={{ fontSize: '0.75rem', color: deadlineColor(hw.deadline), fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
                 <Calendar size={11} aria-hidden="true" />
                 <time dateTime={hw.deadline} title={new Intl.DateTimeFormat(LOCALES[lang] || LOCALES.en, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(hw.deadline))}>
                   {formatDeadline(hw.deadline, copy, lang)}
                 </time>
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 3 }}>
                 <Star size={11} aria-hidden="true" /> {hw.points} {copy.pointsShort}
              </span>
              {isTeacher && (
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                   {copy.submittedCount(hw.submissions, hw.totalStudents)}
                </span>
              )}
              {hw.grade !== null && hw.grade !== undefined && (
                <span style={{ fontSize: '0.75rem', color: '#16a34a', fontWeight: 700 }}>
                   {copy.score(hw.grade, hw.points)}
                </span>
              )}
            </div>
          </div>

          <div style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--border-subtle)', padding: '16px 20px' }}>
          <p style={{ margin: '0 0 14px', color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.6 }}>{hw.description}</p>

          {/* Feedback if graded */}
          {hw.status === 'graded' && hw.feedback && (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontWeight: 700, color: '#15803d', fontSize: '0.78rem', marginBottom: 4 }}>
                 <MessageSquare size={12} aria-hidden="true" /> {copy.teacherFeedback}
              </div>
              <p style={{ margin: 0, color: '#166534', fontSize: '0.85rem' }}>{hw.feedback}</p>
            </div>
          )}

          {/* Student: submit button */}
          {!isTeacher && hw.status === 'pending' && !isOverdue && (
            <button
              onClick={() => onSubmit(hw)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
            >
               <Upload size={13} aria-hidden="true" /> {copy.submitWork}
            </button>
          )}

          {/* Student: submitted state */}
          {!isTeacher && hw.status === 'submitted' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#2563eb', fontSize: '0.82rem', fontWeight: 700 }}>
               <Check size={14} aria-hidden="true" /> {copy.awaitingGrading}
            </div>
          )}

          {/* Teacher: grade input */}
          {isTeacher && hw.status !== 'graded' && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                 <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 3 }}>{copy.scoreLabel(hw.points)}</label>
                <input
                  type="number" min={0} max={hw.points}
                  value={gradeVal}
                  onChange={(e) => setGradeVal(e.target.value)}
                  style={{ width: 80, padding: '7px 10px', border: '1px solid var(--border-default)', borderRadius: 8, background: 'var(--bg-page)', color: 'var(--text-primary)', fontSize: '0.85rem', fontFamily: 'var(--font-sans)' }}
                />
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                 <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 3 }}>{copy.feedback}</label>
                <input
                  type="text"
                  value={feedbackVal}
                  onChange={(e) => setFeedbackVal(e.target.value)}
                   placeholder={copy.feedbackPlaceholder}
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border-default)', borderRadius: 8, background: 'var(--bg-page)', color: 'var(--text-primary)', fontSize: '0.85rem', fontFamily: 'var(--font-sans)', boxSizing: 'border-box' }}
                />
              </div>
              <button
                onClick={() => onGrade({ hwId: hw._id, grade: Number(gradeVal), feedback: feedbackVal })}
                disabled={gradeVal === ''}
                style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontWeight: 700, fontSize: '0.82rem', cursor: gradeVal === '' ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-sans)', opacity: gradeVal === '' ? 0.5 : 1 }}
              >
                 <Check size={12} aria-hidden="true" /> {copy.grade}
              </button>
            </div>
          )}

          {/* Teacher: view submissions link */}
          {isTeacher && (
            <div style={{ marginTop: 12, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
               {copy.studentsSubmitted(hw.submissions, hw.totalStudents)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   HomeworkPage
   ════════════════════════════════════════════════════════════════ */
export default function HomeworkPage() {
  const { isTeacher } = useAuth();
  const { lang } = useLang();
  const copy = COPY[lang] || COPY.en;
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [submitTarget, setSubmitTarget] = useState(null);
  const [filter, setFilter] = useState('all');
  const [subjectFilter, setSubjectFilter] = useState('all');

  const role = isTeacher ? 'teacher' : 'student';

  const { data: homework = [], isLoading } = useQuery({
    queryKey: ['homework', role, lang],
    queryFn: () => fetchHomework(role, lang),
    staleTime: 2 * 60 * 1000,
  });

  // No /api/homework/* backend exists yet (see the preview banner below) — these
  // mutations still call the real endpoint they're named for, so wiring one up
  // later needs no frontend changes, but they no longer swallow the failure and
  // pretend it succeeded. Letting the error propagate means isError below is
  // genuine, not a demo-mode fiction.
  const createMutation = useMutation({
    mutationFn: async (form) => {
      const { default: http } = await import('../api/http');
      await http.post('/api/homework', form);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['homework'] }),
  });

  const submitMutation = useMutation({
    mutationFn: async ({ hwId, notes }) => {
      const { default: http } = await import('../api/http');
      await http.post(`/api/homework/${hwId}/submit`, { notes });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['homework'] }),
  });

  const gradeMutation = useMutation({
    mutationFn: async ({ hwId, grade, feedback }) => {
      const { default: http } = await import('../api/http');
      await http.post(`/api/homework/${hwId}/grade`, { grade, feedback });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['homework'] }),
  });

  const actionFailed = createMutation.isError || submitMutation.isError || gradeMutation.isError;
  const dismissActionError = () => {
    createMutation.reset();
    submitMutation.reset();
    gradeMutation.reset();
  };

  /* Stats */
  const stats = useMemo(() => {
    const total    = homework.length;
    const pending  = homework.filter((h) => h.status === 'pending').length;
    const graded   = homework.filter((h) => h.status === 'graded').length;
    const overdue  = homework.filter((h) => h.status !== 'graded' && h.status !== 'submitted' && new Date(h.deadline) < new Date()).length;
    return { total, pending, graded, overdue };
  }, [homework]);

  /* Subjects */
  const subjects = useMemo(() => ['all', ...new Set(homework.map((h) => h.subject))], [homework]);

  /* Filtered list */
  const filtered = useMemo(() => {
    return homework.filter((h) => {
      const isOverdue = h.status !== 'graded' && h.status !== 'submitted' && new Date(h.deadline) < new Date();
      const effectiveStatus = isOverdue ? 'overdue' : h.status;
      if (filter !== 'all' && effectiveStatus !== filter) return false;
      if (subjectFilter !== 'all' && h.subject !== subjectFilter) return false;
      return true;
    }).sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
  }, [homework, filter, subjectFilter]);

  const STATUS_FILTERS = ['all','pending','submitted','graded','overdue'];

  return (
    <DashboardLayout>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <PreviewBanner>
          {copy.preview}
        </PreviewBanner>

        {actionFailed && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
            background: 'var(--color-danger-surface)', border: '1px solid var(--color-danger-border)',
            borderRadius: 10, marginBottom: 18, fontSize: '0.82rem', color: 'var(--color-danger-text)',
          }} role="alert">
             <span style={{ flex: 1 }}>{copy.actionError}</span>
            <button
              type="button"
              onClick={dismissActionError}
              style={{ background: 'none', border: 'none', color: 'var(--color-danger-text)', fontWeight: 700, cursor: 'pointer', fontSize: '0.78rem', fontFamily: 'var(--font-sans)' }}
            >
               {copy.dismiss}
            </button>
          </div>
        )}

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontWeight: 800, fontSize: '1.4rem', color: 'var(--text-primary)' }}>
               {isTeacher ? copy.assignments : copy.homework}
            </h1>
            <p style={{ margin: '2px 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
               {isTeacher ? copy.teacherSubtitle : copy.studentSubtitle}
            </p>
          </div>
          {isTeacher && (
            <button
              onClick={() => setCreateOpen(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
            >
               <Plus size={14} aria-hidden="true" /> {copy.newAssignmentButton}
            </button>
          )}
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10, marginBottom: 20 }}>
          {[
             { label: copy.total,                value: stats.total,   color: '#2176c7', Icon: FileText },
             { label: copy.statuses.pending,     value: stats.pending, color: '#d97706', Icon: Clock },
             { label: copy.statuses.graded,      value: stats.graded,  color: '#16a34a', Icon: Check },
             { label: copy.statuses.overdue,     value: stats.overdue, color: '#dc2626', Icon: AlertCircle },
          ].map(({ label, value, color, Icon }) => (
            <div key={label} className="ds-card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={16} style={{ color }} aria-hidden="true" />
              </div>
              <div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{value}</div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontWeight: 700, marginTop: 1 }}>{label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
          <Filter size={14} style={{ color: 'var(--text-secondary)' }} aria-hidden="true" />
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {STATUS_FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: '5px 12px', borderRadius: 99,
                  border: '1px solid var(--border-default)',
                  background: filter === f ? 'var(--color-primary)' : 'var(--bg-surface)',
                  color: filter === f ? '#fff' : 'var(--text-secondary)',
                  fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                 {copy.statuses[f]}
              </button>
            ))}
          </div>

          <select
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
             style={{ padding: '5px 10px', border: '1px solid var(--border-default)', borderRadius: 8, background: 'var(--bg-surface)', color: 'var(--text-secondary)', fontSize: '0.78rem', fontFamily: 'var(--font-sans)', cursor: 'pointer', marginInlineStart: 'auto' }}
             aria-label={copy.filterSubject}
          >
             {subjects.map((s) => <option key={s} value={s}>{s === 'all' ? copy.allSubjects : (copy.subjects[s] || s)}</option>)}
          </select>
        </div>

        {/* Assignments list */}
        {isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[...Array(3)].map((_,i) => <div key={i} className="ds-skel" style={{ height: 80, borderRadius: 12 }} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
            <FileText size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} aria-hidden="true" />
             <div style={{ fontWeight: 600 }}>{copy.noAssignments}</div>
            <div style={{ fontSize: '0.82rem', marginTop: 4 }}>
               {filter !== 'all' ? copy.changeFilter : isTeacher ? copy.createFirst : copy.caughtUp}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map((hw) => (
              <AssignmentCard
                key={hw._id}
                hw={hw}
                isTeacher={isTeacher}
                onSubmit={setSubmitTarget}
                onGrade={(data) => gradeMutation.mutate(data)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {createOpen && (
        <CreateModal
          onClose={() => setCreateOpen(false)}
          onSave={(form) => createMutation.mutate(form)}
        />
      )}
      {submitTarget && (
        <SubmitModal
          hw={submitTarget}
          onClose={() => setSubmitTarget(null)}
          onSubmit={(data) => submitMutation.mutate(data)}
        />
      )}
    </DashboardLayout>
  );
}

// Mobile nav toggle
const navToggle = document.getElementById('navToggle');
const nav = document.getElementById('nav');

navToggle.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  navToggle.setAttribute('aria-expanded', String(open));
});

// Close mobile nav when a link is clicked
nav.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    nav.classList.remove('open');
    navToggle.setAttribute('aria-expanded', 'false');
  });
});

// Scroll reveal animation
const revealEls = document.querySelectorAll(
  '.feature, .step, .course, .stat, .plan, .quote, .section-head'
);
revealEls.forEach((el) => el.classList.add('reveal'));

const io = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        io.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.12 }
);
revealEls.forEach((el) => io.observe(el));

// Trial form (demo handler — no backend)
const trialForm = document.getElementById('trialForm');
const formNote = document.getElementById('formNote');

trialForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!trialForm.checkValidity()) {
    trialForm.reportValidity();
    return;
  }
  formNote.hidden = false;
  trialForm.reset();
  setTimeout(() => { formNote.hidden = true; }, 6000);
});

// Newsletter form (demo handler)
const newsletterForm = document.getElementById('newsletterForm');
newsletterForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const input = newsletterForm.querySelector('input');
  if (input.value) {
    input.value = '';
    input.placeholder = '✓ Subscribed! Jazak Allah khair.';
  }
});

// Footer year (in case it should auto-update)
const yearEl = document.querySelector('.footer__bottom p');

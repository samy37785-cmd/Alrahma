import { createContext, useContext, useState } from 'react';

const TrialContext = createContext(null);

// Shares the "course the user clicked Start learning on" between the
// Courses section and the Trial form (which live in different components).
export function TrialProvider({ children }) {
  const [selectedCourse, setSelectedCourse] = useState('');
  const [selectedPlan, setSelectedPlan] = useState('');

  const scrollToForm = () =>
    document.getElementById('trial')?.scrollIntoView({ behavior: 'smooth' });

  // Set the course and smooth-scroll to the trial form.
  const startLearning = (courseTitle) => {
    setSelectedCourse(courseTitle);
    scrollToForm();
  };

  // Choose a pricing plan -> prefill the form note and scroll to it.
  const startPlan = (planName) => {
    setSelectedPlan(planName);
    scrollToForm();
  };

  return (
    <TrialContext.Provider
      value={{ selectedCourse, setSelectedCourse, selectedPlan, startLearning, startPlan }}
    >
      {children}
    </TrialContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTrial() {
  const ctx = useContext(TrialContext);
  if (!ctx) throw new Error('useTrial must be used inside <TrialProvider>');
  return ctx;
}

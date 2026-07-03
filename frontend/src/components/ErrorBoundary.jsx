import { Component } from 'react';

const CRASH_STRINGS = {
  ar: { crashed: 'حدث خطأ غير متوقع', crashSub: 'حدث خطأ غير متوقع. يرجى تحديث الصفحة والمحاولة مرة أخرى.', refresh: 'تحديث الصفحة' },
  fr: { crashed: "Une erreur s'est produite", crashSub: "Une erreur inattendue s'est produite. Veuillez rafraîchir la page et réessayer.", refresh: 'Rafraîchir la page' },
  it: { crashed: 'Si è verificato un errore', crashSub: "Si è verificato un errore imprevisto. Aggiorna la pagina e riprova.", refresh: 'Aggiorna la pagina' },
  de: { crashed: 'Etwas ist schiefgelaufen', crashSub: 'Ein unerwarteter Fehler ist aufgetreten. Bitte lade die Seite neu und versuche es erneut.', refresh: 'Seite neu laden' },
  es: { crashed: 'Algo salió mal', crashSub: 'Se produjo un error inesperado. Por favor recarga la página e inténtalo de nuevo.', refresh: 'Recargar página' },
  en: { crashed: 'Something went wrong', crashSub: 'An unexpected error occurred. Please refresh the page to try again.', refresh: 'Refresh page' },
};

export default class ErrorBoundary extends Component {
  state = { error: null, info: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Surface the real error so it can be diagnosed (visible in the console).
    console.error('App crash:', error, info);
    this.setState({ info });
  }

  render() {
    if (this.state.error) {
      const isDev = import.meta.env?.DEV;
      const lang = document.documentElement.lang || 'en';
      const s = CRASH_STRINGS[lang] || CRASH_STRINGS.en;
      return (
        <div style={{ padding: '80px 24px', textAlign: 'center', fontFamily: 'inherit' }}>
          <h2 style={{ marginBottom: '12px' }}>{s.crashed}</h2>
          <p style={{ color: '#666', margin: '0 0 24px' }}>
            {s.crashSub}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 28px', background: '#0b6e4f', color: '#fff',
              border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '1rem',
            }}
          >
            {s.refresh}
          </button>
          {isDev && this.state.error && (
            <pre style={{
              textAlign: 'left', maxWidth: 900, margin: '28px auto 0', padding: 16,
              background: '#1e1e1e', color: '#ff8787', borderRadius: 8, overflow: 'auto',
              fontSize: 13, whiteSpace: 'pre-wrap',
            }}>
              {String(this.state.error?.stack || this.state.error)}
              {this.state.info?.componentStack}
            </pre>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

import { Component } from 'react';

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
      return (
        <div style={{ padding: '80px 24px', textAlign: 'center', fontFamily: 'inherit' }}>
          <h2 style={{ marginBottom: '12px' }}>Something went wrong</h2>
          <p style={{ color: '#666', margin: '0 0 24px' }}>
            An unexpected error occurred. Please refresh the page to try again.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 28px', background: '#0b6e4f', color: '#fff',
              border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '1rem',
            }}
          >
            Refresh page
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

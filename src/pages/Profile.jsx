import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Profile() {
  const { user, logout, updateProfile } = useAuth();

  const [info, setInfo] = useState({ name: user?.name || '', email: user?.email || '' });
  const [pass, setPass] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [infoMsg, setInfoMsg]   = useState('');
  const [infoErr, setInfoErr]   = useState('');
  const [passMsg, setPassMsg]   = useState('');
  const [passErr, setPassErr]   = useState('');
  const [saving, setSaving]     = useState(false);

  const handleInfo = async (e) => {
    e.preventDefault();
    setInfoMsg(''); setInfoErr('');
    setSaving(true);
    try {
      await updateProfile({ name: info.name, email: info.email });
      setInfoMsg('Profile updated successfully.');
    } catch (err) {
      setInfoErr(err.response?.data?.message || 'Could not update profile.');
    } finally {
      setSaving(false);
    }
  };

  const handlePass = async (e) => {
    e.preventDefault();
    setPassMsg(''); setPassErr('');
    if (pass.newPassword !== pass.confirm) {
      return setPassErr('New passwords do not match.');
    }
    if (pass.newPassword.length < 6) {
      return setPassErr('New password must be at least 6 characters.');
    }
    setSaving(true);
    try {
      await updateProfile({ currentPassword: pass.currentPassword, newPassword: pass.newPassword });
      setPassMsg('Password changed successfully.');
      setPass({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (err) {
      setPassErr(err.response?.data?.message || 'Could not change password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="profile-page">
      <header className="admin__bar">
        <div className="container admin__bar-inner">
          <strong>AL-Rahma · My Account</strong>
          <div className="admin__bar-right">
            <Link to="/" className="btn btn--ghost btn--sm">← Back to site</Link>
            <Link to="/billing" className="btn btn--ghost btn--sm">Billing</Link>
            {user?.role === 'admin' && (
              <Link to="/admin" className="btn btn--ghost btn--sm">Admin</Link>
            )}
            <button className="btn btn--gold btn--sm" onClick={logout}>Logout</button>
          </div>
        </div>
      </header>

      <main className="container profile-page__main">
        <div className="profile-page__grid">

          {/* Personal info */}
          <section className="admin__panel">
            <h2>Personal Information</h2>
            {infoMsg && <p className="profile-page__success">{infoMsg}</p>}
            {infoErr && <p className="auth__error">{infoErr}</p>}
            <form onSubmit={handleInfo}>
              <div className="field">
                <label htmlFor="prof-name">Full name</label>
                <input
                  id="prof-name"
                  value={info.name}
                  onChange={(e) => setInfo((p) => ({ ...p, name: e.target.value }))}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="prof-email">Email address</label>
                <input
                  id="prof-email"
                  type="email"
                  value={info.email}
                  onChange={(e) => setInfo((p) => ({ ...p, email: e.target.value }))}
                  required
                />
              </div>
              <div className="field">
                <label>Account type</label>
                <input value={user?.role === 'admin' ? 'Administrator' : 'Student'} disabled />
              </div>
              <button type="submit" className="btn btn--green btn--block" disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </form>
          </section>

          {/* Change password */}
          <section className="admin__panel">
            <h2>Change Password</h2>
            {passMsg && <p className="profile-page__success">{passMsg}</p>}
            {passErr && <p className="auth__error">{passErr}</p>}
            <form onSubmit={handlePass}>
              <div className="field">
                <label htmlFor="cur-pass">Current password</label>
                <input
                  id="cur-pass"
                  type="password"
                  value={pass.currentPassword}
                  onChange={(e) => setPass((p) => ({ ...p, currentPassword: e.target.value }))}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="new-pass">New password</label>
                <input
                  id="new-pass"
                  type="password"
                  value={pass.newPassword}
                  onChange={(e) => setPass((p) => ({ ...p, newPassword: e.target.value }))}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="conf-pass">Confirm new password</label>
                <input
                  id="conf-pass"
                  type="password"
                  value={pass.confirm}
                  onChange={(e) => setPass((p) => ({ ...p, confirm: e.target.value }))}
                  required
                />
              </div>
              <button type="submit" className="btn btn--green btn--block" disabled={saving}>
                {saving ? 'Saving…' : 'Change password'}
              </button>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}

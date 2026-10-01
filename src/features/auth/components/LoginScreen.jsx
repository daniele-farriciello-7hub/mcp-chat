/**
 * Login screen. Mirrors instant-rating's so people using several suite apps find the same entry
 * point; accounts are the suite's, managed in userconf.
 */
'use client';

import { useState } from 'react';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
import AgentMark from '@/features/chat/components/AgentMark';
import { describeAuthError } from '@/features/auth/authErrors';
import Tooltip from '@/shared/ui/Tooltip';
import GoogleLogo from './GoogleLogo';

const INPUT_CLASS =
  'w-full rounded-xl border border-line bg-white py-3 pl-11 pr-4 text-[14px] text-ink placeholder:text-slate-soft/70 outline-none transition focus:border-brand-300 focus:ring-2 focus:ring-brand-100';

export default function LoginScreen({ onSignIn, onSignInWithGoogle, onResetPassword }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [pendingMethod, setPendingMethod] = useState(null); // 'email' | 'google' | null

  const run = async (method, action) => {
    if (pendingMethod) return;
    setError(null);
    setNotice(null);
    setPendingMethod(method);
    try {
      await action();
    } catch (e) {
      setError(describeAuthError(e));
      setPendingMethod(null);
    }
  };

  const submit = event => {
    event.preventDefault();
    run('email', () => onSignIn(email, password));
  };

  const requestPasswordReset = async () => {
    if (!email.trim()) {
      setError('Scrivi prima la tua email, poi premi qui.');
      return;
    }
    setError(null);
    try {
      await onResetPassword(email);
      setNotice('Ti ho inviato un’email per reimpostare la password.');
    } catch (e) {
      setError(describeAuthError(e));
    }
  };

  const passwordToggleLabel = showPassword ? 'Nascondi la password' : 'Mostra la password';

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-surface px-5 py-10">
      <AgentMark size={38} filled />

      <h1 className="mt-5 text-[27px] font-bold tracking-tight text-ink">Assistente 7hub</h1>
      <p className="mt-1 text-[14px] text-slate-soft">Accedi al tuo account</p>

      <div className="mt-7 w-full max-w-[400px] rounded-2xl border border-line bg-white p-6 shadow-soft">
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="relative">
            <Mail
              size={17}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-soft"
            />
            <input
              type="email"
              required
              autoComplete="username"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className={INPUT_CLASS}
              aria-label="Email"
            />
          </div>

          <div className="relative">
            <Lock
              size={17}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-soft"
            />
            <input
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="current-password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className={`${INPUT_CLASS} pr-12`}
              aria-label="Password"
            />
            <Tooltip
              label={passwordToggleLabel}
              align="right"
              className="absolute right-3 top-1/2 -translate-y-1/2"
            >
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                aria-label={passwordToggleLabel}
                className="rounded-lg p-1.5 text-slate-soft transition hover:text-ink"
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </Tooltip>
          </div>

          <button
            type="button"
            onClick={requestPasswordReset}
            className="self-end text-[13px] font-medium text-brand-600 transition hover:text-brand-700"
          >
            Password dimenticata?
          </button>

          {error && (
            <p role="alert" className="text-[13px] text-danger">
              {error}
            </p>
          )}
          {notice && <p className="text-[13px] text-ok">{notice}</p>}

          <button
            type="submit"
            disabled={Boolean(pendingMethod)}
            className="mt-1 w-full rounded-xl bg-brand-500 py-3 text-[15px] font-semibold text-white transition hover:bg-brand-600 disabled:opacity-60"
          >
            {pendingMethod === 'email' ? 'Accedo…' : 'Accedi'}
          </button>
        </form>

        <div className="my-5 flex items-center gap-3">
          <span className="h-px flex-1 bg-line" />
          <span className="text-[13px] text-slate-soft">oppure</span>
          <span className="h-px flex-1 bg-line" />
        </div>

        <button
          type="button"
          onClick={() => run('google', onSignInWithGoogle)}
          disabled={Boolean(pendingMethod)}
          className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-line bg-white py-3 text-[15px] font-medium text-ink transition hover:bg-surface disabled:opacity-60"
        >
          <GoogleLogo />
          {pendingMethod === 'google' ? 'Attendo Google…' : 'Continua con Google'}
        </button>
      </div>

      <p className="mt-6 text-center text-[13px] text-slate-soft">
        Accesso riservato ai collaboratori autorizzati.
      </p>
    </div>
  );
}

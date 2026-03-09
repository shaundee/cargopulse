'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { IconEye, IconEyeOff } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

const TEAL = 'linear-gradient(90deg, #0ea5e9 0%, #06b6d4 100%)';

function FieldInput({
  label, labelSuffix, placeholder, value, onChange, type = 'text', required,
}: {
  label: string; labelSuffix?: string; placeholder: string; value: string;
  onChange: (v: string) => void; type?: string; required?: boolean;
}) {
  const [show, setShow] = useState(false);
  const isPassword = type === 'password';
  const inputType = isPassword ? (show ? 'text' : 'password') : type;

  return (
    <div>
      <label style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
        {label}
        {labelSuffix && <span style={{ fontSize: 12, fontWeight: 400, color: '#9ca3af' }}>{labelSuffix}</span>}
      </label>
      <div style={{ position: 'relative' }}>
        <input
          type={inputType}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.currentTarget.value)}
          required={required}
          style={{
            width: '100%', boxSizing: 'border-box',
            background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8,
            padding: isPassword ? '13px 44px 13px 14px' : '13px 14px',
            color: '#111827', fontSize: 14, outline: 'none', fontFamily: 'inherit',
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = '#0ea5e9'; e.currentTarget.style.background = '#fff'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.background = '#f9fafb'; }}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            style={{
              position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#9ca3af', padding: 0, display: 'flex',
            }}
            tabIndex={-1}
          >
            {show ? <IconEyeOff size={18} /> : <IconEye size={18} />}
          </button>
        )}
      </div>
    </div>
  );
}

function SignupForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const ref = searchParams.get('ref') ?? '';
    if (ref) { setReferralCode(ref.toUpperCase()); return; }
    const match = document.cookie.match(/(?:^|;\s*)cp_ref=([^;]+)/);
    if (match?.[1]) setReferralCode(match[1]);
  }, [searchParams]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { referral_code: referralCode || null } },
    });
    setLoading(false);
    if (error) {
      notifications.show({ title: 'Signup failed', message: error.message, color: 'red' });
      return;
    }
    notifications.show({ title: 'Account created', message: 'Check your email to confirm, then sign in.', color: 'green' });
    window.location.href = '/login';
  }

  const isReferred = referralCode.length >= 4;

  return (
    <div style={{
      minHeight: '100vh', background: '#f3f4f8', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: '24px 16px',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    }}>
      {/* Logo */}
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg?v=4" alt="Cargo44" style={{ height: 52, width: 'auto', objectFit: 'contain' }} />
        <p style={{ margin: '8px 0 0', fontSize: 14, color: '#9ca3af' }}>
          Less hassle. More shipping.
        </p>
      </div>

      {/* Card */}
      <div style={{
        width: '100%', maxWidth: 440,
        background: '#fff', border: '1px solid #e5e7eb',
        borderRadius: 16, padding: 32, boxShadow: '0 1px 3px rgba(0,0,0,0.07)',
      }}>
        {/* Tabs */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr',
          background: '#f3f4f6', borderRadius: 10, padding: 4, marginBottom: 28,
        }}>
          <div style={{
            textAlign: 'center', padding: '10px 0', borderRadius: 8,
            background: TEAL, fontSize: 14, fontWeight: 700, color: '#fff',
          }}>
            Sign Up
          </div>
          <a href="/login" style={{ textDecoration: 'none' }}>
            <div style={{
              textAlign: 'center', padding: '10px 0', borderRadius: 8,
              fontSize: 14, fontWeight: 600, color: '#6b7280', cursor: 'pointer',
            }}>
              Sign In
            </div>
          </a>
        </div>

        {isReferred && (
          <div style={{
            background: '#f0f9ff', border: '1px solid #bae6fd',
            borderRadius: 8, padding: '11px 14px', marginBottom: 20,
            fontSize: 13, color: '#0369a1',
          }}>
            🎁 You&apos;ve been referred — get 50% off your first month when you upgrade!
          </div>
        )}

        <form onSubmit={onSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <FieldInput label="Email Address" placeholder="you@company.com" type="email" value={email} onChange={setEmail} required />
            <FieldInput label="Password" placeholder="Create a password" type="password" value={password} onChange={setPassword} required />
            <FieldInput
              label="Referral Code"
              labelSuffix="(Optional)"
              placeholder="e.g. AB3K7P"
              value={referralCode}
              onChange={(v) => setReferralCode(v.toUpperCase())}
            />

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '14px 0', marginTop: 4,
                background: loading ? '#7dd3fc' : TEAL,
                border: 'none', borderRadius: 8, color: '#fff',
                fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {loading ? 'Creating account…' : 'Create Account →'}
            </button>
          </div>
        </form>

        <p style={{ margin: '20px 0 0', textAlign: 'center', fontSize: 13, color: '#9ca3af' }}>
          Already have an account?{' '}
          <a href="/login" style={{ color: '#0ea5e9', fontWeight: 600, textDecoration: 'none' }}>Sign in</a>
        </p>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}

'use client';

import type { FormEvent } from 'react';
import { useState } from 'react';
import { IconEye, IconEyeOff } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

const TEAL = 'linear-gradient(90deg, #0ea5e9 0%, #06b6d4 100%)';

function DarkInput({
  label, placeholder, value, onChange, type = 'text', required,
}: {
  label: string; placeholder: string; value: string;
  onChange: (v: string) => void; type?: string; required?: boolean;
}) {
  const [show, setShow] = useState(false);
  const isPassword = type === 'password';
  const inputType = isPassword ? (show ? 'text' : 'password') : type;

  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
        {label}
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

export default function LoginClient({ nextPath, errorMessage }: { nextPath: string; errorMessage?: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      notifications.show({ title: 'Login failed', message: error.message, color: 'red' });
      return;
    }
    window.location.href = nextPath;
  }

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
          <a href="/signup" style={{ textDecoration: 'none' }}>
            <div style={{
              textAlign: 'center', padding: '10px 0', borderRadius: 8,
              fontSize: 14, fontWeight: 600, color: '#6b7280', cursor: 'pointer',
            }}>
              Sign Up
            </div>
          </a>
          <div style={{
            textAlign: 'center', padding: '10px 0', borderRadius: 8,
            background: TEAL, fontSize: 14, fontWeight: 700, color: '#fff',
          }}>
            Sign In
          </div>
        </div>

        {errorMessage && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fecaca',
            borderRadius: 8, padding: '12px 14px', marginBottom: 20,
            fontSize: 13, color: '#dc2626',
          }}>
            {errorMessage}
          </div>
        )}

        <form onSubmit={onSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <DarkInput label="Email Address" placeholder="you@company.com" type="email" value={email} onChange={setEmail} required />
            <DarkInput label="Password" placeholder="Your password" type="password" value={password} onChange={setPassword} required />

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
              {loading ? 'Signing in…' : 'Sign In →'}
            </button>
          </div>
        </form>

        <p style={{ margin: '20px 0 0', textAlign: 'center', fontSize: 13, color: '#9ca3af' }}>
          Don&apos;t have an account?{' '}
          <a href="/signup" style={{ color: '#0ea5e9', fontWeight: 600, textDecoration: 'none' }}>Sign up free</a>
        </p>
      </div>
    </div>
  );
}

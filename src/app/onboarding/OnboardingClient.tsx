'use client';

import { useEffect, useRef, useState } from 'react';
import { notifications } from '@mantine/notifications';

const TEAL = 'linear-gradient(90deg, #0ea5e9 0%, #06b6d4 100%)';

const COUNTRY_OPTIONS = [
  { value: 'GB', label: '🇬🇧 United Kingdom' },
  { value: 'US', label: '🇺🇸 United States' },
  { value: 'CA', label: '🇨🇦 Canada' },
  { value: 'CN', label: '🇨🇳 China' },
  { value: 'IN', label: '🇮🇳 India' },
  { value: 'AE', label: '🇦🇪 UAE' },
  { value: 'DE', label: '🇩🇪 Germany' },
  { value: 'FR', label: '🇫🇷 France' },
  { value: 'NL', label: '🇳🇱 Netherlands' },
  { value: 'NG', label: '🇳🇬 Nigeria' },
  { value: 'GH', label: '🇬🇭 Ghana' },
  { value: 'JM', label: '🇯🇲 Jamaica' },
  { value: 'BB', label: '🇧🇧 Barbados' },
  { value: 'TT', label: '🇹🇹 Trinidad & Tobago' },
  { value: 'GY', label: '🇬🇾 Guyana' },
  { value: 'LC', label: '🇱🇨 Saint Lucia' },
  { value: 'VC', label: '🇻🇨 St Vincent' },
];

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  background: '#f9fafb',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  padding: '13px 14px',
  color: '#111827',
  fontSize: 14,
  outline: 'none',
  fontFamily: 'inherit',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: '#374151',
  marginBottom: 6,
};

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
      {hint && <p style={{ margin: '5px 0 0', fontSize: 12, color: '#9ca3af' }}>{hint}</p>}
    </div>
  );
}

export default function OnboardingClient() {
  const [orgName, setOrgName] = useState('');
  const [country, setCountry] = useState('');
  const [loading, setLoading] = useState(false);
  const referralCodeRef = useRef('');

  useEffect(() => {
    const match = document.cookie.match(/(?:^|;\s*)cp_ref=([^;]+)/);
    if (match?.[1]) referralCodeRef.current = match[1];
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (orgName.trim().length < 2) return;
    setLoading(true);

    try {
      const res = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgName,
          originCountry: country || null,
          referralCode: referralCodeRef.current || null,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        notifications.show({ title: 'Setup failed', message: json?.error ?? 'Unknown error', color: 'red' });
        setLoading(false);
        return;
      }

      // Clear referral cookie
      document.cookie = 'cp_ref=; path=/; max-age=0';
      window.location.href = '/dashboard';
    } catch (err: any) {
      notifications.show({ title: 'Setup failed', message: err?.message ?? 'Request failed', color: 'red' });
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f3f4f8',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
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
        width: '100%',
        maxWidth: 440,
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 16,
        padding: 32,
        boxShadow: '0 1px 3px rgba(0,0,0,0.07)',
      }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 800, color: '#111827' }}>
          Set up your company
        </h2>
        <p style={{ margin: '0 0 24px', fontSize: 14, color: '#6b7280' }}>
          Just two details and you&apos;re ready to go.
        </p>

        <form onSubmit={onSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <Field label="Company name" hint="This appears on your customer tracking pages.">
              <input
                style={inputStyle}
                type="text"
                placeholder="e.g. Kingston Express Shipping"
                value={orgName}
                onChange={(e) => setOrgName(e.currentTarget.value)}
                required
                minLength={2}
                onFocus={(e) => { e.currentTarget.style.borderColor = '#0ea5e9'; e.currentTarget.style.background = '#fff'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.background = '#f9fafb'; }}
              />
            </Field>

            <Field label="Origin country" hint="Where your shipments typically depart from. You can change this later.">
              <select
                style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}
                value={country}
                onChange={(e) => setCountry(e.currentTarget.value)}
                onFocus={(e) => { e.currentTarget.style.borderColor = '#0ea5e9'; e.currentTarget.style.background = '#fff'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.background = '#f9fafb'; }}
              >
                <option value="">Select a country (optional)</option>
                {COUNTRY_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </Field>

            <button
              type="submit"
              disabled={loading || orgName.trim().length < 2}
              style={{
                width: '100%',
                padding: '14px 0',
                marginTop: 4,
                background: loading || orgName.trim().length < 2 ? '#7dd3fc' : TEAL,
                border: 'none',
                borderRadius: 8,
                color: '#fff',
                fontSize: 15,
                fontWeight: 700,
                cursor: loading || orgName.trim().length < 2 ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {loading ? 'Creating…' : 'Create organisation →'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

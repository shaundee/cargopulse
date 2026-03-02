'use client';

import { useState } from 'react';
import Link from 'next/link';

export function PrintControls({
  backHref,
  trackingUrl,
}: {
  backHref: string;
  trackingUrl?: string | null;
}) {
  const [copied, setCopied] = useState(false);

  function copyLink() {
    if (!trackingUrl) return;
    navigator.clipboard.writeText(trackingUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const btn: React.CSSProperties = {
    padding: '6px 14px',
    borderRadius: 6,
    border: '1px solid #ccc',
    cursor: 'pointer',
    fontSize: 13,
    background: '#fff',
    fontFamily: 'inherit',
  };

  const btnPrimary: React.CSSProperties = {
    ...btn,
    background: '#111',
    color: '#fff',
    border: '1px solid #111',
    fontWeight: 600,
  };

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <button type="button" onClick={() => window.print()} style={btnPrimary}>
        🖨️ Print / Save PDF
      </button>

      {trackingUrl && (
        <button type="button" onClick={copyLink} style={btn}>
          {copied ? '✓ Copied' : '🔗 Copy tracking link'}
        </button>
      )}

      {trackingUrl && (
        <a
          href={trackingUrl}
          target="_blank"
          rel="noreferrer"
          style={{ ...btn, textDecoration: 'none', color: '#111' }}
        >
          👁 Preview tracking page
        </a>
      )}

      <Link href={backHref} style={{ ...btn, textDecoration: 'none', color: '#555' }}>
        ← Back
      </Link>

      <span style={{ fontSize: 11, color: '#999', marginLeft: 4 }}>
        Use <strong>Print → Save as PDF</strong> in your browser for a PDF copy.
      </span>
    </div>
  );
}
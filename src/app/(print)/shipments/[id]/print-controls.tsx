'use client';

import Link from 'next/link';

export function PrintControls({ backHref }: { backHref: string }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <button
        type="button"
        onClick={() => window.print()}
        style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ccc', cursor: 'pointer' }}
      >
        Print
      </button>

      <Link href={backHref} style={{ textDecoration: 'none' }}>
        Back
      </Link>
    </div>
  );
}

'use client';

import { useEffect, useState, type CSSProperties } from 'react';

const NAV_LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Corridors', href: '#corridors' },
];

const CORRIDORS = [
  { flag: '🇯🇲', name: 'Jamaica' },
  { flag: '🇳🇬', name: 'Nigeria' },
  { flag: '🇧🇧', name: 'Barbados' },
  { flag: '🇬🇭', name: 'Ghana' },
  { flag: '🇹🇹', name: 'Trinidad' },
  { flag: '🇺🇸', name: 'USA' },
  { flag: '🇰🇪', name: 'Kenya' },
  { flag: '🇬🇾', name: 'Guyana' },
];

const HERO_POINTS = [
  'Automatic WhatsApp updates',
  'Branded tracking page',
  'Works for collections too',
];

const HERO_STATS = [
  { label: 'Setup time', value: '2 mins' },
  { label: 'Free allowance', value: '10 shipments' },
  { label: 'Customer app needed', value: 'No' },
];

const WHATSAPP_MESSAGES = [
  {
    type: 'incoming',
    text: 'Hi, we received your shipment (SHP-40EMK8) at our UK depot. Track: cargo44.com/t/shp40e...',
    time: '2:30 PM',
  },
  {
    type: 'incoming',
    text: 'Update: shipment SHP-40EMK8 has been loaded and is preparing to depart. Track: cargo44.com/t/shp40e...',
    time: '4:15 PM',
    delay: 600,
  },
  {
    type: 'reply',
    text: 'Thanks for the update! 🙏',
    time: '4:16 PM',
    delay: 1200,
  },
  {
    type: 'incoming',
    text: 'Update: shipment SHP-40EMK8 has departed the UK. Track: cargo44.com/t/shp40e...',
    time: 'Next day',
    delay: 1800,
  },
];

const STEPS = [
  {
    num: '01',
    title: 'Book a shipment',
    desc: 'Add customer, phone, destination and collection details in under a minute.',
    icon: '📦',
  },
  {
    num: '02',
    title: 'Update the status',
    desc: 'Received, loaded, departed, arrived, delivered. Each update sends a customer message instantly.',
    icon: '📲',
  },
  {
    num: '03',
    title: 'Customer tracks it themselves',
    desc: 'They open their own tracking link, see progress, and stop chasing you for updates.',
    icon: '🔗',
  },
];

const FEATURES = [
  {
    icon: '💬',
    title: 'Automatic WhatsApp updates',
    desc: 'Every status change can send the customer a branded WhatsApp update with their tracking link.',
  },
  {
    icon: '🌍',
    title: 'Built for your corridors',
    desc: 'Custom status steps per destination so Jamaica, Nigeria, Barbados or Ghana do not all look the same.',
  },
  {
    icon: '👥',
    title: 'Agent portal',
    desc: 'Your destination agent gets their own login to update statuses and capture proof of delivery.',
  },
  {
    icon: '📋',
    title: 'Offline field collections',
    desc: 'Collecting from a customer with poor signal? Save to outbox and sync when you are back online.',
  },
  {
    icon: '📄',
    title: 'BOL & receipts',
    desc: 'Generate professional bills of lading and customer receipts you can print, send or save as PDF.',
  },
  {
    icon: '📊',
    title: 'Know your numbers',
    desc: 'See shipments by destination, customer history and operational progress without a spreadsheet mess.',
  },
];

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
    <circle cx="8" cy="8" r="8" fill="#10b981" />
    <path d="M5 8.5L7 10.5L11 6.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ArrowIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M3 8H13M13 8L9 4M13 8L9 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ctaBtnStyle = (size: 'large' | 'normal' = 'normal'): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  padding: size === 'large' ? '16px 28px' : '12px 22px',
  background: '#0c1425',
  color: '#fff',
  border: 'none',
  borderRadius: 12,
  fontSize: size === 'large' ? 16 : 14,
  fontWeight: 700,
  cursor: 'pointer',
  letterSpacing: '-0.01em',
  textDecoration: 'none',
  boxShadow: '0 10px 30px rgba(12,20,37,0.14)',
});

const secondaryBtnStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  padding: '16px 22px',
  background: '#fff',
  color: '#0c1425',
  border: '1px solid #dbe2ea',
  borderRadius: 12,
  fontSize: 16,
  fontWeight: 700,
  cursor: 'pointer',
  letterSpacing: '-0.01em',
  textDecoration: 'none',
};

export default function LandingPage() {
  const [visibleMessages, setVisibleMessages] = useState(1);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    WHATSAPP_MESSAGES.forEach((msg, i) => {
      if (i > 0 && msg.delay) {
        timers.push(setTimeout(() => setVisibleMessages(i + 1), msg.delay));
      }
    });
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div
      style={{
        minHeight: '100vh',
        fontFamily: "'Outfit', -apple-system, BlinkMacSystemFont, sans-serif",
        color: '#0c1425',
        overflowX: 'hidden',
        background: '#fff',
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap"
        rel="stylesheet"
      />

      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html { scroll-behavior: smooth; }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes messageSlide {
          from { opacity: 0; transform: translateY(10px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .cta-link:hover { opacity: 0.92; }
        .corridor-pill:hover { background: #eef2ff !important; border-color: #c7d2fe !important; }
        .hero-grid,
        .split-grid,
        .step-grid,
        .feature-grid,
        .hero-stat-grid {
          display: grid;
        }
        .hero-grid {
          grid-template-columns: minmax(0, 1.1fr) minmax(320px, 0.9fr);
          gap: 48px;
          align-items: center;
        }
        .split-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 60px;
          align-items: center;
        }
        .step-grid {
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 24px;
        }
        .feature-grid {
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 20px;
        }
        .hero-stat-grid {
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
        }
        @media (max-width: 980px) {
          .hero-grid,
          .split-grid,
          .step-grid,
          .feature-grid {
            grid-template-columns: 1fr;
          }
          .hero-copy {
            max-width: 100% !important;
          }
        }
        @media (max-width: 760px) {
          .nav-links {
            display: none !important;
          }
          .hero-title {
            font-size: 40px !important;
            line-height: 1.04 !important;
          }
          .section-title {
            font-size: 32px !important;
          }
          .hero-stat-grid {
            grid-template-columns: 1fr;
          }
          .hero-actions {
            flex-direction: column;
            align-items: stretch !important;
          }
          .hero-actions a {
            width: 100%;
          }
        }
      `}</style>

      <nav
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          padding: '0 24px',
          background: scrolled ? 'rgba(255,255,255,0.92)' : 'transparent',
          backdropFilter: scrolled ? 'blur(12px)' : 'none',
          borderBottom: scrolled ? '1px solid #e8eaef' : '1px solid transparent',
          transition: 'all 0.3s ease',
        }}
      >
        <div
          style={{
            maxWidth: 1140,
            margin: '0 auto',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            height: 72,
            gap: 20,
          }}
        >
          <a href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logosmall.svg?v=4" alt="Cargo44" style={{ height: 48, width: 'auto' }} />
          </a>

          <div className="nav-links" style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
            {NAV_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: '#475569',
                  textDecoration: 'none',
                }}
              >
                {link.label}
              </a>
            ))}
            <a
              href="/signup"
              style={{
                padding: '8px 20px',
                background: '#0c1425',
                color: '#fff',
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              Sign up free
            </a>
          </div>
        </div>
      </nav>

      <section
        style={{
          paddingTop: 132,
          paddingBottom: 88,
          background: 'linear-gradient(180deg, #f6f8ff 0%, #ffffff 100%)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: 'radial-gradient(circle at 1px 1px, #e2e8f0 1px, transparent 1px)',
            backgroundSize: '40px 40px',
            opacity: 0.34,
          }}
        />

        <div style={{ maxWidth: 1140, margin: '0 auto', padding: '0 24px', position: 'relative' }}>
          <div className="hero-grid">
            <div className="hero-copy" style={{ maxWidth: 640, animation: 'fadeUp 0.8s ease-out' }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '7px 14px 7px 8px',
                  background: '#fff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 999,
                  fontSize: 13,
                  color: '#475569',
                  marginBottom: 22,
                  boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                }}
              >
                <span style={{ display: 'flex', gap: 2 }}>
                  {['🇬🇧', '🇺🇸', '🇯🇲', '🇳🇬'].map((flag, i) => (
                    <span
                      key={i}
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        background: '#f1f5f9',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 14,
                        marginLeft: i > 0 ? -6 : 0,
                        border: '2px solid #fff',
                      }}
                    >
                      {flag}
                    </span>
                  ))}
                </span>
                Built for operators shipping barrels, boxes & personal effects
              </div>

              <h1
                className="hero-title"
                style={{
                  fontSize: 58,
                  fontWeight: 900,
                  lineHeight: 1.02,
                  letterSpacing: '-0.04em',
                  color: '#0c1425',
                  marginBottom: 18,
                }}
              >
                Stop the
                <br />
                <span
                  style={{
                    background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  “where’s my shipment?”
                </span>
                <br />
                calls.
              </h1>

              <p
                style={{
                  fontSize: 19,
                  lineHeight: 1.65,
                  color: '#475569',
                  marginBottom: 18,
                  maxWidth: 580,
                }}
              >
                Cargo44 sends automatic WhatsApp updates and branded tracking links so your customers follow the shipment themselves instead of chasing your phone.
              </p>

              <p
                style={{
                  fontSize: 15,
                  lineHeight: 1.7,
                  color: '#64748b',
                  marginBottom: 32,
                  maxWidth: 560,
                  fontWeight: 500,
                }}
              >
                Built for small shipping operators serving Caribbean and African routes, with support for collections, destination agents, proof of delivery and custom status steps.
              </p>

              <div className="hero-actions" style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 34 }}>
                <a href="/signup" className="cta-link" style={ctaBtnStyle('large')}>
                  Start free — 10 shipments/month
                  <ArrowIcon />
                </a>
                <a href="#how-it-works" style={secondaryBtnStyle}>
                  See how it works
                </a>
              </div>

              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 32 }}>
                {HERO_POINTS.map((item, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 14,
                      color: '#334155',
                      fontWeight: 500,
                    }}
                  >
                    <CheckIcon />
                    {item}
                  </div>
                ))}
              </div>

              <div className="hero-stat-grid">
                {HERO_STATS.map((stat) => (
                  <div
                    key={stat.label}
                    style={{
                      background: 'rgba(255,255,255,0.78)',
                      border: '1px solid #e2e8f0',
                      borderRadius: 18,
                      padding: '16px 18px',
                      boxShadow: '0 10px 24px rgba(15, 23, 42, 0.04)',
                    }}
                  >
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>{stat.label}</div>
                    <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em', color: '#0c1425' }}>{stat.value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ position: 'relative' }}>
              <div
                style={{
                  background: 'linear-gradient(135deg, #0c1425 0%, #13203d 100%)',
                  borderRadius: 28,
                  padding: 24,
                  color: '#fff',
                  boxShadow: '0 24px 80px rgba(12,20,37,0.22)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 22 }}>
                  <div>
                    <div style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.58)', marginBottom: 8 }}>
                      Example workflow
                    </div>
                    <div style={{ fontSize: 30, fontWeight: 900, lineHeight: 1.05, letterSpacing: '-0.04em', marginBottom: 8 }}>
                      Update once.
                      <br />
                      Customer sees it.
                    </div>
                    <div style={{ fontSize: 14, lineHeight: 1.6, color: 'rgba(255,255,255,0.72)', maxWidth: 330 }}>
                      The shipment status changes in your dashboard. Cargo44 sends the WhatsApp message and the live tracking link immediately.
                    </div>
                  </div>
                  <div
                    style={{
                      minWidth: 110,
                      background: 'rgba(255,255,255,0.08)',
                      borderRadius: 18,
                      padding: '12px 14px',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>Status now</div>
                    <div style={{ fontSize: 18, fontWeight: 800 }}>Departed UK</div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1.05fr 0.95fr', gap: 18 }}>
                  <div
                    style={{
                      background: '#ece5dd',
                      borderRadius: 20,
                      overflow: 'hidden',
                      boxShadow: '0 12px 28px rgba(0,0,0,0.16)',
                    }}
                  >
                    <div
                      style={{
                        background: '#075E54',
                        padding: '12px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                      }}
                    >
                      <div
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: '50%',
                          background: '#128C7E',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 13,
                          fontWeight: 700,
                        }}
                      >
                        C44
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>cargo44</div>
                        <div style={{ fontSize: 11, opacity: 0.72 }}>online</div>
                      </div>
                    </div>

                    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 222, background: '#DAD3CC' }}>
                      {WHATSAPP_MESSAGES.slice(0, visibleMessages).map((msg, i) => (
                        <div
                          key={i}
                          style={{
                            alignSelf: msg.type === 'reply' ? 'flex-end' : 'flex-start',
                            maxWidth: '86%',
                            background: msg.type === 'reply' ? '#DCF8C6' : '#fff',
                            padding: '8px 10px 4px',
                            borderRadius: msg.type === 'reply' ? '10px 10px 4px 10px' : '10px 10px 10px 4px',
                            boxShadow: '0 1px 1px rgba(0,0,0,0.08)',
                            animation: 'messageSlide 0.3s ease-out',
                          }}
                        >
                          <div style={{ fontSize: 12, color: '#111', lineHeight: 1.45, wordBreak: 'break-word' }}>{msg.text}</div>
                          <div style={{ fontSize: 10, color: '#667781', textAlign: 'right', marginTop: 2 }}>{msg.time}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div
                    style={{
                      background: '#fff',
                      borderRadius: 20,
                      overflow: 'hidden',
                      boxShadow: '0 12px 28px rgba(0,0,0,0.12)',
                      color: '#0c1425',
                    }}
                  >
                    <div style={{ background: '#f1f5f9', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ display: 'flex', gap: 5 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} />
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} />
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }} />
                      </div>
                      <div style={{ flex: 1, background: '#fff', borderRadius: 6, padding: '4px 10px', fontSize: 10, color: '#94a3b8' }}>
                        yourbrand.cargo44.com/t/...
                      </div>
                    </div>

                    <div style={{ padding: 14 }}>
                      <div
                        style={{
                          background: 'linear-gradient(135deg, #4338ca 0%, #7c3aed 100%)',
                          borderRadius: 12,
                          padding: 14,
                          color: '#fff',
                          marginBottom: 10,
                          position: 'relative',
                          overflow: 'hidden',
                        }}
                      >
                        <div style={{ position: 'absolute', top: -20, right: -20, width: 72, height: 72, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
                        <div style={{ fontSize: 9, opacity: 0.66, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>Tracking</div>
                        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 16, fontWeight: 800, letterSpacing: 1, marginBottom: 4 }}>SHP-40EMK8</div>
                        <div style={{ fontSize: 12, opacity: 0.85 }}>To Jamaica 🇯🇲</div>
                      </div>

                      <div
                        style={{
                          background: '#f0fdf4',
                          border: '1px solid #bbf7d0',
                          borderRadius: 10,
                          padding: '10px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          marginBottom: 12,
                        }}
                      >
                        <span style={{ fontSize: 18 }}>🚢</span>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#15803d' }}>Departed UK</div>
                          <div style={{ fontSize: 10, color: '#16a34a' }}>On the way to Jamaica</div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 4px', marginBottom: 6 }}>
                        {['📦', '🏗️', '🚢', '🏝️', '🚚', '✅'].map((icon, i) => (
                          <div
                            key={i}
                            style={{
                              width: 26,
                              height: 26,
                              borderRadius: '50%',
                              background: i <= 2 ? '#4f46e5' : '#e2e8f0',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: i <= 2 ? 12 : 0,
                            }}
                          >
                            {i <= 2 ? icon : <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#94a3b8' }} />}
                          </div>
                        ))}
                      </div>
                      <div style={{ height: 3, background: '#e2e8f0', borderRadius: 10, overflow: 'hidden', marginBottom: 12 }}>
                        <div style={{ height: '100%', width: '45%', background: '#4f46e5', borderRadius: 10 }} />
                      </div>

                      <div style={{ background: '#25D366', borderRadius: 8, padding: '10px', textAlign: 'center', color: '#fff', fontSize: 12, fontWeight: 700 }}>
                        💬 WhatsApp support
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" style={{ padding: '84px 24px', background: '#fff' }}>
        <div className="split-grid" style={{ maxWidth: 1140, margin: '0 auto' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#25D366', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
              The moment that changes everything
            </div>
            <h2 className="section-title" style={{ fontSize: 38, fontWeight: 800, lineHeight: 1.12, letterSpacing: '-0.03em', color: '#0c1425', marginBottom: 18 }}>
              Your customer gets the update.
              <br />
              <span style={{ color: '#25D366' }}>You get far fewer calls.</span>
            </h2>
            <p style={{ fontSize: 16, lineHeight: 1.7, color: '#64748b', marginBottom: 28 }}>
              Every time you update a shipment status, your customer gets a WhatsApp message with a tracking link. They can see where the shipment is, what stage it is at and what comes next without asking you first.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                'Messages sent automatically from your workflow',
                'Your business name, not ours',
                'Tracking link included in every update',
                'Works on any phone — no customer app needed',
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: '#334155', fontWeight: 500 }}>
                  <CheckIcon />
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div
              style={{
                width: 320,
                background: '#ECE5DD',
                borderRadius: 24,
                overflow: 'hidden',
                boxShadow: '0 20px 60px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.05)',
                animation: 'float 4s ease-in-out infinite',
              }}
            >
              <div style={{ background: '#075E54', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, color: '#fff' }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#128C7E', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>
                  C44
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>cargo44</div>
                  <div style={{ fontSize: 11, opacity: 0.7 }}>online</div>
                </div>
              </div>
              <div style={{ padding: '16px 12px', minHeight: 320, display: 'flex', flexDirection: 'column', gap: 8, background: '#DAD3CC' }}>
                {WHATSAPP_MESSAGES.slice(0, visibleMessages).map((msg, i) => (
                  <div
                    key={i}
                    style={{
                      alignSelf: msg.type === 'reply' ? 'flex-end' : 'flex-start',
                      maxWidth: '85%',
                      background: msg.type === 'reply' ? '#DCF8C6' : '#fff',
                      padding: '8px 10px 4px',
                      borderRadius: msg.type === 'reply' ? '10px 10px 4px 10px' : '10px 10px 10px 4px',
                      boxShadow: '0 1px 1px rgba(0,0,0,0.08)',
                      animation: 'messageSlide 0.3s ease-out',
                    }}
                  >
                    <div style={{ fontSize: 13, color: '#111', lineHeight: 1.45, wordBreak: 'break-word' }}>{msg.text}</div>
                    <div style={{ fontSize: 10, color: '#667781', textAlign: 'right', marginTop: 2 }}>{msg.time}</div>
                  </div>
                ))}
                {visibleMessages < WHATSAPP_MESSAGES.length && (
                  <div style={{ alignSelf: 'flex-start', background: '#fff', padding: '8px 14px', borderRadius: 12, fontSize: 12, color: '#667781', animation: 'pulse 1s infinite' }}>
                    typing...
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section style={{ padding: '84px 24px', background: '#f6f8ff' }}>
        <div className="split-grid" style={{ maxWidth: 1140, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div
              style={{
                width: 300,
                background: '#fff',
                borderRadius: 24,
                overflow: 'hidden',
                boxShadow: '0 20px 60px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.04)',
                animation: 'float 4s ease-in-out infinite',
                animationDelay: '1s',
              }}
            >
              <div style={{ background: '#f1f5f9', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ display: 'flex', gap: 5 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} />
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} />
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }} />
                </div>
                <div style={{ flex: 1, background: '#fff', borderRadius: 6, padding: '4px 10px', fontSize: 10, color: '#94a3b8' }}>
                  yourcompany.cargo44.com/t/...
                </div>
              </div>

              <div style={{ padding: '16px' }}>
                <div
                  style={{
                    background: 'linear-gradient(135deg, #4338ca 0%, #7c3aed 100%)',
                    borderRadius: 12,
                    padding: '16px',
                    color: '#fff',
                    marginBottom: 10,
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  <div style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
                  <div style={{ fontSize: 9, opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Tracking</div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 800, letterSpacing: 1, marginBottom: 4 }}>SHP-40EMK8</div>
                  <div style={{ fontSize: 12, opacity: 0.85 }}>To Jamaica 🇯🇲</div>
                </div>

                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <span style={{ fontSize: 18 }}>🚢</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#15803d' }}>Departed UK</div>
                    <div style={{ fontSize: 10, color: '#16a34a' }}>On the way to Jamaica</div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 4px', marginBottom: 6 }}>
                  {['📦', '🏗️', '🚢', '🏝️', '🚚', '✅'].map((icon, i) => (
                    <div key={i} style={{ width: 28, height: 28, borderRadius: '50%', background: i <= 2 ? '#4f46e5' : '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: i <= 2 ? 12 : 0 }}>
                      {i <= 2 ? icon : <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#94a3b8' }} />}
                    </div>
                  ))}
                </div>
                <div style={{ height: 3, background: '#e2e8f0', borderRadius: 10, overflow: 'hidden', marginBottom: 12 }}>
                  <div style={{ height: '100%', width: '45%', background: '#4f46e5', borderRadius: 10 }} />
                </div>

                <div style={{ background: '#25D366', borderRadius: 8, padding: '10px', textAlign: 'center', color: '#fff', fontSize: 12, fontWeight: 600 }}>
                  💬 WhatsApp us
                </div>
              </div>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#4f46e5', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
              Your brand, not ours
            </div>
            <h2 className="section-title" style={{ fontSize: 38, fontWeight: 800, lineHeight: 1.12, letterSpacing: '-0.03em', color: '#0c1425', marginBottom: 18 }}>
              A tracking page your customers will actually use
            </h2>
            <p style={{ fontSize: 16, lineHeight: 1.7, color: '#64748b', marginBottom: 28 }}>
              Your company name, your logo and your support number stay front and centre. When customers open the tracking link, they see a professional journey page that reduces doubt and builds trust.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                'Full journey progress so they see what comes next',
                'Your branding and contact details',
                'Works on any phone with no app download',
                'WhatsApp support button built in',
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: '#334155', fontWeight: 500 }}>
                  <CheckIcon />
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="how-it-works" style={{ padding: '84px 24px', background: '#fff' }}>
        <div style={{ maxWidth: 1140, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <h2 className="section-title" style={{ fontSize: 38, fontWeight: 800, letterSpacing: '-0.03em', color: '#0c1425', marginBottom: 12 }}>
              Three steps. That’s it.
            </h2>
            <p style={{ fontSize: 16, color: '#64748b', maxWidth: 580, margin: '0 auto' }}>
              Cargo44 fits the way small shipping operators already work. Book it, update it, let the customer track it.
            </p>
          </div>

          <div className="step-grid">
            {STEPS.map((step, i) => (
              <div key={i} style={{ background: '#f8f9fb', borderRadius: 18, padding: '32px 28px', border: '1px solid #e8eaef' }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>{step.icon}</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 600, color: '#4f46e5', marginBottom: 8 }}>
                  STEP {step.num}
                </div>
                <h3 style={{ fontSize: 20, fontWeight: 700, color: '#0c1425', marginBottom: 8, letterSpacing: '-0.02em' }}>{step.title}</h3>
                <p style={{ fontSize: 14, lineHeight: 1.6, color: '#64748b' }}>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ padding: '84px 24px', background: '#f6f8ff' }}>
        <div style={{ maxWidth: 1140, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <h2 className="section-title" style={{ fontSize: 38, fontWeight: 800, letterSpacing: '-0.03em', color: '#0c1425', marginBottom: 12 }}>
              Built for how you actually work
            </h2>
            <p style={{ fontSize: 16, color: '#64748b', maxWidth: 620, margin: '0 auto' }}>
              Not another generic tracking tool. Cargo44 is built for small shipping operators handling barrels, boxes, personal effects and handoff to destination agents.
            </p>
          </div>

          <div className="feature-grid">
            {FEATURES.map((feature, i) => (
              <div key={i} style={{ background: '#fff', borderRadius: 16, padding: '28px 24px', border: '1px solid #e8eaef' }}>
                <span style={{ fontSize: 32, display: 'block', marginBottom: 14 }}>{feature.icon}</span>
                <h3 style={{ fontSize: 17, fontWeight: 700, color: '#0c1425', marginBottom: 8, letterSpacing: '-0.01em' }}>{feature.title}</h3>
                <p style={{ fontSize: 14, lineHeight: 1.6, color: '#64748b' }}>{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="corridors" style={{ padding: '84px 24px', background: '#fff' }}>
        <div style={{ maxWidth: 1140, margin: '0 auto', textAlign: 'center' }}>
          <h2 className="section-title" style={{ fontSize: 38, fontWeight: 800, letterSpacing: '-0.03em', color: '#0c1425', marginBottom: 12 }}>
            Your corridors. Your workflow.
          </h2>
          <p style={{ fontSize: 16, color: '#64748b', maxWidth: 560, margin: '0 auto 40px' }}>
            Start with the routes you already know. Cargo44 lets you customise status steps per destination instead of forcing every corridor into the same journey.
          </p>

          <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
            {CORRIDORS.map((c, i) => (
              <div
                key={i}
                className="corridor-pill"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '12px 20px',
                  background: '#f8f9fb',
                  border: '1px solid #e8eaef',
                  borderRadius: 50,
                  fontSize: 15,
                  fontWeight: 600,
                  color: '#334155',
                  cursor: 'default',
                  transition: 'all 0.15s ease',
                }}
              >
                <span style={{ fontSize: 22 }}>{c.flag}</span>
                {c.name}
              </div>
            ))}
          </div>

          <p style={{ fontSize: 14, color: '#94a3b8' }}>
            Starting in the UK or US today? Good. Expanding later? Cargo44 can grow with that too.
          </p>
        </div>
      </section>

      <section
        style={{
          padding: '84px 24px',
          background: '#0c1425',
          color: '#fff',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ position: 'absolute', top: -60, left: '30%', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(79,70,229,0.15) 0%, transparent 70%)' }} />
        <div style={{ maxWidth: 640, margin: '0 auto', position: 'relative' }}>
          <h2 className="section-title" style={{ fontSize: 42, fontWeight: 900, lineHeight: 1.08, letterSpacing: '-0.03em', marginBottom: 18 }}>
            Start free.
            <br />
            Prove it on your next 10 shipments.
          </h2>
          <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.68)', marginBottom: 32, lineHeight: 1.6 }}>
            No card needed. Set up fast. Send the first updates, share the tracking link and see whether the customer questions drop.
          </p>

          <a
            href="/signup"
            className="cta-link"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '16px 40px',
              background: '#fff',
              color: '#0c1425',
              borderRadius: 12,
              fontSize: 16,
              fontWeight: 700,
              textDecoration: 'none',
              boxShadow: '0 4px 20px rgba(255,255,255,0.15)',
            }}
          >
            Start free now
            <ArrowIcon />
          </a>

          <div style={{ marginTop: 24, display: 'flex', justifyContent: 'center', gap: 20, flexWrap: 'wrap', fontSize: 13, color: 'rgba(255,255,255,0.44)' }}>
            <span>No credit card</span>
            <span>·</span>
            <span>10 shipments/month free</span>
            <span>·</span>
            <span>Branded tracking included</span>
          </div>
        </div>
      </section>

      <footer style={{ padding: '40px 24px', background: '#080e1a', textAlign: 'center' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg?v=4" alt="Cargo44" style={{ height: 36, width: 'auto', opacity: 0.7, marginBottom: 12 }} />
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>
          Software for small shipping operators serving Caribbean and African routes
        </div>
      </footer>
    </div>
  );
}

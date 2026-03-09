import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { isTwilioConfigured, normalizeE164Phone, twilioSendWhatsApp } from '@/lib/whatsapp/twilio';
import { getBaseUrlFromHeaders } from '@/lib/http/base-url';
import { blockIfAgentMode } from '@/lib/auth/block-agent-mode';
import { canUseAgentPortal } from '@/lib/billing/plan';

function digitsOnly(s: string) {
  return String(s ?? '').replace(/\D/g, '');
}

function makeAgentEmail(orgId: string, phoneE164: string) {
  const slug = String(orgId).slice(0, 8);
  const digits = digitsOnly(phoneE164);
  return `agent+${slug}.${digits}@agents.cargopulse.local`;
}

export async function POST(req: Request) {
      const blocked = await blockIfAgentMode();
      if (blocked) return blocked;
  const supabase = await createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const agentName = String(body?.name ?? '').trim();
  const agentPhone = String(body?.phone ?? '').trim();
  const phoneCountry = String(body?.phoneCountry ?? 'GB').trim().toUpperCase();
  const destinationId = String(body?.destinationId ?? '').trim();
  const agentEmailInput = body?.email == null ? null : String(body.email).trim();

  if (agentName.length < 2) return NextResponse.json({ error: 'name is required' }, { status: 400 });
  if (!destinationId) return NextResponse.json({ error: 'destinationId is required' }, { status: 400 });

  const agentPhoneE164 = normalizeE164Phone(agentPhone, { defaultCountry: phoneCountry as any });
  if (!agentPhoneE164) return NextResponse.json({ error: 'phone must be valid (E.164)' }, { status: 400 });

  // requester membership + role
  const { data: member, error: memErr } = await supabase
    .from('org_members')
    .select('org_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (memErr) return NextResponse.json({ error: memErr.message }, { status: 400 });
  if (!member?.org_id) return NextResponse.json({ error: 'No org membership' }, { status: 403 });

  const role = String(member.role ?? 'staff');
  const allow = role === 'admin' || role === 'staff';
  if (!allow) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: billing } = await supabase
    .from('organization_billing')
    .select('status, plan_tier')
    .eq('org_id', member.org_id)
    .maybeSingle();

  if (!canUseAgentPortal(billing)) {
    return NextResponse.json({ error: 'agent_portal_upgrade_required' }, { status: 403 });
  }

  const orgId = String(member.org_id);
  const agentEmail = agentEmailInput && agentEmailInput.includes('@')
    ? agentEmailInput
    : makeAgentEmail(orgId, agentPhoneE164);

  const admin = createSupabaseAdminClient();

  // Expire any existing pending invites for this agent email so their tokens
  // don't linger after generateLink creates a new one (which invalidates the old).
  await admin
    .from('org_agent_invites')
    .update({ status: 'expired' })
    .eq('org_id', orgId)
    .eq('agent_email', agentEmail)
    .eq('status', 'pending');

  // Generate magic link token_hash (PKCE-friendly approach uses verifyOtp)
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: agentEmail,
  });

  if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 400 });

  const tokenHash =
    (linkData as any)?.properties?.hashed_token ||
    (linkData as any)?.properties?.hashedToken ||
    (linkData as any)?.properties?.token_hash ||
    null;

  if (!tokenHash) return NextResponse.json({ error: 'Failed to generate token hash' }, { status: 500 });

  // Create invite row
  const { data: invite, error: invErr } = await admin
    .from('org_agent_invites')
    .insert({
      org_id: orgId,
      destination_id: destinationId,
      agent_name: agentName,
      agent_phone_e164: agentPhoneE164,
      agent_email: agentEmail,
      token_hash: tokenHash,
      status: 'pending',
      created_by: user.id,
    })
    .select('id')
    .single();

  if (invErr) return NextResponse.json({ error: invErr.message }, { status: 400 });

  const baseUrl =
    (process.env.APP_URL ? process.env.APP_URL.replace(/\/$/, '') : null) ??
    getBaseUrlFromHeaders(req.headers);

  if (!baseUrl) {
    return NextResponse.json({ error: 'Server misconfiguration: APP_URL is not configured' }, { status: 500 });
  }

  const inviteUrl = `${baseUrl}/auth/confirm?` + new URLSearchParams({
  token_hash: tokenHash,
  type: 'magiclink',
  next: '/agent',
  invite: invite.id,
}).toString();

  // Send via WhatsApp (or return for manual copy)
  if (isTwilioConfigured()) {
    try {
      await twilioSendWhatsApp({
        toE164: agentPhoneE164,
        body: `CargoPulse Agent Access\n\nHi ${agentName}, tap to open your destination portal:\n${inviteUrl}`,
      });
      return NextResponse.json({ ok: true, mode: 'sent', inviteUrl });
    } catch (e: any) {
      // Don’t lose the link if Twilio fails
      return NextResponse.json({ ok: true, mode: 'copy', inviteUrl, warn: e?.message ?? 'WhatsApp send failed' });
    }
  }

  return NextResponse.json({ ok: true, mode: 'copy', inviteUrl });
}
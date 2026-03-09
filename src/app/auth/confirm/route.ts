import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getBaseUrlFromHeaders } from '@/lib/http/base-url';

function safeNextPath(v: string) {
  const s = String(v ?? '').trim();
  return s.startsWith('/') ? s : '/agent';
}

export async function GET(req: Request) {
  const url = new URL(req.url);

  // Use APP_URL or forwarded headers (dev/prod safe)
  const baseUrl =
    (process.env.APP_URL ? process.env.APP_URL.replace(/\/$/, '') : null) ??
    getBaseUrlFromHeaders(req.headers);

  const token_hash = String(url.searchParams.get('token_hash') ?? '').trim();
  const type = String(url.searchParams.get('type') ?? 'magiclink').trim();
  const next = safeNextPath(String(url.searchParams.get('next') ?? '/agent'));
  const inviteId = String(url.searchParams.get('invite') ?? '').trim();

  if (!token_hash) {
    return NextResponse.redirect(new URL('/login?error=missing_token', baseUrl));
  }

  const supabase = await createSupabaseServerClient();

  const { error: verifyErr } = await supabase.auth.verifyOtp({
    token_hash,
    type: type as any,
  });

  if (verifyErr) {
    const msg = /expired|invalid/i.test(verifyErr.message)
      ? 'This invite link has expired or has already been used. Ask your admin to send a new one.'
      : verifyErr.message;
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(msg)}`, baseUrl)
    );
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL('/login?error=no_user', baseUrl));
  }

  let agentMode = false;

  if (inviteId) {
    const admin = createSupabaseAdminClient();

    const { data: invite, error: invErr } = await admin
      .from('org_agent_invites')
      .select('id, org_id, destination_id, status, expires_at, token_hash')
      .eq('id', inviteId)
      .maybeSingle();

    if (invErr) {
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(invErr.message)}`, baseUrl)
      );
    }

    if (invite) {
      const expired = invite.expires_at && new Date(invite.expires_at).getTime() < Date.now();
      const tokenMatches = String(invite.token_hash ?? '') === token_hash;

      if (expired) {
        await admin.from('org_agent_invites').update({ status: 'expired' }).eq('id', invite.id);
        return NextResponse.redirect(
          new URL(`/login?error=${encodeURIComponent('Your invite link has expired. Ask your admin to send a new one.')}`, baseUrl)
        );
      } else if (tokenMatches && invite.status === 'pending') {
        // IMPORTANT: do NOT "upsert" role=agent into org_members (could overwrite staff/admin).
        // Insert membership if missing; ignore duplicate.
        const { error: insMemErr } = await admin
          .from('org_members')
          .insert({ org_id: invite.org_id, user_id: user.id, role: 'agent' });

        // duplicate key -> ignore
        if (insMemErr && (insMemErr as any).code !== '23505') {
          return NextResponse.redirect(
            new URL(`/login?error=${encodeURIComponent(insMemErr.message)}`, baseUrl)
          );
        }

        // Scope: upsert is correct (composite PK)
        const { error: scopeErr } = await admin.from('org_agent_scopes').upsert(
          { org_id: invite.org_id, user_id: user.id, destination_id: invite.destination_id },
          { onConflict: 'org_id,user_id,destination_id' }
        );

        if (scopeErr) {
          return NextResponse.redirect(
            new URL(`/login?error=${encodeURIComponent(scopeErr.message)}`, baseUrl)
          );
        }

        await admin
          .from('org_agent_invites')
          .update({
            status: 'accepted',
            accepted_at: new Date().toISOString(),
            accepted_user_id: user.id,
          })
          .eq('id', invite.id);

        agentMode = true;
        // Note: a re-click of this link will fail at verifyOtp (token is one-time-use),
        // so the 'accepted' status is never reached via this code path.
      }
    } else {
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent('Invalid invite link. Ask your admin to send a new one.')}`, baseUrl)
      );
    }
  }

  const resp = NextResponse.redirect(new URL(next, baseUrl));

  if (agentMode) {
    resp.cookies.set('cp_mode', 'agent', {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      maxAge: 60 * 60 * 24 * 60, // 60 days
    });
  }

  return resp;
}
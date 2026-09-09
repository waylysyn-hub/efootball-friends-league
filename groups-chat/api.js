/** Groups Chat — Supabase API */

let _chatClient = null;

function chatClient() {
  if (
    typeof SUPABASE_CONFIG === 'undefined' ||
    !SUPABASE_CONFIG.url ||
    SUPABASE_CONFIG.url === 'YOUR_SUPABASE_URL' ||
    !window.supabase
  ) {
    return null;
  }
  if (!_chatClient) {
    _chatClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
  }
  return _chatClient;
}

async function chatFetchPlayers() {
  const sb = chatClient();
  if (!sb) return [];
  const { data, error } = await sb.from('players').select('name').order('name');
  if (error) throw error;
  return data || [];
}

async function chatLogin(username, password) {
  const sb = chatClient();
  if (!sb) return null;
  try {
    const profile = await EFLAuth.signIn(sb, username, password);
    return profile?.name || null;
  } catch (_) {
    return null;
  }
}

async function chatFetchGroups(player) {
  const sb = chatClient();
  if (!sb) return [];

  const { data: memberships, error } = await sb
    .from('chat_group_members')
    .select('group_id, chat_groups(id, name, emoji, description, palette_index, created_by, created_at)')
    .eq('player', player);

  if (error) throw error;

  const groups = (memberships || []).map((m) => m.chat_groups).filter(Boolean);
  return Promise.all(
    groups.map(async (g) => {
      const { count, error: countError } = await sb
        .from('chat_group_members')
        .select('group_id', { count: 'exact', head: true })
        .eq('group_id', g.id);
      if (countError) throw countError;
      return { ...g, members: count || 0 };
    })
  );
}

async function chatFetchMessages(groupId) {
  const sb = chatClient();
  if (!sb) return [];
  const { data, error } = await sb
    .from('chat_messages')
    .select('id, author, body, created_at')
    .eq('group_id', groupId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function chatSendMessage(groupId, author, body) {
  const sb = chatClient();
  if (!sb) throw new Error('Not configured');
  const clean = String(body || '').trim();
  if (!clean) return;
  const { error } = await sb.from('chat_messages').insert({ group_id: groupId, author, body: clean });
  if (error) throw error;
}

async function chatFetchInvitations(player) {
  const sb = chatClient();
  if (!sb) return [];
  const { data, error } = await sb
    .from('chat_invitations')
    .select('id, group_id, invited_by, chat_groups(name, emoji, palette_index)')
    .eq('invited_player', player)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function chatRespondInvite(inviteId, accepted) {
  const sb = chatClient();
  if (!sb) throw new Error('Not configured');

  const { data: invite, error: fetchErr } = await sb
    .from('chat_invitations')
    .select('id, group_id, invited_player, status')
    .eq('id', inviteId)
    .maybeSingle();
  if (fetchErr || !invite) throw fetchErr || new Error('Invite not found');

  const { error: updErr } = await sb
    .from('chat_invitations')
    .update({ status: accepted ? 'accepted' : 'rejected' })
    .eq('id', inviteId);
  if (updErr) throw updErr;

  if (accepted) {
    const { error: memErr } = await sb
      .from('chat_group_members')
      .upsert({ group_id: invite.group_id, player: invite.invited_player }, { onConflict: 'group_id,player' });
    if (memErr) throw memErr;
  }
}

async function chatCreateGroup(name, description, emoji, paletteIndex, createdBy) {
  const sb = chatClient();
  if (!sb) throw new Error('Not configured');

  const { data: group, error: gErr } = await sb
    .from('chat_groups')
    .insert({
      name: String(name || '').trim(),
      description: String(description || '').trim(),
      emoji: emoji || '⚽',
      palette_index: paletteIndex,
      created_by: createdBy,
    })
    .select('id, name, emoji, description, palette_index, created_by, created_at')
    .single();
  if (gErr) throw gErr;

  const { error: mErr } = await sb
    .from('chat_group_members')
    .insert({ group_id: group.id, player: createdBy });
  if (mErr) {
    await sb.from('chat_groups').delete().eq('id', group.id);
    throw mErr;
  }
  return group;
}

async function chatInvitePlayer(groupId, invitedPlayer, invitedBy) {
  const sb = chatClient();
  if (!sb) throw new Error('Not configured');
  const { error } = await sb.from('chat_invitations').insert({
    group_id: groupId,
    invited_player: invitedPlayer,
    invited_by: invitedBy,
    status: 'pending',
  });
  if (error) throw error;
}

async function chatFetchRoster(excludePlayer) {
  const sb = chatClient();
  if (!sb) return [];
  const { data, error } = await sb.from('players').select('name').neq('name', excludePlayer).order('name');
  if (error) throw error;
  return (data || []).map((p) => p.name);
}

function chatSubscribeMessages(groupId, onMessage) {
  const sb = chatClient();
  if (!sb || !groupId) return null;
  return sb
    .channel(`chat-${groupId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `group_id=eq.${groupId}` },
      (payload) => onMessage(payload.new)
    )
    .subscribe();
}

function chatUnsubscribe(channel) {
  const sb = chatClient();
  if (sb && channel) sb.removeChannel(channel);
}

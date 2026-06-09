/** Groups Chat — Supabase API */

function chatClient() {
  if (
    typeof SUPABASE_CONFIG === 'undefined' ||
    !SUPABASE_CONFIG.url ||
    SUPABASE_CONFIG.url === 'YOUR_SUPABASE_URL' ||
    !window.supabase
  ) {
    return null;
  }
  return window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
}

async function chatFetchPlayers() {
  const sb = chatClient();
  if (!sb) return [];
  const { data, error } = await sb.from('players').select('name, password').order('name');
  if (error) throw error;
  return data || [];
}

async function chatLogin(username, password) {
  const sb = chatClient();
  if (!sb) return null;
  const { data, error } = await sb.from('players').select('name, password').eq('name', username).maybeSingle();
  if (error || !data || data.password !== password) return null;
  return data.name;
}

async function chatFetchGroups(player) {
  const sb = chatClient();
  if (!sb) return [];

  const { data: memberships, error } = await sb
    .from('chat_group_members')
    .select('group_id, chat_groups(id, name, emoji, description, palette_index, created_by, created_at)')
    .eq('player', player);

  if (error) throw error;

  const groups = (memberships || [])
    .map((m) => m.chat_groups)
    .filter(Boolean);

  const withCounts = await Promise.all(
    groups.map(async (g) => {
      const { count } = await sb
        .from('chat_group_members')
        .select('*', { count: 'exact', head: true })
        .eq('group_id', g.id);
      return { ...g, members: count || 0 };
    })
  );

  return withCounts;
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
  const { error } = await sb.from('chat_messages').insert({ group_id: groupId, author, body: body.trim() });
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
      name: name.trim(),
      description: description.trim(),
      emoji: emoji || '⚽',
      palette_index: paletteIndex,
      created_by: createdBy,
    })
    .select()
    .single();
  if (gErr) throw gErr;

  const { error: mErr } = await sb
    .from('chat_group_members')
    .insert({ group_id: group.id, player: createdBy });
  if (mErr) throw mErr;

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

  const sb = chatClient();
  if (!sb || !groupId) return null;

  const channel = sb
    .channel(`chat-${groupId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `group_id=eq.${groupId}` },
      (payload) => onMessage(payload.new)
    )
    .subscribe();

  return channel;
}

function chatUnsubscribe(channel) {
  const sb = chatClient();
  if (sb && channel) sb.removeChannel(channel);
}

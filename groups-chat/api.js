/** Groups Chat — Supabase API */

export function chatClient() { return window.EFLClient?.get() || null; }

export async function chatFetchPlayers() {
  const sb = chatClient();
  if (!sb) return [];
  const { data, error } = await sb.from('players').select('name').order('name');
  if (error) throw error;
  return data || [];
}

export async function chatLogin(username, password) {
  const profile = await window.EFLAuth.signIn(chatClient(), username, password);
  return profile.name;
 }

export async function chatFetchGroups(player) {
  const sb = chatClient();
  const { data, error } = await sb.from('chat_group_members')
    .select('group_id, chat_groups(id, name, emoji, description, palette_index, created_by, created_at)').eq('player', player);
  if (error) throw error;
  const groups = (data || []).map(row => row.chat_groups).filter(Boolean);
  if (!groups.length) return [];
  const { data: members, error: memberError } = await sb.from('chat_group_members').select('group_id, player').in('group_id', groups.map(group => group.id));
  if (memberError) throw memberError;
  return groups.map(group => ({ ...group, members: (members || []).filter(member => member.group_id === group.id).length,
    memberNames: (members || []).filter(member => member.group_id === group.id).map(member => member.player) }));
 }

export async function chatFetchMessages(groupId, before = null) {
  let query = chatClient().from('chat_messages').select('id, group_id, author, body, created_at')
    .eq('group_id', groupId).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(100);
  if (before) query = query.or('created_at.lt.' + before.created_at + ',and(created_at.eq.' + before.created_at + ',id.lt.' + before.id + ')');
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).reverse();
 }

export async function chatSendMessage(groupId, author, body, id) {
  const clean = String(body || '').trim();
  if (!clean || clean.length > 4000) throw new Error('Enter a message up to 4,000 characters.');
  const sb = chatClient();
  const { data, error } = await sb.from('chat_messages').insert({ id, group_id: groupId, author, body: clean }).select('id, group_id, author, body, created_at').single();
  if (error?.code === '23505') {
    const existing = await sb.from('chat_messages').select('id, group_id, author, body, created_at').eq('id', id).single();
    if (existing.error || existing.data?.body !== clean || existing.data?.group_id !== groupId) throw error;
    return existing.data;
  }
  if (error) throw error;
  return data;
 }

export async function chatFetchInvitations(player) {
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

export async function chatRespondInvite(inviteId, accepted) {
  const { error } = await chatClient().rpc('respond_chat_invitation', { invitation_id: inviteId, accept: accepted });
  if (error) throw error;
 }

export async function chatCreateGroup(name, description, emoji, paletteIndex, createdBy, id) {
  const { data, error } = await chatClient().rpc('create_league_chat_group', {
    group_id: id, group_name: name.trim(), group_description: description.trim(), group_emoji: emoji || '⚽', palette: paletteIndex,
  });
  if (error) throw error;
  return data;
 }

export async function chatInvitePlayer(groupId, invitedPlayer, invitedBy) {
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

export async function chatFetchRoster(excludePlayer) {
  const sb = chatClient();
  if (!sb) return [];
  const { data, error } = await sb.from('players').select('name').neq('name', excludePlayer).order('name');
  if (error) throw error;
  return (data || []).map((p) => p.name);
}

export function chatSubscribeMessages(groupId, onMessage) {
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

export function chatUnsubscribe(channel) {
  const sb = chatClient();
  if (sb && channel) sb.removeChannel(channel);
}

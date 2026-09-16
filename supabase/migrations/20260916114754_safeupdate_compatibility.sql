-- Repair existing installations without executing any competition operation.
-- Keep each function's owner, privileges, security mode and other SQL unchanged.
-- Supabase's authenticator preloads pg-safeupdate, including inside triggers.
begin;
do $migration$
declare
  patch record;
  definition text;
begin
  for patch in
    select * from (values
      ('private.refresh_league_standings()',
       'delete from public.standings;',
       'delete from public.standings where player is not null;'),
      ('private.refresh_league_achievements()',
       'delete from public.achievements;',
       'delete from public.achievements where player is not null;'),
      ('public.restore_league_competition(jsonb)',
       'delete from public.matches;',
       'delete from public.matches where id is not null;'),
      ('public.restore_league_competition(jsonb)',
       'delete from public.seasons;',
       'delete from public.seasons where id is not null;')
    ) as patches(signature, old_statement, new_statement)
  loop
    select pg_get_functiondef(patch.signature::regprocedure) into definition;
    if position(patch.old_statement in definition) > 0 then
      execute replace(definition, patch.old_statement, patch.new_statement);
    elsif position(patch.new_statement in definition) = 0 then
      raise exception 'Unexpected definition for %; inspect before applying this migration', patch.signature;
    end if;
  end loop;
end;
$migration$;
commit;

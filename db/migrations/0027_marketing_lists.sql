-- Listas de contactos de email marketing.
--
-- Los segmentos (0022) los decide la base según lo que hizo cada cliente. Las
-- listas son lo contrario: las arma una persona a mano, pegando emails desde el
-- panel ("Día de la Madre", "Feria de octubre"…), para mandarle a ese grupo y
-- solo a ese grupo.
--
-- Un contacto que entra **nuevo** por una lista queda fuera de la lista
-- general (`in_general = false`): no recibe las campañas a "Todos los
-- suscriptos", solo las de sus listas. Uno que ya estaba en la general y se
-- suma a una lista sigue en la general: no se le saca nada a nadie que ya
-- estaba recibiendo.

alter table marketing_contacts
  add column lists      text[]  not null default '{}',
  add column in_general boolean not null default true;

create index marketing_contacts_lists_idx on marketing_contacts using gin (lists);

grant update (lists, in_general) on marketing_contacts to authenticated;

-- A quién va una campaña: todos (los dos NULL), un segmento o una lista.
alter table marketing_campaigns
  add column list text,
  add constraint marketing_campaigns_un_destino
    check (segment is null or list is null);

grant insert (list) on marketing_campaigns to authenticated;
grant update (list) on marketing_campaigns to authenticated;

-- ---------------------------------------------------------------------------
-- Alta de contactos, con lista opcional
-- ---------------------------------------------------------------------------
--
-- Va por función y no por upsert desde el panel porque a los que ya existen
-- hay que sumarles la lista sin pisar las que tenían, y eso es un
-- array_append que PostgREST no sabe expresar.
--
-- Los que ya existen no se tocan en nada más: ni se resuscriben si se dieron
-- de baja ni cambian su `in_general`.

create or replace function marketing_add_contacts(p_emails text[], p_list text default null)
returns table (inserted integer, tagged integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_list text := nullif(btrim(p_list), '');
  v_emails citext[];
  v_ins integer;
  v_tag integer := 0;
begin
  if not is_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct lower(btrim(e))::citext), '{}')
    into v_emails
    from unnest(p_emails) e
   where btrim(e) <> '';

  with nuevos as (
    insert into marketing_contacts (email, source, lists, in_general)
    select e,
           'manual',
           case when v_list is null then '{}'::text[] else array[v_list] end,
           v_list is null
      from unnest(v_emails) e
    on conflict (email) do nothing
    returning 1
  )
  select count(*) into v_ins from nuevos;

  -- Los recién insertados ya traen la lista, así que acá solo entran los que
  -- existían de antes.
  if v_list is not null then
    update marketing_contacts
       set lists = array_append(lists, v_list)
     where email = any (v_emails)
       and not (v_list = any (lists));
    get diagnostics v_tag = row_count;
  end if;

  return query select v_ins, v_tag;
end;
$$;

revoke all on function marketing_add_contacts(text[], text) from public, anon;
grant execute on function marketing_add_contacts(text[], text) to authenticated;

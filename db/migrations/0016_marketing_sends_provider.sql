-- Por qué proveedor salió cada mail de campaña.
--
-- El marketing sale por Unitpost y usa Resend solo como desborde. Cada uno
-- tiene su propia cuota gratuita, así que marketing-send y el panel cuentan los
-- envíos del día (y del mes, en Unitpost) por proveedor.
--
-- Todo lo enviado antes de esta migración salió por Resend.

alter table marketing_sends
  add column provider text not null default 'resend'
    check (provider in ('resend', 'unitpost'));

alter table marketing_sends alter column provider drop default;

create index marketing_sends_cuota_idx on marketing_sends (provider, created_at)
  where status = 'sent';

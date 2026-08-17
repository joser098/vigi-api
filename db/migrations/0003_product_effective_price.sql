-- The discounted price used to be computed in JS after Postgres had already
-- sorted, so "order by price" ranked by list price while the UI showed the
-- discounted one. As a stored generated column it is both consistent and
-- indexable, so sorting matches what the customer sees.
--
-- The 1..50 bound and the truncation reproduce the old JS rule exactly:
-- a discount outside that range was ignored, and the result went through
-- parseInt.

alter table products
  add column effective_price numeric(12,2)
    generated always as (
      case
        when has_promotion and discount between 1 and 50
        then floor(price - (price * discount / 100.0))
        else price
      end
    ) stored;

-- Replaces the index on the raw price: promotion listings sort by what is shown.
drop index if exists products_promotion_idx;

create index products_effective_price_idx
  on products (effective_price) where is_active;

create index products_promotion_idx
  on products (effective_price) where is_active and has_promotion;

-- New catalogue uploads use bounded WebP. Existing PNG objects and immutable
-- integrity/ownership metadata are retained; no photograph bytes are rewritten.
update storage.buckets set allowed_mime_types=array['image/png','image/webp'] where id='pinevela-media';
do $$ declare item record; begin
  for item in select conname from pg_constraint where conrelid='public.media_assets'::regclass
    and contype='c' and position('object_path' in pg_get_constraintdef(oid))>0 loop
    execute format('alter table public.media_assets drop constraint %I',item.conname);
  end loop;
end $$;
alter table public.media_assets add constraint media_owned_raster_path check (
  object_path='contexts/'||owner_context_id::text||'/'||id::text||'.png'
  or purpose in ('market','hostel') and object_path='contexts/'||owner_context_id::text||'/'||id::text||'.webp'
);
-- A blocked WebP remains the exact moderated bytes in the private quarantine.
do $$ declare item record; begin
  for item in select conname from pg_constraint where conrelid='private.content_safety_checks'::regclass
    and contype='c' and position('image_path =' in pg_get_constraintdef(oid))>0 loop
    execute format('alter table private.content_safety_checks drop constraint %I',item.conname);
  end loop;
end $$;
alter table private.content_safety_checks add constraint content_safety_quarantine_path check (
  (verdict='approved' and ticket_id is null and image_path is null) or
  (verdict<>'approved' and ticket_id is not null and (purpose in ('listing_text','store_text') or
    image_path is not null and (image_path='contexts/'||owner_context_id::text||'/'||id::text||'.png' or
      purpose='market_image' and image_path='contexts/'||owner_context_id::text||'/'||id::text||'.webp')))
);

-- PineVela device push. Existing project: bivajljcdeofyxzmplxm.
-- Additive private delivery tables only; no users are subscribed automatically.
begin;
set local lock_timeout='5s';
set local statement_timeout='45s';
select pg_advisory_xact_lock(hashtextextended('pinevela-schema-migrations',0));
do $pinevela_push_migration$
begin
 if exists(select 1 from(values ('20261008210000','b69ab22623709496aa4b1b3cc2d8f7d1af64374ed1efb3da69601a4a7ef74c2e'),
('20261008210100','d5a652b7c9598351abbd09f7a5ab4103a22d46cdc5fc644e6709dd1eab009883'),
('20261008210200','8d81b4733265c5d6649a59d1f7794af9903eb0a1322ef29ee5331a4ed0bf98d1'),
('20261008210300','d8dd2ffb500e4c1f78978ea660e9d30d2adef7823bbc5640a9c9173f1b35faff'),
('20261008210400','ca2b49fc463299497ec8ce2dbbd863d2169a4d971dd173a2ffe525c4389cfbaa'),
('20261009010000','a2a1a306db6f20ccb5095038a38c1ff472310f414159555803597f88f802e45f'),
('20261009020000','beb776ff10ce732a122ce87f985ecddf94f9793f2aa911e275be17aaf26f5124'),
('20261009030000','92c9df1037d5cd7b0e90644eb27ce9f3dc4e5a612d28e59d3fa232a96eeba020'),
('20261009040000','6c72e7c3388d375574ec25275bd9081d39583b508553b747518d66a7e4d41403'),
('20261009050000','26de7d772a3947522512be14be933a001a7ad068188214151bd7b8a880c6c748'),
('20261009060000','951be3109a1529403238a4696dd42a1ff30b50fd775a73aa9a522acad27c2a91'),
('20261009070000','433d1f639521f3f34e97958ff928f8d761a34a93cc7220dc2f2c269d8b1655e1'),
('20261009080000','232ac2905d47d07a5efdaee3f5e91772312aaed7a146f3f99bb179f01a2f80c0'),
('20261009090000','57346627e3146fea21b8221f85b4c3c4361fca58d8e46e438d79aca550b2b4a1'),
('20261009100000','467c626570266dbbce6d932696a98090a637bbcdff9b79207402644c90ccf83c'),
('20261009110000','73d625e4cbd32f2b2965ce97ff11e569c049215c89538964ccbe69af1ffec15a'),
('20261009120000','cd361ae68c0c791103ebea61b496cefed6ede63f2037c65d4fa71445954adaeb'),
('20261009130000','b503f0ec9caf552137398d8829dd61f861159e6038b3e4f5b6e06de3a3480175'),
('20261009140000','c74b64296f3634c76626f7bb9682748afe3ef0845b34ef0b0ba7abc8f93bf440'),
('20261009150000','0b5c244d46e21aa6b788f1eddfc572bfc88da3bc45f48f1d9341c57a9bf0e064'),
('20261009160000','7550033012cc3c94434b9d35962b7add20920e1946562fe6ca14d6320a4db7b3'),
('20261009170000','06c5c68d152541a8e07bd75c36ab4889bd5bb9fb5f3af6b5c517be39ceaef583'),
('20261009180000','1d036ee59041e2cb72f98ed1311b042b778e640565f9e6b23327be0a83ab6310'),
('20261009190000','7e225a85d55bbf9ada22cffd1ca44be34f632ca1685d5dd4f352c613cb87441d'),
('20261009200000','a97645a5c870cb4a82674485a1ccc3b459a42fb6975bf61dab426da0cd7828fd'),
('20261009210000','83543741b0672081cffc65eb2a2d468c79eab05ddacac6436b1852c787f3c674'),
('20261009220000','0a920eb05aade0d11608560b0792eccdbbd888a256a2020946ccad94027136ef'),
('20261009230000','877bf2474922ee4509f360535cc8d5e628cb00ee4fc99c16b52452adb5c73722'),
('20261010000000','ac88547c6c4e9ed9b1240c23bb7b89643914522d5ad888857e1d1bc12ae21cc5'),
('20261010085040','b532ed2236c72cdaeae94a656e5fbfb2d494e19c5302876cddd2ff5bc9b92fbc'),
('20261010093754','48ad5bb858467607e6c3b7ea85a604ca33129e9c702eba0e79bf9c5a254d3b95'),
('20261010101652','ca80dc58e716fb62cf588f79e4667d9ceb34b6c676c29b90c489048d5950e33f'),
('20261010104743','96c1225b295f23ee86f0b605b09f9a9b88c24e302d20e16ac62dd43dc769415c'),
('20261010205649','ffab54690340d382efdf7c43e8839cf8afac6d55e793de9f3539e5e5d1a28657'),
('20261010211348','aa523ec3fe0d140136ff53b7c913fe08f18de5cabcbecd6f81d5ff8dfb874483'),
('20261010214210','ef72b68bdeb5e2e9141a41b4737c2ed4b561b09a881511d747f4c77dd7360b28'),
('20261010221033','ad237685fcab79c9813374ff0bbd789f8125b3dd1de2d61486cc4c325d5935fe'),
('20261011090324','da63542bc46ebbf0d643e1afd2064c96cb0daf9e13459905d63d92d816ae7b92'),
('20261011094816','9b70842eb988eabc8e7df20a91365866166afe40b3e52b0dd66baabcac87e499'),
('20261011102521','9afc5b7e63670ac6cdd673817646f74790d67cc5a1990a0fe23b85ab39ca2e47'),
('20261011135519','a66e65414143a101b3da298a5c85b3dc4952c41e64c93d4720179822ed2cd3df'),
('20261011144214','c5180871fe9e49991a245d497b02144726ac1f7d3051af6e8613831b9dbe9a9a'),
('20261011151137','aa830d282a96827b5dca413c103ef3f4f8c2e78d346fcadee7c601b77251ec2d'),
('20261011154424','4ac8b48fcf0e1b54bd23609909ff59fcb424e52bbaeff4c779c3b655d26ddae2'),
('20261011161535','c801fe1189745b7396a3675d770eb6aa4468bda3910397c25e6b09357ba45c6e'),
('20261011192711','ca3a6cb24a32acfe38486994d7091807fe002a7acc626b1d281bf6f08f962912'),
('20261011210451','b7c3db28b3ba98639db3615861afd864f748075c696d0ec8bb6a39b489f262ed'),
('20261011214244','9d04c0df2e27e1c35ed1b01533599c37ab037229f70c14a63e6c66583f964555'),
('20261012002204','d41bf1a9c47b96277cba187f120a4383cc5763bbf7afc7b6c8643b28867eea39'),
('20261012014440','4d271d73efd19a494cff1e1efd208557c2258c259d88825e82ec747bf2b923cc'),
('20261012111921','427b9886f70ee6668e46c6d909b4960f21640c1da18918c5352c0bf83ae91082'),
('20261012145716','8bc1dd044e10a443a431173a289f7ff75524c039b01f0140e6063e4438c13c96'),
('20261012204936','6f909673f21c80df1ecdcce6ea572c241b9b3f479cc56f450d5baf24789d449a'),
('20261012212513','2f5e85b3b51e59fec7d5a1c37e46ecfc3eff901ba950338b1863ffb9efafa510'),
('20261012222431','ea2b0aa00ec131fcbcdf4acfb1abc61746458fdcd4f8ccf1301b1dde445f78b6'),
('20261012225934','9af20ae7a8a16731f0da6ed9a4be9be2b7b40074a2f349c80925c1f2a4ce2426'),
('20261012232559','9e1510e10f6eed98d5002af3004313c10e874625870ab0806183870bb0fdc497'),
('20261012235439','66965e69ca4c7345f0fdb6db892175c4d050a3c20da257acb5877736887d6733'),
('20261013003111','ef11f593573656fcf9c8b162fc263d4010dc7c35da9ef13f4de1ccf41c9dfe5d'),
('20261013081232','f24ccf0edf886a940306b186f054020d73b1324754f75f4f64a9cb187c2ce54b'),
('20261013093354','f593414de9f2753211dfe3eeedbb4aaa806ede619d9a323d6201d3f1bc6651ff'),
('20261013104625','b3044dce90588ba142a02f4ce97a3d8174b16c619773ea7d7166e43b659037df'),
('20261013112009','1299892c4f6f2df6748939e1e4b5f1f230b59d0c94103d825f3b6b21c276a925'),
('20261013122231','cb2f4fbbf3f1b79f9eaa00c67d11188cfeaa36726b307b609365778d6ded28bc'),
('20261013233045','c84c9ff45b06873fc3fdcf244c7b3dc1b3b104598c8305dc928465ad3d58c86f'),
('20261014002629','76a7cd38a2159bdbdc31bc23cd75b0eeeefdd13c62395b4c98528cf1c9229a36'),
('20261014084050','5f9fa0a0610d6823cd3dc0b9ec11d924fdfe4ee5c2059f90a539b391c5f758f7'),
('20261014131638','7310f7e173bc3d114027e37c8c03832c522757b86fc36f892b3fc1a68e7a03c2'),
('20261014150839','9966ba676d9ad019b44c36e77a18beeedd802c54cf3b39b4404ca70bab716fa5'),
('20261017133104','d679d68a12aca47dc600a1da1e528d52b39d8a6faeeb98dee1949e123c9dd839'),
('20261017210628','77bae6045e4f0cda532a4526ca4086b18c9b35b40b806fe4c4f76294c4c9e4d0'),
('20261017210629','1fda7b21d167751e74c624d8ef31b12bce875c43fe8d8b626929ef0f84e00be9'),
('20261017211608','c44fee091ee1059344e7c48d9e34c94bb5c5311cc5655679c5e032ad23bc2f92'),
('20261017231850','43d63c763d7eaba973ebcd5eaab2e17604871c0dc339ba753fd8c532d2e084a8'),
('20261018140812','f7f6ae7a830d5101dc73a8c99171da7cbb5407aee93940f572c2ef51aa956786'),
('20261019123832','1e9206086cdbc1f6652b529102b2289680184a3738025ea14af39a4d8b7163eb'),
('20261020214438','f0a0ade9c1bba7b6645917a267dbb12b1c1f7ad2ad8549fc4cd76ee96d057e77'),
('20261020220934','470c4a7aac2d7ea67606313f4aa5c614c863939c869b066ab36c4297748ff975'),
('20261020221203','81749059278e4f580d1250b513444ab61344e7e2bb35da7d6f758498691cff58'),
('20261020221812','be1ea9a0d5a56bb2901f90ed011ecc5ffee3d3c655cc13ecf170fe201b87b810'),
('20261022205045','f73230dca5641bc1ab564177a65161540fec6653f7d7b249f12369228d61b506'),
('20261022214514','52c48e2b1bb4265ae1ed90b3675e1887ae975d67562e685977618b00deec22fa'),
('20261027001131','5d1c055a08bef478be37f24651d1e5b12918dfb78550a40a82a7b3ece23b8dbf'),
('20261028120000','79c1a618a5523bdbc54d348850fd1a1add93ddee15a0ea03f07d34f12b70b418'),
('20261105090000','f86e6a591153314704c1d6760ab7b522a9611e4e60753c0083c830d8dfe33d23')) expected(version,digest)
   left join private.schema_migrations applied using(version)
   where applied.digest is distinct from expected.digest) then
   raise exception 'Apply all matching PineVela prerequisite migrations first';
 end if;
 if exists(select 1 from private.schema_migrations where version='20261105110000') then
   if not exists(select 1 from private.schema_migrations where version='20261105110000' and digest='fd2056f0051420e4a63f0d18384d8cc83ceea23fa4b1b467324e647218cc545f') then
     raise exception 'PineVela push migration digest mismatch';
   end if;
 else
-- Device capabilities and delivery state are private server-owned records.
-- No user is subscribed or opted into discovery by this migration.
create table private.device_push_installations (
  id uuid primary key,
  owner_auth_user_id uuid not null references public.profiles(id) on delete cascade,
  secret_sha256 text not null check(secret_sha256 ~ '^[0-9a-f]{64}$'),
  platform text not null check(platform in ('web','android')),
  endpoint jsonb not null,
  endpoint_sha256 text not null unique check(endpoint_sha256 ~ '^[0-9a-f]{64}$'),
  enabled boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp()+interval '90 days'
);
create table private.device_push_bindings (
  id uuid primary key default gen_random_uuid(),
  installation_id uuid not null references private.device_push_installations(id) on delete cascade,
  context_id uuid not null references public.account_contexts(id) on delete cascade,
  auth_user_id uuid not null,
  session_id uuid not null references private.account_sessions(session_id) on delete cascade,
  portal_pin_version bigint,
  account_alerts boolean not null default true,
  marketplace boolean not null default false,
  residences boolean not null default false,
  enabled boolean not null default true,
  enabled_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  foreign key(context_id,auth_user_id) references public.account_contexts(id,auth_user_id) on delete cascade,
  unique(installation_id,context_id)
);
create index device_push_bindings_context_idx on private.device_push_bindings(context_id) where enabled;
create table private.device_push_publications (
  kind text not null check(kind in ('listing','residence')),
  subject_id uuid not null,
  notification_id uuid unique references public.notifications(id) on delete set null,
  announced_at timestamptz not null default clock_timestamp(),
  primary key(kind,subject_id)
);
-- Existing catalog entries are a baseline, not a campaign to existing users.
insert into private.device_push_publications(kind,subject_id)
 select 'listing',id from private.listing_catalog
 union all select 'residence',id from private.residence_catalog;
create table private.device_push_jobs (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null,
  context_id uuid not null,
  installation_id uuid not null references private.device_push_installations(id) on delete cascade,
  binding_id uuid not null references private.device_push_bindings(id) on delete cascade,
  state text not null default 'pending' check(state in ('pending','processing','sent','cancelled','failed')),
  attempts integer not null default 0 check(attempts between 0 and 6),
  available_at timestamptz not null default clock_timestamp(),
  lease_id uuid,
  lease_until timestamptz,
  expires_at timestamptz not null default clock_timestamp()+interval '24 hours',
  delivered_at timestamptz,
  failure_code text,
  created_at timestamptz not null default clock_timestamp(),
  foreign key(notification_id,context_id) references public.notification_recipients(notification_id,context_id) on delete cascade,
  unique(notification_id,context_id,installation_id)
);
create index device_push_jobs_pending_idx on private.device_push_jobs(available_at,created_at)
 where state in ('pending','processing');

alter table private.device_push_installations enable row level security;
alter table private.device_push_bindings enable row level security;
alter table private.device_push_publications enable row level security;
alter table private.device_push_jobs enable row level security;
revoke all on private.device_push_installations,private.device_push_bindings,
 private.device_push_publications,private.device_push_jobs from public,anon,authenticated,pinevela_backend,pinevela_catalog;

-- Invoker rights deliberately remain in place. Notification creation already
-- runs in authorized server/system transactions; browser roles cannot enqueue.
create function private.queue_device_push() returns trigger
language plpgsql set search_path='' as $$
begin
  insert into private.device_push_jobs(notification_id,context_id,installation_id,binding_id)
  select new.notification_id,new.context_id,i.id,b.id
  from private.device_push_bindings b join private.device_push_installations i on i.id=b.installation_id
  join public.notifications n on n.id=new.notification_id
  where b.context_id=new.context_id and b.enabled and i.enabled and i.expires_at>clock_timestamp()
    and n.created_at>=b.enabled_at
    and case n.category when 'discover_market' then b.marketplace
      when 'discover_residence' then b.residences else b.account_alerts end
  on conflict(notification_id,context_id,installation_id) do nothing;
  perform pg_notify('pinevela_device_push','queued');
  return new;
end;
$$;
revoke all on function private.queue_device_push() from public,anon,authenticated,pinevela_backend,pinevela_catalog;
create trigger pinevela_queue_device_push after insert on public.notification_recipients
 for each row execute function private.queue_device_push();

create function private.wake_device_push_catalog() returns trigger
language plpgsql set search_path='' as $$
begin
  perform pg_notify('pinevela_device_push','catalog');
  return new;
end;
$$;
revoke all on function private.wake_device_push_catalog() from public,anon,authenticated,pinevela_backend,pinevela_catalog;
create trigger pinevela_push_listing_catalog after insert or update of is_published on public.listings
 for each statement execute function private.wake_device_push_catalog();
create trigger pinevela_push_residence_catalog after insert or update of status on public.residences
 for each statement execute function private.wake_device_push_catalog();

 insert into private.schema_migrations(version,digest) values('20261105110000','fd2056f0051420e4a63f0d18384d8cc83ceea23fa4b1b467324e647218cc545f');
 end if;
end;
$pinevela_push_migration$;
commit;

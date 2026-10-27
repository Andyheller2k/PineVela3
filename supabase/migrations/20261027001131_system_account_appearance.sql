-- System stores the choice to follow the OS; the browser resolves its live mode.
-- Keep existing preferences, owner binding, grants and RLS policies intact.
alter table private.account_appearance
  drop constraint account_appearance_theme_check,
  add constraint account_appearance_theme_check check (theme in ('light','dark','system'));

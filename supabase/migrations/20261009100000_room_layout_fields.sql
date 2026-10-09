-- The current residence form records block gender, starting room numbers and
-- room layout labels. Capacities are computed from real rooms and beds, not
-- copied from client totals. No retired room pricing fields are introduced.
alter table public.blocks add column gender text check (gender in ('Male','Female','Mixed'));
alter table public.blocks add column starting_room_number integer check (starting_room_number between 1 and 999999);
alter table public.rooms add column layout_label text check (length(trim(layout_label)) between 1 and 120);

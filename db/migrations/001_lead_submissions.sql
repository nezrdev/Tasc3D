begin;

create schema if not exists leads authorization postgres;

create table if not exists leads.lead_submissions (
  id bigint generated always as identity primary key,
  form_type text not null check (form_type in ('datum_waitlist', 'project_brief')),
  email text not null check (char_length(email) between 3 and 254 and email = lower(btrim(email))),
  consent_version text not null check (char_length(consent_version) between 1 and 64),
  consent_at timestamptz not null default now(),
  source_path text check (source_path is null or char_length(source_path) <= 512),
  utm jsonb not null default '{}'::jsonb,
  dedupe_bucket bigint not null,
  status text not null default 'new' check (status in ('new', 'reviewed', 'archived')),
  created_at timestamptz not null default now()
);

create unique index if not exists lead_submission_dedupe_uq
  on leads.lead_submissions (form_type, email, dedupe_bucket);
create index if not exists lead_submission_created_idx
  on leads.lead_submissions (created_at desc);
create index if not exists lead_submission_type_created_idx
  on leads.lead_submissions (form_type, created_at desc);

revoke all on schema leads from public;
revoke all on leads.lead_submissions from public;
grant usage on schema leads to tasc_leads_app;
grant insert on leads.lead_submissions to tasc_leads_app;
grant select (form_type, email, dedupe_bucket) on leads.lead_submissions to tasc_leads_app;
grant usage on sequence leads.lead_submissions_id_seq to tasc_leads_app;

commit;

-- Follow-up to 032: created_by column was missing from the applied version.
alter table saas_codes add column if not exists created_by uuid;

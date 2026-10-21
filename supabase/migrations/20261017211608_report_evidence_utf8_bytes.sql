-- Encrypted text is opaque until a participant consents to disclosure. Valid
-- UTF-8 may include NUL, which PostgreSQL text cannot represent; preserve those
-- exact authenticated bytes instead of rejecting or altering reported evidence.
-- Existing text is converted without changing the report, consent or audit rows.
alter table private.content_report_evidence drop constraint content_report_evidence_plaintext_check;
alter table private.content_report_evidence alter column plaintext type bytea using convert_to(plaintext,'UTF8');
alter table private.content_report_evidence add constraint content_report_evidence_plaintext_check
 check(octet_length(plaintext) between 1 and 20000);

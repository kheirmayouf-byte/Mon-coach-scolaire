begin;
alter table public.mcs_documents drop constraint mcs_documents_mime_check;
alter table public.mcs_documents add constraint mcs_documents_mime_check check(mime in ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/jpeg','image/png','image/webp','text/plain'));
update storage.buckets set allowed_mime_types=array_append(allowed_mime_types,'application/vnd.openxmlformats-officedocument.wordprocessingml.document') where id='mcs-documents' and not 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'=any(allowed_mime_types);
commit;


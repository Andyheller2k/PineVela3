-- Explicit, versioned Terms receipts. Existing users are never auto-consented.
-- Only the verified Express backend writes these private, non-API tables.
create table private.legal_documents (
  document_key text not null,
  version text not null,
  content_sha256 text not null check(content_sha256 ~ '^[0-9a-f]{64}$'),
  public_path text not null,
  content_html text not null,
  published_at date not null,
  primary key(document_key,version),
  unique(document_key,version,content_sha256)
);
create table private.legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  context_id uuid references public.account_contexts(id) on delete set null,
  session_id uuid not null,
  purpose text not null check(purpose in ('platform_access','merchant_application')),
  resource_key text not null default '',
  document_key text not null,
  document_version text not null,
  document_sha256 text not null,
  source text not null check(source in ('email_signup','google_signup','account_gate','merchant_application')),
  accepted_at timestamptz not null default clock_timestamp(),
  foreign key(document_key,document_version,document_sha256)
    references private.legal_documents(document_key,version,content_sha256),
  unique(auth_user_id,purpose,resource_key,document_key,document_version),
  check((purpose='platform_access' and resource_key='' and source<>'merchant_application')
    or (purpose='merchant_application' and resource_key<>'' and source='merchant_application'))
);
create index legal_acceptances_context_idx on private.legal_acceptances(context_id);
alter table private.legal_documents enable row level security;
alter table private.legal_acceptances enable row level security;
revoke all on private.legal_documents,private.legal_acceptances from public,anon,authenticated,pinevela_backend;
-- No browser grants or RLS policies. Server operations recheck the live actor
-- through authorizedSystem/authorizedRead before accessing these records.
insert into private.legal_documents(document_key,version,content_sha256,public_path,content_html,published_at) values ('platform_terms','2026-10-27','5221d730f6e4247f43cbf82e8b51e55a37cb075016bde7849a500a66a6e56ada','/legal/terms-2026-10-27.html','<article class="document" aria-label="Terms of service">
        <section id="service"><h2>1. The service</h2><p>PineVela is operated by <strong>Oppong Manu Andy, Ghana</strong> ("we", "us" or "our") at <a href="https://pinevela.app/">pinevela.app</a>. These terms apply to your use of PineVela. If you do not agree to them, do not use the service.</p><p>PineVela offers housing-management and marketplace tools for residents, housing managers, staff, sellers and administrators. Access to a feature depends on the account, registration, permissions and service availability that apply to you.</p><p>A PineVela account does not by itself establish a tenancy, guarantee housing, authorize employment or approve a seller. Separate housing, employment, purchase and subscription arrangements may apply.</p></section>
        <section id="accounts"><h2>2. Accounts and access</h2><p>You must be <strong>at least 16 years old</strong> to use PineVela. If you are 16 or 17, you need a parent or guardian''s permission where required by applicable law. Individual housing, employment, seller or payment arrangements may require a higher age or additional authorization.</p><p>Provide accurate account information and use only accounts and roles you are authorized to access. Keep passwords, security PINs, room activation keys and other access credentials private. Contact support if you suspect an account has been compromised.</p><p>Google sign-in is optional and remains subject to Google''s account and authorization controls. Selecting Google sign-in does not grant additional housing, staff, seller or administrator privileges.</p></section>
        <section id="housing"><h2>3. Housing relationships</h2><p>Housing access and room activation depend on the authorized manager''s records and the applicable allocation process. A resident may have at most one active allocation, and a bed may have at most one active occupant.</p><p>Managers may act only within their assigned housing. Staff access is created through an authorized manager''s process, not public recruitment. Staff reviews are limited to the resident''s activated housing relationship. Report incorrect housing records or maintenance concerns through the relevant service workflow.</p></section>
        <section id="marketplace"><h2>4. Marketplace activity</h2><p>Sellers are responsible for the accuracy of their listings, the content they submit and the fulfilment commitments associated with accepted orders. Buyers should review item descriptions, availability, prices, delivery arrangements and any transaction-specific terms before confirming an order.</p><p>Only make payments through the methods presented for the applicable transaction. Payment, cancellation, delivery and refund handling depend on the relevant order, disclosed service rules and applicable law. Contact the seller and PineVela support about an order or payment dispute, including the relevant transaction reference. These terms do not remove any rights you have under applicable law.</p><p>Buyer–seller messaging supports marketplace transactions. Do not misuse it for harassment, impersonation, unsolicited promotions or unrelated contact.</p></section>
        <section id="conduct"><h2>5. Content and conduct</h2><ul>
          <li>Submit content you are entitled to use and share. Respect other people''s privacy and intellectual property.</li>
          <li>Do not impersonate another person, misrepresent ownership or attempt to access another account, hostel, store or private record without authorization.</li>
          <li>Do not submit unlawful content, facilitate fraud, harass others or interfere with service security.</li>
        </ul><p>PineVela checks certain submitted content before publication and may hold it for human review. An automated approval does not establish that an item is lawful, authentic or suitable for a particular use. Use support or reporting tools to raise safety concerns or contest an incorrect content decision.</p><p>You retain your rights in submitted content. You permit PineVela to store, display, deliver and check that content as needed to provide the feature you use, subject to the privacy policy and applicable service controls.</p></section>
        <section id="ai"><h2>6. Optional AI</h2><p>Ask AI replies require your explicit confirmation of the disclosed provider sharing. AI responses can be inaccurate or incomplete. Check important housing, account and transaction information through the relevant PineVela records or authorized people.</p><p>The assistant cannot authorize payments, approve applications or change housing allocations. Service limits and provider availability may affect whether it can reply.</p></section>
        <section id="availability"><h2>7. Service changes and restrictions</h2><p>Features may change or be temporarily unavailable because of maintenance, provider outages or service limits. Access may be restricted through the applicable security, safety and account-review processes. Contact support for help with an access or moderation decision.</p><p>Ending or closing a particular account context does not necessarily cancel an existing obligation or erase retained housing, transaction or support records.</p><p>These terms are governed by the laws of Ghana, subject to any mandatory legal protections that apply to you. Contact <a href="mailto:andyheller2k@gmail.com">andyheller2k@gmail.com</a> to raise a dispute and seek a resolution. This contact process does not limit any right to approach a competent authority or court.</p></section>
        <section id="privacy"><h2>8. Privacy, updates and contact</h2><p>Read the <a href="/privacy.html">privacy policy</a> for information about account data, Google sign-in, service providers and AI features. The date above identifies this version of the terms. Material changes will be communicated through the service or other appropriate notices before they apply to your continued use.</p><p>Operator: <strong>Oppong Manu Andy, Ghana</strong>. Questions about these terms, your account or a transaction: <a href="mailto:andyheller2k@gmail.com">andyheller2k@gmail.com</a>.</p></section>
      </article>','2026-10-27');

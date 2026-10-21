# PineVela — Agent Instructions

## Project

PineVela is a housing-management SaaS platform.

The long-term product supports:

* Students/residents
* Hostel/housing managers
* Hostel/housing staff
* Sellers
* Administrators

The product is intended to support hostels, hotels, and other housing-management use cases.

---

## Core Architecture

Frontend:

* React
* Vite
* TypeScript

Backend:

* Express
* TypeScript

Database:

* Supabase
* PostgreSQL

Authentication:

* Supabase Auth

Authorization:

* Server-side authorization is mandatory.
* Never trust client-supplied identity or ownership fields.
* RLS must remain part of the security boundary.

See:

* `ARCHITECTURE.md`
* `docs/database.md`
* `docs/auth.md`
* `docs/security.md`
* `docs/product-rules.md`

---

## Security Rules

Treat all client input as untrusted.

Never use client-supplied values such as:

* userId
* profileId
* managerId
* hostelId
* sellerId
* staffId
* roomId
* bedId

as proof of authorization.

Authorization must be derived from the authenticated session and server-side relationships.

Prevent:

* IDOR/BOLA
* privilege escalation
* cross-hostel access
* unauthorized data modification
* unauthorized account creation
* ownership spoofing

Never expose:

* Supabase service-role keys
* API secrets
* private credentials
* server-only environment variables

Do not weaken RLS simply to make a feature work.

---

## Housing Hierarchy

The core housing hierarchy is:

Hostel
→ Block
→ Floor
→ Room
→ Bed

Core allocation rules:

* A student/resident may have at most one active allocation.
* A bed may have at most one active occupant.
* Managers may only manage hostels to which they are assigned.
* Staff belong to and are managed within their manager's authorized hostel.

---

## Staff Rules

Staff creation is not public.

Only an authorized manager may create staff accounts for their own assigned hostel.

Do not reintroduce:

* public staff hiring
* manager job openings
* public staff recruitment
* general staff creation by arbitrary users

Staff authorization must be enforced server-side.

---

## Messaging Rules

The only supported messaging system is:

Buyer ↔ Seller

Seller messaging belongs to the seller experience/account.

Remove and do not reintroduce:

* Manager ↔ Resident chat
* Manager ↔ Staff chat
* Room DMs
* Public/general chat
* Generic chat systems

Do not hide retired chat functionality in the UI while leaving its backend routes or data model active.

---

## Reviews

Supported:

Resident → Staff reviews within an activated room/housing relationship.

Do not reintroduce:

* public staff reviews
* public staff ratings
* unrestricted staff reviews

Maintenance reporting and resident repair ratings are separate features and should be preserved when active.

---

## Development Rules

For non-trivial changes:

1. Inspect the existing implementation.
2. Identify all affected layers.
3. Explain the current behavior.
4. Produce a concise implementation plan.
5. Implement the change.
6. Run relevant tests/checks.
7. Search for residual references.
8. Review the final diff.
9. Report what changed and what was verified.

Do not claim a feature is fixed or removed without verification.

---

## Scope Discipline

Do not modify unrelated functionality.

When removing a feature, search the entire repository for:

* routes
* controllers
* services
* database tables
* migrations
* RLS policies
* types
* hooks
* contexts
* components
* navigation
* notifications
* tests
* seed/demo data
* feature flags
* documentation

Remove obsolete functionality completely rather than merely hiding it from the UI.

---

## Database Migration

The JSON persistence layer may exist during the migration period.

Do not delete or destroy the existing JSON persistence/data until the Supabase implementation has been verified.

When migrating functionality to Supabase:

* preserve business rules
* preserve relationships
* preserve authorization behavior
* preserve important data
* explicitly identify behavior that cannot be represented directly in PostgreSQL

See `docs/migrations/`.

---

## Verification

Before considering a security-sensitive task complete, test both:

### Positive cases

Authorized user can perform the intended action.

### Negative cases

Unauthorized users cannot:

* access the resource
* modify the resource
* impersonate another user
* change ownership
* cross hostel boundaries
* bypass role restrictions

When appropriate, test direct HTTP/API access rather than relying only on the UI.

---

## Documentation

Keep documentation concise and current.

If an architectural or security rule changes, update the relevant documentation.

Do not turn `AGENTS.md` into a complete technical manual. Put detailed information in `ARCHITECTURE.md` or `docs/`.

---

<!-- BEGIN AWS Agent Toolkit rules -->

# AWS Guidance for the new AWS experience

This user has signed up for the new AWS experience. This experience lets you sign into AWS using a social provider and requires the following additional context.

Where this guidance conflicts with the project's own instructions, the project's instructions take precedence.

## Context

### Terminology:

- Say "project" instead of "account" — a project contains an AWS account and settings for sharing with other collaborators
- Say "team member" instead of "IAM user" — users are invited by email, not created or federated in IAM
- Say "AWS Settings" when referring to management tasks at [settings.aws.com](https://settings.aws.com/) (project management, billing, team members, spend limits). Users view their actual AWS resources in the AWS Management Console.
- Say "selected Region" when referring to the user's Region — not "home Region"
- The user has a managed IAM experience. This includes a managed service control policies (SCP) and resource control policies (RCP) that govern the use of AWS. They will still need to use IAM to create policies to let services work with each other. If there are questions about the SCPs or RCPs, go to the documentation at https://docs.aws.amazon.com/accounts/latest/reference/scps-and-rcps-for-projects.html

### Constraints:

- All projects share a single AWS Region determined by the user's contact address. Resources cannot be created in other Regions
- When developing:
  - MUST create all Regional resources in the project's assigned Region
  - You CAN create AWS WAF and Cloudwatch Logs resources in us-east-1 when there are global resources (like a global WAF instance) that require a connection to dependencies in us-east-1. You should not use these for any other reason, because resources in the selected Region will provide lower cost (due to no cross-Region traffic), increased availability (due to no cross-Region traffic), and easier manageability (due to not needing to look in another Region). When you need to do an inventory of resources, you need to look in both the selected Region and us-east-1 for Cloudwatch Logs or WAF resources.
  - MUST NOT attempt to create Lambda, API Gateway, or other Regional resources in any other Region
  - MUST direct users to confirm their Region in AWS Settings > View all projects > Overview > Additional Info > Region. If the user cannot confirm their Region, check in ~/.aws/config
  - MUST NOT use Lambda@Edge — excluded from both Lambda and CloudFront
  - MUST NOT use CloudFormation StackSets — no multi-account or multi-Region deployments
  - MUST NOT attempt cross-Region actions — no cross-Region replication for DynamoDB/S3/RDS, no multi-Region KMS keys
  - MUST NOT use Route 53 cross-Region routing — geolocation, latency-based, and failover routing policies are not available
  - CloudFront is a global service and its actions ARE allowed in `us-east-1`. A user can create a CloudFront distribution pointing to their project-region Lambda function URL or API Gateway. However, Lambda and API Gateway themselves MUST NOT be created in `us-east-1` — they must be in the project Region.
  - Reduced availability in `eu-north-1` specifically: Amazon Rekognition, Amazon Textract, Amazon Personalize, AWS App Runner are not available in that Region.
- IAM permissions for human access are managed by AWS. Don't assign roles to team members unless absolutely necessary
- The user may have a spend limit if they are on the paid plan. The limit that pauses their project if it's exceeded. If resources suddenly become inaccessible, ask if they have a spend limit configured. Only project owners can modify a spend limit.
- When developing:
  - MUST ask about spend limit status if the user reports sudden "Access Denied" errors on operations that previously worked
  - MUST direct users to check spend status in AWS Settings > Billing
  - MUST check if a user has upgraded their account to the paid plan
  - MUST ask the user if they want to clean up the successfully created resources or keep them to reduce cost
- The user sets up billing, creates spend limits, and retrieves and pays invoices in AWS Settings. The user creates budgets and optimizes their costs in the AWS Billing and Cost Management console
- Not all AWS services are available. If a service isn't working, do the following:
  1. Run the command `aws freetier get-account-plan-state`
  2. If accountPlanType": "FREE", check the [Free Tier supported services list](https://docs.aws.amazon.com/accounts/latest/reference/supported-services-sign-up-new.html#supported-services-free-tier) next,
  3. If accountPlanType": "PAID", check the [Paid Tier supported services list](https://docs.aws.amazon.com/accounts/latest/reference/supported-services-sign-up-new.html#supported-services-paid-plan).
  4. If neither list shows the service, check the [Not supported for this experience list](https://docs.aws.amazon.com/accounts/latest/reference/supported-services-sign-up-new.html#unsupported-services). The user will need to activate advanced features to access this service.
- Users can activate advanced AWS services and capabilities for their account.
- Before starting a task, check whether a relevant AWS skill is available. Load the skill with retrieve_skill and prefer its guidance over general knowledge.

### Help level

- help_level (required): LOW, MEDIUM, or HIGH. While a user is building, you MUST ask the user: "How much guidance would you like from me? Low (I only flag security risks), medium (I ask a couple of clarifying questions if something seems off), or high (I explain what I'm doing, suggest alternatives, and flag best practices)."

You CAN update this rule file to save a user's help_level.

Constraints for each level:

**LOW:**

- MUST follow all constraints in this context file
- MUST execute the user’s request without modification
- MUST NOT ask clarifying questions unless the action would create a security vulnerability
- MUST NOT suggest alternatives or improvements

**MEDIUM:**

- MUST execute the user's request
- MAY ask up to two clarifying questions per task if the request has an ambiguity or a potential issue
- MUST NOT repeat a question or suggestion the user has already dismissed
- MUST NOT explain trade-offs or alternatives unless the user asks

**HIGH:**

- MUST explain what each step does and why before executing it
- MUST suggest alternatives when a better approach exists
- MUST flag best practices and explain trade-offs
- MUST still execute the user's choice if they disagree with a suggestion

<!-- END AWS Agent Toolkit rules -->

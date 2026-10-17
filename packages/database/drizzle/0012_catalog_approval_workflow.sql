-- Source of truth for synthetic catalogue and collection-capacity approval separation.
-- Future production activation also requires legal, laboratory and clinical sign-offs.
ALTER TABLE tests ADD COLUMN preparation_text text;
CREATE TABLE catalog_review_requests(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 resource_type varchar(24) NOT NULL CHECK(
  resource_type IN ('test','laboratory','zone','offering','slot')),
 resource_id uuid NOT NULL,
 creator_id uuid NOT NULL REFERENCES users(id),
 approver_id uuid REFERENCES users(id),
 evidence_reference varchar(128),
 approved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(resource_type,resource_id),
 CONSTRAINT catalog_review_two_actor CHECK(approver_id IS NULL OR approver_id<>creator_id),
 CONSTRAINT catalog_review_consistent CHECK(
  (approved_at IS NULL AND approver_id IS NULL AND evidence_reference IS NULL)
   OR (approved_at IS NOT NULL AND approver_id IS NOT NULL AND evidence_reference IS NOT NULL))
);

-- Enforce one committed booking per authenticated idempotency key.
ALTER TABLE booking_drafts ADD COLUMN commit_key varchar(128);
CREATE UNIQUE INDEX booking_draft_actor_commit_key ON booking_drafts(user_id,commit_key) WHERE commit_key IS NOT NULL;

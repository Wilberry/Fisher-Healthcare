import { pgTable, uuid, varchar, timestamp, date, text, integer, boolean, pgEnum, uniqueIndex, index, jsonb } from 'drizzle-orm/pg-core';
const timestamps = { createdAt: timestamp('created_at',{withTimezone:true}).notNull().defaultNow(), updatedAt: timestamp('updated_at',{withTimezone:true}).notNull().defaultNow() };
export const orderStatus = pgEnum('order_status',['draft','awaiting_payment','confirmed','assigned','collection_in_progress','collected','lab_processing','results_ready','completed','cancelled','exception']);
export const specimenStatus = pgEnum('specimen_status',['planned','collected','packaged','in_transit','lab_received','accepted','rejected','lost','damaged']);
export const users = pgTable('users',{id:uuid('id').primaryKey().defaultRandom(),identitySubject:varchar('identity_subject',{length:255}).notNull().unique(),email:varchar('email',{length:320}),...timestamps});
export const patients = pgTable('patients',{id:uuid('id').primaryKey().defaultRandom(),displayName:varchar('display_name',{length:200}).notNull(),dateOfBirth:date('date_of_birth',{mode:'date'}),...timestamps});
export const patientRelationships = pgTable('patient_relationships',{id:uuid('id').primaryKey().defaultRandom(),userId:uuid('user_id').notNull().references(()=>users.id),patientId:uuid('patient_id').notNull().references(()=>patients.id),relationship:varchar('relationship',{length:40}).notNull(),canBook:boolean('can_book').notNull().default(false),canViewResults:boolean('can_view_results').notNull().default(false),verifiedAt:timestamp('verified_at',{withTimezone:true}),revokedAt:timestamp('revoked_at',{withTimezone:true}),...timestamps},t=>[index('relationship_patient_idx').on(t.patientId)]);
export const staff = pgTable('staff',{id:uuid('id').primaryKey().defaultRandom(),userId:uuid('user_id').notNull().references(()=>users.id).unique(),role:varchar('role',{length:40}).notNull(),active:boolean('active').notNull().default(false),...timestamps});
export const laboratories = pgTable('laboratories',{id:uuid('id').primaryKey().defaultRandom(),name:varchar('name',{length:200}).notNull(),active:boolean('active').notNull().default(false),...timestamps});
export const tests = pgTable('tests',{id:uuid('id').primaryKey().defaultRandom(),code:varchar('code',{length:64}).notNull().unique(),name:varchar('name',{length:200}).notNull(),specimenType:varchar('specimen_type',{length:80}).notNull(),active:boolean('active').notNull().default(false),...timestamps});
export const labOfferings = pgTable('lab_offerings',{id:uuid('id').primaryKey().defaultRandom(),labId:uuid('lab_id').notNull().references(()=>laboratories.id),testId:uuid('test_id').notNull().references(()=>tests.id),priceKobo:integer('price_kobo').notNull(),turnaroundHours:integer('turnaround_hours').notNull(),active:boolean('active').notNull().default(false)},t=>[uniqueIndex('lab_test_unique').on(t.labId,t.testId)]);
export const orders = pgTable('orders',{id:uuid('id').primaryKey().defaultRandom(),patientId:uuid('patient_id').notNull().references(()=>patients.id),bookedBy:uuid('booked_by').notNull().references(()=>users.id),labId:uuid('lab_id').notNull().references(()=>laboratories.id),status:orderStatus('status').notNull().default('draft'),tier:varchar('tier',{length:20}).notNull(),currency:varchar('currency',{length:3}).notNull().default('NGN'),totalKobo:integer('total_kobo').notNull(),collectionWindowStart:timestamp('collection_window_start',{withTimezone:true}),collectionWindowEnd:timestamp('collection_window_end',{withTimezone:true}),...timestamps});
export const orderItems = pgTable('order_items',{id:uuid('id').primaryKey().defaultRandom(),orderId:uuid('order_id').notNull().references(()=>orders.id),testId:uuid('test_id').notNull().references(()=>tests.id),priceKobo:integer('price_kobo').notNull()});
export const specimens = pgTable('specimens',{id:uuid('id').primaryKey().defaultRandom(),orderId:uuid('order_id').notNull().references(()=>orders.id),barcode:varchar('barcode',{length:100}).notNull().unique(),status:specimenStatus('status').notNull().default('planned'),...timestamps});
export const custodyEvents = pgTable('custody_events',{id:uuid('id').primaryKey().defaultRandom(),specimenId:uuid('specimen_id').notNull().references(()=>specimens.id),actorId:uuid('actor_id').notNull().references(()=>users.id),eventType:varchar('event_type',{length:64}).notNull(),payload:jsonb('payload').notNull().default({}),occurredAt:timestamp('occurred_at',{withTimezone:true}).notNull(),recordedAt:timestamp('recorded_at',{withTimezone:true}).notNull().defaultNow()},t=>[index('custody_specimen_idx').on(t.specimenId)]);
export const results = pgTable('results',{id:uuid('id').primaryKey().defaultRandom(),orderId:uuid('order_id').notNull().references(()=>orders.id),patientId:uuid('patient_id').notNull().references(()=>patients.id),objectKey:text('object_key').notNull(),releasedAt:timestamp('released_at',{withTimezone:true}),releasedBy:uuid('released_by').references(()=>users.id),...timestamps});
export const payments = pgTable('payments',{id:uuid('id').primaryKey().defaultRandom(),orderId:uuid('order_id').notNull().references(()=>orders.id),providerReference:varchar('provider_reference',{length:200}).notNull().unique(),amountKobo:integer('amount_kobo').notNull(),status:varchar('status',{length:32}).notNull(),...timestamps});
export const ledgerEntries = pgTable('ledger_entries',{id:uuid('id').primaryKey().defaultRandom(),transactionId:uuid('transaction_id').notNull(),account:varchar('account',{length:80}).notNull(),amountKobo:integer('amount_kobo').notNull(),...timestamps},t=>[index('ledger_transaction_idx').on(t.transactionId)]);
export const outbox = pgTable('outbox',{id:uuid('id').primaryKey().defaultRandom(),eventType:varchar('event_type',{length:120}).notNull(),payload:jsonb('payload').notNull(),attempts:integer('attempts').notNull().default(0),processedAt:timestamp('processed_at',{withTimezone:true}),availableAt:timestamp('available_at',{withTimezone:true}).notNull().defaultNow(),leaseToken:uuid('lease_token'),leaseExpiresAt:timestamp('lease_expires_at',{withTimezone:true}),lastError:text('last_error'),deadLetteredAt:timestamp('dead_lettered_at',{withTimezone:true}),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow()});
export const auditEvents = pgTable('audit_events',{id:uuid('id').primaryKey().defaultRandom(),actorId:uuid('actor_id').references(()=>users.id),action:varchar('action',{length:120}).notNull(),resourceType:varchar('resource_type',{length:80}).notNull(),resourceId:uuid('resource_id'),occurredAt:timestamp('occurred_at',{withTimezone:true}).notNull().defaultNow(),metadata:jsonb('metadata').notNull().default({})});


// Phase 2 uses the corresponding checksummed 0004 migration. Defaults deny unapproved zones/slots.
export const serviceZones = pgTable('service_zones', {
  id: uuid('id').primaryKey().defaultRandom(), code: varchar('code',{length:64}).notNull().unique(),
  name: varchar('name',{length:160}).notNull(), active: boolean('active').notNull().default(false),
  regularFeeKobo: integer('regular_fee_kobo').notNull(), premiumFeeKobo: integer('premium_fee_kobo').notNull(),
  createdAt: timestamp('created_at',{withTimezone:true}).notNull().defaultNow()
});
export const collectionSlots = pgTable('collection_slots', {
  id: uuid('id').primaryKey().defaultRandom(), zoneId: uuid('zone_id').notNull().references(()=>serviceZones.id),
  labId: uuid('lab_id').notNull().references(()=>laboratories.id),
  tier: varchar('tier',{length:20}).notNull(), startsAt: timestamp('starts_at',{withTimezone:true}).notNull(),
  endsAt: timestamp('ends_at',{withTimezone:true}).notNull(), cutoffAt: timestamp('cutoff_at',{withTimezone:true}).notNull(),
  capacity: integer('capacity').notNull(), active: boolean('active').notNull().default(false)
});
export const bookingQuotes = pgTable('booking_quotes', {
  id: uuid('id').primaryKey().defaultRandom(), zoneId: uuid('zone_id').notNull().references(()=>serviceZones.id),
  slotId: uuid('slot_id').notNull().references(()=>collectionSlots.id),
  labId: uuid('lab_id').notNull().references(()=>laboratories.id), tier: varchar('tier',{length:20}).notNull(),
  currency: varchar('currency',{length:3}).notNull().default('NGN'),
  items: jsonb('items').notNull(), testsTotalKobo: integer('tests_total_kobo').notNull(),
  logisticsFeeKobo: integer('logistics_fee_kobo').notNull(), totalKobo: integer('total_kobo').notNull(),
  expiresAt: timestamp('expires_at',{withTimezone:true}).notNull(),
  createdAt: timestamp('created_at',{withTimezone:true}).notNull().defaultNow()
});
export const bookingDrafts = pgTable('booking_drafts', {
  id: uuid('id').primaryKey().defaultRandom(), userId: uuid('user_id').notNull().references(()=>users.id),
  patientId: uuid('patient_id').notNull().references(()=>patients.id),
  quoteId: uuid('quote_id').notNull().references(()=>bookingQuotes.id),
  status: varchar('status',{length:24}).notNull().default('open'),
  orderId: uuid('order_id').references(()=>orders.id),
  ...timestamps
});
export const slotHolds = pgTable('slot_holds', {
  id: uuid('id').primaryKey().defaultRandom(), draftId: uuid('draft_id').notNull().references(()=>bookingDrafts.id).unique(),
  slotId: uuid('slot_id').notNull().references(()=>collectionSlots.id),
  expiresAt: timestamp('expires_at',{withTimezone:true}).notNull(),
  createdAt: timestamp('created_at',{withTimezone:true}).notNull().defaultNow()
});
export const paymentWebhookEvents = pgTable('payment_webhook_events', {
  id: uuid('id').primaryKey().defaultRandom(), eventHash: varchar('event_hash',{length:64}).notNull().unique(),
  providerReference: varchar('provider_reference',{length:200}),
  receivedAt: timestamp('received_at',{withTimezone:true}).notNull().defaultNow()
});

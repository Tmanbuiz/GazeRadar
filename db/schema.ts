import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
export const watches = sqliteTable('watches', {
 id: text('id').primaryKey(), owner: text('owner').notNull(), name: text('name').notNull(), url: text('url').notNull(), keywords: text('keywords').notNull(), active: integer('active').notNull().default(1), snapshot: text('snapshot'), checked: integer('checked'), created: integer('created').notNull(), error: text('error'), checking: integer('checking').notNull().default(0), lastOk: integer('last_ok'), failCount: integer('fail_count').notNull().default(0),
 category: text('category').notNull().default('website'), intervalHours: integer('interval_hours').notNull().default(6), nextCheck: integer('next_check').notNull().default(0), emailEnabled: integer('email_enabled').notNull().default(1), options: text('options').notNull().default('{}'), propertySnapshot: text('property_snapshot'),
},t=>[index('watches_due').on(t.active,t.nextCheck),index('watches_owner').on(t.owner)]);
export const events = sqliteTable('events', {
 id: text('id').primaryKey(), owner: text('owner').notNull(), watchId: text('watch_id').notNull(), name: text('name').notNull(), url: text('url').notNull(), content: text('content').notNull(), created: integer('created').notNull(), seen: integer('seen').notNull().default(0),
 category: text('category').notNull().default('website'), emailed: integer('emailed').notNull().default(0),
},t=>[index('events_owner_delivery').on(t.owner,t.emailed,t.created),index('events_watch_owner').on(t.watchId,t.owner)]);
export const users = sqliteTable('users', {
 id: text('id').primaryKey(), email: text('email').notNull().unique(), created: integer('created').notNull(), lastLogin: integer('last_login'),
});
export const loginCodes = sqliteTable('login_codes', {
 email: text('email').primaryKey(), hash: text('hash').notNull(), expires: integer('expires').notNull(), attempts: integer('attempts').notNull().default(0), sent: integer('sent').notNull(),
});
export const sessions = sqliteTable('sessions', {
 hash: text('hash').primaryKey(), userId: text('user_id').notNull(), expires: integer('expires').notNull(), created: integer('created').notNull(),
});
export const throttle = sqliteTable('throttle', {
 key: text('key').primaryKey(), count: integer('count').notNull(), windowStart: integer('window_start').notNull(),
});
export const zohoToken = sqliteTable('zoho_token', {
 id: integer('id').primaryKey(), token: text('token').notNull(), expires: integer('expires').notNull(),
});
export const profiles = sqliteTable('profiles', {
 id:text('id').primaryKey(), owner:text('owner').notNull(), kind:text('kind').notNull(), content:text('content').notNull(), updated:integer('updated').notNull(),
},t=>[uniqueIndex('profiles_owner_kind').on(t.owner,t.kind)]);
export const opportunities = sqliteTable('opportunities', {
 id:text('id').primaryKey(), owner:text('owner').notNull(), watchId:text('watch_id').notNull(), category:text('category').notNull(), url:text('url').notNull(), name:text('name').notNull(), content:text('content').notNull(), fingerprint:text('fingerprint').notNull(), available:integer('available').notNull().default(1), state:text('state').notNull().default('new'), created:integer('created').notNull(), updated:integer('updated').notNull(),
},t=>[uniqueIndex('opportunities_source_url').on(t.owner,t.watchId,t.url),index('opportunities_owner_kind').on(t.owner,t.category)]);
export const notifications = sqliteTable('notifications', {
 owner:text('owner').primaryKey(), frequency:text('frequency').notNull().default('off'), noChange:integer('no_change').notNull().default(0), nextDigest:integer('next_digest').notNull().default(0), sendingUntil:integer('sending_until').notNull().default(0), retryAt:integer('retry_at').notNull().default(0), attempts:integer('attempts').notNull().default(0), lastSent:integer('last_sent'), error:text('error'), updated:integer('updated').notNull(),
});
export const pushDevices = sqliteTable('push_devices', {
 id:text('id').primaryKey(),owner:text('owner').notNull(),platform:text('platform').notNull(),token:text('token').notNull(),environment:text('environment').notNull().default('production'),created:integer('created').notNull(),cursorTime:integer('cursor_time').notNull(),cursorId:text('cursor_id').notNull().default(''),enabled:integer('enabled').notNull().default(1),lockedUntil:integer('locked_until').notNull().default(0),retryAt:integer('retry_at').notNull().default(0),failures:integer('failures').notNull().default(0),error:text('error'),
},t=>[index('push_devices_owner').on(t.owner)]);
export const mailAccounts = sqliteTable('mail_accounts', {
 owner:text('owner').primaryKey(),provider:text('provider').notNull(),email:text('email').notNull(),refresh:text('refresh').notNull(),updated:integer('updated').notNull(),
});
export const mailOauth = sqliteTable('mail_oauth', {
 id:text('id').primaryKey(),owner:text('owner').notNull(),provider:text('provider').notNull(),verifier:text('verifier').notNull(),expires:integer('expires').notNull(),
});
export const applications = sqliteTable('applications', {
 id:text('id').primaryKey(),owner:text('owner').notNull(),recipient:text('recipient').notNull(),sender:text('sender').notNull(),title:text('title').notNull(),jobUrl:text('job_url').notNull(),status:text('status').notNull(),created:integer('created').notNull(),
},t=>[index('applications_owner_created').on(t.owner,t.created)]);

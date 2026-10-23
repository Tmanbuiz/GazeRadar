import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const watches = sqliteTable('watches', {
 id: text('id').primaryKey(), owner: text('owner').notNull(), name: text('name').notNull(), url: text('url').notNull(), keywords: text('keywords').notNull(), active: integer('active').notNull().default(1), snapshot: text('snapshot'), checked: integer('checked'), created: integer('created').notNull(), error: text('error'), checking: integer('checking').notNull().default(0), lastOk: integer('last_ok'), failCount: integer('fail_count').notNull().default(0),
});
export const events = sqliteTable('events', {
 id: text('id').primaryKey(), owner: text('owner').notNull(), watchId: text('watch_id').notNull(), name: text('name').notNull(), url: text('url').notNull(), content: text('content').notNull(), created: integer('created').notNull(), seen: integer('seen').notNull().default(0),
});
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

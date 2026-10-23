import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const watches = sqliteTable('watches', {
 id: text('id').primaryKey(), owner: text('owner').notNull(), name: text('name').notNull(), url: text('url').notNull(), keywords: text('keywords').notNull(), active: integer('active').notNull().default(1), snapshot: text('snapshot'), checked: integer('checked'), created: integer('created').notNull(), error: text('error'), checking: integer('checking').notNull().default(0),
});
export const events = sqliteTable('events', {
 id: text('id').primaryKey(), owner: text('owner').notNull(), watchId: text('watch_id').notNull(), name: text('name').notNull(), url: text('url').notNull(), content: text('content').notNull(), created: integer('created').notNull(), seen: integer('seen').notNull().default(0),
});

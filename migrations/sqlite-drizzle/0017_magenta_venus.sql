CREATE TABLE `reading_book` (
	`id` text PRIMARY KEY NOT NULL,
	`assistant_id` text NOT NULL,
	`title` text NOT NULL,
	`source_name` text NOT NULL,
	`source_path` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`parse_job_id` text,
	`parse_revision` integer DEFAULT 0 NOT NULL,
	`error_message` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`assistant_id`) REFERENCES `assistant`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reading_book_assistant_id_unique` ON `reading_book` (`assistant_id`);--> statement-breakpoint
CREATE INDEX `reading_book_status_idx` ON `reading_book` (`status`);--> statement-breakpoint
CREATE INDEX `reading_book_created_at_idx` ON `reading_book` (`created_at`);--> statement-breakpoint
CREATE TABLE `reading_chapter` (
	`id` text PRIMARY KEY NOT NULL,
	`book_id` text NOT NULL,
	`revision` integer NOT NULL,
	`title` text NOT NULL,
	`level` integer NOT NULL,
	`order_index` integer NOT NULL,
	`page_start` integer,
	`block_start` integer NOT NULL,
	`block_end` integer NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`book_id`) REFERENCES `reading_book`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reading_chapter_book_revision_order_unique` ON `reading_chapter` (`book_id`,`revision`,`order_index`);--> statement-breakpoint
CREATE INDEX `reading_chapter_book_revision_idx` ON `reading_chapter` (`book_id`,`revision`);--> statement-breakpoint
CREATE TABLE `reading_topic_context` (
	`topic_id` text PRIMARY KEY NOT NULL,
	`book_id` text NOT NULL,
	`revision` integer NOT NULL,
	`start_order_index` integer NOT NULL,
	`end_order_index` integer NOT NULL,
	`estimated_tokens` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`topic_id`) REFERENCES `topic`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`book_id`) REFERENCES `reading_book`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `reading_topic_context_book_id_idx` ON `reading_topic_context` (`book_id`);
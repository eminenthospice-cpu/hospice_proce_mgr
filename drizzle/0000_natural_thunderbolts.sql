CREATE TABLE `agencies` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`audit_head` text DEFAULT 'GENESIS' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`window` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`agency_id` text NOT NULL,
	`member_id` text NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`entity` text NOT NULL,
	`detail` text NOT NULL,
	`at` text NOT NULL,
	`previous_hash` text NOT NULL,
	`hash` text NOT NULL,
	FOREIGN KEY (`agency_id`) REFERENCES `agencies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `audit_agency_previous_hash` ON `audit_events` (`agency_id`,`previous_hash`);--> statement-breakpoint
CREATE TABLE `auth_proofs` (
	`session_hash` text PRIMARY KEY NOT NULL,
	`proof` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`agency_id` text NOT NULL,
	`email` text NOT NULL,
	`user_id` text,
	`name` text NOT NULL,
	`roles` text NOT NULL,
	`patient_ids` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`mfa_secret` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`agency_id`) REFERENCES `agencies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `member_agency_email` ON `members` (`agency_id`,`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `member_user` ON `members` (`user_id`);--> statement-breakpoint
CREATE TABLE `mfa_uses` (
	`member_id` text NOT NULL,
	`counter` integer NOT NULL,
	PRIMARY KEY(`member_id`, `counter`),
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `command_receipts` (
	`agency_id` text NOT NULL,
	`request_id` text NOT NULL,
	`member_id` text NOT NULL,
	`version` integer NOT NULL,
	`command_hash` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`agency_id`, `request_id`),
	FOREIGN KEY (`agency_id`) REFERENCES `agencies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `receipt_agency_version` ON `command_receipts` (`agency_id`,`version`);--> statement-breakpoint
CREATE TABLE `records` (
	`agency_id` text NOT NULL,
	`kind` text NOT NULL,
	`id` text NOT NULL,
	`ciphertext` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`agency_id`, `kind`, `id`),
	FOREIGN KEY (`agency_id`) REFERENCES `agencies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `recovery_codes` (
	`digest` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`used_at` integer,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`hash` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_seen` integer NOT NULL,
	`verified_at` integer,
	`expires_at` integer NOT NULL,
	`enrollment` text,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `transaction_guards` (
	`request_id` text PRIMARY KEY NOT NULL,
	`allowed` integer NOT NULL,
	CONSTRAINT "guard_must_succeed" CHECK("transaction_guards"."allowed" = 1)
);

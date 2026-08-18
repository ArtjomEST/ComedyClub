CREATE TABLE `lobbies` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`host_id` text NOT NULL,
	`visibility` text DEFAULT 'public' NOT NULL,
	`password_hash` text,
	`ranked` integer DEFAULT false NOT NULL,
	`max_players` integer DEFAULT 6 NOT NULL,
	`performance_seconds` integer DEFAULT 60 NOT NULL,
	`topic_enabled` integer DEFAULT true NOT NULL,
	`phase` text DEFAULT 'LOBBY' NOT NULL,
	`current_performer_id` text,
	`phase_ends_at` integer,
	`version` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`host_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lobbies_code_unique` ON `lobbies` (`code`);--> statement-breakpoint
CREATE TABLE `lobby_players` (
	`lobby_id` text NOT NULL,
	`user_id` text NOT NULL,
	`ready` integer DEFAULT false NOT NULL,
	`seat` integer NOT NULL,
	`connected_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	FOREIGN KEY (`lobby_id`) REFERENCES `lobbies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lobby_user_unique` ON `lobby_players` (`lobby_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `lobby_seat_idx` ON `lobby_players` (`lobby_id`,`seat`);--> statement-breakpoint
CREATE TABLE `match_results` (
	`match_id` text NOT NULL,
	`user_id` text NOT NULL,
	`place` integer NOT NULL,
	`score` real NOT NULL,
	`rating_before` integer NOT NULL,
	`rating_after` integer NOT NULL,
	`xp_awarded` integer NOT NULL,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `matches` (
	`id` text PRIMARY KEY NOT NULL,
	`lobby_id` text,
	`ranked` integer NOT NULL,
	`topic` text,
	`started_at` text NOT NULL,
	`finished_at` text,
	FOREIGN KEY (`lobby_id`) REFERENCES `lobbies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `performances` (
	`id` text PRIMARY KEY NOT NULL,
	`match_id` text NOT NULL,
	`user_id` text NOT NULL,
	`position` integer NOT NULL,
	`started_at` text,
	`ended_at` text,
	`average_score` real,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `reactions` (
	`id` text PRIMARY KEY NOT NULL,
	`match_id` text NOT NULL,
	`sender_id` text NOT NULL,
	`performer_id` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sender_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`performer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `reaction_feed_idx` ON `reactions` (`match_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text,
	`username` text NOT NULL,
	`avatar` text,
	`rating` integer DEFAULT 1000 NOT NULL,
	`xp` integer DEFAULT 0 NOT NULL,
	`level` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `votes` (
	`match_id` text NOT NULL,
	`voter_id` text NOT NULL,
	`performer_id` text NOT NULL,
	`stars` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`voter_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`performer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_vote_per_performer` ON `votes` (`match_id`,`voter_id`,`performer_id`);
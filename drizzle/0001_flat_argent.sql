CREATE TABLE `approvedContents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unitId` int NOT NULL,
	`contentType` enum('concept','example','misconception','rubric') NOT NULL,
	`title` varchar(200) NOT NULL,
	`body` text NOT NULL,
	`isApproved` boolean NOT NULL DEFAULT false,
	`version` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `approvedContents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `dailyUsage` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`usageDate` varchar(10) NOT NULL,
	`requestCount` int NOT NULL DEFAULT 0,
	`lastRequestedAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `dailyUsage_id` PRIMARY KEY(`id`),
	CONSTRAINT `daily_usage_user_date_unique` UNIQUE(`userId`,`usageDate`)
);
--> statement-breakpoint
CREATE TABLE `mathAttachments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`storageKey` varchar(500) NOT NULL,
	`storageUrl` varchar(500) NOT NULL,
	`originalName` varchar(255) NOT NULL,
	`mimeType` varchar(100) NOT NULL,
	`byteSize` int NOT NULL,
	`attachmentStatus` enum('pending','readable','unclear','rejected') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mathAttachments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mathAttempts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`conversationId` int NOT NULL,
	`gradeLevel` enum('seven','eight','nine') NOT NULL,
	`unitKey` varchar(80) NOT NULL,
	`tutorMode` enum('guided','step_by_step','check') NOT NULL,
	`questionText` text NOT NULL,
	`attachmentId` int,
	`responseMarkdown` text NOT NULL,
	`responseJson` text NOT NULL,
	`confidence` int NOT NULL,
	`needsClarification` boolean NOT NULL DEFAULT false,
	`errorTags` text NOT NULL,
	`model` varchar(100) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mathAttempts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mathConversations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(200) NOT NULL,
	`gradeLevel` enum('seven','eight','nine') NOT NULL,
	`unitKey` varchar(80) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mathConversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `practiceResults` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`sourceAttemptId` int NOT NULL,
	`question` text NOT NULL,
	`studentAnswer` text,
	`practiceStatus` enum('not_attempted','correct','incorrect','needs_review') NOT NULL DEFAULT 'not_attempted',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `practiceResults_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `teacherEscalations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`attemptId` int NOT NULL,
	`escalationReason` enum('wrong_answer','unclear_photo','teacher_help','safety_concern') NOT NULL,
	`detail` text,
	`priority` varchar(20) NOT NULL DEFAULT 'standard',
	`escalationStatus` enum('new','reviewing','resolved') NOT NULL DEFAULT 'new',
	`notificationDelivered` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `teacherEscalations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `teacherUnits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`gradeLevel` enum('seven','eight','nine') NOT NULL,
	`unitKey` varchar(80) NOT NULL,
	`name` varchar(160) NOT NULL,
	`teachingRules` text NOT NULL,
	`isApproved` boolean NOT NULL DEFAULT false,
	`version` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `teacherUnits_id` PRIMARY KEY(`id`),
	CONSTRAINT `teacher_unit_grade_key_unique` UNIQUE(`gradeLevel`,`unitKey`)
);
--> statement-breakpoint
CREATE INDEX `approved_content_unit_idx` ON `approvedContents` (`unitId`);--> statement-breakpoint
CREATE INDEX `math_attachment_user_idx` ON `mathAttachments` (`userId`);--> statement-breakpoint
CREATE INDEX `math_attempt_user_idx` ON `mathAttempts` (`userId`);--> statement-breakpoint
CREATE INDEX `math_attempt_conversation_idx` ON `mathAttempts` (`conversationId`);--> statement-breakpoint
CREATE INDEX `math_conversation_user_idx` ON `mathConversations` (`userId`);--> statement-breakpoint
CREATE INDEX `practice_result_user_idx` ON `practiceResults` (`userId`);--> statement-breakpoint
CREATE INDEX `teacher_escalation_status_idx` ON `teacherEscalations` (`escalationStatus`);
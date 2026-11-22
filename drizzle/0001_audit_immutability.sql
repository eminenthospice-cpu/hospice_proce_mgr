CREATE TRIGGER audit_events_no_update BEFORE UPDATE ON audit_events
BEGIN SELECT RAISE(ABORT, 'audit_events are append only'); END;
--> statement-breakpoint
CREATE TRIGGER audit_events_no_delete BEFORE DELETE ON audit_events
BEGIN SELECT RAISE(ABORT, 'audit_events are append only'); END;
--> statement-breakpoint
CREATE INDEX sessions_member_index ON sessions (member_id);
--> statement-breakpoint
CREATE INDEX records_agency_kind_index ON records (agency_id, kind);
--> statement-breakpoint
CREATE INDEX audit_agency_at_index ON audit_events (agency_id, at);

-- Custom ENUM types
CREATE TYPE billing_cycle AS ENUM ('monthly', 'yearly');
CREATE TYPE subscription_category AS ENUM ('video', 'music', 'productivity', 'learning', 'shopping', 'lifestyle', 'utilities', 'other');
CREATE TYPE review_priority AS ENUM ('low', 'medium', 'high');

-- Tracked subscriptions table
CREATE TABLE IF NOT EXISTS tracked_subscriptions (
    id              UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID                  NOT NULL,
    name            TEXT                  NOT NULL,
    amount_yen      INTEGER               NOT NULL,
    billing_cycle   billing_cycle         NOT NULL DEFAULT 'monthly',
    category        subscription_category,
    review_priority review_priority       NOT NULL DEFAULT 'medium',
    locked          BOOLEAN               NOT NULL DEFAULT FALSE,
    billing_day     SMALLINT,
    note            TEXT                  NOT NULL DEFAULT '',
    position        INTEGER               NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
    CONSTRAINT tracked_subscriptions_name_length CHECK (char_length(name) BETWEEN 1 AND 120),
    CONSTRAINT tracked_subscriptions_amount_range CHECK (amount_yen BETWEEN 1 AND 1000000),
    CONSTRAINT tracked_subscriptions_note_length CHECK (char_length(note) <= 500),
    CONSTRAINT tracked_subscriptions_billing_day_range CHECK (billing_day IS NULL OR billing_day BETWEEN 1 AND 31),
    CONSTRAINT tracked_subscriptions_user_id_fk FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

ALTER TABLE tracked_subscriptions ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tracked_subscriptions_user_id ON tracked_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_tracked_subscriptions_user_priority ON tracked_subscriptions(user_id, review_priority);
CREATE INDEX IF NOT EXISTS idx_tracked_subscriptions_user_locked ON tracked_subscriptions(user_id, locked);
CREATE INDEX IF NOT EXISTS idx_tracked_subscriptions_user_cycle ON tracked_subscriptions(user_id, billing_cycle);

-- RLS policies for tracked_subscriptions
CREATE POLICY "subscriptions_select_own"
    ON tracked_subscriptions FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "subscriptions_insert_own"
    ON tracked_subscriptions FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "subscriptions_update_own"
    ON tracked_subscriptions FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "subscriptions_delete_own"
    ON tracked_subscriptions FOR DELETE
    USING (user_id = auth.uid());

-- Auto-update updated_at trigger
CREATE TRIGGER trg_tracked_subscriptions_updated_at
    BEFORE UPDATE ON tracked_subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Reorder RPC function
CREATE OR REPLACE FUNCTION reorder_subscriptions(items jsonb)
RETURNS void AS $$
DECLARE
    item jsonb;
    current_user_id uuid;
BEGIN
    current_user_id := auth.uid();
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    FOR item IN SELECT * FROM jsonb_array_elements(items)
    LOOP
        UPDATE tracked_subscriptions
        SET position = (item ->> 'position')::integer
        WHERE id = (item ->> 'id')::uuid
          AND user_id = current_user_id;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

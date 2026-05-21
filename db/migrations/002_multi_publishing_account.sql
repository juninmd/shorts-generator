ALTER TABLE publishing_accounts DROP CONSTRAINT IF EXISTS publishing_accounts_channel_id_key;
ALTER TABLE publishing_accounts ADD CONSTRAINT publishing_accounts_channel_id_provider_key UNIQUE (channel_id, provider);

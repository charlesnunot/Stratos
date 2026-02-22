-- Create cron_logs table for tracking cron job executions
-- Used by monitoring dashboard and cron jobs for logging execution status

CREATE TABLE IF NOT EXISTS cron_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'running')),
  execution_time_ms INT,
  executed_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient querying by job name and execution time
CREATE INDEX IF NOT EXISTS idx_cron_logs_job_name ON cron_logs(job_name);
CREATE INDEX IF NOT EXISTS idx_cron_logs_executed_at ON cron_logs(executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_cron_logs_status ON cron_logs(status);

-- RLS Policies (allow service role to insert, admins to read)
ALTER TABLE cron_logs ENABLE ROW LEVEL SECURITY;

-- Allow service role to insert (for cron jobs)
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cron_logs' AND policyname = 'Service role can insert cron logs') THEN
    CREATE POLICY "Service role can insert cron logs" ON cron_logs
      FOR INSERT
      WITH CHECK (true);
  END IF;
END $$;

-- Allow admins to read cron logs
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cron_logs' AND policyname = 'Admins can read cron logs') THEN
    CREATE POLICY "Admins can read cron logs" ON cron_logs
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM profiles 
          WHERE id = auth.uid() 
          AND role IN ('admin', 'support')
        )
      );
  END IF;
END $$;

COMMENT ON TABLE cron_logs IS 'Tracks execution status and performance of cron jobs for monitoring and debugging';

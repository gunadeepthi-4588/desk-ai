-- Create tickets table to store employee support tickets
CREATE TABLE IF NOT EXISTS public.tickets (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    employee_id TEXT NOT NULL,
    department TEXT NOT NULL,
    category TEXT NOT NULL,
    priority TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Open',
    subject TEXT NOT NULL,
    description TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    
    -- CHECK constraints to enforce allowed enums
    CONSTRAINT tickets_department_check CHECK (department IN ('IT Support', 'Cybersecurity', 'HR', 'Finance', 'Facilities/Admin')),
    CONSTRAINT tickets_priority_check CHECK (priority IN ('Low', 'Medium', 'High', 'Critical')),
    CONSTRAINT tickets_status_check CHECK (status IN ('Open', 'Assigned', 'In Progress', 'Waiting for Employee', 'Resolved', 'Closed'))
);

-- Index on employee_id and status for fast queries and filtering
CREATE INDEX IF NOT EXISTS tickets_employee_id_idx ON public.tickets(employee_id);
CREATE INDEX IF NOT EXISTS tickets_status_idx ON public.tickets(status);

-- Trigger to automatically update updated_at timestamp on row modification
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE OR REPLACE TRIGGER update_tickets_updated_at
    BEFORE UPDATE ON public.tickets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create users table to store employee and admin accounts
CREATE TABLE IF NOT EXISTS public.users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    department TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    
    -- CHECK constraint to enforce allowed roles
    CONSTRAINT users_role_check CHECK (role IN ('employee', 'hr', 'manager', 'admin'))
);

-- Index on email for fast lookups during login
CREATE INDEX IF NOT EXISTS users_email_idx ON public.users(email);

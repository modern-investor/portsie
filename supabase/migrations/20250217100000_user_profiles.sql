-- User profiles with role-based access control
CREATE TABLE user_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can read all profiles (for user management)
CREATE POLICY "Admins can view all profiles"
  ON user_profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles AS up
      WHERE up.user_id = auth.uid()
      AND up.role = 'admin'
    )
  );

-- Admins can update any profile's role
CREATE POLICY "Admins can update profiles"
  ON user_profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles AS up
      WHERE up.user_id = auth.uid()
      AND up.role = 'admin'
    )
  );

-- Auto-create profile when a new user signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.user_profiles (user_id, role)
  VALUES (NEW.id, 'user');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Backfill profiles for existing users
INSERT INTO user_profiles (user_id, role)
SELECT id, 'user' FROM auth.users
WHERE id NOT IN (SELECT user_id FROM user_profiles)
ON CONFLICT (user_id) DO NOTHING;

-- Seed admin roles
UPDATE user_profiles SET role = 'admin', updated_at = now()
WHERE user_id IN (
  SELECT id FROM auth.users
  WHERE email IN ('rahulioson@gmail.com', 'hrsonnad@gmail.com')
);

-- Handle case where profiles weren't created yet for admin users
INSERT INTO user_profiles (user_id, role)
SELECT id, 'admin' FROM auth.users
WHERE email IN ('rahulioson@gmail.com', 'hrsonnad@gmail.com')
ON CONFLICT (user_id) DO UPDATE SET role = 'admin', updated_at = now();

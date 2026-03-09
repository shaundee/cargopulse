-- Add origin country to organizations
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS origin_country text;

-- Logos storage bucket (public read)
INSERT INTO storage.buckets (id, name, public)
VALUES ('logos', 'logos', true)
ON CONFLICT (id) DO NOTHING;

-- RLS: org admin/staff can upload to their own org path
CREATE POLICY "org members can upload logos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'logos'
  AND (storage.foldername(name))[1] = 'org'
  AND EXISTS (
    SELECT 1 FROM org_members
    WHERE org_members.user_id = auth.uid()
      AND org_members.org_id::text = (storage.foldername(name))[2]
      AND org_members.role IN ('admin', 'staff')
  )
);

-- RLS: org members can update (replace) their logos
CREATE POLICY "org members can update logos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'logos'
  AND EXISTS (
    SELECT 1 FROM org_members
    WHERE org_members.user_id = auth.uid()
      AND org_members.org_id::text = (storage.foldername(name))[2]
      AND org_members.role IN ('admin', 'staff')
  )
);

-- Add image_urls field to comments table
-- This allows comments to include images, similar to posts

ALTER TABLE public.comments
ADD COLUMN IF NOT EXISTS image_urls TEXT[] DEFAULT '{}';
